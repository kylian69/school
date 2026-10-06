/**
 * Jeton d'émargement (RG-00-16, RG-06-05) : identifiant de séance, fenêtre de temps et signature
 * HMAC-SHA-256. Calculé sur l'écran de l'intervenant, sans appel au serveur, et vérifié par le
 * serveur sans lire la base. Partagé entre l'interface et l'API (WebCrypto : navigateur et Node).
 */

/** Durée d'une fenêtre : le QR change toutes les 10 à 15 secondes (RG-00-16). */
export const JETON_PERIODE_SECONDES = 15;
/** Fenêtre de grâce d'un scan conservé hors ligne puis renvoyé (RG-00-19 : 5 minutes par défaut). */
export const JETON_GRACE_SECONDES = 300;
/** Taille de la clé secrète d'une séance, en octets. */
export const CLE_SEANCE_OCTETS = 32;

const SIGNATURE_OCTETS = 16;
const encodeur = new TextEncoder();

export interface JetonLu {
  seanceId: string;
  fenetre: number;
  signature: string;
}

export type VerificationJeton =
  { ok: true; fenetre: number; rejoue: boolean } | { ok: false; refus: 'signature' | 'perime' };

/** Numéro de la fenêtre de temps qui contient l'instant donné. */
export const fenetreDe = (instantMs: number, periodeSecondes = JETON_PERIODE_SECONDES) =>
  Math.floor(instantMs / 1000 / periodeSecondes);

const base64url = (octets: Uint8Array) => {
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

async function hmac(cle: Uint8Array, message: string): Promise<Uint8Array> {
  const cleCrypto = await crypto.subtle.importKey(
    'raw',
    cle as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cleCrypto, encodeur.encode(message)));
}

/** Comparaison en temps constant (pas d'indice de signature par le temps de réponse). */
function egales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

const signature = async (cle: Uint8Array, seanceId: string, fenetre: number) =>
  base64url((await hmac(cle, `jeton|${seanceId}|${fenetre}`)).subarray(0, SIGNATURE_OCTETS));

/** Code à 6 chiffres qui change avec le QR (RG-06-05), par troncature dynamique (RFC 4226). */
export async function codeDeFenetre(
  cle: Uint8Array,
  seanceId: string,
  fenetre: number,
): Promise<string> {
  const mac = await hmac(cle, `code|${seanceId}|${fenetre}`);
  const decalage = (mac[mac.length - 1] ?? 0) & 0x0f;
  const valeur =
    (((mac[decalage] ?? 0) & 0x7f) << 24) |
    ((mac[decalage + 1] ?? 0) << 16) |
    ((mac[decalage + 2] ?? 0) << 8) |
    (mac[decalage + 3] ?? 0);
  return String(valeur % 1_000_000).padStart(6, '0');
}

/** Jeton et code à afficher à l'instant donné, avec l'instant où ils changent. */
export async function genererJeton(
  cle: Uint8Array,
  seanceId: string,
  instantMs: number,
  periodeSecondes = JETON_PERIODE_SECONDES,
): Promise<{ jeton: string; code: string; changeA: number }> {
  const fenetre = fenetreDe(instantMs, periodeSecondes);
  return {
    jeton: `${seanceId}.${fenetre}.${await signature(cle, seanceId, fenetre)}`,
    code: await codeDeFenetre(cle, seanceId, fenetre),
    changeA: (fenetre + 1) * periodeSecondes * 1000,
  };
}

const FORMAT_JETON =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{1,12})\.([\w-]{22})$/;

/** Découpe un jeton sans le vérifier (la clé dépend de la séance qu'il désigne). */
export function lireJeton(jeton: string): JetonLu | null {
  const trouve = FORMAT_JETON.exec(jeton);
  if (!trouve) return null;
  const [, seanceId = '', fenetre = '', sig = ''] = trouve;
  return { seanceId, fenetre: Number(fenetre), signature: sig };
}

/**
 * Accepte la fenêtre en cours, la précédente (latence) et la suivante (horloges décalées). Un scan
 * conservé hors ligne (RG-00-19) est accepté dans la fenêtre de grâce et marqué « rejoué ».
 */
export async function verifierJeton(
  cle: Uint8Array,
  jeton: JetonLu,
  maintenantMs: number,
  options: { periodeSecondes?: number; graceSecondes?: number; horsLigne?: boolean } = {},
): Promise<VerificationJeton> {
  const periode = options.periodeSecondes ?? JETON_PERIODE_SECONDES;
  if (!egales(jeton.signature, await signature(cle, jeton.seanceId, jeton.fenetre))) {
    return { ok: false, refus: 'signature' };
  }
  const ecart = fenetreDe(maintenantMs, periode) - jeton.fenetre;
  if (ecart >= -1 && ecart <= 1) return { ok: true, fenetre: jeton.fenetre, rejoue: false };
  const graceFenetres = Math.ceil((options.graceSecondes ?? JETON_GRACE_SECONDES) / periode);
  if (options.horsLigne && ecart > 1 && ecart <= graceFenetres + 1) {
    return { ok: true, fenetre: jeton.fenetre, rejoue: true };
  }
  return { ok: false, refus: 'perime' };
}

/** Code saisi à la main : mêmes fenêtres acceptées que pour le QR. */
export async function verifierCode(
  cle: Uint8Array,
  seanceId: string,
  code: string,
  maintenantMs: number,
  periodeSecondes = JETON_PERIODE_SECONDES,
): Promise<boolean> {
  const courante = fenetreDe(maintenantMs, periodeSecondes);
  let valide = false;
  for (const fenetre of [courante - 1, courante, courante + 1]) {
    if (egales(code, await codeDeFenetre(cle, seanceId, fenetre))) valide = true;
  }
  return valide;
}

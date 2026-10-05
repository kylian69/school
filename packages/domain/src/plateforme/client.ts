/**
 * Cycle de vie d'un client de la plateforme (RG-19-02) :
 * actif → suspendu → actif (réactivation) ; actif ou suspendu → résilié → supprimé.
 * Chaque changement d'état exige un motif.
 */
export const ETATS_CLIENT = ['actif', 'suspendu', 'resilie', 'supprime'] as const;
export type EtatClient = (typeof ETATS_CLIENT)[number];

const TRANSITIONS: Record<EtatClient, readonly EtatClient[]> = {
  actif: ['suspendu', 'resilie'],
  suspendu: ['actif', 'resilie'],
  resilie: ['supprime'],
  supprime: [],
};

export type RefusTransition = 'motif-absent' | 'transition-interdite' | 'meme-etat';

export function verifierTransition(
  depuis: EtatClient,
  vers: EtatClient,
  motif: string,
): { ok: true } | { ok: false; refus: RefusTransition } {
  if (depuis === vers) return { ok: false, refus: 'meme-etat' };
  if (!TRANSITIONS[depuis].includes(vers)) return { ok: false, refus: 'transition-interdite' };
  if (motif.trim().length === 0) return { ok: false, refus: 'motif-absent' };
  return { ok: true };
}

/** Une école d'un client suspendu passe en lecture seule (RG-19-02) ; résilié : accès fermé. */
export function accesSelonEtat(etat: EtatClient): 'complet' | 'lecture-seule' | 'ferme' {
  if (etat === 'actif') return 'complet';
  if (etat === 'suspendu') return 'lecture-seule';
  return 'ferme';
}

/** Modules actifs : ceux de la formule, plus les ouvertures et moins les fermetures par exception. */
export function modulesActifs(
  modulesDeLaFormule: readonly string[],
  exceptions: readonly { module: string; actif: boolean }[],
): string[] {
  const actifs = new Set(modulesDeLaFormule);
  for (const exception of exceptions) {
    if (exception.actif) actifs.add(exception.module);
    else actifs.delete(exception.module);
  }
  return [...actifs].sort();
}

/** Sous-domaines réservés à la plateforme, refusés pour un client. */
const SOUS_DOMAINES_RESERVES = new Set([
  'www',
  'api',
  'app',
  'admin',
  'plateforme',
  'console',
  'status',
  'statut',
  'demo',
  'mail',
  'smtp',
  'support',
  'aide',
  'docs',
  'static',
  'assets',
  'cdn',
  'auth',
  'login',
  'connexion',
]);

export type RefusSousDomaine = 'format' | 'reserve';

/** Sous-domaine d'un client (RG-19-01) : 3 à 40 caractères, minuscules, chiffres et tirets. */
export function verifierSousDomaine(
  valeur: string,
): { ok: true } | { ok: false; refus: RefusSousDomaine } {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(valeur) || valeur.includes('--')) {
    return { ok: false, refus: 'format' };
  }
  if (SOUS_DOMAINES_RESERVES.has(valeur)) return { ok: false, refus: 'reserve' };
  return { ok: true };
}

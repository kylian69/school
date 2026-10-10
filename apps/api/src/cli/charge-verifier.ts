import { existsSync, readFileSync } from 'node:fs';
import { AppelEnDirect, CLES_EMARGEMENT } from '@scolaly/contracts';
import { createDatabase, presence } from '@scolaly/db';
import { count, countDistinct, eq } from 'drizzle-orm';
import { createValkey } from '../shared/valkey.js';

/**
 * Vérification après la preuve de charge (I2.2, I4.3) : une fois le flux vidé par le worker, chaque
 * apprenant a exactement une présence en base (0 perte, 0 doublon), le cache compte autant de
 * présences et la liste en direct de l'intervenant (flux SSE) autant de présents. Code de sortie non nul en cas d'écart.
 */
const migratorUrl = process.env.MIGRATOR_DATABASE_URL;
const valkeyUrl = process.env.VALKEY_URL;
if (!migratorUrl || !valkeyUrl)
  throw new Error('MIGRATOR_DATABASE_URL et VALKEY_URL sont obligatoires.');
const fichier = process.env.CHARGE_FICHIER ?? '../../infra/charge/.donnees/donnees.json';
const { seanceId, cookies, intervenant } = JSON.parse(readFileSync(fichier, 'utf8')) as {
  seanceId: string;
  cookies: string[];
  intervenant?: string;
};
const apiUrl = process.env.CHARGE_API_URL ?? 'http://localhost:3001';

/** US-06-03 : présents affichés par la liste en direct de l'intervenant (premier événement SSE). */
async function presentsEnDirect(cookie: string): Promise<number> {
  const controleur = new AbortController();
  const minuterie = setTimeout(() => {
    controleur.abort();
  }, 10_000);
  try {
    const reponse = await fetch(`${apiUrl}/api/seances/${seanceId}/appel/direct`, {
      headers: { cookie },
      signal: controleur.signal,
    });
    if (!reponse.ok || !reponse.body)
      throw new Error(`Liste en direct refusée : ${String(reponse.status)}`);
    let tampon = '';
    for await (const morceau of reponse.body.pipeThrough(new TextDecoderStream())) {
      tampon += morceau;
      // Premier événement complet : « data: {…} » suivi d'une ligne vide.
      const evenement = /^data: (.*)\n\n/m.exec(tampon)?.[1];
      if (evenement) return AppelEnDirect.parse(JSON.parse(evenement)).presents;
    }
    throw new Error('Liste en direct refermée sans événement.');
  } finally {
    clearTimeout(minuterie);
    controleur.abort();
  }
}
/** Apprenants réellement scannés, d'après le résumé exporté par k6 (sinon : tous). */
const resume = process.env.CHARGE_RESUME ?? '../../infra/charge/.donnees/resume.json';
type Resume = { metrics?: Record<string, { count?: number } | undefined> };
const metriques = existsSync(resume)
  ? (JSON.parse(readFileSync(resume, 'utf8')) as Resume).metrics
  : undefined;
const scannes = metriques?.apprenants_scannes?.count;
/** Présences créées selon les réponses : une de plus que les lignes en base serait un double. */
const creees = metriques?.presences_creees?.count;
/** Tir en mode dégradé (Valkey arrêté pendant le tir) : les présences sont en base, pas en cache. */
const degrade = process.env.CHARGE_MODE_DEGRADE === '1';
const attendu = scannes ?? Number(process.env.CHARGE_APPRENANTS ?? String(cookies.length));

const owner = createDatabase(migratorUrl, { max: 2 });
const valkey = createValkey(valkeyUrl);
try {
  await valkey.connect();
  const debut = Date.now();
  // Le worker écrit toutes les secondes : on attend que le flux soit vide et acquitté.
  for (;;) {
    const enFlux = await valkey.xlen(CLES_EMARGEMENT.flux);
    if (enFlux === 0) break;
    if (Date.now() - debut > 120_000)
      throw new Error(`Flux non vidé après 2 minutes (${String(enFlux)}).`);
    await new Promise((r) => setTimeout(r, 500));
  }
  const ecoulement = Date.now() - debut;
  const [base] = await owner.db
    .select({ lignes: count(), apprenants: countDistinct(presence.personneId) })
    .from(presence)
    .where(eq(presence.seanceId, seanceId));
  const enCache = await valkey.hlen(CLES_EMARGEMENT.presences(seanceId));
  const enDirect = intervenant ? await presentsEnDirect(intervenant) : null;
  const bilan = {
    seanceId,
    apprenantsScannesSelonK6: attendu,
    presencesEnCache: enCache,
    presencesEnBase: base?.lignes ?? 0,
    apprenantsDistincts: base?.apprenants ?? 0,
    presencesCreeesSelonK6: creees ?? null,
    pertes: attendu - (base?.apprenants ?? 0),
    doublons: (base?.lignes ?? 0) - (base?.apprenants ?? 0),
    fluxVideEnMs: ecoulement,
    presentsDansLaListeEnDirect: enDirect,
  };
  console.warn(JSON.stringify(bilan, null, 2));
  const doubleAcceptation = creees !== undefined && creees !== bilan.presencesEnBase;
  const cacheFaux = !degrade && enCache !== attendu;
  // US-06-03 : la liste en direct de l'intervenant compte tous les scans acceptés.
  const directFaux = enDirect !== null && enDirect !== attendu;
  if (bilan.pertes !== 0 || bilan.doublons !== 0 || cacheFaux || doubleAcceptation || directFaux) {
    console.error('Échec : présences perdues, en double ou absentes de la liste en direct.');
    process.exitCode = 1;
  } else {
    console.warn('0 perte, 0 doublon, liste en direct complète.');
  }
} finally {
  valkey.disconnect();
  await owner.close();
}

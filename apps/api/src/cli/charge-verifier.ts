import { existsSync, readFileSync } from 'node:fs';
import { CLES_EMARGEMENT } from '@scolaly/contracts';
import { createDatabase, presence } from '@scolaly/db';
import { count, countDistinct, eq } from 'drizzle-orm';
import { createValkey } from '../shared/valkey.js';

/**
 * Vérification après la preuve de charge (I2.2) : une fois le flux vidé par le worker, chaque
 * apprenant a exactement une présence en base (0 perte, 0 doublon), et le cache compte autant de
 * présences. Code de sortie non nul en cas d'écart.
 */
const migratorUrl = process.env.MIGRATOR_DATABASE_URL;
const valkeyUrl = process.env.VALKEY_URL;
if (!migratorUrl || !valkeyUrl)
  throw new Error('MIGRATOR_DATABASE_URL et VALKEY_URL sont obligatoires.');
const fichier = process.env.CHARGE_FICHIER ?? '../../infra/charge/.donnees/donnees.json';
const { seanceId, cookies } = JSON.parse(readFileSync(fichier, 'utf8')) as {
  seanceId: string;
  cookies: string[];
};
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
  };
  console.warn(JSON.stringify(bilan, null, 2));
  const doubleAcceptation = creees !== undefined && creees !== bilan.presencesEnBase;
  const cacheFaux = !degrade && enCache !== attendu;
  if (bilan.pertes !== 0 || bilan.doublons !== 0 || cacheFaux || doubleAcceptation) {
    console.error('Échec : présences perdues ou en double.');
    process.exitCode = 1;
  } else {
    console.warn('0 perte, 0 doublon.');
  }
} finally {
  valkey.disconnect();
  await owner.close();
}

// Preuve de charge de l'émargement (I2.2 ; module 00, section 6 ; RG-00-22).
// Rejoue le pic d'une rentrée : N apprenants scannent en 60 secondes, les trois quarts dans les
// 20 premières, et 5 % des scans sont des répétitions (second scan du même apprenant).
// Données : fichier écrit par `pnpm charge:preparer` (séance, clé, cookies de session).
import { check } from 'k6';
import crypto from 'k6/crypto';
import { b64decode, b64encode } from 'k6/encoding';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Plusieurs instances (répartiteur de charge simulé) : API_URLS=http://h:3001,http://h:3002…
const APIS = (__ENV.API_URLS || __ENV.API_URL || 'http://host.docker.internal:3001').split(',');
const FICHIER = __ENV.FICHIER || '/donnees/donnees.json';
/** Seuil de latence (ms) ; 0 pour le scénario réduit de la CI, qui ne mesure pas la latence. */
const SEUIL_P99 = Number(__ENV.SEUIL_P99 ?? '200');
const PERIODE = 15;

const donnees = JSON.parse(open(FICHIER));
const cookies = new SharedArray('cookies', () => donnees.cookies);
const N = Number(__ENV.APPRENANTS || cookies.length);
/** Par bloc de 21 scans : 20 premiers scans, puis la répétition du premier du bloc (5 %). */
const TOTAL = Math.ceil(N / 20) * 21;
const PIC = Math.ceil((0.75 * TOTAL) / 17.5);
// 2 % de marge : le profil émet toujours assez d'itérations ; les surnuméraires ne font rien.
const FOND = Math.max(1, Math.ceil((1.02 * TOTAL - 20 * PIC) / 37.5));

/** Apprenants distincts dont le scan a été accepté : comparé ensuite à la base (0 perte). */
const apprenantsScannes = new Counter('apprenants_scannes');
const repetitions = new Counter('scans_repetes');
/** Réponses « présent » ou « retard » : chacune crée une présence ; doit égaler les lignes en base. */
const presencesCreees = new Counter('presences_creees');

export const options = {
  scenarios: {
    pic: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 1000,
      maxVUs: 2000,
      stages: [
        { target: PIC, duration: '5s' },
        { target: PIC, duration: '15s' },
        { target: FOND, duration: '5s' },
        { target: FOND, duration: '35s' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
    ...(SEUIL_P99 > 0 ? { http_req_duration: [`p(99)<${SEUIL_P99}`] } : {}),
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const cle = b64decode(donnees.cle);

/** Jeton du QR à l'instant présent, calculé comme sur l'écran de l'intervenant (RG-00-16). */
function jeton() {
  const fenetre = Math.floor(Date.now() / 1000 / PERIODE);
  const mac = new Uint8Array(
    crypto.hmac('sha256', cle, `jeton|${donnees.seanceId}|${fenetre}`, 'binary'),
  );
  return `${donnees.seanceId}.${fenetre}.${b64encode(mac.slice(0, 16).buffer, 'rawurl')}`;
}

export default function () {
  const k = exec.scenario.iterationInTest;
  if (k >= TOTAL) return;
  const bloc = Math.floor(k / 21);
  const position = k % 21;
  const repete = position === 20;
  const apprenant = repete ? bloc * 20 : bloc * 20 + position;
  if (apprenant >= N) return;

  const reponse = http.post(
    `${APIS[k % APIS.length]}/api/emargement/scan`,
    JSON.stringify({ jeton: jeton() }),
    {
      headers: { 'content-type': 'application/json', cookie: cookies[apprenant] },
      tags: { type: repete ? 'repetition' : 'premier' },
    },
  );
  const statut = reponse.status === 200 ? reponse.json('statut') : null;
  // La répétition peut arriver avant le premier scan du même apprenant (requêtes concurrentes) :
  // l'un des deux reçoit « déjà émargé ». Les deux réponses sont correctes.
  const ok = check(reponse, {
    'scan accepté (200)': (r) => r.status === 200,
    'statut attendu': () => ['present', 'retard', 'deja-emarge'].includes(statut),
  });
  if (!ok && exec.vu.iterationInScenario < 3) {
    console.warn(`Réponse inattendue : ${reponse.status} ${reponse.body}`);
  }
  if (ok) (repete ? repetitions : apprenantsScannes).add(1);
  if (statut === 'present' || statut === 'retard') presencesCreees.add(1);
}

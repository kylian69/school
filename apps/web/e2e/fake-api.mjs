// Fausse API pour les tests de bout en bout de l'interface : routes de Better Auth et de la console
// de la plateforme, avec des données en mémoire. Le comportement réel de l'API est couvert par ses
// propres tests ; le parcours contre la vraie API passe par le test de fumée de l'installation.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_API_PORT ?? 3199);
const COOKIE = 'scolaly.session_token';
const MOT_DE_PASSE = 'mot de passe des tests e2e';
const USERS = {
  camille: {
    id: '01a10000-0000-7000-8000-000000000001',
    name: 'Camille Fictive',
    email: 'camille@exemple.test',
  },
  equipe: {
    id: '01a10000-0000-7000-8000-000000000002',
    name: 'Équipe Scolaly',
    email: 'equipe@plateforme.exemple.test',
    role: 'super_administrateur',
  },
};
// Écoles de chaque compte (RG-00-26) : Camille a une fiche dans les deux écoles du groupe.
const ECOLES = {
  camille: [
    {
      id: '01a10000-0000-7000-8000-0000000000e1',
      nom: 'École de gestion de Lumerac',
      nomAffichage: 'EGL',
      acces: 'complet',
    },
    {
      id: '01a10000-0000-7000-8000-0000000000e2',
      nom: 'Institut numérique de Lumerac',
      nomAffichage: 'INL',
      acces: 'complet',
    },
  ],
};
const ecoleActive = new Map();
const ESSENTIEL = [
  'cahier-de-texte',
  'emargement',
  'emplois-du-temps',
  'notes',
  'portails',
  'referentiel',
  'socle',
  'alternance',
];
const clients = new Map();

function creerFiche(entree) {
  const id = randomUUID();
  const fiche = {
    id,
    raisonSociale: entree.raisonSociale,
    siren: entree.siren ?? null,
    sousDomaine: entree.sousDomaine,
    etat: 'actif',
    type: entree.type,
    administrateur: entree.administrateur,
    contactFacturation: null,
    contrat: {
      formule: entree.formule,
      volumeApprenants: entree.volumeApprenants,
      dateDebut: entree.dateDebut,
      dateFin: entree.dateFin,
      referenceDevis: entree.referenceDevis ?? null,
    },
    ecoles: entree.ecoles.map((e) => ({ id: randomUUID(), ...e, acces: 'complet' })),
    modules: ESSENTIEL.map((module) => ({ module, actif: true, origine: 'formule' })).sort((a, b) =>
      a.module.localeCompare(b.module),
    ),
    historique: [
      {
        etatPrecedent: null,
        etat: 'actif',
        motif: 'Création du client (devis signé)',
        survenuLe: new Date().toISOString(),
      },
    ],
  };
  clients.set(id, fiche);
  return fiche;
}

creerFiche({
  type: 'groupe',
  raisonSociale: 'Groupe Lumerac Formation SAS',
  sousDomaine: 'lumerac',
  formule: 'pro',
  volumeApprenants: 2000,
  dateDebut: '2026-09-01',
  dateFin: '2029-08-31',
  administrateur: { nom: 'Administration EGL', email: 'administrateur@egl.demo.scolaly.test' },
  ecoles: [
    { nom: 'École de gestion de Lumerac', nomAffichage: 'EGL' },
    { nom: 'Institut numérique de Lumerac', nomAffichage: 'INL' },
  ],
});

const readBody = (request) =>
  new Promise((resolve) => {
    let data = '';
    request.on('data', (chunk) => (data += chunk));
    request.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const jeton = (request.headers.cookie ?? '').match(new RegExp(`${COOKIE}=e2e-(\\w+)`))?.[1];
  const user = jeton ? USERS[jeton] : undefined;
  const json = (status, body, headers = {}) => {
    response.writeHead(status, { 'content-type': 'application/json', ...headers });
    response.end(JSON.stringify(body));
  };
  const path = url.pathname;

  if (path === '/api/auth/get-session') return json(200, user ? { user } : null);
  if (path === '/api/auth/sign-in/email' && request.method === 'POST') {
    const body = await readBody(request);
    const [cle] = Object.entries(USERS).find(([, u]) => u.email === body.email) ?? [];
    if (cle && body.password === MOT_DE_PASSE) {
      return json(
        200,
        { user: USERS[cle] },
        { 'set-cookie': `${COOKIE}=e2e-${cle}; Path=/; HttpOnly; SameSite=Lax` },
      );
    }
    return json(401, { code: 'INVALID_EMAIL_OR_PASSWORD' });
  }
  if (path === '/api/auth/sign-out' && request.method === 'POST') {
    return json(200, { success: true }, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` });
  }

  if (path.startsWith('/api/session/')) {
    if (!user) return json(401, { message: 'Session absente' });
    const ecoles = ECOLES[jeton] ?? [];
    if (path === '/api/session/ecole' && request.method === 'POST') {
      const { organisationId } = await readBody(request);
      if (!ecoles.some((e) => e.id === organisationId))
        return json(403, { message: 'Pas de fiche' });
      ecoleActive.set(jeton, organisationId);
    }
    const active = ecoles.find((e) => e.id === (ecoleActive.get(jeton) ?? ecoles[0]?.id)) ?? null;
    return json(200, {
      ecoleActive: active,
      ecoles,
      permissions: active ? ['organisation:lire'] : [],
      modules: active ? ['socle'] : [],
      doubleAuthentificationExigee: false,
    });
  }

  if (path.startsWith('/api/plateforme')) {
    if (!user) return json(401, { message: 'Session absente' });
    if (!user.role) return json(404, { message: 'Not Found' });
    if (path === '/api/plateforme/moi') return json(200, { role: user.role });
    if (path === '/api/plateforme/clients' && request.method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase();
      const etat = url.searchParams.get('etat');
      const liste = [...clients.values()]
        .filter(
          (c) =>
            (!q || c.raisonSociale.toLowerCase().includes(q) || c.sousDomaine.includes(q)) &&
            (!etat || c.etat === etat),
        )
        .map((c) => ({
          id: c.id,
          raisonSociale: c.raisonSociale,
          sousDomaine: c.sousDomaine,
          etat: c.etat,
          type: c.type,
          formule: c.contrat.formule,
          volumeApprenants: c.contrat.volumeApprenants,
          dateFin: c.contrat.dateFin,
          ecoles: c.ecoles.length,
        }))
        .sort((a, b) => a.raisonSociale.localeCompare(b.raisonSociale));
      return json(200, { clients: liste });
    }
    if (path === '/api/plateforme/clients' && request.method === 'POST') {
      const entree = await readBody(request);
      if (entree.sousDomaine === 'api')
        return json(400, {
          message: 'Ce sous-domaine est réservé à la plateforme. Choisissez-en un autre.',
        });
      return json(201, creerFiche(entree));
    }
    const match = path.match(/^\/api\/plateforme\/clients\/([0-9a-f-]{36})(\/etat|\/modules)?$/);
    const fiche = match ? clients.get(match[1]) : undefined;
    if (!fiche) return json(404, { message: 'Client introuvable.' });
    if (!match[2]) return json(200, fiche);
    const body = await readBody(request);
    if (match[2] === '/etat') {
      fiche.historique.unshift({
        etatPrecedent: fiche.etat,
        etat: body.etat,
        motif: body.motif,
        survenuLe: new Date().toISOString(),
      });
      fiche.etat = body.etat;
      const acces = { actif: 'complet', suspendu: 'lecture_seule', resilie: 'ferme' }[body.etat];
      fiche.ecoles.forEach((e) => (e.acces = acces));
      return json(200, fiche);
    }
    const existant = fiche.modules.find((m) => m.module === body.module);
    const origine = body.actif === ESSENTIEL.includes(body.module) ? 'formule' : 'exception';
    if (existant) Object.assign(existant, { actif: body.actif, origine });
    else fiche.modules.push({ module: body.module, actif: body.actif, origine });
    return json(200, fiche);
  }
  return json(404, { message: 'Route inconnue de la fausse API' });
}).listen(port, () => console.warn(`Fausse API sur le port ${port}`));

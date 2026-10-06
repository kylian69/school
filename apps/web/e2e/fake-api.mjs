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
  // Rôle qui exige la double authentification, pas encore mise en place (RG-00-13).
  sacha: {
    id: '01a10000-0000-7000-8000-000000000003',
    name: 'Sacha Fictif',
    email: 'sacha@exemple.test',
    doubleAuthentificationExigee: true,
  },
  // Double authentification active : un code est demandé à la connexion.
  lina: {
    id: '01a10000-0000-7000-8000-000000000004',
    name: 'Lina Fictive',
    email: 'lina@exemple.test',
    twoFactorEnabled: true,
  },
  equipe: {
    id: '01a10000-0000-7000-8000-000000000002',
    name: 'Équipe Scolaly',
    email: 'equipe@plateforme.exemple.test',
    role: 'super_administrateur',
  },
};
// Codes acceptés par la fausse API (le vrai calcul TOTP est couvert par les tests de l'API).
const CODE_TOTP = '123456';
const CODE_SECOURS = 'secours-0001';
const ETAPE_2FA = 'scolaly.two_factor';
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

// Rôles de l'école (E-01-07) : deux rôles par défaut et un rôle personnalisé.
const roles = [
  {
    id: '01a10000-0000-7000-8000-0000000000a1',
    code: 'administrateur',
    libelle: 'Administrateur d’organisation',
    description: 'Paramétrage, utilisateurs, rôles',
    perimetreParDefaut: 'organisation',
    doubleAuthentificationRequise: true,
    permissions: ['organisation:lire', 'roles:gerer', 'roles:attribuer'],
    personnes: 2,
    parDefaut: true,
    verrouille: true,
  },
  {
    id: '01a10000-0000-7000-8000-0000000000a2',
    code: 'scolarite',
    libelle: 'Scolarité',
    description: 'Gestion courante',
    perimetreParDefaut: 'etablissement',
    doubleAuthentificationRequise: true,
    permissions: ['organisation:lire', 'personnes:lire'],
    personnes: 6,
    parDefaut: true,
    verrouille: false,
  },
];

// Organisation et établissements (E-01-02).
const ecole = {
  id: '01a10000-0000-7000-8000-0000000000e1',
  nom: 'École de gestion de Lumerac',
  nomAffichage: 'EGL',
  siren: null,
  modeleMatricule: '{NUM:6}',
  exempleMatricule: '000001',
  etablissements: [
    {
      id: '01a10000-0000-7000-8000-0000000000b1',
      nom: 'Campus des Tilleuls',
      adresseLigne1: '12 allée des Tilleuls',
      adresseLigne2: null,
      codePostal: '69000',
      ville: 'Lumerac',
      uai: null,
      siret: null,
      nda: null,
      fuseauHoraire: 'Europe/Paris',
      telephone: null,
      email: null,
      statut: 'actif',
    },
  ],
};
const manquantes = (e) =>
  [
    !e.adresseLigne1 || !e.codePostal || !e.ville ? 'adresse' : null,
    e.uai ? null : 'uai',
    e.siret ? null : 'siret',
    e.nda ? null : 'nda',
  ].filter(Boolean);
const detailEcole = () => ({
  ...ecole,
  etablissements: ecole.etablissements.map((e) => ({ ...e, manquantes: manquantes(e) })),
});
// Contrôle simplifié de l'UAI (le vrai contrôle est couvert par les tests du domaine et de l'API).
const uaiInvalide = (uai) => uai && !/^\d{7}[A-Z]$/.test(uai.replace(/\s+/g, '').toUpperCase());
const nul = (v) => (v === '' ? null : v);

// Apparence (E-01-09) : partagée par les tests ; seul le test de l'apparence la modifie.
const apparence = { nomAffichage: 'EGL', couleur: null, logo: null };
const canal = (c) => {
  const s = parseInt(c, 16) / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const contrasteSurBlanc = (hex) => {
  const l =
    0.2126 * canal(hex.slice(1, 3)) +
    0.7152 * canal(hex.slice(3, 5)) +
    0.0722 * canal(hex.slice(5, 7));
  return 1.05 / (l + 0.05);
};
const detailApparence = () => ({
  nomAffichage: apparence.nomAffichage,
  couleur: apparence.couleur,
  // Palette simplifiée : le calcul réel est couvert par les tests du domaine.
  palette: apparence.couleur
    ? {
        clair: { accent: apparence.couleur, accentSoft: '#EEF4F4' },
        sombre: { accent: '#5FD3C9', accentSoft: '#0F2928' },
      }
    : null,
  logoUrl: apparence.logo ? `/api/ecoles/${ecole.id}/logo?v=${apparence.logo.version}` : null,
});

// Personnes (E-01-04, E-01-05) : chaque test crée les fiches qu'il modifie.
const personnes = [
  {
    id: '01a10000-0000-7000-8000-0000000000c1',
    civilite: null,
    nom: 'Fictive',
    nomUsage: null,
    prenom: 'Camille',
    email: 'camille@exemple.test',
    telephone: null,
    adresseLigne1: null,
    codePostal: null,
    ville: null,
    dateNaissance: null,
    lieuNaissance: null,
    compteEtat: 'actif',
    roles: ['Administrateur d’organisation'],
    version: '2026-10-01T00:00:00.000Z',
  },
];
const detailPersonne = (p) => ({ ...p, naissanceVisible: true });

const annees = [];
const choixDemarrage = new Map();
const imports = new Map();
const apercuImport = (i) => {
  const champs = Object.values(i.correspondance);
  const lignes = i.lignes.map((valeurs, rang) => {
    const donnees = {};
    i.colonnes.forEach((c, k) => {
      if (i.correspondance[c] && valeurs[k]) donnees[i.correspondance[c]] = valeurs[k];
    });
    const erreurs =
      donnees.email && !donnees.email.includes('@')
        ? [{ champ: 'email', message: 'Adresse email invalide.' }]
        : [];
    return { numero: rang + 2, donnees, erreurs, avertissements: [] };
  });
  const enErreur = lignes.filter((l) => l.erreurs.length > 0).length;
  return {
    id: i.id,
    type: i.type,
    statut: 'en_preparation',
    fichierNom: i.fichierNom,
    colonnes: i.colonnes,
    correspondance: i.correspondance,
    champsManquants: ['nom', 'prenom', 'email'].filter((c) => !champs.includes(c)),
    totaux: {
      lignes: lignes.length,
      valides: lignes.length - enErreur,
      enErreur,
      avecAvertissement: 0,
      existantes: 0,
    },
    lignes,
    expireLe: '2030-01-01T00:00:00.000Z',
  };
};
const resumeAnnee = ({ fermetures: _fermetures, ...annee }) => annee;
// Jours fériés simplifiés : le calcul réel est couvert par les tests du domaine et de l'API.
const detailAnnee = (annee) => ({
  ...annee,
  feries: [
    { code: 'toussaint', libelle: 'Toussaint', date: `${annee.dateDebut.slice(0, 4)}-11-01` },
  ],
});

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
    // « sacha-<suffixe> » : nouveau compte dont le rôle exige la double authentification.
    const sacha = /^sacha-(\w+)@exemple\.test$/.exec(body.email ?? '');
    if (sacha && !USERS[`sacha${sacha[1]}`]) {
      USERS[`sacha${sacha[1]}`] = { ...USERS.sacha, id: randomUUID(), email: body.email };
    }
    const [cle] = Object.entries(USERS).find(([, u]) => u.email === body.email) ?? [];
    if (cle && body.password === (USERS[cle].motDePasse ?? MOT_DE_PASSE)) {
      if (USERS[cle].twoFactorEnabled) {
        return json(
          200,
          { twoFactorRedirect: true, twoFactorMethods: ['totp'] },
          { 'set-cookie': `${ETAPE_2FA}=${cle}; Path=/; HttpOnly; SameSite=Lax` },
        );
      }
      return json(
        200,
        { user: USERS[cle] },
        { 'set-cookie': `${COOKIE}=e2e-${cle}; Path=/; HttpOnly; SameSite=Lax` },
      );
    }
    return json(401, { code: 'INVALID_EMAIL_OR_PASSWORD' });
  }
  const verification = path.match(/^\/api\/auth\/two-factor\/verify-(totp|backup-code)$/);
  if (verification && request.method === 'POST') {
    const body = await readBody(request);
    const attendu = verification[1] === 'totp' ? CODE_TOTP : CODE_SECOURS;
    // Connexion en cours (cookie d'étape) ou mise en place depuis une session.
    const cle =
      (request.headers.cookie ?? '').match(new RegExp(`${ETAPE_2FA}=(\\w+)`))?.[1] ?? jeton;
    if (!cle || !USERS[cle]) return json(401, { code: 'INVALID_TWO_FACTOR_COOKIE' });
    if (body.code !== attendu) return json(401, { code: 'INVALID_CODE' });
    USERS[cle].twoFactorEnabled = true;
    return json(
      200,
      { token: 'e2e', user: USERS[cle] },
      {
        'set-cookie': [
          `${COOKIE}=e2e-${cle}; Path=/; HttpOnly; SameSite=Lax`,
          `${ETAPE_2FA}=; Path=/; Max-Age=0`,
        ],
      },
    );
  }
  if (path === '/api/auth/two-factor/enable' && request.method === 'POST') {
    if (!user) return json(401, { message: 'Session absente' });
    const body = await readBody(request);
    if (body.password !== (user.motDePasse ?? MOT_DE_PASSE))
      return json(400, { code: 'INVALID_PASSWORD' });
    return json(200, {
      method: 'totp',
      totpURI: `otpauth://totp/Scolaly:${user.email}?secret=JBSWY3DPEHPK3PXP&issuer=Scolaly`,
      backupCodes: Array.from(
        { length: 10 },
        (_, i) => `secours-${String(i + 1).padStart(4, '0')}`,
      ),
    });
  }
  if (path === '/api/auth/sign-in/magic-link' && request.method === 'POST')
    return json(200, { status: true });
  if (path === '/api/auth/sign-out' && request.method === 'POST') {
    return json(200, { success: true }, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` });
  }

  // Invitations : « valide-<suffixe> » est valide (compte nora-<suffixe>), « expire-… » a expiré.
  const invitation = path.match(/^\/api\/invitations\/([^/]+)(\/activation)?$/);
  if (invitation) {
    const [, jeton, activation] = invitation;
    const suffixe = jeton.replace(/^(valide|expire)-/, '');
    const email = `nora-${suffixe}@exemple.test`;
    if (!/^(valide|expire)-/.test(jeton))
      return json(404, { message: 'Lien d’invitation invalide.' });
    const utilisee = Object.values(USERS).some((u) => u.email === email);
    const etat = jeton.startsWith('expire') ? 'expiree' : utilisee ? 'utilisee' : 'valide';
    if (!activation) {
      return json(200, {
        etat,
        prenom: 'Nora',
        email,
        ecole: 'École de gestion de Lumerac',
        expireLe: '2030-01-01T00:00:00.000Z',
      });
    }
    const body = await readBody(request);
    if (etat !== 'valide') return json(410, { message: 'Ce lien d’invitation a expiré.' });
    if (typeof body.motDePasse !== 'string' || body.motDePasse.length < 12) {
      return json(400, {
        message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
        details: ['motDePasse : Le mot de passe doit contenir au moins 12 caractères.'],
      });
    }
    if (body.conditionsAcceptees !== true) {
      return json(400, {
        message: 'Données invalides.',
        details: ['conditionsAcceptees : Acceptez les conditions d’utilisation pour continuer.'],
      });
    }
    USERS[`nora${suffixe.replace(/\W/g, '')}`] = {
      id: randomUUID(),
      name: 'Nora Fictive',
      email,
      motDePasse: body.motDePasse,
    };
    return json(200, { email, compteExistant: false });
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
      permissions: active
        ? [
            'apparence:gerer',
            'apprenants:inviter',
            'comptes:desactiver',
            'personnel:inviter',
            'personnes:importer',
            'personnes:lire',
            'calendrier:gerer',
            'calendrier:lire',
            'organisation:lire',
            'organisation:modifier',
            'roles:attribuer',
            'roles:gerer',
          ]
        : [],
      modules: active ? ['socle'] : [],
      doubleAuthentificationExigee: user.doubleAuthentificationExigee === true,
      doubleAuthentificationActive: user.twoFactorEnabled === true,
      apparence: active ? detailApparence() : null,
    });
  }

  // Assistant d'import (E-01-06) : analyse simplifiée, le contrôle réel est testé par l'API.
  const importRoute = path.match(/^\/api\/imports(?:\/([^/]+))?(\/correspondance)?$/);
  if (importRoute) {
    if (!user) return json(401, { message: 'Session absente' });
    const [, id] = importRoute;
    if (!id) {
      const morceaux = [];
      for await (const morceau of request) morceaux.push(morceau);
      const [entete = '', ...lignes] = Buffer.concat(morceaux)
        .toString('utf8')
        .split(/\r?\n/)
        .filter((l) => l.trim() !== '');
      const colonnes = entete.split(';');
      const connus = { nom: 'nom', prénom: 'prenom', email: 'email' };
      const creee = {
        id: randomUUID(),
        type: url.searchParams.get('type'),
        fichierNom: url.searchParams.get('fichier'),
        colonnes,
        lignes: lignes.map((l) => l.split(';')),
        correspondance: Object.fromEntries(
          colonnes.map((c) => [c, connus[c.toLowerCase()] ?? null]),
        ),
      };
      imports.set(creee.id, creee);
      return json(201, apercuImport(creee));
    }
    const enCours = imports.get(id);
    if (!enCours) return json(404, { message: 'Import introuvable dans cette école.' });
    if (request.method === 'PUT') enCours.correspondance = (await readBody(request)).correspondance;
    return json(200, apercuImport(enCours));
  }

  // Rôles d'une personne et actions de compte (US-01-09).
  const attributionsRoute = path.match(/^\/api\/personnes\/([^/]+)\/attributions$/);
  if (attributionsRoute) {
    if (!user) return json(401, { message: 'Session absente' });
    const fiche = personnes.find((p) => p.id === attributionsRoute[1]);
    if (!fiche) return json(404, { message: 'Personne introuvable dans cette école.' });
    fiche.attributions ??= [];
    if (request.method === 'POST') {
      const body = await readBody(request);
      const leRole = roles.find((r) => r.id === body.roleId);
      const etab = ecole.etablissements.find((e) => e.id === body.perimetreId);
      const creee = {
        id: randomUUID(),
        roleId: body.roleId,
        roleLibelle: leRole?.libelle ?? 'Rôle',
        perimetreType: body.perimetreType,
        perimetreId: body.perimetreId ?? null,
        perimetreLibelle: etab?.nom ?? null,
        debut: body.debut ?? new Date().toISOString().slice(0, 10),
        fin: body.fin ?? null,
        statut: 'en-cours',
      };
      fiche.attributions.push(creee);
      fiche.roles = [...new Set([...fiche.roles, creee.roleLibelle])];
      return json(201, creee);
    }
    return json(200, { attributions: fiche.attributions });
  }
  const retraitRoute = path.match(/^\/api\/attributions\/([^/]+)\/retrait$/);
  if (retraitRoute) {
    for (const fiche of personnes) {
      const a = (fiche.attributions ?? []).find((x) => x.id === retraitRoute[1]);
      if (a) {
        a.statut = 'terminee';
        a.fin = new Date().toISOString().slice(0, 10);
        fiche.roles = fiche.roles.filter((r) => r !== a.roleLibelle);
      }
    }
    response.writeHead(204);
    return response.end();
  }
  const compteRoute = path.match(
    /^\/api\/comptes\/([^/]+)\/(invitation|desactivation|reactivation)$/,
  );
  if (compteRoute) {
    const fiche = personnes.find((p) => p.id === compteRoute[1]);
    if (!fiche) return json(404, { message: 'Personne introuvable dans cette école.' });
    fiche.compteEtat = { invitation: 'invite', desactivation: 'desactive', reactivation: 'actif' }[
      compteRoute[2]
    ];
    if (compteRoute[2] === 'invitation')
      return json(200, { etat: 'invite', expireLe: '2030-01-01T00:00:00.000Z' });
    response.writeHead(204);
    return response.end();
  }

  const personneRoute = path.match(/^\/api\/personnes(?:\/([^/]+))?$/);
  if (personneRoute) {
    if (!user) return json(401, { message: 'Session absente' });
    const [, id] = personneRoute;
    if (!id && request.method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const etat = url.searchParams.get('etat');
      const trouvees = personnes
        .filter(
          (p) =>
            (!q || `${p.nom} ${p.prenom} ${p.email}`.toLowerCase().includes(q)) &&
            (!etat || p.compteEtat === etat),
        )
        .sort((a, b) => a.nom.localeCompare(b.nom));
      return json(200, { personnes: trouvees, total: trouvees.length, page: 1, parPage: 50 });
    }
    if (!id) {
      const { ignorerDoublons, ...body } = await readBody(request);
      const doublons = personnes
        .filter(
          (p) =>
            p.email.toLowerCase() === body.email.toLowerCase() ||
            (body.dateNaissance &&
              p.dateNaissance === body.dateNaissance &&
              p.nom.toLowerCase() === body.nom.toLowerCase()),
        )
        .map((p) => ({
          id: p.id,
          nom: p.nom,
          prenom: p.prenom,
          email: p.email,
          motifs: [p.email.toLowerCase() === body.email.toLowerCase() ? 'email' : 'identite'],
        }));
      if (
        doublons.length > 0 &&
        (!ignorerDoublons || doublons.some((d) => d.motifs[0] === 'email'))
      )
        return json(409, {
          message: 'Une fiche de même nom, prénom et date de naissance existe déjà.',
          doublons,
        });
      const creee = {
        id: randomUUID(),
        ...body,
        compteEtat: 'cree',
        matricule: String(personnes.length).padStart(6, '0'),
        roles: [],
        version: new Date().toISOString(),
      };
      personnes.push(creee);
      return json(201, detailPersonne(creee));
    }
    const fiche = personnes.find((p) => p.id === id);
    if (!fiche) return json(404, { message: 'Personne introuvable dans cette école.' });
    if (request.method === 'PATCH') {
      const { version, ...body } = await readBody(request);
      if (version !== fiche.version)
        return json(409, {
          message: 'Cette fiche vient d’être modifiée par quelqu’un d’autre.',
          actuelle: detailPersonne(fiche),
        });
      Object.assign(fiche, body, { version: new Date().toISOString() });
    }
    return json(200, detailPersonne(fiche));
  }

  // Liste de démarrage (E-01-01) : constats tirés de l'état de la fausse API.
  const etapeRoute = path.match(/^\/api\/demarrage(?:\/etapes\/(\w+))?$/);
  if (etapeRoute) {
    if (!user) return json(401, { message: 'Session absente' });
    if (etapeRoute[1]) {
      const { choix } = await readBody(request);
      if (choix) choixDemarrage.set(etapeRoute[1], choix);
      else choixDemarrage.delete(etapeRoute[1]);
    }
    const constats = {
      etablissementsComplets: ecole.etablissements.filter(
        (e) => e.statut === 'actif' && manquantes(e)[0] !== 'adresse',
      ).length,
      annees: annees.length,
      fermetures: annees.reduce((n, a) => n + a.fermetures.length, 0),
      couleur: apparence.couleur !== null,
      logo: apparence.logo !== null,
      roles: roles.length,
      personnesAvecRole: 1,
    };
    const faites = {
      organisation: constats.etablissementsComplets > 0,
      calendrier: constats.annees > 0 && constats.fermetures > 0,
      apparence: constats.couleur || constats.logo,
      roles: false,
    };
    const etapes = Object.entries(faites).map(([code, automatique]) => ({
      code,
      automatique,
      statut: automatique ? 'faite' : (choixDemarrage.get(code) ?? 'a-faire'),
    }));
    return json(200, {
      etapes,
      avancement: Math.round((etapes.filter((e) => e.statut === 'faite').length / 4) * 100),
      termine: etapes.every((e) => e.statut !== 'a-faire'),
      constats,
    });
  }
  if (path === `/api/ecoles/${ecole.id}/logo`) {
    if (!apparence.logo) return json(404, { message: 'Cette école n’a pas de logo.' });
    response.writeHead(200, { 'content-type': apparence.logo.type });
    return response.end(apparence.logo.contenu);
  }
  if (path === '/api/apparence/logo') {
    if (!user) return json(401, { message: 'Session absente' });
    if (request.method === 'DELETE') apparence.logo = null;
    else {
      const morceaux = [];
      for await (const morceau of request) morceaux.push(morceau);
      apparence.logo = {
        type: request.headers['content-type'],
        contenu: Buffer.concat(morceaux),
        version: randomUUID().slice(0, 8),
      };
    }
    return json(200, detailApparence());
  }
  if (path === '/api/apparence') {
    if (!user) return json(401, { message: 'Session absente' });
    if (request.method === 'PATCH') {
      const body = await readBody(request);
      if (body.couleur && contrasteSurBlanc(body.couleur) < 4.5)
        return json(400, {
          message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
          details: ['couleur : Cette couleur n’est pas assez contrastée sur fond blanc.'],
          proposition: '#806600',
        });
      if (body.nomAffichage !== undefined) apparence.nomAffichage = body.nomAffichage;
      if (body.couleur !== undefined) apparence.couleur = body.couleur?.toUpperCase() ?? null;
    }
    return json(200, detailApparence());
  }

  // Calendrier (E-01-03) : chaque année est créée par le test qui l'utilise.
  const anneeRoute = path.match(/^\/api\/annees(?:\/([^/]+))?(\/fermetures|\/duplication)?$/);
  const fermetureRoute = path.match(/^\/api\/fermetures\/([^/]+)$/);
  if (anneeRoute || fermetureRoute) {
    if (!user) return json(401, { message: 'Session absente' });
    if (fermetureRoute) {
      const annee = annees.find((a) => a.fermetures.some((f) => f.id === fermetureRoute[1]));
      if (!annee) return json(404, { message: 'Fermeture introuvable dans cette école.' });
      const rang = annee.fermetures.findIndex((f) => f.id === fermetureRoute[1]);
      if (request.method === 'DELETE') {
        annee.fermetures.splice(rang, 1);
        response.writeHead(204);
        return response.end();
      }
      annee.fermetures[rang] = { id: fermetureRoute[1], ...(await readBody(request)) };
      return json(200, annee.fermetures[rang]);
    }
    const [, id, sousRoute] = anneeRoute;
    if (!id && request.method === 'GET') return json(200, { annees: annees.map(resumeAnnee) });
    if (!id) {
      const body = await readBody(request);
      const annee = {
        id: randomUUID(),
        libelle: body.libelle,
        dateDebut: body.dateDebut,
        dateFin: body.dateFin,
        statut: 'preparation',
        periodes: body.periodes.map((p, i) => ({ id: randomUUID(), ordre: i + 1, ...p })),
        fermetures: (body.fermetures ?? []).map((f) => ({ id: randomUUID(), ...f })),
      };
      annees.push(annee);
      return json(201, detailAnnee(annee));
    }
    const annee = annees.find((a) => a.id === id);
    if (!annee) return json(404, { message: 'Année scolaire introuvable dans cette école.' });
    if (sousRoute === '/duplication') {
      const suivante = (jour) => `${Number(jour.slice(0, 4)) + 1}${jour.slice(4)}`;
      const decaler = ({ id: _id, ordre: _ordre, ...e }) => ({
        ...e,
        dateDebut: suivante(e.dateDebut),
        dateFin: suivante(e.dateFin),
      });
      return json(200, {
        ...decaler({ dateDebut: annee.dateDebut, dateFin: annee.dateFin }),
        libelle: annee.libelle.replace(/\b(19|20)\d{2}\b/g, (m) => String(Number(m) + 1)),
        periodes: annee.periodes.map(decaler),
        fermetures: annee.fermetures.map(decaler),
        dupliqueDe: annee.id,
      });
    }
    if (sousRoute === '/fermetures') {
      const body = await readBody(request);
      if (body.dateDebut < annee.dateDebut || body.dateFin > annee.dateFin)
        return json(400, {
          message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
          details: ['corps : Une fermeture doit rester dans l’année scolaire.'],
        });
      const fermeture = { id: randomUUID(), etablissementIds: [], ...body };
      annee.fermetures.push(fermeture);
      return json(201, fermeture);
    }
    if (request.method === 'PATCH') {
      const { periodes, ...reste } = await readBody(request);
      Object.assign(annee, reste);
      if (periodes)
        annee.periodes = periodes.map((p, i) => ({ id: p.id ?? randomUUID(), ordre: i + 1, ...p }));
    }
    if (request.method === 'DELETE') {
      annees.splice(annees.indexOf(annee), 1);
      response.writeHead(204);
      return response.end();
    }
    return json(200, detailAnnee(annee));
  }

  if (path === '/api/organisation') {
    if (!user) return json(401, { message: 'Session absente' });
    if (request.method === 'PATCH') Object.assign(ecole, await readBody(request));
    return json(200, detailEcole());
  }
  const etablissementRoute = path.match(
    /^\/api\/etablissements(?:\/([^/]+))?(\/archivage|\/reactivation)?$/,
  );
  if (etablissementRoute) {
    if (!user) return json(401, { message: 'Session absente' });
    const [, id, action] = etablissementRoute;
    if (!id) {
      const body = await readBody(request);
      const cree = {
        id: randomUUID(),
        adresseLigne2: null,
        uai: null,
        siret: null,
        nda: null,
        telephone: null,
        email: null,
        statut: 'actif',
        ...body,
      };
      ecole.etablissements.push(cree);
      return json(201, { ...cree, manquantes: manquantes(cree) });
    }
    const cible = ecole.etablissements.find((e) => e.id === id);
    if (!cible) return json(404, { message: 'Établissement introuvable dans cette école.' });
    if (action === '/archivage') {
      if (ecole.etablissements.filter((e) => e.statut === 'actif').length < 2)
        return json(409, { message: 'Votre école doit garder au moins un établissement actif.' });
      cible.statut = 'archive';
    } else if (action === '/reactivation') cible.statut = 'actif';
    else {
      const body = await readBody(request);
      if (uaiInvalide(body.uai))
        return json(400, {
          message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
          details: ['uai : L’UAI compte 7 chiffres suivis d’une lettre, par exemple 0691234A.'],
        });
      for (const [cle, valeur] of Object.entries(body)) cible[cle] = nul(valeur);
      if (cible.uai) cible.uai = cible.uai.toUpperCase();
    }
    return json(200, { ...cible, manquantes: manquantes(cible) });
  }

  if (path === '/api/roles' || path.startsWith('/api/roles/')) {
    if (!user) return json(401, { message: 'Session absente' });
    const id = path.split('/')[3];
    if (!id && request.method === 'GET') return json(200, { roles });
    if (!id && request.method === 'POST') {
      const body = await readBody(request);
      const source = roles.find((r) => r.id === body.sourceId);
      const role = {
        id: randomUUID(),
        code: null,
        libelle: body.libelle,
        description: body.description ?? null,
        perimetreParDefaut: source?.perimetreParDefaut ?? 'organisation',
        doubleAuthentificationRequise:
          (source?.doubleAuthentificationRequise ?? false) ||
          body.doubleAuthentificationRequise === true,
        permissions: body.permissions ?? source?.permissions ?? [],
        personnes: 0,
        parDefaut: false,
        verrouille: false,
      };
      roles.push(role);
      return json(201, role);
    }
    const role = roles.find((r) => r.id === id);
    if (!role) return json(404, { message: 'Rôle introuvable dans cette école.' });
    if (request.method === 'PATCH') {
      const body = await readBody(request);
      if (role.verrouille)
        return json(409, { message: 'Le rôle d’administrateur garde toutes ses permissions.' });
      Object.assign(role, body);
      return json(200, role);
    }
    if (request.method === 'DELETE') {
      roles.splice(roles.indexOf(role), 1);
      response.writeHead(204);
      return response.end();
    }
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

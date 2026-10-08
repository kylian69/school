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
// RG-04-02 : plage de l'emploi du temps par défaut d'un établissement.
const PLAGE_EDT = {
  debut: '08:00',
  fin: '19:00',
  limiteMidi: '13:00',
  joursOuvres: [1, 2, 3, 4, 5],
};

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
      edt: { ...PLAGE_EDT },
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
    matricule: '000000',
    ine: null,
    compteEtat: 'actif',
    roles: ['Administrateur d’organisation'],
    version: '2026-10-01T00:00:00.000Z',
  },
];
const detailPersonne = (p) => ({
  ...p,
  naissanceVisible: true,
  photo: {
    url: p.photoContenu ? `/api/personnes/${p.id}/photo?v=${p.photoVersion}` : null,
    attenteUrl: null,
    statut: p.photoContenu ? 'validee' : null,
    motif: null,
  },
});
// Ma photo (US-01-20) : celle de Camille, déposée par elle-même et en attente de validation.
const maPhoto = { contenu: null, statut: null };
const SEANCE_ID = '0192f0a4-1b2c-7d3e-8f40-0000000000aa';
let emargementLea = null;
const seanceFictive = () => {
  const debut = new Date(Date.now() - 60_000);
  return {
    id: SEANCE_ID,
    libelle: 'Droit des affaires',
    debut: debut.toISOString(),
    fin: new Date(debut.getTime() + 3 * 3600_000).toISOString(),
    distanciel: false,
    intervenant: 'Sophie Arnaud',
  };
};

const lireCorps = async (request) => {
  const morceaux = [];
  for await (const morceau of request) morceaux.push(morceau);
  return Buffer.concat(morceaux);
};

const annees = [];
const choixDemarrage = new Map();
const imports = new Map();
const corbeille = [];
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
    statut: i.statut ?? 'en_preparation',
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
    bilan: i.bilan ?? null,
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

// Référentiel (module 02) : formations et maquettes en mémoire, totaux simplifiés. Le vrai
// calcul (totaux, versions, moteur de résultats) est couvert par les tests du domaine et de l'API.
const formations = [];
const maquettes = new Map();
const echelle = {
  parDefaut: true,
  niveaux: [
    {
      id: 'defaut-1',
      libelle: 'Non acquis',
      couleur: '#DC2626',
      valeur: 0,
      ordre: 1,
      valide: false,
    },
    {
      id: 'defaut-2',
      libelle: 'En cours d’acquisition',
      couleur: '#D97706',
      valeur: 1,
      ordre: 2,
      valide: false,
    },
    { id: 'defaut-3', libelle: 'Acquis', couleur: '#16A34A', valeur: 2, ordre: 3, valide: true },
    { id: 'defaut-4', libelle: 'Expert', couleur: '#4F46E5', valeur: 3, ordre: 4, valide: true },
  ],
};
const bibliotheque = [];
const REGLES_DEFAUT = {
  mode: 'lmd',
  seuil: 10,
  noteEliminatoire: null,
  compensationModules: true,
  compensationSemestres: false,
  arrondi: { decimales: 2, methode: 'plus_proche' },
  mentions: [
    { libelle: 'Assez bien', seuil: 12 },
    { libelle: 'Bien', seuil: 14 },
    { libelle: 'Très bien', seuil: 16 },
  ],
  modeEvaluation: 'notes',
  validationBlocs: 'notes',
  regleNiveau: 'derniere',
};
const TYPES_H = ['cm', 'td', 'tp', 'projet', 'elearning'];
const nouvelleVersion = (formation, numero, source) => {
  const id = randomUUID();
  const copie = source
    ? structuredClone(source)
    : {
        blocs: [],
        ues: [],
        modules: [],
        competences: [],
        regles: REGLES_DEFAUT,
        reglesParticulieres: [],
      };
  maquettes.set(id, {
    ...copie,
    id,
    formationId: formation.id,
    numero,
    statut: 'brouillon',
    publieeLe: null,
  });
  return id;
};
const resumeVersion = (m) => ({
  id: m.id,
  numero: m.numero,
  statut: m.statut,
  publieeLe: m.publieeLe,
  utilisee: false,
});
const versionsDe = (formationId) =>
  [...maquettes.values()]
    .filter((m) => m.formationId === formationId)
    .sort((a, b) => a.numero - b.numero);
const detailFormation = (f) => ({
  ...f,
  versions: versionsDe(f.id).map(resumeVersion),
  modifiable: true,
  publiable: true,
});
const heuresVides = () => Object.fromEntries(TYPES_H.map((t) => [t, 0]));
function detailMaquette(m) {
  const f = formations.find((x) => x.id === m.formationId);
  const ues = {};
  const heures = heuresVides();
  for (const u of m.ues) ues[u.id] = { heures: heuresVides(), heuresTotal: 0, modules: 0 };
  for (const mod of m.modules) {
    const total = ues[mod.ueId];
    for (const t of TYPES_H) {
      heures[t] += mod.heures[t];
      total.heures[t] += mod.heures[t];
      total.heuresTotal += mod.heures[t];
    }
    total.modules += 1;
  }
  const periodes = [];
  for (const u of m.ues) {
    let p = periodes.find((x) => x.annee === u.annee && x.semestre === u.semestre);
    if (!p)
      periodes.push((p = { annee: u.annee, semestre: u.semestre, ects: 0, heures: heuresVides() }));
    p.ects += u.ects;
  }
  periodes.sort(
    (a, b) => a.annee * 100 + (a.semestre ?? 99) - (b.annee * 100 + (b.semestre ?? 99)),
  );
  const ects = m.ues.reduce((s, u) => s + u.ects, 0);
  const avertissements = [
    ...(ects > 0
      ? periodes
          .filter((p) => p.semestre !== null && p.ects !== 30)
          .map((p) => ({
            type: 'semestre-ects',
            annee: p.annee,
            semestre: p.semestre,
            ects: p.ects,
            attendu: 30,
          }))
      : []),
    ...m.ues
      .filter((u) => ues[u.id].modules === 0)
      .map((u) => ({ type: 'ue-sans-module', ueId: u.id, code: u.code })),
  ];
  return {
    formation: { id: f.id, intitule: f.intitule, dureeAnnees: f.dureeAnnees },
    version: resumeVersion(m),
    versions: versionsDe(f.id).map(resumeVersion),
    modifiable: m.statut !== 'archivee',
    publiable: m.statut === 'brouillon',
    regles: m.regles,
    reglesParticulieres: m.reglesParticulieres,
    reglement: { disponible: false },
    blocs: m.blocs,
    ues: m.ues,
    modules: m.modules,
    competences: m.competences,
    totaux: {
      heures,
      heuresTotal: TYPES_H.reduce((s, t) => s + heures[t], 0),
      ects,
      periodes,
      annees: [...new Set(m.ues.map((u) => u.annee))].map((annee) => ({
        annee,
        ects: m.ues.filter((u) => u.annee === annee).reduce((s, u) => s + u.ects, 0),
      })),
      ues,
      blocs: Object.fromEntries(
        m.blocs.map((b) => [
          b.id,
          {
            ects: m.ues.filter((u) => u.blocId === b.id).reduce((s, u) => s + u.ects, 0),
            heuresTotal: 0,
          },
        ]),
      ),
    },
    avertissements,
  };
}
const invalideRef = (champ, message) => ({
  message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
  details: [`${champ} : ${message}`],
});
async function routeReferentiel(path, request, json, response, url) {
  if (path === '/api/referentiel/echelle') {
    if (request.method === 'PUT') {
      const { niveaux } = await readBody(request);
      echelle.parDefaut = false;
      echelle.niveaux = niveaux.map((n, i) => ({
        id: randomUUID(),
        ordre: i + 1,
        ...n,
        couleur: n.couleur.toUpperCase(),
      }));
    }
    return json(200, echelle);
  }
  const regle = path.match(/^\/api\/referentiel\/regles(?:\/([^/]+))?$/);
  if (regle) {
    if (!regle[1] && request.method === 'GET') return json(200, { regles: bibliotheque });
    if (!regle[1]) {
      const r = { id: randomUUID(), ...(await readBody(request)) };
      bibliotheque.push(r);
      return json(201, r);
    }
    const rang = bibliotheque.findIndex((r) => r.id === regle[1]);
    if (request.method === 'DELETE') {
      bibliotheque.splice(rang, 1);
      response.writeHead(204);
      return response.end();
    }
    bibliotheque[rang] = { id: regle[1], ...(await readBody(request)) };
    return json(200, bibliotheque[rang]);
  }
  const formation = path.match(/^\/api\/formations(?:\/([^/]+))?(\/duplication)?$/);
  if (formation) {
    const [, id, duplication] = formation;
    if (!id && request.method === 'GET')
      return json(200, { formations: formations.map(detailFormation), creation: true });
    if (!id) {
      const body = await readBody(request);
      if (
        body.codeRncp &&
        !/^(RNCP|RS)\d{1,6}$/.test(body.codeRncp.replace(/\s+/g, '').toUpperCase())
      )
        return json(400, invalideRef('codeRncp', 'Code attendu au format RNCP12345 ou RS1234.'));
      const f = {
        id: randomUUID(),
        statut: 'active',
        etablissementIds: [],
        ...body,
        codeRncp: body.codeRncp ? body.codeRncp.toUpperCase() : null,
      };
      formations.push(f);
      nouvelleVersion(f, 1);
      return json(201, detailFormation(f));
    }
    const f = formations.find((x) => x.id === id);
    if (!f) return json(404, { message: 'Formation introuvable.' });
    if (duplication) {
      const { intitule } = await readBody(request);
      const copie = { ...f, id: randomUUID(), intitule };
      formations.push(copie);
      nouvelleVersion(copie, 1, versionsDe(f.id).at(-1));
      return json(201, detailFormation(copie));
    }
    if (request.method === 'PATCH') Object.assign(f, await readBody(request));
    return json(200, detailFormation(f));
  }
  const maquette = path.match(
    /^\/api\/maquettes\/([^/]+)(?:\/(publication|nouvelle-version|archivage|regles|simulation|import|blocs|ues|modules|competences)(?:\/([^/]+))?)?$/,
  );
  if (!maquette) return false;
  const [, versionId, action, elementId] = maquette;
  const m = maquettes.get(versionId);
  if (!m) return json(404, { message: 'Version de maquette introuvable.' });
  if (action === 'publication') {
    m.statut = 'publiee';
    m.publieeLe = new Date().toISOString();
  }
  if (action === 'archivage') m.statut = 'archivee';
  if (action === 'nouvelle-version') {
    const f = formations.find((x) => x.id === m.formationId);
    return json(
      201,
      detailMaquette(maquettes.get(nouvelleVersion(f, versionsDe(f.id).length + 1, m))),
    );
  }
  if (action === 'regles') {
    const body = await readBody(request);
    m.regles = body.regles;
    m.reglesParticulieres = body.reglesParticulieres.map((r) => ({ id: randomUUID(), ...r }));
  }
  if (action === 'import') {
    const texte = await new Promise((resolve) => {
      let data = '';
      request.on('data', (chunk) => (data += chunk));
      request.on('end', () => resolve(data));
    });
    const [entete = '', ...lignes] = texte
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter(Boolean);
    const colonnes = entete.split(';');
    const ue = colonnes.indexOf('UE');
    const intitule = colonnes.indexOf('Intitulé de l’UE');
    const ues = lignes.map((l) => l.split(';')).filter((c) => c[ue]);
    const apercu = url.searchParams.get('apercu') === 'true';
    if (!apercu) {
      for (const c of ues) {
        m.ues.push({
          id: randomUUID(),
          blocId: null,
          code: c[ue],
          intitule: c[intitule] || c[ue],
          annee: 1,
          semestre: 1,
          ects: 0,
          coefficient: 1,
          option: null,
          ordre: m.ues.length,
        });
      }
    }
    return json(200, {
      apercu,
      importe: !apercu,
      blocs: 0,
      ues: ues.length,
      modules: 0,
      competences: 0,
      erreurs: [],
      avertissements: ues.map((c) => `L’UE ${c[ue]} n’a aucun module : elle sera créée vide.`),
      maquette: apercu ? null : detailMaquette(m),
    });
  }
  if (action === 'simulation') {
    const { evaluations } = await readBody(request);
    const note = (moduleId) => evaluations.find((e) => e.moduleId === moduleId)?.note ?? null;
    const ues = m.ues.map((u) => {
      const notes = m.modules
        .filter((x) => x.ueId === u.id)
        .map((x) => note(x.id))
        .filter((n) => n !== null);
      const moyenne = notes.length
        ? Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 100) / 100
        : null;
      return {
        id: u.id,
        moyenne,
        acquise: moyenne === null ? null : moyenne >= m.regles.seuil,
        par: moyenne >= m.regles.seuil ? 'moyenne' : null,
        ects: moyenne >= m.regles.seuil ? u.ects : 0,
        eliminatoire: false,
        bonus: false,
      };
    });
    const valeurs = ues.filter((u) => u.moyenne !== null);
    const generale = valeurs.length
      ? Math.round((valeurs.reduce((s, u) => s + u.moyenne, 0) / valeurs.length) * 100) / 100
      : null;
    return json(200, {
      modules: [],
      ues,
      periodes: [],
      blocs: [],
      moyenneGenerale: generale,
      admis: ues.some((u) => u.acquise === null) ? null : ues.every((u) => u.acquise),
      mention: null,
      ects: ues.reduce((s, u) => s + u.ects, 0),
      explications: [],
      anomalies: [],
    });
  }
  const listes = { blocs: 'blocs', ues: 'ues', modules: 'modules', competences: 'competences' };
  if (listes[action]) {
    const liste = m[listes[action]];
    if (request.method === 'DELETE') {
      liste.splice(
        liste.findIndex((e) => e.id === elementId),
        1,
      );
      if (action === 'ues') m.modules = m.modules.filter((x) => x.ueId !== elementId);
      return json(200, detailMaquette(m));
    }
    const body = await readBody(request);
    if (!body.code || !body.intitule)
      return json(400, invalideRef(body.code ? 'intitule' : 'code', 'Ce champ est obligatoire.'));
    if (elementId) {
      Object.assign(
        liste.find((e) => e.id === elementId),
        body,
      );
      return json(200, detailMaquette(m));
    }
    const element = { id: randomUUID(), ordre: liste.length, ...body };
    if (action === 'ues')
      Object.assign(element, {
        blocId: null,
        annee: 1,
        semestre: 1,
        ects: 0,
        coefficient: 1,
        option: null,
        ...body,
      });
    if (action === 'modules')
      Object.assign(element, {
        coefficient: 1,
        ...body,
        heures: { ...heuresVides(), ...body.heures },
      });
    if (action === 'competences') Object.assign(element, { criteres: [], moduleIds: [], ...body });
    liste.push(element);
    return json(201, { id: element.id, maquette: detailMaquette(m) });
  }
  return json(200, detailMaquette(m));
}

// Alternance (module 03) : entreprises et contacts en mémoire. L'annuaire répond pour les SIRET
// commençant par 999 ; les contrôles (clé, IDCC, doublons) sont testés par l'API.
const OPCOS = { akto: 'AKTO', atlas: 'Atlas', 'opco-ep': 'OPCO EP' };
const entreprises = [];
const ficheEntreprise = (e) => ({
  ...e,
  contacts: e.contacts.map((c) => ({
    ...c,
    personne: (({ id, nom, prenom, email, compteEtat }) => ({
      id,
      nom,
      prenom,
      email,
      compteEtat,
    }))(personnes.find((p) => p.id === c.personneId)),
  })),
  modifiable: true,
});
async function routeAlternance(path, request, json, response, url) {
  if (path === '/api/opcos') {
    return json(200, {
      opcos: Object.entries(OPCOS).map(([code, libelle]) => ({ code, libelle })),
    });
  }
  const siret = path.match(/^\/api\/entreprises\/siret\/(\d{14})$/);
  if (siret) {
    const existante = entreprises.find((e) => e.siret === siret[1]);
    const connu = siret[1].startsWith('999');
    return json(200, {
      siret: siret[1],
      existante: existante?.id ?? null,
      annuaire: connu ? 'trouve' : 'introuvable',
      fiche: connu
        ? {
            siren: siret[1].slice(0, 9),
            raisonSociale: 'ATELIERS FICTIFS DE LUMERAC',
            adresse: '1 rue Fictive',
            codePostal: '99100',
            ville: 'LUMERAC',
            naf: '62.01Z',
            effectif: null,
            ferme: false,
            idcc: '1486',
            opcoPropose: 'atlas',
          }
        : null,
    });
  }
  if (path === '/api/entreprises' && request.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    return json(200, {
      entreprises: entreprises
        .filter((e) => `${e.raisonSociale} ${e.siret} ${e.ville ?? ''}`.toLowerCase().includes(q))
        .map((e) => ({
          ...ficheEntreprise(e),
          contacts: undefined,
          tuteurs: e.contacts.filter((c) => c.type === 'tuteur').length,
        })),
      creation: true,
    });
  }
  if (path === '/api/entreprises') {
    const body = await readBody(request);
    const connu = body.siret.startsWith('999');
    const e = {
      id: randomUUID(),
      siret: body.siret,
      siren: body.siret.slice(0, 9),
      raisonSociale: connu ? 'ATELIERS FICTIFS DE LUMERAC' : body.raisonSociale,
      adresse: connu ? '1 rue Fictive' : (body.adresse ?? null),
      codePostal: connu ? '99100' : (body.codePostal ?? null),
      ville: connu ? 'LUMERAC' : (body.ville ?? null),
      naf: connu ? '62.01Z' : null,
      effectif: null,
      idcc: connu ? '1486' : (body.idcc ?? null),
      opco: body.opco ?? (connu ? 'atlas' : null),
      statut: 'active',
      aVerifier: !connu,
      contacts: [],
    };
    entreprises.push(e);
    return json(201, ficheEntreprise(e));
  }
  const fiche = path.match(/^\/api\/entreprises\/([^/]+)(\/contacts)?$/);
  if (fiche) {
    const e = entreprises.find((x) => x.id === fiche[1]);
    if (!e) return json(404, { message: 'Entreprise introuvable.' });
    if (fiche[2]) {
      const body = await readBody(request);
      const personne = {
        id: randomUUID(),
        civilite: null,
        nomUsage: null,
        telephone: null,
        adresseLigne1: null,
        codePostal: null,
        ville: null,
        dateNaissance: null,
        lieuNaissance: null,
        ine: null,
        ...body.personne,
        compteEtat: 'cree',
        matricule: String(personnes.length).padStart(6, '0'),
        roles: [],
        version: new Date().toISOString(),
      };
      personnes.push(personne);
      const contact = {
        id: randomUUID(),
        personneId: personne.id,
        type: body.type,
        fonction: body.fonction ?? null,
        dansEntrepriseDepuis: body.dansEntrepriseDepuis ?? null,
      };
      e.contacts.push(contact);
      return json(201, ficheEntreprise({ ...e, contacts: [contact] }).contacts[0]);
    }
    if (request.method === 'PATCH') Object.assign(e, await readBody(request));
    return json(200, ficheEntreprise(e));
  }
  const contact = path.match(/^\/api\/contacts-entreprise\/([^/]+)$/);
  if (contact) {
    for (const e of entreprises) e.contacts = e.contacts.filter((c) => c.id !== contact[1]);
    response.writeHead(204);
    return response.end();
  }
  return false;
}

// Contrats et conventions (module 03) en mémoire : seuls le seuil de gratification (308 h) et les
// statuts sont simulés ; les autres règles sont testées par le domaine et l'API.
const contratsAlt = [];
const conventionsAlt = [];
const resumeFiche = (id) => {
  const p = personnes.find((x) => x.id === id);
  return p
    ? { id: p.id, nom: p.nom, prenom: p.prenom, email: p.email, compteEtat: p.compteEtat }
    : null;
};
const apprenantDe = (inscriptionId) => {
  for (const p of promotions) {
    const i = p.inscriptions.find((x) => x.id === inscriptionId);
    if (i)
      return {
        personneId: i.personne.id,
        nom: i.personne.nom,
        prenom: i.personne.prenom,
        inscriptionId: i.id,
        promotion: { id: p.id, libelle: p.libelle },
      };
  }
  return null;
};
const entrepriseResumee = (id) => {
  const e = entreprises.find((x) => x.id === id);
  return { id: e.id, raisonSociale: e.raisonSociale, siret: e.siret, statut: e.statut };
};
const vueContrat = (c) => ({
  ...c,
  entreprise: entrepriseResumee(c.entrepriseId),
  entrepriseId: undefined,
  referent: c.referentId ? resumeFiche(c.referentId) : null,
  referentId: undefined,
  tuteurs: c.tuteurs.map((x) => ({ ...x, personne: resumeFiche(x.personneId) })),
  avertissements: [],
  modifiable: true,
});
const controlesStage = (c) =>
  c.heuresPresence > 308 && !c.gratificationHoraire
    ? [{ type: 'gratification-obligatoire', heures: c.heuresPresence, seuil: 308 }]
    : [];
const vueConvention = (c) => ({
  ...c,
  entreprise: entrepriseResumee(c.entrepriseId),
  entrepriseId: undefined,
  tuteur: c.tuteurId ? resumeFiche(c.tuteurId) : null,
  tuteurId: undefined,
  referent: resumeFiche(c.referentId),
  referentId: undefined,
  controles: controlesStage(c),
  modifiable: true,
});
async function routeContrats(path, request, json, response, url) {
  if (path === '/api/contrats' && request.method === 'GET') {
    const personneId = url.searchParams.get('personneId');
    const de = (c) => !personneId || c.apprenant.personneId === personneId;
    return json(200, {
      contrats: contratsAlt.filter(de).map(vueContrat),
      conventions: conventionsAlt.filter(de).map(vueConvention),
      inscriptions: personneId
        ? promotions.flatMap((p) =>
            p.inscriptions
              .filter((i) => i.personne.id === personneId)
              .map((i) => ({
                id: i.id,
                promotion: { id: p.id, libelle: p.libelle },
                modifiable: true,
              })),
          )
        : [],
      creation: true,
    });
  }
  if (path === '/api/contrats') {
    const body = await readBody(request);
    const c = {
      id: randomUUID(),
      apprenant: apprenantDe(body.inscriptionId),
      entrepriseId: body.entrepriseId,
      type: body.type,
      debut: body.debut,
      fin: body.fin,
      opco: body.opco ?? entreprises.find((e) => e.id === body.entrepriseId)?.opco ?? null,
      numeroDepot: body.numeroDepot ?? null,
      statut: 'brouillon',
      referentId: body.referentId ?? null,
      formationProlongee: body.formationProlongee ?? false,
      rupture: null,
      document: false,
      finPeriodeEssai: null,
      tuteurs: body.tuteurIds.map((personneId) => ({
        id: randomUUID(),
        personneId,
        debut: body.debut,
        fin: null,
      })),
    };
    contratsAlt.push(c);
    return json(201, vueContrat(c));
  }
  const contrat = path.match(/^\/api\/contrats\/([^/]+)(?:\/(rupture|tuteurs|document))?$/);
  if (contrat) {
    const c = contratsAlt.find((x) => x.id === contrat[1]);
    if (!c) return json(404, { message: 'Contrat introuvable.' });
    if (contrat[2] === 'document') {
      if (request.method === 'GET') return json(200, { url: '/fake-document.pdf' });
      await lireCorps(request);
      c.document = true;
      return json(200, vueContrat(c));
    }
    if (request.method === 'DELETE') {
      contratsAlt.splice(contratsAlt.indexOf(c), 1);
      response.writeHead(204);
      return response.end();
    }
    const body = request.method === 'GET' ? {} : await readBody(request);
    if (contrat[2] === 'rupture') {
      c.statut = 'rompu';
      c.rupture = { date: body.date, motif: body.motif, sansEmployeurJusquau: null };
      for (const x of c.tuteurs) if (x.fin === null) x.fin = body.date;
    } else if (contrat[2] === 'tuteurs') {
      const remplace = c.tuteurs.find((x) => x.personneId === body.remplace && x.fin === null);
      if (remplace) remplace.fin = body.date;
      c.tuteurs.push({
        id: randomUUID(),
        personneId: body.personneId,
        debut: body.date,
        fin: null,
      });
    } else Object.assign(c, body);
    return json(200, vueContrat(c));
  }
  if (path === '/api/conventions-stage') {
    const body = await readBody(request);
    if (controlesStage(body).length > 0 && !body.derogationMotif)
      return json(400, {
        message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
        details: [
          'gratificationHoraire : Au-delà de 308 heures de stage sur l’année, une gratification est obligatoire.',
        ],
      });
    const c = {
      id: randomUUID(),
      apprenant: apprenantDe(body.inscriptionId),
      ...body,
      statut: 'brouillon',
      document: false,
    };
    conventionsAlt.push(c);
    return json(201, vueConvention(c));
  }
  const convention = path.match(/^\/api\/conventions-stage\/([^/]+)(\/document)?$/);
  if (convention) {
    const c = conventionsAlt.find((x) => x.id === convention[1]);
    if (!c) return json(404, { message: 'Convention introuvable.' });
    if (convention[2]) {
      if (request.method === 'GET') return json(200, { url: '/fake-document.pdf' });
      await lireCorps(request);
      c.document = true;
    } else if (request.method === 'PATCH') Object.assign(c, await readBody(request));
    return json(200, vueConvention(c));
  }
  return false;
}

// Rythmes (module 03) : génération simplifiée (lundi, mardi à l'école ; week-end fermé), la
// génération réelle (motifs, fériés, fermetures) étant testée par le domaine et l'API.
const modelesRythme = [
  {
    id: 'deux-jours-ecole',
    libelle: '2 jours école (lundi, mardi) / 3 jours entreprise',
    fourni: true,
  },
  { id: 'une-semaine-sur-deux', libelle: '1 semaine école / 1 semaine entreprise', fourni: true },
].map((m) => ({
  ...m,
  motif: [['ecole', 'ecole', 'entreprise', 'entreprise', 'entreprise', 'ferme', 'ferme']],
}));
const calendriersRythme = new Map();
const exceptionsRythme = [];
const genererFake = (debut, fin) => {
  const jours = {};
  for (let n = Date.parse(`${debut}T00:00:00Z`); n <= Date.parse(`${fin}T00:00:00Z`); n += 864e5) {
    const d = new Date(n);
    const rang = (d.getUTCDay() + 6) % 7;
    jours[d.toISOString().slice(0, 10)] = rang < 2 ? 'ecole' : rang < 5 ? 'entreprise' : 'ferme';
  }
  return jours;
};
const vueRythme = (p) => {
  const c = calendriersRythme.get(p.id);
  const compte = { ecole: 0, entreprise: 0, ferme: 0, examen: 0 };
  for (const type of Object.values(c?.jours ?? {})) compte[type] += 1;
  return {
    promotion: { id: p.id, libelle: p.libelle, dateDebut: p.dateDebut, dateFin: p.dateFin },
    calendrier: c ? { ...c, compte } : null,
    exceptions: exceptionsRythme
      .filter((e) => e.promotionId === p.id)
      .map((e) => ({ ...e, promotionId: undefined })),
    modifiable: true,
  };
};
async function routeRythmes(path, request, json) {
  if (path === '/api/rythmes/modeles') {
    if (request.method === 'GET') return json(200, { modeles: modelesRythme, creation: true });
    const body = await readBody(request);
    const m = { id: randomUUID(), ...body, fourni: false };
    modelesRythme.push(m);
    return json(201, m);
  }
  const exception = path.match(/^\/api\/exceptions-rythme\/([^/]+)$/);
  if (exception) {
    const e = exceptionsRythme.find((x) => x.id === exception[1]);
    exceptionsRythme.splice(exceptionsRythme.indexOf(e), 1);
    return json(200, vueRythme(promotions.find((p) => p.id === e.promotionId)));
  }
  const route = path.match(/^\/api\/promotions\/([^/]+)\/rythme(\/jours|\/exceptions)?$/);
  if (!route) return false;
  const p = promotions.find((x) => x.id === route[1]);
  if (!p) return json(404, { message: 'Promotion introuvable.' });
  if (request.method === 'PUT') {
    const body = await readBody(request);
    const modele = modelesRythme.find((m) => m.id === body.modele);
    calendriersRythme.set(p.id, {
      modele: modele.libelle,
      jours: genererFake(p.dateDebut, p.dateFin),
    });
  } else if (route[2] === '/jours') {
    const body = await readBody(request);
    for (const { date, type } of body.jours) calendriersRythme.get(p.id).jours[date] = type;
  } else if (route[2] === '/exceptions') {
    const body = await readBody(request);
    const i = p.inscriptions.find((x) => x.id === body.inscriptionId);
    exceptionsRythme.push({
      id: randomUUID(),
      promotionId: p.id,
      apprenant: {
        inscriptionId: i.id,
        personneId: i.personne.id,
        nom: i.personne.nom,
        prenom: i.personne.prenom,
      },
      debut: body.debut,
      fin: body.fin,
      motif: body.motif ?? null,
      jours: genererFake(body.debut, body.fin),
    });
    return json(201, vueRythme(p));
  }
  return json(200, vueRythme(p));
}

// Scolarité (module 02) : promotions, groupes, inscriptions, affectations et salles en mémoire.
// Les règles (périodes, capacités, répartition, écarts) sont couvertes par le domaine et l'API.
const promotions = [];
const groupesScol = [];
const salles = [];
const affectationsScol = [];
const aujourdhuiFake = () => new Date().toISOString().slice(0, 10);
const actifCe = (p, jour) => p.debut <= jour && (p.fin === null || jour < p.fin);
const resumePromotion = (p) => {
  const actives = p.inscriptions.filter((i) => i.etat === 'inscrit');
  const parStatut = {
    initial: 0,
    apprenti: 0,
    apprenti_sans_employeur: 0,
    professionnalisation: 0,
    formation_continue: 0,
  };
  for (const i of actives) parStatut[i.statut] += 1;
  return {
    ...p,
    inscriptions: undefined,
    effectifs: { inscrits: actives.length, preinscrits: 0, parStatut },
    modifiable: true,
  };
};
const groupeDetail = (g) => ({
  ...g,
  effectif: promotions
    .flatMap((p) => p.inscriptions)
    .filter((i) => i.groupes.some((m) => m.groupeId === g.id && actifCe(m, aujourdhuiFake())))
    .length,
});
const detailPromotion = (p) => {
  const m = maquettes.get(p.version.id);
  return {
    ...resumePromotion(p),
    groupes: groupesScol.filter((g) => g.promotionIds.includes(p.id)).map(groupeDetail),
    inscriptions: p.inscriptions,
    options: [...new Set((m?.ues ?? []).flatMap((u) => (u.option ? [u.option] : [])))],
    changementVersion: false,
    versionsDisponibles: [],
  };
};
async function routeScolarite(path, request, json, response, url) {
  if (path === '/api/moi/formation') {
    const p = promotions[0];
    return json(200, {
      formations: p
        ? [
            {
              promotion: { id: p.id, libelle: p.libelle, anneeFormation: p.anneeFormation },
              option: null,
              maquette: detailMaquette(maquettes.get(p.version.id)),
            },
          ]
        : [],
    });
  }
  if (path === '/api/moi/enseignements') {
    const enseignements = affectationsScol.map((a) => {
      const p = promotions.find((x) => x.id === a.promotionId);
      const mod = maquettes.get(p.version.id).modules.find((x) => x.id === a.moduleId);
      return {
        affectationId: a.id,
        promotion: { id: p.id, libelle: p.libelle },
        module: { code: mod.code, intitule: mod.intitule },
        groupes: [],
        heures: a.heures,
        realisees: null,
      };
    });
    return json(200, {
      enseignements,
      totalHeures: enseignements.reduce(
        (s, e) => s + TYPES_H.reduce((x, t) => x + e.heures[t], 0),
        0,
      ),
    });
  }
  const salleRoute = path.match(/^\/api\/salles(?:\/([^/]+))?$/);
  if (salleRoute) {
    if (!salleRoute[1] && request.method === 'GET') {
      const min = Number(url.searchParams.get('capaciteMin') ?? 0);
      return json(200, { salles: salles.filter((s) => (s.capacite ?? 0) >= min), creation: true });
    }
    if (!salleRoute[1]) {
      const body = await readBody(request);
      const salle = {
        id: randomUUID(),
        capacite: null,
        type: 'cours',
        equipements: [],
        pmr: false,
        statut: 'disponible',
        ...body,
        modifiable: true,
      };
      salles.push(salle);
      return json(201, salle);
    }
    const salle = salles.find((s) => s.id === salleRoute[1]);
    Object.assign(salle, await readBody(request));
    return json(200, salle);
  }
  if (path === '/api/promotions/annee-suivante') {
    const body = await readBody(request);
    const sources = promotions.filter((p) => p.anneeScolaire.id === body.anneeSourceId);
    return json(200, {
      apercu: body.apercu,
      promotions: sources.map((p) => ({
        sourceId: p.id,
        libelle: p.libelle,
        version: p.version.numero,
        groupes: 0,
        affectations: 0,
        affectationsIgnorees: 0,
        existante: false,
      })),
      creees: body.apercu ? 0 : sources.length,
    });
  }
  const groupeRoute = path.match(/^\/api\/groupes\/([^/]+)\/(membres|retrait)$/);
  if (groupeRoute) {
    const body = await readBody(request);
    const g = groupesScol.find((x) => x.id === groupeRoute[1]);
    const date = body.date ?? aujourdhuiFake();
    for (const i of promotions.flatMap((p) => p.inscriptions)) {
      if (groupeRoute[2] === 'membres' && body.inscriptionIds.includes(i.id)) {
        for (const m of i.groupes) {
          const autre = groupesScol.find((x) => x.id === m.groupeId);
          if (autre.type === g.type && m.fin === null) m.fin = date;
        }
        i.groupes.push({ groupeId: g.id, debut: date, fin: null });
      }
      if (groupeRoute[2] === 'retrait' && i.id === body.inscriptionId) {
        for (const m of i.groupes) if (m.groupeId === g.id && m.fin === null) m.fin = date;
      }
    }
    return json(200, groupeDetail(g));
  }
  const affectationRoute = path.match(/^\/api\/affectations\/([^/]+)$/);
  if (affectationRoute && request.method === 'DELETE') {
    affectationsScol.splice(
      affectationsScol.findIndex((a) => a.id === affectationRoute[1]),
      1,
    );
    response.writeHead(204);
    return response.end();
  }
  const promo = path.match(
    /^\/api\/promotions(?:\/([^/]+))?(?:\/(inscriptions|groupes|repartition|affectations|passage))?$/,
  );
  if (!promo) return false;
  const [, id, sous] = promo;
  if (!id && request.method === 'GET') {
    const annee = url.searchParams.get('anneeScolaireId');
    return json(200, {
      promotions: promotions
        .filter((p) => !annee || p.anneeScolaire.id === annee)
        .map(resumePromotion),
      creation: true,
    });
  }
  if (!id) {
    const body = await readBody(request);
    const f = formations.find((x) => x.id === body.formationId);
    const annee = annees.find((a) => a.id === body.anneeScolaireId);
    const version = versionsDe(f.id)
      .filter((v) => v.statut === 'publiee')
      .at(-1);
    if (!version)
      return json(
        400,
        invalideRef(
          'versionId',
          'Une promotion suit une version publiée de la maquette : publiez d’abord la maquette de la formation.',
        ),
      );
    const p = {
      id: randomUUID(),
      libelle:
        body.libelle ??
        `${f.intitule} · ${body.anneeFormation === 1 ? '1re' : `${body.anneeFormation}e`} année · ${annee.libelle}`,
      formation: { id: f.id, intitule: f.intitule, dureeAnnees: f.dureeAnnees },
      version: { id: version.id, numero: version.numero },
      anneeFormation: body.anneeFormation,
      anneeScolaire: { id: annee.id, libelle: annee.libelle },
      etablissement: {
        id: body.etablissementId,
        nom: ecole.etablissements.find((e) => e.id === body.etablissementId)?.nom ?? '',
      },
      dateDebut: annee.dateDebut,
      dateFin: annee.dateFin,
      inscriptions: [],
    };
    promotions.push(p);
    return json(201, detailPromotion(p));
  }
  const p = promotions.find((x) => x.id === id);
  if (!p) return json(404, { message: 'Promotion introuvable.' });
  if (sous === 'inscriptions') {
    const body = await readBody(request);
    const personne = personnes.find((x) => x.id === body.personneId);
    const inscription = {
      id: randomUUID(),
      promotionId: p.id,
      personne: {
        id: personne.id,
        nom: personne.nom,
        prenom: personne.prenom,
        matricule: personne.matricule,
      },
      etat: body.etat ?? 'inscrit',
      dateEntree: body.dateEntree ?? p.dateDebut,
      dateSortie: null,
      motifSortie: null,
      option: body.option ?? null,
      statut: body.statut,
      statuts: [
        { debut: body.dateEntree ?? p.dateDebut, fin: null, statut: body.statut, echeance: null },
      ],
      groupes: [],
    };
    p.inscriptions.push(inscription);
    return json(201, inscription);
  }
  if (sous === 'groupes') {
    const body = await readBody(request);
    const g = {
      id: randomUUID(),
      libelle: body.libelle,
      type: body.type,
      capacite: body.capacite ?? null,
      option: body.option ?? null,
      promotionIds: [p.id],
    };
    groupesScol.push(g);
    return json(201, groupeDetail(g));
  }
  if (sous === 'repartition') {
    const body = await readBody(request);
    const sansGroupe = p.inscriptions.filter(
      (i) => !i.groupes.some((m) => body.groupeIds.includes(m.groupeId)),
    );
    const affectations = sansGroupe.map((i, rang) => ({
      inscriptionId: i.id,
      groupeId: body.groupeIds[rang % body.groupeIds.length],
    }));
    if (!body.apercu)
      for (const a of affectations)
        p.inscriptions
          .find((i) => i.id === a.inscriptionId)
          .groupes.push({ groupeId: a.groupeId, debut: body.date ?? aujourdhuiFake(), fin: null });
    return json(200, { affectations, nonAffectes: [], applique: !body.apercu });
  }
  if (sous === 'affectations') {
    if (request.method === 'POST') {
      const body = await readBody(request);
      const fiche = personnes.find((x) => x.id === body.personneId);
      const a = {
        id: randomUUID(),
        promotionId: p.id,
        moduleId: body.moduleId,
        intervenant: {
          id: body.personneId,
          nom: fiche?.nom ?? 'Fictive',
          prenom: fiche?.prenom ?? 'Camille',
        },
        groupeIds: body.groupeIds ?? [],
        heures: { ...heuresVides(), ...body.heures },
      };
      affectationsScol.push(a);
      return json(201, a);
    }
    const m = maquettes.get(p.version.id);
    const siennes = affectationsScol.filter((a) => a.promotionId === p.id);
    return json(200, {
      affectations: siennes,
      modules: m.modules.map((mod) => {
        const affecte = heuresVides();
        for (const a of siennes.filter((x) => x.moduleId === mod.id))
          for (const t of TYPES_H) affecte[t] += a.heures[t];
        return {
          id: mod.id,
          code: mod.code,
          intitule: mod.intitule,
          ueCode: m.ues.find((u) => u.id === mod.ueId)?.code ?? '',
          prevu: mod.heures,
          affecte,
          ecarts: TYPES_H.filter((t) => affecte[t] !== mod.heures[t]).map((t) => ({
            type: t,
            prevu: mod.heures[t],
            affecte: affecte[t],
            ecart: affecte[t] - mod.heures[t],
          })),
        };
      }),
      modifiable: true,
    });
  }
  return json(200, detailPromotion(p));
}

// Emploi du temps (module 04) : séances en mémoire, conflits de salle et de groupe seulement.
// La détection complète (RG-04-05), les séries et la publication sont testées par le domaine et
// l'API ; la fausse API suit leurs contrats.
const seancesEdt = [];
const FUSEAU_EDT = 'Europe/Paris';
const jourLocal = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU_EDT }).format(new Date(iso));
const promotionsDeSeance = (s) => [
  ...new Set([
    ...s.promotionIds,
    ...groupesScol.filter((g) => s.groupeIds.includes(g.id)).flatMap((g) => g.promotionIds),
  ]),
];
const chevauche = (a, b) =>
  a.id !== b.id &&
  b.statut !== 'annulee' &&
  b.statut !== 'reportee' &&
  Date.parse(a.debut) < Date.parse(b.fin) &&
  Date.parse(b.debut) < Date.parse(a.fin);
const conflitsEdt = (s) =>
  seancesEdt
    .filter((autre) => chevauche(s, autre))
    .flatMap((autre) => {
      const conflits = [];
      if (s.salleId && s.salleId === autre.salleId)
        conflits.push({ code: 'salle-occupee', niveau: 'bloquant', seanceId: autre.id });
      const communs = promotionsDeSeance(s).filter((p) => promotionsDeSeance(autre).includes(p));
      if (communs.length > 0)
        conflits.push({
          code: 'groupe-occupe',
          niveau: 'bloquant',
          seanceId: autre.id,
          groupeIds: communs,
          apprenantIds: [],
        });
      return conflits;
    });
const libelleSeance = (s) =>
  s.moduleId
    ? ([...maquettes.values()].flatMap((m) => m.modules).find((m) => m.id === s.moduleId)
        ?.intitule ?? 'Module')
    : (s.activite ?? 'Activité');
const actifEdt = (s) => s.statut === 'brouillon' || s.statut === 'publiee';
const vueSeance = (s) => ({
  reporteeVersId: null,
  modifieeLe: null,
  ...s,
  libelle: libelleSeance(s),
  conflits: actifEdt(s) ? conflitsEdt(s) : [],
  modifiable: actifEdt(s),
});
const CHAMPS_SEANCE = [
  'type',
  'moduleId',
  'activite',
  'promotionIds',
  'groupeIds',
  'intervenantIds',
  'salleId',
  'lienVisio',
  'distanciel',
];
const contenuSeance = (body) => ({
  type: body.type ?? 'cm',
  moduleId: body.moduleId ?? null,
  activite: body.activite ?? null,
  promotionIds: body.promotionIds ?? [],
  groupeIds: body.groupeIds ?? [],
  intervenantIds: body.intervenantIds ?? [],
  salleId: body.salleId ?? null,
  lienVisio: body.lienVisio ?? null,
  distanciel: body.distanciel ?? false,
});
/** RG-04-06 : un forçage vise un conflit présent et porte un motif. */
const forcer = (s, forcages = []) => {
  const conflits = conflitsEdt(s);
  for (const f of forcages) {
    if (!conflits.some((c) => c.code === f.code && c.seanceId === f.seanceId))
      return 'Ce conflit n’existe pas (ou plus) pour cette séance.';
    if (!f.motif?.trim()) return 'Donnez le motif du forçage.';
  }
  for (const f of forcages)
    if (!s.forcages.some((d) => d.code === f.code && d.seanceId === f.seanceId))
      s.forcages.push({ code: f.code, seanceId: f.seanceId, motif: f.motif.trim() });
  return null;
};
const bloquee = (s) =>
  vueSeance(s).conflits.some(
    (c) => !s.forcages.some((f) => f.code === c.code && f.seanceId === c.seanceId),
  );
const occurrencesSerie = (body) => {
  const occurrences = [];
  const debut = Date.parse(`${body.dateDebut}T00:00:00Z`);
  const lundi = debut - ((new Date(debut).getUTCDay() + 6) % 7) * 86_400_000;
  for (let n = debut; n <= Date.parse(`${body.dateFin}T00:00:00Z`); n += 86_400_000) {
    const jour = new Date(n).toISOString().slice(0, 10);
    const iso = ((new Date(n).getUTCDay() + 6) % 7) + 1;
    const semaine = Math.floor((n - lundi) / (7 * 86_400_000));
    if (!body.joursSemaine.includes(iso) || semaine % (body.intervalleSemaines ?? 1) !== 0)
      continue;
    // Heure d'été de Paris approchée : la vraie conversion est testée par le domaine.
    const decalage = new Date(`${jour}T12:00:00Z`).toLocaleString('en-GB', {
      timeZone: FUSEAU_EDT,
      hour: '2-digit',
      hourCycle: 'h23',
    });
    const heures = Number(decalage) - 12;
    const instant = (h) =>
      new Date(Date.parse(`${jour}T${h}:00Z`) - heures * 3_600_000).toISOString();
    occurrences.push({ jour, debut: instant(body.heureDebut), fin: instant(body.heureFin) });
  }
  return occurrences;
};

// Fond de la grille : jours en entreprise d'après le calendrier de rythme, disponibilités fixes
// de tout intervenant (lundi 08:00-12:00, la saisie arrivant avec E-04-07), modules à placer.
const DISPONIBILITES_FAKE = {
  creneaux: [{ jourSemaine: 1, heureDebut: '08:00', heureFin: '12:00' }],
};
function fondEdt(p, debut) {
  const promos = p.get('promotionId')
    ? promotions.filter((x) => x.id === p.get('promotionId'))
    : p.get('groupeId')
      ? promotions.filter((x) =>
          groupesScol.find((g) => g.id === p.get('groupeId'))?.promotionIds.includes(x.id),
        )
      : [];
  const publics = [...promos.map((x) => x.id), ...(p.get('groupeId') ? [p.get('groupeId')] : [])];
  const jours = [0, 1, 2, 3, 4, 5, 6].map((n) => {
    const jour = new Date(Date.parse(`${debut}T00:00:00Z`) + n * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return {
      jour,
      fermeture: null,
      entreprise:
        promos.length > 0 &&
        promos.every((x) => calendriersRythme.get(x.id)?.jours[jour] === 'entreprise'),
    };
  });
  const placees = seancesEdt.filter(
    (s) =>
      (s.statut === 'brouillon' || s.statut === 'publiee') &&
      [...s.promotionIds, ...s.groupeIds].some((id) => publics.includes(id)),
  );
  const aPlacer = promos
    .flatMap((x) => maquettes.get(x.version.id)?.modules ?? [])
    .flatMap((mod) =>
      ['cm', 'td', 'tp', 'projet', 'examen'].flatMap((type) => {
        const prevuMinutes = (mod.heures?.[type] ?? 0) * 60;
        const planifieMinutes = placees
          .filter((s) => s.moduleId === mod.id && s.type === type)
          .reduce((t, s) => t + (Date.parse(s.fin) - Date.parse(s.debut)) / 60_000, 0);
        return prevuMinutes > 0 || planifieMinutes > 0
          ? [
              {
                moduleId: mod.id,
                code: mod.code,
                intitule: mod.intitule,
                type,
                prevuMinutes,
                planifieMinutes,
                restantMinutes: prevuMinutes - planifieMinutes,
              },
            ]
          : [];
      }),
    );
  return {
    jours,
    disponibilites: p.get('intervenantId')
      ? { ...DISPONIBILITES_FAKE, indisponibilites: [] }
      : null,
    aPlacer: promos.length > 0 ? aPlacer : null,
  };
}

async function routeEdt(path, request, json, url) {
  if (path === '/api/edt/semaine') {
    const p = url.searchParams;
    const debut = p.get('debut');
    const fin = new Date(Date.parse(`${debut}T00:00:00Z`) + 6 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const retenues = seancesEdt.filter((s) => {
      const jour = jourLocal(s.debut);
      return (
        jour >= debut &&
        jour <= fin &&
        (!p.get('promotionId') || promotionsDeSeance(s).includes(p.get('promotionId'))) &&
        (!p.get('groupeId') || s.groupeIds.includes(p.get('groupeId'))) &&
        (!p.get('salleId') || s.salleId === p.get('salleId')) &&
        (!p.get('intervenantId') || s.intervenantIds.includes(p.get('intervenantId')))
      );
    });
    return json(200, {
      debut,
      fin,
      fuseau: FUSEAU_EDT,
      plage: (
        ecole.etablissements.find((e) => e.id === p.get('etablissementId')) ??
        ecole.etablissements[0]
      ).edt,
      seances: retenues.map(vueSeance),
      creation: true,
      ...fondEdt(p, debut),
    });
  }
  if (path === '/api/edt/verification') {
    const body = await readBody(request);
    const candidate = {
      ...contenuSeance(body),
      id: body.id ?? '',
      debut: body.debut,
      fin: body.fin,
    };
    const conflits = conflitsEdt(candidate);
    const occupees = new Set(
      seancesEdt.filter((s) => chevauche(candidate, s)).map((s) => s.salleId),
    );
    const autres = seancesEdt.filter((s) => chevauche(candidate, s));
    return json(200, {
      conflits,
      sallesLibres: conflits.some((c) => c.code === 'salle-occupee')
        ? salles
            .filter(
              (s) => s.type !== 'virtuelle' && s.statut === 'disponible' && !occupees.has(s.id),
            )
            .map((s) => ({ id: s.id, nom: s.nom, capacite: s.capacite ?? 0, type: s.type }))
        : [],
      creneauxLibres: conflits.some((c) => c.code === 'groupe-occupe')
        ? [
            {
              debut: new Date(Math.max(...autres.map((s) => Date.parse(s.fin)))).toISOString(),
              fin: new Date(
                Math.max(...autres.map((s) => Date.parse(s.fin))) +
                  Date.parse(body.fin) -
                  Date.parse(body.debut),
              ).toISOString(),
            },
          ]
        : [],
    });
  }
  if (path === '/api/edt/seances' && request.method === 'POST') {
    const body = await readBody(request);
    const s = {
      id: randomUUID(),
      ...contenuSeance(body),
      debut: body.debut,
      fin: body.fin,
      statut: 'brouillon',
      motifAnnulation: null,
      serieId: null,
      forcages: [],
    };
    const refus = forcer(s, body.forcages);
    if (refus) return json(400, invalideRef('forcages', refus));
    seancesEdt.push(s);
    return json(201, vueSeance(s));
  }
  const seanceRoute = path.match(
    /^\/api\/edt\/seances\/([^/]+)(\/annulation|\/report|\/remplacement)?$/,
  );
  if (seanceRoute) {
    const s = seancesEdt.find((x) => x.id === seanceRoute[1]);
    if (!s) return json(404, { message: 'Séance introuvable.' });
    const body = await readBody(request);
    const maintenant = new Date().toISOString();
    // US-04-11 : report vers une séance de remplacement publiée, refusé en conflit bloquant.
    if (seanceRoute[2] === '/report') {
      const nouvelle = {
        ...s,
        id: randomUUID(),
        debut: body.debut,
        fin: body.fin,
        salleId: body.salleId !== undefined ? body.salleId : s.salleId,
        serieId: null,
        forcages: [],
        modifieeLe: maintenant,
      };
      seancesEdt.push(nouvelle);
      Object.assign(s, { statut: 'reportee' });
      if (bloquee(nouvelle)) {
        seancesEdt.pop();
        Object.assign(s, { statut: 'publiee' });
        return json(409, {
          message:
            'Des conflits bloquants empêchent la publication. Corrigez-les, ou faites-les forcer par un responsable, puis réessayez.',
        });
      }
      Object.assign(s, {
        motifAnnulation: body.motif,
        reporteeVersId: nouvelle.id,
        modifieeLe: maintenant,
      });
      return json(200, { seances: [s, nouvelle].map(vueSeance) });
    }
    if (seanceRoute[2] === '/remplacement') {
      s.intervenantIds = s.intervenantIds
        .map((id) => (id === body.ancienId ? body.nouveauId : id))
        .sort();
      return json(200, { seances: [vueSeance(s)] });
    }
    const portee =
      s.serieId && body.portee === 'serie'
        ? seancesEdt.filter((x) => x.serieId === s.serieId)
        : s.serieId && body.portee === 'suivantes'
          ? seancesEdt.filter((x) => x.serieId === s.serieId && x.debut >= s.debut)
          : [s];
    if (seanceRoute[2]) {
      for (const x of portee) Object.assign(x, { statut: 'annulee', motifAnnulation: body.motif });
    } else {
      for (const x of portee)
        for (const champ of CHAMPS_SEANCE) if (champ in body) x[champ] = body[champ];
      if (body.debut) Object.assign(s, { debut: body.debut, fin: body.fin });
      const refus = forcer(s, body.forcages);
      if (refus) return json(400, invalideRef('forcages', refus));
    }
    return json(200, { seances: portee.map(vueSeance) });
  }
  if (path === '/api/edt/publication') {
    const { seanceIds } = await readBody(request);
    const choisies = seancesEdt.filter((s) => seanceIds.includes(s.id));
    const bloquees = choisies.filter(bloquee);
    if (bloquees.length > 0)
      return json(409, {
        message: `Publication impossible : ${bloquees.map(libelleSeance).join(', ')} ont un conflit bloquant non forcé. Résolvez-le ou forcez-le, puis publiez.`,
      });
    for (const s of choisies) s.statut = 'publiee';
    return json(200, { seances: choisies.map(vueSeance) });
  }
  if (path === '/api/edt/series/apercu' || path === '/api/edt/series') {
    const body = await readBody(request);
    const occurrences = occurrencesSerie(body);
    if (path.endsWith('/apercu')) return json(200, { occurrences, sautees: [] });
    const serieId = randomUUID();
    const creees = occurrences.map((o) => ({
      id: randomUUID(),
      ...contenuSeance(body),
      debut: o.debut,
      fin: o.fin,
      statut: 'brouillon',
      motifAnnulation: null,
      serieId,
      forcages: [],
    }));
    seancesEdt.push(...creees);
    return json(201, { serieId, seances: creees.map(vueSeance), sautees: [] });
  }
  return false;
}

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
            'audit:lire',
            'apprenants:inviter',
            'comptes:desactiver',
            'corbeille:restaurer',
            'personnel:inviter',
            'personnes:exporter',
            'personnes:importer',
            'personnes:lire',
            'calendrier:gerer',
            'calendrier:lire',
            'emargement:animer',
            'edt:forcer',
            'edt:gerer',
            'edt:lire',
            'organisation:lire',
            'organisation:modifier',
            'affectations:gerer',
            'contrats:gerer',
            'contrats:lire',
            'entreprises:gerer',
            'entreprises:lire',
            'rythmes:gerer',
            'rythmes:lire',
            'promotions:gerer',
            'promotions:lire',
            'salles:gerer',
            'salles:lire',
            'referentiel:gerer',
            'referentiel:lire',
            'referentiel:parametrer',
            'referentiel:publier',
            'roles:attribuer',
            'roles:gerer',
          ]
        : [],
      modules: active
        ? ['socle', 'emargement', 'referentiel', 'alternance', 'emplois-du-temps']
        : [],
      doubleAuthentificationExigee: user.doubleAuthentificationExigee === true,
      doubleAuthentificationActive: user.twoFactorEnabled === true,
      apparence: active ? detailApparence() : null,
      parcours: { apprenant: active !== null, intervenant: active !== null },
    });
  }

  // Assistant d'import (E-01-06) : analyse simplifiée, le contrôle réel est testé par l'API.
  const importRoute = path.match(
    /^\/api\/imports(?:\/([^/]+))?(\/correspondance|\/validation|\/annulation)?$/,
  );
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
    if (importRoute[2] === '/validation') {
      const { mode } = await readBody(request);
      const apercu = apercuImport(enCours);
      if (mode === 'tout' && apercu.totaux.enErreur > 0)
        return json(400, { message: 'Le fichier contient des lignes en erreur.', details: [] });
      enCours.statut = 'valide';
      enCours.bilan = {
        crees: apercu.totaux.valides,
        modifies: 0,
        rejetes: apercu.totaux.enErreur,
        valideLe: new Date().toISOString(),
        annulable: true,
      };
    }
    if (importRoute[2] === '/annulation') enCours.statut = 'annule';
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

  // Photos (US-01-20) : le recadrage réel est testé par l'API.
  const photoRoute = path.match(/^\/api\/personnes\/([^/]+)\/photo$/);
  if (photoRoute) {
    const p = personnes.find((x) => x.id === photoRoute[1]);
    if (!p) return json(404, { message: 'Personne introuvable dans cette école.' });
    if (request.method === 'PUT') {
      p.photoContenu = await lireCorps(request);
      p.photoType = request.headers['content-type'];
      p.photoVersion = randomUUID().slice(0, 8);
      return json(200, detailPersonne(p));
    }
    response.writeHead(200, { 'content-type': p.photoType ?? 'image/png' });
    return response.end(p.photoContenu);
  }
  // Import par archive : la vraie API décompresse ; ici, un bilan fixe pour toute archive ZIP.
  if (path === '/api/photos/import' && request.method === 'POST') {
    const archive = await lireCorps(request);
    if (archive.subarray(0, 2).toString() !== 'PK') {
      return json(400, {
        message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
        details: ['photo : Cette archive est illisible. Créez-la de nouveau au format ZIP.'],
      });
    }
    return json(200, {
      associees: 2,
      sansCorrespondance: ['INCONNU-42.jpg'],
      rejetes: [{ fichier: 'abimee.jpg', motif: 'Seuls les formats JPEG et PNG sont acceptés.' }],
    });
  }
  // Émargement : une séance fictive en cours, deux attendus ; le code 123456 est accepté.
  if (path === '/api/seances' || path === '/api/moi/seances') {
    return json(200, [seanceFictive()]);
  }
  if (path === `/api/seances/${SEANCE_ID}/appel/ouverture` && request.method === 'POST') {
    const s = seanceFictive();
    return json(200, {
      seanceId: SEANCE_ID,
      libelle: s.libelle,
      debut: s.debut,
      fin: s.fin,
      cle: Buffer.alloc(32, 3).toString('base64url'),
      periodeSecondes: 15,
      maintenant: new Date().toISOString(),
    });
  }
  if (path === `/api/seances/${SEANCE_ID}/appel`) {
    const liste = [
      {
        personneId: '0192f0a4-1b2c-7d3e-8f40-000000000001',
        nom: 'Martin',
        prenom: 'Léa',
        scanneLe: emargementLea,
        rejoue: false,
      },
      {
        personneId: '0192f0a4-1b2c-7d3e-8f40-000000000002',
        nom: 'Petit',
        prenom: 'Noé',
        scanneLe: null,
        rejoue: false,
      },
    ];
    return json(200, { presents: liste.filter((l) => l.scanneLe).length, attendus: 2, liste });
  }
  if (path === '/api/emargement/code' && request.method === 'POST') {
    const { code } = await readBody(request);
    if (code !== '123456') {
      return json(400, {
        message: 'Ce code n’est pas le bon : saisissez celui affiché maintenant.',
      });
    }
    emargementLea ??= new Date().toISOString();
    return json(200, {
      statut: 'present',
      seance: seanceFictive().libelle,
      scanneLe: emargementLea,
      retardMinutes: 0,
      rejoue: false,
    });
  }
  if (path === '/api/moi/photo') {
    if (!user) return json(401, { message: 'Session absente' });
    if (request.method === 'PUT') {
      maPhoto.contenu = await lireCorps(request);
      maPhoto.statut = 'en_attente';
    }
    return json(200, {
      url: null,
      attenteUrl: maPhoto.contenu ? '/api/moi/photo/image?attente=1' : null,
      statut: maPhoto.statut,
      motif: null,
    });
  }

  // Corbeille (E-01-10) : fiches supprimées par les tests.
  if (path === '/api/corbeille') {
    if (!user) return json(401, { message: 'Session absente' });
    return json(200, {
      elements: corbeille.map((p) => ({
        type: 'personne',
        id: p.id,
        libelle: `${p.prenom} ${p.nom}`,
        supprimeLe: p.supprimeLe,
        supprimePar: 'Camille Fictive',
        effacementLe: new Date(Date.parse(p.supprimeLe) + 30 * 86_400_000).toISOString(),
        lies: 0,
      })),
    });
  }
  const restauration = path.match(/^\/api\/corbeille\/personne\/([^/]+)\/restauration$/);
  if (restauration) {
    const rang = corbeille.findIndex((p) => p.id === restauration[1]);
    if (rang < 0) return json(404, { message: 'Élément introuvable dans la corbeille.' });
    const [element] = corbeille.splice(rang, 1);
    personnes.push(Object.fromEntries(Object.entries(element).filter(([k]) => k !== 'supprimeLe')));
    response.writeHead(204);
    return response.end();
  }

  // Journal d'audit (E-01-08) : deux événements fixes.
  if (path === '/api/audit') {
    if (!user) return json(401, { message: 'Session absente' });
    const action = url.searchParams.get('action') ?? '';
    const evenements = [
      {
        id: '01a10000-0000-7000-8000-0000000000d2',
        survenuLe: '2026-10-05T10:15:00.000Z',
        auteur: { id: USERS.camille.id, nom: 'Camille Fictive' },
        adresseIp: '203.0.113.7',
        action: 'personne.modifier',
        objetType: 'personne',
        objetId: personnes[0].id,
        avant: { telephone: null },
        apres: { telephone: '06 00 00 00 01' },
      },
      {
        id: '01a10000-0000-7000-8000-0000000000d1',
        survenuLe: '2026-10-04T08:00:00.000Z',
        auteur: { id: USERS.camille.id, nom: 'Camille Fictive' },
        adresseIp: '203.0.113.7',
        action: 'role.attribuer',
        objetType: 'personne',
        objetId: personnes[0].id,
        avant: null,
        apres: { role: 'Scolarité' },
      },
    ].filter((e) => e.action.startsWith(action));
    return json(200, { evenements, suivant: null });
  }

  // Actions en masse et export (E-01-04).
  if (path === '/api/personnes/actions' && request.method === 'POST') {
    const { action, personneIds } = await readBody(request);
    const echecs = [];
    for (const id of personneIds) {
      const p = personnes.find((x) => x.id === id);
      if (!p) continue;
      if (action === 'inviter' && p.compteEtat === 'actif') {
        echecs.push({ personneId: id, nom: `${p.prenom} ${p.nom}`, message: 'Compte déjà actif.' });
        continue;
      }
      p.compteEtat = { inviter: 'invite', desactiver: 'desactive', reactiver: 'actif' }[action];
    }
    return json(200, { reussies: personneIds.length - echecs.length, echecs });
  }
  if (path === '/api/personnes/export') {
    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="personnes.csv"',
    });
    return response.end('"Nom";"Prénom"\r\n"Fictive";"Camille"\r\n');
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
    if (request.method === 'DELETE') {
      personnes.splice(personnes.indexOf(fiche), 1);
      corbeille.push({ ...fiche, supprimeLe: new Date().toISOString() });
      response.writeHead(204);
      return response.end();
    }
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

  if (
    [
      '/api/promotions',
      '/api/groupes/',
      '/api/salles',
      '/api/affectations/',
      '/api/moi/formation',
      '/api/moi/enseignements',
    ].some((p) => path.startsWith(p))
  ) {
    if (!user) return json(401, { message: 'Session absente' });
    const traite = await routeScolarite(path, request, json, response, url);
    if (traite !== false) return traite;
  }

  if (path.startsWith('/api/edt/')) {
    if (!user) return json(401, { message: 'Session absente' });
    const traite = await routeEdt(path, request, json, url);
    if (traite !== false) return traite;
  }

  if (
    path.startsWith('/api/rythmes/') ||
    path.startsWith('/api/exceptions-rythme/') ||
    /^\/api\/promotions\/[^/]+\/rythme/.test(path)
  ) {
    if (!user) return json(401, { message: 'Session absente' });
    const traite = await routeRythmes(path, request, json);
    if (traite !== false) return traite;
  }

  if (['/api/contrats', '/api/conventions-stage'].some((p) => path.startsWith(p))) {
    if (!user) return json(401, { message: 'Session absente' });
    const traite = await routeContrats(path, request, json, response, url);
    if (traite !== false) return traite;
  }

  if (
    ['/api/opcos', '/api/entreprises', '/api/contacts-entreprise/'].some((p) => path.startsWith(p))
  ) {
    if (!user) return json(401, { message: 'Session absente' });
    const traite = await routeAlternance(path, request, json, response, url);
    if (traite !== false) return traite;
  }

  if (
    path.startsWith('/api/formations') ||
    path.startsWith('/api/maquettes/') ||
    path.startsWith('/api/referentiel/')
  ) {
    if (!user) return json(401, { message: 'Session absente' });
    const traite = await routeReferentiel(path, request, json, response, url);
    if (traite !== false) return traite;
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
        edt: { ...PLAGE_EDT },
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
      if (body.edt && body.edt.fin <= body.edt.debut)
        return json(400, {
          message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
          details: ['edt.fin : La fin de journée doit suivre le début.'],
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

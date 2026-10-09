import { interpreterDate } from '../imports/personnes.js';
import type { TableauLu } from '../imports/csv.js';
import { normaliserNom } from '../personnes/doublons.js';
import { instantLocal } from './recurrence.js';

/**
 * Import d'un emploi du temps (US-04-04, US-04-05 ; RG-04-08 à RG-04-12) : lecture d'un tableur
 * (modèle Scolaly, exports Hyperplanning, Celcat ou ADE reconnus par leurs en-têtes) ou d'un
 * fichier iCal, puis rapprochement des libellés et empreinte du contenu importé. Les séances lues
 * gardent leur identifiant externe (colonne dédiée ou UID iCal) ; à défaut, un identifiant est
 * calculé à partir du créneau, du module et du public, pour qu'un réimport identique ne crée rien.
 */
export const COLONNES_EDT = [
  'Date',
  'Début',
  'Fin',
  'Module',
  'Groupes',
  'Intervenants',
  'Salle',
  'Type',
  'Identifiant',
] as const;

/** RG-04-08 : au plus autant de séances par fichier (un semestre en compte environ 2 000). */
export const IMPORT_EDT_SEANCES_MAX = 5000;
/** Garde-fou : occurrences d'un événement iCal répété. */
const OCCURRENCES_MAX = 366;

export const TYPES_SEANCE_IMPORT = ['cm', 'td', 'tp', 'projet', 'examen'] as const;
export type TypeSeanceImport = (typeof TYPES_SEANCE_IMPORT)[number];

export interface SeanceImportee {
  /** Ligne du tableur (en-tête = 1) ou rang de l'événement iCal (à partir de 1). */
  ligne: number;
  identifiant: string;
  debut: Date;
  fin: Date;
  /** Code ou intitulé du module, ou activité hors maquette. */
  module: string;
  /** Promotions ou groupes. */
  publics: string[];
  /** Emails ou noms. */
  intervenants: string[];
  salle: string | null;
  type: TypeSeanceImport;
}

export interface MessageImport {
  ligne: number | null;
  message: string;
}

export interface LectureImportEdt {
  seances: SeanceImportee[];
  erreurs: MessageImport[];
  avertissements: MessageImport[];
}

type Champ =
  | 'date'
  | 'debut'
  | 'fin'
  | 'duree'
  | 'module'
  | 'publics'
  | 'intervenants'
  | 'salle'
  | 'type'
  | 'identifiant';

/**
 * En-têtes reconnus (forme normalisée) : modèle Scolaly, puis exports courants d'Hyperplanning
 * (Heure, Durée, Matière, Enseignant, Promotion), de Celcat (Start, End, Staff, Groups, Room) et
 * d'ADE (Activité, Formation).
 */
const ALIAS: Record<Champ, readonly string[]> = {
  date: ['date', 'jour', 'date de debut'],
  debut: ['debut', 'heure de debut', 'heure debut', 'heure', 'start', 'start time', 'de'],
  fin: ['fin', 'heure de fin', 'heure fin', 'end', 'end time', 'a'],
  duree: ['duree', 'duration'],
  module: [
    'module',
    'code module',
    'matiere',
    'enseignement',
    'cours',
    'activite',
    'module code',
    'subject',
  ],
  publics: [
    'groupes',
    'groupe',
    'promotion',
    'promotions',
    'public',
    'td',
    'formation',
    'groups',
    'group',
  ],
  intervenants: [
    'intervenants',
    'intervenant',
    'enseignant',
    'enseignants',
    'professeur',
    'staff',
    'formateur',
  ],
  salle: ['salle', 'salles', 'room', 'rooms', 'lieu'],
  type: ['type', 'type de seance', 'nature', 'type d enseignement'],
  identifiant: ['identifiant', 'identifiant externe', 'id', 'uid', 'event id', 'reference'],
};

const LIBELLES_CHAMPS: Partial<Record<Champ, string>> = {
  date: 'Date',
  debut: 'Début',
  module: 'Module',
  publics: 'Groupes',
};

/** Type lu (« CM », « Travaux dirigés », « Partiel »…) ; vide : cours magistral. */
export function lireTypeSeance(saisie: string): TypeSeanceImport | null {
  const forme = normaliserNom(saisie);
  if (forme === '') return 'cm';
  if (['cm', 'cours', 'cours magistral', 'magistral', 'amphi', 'conference'].includes(forme))
    return 'cm';
  if (['td', 'travaux diriges', 'tutorat'].includes(forme)) return 'td';
  if (['tp', 'travaux pratiques', 'atelier'].includes(forme)) return 'tp';
  if (['projet', 'project', 'pro'].includes(forme)) return 'projet';
  if (
    ['examen', 'exam', 'partiel', 'controle', 'ds', 'evaluation', 'soutenance', 'epreuve'].includes(
      forme,
    )
  )
    return 'examen';
  return null;
}

/** Heure lue : « 8:30 », « 08h30 », « 8h », « 08:30:00 » ou fraction de jour Excel ; en minutes. */
export function lireHeure(saisie: string): number | null {
  const valeur = saisie.trim().toLowerCase();
  const hm = /^(\d{1,2})\s*[:h]\s*(\d{2})?(?::\d{2})?$/.exec(valeur);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2] ?? '0');
    return h < 24 && m < 60 ? h * 60 + m : null;
  }
  if (/^0?[.,]\d+$/.test(valeur)) {
    const minutes = Math.round(Number(valeur.replace(',', '.')) * 1440);
    return minutes < 1440 ? minutes : null;
  }
  return null;
}

/** Durée lue : « 1h30 », « 01:30 », « 90 min » ou « 1,5 » (heures) ; en minutes. */
function lireDuree(saisie: string): number | null {
  const valeur = saisie.trim().toLowerCase().replace(/\s/g, '');
  const minutesSeules = /^(\d+)(?:min|mn)$/.exec(valeur);
  if (minutesSeules) return Number(minutesSeules[1]);
  const hm = /^(\d{1,2})[:h](\d{2})?$/.exec(valeur);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? '0');
  const heures = Number(valeur.replace(',', '.'));
  return valeur !== '' && Number.isFinite(heures) && heures > 0 ? Math.round(heures * 60) : null;
}

const enHeure = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Liste séparée par des virgules, points-virgules, barres verticales ou retours à la ligne. */
export function decouper(valeur: string): string[] {
  return [
    ...new Set(
      valeur
        .split(/[,;\n|]+/)
        .map((v) => v.trim())
        .filter((v) => v !== ''),
    ),
  ];
}

/** Identifiant calculé quand le fichier n'en fournit pas (RG-04-11). */
function identifiantCalcule(s: Omit<SeanceImportee, 'ligne' | 'identifiant'>): string {
  const publics = s.publics.map(normaliserNom).sort().join(',');
  return `auto:${s.debut.toISOString()}|${s.fin.toISOString()}|${normaliserNom(s.module)}|${publics}`;
}

const tropDeSeances = (n: number): MessageImport => ({
  ligne: null,
  message: `Le fichier contient ${String(n)} séances : ${String(IMPORT_EDT_SEANCES_MAX)} au plus. Découpez-le par période.`,
});

/** Retire les identifiants en double (la seconde ligne est une erreur). */
function sansDoublon(lecture: LectureImportEdt): LectureImportEdt {
  const vus = new Map<string, number>();
  const seances: SeanceImportee[] = [];
  for (const s of lecture.seances) {
    const premiere = vus.get(s.identifiant);
    if (premiere === undefined) {
      vus.set(s.identifiant, s.ligne);
      seances.push(s);
    } else {
      lecture.erreurs.push({
        ligne: s.ligne,
        message: `Cette séance figure déjà ligne ${String(premiere)} (même identifiant).`,
      });
    }
  }
  return { ...lecture, seances };
}

/** RG-04-08 : lit un tableur, une séance par ligne, horaires dans le fuseau de l'établissement. */
export function lireImportEdt(tableau: TableauLu, fuseau: string): LectureImportEdt {
  const positions = new Map<Champ, number>();
  tableau.colonnes.forEach((colonne, index) => {
    const forme = normaliserNom(colonne);
    for (const [champ, alias] of Object.entries(ALIAS) as [Champ, readonly string[]][])
      if (alias.includes(forme) && !positions.has(champ)) positions.set(champ, index);
  });
  const lecture: LectureImportEdt = { seances: [], erreurs: [], avertissements: [] };
  const manquantes = (['date', 'debut', 'module', 'publics'] as const).filter(
    (c) => !positions.has(c),
  );
  if (!positions.has('fin') && !positions.has('duree')) manquantes.push('fin' as never);
  if (manquantes.length > 0) {
    const noms = manquantes.map((c) => LIBELLES_CHAMPS[c] ?? 'Fin');
    lecture.erreurs.push({
      ligne: 1,
      message: `Colonne${noms.length > 1 ? 's' : ''} absente${noms.length > 1 ? 's' : ''} : ${noms.join(', ')}. Reprenez le modèle à télécharger.`,
    });
    return lecture;
  }
  if (tableau.lignes.length > IMPORT_EDT_SEANCES_MAX) {
    lecture.erreurs.push(tropDeSeances(tableau.lignes.length));
    return lecture;
  }
  tableau.lignes.forEach((cellules, index) => {
    const ligne = index + 2;
    const lire = (champ: Champ) => {
      const position = positions.get(champ);
      return position === undefined ? '' : (cellules[position] ?? '').trim();
    };
    const erreur = (message: string) => lecture.erreurs.push({ ligne, message });
    // Une date Excel avec heure arrive en « AAAA-MM-JJTHH:MM ».
    const [brute = '', heureDansDate] = lire('date').split(/[T ]/);
    const jour = interpreterDate(brute);
    if (!jour) return erreur(`Date illisible : « ${lire('date')} ». Attendu : JJ/MM/AAAA.`);
    const debut = lireHeure(lire('debut') || (heureDansDate ?? ''));
    if (debut === null) return erreur(`Heure de début illisible : « ${lire('debut')} ».`);
    let fin = positions.has('fin') && lire('fin') !== '' ? lireHeure(lire('fin')) : null;
    if (fin === null && positions.has('duree')) {
      const duree = lireDuree(lire('duree'));
      fin = duree === null ? null : debut + duree;
    }
    if (fin === null || fin >= 1440)
      return erreur(`Heure de fin ou durée illisible : « ${lire('fin') || lire('duree')} ».`);
    if (fin <= debut) return erreur('L’heure de fin doit suivre l’heure de début.');
    const module = lire('module');
    if (module === '') return erreur('Indiquez le module ou l’activité.');
    const type = lireTypeSeance(lire('type'));
    if (!type)
      return erreur(
        `Type inconnu : « ${lire('type')} ». Types reconnus : CM, TD, TP, projet, examen.`,
      );
    const contenu = {
      debut: instantLocal(jour.date, enHeure(debut), fuseau),
      fin: instantLocal(jour.date, enHeure(fin), fuseau),
      module,
      publics: decouper(lire('publics')),
      intervenants: decouper(lire('intervenants')),
      salle: lire('salle') || null,
      type,
    };
    const identifiant = lire('identifiant');
    lecture.seances.push({
      ligne,
      identifiant: identifiant || identifiantCalcule(contenu),
      ...contenu,
    });
  });
  return sansDoublon(lecture);
}

// ——— iCal (RFC 5545) ———

interface Propriete {
  nom: string;
  parametres: Record<string, string>;
  valeur: string;
}

/** Lignes dépliées (une ligne commençant par une espace prolonge la précédente). */
function proprietes(texte: string): Propriete[] {
  const lignes: string[] = [];
  for (const brute of texte.split(/\r?\n/)) {
    const precedente = lignes.at(-1);
    if ((brute.startsWith(' ') || brute.startsWith('\t')) && precedente !== undefined)
      lignes[lignes.length - 1] = precedente + brute.slice(1);
    else if (brute.trim() !== '') lignes.push(brute);
  }
  return lignes.map((ligne) => {
    const deuxPoints = ligne.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const tete = deuxPoints < 0 ? ligne : ligne.slice(0, deuxPoints);
    const [nom = '', ...params] = tete.split(';');
    const parametres: Record<string, string> = {};
    for (const p of params) {
      const [cle = '', ...reste] = p.split('=');
      parametres[cle.toUpperCase()] = reste.join('=').replace(/^"|"$/g, '');
    }
    return {
      nom: nom.toUpperCase(),
      parametres,
      valeur: deuxPoints < 0 ? '' : ligne.slice(deuxPoints + 1),
    };
  });
}

const texteIcal = (valeur: string) =>
  valeur.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

interface DateIcal {
  /** Date murale AAAA-MM-JJ et heure HH:MM (dans le fuseau ci-dessous). */
  jour: string;
  heure: string;
  /** IANA, « UTC », ou null pour une heure flottante (fuseau de l'établissement). */
  fuseau: string | null;
  journee: boolean;
}

function lireDateIcal(p: Propriete): DateIcal | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(p.valeur.trim());
  if (!m) return null;
  const jour = `${String(m[1])}-${String(m[2])}-${String(m[3])}`;
  if (m[4] === undefined) return { jour, heure: '00:00', fuseau: null, journee: true };
  return {
    jour,
    heure: `${m[4]}:${String(m[5])}`,
    fuseau: m[7] ? 'UTC' : (p.parametres.TZID ?? null),
    journee: false,
  };
}

function instantIcal(d: DateIcal, fuseau: string): Date | null {
  try {
    return instantLocal(d.jour, d.heure, fuseau);
  } catch {
    return null;
  }
}

/** Durée iCal (PT1H30M, P1D) en minutes. */
function dureeIcal(valeur: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(valeur.trim());
  if (!m) return null;
  const n = (rang: number) => Number(m[rang] ?? '0');
  return ((n(1) * 7 + n(2)) * 24 + n(3)) * 60 + n(4);
}

const JOURS_ICAL = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const JOUR_MS = 86_400_000;
const ajouterJours = (jour: string, n: number) =>
  new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

/**
 * Jours des occurrences d'une règle RRULE simple (quotidienne ou hebdomadaire, INTERVAL, BYDAY,
 * COUNT ou UNTIL), en date murale ; null si la règle n'est pas prise en charge.
 */
function joursRegle(regle: string, premier: string): string[] | null {
  const r = Object.fromEntries(
    regle.split(';').map((x) => {
      const [k = '', v = ''] = x.split('=');
      return [k.toUpperCase(), v];
    }),
  );
  const intervalle = Number(r.INTERVAL ?? '1');
  const compte = r.COUNT ? Number(r.COUNT) : null;
  const jusqua = r.UNTIL
    ? `${r.UNTIL.slice(0, 4)}-${r.UNTIL.slice(4, 6)}-${r.UNTIL.slice(6, 8)}`
    : null;
  if (!['DAILY', 'WEEKLY'].includes(r.FREQ ?? '') || !(intervalle >= 1)) return null;
  if (compte === null && jusqua === null) return null;
  const jourSemaine = new Date(`${premier}T00:00:00Z`).getUTCDay();
  const jours =
    r.FREQ === 'WEEKLY' && r.BYDAY
      ? r.BYDAY.split(',').map((j) => JOURS_ICAL.indexOf(j.slice(-2)))
      : [jourSemaine];
  if (jours.some((j) => j < 0)) return null;
  const resultat: string[] = [];
  const pas = r.FREQ === 'DAILY' ? 1 : 7;
  // Début de la semaine (dimanche) de la première occurrence, pour l'hebdomadaire.
  const base = r.FREQ === 'DAILY' ? premier : ajouterJours(premier, -jourSemaine);
  for (let periode = 0; resultat.length <= OCCURRENCES_MAX; periode += intervalle) {
    const candidats =
      r.FREQ === 'DAILY'
        ? [ajouterJours(base, periode * pas)]
        : [...jours].sort().map((j) => ajouterJours(base, periode * pas + j));
    for (const jour of candidats) {
      if (jour < premier) continue;
      if ((jusqua !== null && jour > jusqua) || (compte !== null && resultat.length >= compte))
        return resultat;
      resultat.push(jour);
    }
  }
  return resultat;
}

/**
 * RG-04-09 : lit un fichier iCal événement par événement. Titre → module, lieu → salle ; la
 * description peut porter « Groupes : … », « Intervenants : … » et « Type : … ». Les événements
 * répétés (quotidiens ou hebdomadaires) sont déroulés, exceptions comprises ; les événements
 * d'une journée entière et les événements annulés sont ignorés et signalés.
 */
export function lireIcal(texte: string, fuseau: string): LectureImportEdt {
  const lecture: LectureImportEdt = { seances: [], erreurs: [], avertissements: [] };
  const evenements: Propriete[][] = [];
  let courant: Propriete[] | null = null;
  for (const p of proprietes(texte)) {
    if (p.nom === 'BEGIN' && p.valeur.toUpperCase() === 'VEVENT') courant = [];
    else if (p.nom === 'END' && p.valeur.toUpperCase() === 'VEVENT' && courant) {
      evenements.push(courant);
      courant = null;
    } else if (courant) courant.push(p);
  }
  if (evenements.length === 0) {
    lecture.erreurs.push({
      ligne: null,
      message: 'Aucun événement trouvé : déposez un fichier .ics exporté de votre agenda.',
    });
    return lecture;
  }
  // Exceptions d'une série (RECURRENCE-ID) : elles remplacent l'occurrence d'origine.
  // Occurrences des répétitions, converties en instants une fois la limite contrôlée.
  const occurrences: (() => SeanceImportee)[] = [];
  const exceptions = new Set<string>();
  for (const ev of evenements) {
    const uid = ev.find((p) => p.nom === 'UID')?.valeur;
    const rid = ev.find((p) => p.nom === 'RECURRENCE-ID');
    const d = rid ? lireDateIcal(rid) : null;
    if (uid && d) exceptions.add(`${uid}/${d.jour}T${d.heure}`);
  }
  evenements.forEach((ev, index) => {
    const ligne = index + 1;
    const lire = (nom: string) => ev.find((p) => p.nom === nom);
    const resume = texteIcal(lire('SUMMARY')?.valeur ?? '').trim();
    const nomEvenement = resume || `événement ${String(ligne)}`;
    const erreur = (message: string) =>
      lecture.erreurs.push({ ligne, message: `${nomEvenement} : ${message}` });
    if ((lire('STATUS')?.valeur ?? '').toUpperCase() === 'CANCELLED') {
      lecture.avertissements.push({
        ligne,
        message: `${nomEvenement} : événement annulé, ignoré.`,
      });
      return;
    }
    const uid = lire('UID')?.valeur.trim();
    const pDebut = lire('DTSTART');
    const debut = pDebut ? lireDateIcal(pDebut) : null;
    if (!uid) return erreur('événement sans UID : exportez de nouveau le fichier.');
    if (!debut) return erreur('date de début illisible.');
    if (debut.journee) {
      lecture.avertissements.push({
        ligne,
        message: `${nomEvenement} : événement sur la journée entière, ignoré.`,
      });
      return;
    }
    const pFin = lire('DTEND');
    const pDuree = lire('DURATION');
    const finLue = pFin ? lireDateIcal(pFin) : null;
    // Heure flottante : fuseau de l'établissement.
    const fuseauEvenement = debut.fuseau ?? fuseau;
    const debutInstant = instantIcal(debut, fuseauEvenement);
    if (!debutInstant) return erreur(`fuseau horaire inconnu : ${fuseauEvenement}.`);
    let duree: number | null = null;
    if (finLue) {
      const finInstant = instantIcal(finLue, finLue.fuseau ?? fuseau);
      duree = finInstant ? (finInstant.getTime() - debutInstant.getTime()) / 60_000 : null;
    } else if (pDuree) duree = dureeIcal(pDuree.valeur);
    if (duree === null || duree <= 0) return erreur('fin absente ou antérieure au début.');

    const champs: Record<'publics' | 'intervenants' | 'type', string[]> = {
      publics: [],
      intervenants: [],
      type: [],
    };
    for (const l of texteIcal(lire('DESCRIPTION')?.valeur ?? '').split('\n')) {
      const m = /^\s*([^:]+?)\s*:\s*(.+)$/.exec(l);
      const cle = m ? normaliserNom(String(m[1])) : '';
      const champ = ALIAS.publics.includes(cle)
        ? 'publics'
        : ALIAS.intervenants.includes(cle)
          ? 'intervenants'
          : ALIAS.type.includes(cle)
            ? 'type'
            : null;
      if (champ && m?.[2]) champs[champ].push(...decouper(m[2]));
    }
    const typeLu = champs.type[0] ?? '';
    const type = lireTypeSeance(typeLu);
    if (!type) return erreur(`type inconnu : « ${typeLu} ».`);
    const contenu = {
      module: resume,
      publics: champs.publics,
      intervenants: champs.intervenants,
      salle: texteIcal(lire('LOCATION')?.valeur ?? '').trim() || null,
      type,
    };
    if (contenu.module === '') return erreur('titre absent : il désigne le module.');

    const regle = lire('RRULE')?.valeur;
    const rid = lire('RECURRENCE-ID');
    if (!regle) {
      const d = rid ? lireDateIcal(rid) : null;
      lecture.seances.push({
        ligne,
        identifiant: d ? `${uid}/${d.jour}T${d.heure}` : uid,
        debut: debutInstant,
        fin: new Date(debutInstant.getTime() + duree * 60_000),
        ...contenu,
      });
      return;
    }
    const jours = joursRegle(regle, debut.jour);
    if (!jours)
      return erreur(
        'répétition non prise en charge (seules les répétitions quotidiennes ou hebdomadaires, avec une fin, le sont). Exportez les occurrences une à une.',
      );
    const exclus = new Set(
      ev
        .filter((p) => p.nom === 'EXDATE')
        .flatMap((p) => p.valeur.split(',').map((v) => lireDateIcal({ ...p, valeur: v })))
        .map((d) => d?.jour),
    );
    for (const jour of jours) {
      const cle = `${uid}/${jour}T${debut.heure}`;
      if (exclus.has(jour) || exceptions.has(cle)) continue;
      occurrences.push(() => {
        const instant = instantLocal(jour, debut.heure, fuseauEvenement);
        return {
          ligne,
          identifiant: cle,
          debut: instant,
          fin: new Date(instant.getTime() + duree * 60_000),
          ...contenu,
        };
      });
    }
  });
  const total = lecture.seances.length + occurrences.length;
  if (total > IMPORT_EDT_SEANCES_MAX) {
    lecture.erreurs.push(tropDeSeances(total));
    return { ...lecture, seances: [] };
  }
  lecture.seances.push(...occurrences.map((occurrence) => occurrence()));
  return sansDoublon(lecture);
}

// ——— Rapprochement et empreinte ———

export interface Candidat {
  id: string;
  /** Libellés sous lesquels l'objet peut apparaître (code, intitulé, nom, email…). */
  libelles: readonly string[];
}

/** Objet désigné sans ambiguïté par un libellé (comparaison sans accents ni casse), sinon null. */
export function rapprocher(libelle: string, candidats: readonly Candidat[]): string | null {
  const forme = normaliserNom(libelle);
  const trouves = new Set(
    candidats.filter((c) => c.libelles.some((l) => normaliserNom(l) === forme)).map((c) => c.id),
  );
  for (const id of trouves) return trouves.size === 1 ? id : null;
  return null;
}

export interface ContenuEmpreinte {
  debut: Date;
  fin: Date;
  type: string | null;
  moduleId: string | null;
  activite: string | null;
  promotionIds: readonly string[];
  groupeIds: readonly string[];
  salleId: string | null;
  intervenantIds: readonly string[];
}

/**
 * RG-04-12 : empreinte du contenu d'une séance. Celle du dernier import est conservée : si la
 * séance n'y correspond plus, elle a été modifiée dans Scolaly depuis.
 */
export function empreinteSeance(c: ContenuEmpreinte): string {
  const liste = (ids: readonly string[]) => [...ids].sort().join(',');
  return [
    c.debut.toISOString(),
    c.fin.toISOString(),
    c.type ?? '',
    c.moduleId ?? '',
    c.activite ?? '',
    liste(c.promotionIds),
    liste(c.groupeIds),
    c.salleId ?? '',
    liste(c.intervenantIds),
  ].join('|');
}

export type DecisionReimport = 'creer' | 'inchangee' | 'mettre-a-jour' | 'conserver';

/**
 * RG-04-11 et RG-04-12 : sort d'une séance du fichier. Sans séance existante, elle est créée ;
 * identique, rien ne change ; modifiée dans Scolaly depuis le dernier import, la version de
 * Scolaly est conservée sauf choix contraire.
 */
export function deciderReimport(options: {
  existante: { empreinteImport: string | null; empreinteActuelle: string } | null;
  empreinteFichier: string;
  versionConservee: 'scolaly' | 'fichier';
}): DecisionReimport {
  const { existante, empreinteFichier } = options;
  if (!existante) return 'creer';
  if (existante.empreinteActuelle === empreinteFichier) return 'inchangee';
  const modifieeDansScolaly =
    existante.empreinteImport !== null && existante.empreinteImport !== existante.empreinteActuelle;
  return modifieeDansScolaly && options.versionConservee === 'scolaly'
    ? 'conserver'
    : 'mettre-a-jour';
}

import { instantLocal } from '../emploi-du-temps/recurrence.js';
import { jourLocal } from '../emploi-du-temps/conflits.js';
import type { NatureAbsence, StatutAbsence } from './absences.js';
import type { ModePresence } from './distanciel.js';
import type { LigneFeuille } from './etat-appel.js';

/**
 * Feuilles d'émargement PDF (I4.4 ; RG-06-25, RG-06-26) : données mises en forme pour les modèles
 * Typst de packages/pdf. Tout le texte est préparé ici (dates JJ/MM/AAAA au fuseau de
 * l'établissement) ; le modèle ne fait que la mise en page. Minimisation (RGPD-03) : ni position ni
 * adresse IP, le contrôle de localisation est résumé en « vérifié » ou « à vérifier », aucun motif
 * d'absence n'est repris (RG-06-20).
 */

/** RG-06-25 : mention portée par chaque apprenant qui a émargé par scan. */
export const MENTION_SIGNATURE_SCAN = 'Signature électronique par scan authentifié et horodaté';

/** Mode d'enregistrement d'un scan (table presence). */
export type ModeScan = 'qr' | 'code' | 'manuel';

const MODES_SCAN: Record<ModeScan, string> = {
  qr: 'QR code',
  code: 'Code à 6 chiffres',
  manuel: 'Saisie manuelle',
};
const MODES_SEANCE: Record<ModePresence, string> = {
  presentiel: 'Présentiel',
  distanciel: 'À distance',
  hybride: 'Hybride (sur place ou à distance)',
};

const formatsHeure = new Map<string, Intl.DateTimeFormat>();
/** Heure HH:MM d'un instant dans un fuseau. */
export function heureLocale(instant: Date, fuseau: string): string {
  let format = formatsHeure.get(fuseau);
  if (!format) {
    format = new Intl.DateTimeFormat('fr-FR', {
      timeZone: fuseau,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatsHeure.set(fuseau, format);
  }
  return format.format(instant);
}

/** Date JJ/MM/AAAA d'un jour AAAA-MM-JJ. */
export const dateFr = (jour: string) => jour.split('-').reverse().join('/');

/** Date et heure locales : « JJ/MM/AAAA à HH:MM ». */
export const horodatageFr = (instant: Date, fuseau: string) =>
  `${dateFr(jourLocal(instant, fuseau))} à ${heureLocale(instant, fuseau)}`;

/** Durée en clair : « 3 h 05 », « 45 min ». */
export function dureeFr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** En-tête de la feuille d'une séance (RG-06-25). */
export interface EnTeteSeance {
  organisme: string;
  /** Numéro de déclaration d'activité de l'établissement. */
  nda: string | null;
  etablissement: string | null;
  formations: readonly string[];
  /** Promotions et groupes du public de la séance. */
  publics: readonly string[];
  libelle: string;
  module: string | null;
  debut: Date;
  fin: Date;
  fuseau: string;
  salle: string | null;
  mode: ModePresence;
  intervenants: readonly string[];
}

/** Ligne signée, complétée du nom, du mode de scan et de la couche de justification. */
export interface LigneFeuilleNommee extends LigneFeuille {
  nom: string;
  prenom: string;
  /** Mode du scan enregistré ; null sans scan. */
  modeScan: ModeScan | null;
  /** Statut fixé par l'intervenant (appel manuel, RG-06-12) plutôt que par le scan. */
  decisionIntervenant: boolean;
  /** RG-06-21 : statut de justification de l'absence ou du retard ; null sans absence. */
  justification: StatutAbsence | null;
}

/** Version signée de l'appel (RG-06-13, RG-06-15). */
export interface VersionFeuille {
  version: number;
  /** Heure du serveur. */
  valideLe: Date;
  validePar: string;
  empreinte: string;
  motif: string | null;
  correctionVerrouillee: 'ecole' | 'intervenant' | null;
}

const lieu = (salle: string | null, mode: ModePresence) => {
  if (mode === 'distanciel') return 'À distance';
  const sur = salle ?? 'Salle non renseignée';
  return mode === 'hybride' ? `${sur}, ou à distance` : sur;
};

function statutEnClair(l: LigneFeuilleNommee): string {
  switch (l.statut) {
    case 'present':
      return 'Présent';
    case 'retard':
      return `Retard (${l.minutesRetard ?? 0} min)`;
    case 'absent':
      return 'Absent';
    case 'en-attente':
      return 'Absent (non pointé)';
    case 'a-verifier':
      return 'Présent (à vérifier)';
  }
}

const absent = (l: LigneFeuille) => l.statut === 'absent' || l.statut === 'en-attente';

function pointage(l: LigneFeuilleNommee, fuseau: string): string {
  const parties: string[] = [];
  if (l.nonAttendu) parties.push('Non attendu, ajouté par l’intervenant');
  if (l.scanneLe) {
    parties.push(
      `${MODES_SCAN[l.modeScan ?? 'qr']} à ${heureLocale(new Date(l.scanneLe), fuseau)}`,
    );
    if (l.aDistance) parties.push('à distance');
  } else if (!absent(l) && !l.nonAttendu) parties.push('Marqué par l’intervenant');
  if (l.decisionIntervenant && l.scanneLe) parties.push('statut fixé par l’intervenant');
  return parties.join(' · ') || '—';
}

/** Scan signalé à vérifier : la liste signée ne garde que le rejeu, le statut et la décision. */
const aVerifier = (l: LigneFeuille) => Boolean(l.raison ?? l.decision) || l.statut === 'a-verifier';

/**
 * RG-06-11, #112 décision 6 : résultat des contrôles résumé. La raison exacte (hors site, inconnu)
 * n'est pas reprise ; seul le scan rejoué hors ligne est nommé, car il ne dit rien du lieu.
 */
function controle(l: LigneFeuilleNommee): string {
  if (!l.scanneLe) return '—';
  if (!aVerifier(l)) return 'Vérifié';
  const quoi = l.raison === 'rejoue' ? 'À vérifier (scan hors ligne)' : 'À vérifier';
  if (l.decision === 'confirme') return `${quoi} : confirmé par l’intervenant`;
  if (l.decision === 'retire') return `${quoi} : retiré par l’intervenant`;
  return `${quoi} : sans décision`;
}

function justification(l: LigneFeuilleNommee): string {
  if (l.nonAttendu || !(absent(l) || l.statut === 'retard')) return '';
  return l.justification === 'justifiee' ? 'Justifiée' : 'Non justifiée';
}

const signe = (l: LigneFeuille) => Boolean(l.scanneLe) && !absent(l);

function natureVersion(v: VersionFeuille): string {
  if (v.version === 1) return 'Validation';
  if (v.correctionVerrouillee === 'intervenant')
    return 'Correction après verrouillage, par un intervenant';
  if (v.correctionVerrouillee === 'ecole') return 'Correction après verrouillage, par l’école';
  return 'Correction';
}

const nomComplet = (l: { nom: string; prenom: string }) => `${l.nom.toUpperCase()} ${l.prenom}`;

/**
 * RG-06-25 : données de la feuille d'une séance, pour une version signée. Les lignes suivent la
 * liste signée ; la justification est une couche ajoutée (RG-06-21), lue au moment de l'édition.
 */
export function donneesFeuilleSeance(
  e: EnTeteSeance,
  lignes: readonly LigneFeuilleNommee[],
  versions: readonly VersionFeuille[],
  numero: number,
) {
  const version = versions.find((v) => v.version === numero);
  if (!version) throw new RangeError(`Version ${numero} absente de l'appel`);
  const triees = [...lignes].sort(
    (a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'),
  );
  const signalements: string[] = [];
  for (const l of triees) {
    if (l.scanneLe && aVerifier(l))
      signalements.push(`${nomComplet(l)} : ${controle(l).toLowerCase()}.`);
    if (l.nonAttendu)
      signalements.push(`${nomComplet(l)} : non attendu, ajouté par l’intervenant.`);
  }
  for (const v of versions)
    if (v.version <= numero && v.correctionVerrouillee === 'intervenant')
      signalements.push(
        `Version ${v.version} : correction après verrouillage par un intervenant (${v.validePar}, le ${horodatageFr(v.valideLe, e.fuseau)}).`,
      );
  const attendus = triees.filter((l) => !l.nonAttendu);
  return {
    organisme: { nom: e.organisme, nda: e.nda },
    seance: {
      libelle: e.libelle,
      module: e.module ?? '—',
      etablissement: e.etablissement ?? '—',
      formations: e.formations.join(', ') || '—',
      publics: e.publics.join(', ') || '—',
      date: dateFr(jourLocal(e.debut, e.fuseau)),
      horaires: `${heureLocale(e.debut, e.fuseau)} – ${heureLocale(e.fin, e.fuseau)}`,
      fuseau: e.fuseau,
      lieu: lieu(e.salle, e.mode),
      mode: MODES_SEANCE[e.mode],
      intervenants: e.intervenants.join(', ') || '—',
    },
    effectifs: {
      attendus: attendus.length,
      presents: attendus.filter((l) => !absent(l)).length,
      retards: attendus.filter((l) => l.statut === 'retard').length,
      absents: attendus.filter(absent).length,
      nonAttendus: triees.length - attendus.length,
    },
    lignes: triees.map((l) => ({
      nom: nomComplet(l),
      statut: statutEnClair(l),
      pointage: pointage(l, e.fuseau),
      signature: signe(l) ? MENTION_SIGNATURE_SCAN : '',
      controle: controle(l),
      justification: justification(l),
    })),
    signalements,
    version: {
      numero,
      derniere: numero === Math.max(...versions.map((v) => v.version)),
      valideLe: horodatageFr(version.valideLe, e.fuseau),
      validePar: version.validePar,
      empreinte: version.empreinte,
    },
    historique: versions
      .filter((v) => v.version <= numero)
      .map((v) => ({
        numero: v.version,
        le: horodatageFr(v.valideLe, e.fuseau),
        par: v.validePar,
        nature: natureVersion(v),
        motif: v.motif ?? '',
      })),
  };
}
export type DonneesFeuilleSeance = ReturnType<typeof donneesFeuilleSeance>;

/** Séance du récapitulatif mensuel, avec le cadre de son établissement (RG-04-02). */
export interface SeanceRecapitulatif {
  id: string;
  libelle: string;
  debut: Date;
  fin: Date;
  fuseau: string;
  limiteMidi: string;
  /** Appel validé (au moins une version signée). */
  validee: boolean;
}

/** Retard ou absence enregistré (table absence). */
export interface AbsenceRecapitulatif {
  seanceId: string;
  personneId: string;
  nature: NatureAbsence;
  minutes: number;
  statut: StatutAbsence;
}

export interface ApprenantRecapitulatif {
  personneId: string;
  nom: string;
  prenom: string;
}

type Etat = 'non-justifiee' | 'justifiee' | 'retard' | 'present' | 'non-validee';
/** Statut d'une demi-journée : le plus grave de ses séances. */
const GRAVITE: readonly Etat[] = ['non-justifiee', 'justifiee', 'retard', 'present', 'non-validee'];
const ETATS: Record<Etat, string> = {
  'non-justifiee': 'Absent, non justifié',
  justifiee: 'Absent, justifié',
  retard: 'Retard',
  present: 'Présent',
  'non-validee': 'Appel non validé',
};

interface Segment {
  jour: string;
  matin: boolean;
  debut: Date;
  libelle: string;
  prevues: number;
  realisees: number | null;
  etat: Etat;
}

/** RG-06-18 : une séance coupée à la limite matin / après-midi de son établissement. */
function segments(s: SeanceRecapitulatif, a: AbsenceRecapitulatif | undefined): Segment[] {
  const jour = jourLocal(s.debut, s.fuseau);
  const limite = instantLocal(jour, s.limiteMidi, s.fuseau).getTime();
  const bornes = [
    { matin: true, debut: s.debut.getTime(), fin: Math.min(s.fin.getTime(), limite) },
    { matin: false, debut: Math.max(s.debut.getTime(), limite), fin: s.fin.getTime() },
  ].filter((b) => b.fin > b.debut);
  // Un retard se compte sur la demi-journée où commence la séance (absencesDeLAppel).
  let retard = a?.nature === 'retard' ? a.minutes : 0;
  return bornes.map((b) => {
    const prevues = Math.round((b.fin - b.debut) / 60_000);
    const base = {
      jour,
      matin: b.matin,
      debut: new Date(b.debut),
      libelle: `${s.libelle} (${heureLocale(new Date(b.debut), s.fuseau)} – ${heureLocale(new Date(b.fin), s.fuseau)})`,
      prevues,
    };
    if (!s.validee) return { ...base, realisees: null, etat: 'non-validee' };
    if (a?.nature === 'absence')
      return {
        ...base,
        realisees: 0,
        etat: a.statut === 'justifiee' ? 'justifiee' : 'non-justifiee',
      };
    const manque = Math.min(retard, prevues);
    retard -= manque;
    return { ...base, realisees: prevues - manque, etat: manque > 0 ? 'retard' : 'present' };
  });
}

/**
 * RG-06-26 : récapitulatif mensuel par apprenant, une ligne par demi-journée (date, matin ou
 * après-midi, séances, statut, heures prévues et réalisées), avec les totaux utiles aux OPCO et au
 * suivi des alternants. Une séance dont l'appel n'est pas validé ne compte aucune heure réalisée.
 */
export function recapitulatifMensuel(entree: {
  apprenants: readonly ApprenantRecapitulatif[];
  seances: readonly SeanceRecapitulatif[];
  /** Séances attendues de chaque apprenant. */
  attendus: readonly { seanceId: string; personneId: string }[];
  absences: readonly AbsenceRecapitulatif[];
}) {
  const seances = new Map(entree.seances.map((s) => [s.id, s]));
  const absences = new Map(entree.absences.map((a) => [`${a.seanceId}:${a.personneId}`, a]));
  const apprenants = [...entree.apprenants].sort(
    (a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'),
  );
  return apprenants.map((p) => {
    const parDemi = new Map<string, Segment[]>();
    for (const { seanceId } of entree.attendus.filter((x) => x.personneId === p.personneId)) {
      const s = seances.get(seanceId);
      if (!s) continue;
      for (const seg of segments(s, absences.get(`${seanceId}:${p.personneId}`))) {
        const cle = `${seg.jour}:${seg.matin ? 0 : 1}`;
        parDemi.set(cle, [...(parDemi.get(cle) ?? []), seg]);
      }
    }
    const totaux = {
      prevues: 0,
      realisees: 0,
      absencesJustifiees: 0,
      absencesNonJustifiees: 0,
      retards: 0,
      nonValidees: 0,
    };
    const demis = [...parDemi.entries()].sort(([a], [b]) => a.localeCompare(b));
    const lignes = demis.map(([, segs]) => {
      segs.sort((a, b) => a.debut.getTime() - b.debut.getTime());
      // Une demi-journée a toujours au moins une séance.
      const etat = GRAVITE.find((g) => segs.some((s) => s.etat === g)) as Etat;
      const prevues = segs.reduce((n, s) => n + s.prevues, 0);
      const realisees = segs.reduce((n, s) => n + (s.realisees ?? 0), 0);
      totaux.prevues += prevues;
      totaux.realisees += realisees;
      if (etat === 'justifiee') totaux.absencesJustifiees += 1;
      if (etat === 'non-justifiee') totaux.absencesNonJustifiees += 1;
      if (etat === 'retard') totaux.retards += 1;
      if (segs.some((s) => s.etat === 'non-validee')) totaux.nonValidees += 1;
      const premier = segs[0] as Segment;
      return {
        date: dateFr(premier.jour),
        demiJournee: premier.matin ? 'Matin' : 'Après-midi',
        seances: segs.map((s) => s.libelle).join(' ; '),
        statut: ETATS[etat],
        prevues: dureeFr(prevues),
        realisees: segs.every((s) => s.realisees === null) ? '—' : dureeFr(realisees),
      };
    });
    return {
      nom: nomComplet(p),
      lignes,
      totaux: {
        demiJournees: lignes.length,
        prevues: dureeFr(totaux.prevues),
        realisees: dureeFr(totaux.realisees),
        absencesJustifiees: totaux.absencesJustifiees,
        absencesNonJustifiees: totaux.absencesNonJustifiees,
        retards: totaux.retards,
        nonValidees: totaux.nonValidees,
      },
    };
  });
}
export type RecapitulatifApprenant = ReturnType<typeof recapitulatifMensuel>[number];

/** Mois AAAA-MM en clair : « octobre 2026 ». */
export function moisEnClair(mois: string): string {
  const [annee, numero] = mois.split('-').map(Number) as [number, number];
  const nom = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(annee, numero - 1, 1)),
  );
  return `${nom} ${annee}`;
}

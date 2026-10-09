/**
 * Flux iCal personnel (RG-04-15, US-04-09) : séances publiées d'une personne, annulées comprises
 * (STATUS:CANCELLED), dans le fuseau de l'établissement (VTIMEZONE), sur une fenêtre bornée.
 * Le texte produit ne dépend que des données : deux appels identiques donnent le même flux (ETag).
 */
import { decalage } from './recurrence.js';

const JOUR_MS = 86_400_000;
const SEMAINE_MS = 7 * JOUR_MS;

/** Fenêtre du flux : un mois passé, six mois à venir (contenu minimal, coût borné). */
export const FLUX_ICAL_JOURS_PASSES = 31;
export const FLUX_ICAL_JOURS_A_VENIR = 183;

/** RG-04-15 : les agendas sont invités à relire le flux toutes les 15 minutes. */
export const FLUX_ICAL_RAFRAICHISSEMENT_MINUTES = 15;

/** Origine des numéros de SEQUENCE (secondes écoulées : entier 32 bits jusqu'en 2094). */
const ORIGINE_SEQUENCE = Date.UTC(2026, 0, 1);

/** Fenêtre du flux, arrondie au jour UTC : le flux reste identique (même ETag) dans la journée. */
export function fenetreFluxIcal(maintenant: Date): { debut: Date; fin: Date } {
  const jour = Math.floor(maintenant.getTime() / JOUR_MS) * JOUR_MS;
  return {
    debut: new Date(jour - FLUX_ICAL_JOURS_PASSES * JOUR_MS),
    fin: new Date(jour + (FLUX_ICAL_JOURS_A_VENIR + 1) * JOUR_MS),
  };
}

/**
 * SEQUENCE d'une séance : croît à chaque modification significative (horaire, salle, intervenant,
 * annulation, report : `modifieeLe`, RG-04-14) ; 0 tant qu'elle n'a pas changé depuis sa publication.
 */
export function sequenceIcal(modifieeLe: Date | null): number {
  if (!modifieeLe) return 0;
  return Math.max(0, Math.floor((modifieeLe.getTime() - ORIGINE_SEQUENCE) / 1000));
}

export interface EvenementFluxIcal {
  /** Identifiant de la séance : l'UID reste stable d'une lecture à l'autre. */
  id: string;
  titre: string;
  debut: Date;
  fin: Date;
  fuseau: string;
  lieu: string | null;
  distanciel: boolean;
  statut: 'publiee' | 'annulee' | 'reportee';
  modifieeLe: Date | null;
  /** Dernière écriture de la séance (LAST-MODIFIED et DTSTAMP). */
  majLe: Date;
}

export interface TextesFluxIcal {
  nomCalendrier: string;
  annulee: string;
  reportee: string;
  distanciel: string;
}

export interface TransitionFuseau {
  instant: number;
  avant: number;
  apres: number;
}

/** Changements d'heure d'un fuseau entre deux instants (recherche hebdomadaire puis par dichotomie). */
export function transitionsFuseau(fuseau: string, debut: Date, fin: Date): TransitionFuseau[] {
  const transitions: TransitionFuseau[] = [];
  let t = debut.getTime();
  let ecart = decalage(t, fuseau);
  while (t < fin.getTime()) {
    const suivant = Math.min(t + SEMAINE_MS, fin.getTime());
    const ecartSuivant = decalage(suivant, fuseau);
    if (ecartSuivant !== ecart) {
      let bas = t;
      let haut = suivant;
      while (haut - bas > 60_000) {
        const milieu = bas + Math.max(1, Math.floor((haut - bas) / 120_000)) * 60_000;
        if (decalage(milieu, fuseau) === ecart) bas = milieu;
        else haut = milieu;
      }
      transitions.push({ instant: haut, avant: ecart, apres: ecartSuivant });
    }
    t = suivant;
    ecart = ecartSuivant;
  }
  return transitions;
}

const deux = (n: number) => String(n).padStart(2, '0');

/** AAAAMMJJTHHMMSS des composantes UTC d'une date. */
function horodatage(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${deux(d.getUTCMonth() + 1)}${deux(d.getUTCDate())}` +
    `T${deux(d.getUTCHours())}${deux(d.getUTCMinutes())}${deux(d.getUTCSeconds())}`
  );
}

const heureLocale = (instant: Date, fuseau: string) =>
  horodatage(instant.getTime() + decalage(instant.getTime(), fuseau));

function ecart(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  return `${ms < 0 ? '-' : '+'}${deux(Math.floor(minutes / 60))}${deux(minutes % 60)}`;
}

/** Échappement des valeurs texte (RFC 5545, 3.3.11), sans caractères de contrôle. */
export function echapperTexteIcal(texte: string): string {
  return texte
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\p{Cc}/gu, '');
}

/** Octets UTF-8 d'un caractère (un caractère hors plan de base occupe deux unités UTF-16). */
const octets = (c: string) => {
  const code = c.charCodeAt(0);
  return c.length === 2 ? 4 : code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
};

/** Pliage des lignes à 75 octets (RFC 5545, 3.1), sans couper un caractère UTF-8. */
export function plierLigneIcal(ligne: string): string {
  const morceaux: string[] = [];
  let courant = '';
  let taille = 0;
  for (const c of ligne) {
    const n = octets(c);
    const limite = morceaux.length === 0 ? 75 : 74;
    if (taille + n > limite) {
      morceaux.push(courant);
      courant = '';
      taille = 0;
    }
    courant += c;
    taille += n;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}

function vtimezone(fuseau: string, debut: Date, fin: Date): string[] {
  // Un an avant la fenêtre : la règle en vigueur au premier événement est toujours décrite.
  const depart = new Date(debut.getTime() - 366 * JOUR_MS);
  const initial = decalage(depart.getTime(), fuseau);
  const lignes = [
    'BEGIN:VTIMEZONE',
    `TZID:${fuseau}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${ecart(initial)}`,
    `TZOFFSETTO:${ecart(initial)}`,
    'END:STANDARD',
  ];
  for (const t of transitionsFuseau(fuseau, depart, fin)) {
    const nature = t.apres > t.avant ? 'DAYLIGHT' : 'STANDARD';
    lignes.push(
      `BEGIN:${nature}`,
      `DTSTART:${horodatage(t.instant + t.avant)}`,
      `TZOFFSETFROM:${ecart(t.avant)}`,
      `TZOFFSETTO:${ecart(t.apres)}`,
      `END:${nature}`,
    );
  }
  lignes.push('END:VTIMEZONE');
  return lignes;
}

function vevent(e: EvenementFluxIcal, textes: TextesFluxIcal): string[] {
  const retiree = e.statut !== 'publiee';
  const prefixe =
    e.statut === 'annulee' ? textes.annulee : e.statut === 'reportee' ? textes.reportee : '';
  const lieu = e.lieu ?? (e.distanciel ? textes.distanciel : null);
  const majLe = horodatage(e.majLe.getTime());
  return [
    'BEGIN:VEVENT',
    `UID:${e.id}@scolaly`,
    // Sans METHOD, DTSTAMP vaut LAST-MODIFIED (RFC 5545, 3.8.7.2) : le flux reste stable.
    `DTSTAMP:${majLe}Z`,
    `LAST-MODIFIED:${majLe}Z`,
    `SEQUENCE:${sequenceIcal(e.modifieeLe)}`,
    `DTSTART;TZID=${e.fuseau}:${heureLocale(e.debut, e.fuseau)}`,
    `DTEND;TZID=${e.fuseau}:${heureLocale(e.fin, e.fuseau)}`,
    `SUMMARY:${echapperTexteIcal(prefixe + e.titre)}`,
    ...(lieu ? [`LOCATION:${echapperTexteIcal(lieu)}`] : []),
    `STATUS:${retiree ? 'CANCELLED' : 'CONFIRMED'}`,
    `TRANSP:${retiree ? 'TRANSPARENT' : 'OPAQUE'}`,
    'END:VEVENT',
  ];
}

/**
 * Flux iCal complet. Les événements sont triés (début, identifiant) pour un texte stable ; chaque
 * fuseau utilisé reçoit sa VTIMEZONE couvrant la fenêtre.
 */
export function ecrireFluxIcal(entree: {
  evenements: readonly EvenementFluxIcal[];
  fenetre: { debut: Date; fin: Date };
  fuseauParDefaut: string;
  textes: TextesFluxIcal;
}): string {
  const { fenetre, textes } = entree;
  const evenements = [...entree.evenements].sort(
    (a, b) => a.debut.getTime() - b.debut.getTime() || a.id.localeCompare(b.id),
  );
  const fuseaux = [...new Set([entree.fuseauParDefaut, ...evenements.map((e) => e.fuseau)])].sort();
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scolaly//Emploi du temps//FR',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${echapperTexteIcal(textes.nomCalendrier)}`,
    `X-WR-TIMEZONE:${entree.fuseauParDefaut}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${FLUX_ICAL_RAFRAICHISSEMENT_MINUTES}M`,
    `X-PUBLISHED-TTL:PT${FLUX_ICAL_RAFRAICHISSEMENT_MINUTES}M`,
    ...fuseaux.flatMap((f) => vtimezone(f, fenetre.debut, fenetre.fin)),
    ...evenements.flatMap((e) => vevent(e, textes)),
    'END:VCALENDAR',
  ];
  return lignes.map(plierLigneIcal).join('\r\n') + '\r\n';
}

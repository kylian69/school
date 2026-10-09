import { describe, expect, it } from 'vitest';
import {
  echapperTexteIcal,
  ecrireFluxIcal,
  fenetreFluxIcal,
  plierLigneIcal,
  sequenceIcal,
  transitionsFuseau,
  type EvenementFluxIcal,
} from './flux-ical.js';

const textes = {
  nomCalendrier: 'Emploi du temps – École fictive',
  annulee: 'Annulé : ',
  reportee: 'Reporté : ',
  distanciel: 'À distance',
};

const evenement = (surcharge: Partial<EvenementFluxIcal> = {}): EvenementFluxIcal => ({
  id: '01900000-0000-7000-8000-000000000001',
  titre: 'Droit des contrats',
  debut: new Date('2026-10-12T07:00:00Z'),
  fin: new Date('2026-10-12T09:00:00Z'),
  fuseau: 'Europe/Paris',
  lieu: 'Amphi A',
  distanciel: false,
  statut: 'publiee',
  modifieeLe: null,
  majLe: new Date('2026-10-01T08:30:00Z'),
  ...surcharge,
});

const fenetre = fenetreFluxIcal(new Date('2026-10-09T15:42:00Z'));

const flux = (evenements: EvenementFluxIcal[], fuseauParDefaut = 'Europe/Paris') =>
  ecrireFluxIcal({ evenements, fenetre, fuseauParDefaut, textes });

/** Lignes dépliées (RFC 5545, 3.1). */
const lignes = (texte: string) => texte.replace(/\r\n /g, '').split('\r\n');

describe('RG-04-15 flux iCal personnel', () => {
  it('RG-04-15 borne la fenêtre au jour UTC : un mois avant, six mois après', () => {
    expect(fenetre.debut.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(fenetre.fin.toISOString()).toBe('2027-04-11T00:00:00.000Z');
    expect(fenetreFluxIcal(new Date('2026-10-09T00:00:01Z'))).toEqual(fenetre);
  });

  it('RG-04-15 écrit les heures locales de l’établissement avec leur VTIMEZONE', () => {
    const texte = flux([evenement()]);
    const l = lignes(texte);
    expect(texte.endsWith('\r\n')).toBe(true);
    expect(l).toContain('DTSTART;TZID=Europe/Paris:20261012T090000');
    expect(l).toContain('DTEND;TZID=Europe/Paris:20261012T110000');
    expect(l).toContain('TZID:Europe/Paris');
    expect(l).toContain('X-WR-TIMEZONE:Europe/Paris');
    expect(l).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT15M');
    // Passage à l'heure d'hiver du 25/10/2026 à 3 h locales (heure d'été).
    const hiver = l.indexOf('DTSTART:20261025T030000');
    expect(l.slice(hiver - 1, hiver + 3)).toEqual([
      'BEGIN:STANDARD',
      'DTSTART:20261025T030000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
    ]);
    expect(l).toContain('DTSTART:20270328T020000');
    expect(l[l.indexOf('DTSTART:20270328T020000') - 1]).toBe('BEGIN:DAYLIGHT');
  });

  it('RG-04-15 garde l’heure locale de part et d’autre du changement d’heure', () => {
    const l = lignes(
      flux([
        evenement({
          debut: new Date('2026-11-02T08:00:00Z'),
          fin: new Date('2026-11-02T10:00:00Z'),
        }),
      ]),
    );
    expect(l).toContain('DTSTART;TZID=Europe/Paris:20261102T090000');
  });

  it('RG-04-15 décrit un fuseau sans changement d’heure et un décalage négatif', () => {
    const l = lignes(flux([evenement({ fuseau: 'America/Martinique' })], 'Asia/Tokyo'));
    expect(l).toContain('TZID:America/Martinique');
    expect(l).toContain('TZOFFSETTO:-0400');
    expect(l).toContain('TZOFFSETTO:+0900');
    expect(l).toContain('DTSTART;TZID=America/Martinique:20261012T030000');
    expect(l.filter((x) => x === 'BEGIN:DAYLIGHT')).toHaveLength(0);
  });

  it('RG-04-15 garde un UID stable et une SEQUENCE qui suit les modifications significatives', () => {
    const avant = lignes(flux([evenement()]));
    expect(avant).toContain('UID:01900000-0000-7000-8000-000000000001@scolaly');
    expect(avant).toContain('SEQUENCE:0');
    expect(avant).toContain('DTSTAMP:20261001T083000Z');
    expect(avant).toContain('LAST-MODIFIED:20261001T083000Z');
    const apres = lignes(flux([evenement({ modifieeLe: new Date('2026-10-05T10:00:00Z') })]));
    expect(apres).toContain(`SEQUENCE:${sequenceIcal(new Date('2026-10-05T10:00:00Z'))}`);
    expect(sequenceIcal(new Date('2026-10-05T10:00:01Z'))).toBeGreaterThan(
      sequenceIcal(new Date('2026-10-05T10:00:00Z')),
    );
    expect(sequenceIcal(new Date('2025-12-31T00:00:00Z'))).toBe(0);
    expect(sequenceIcal(null)).toBe(0);
  });

  it('RG-04-15 publie une séance annulée ou reportée en STATUS:CANCELLED', () => {
    const annulee = lignes(flux([evenement({ statut: 'annulee' })]));
    expect(annulee).toContain('STATUS:CANCELLED');
    expect(annulee).toContain('TRANSP:TRANSPARENT');
    expect(annulee).toContain('SUMMARY:Annulé : Droit des contrats');
    const reportee = lignes(flux([evenement({ statut: 'reportee' })]));
    expect(reportee).toContain('STATUS:CANCELLED');
    expect(reportee).toContain('SUMMARY:Reporté : Droit des contrats');
    const publiee = lignes(flux([evenement()]));
    expect(publiee).toContain('STATUS:CONFIRMED');
    expect(publiee).toContain('TRANSP:OPAQUE');
  });

  it('RG-04-15 indique la salle, la distance ou rien', () => {
    expect(lignes(flux([evenement()]))).toContain('LOCATION:Amphi A');
    expect(lignes(flux([evenement({ lieu: null, distanciel: true })]))).toContain(
      'LOCATION:À distance',
    );
    expect(lignes(flux([evenement({ lieu: null })])).some((x) => x.startsWith('LOCATION'))).toBe(
      false,
    );
  });

  it('RG-04-15 produit un texte stable, trié par début puis identifiant', () => {
    const a = evenement({ id: 'b' });
    const b = evenement({ id: 'a' });
    const c = evenement({ id: 'c', debut: new Date('2026-10-11T07:00:00Z') });
    const texte = flux([a, b, c]);
    expect(flux([c, b, a])).toBe(texte);
    const uids = lignes(texte).filter((x) => x.startsWith('UID:'));
    expect(uids).toEqual(['UID:c@scolaly', 'UID:a@scolaly', 'UID:b@scolaly']);
  });

  it('RG-04-15 échappe les textes et retire les caractères de contrôle', () => {
    expect(echapperTexteIcal('a\\b;c,d\r\ne\rf\u0007')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });

  it('RG-04-15 plie les lignes à 75 octets sans couper un caractère', () => {
    expect(plierLigneIcal('court')).toBe('court');
    const longue = `SUMMARY:${'é'.repeat(40)}${'😀'.repeat(10)}${'€'.repeat(10)}${'x'.repeat(80)}`;
    const pliee = plierLigneIcal(longue);
    const morceaux = pliee.split('\r\n');
    for (const m of morceaux) expect(new TextEncoder().encode(m).length).toBeLessThanOrEqual(75);
    expect(morceaux.slice(1).every((m) => m.startsWith(' '))).toBe(true);
    expect(pliee.replace(/\r\n /g, '')).toBe(longue);
  });

  it('RG-04-15 repère les changements d’heure à la minute près', () => {
    const t = transitionsFuseau(
      'Europe/Paris',
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-30T00:00:00Z'),
    );
    expect(t).toEqual([
      { instant: Date.parse('2026-03-29T01:00:00Z'), avant: 3_600_000, apres: 7_200_000 },
    ]);
    expect(
      transitionsFuseau('UTC', new Date('2026-03-01T00:00:00Z'), new Date('2026-03-01T00:01:30Z')),
    ).toEqual([]);
    // Fin non alignée sur la minute : la recherche s'arrête quand même.
    expect(
      transitionsFuseau(
        'Europe/Paris',
        new Date('2026-03-29T00:59:30Z'),
        new Date('2026-03-29T01:00:30Z'),
      ),
    ).toEqual([
      { instant: Date.parse('2026-03-29T01:00:30Z'), avant: 3_600_000, apres: 7_200_000 },
    ]);
  });
});

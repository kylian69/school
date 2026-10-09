import { describe, expect, it } from 'vitest';
import {
  badgeModifie,
  changementUrgent,
  dernierRecapitulatif,
  envoiImmediatDu,
  natureAnnoncee,
} from './notifications.js';

const maintenant = new Date('2026-11-02T12:00:00Z');
const creneau = (debut: string, fin: string) => ({ debut: new Date(debut), fin: new Date(fin) });

describe('RG-04-14 changement urgent', () => {
  it('RG-04-14 signale aussitôt une séance qui commence dans les 48 heures', () => {
    expect(
      changementUrgent([creneau('2026-11-04T12:00:00Z', '2026-11-04T14:00:00Z')], maintenant),
    ).toBe(true);
  });

  it('RG-04-14 renvoie au récapitulatif une séance au-delà de 48 heures', () => {
    expect(
      changementUrgent([creneau('2026-11-04T12:01:00Z', '2026-11-04T14:00:00Z')], maintenant),
    ).toBe(false);
  });

  it('RG-04-14 traite comme urgente une séance en cours', () => {
    expect(
      changementUrgent([creneau('2026-11-02T11:00:00Z', '2026-11-02T13:00:00Z')], maintenant),
    ).toBe(true);
  });

  it('RG-04-14 ignore une séance déjà terminée', () => {
    expect(
      changementUrgent([creneau('2026-11-02T08:00:00Z', '2026-11-02T12:00:00Z')], maintenant),
    ).toBe(false);
  });

  it('RG-04-14 retient le report d’une séance proche vers une date lointaine', () => {
    expect(
      changementUrgent(
        [
          creneau('2026-11-03T08:00:00Z', '2026-11-03T10:00:00Z'),
          creneau('2026-11-20T08:00:00Z', '2026-11-20T10:00:00Z'),
        ],
        maintenant,
      ),
    ).toBe(true);
  });

  it('RG-04-14 accepte un autre délai', () => {
    expect(
      changementUrgent([creneau('2026-11-03T08:00:00Z', '2026-11-03T10:00:00Z')], maintenant, 12),
    ).toBe(false);
  });
});

describe('RG-08-11 regroupement des rafales', () => {
  const minutes = (n: number) => new Date(maintenant.getTime() - n * 60_000);

  it('RG-08-11 attend 2 minutes sans nouveau changement', () => {
    expect(envoiImmediatDu({ premier: minutes(3), dernier: minutes(1) }, maintenant)).toBe(false);
    expect(envoiImmediatDu({ premier: minutes(3), dernier: minutes(2) }, maintenant)).toBe(true);
  });

  it('RG-08-11 envoie au plus tard 10 minutes après le premier changement', () => {
    expect(envoiImmediatDu({ premier: minutes(10), dernier: minutes(0) }, maintenant)).toBe(true);
  });
});

describe('RG-04-14 nature annoncée', () => {
  it('RG-04-14 annonce l’annulation quoi qu’il se soit passé avant', () => {
    expect(natureAnnoncee({ statut: 'annulee', natures: ['publication'], concernee: true })).toBe(
      'annulation',
    );
  });

  it('RG-04-14 annonce le report', () => {
    expect(natureAnnoncee({ statut: 'reportee', natures: ['report'], concernee: true })).toBe(
      'report',
    );
  });

  it('RG-04-14 annonce son retrait à un intervenant remplacé', () => {
    expect(
      natureAnnoncee({ statut: 'publiee', natures: ['retrait', 'modification'], concernee: false }),
    ).toBe('retrait');
  });

  it('RG-04-14 annonce une séance publiée puis modifiée comme nouvelle', () => {
    expect(
      natureAnnoncee({
        statut: 'publiee',
        natures: ['publication', 'modification'],
        concernee: true,
      }),
    ).toBe('publication');
  });

  it('RG-04-14 annonce une modification', () => {
    expect(natureAnnoncee({ statut: 'publiee', natures: ['modification'], concernee: true })).toBe(
      'modification',
    );
  });
});

describe('RG-04-14 récapitulatif à 18 h dans le fuseau de l’établissement', () => {
  it('RG-04-14 retient 18 h aujourd’hui après 18 h, 18 h la veille avant', () => {
    // 2 novembre 2026 : Paris en UTC+1.
    expect(dernierRecapitulatif('Europe/Paris', new Date('2026-11-02T17:00:00Z'))).toEqual(
      new Date('2026-11-02T17:00:00Z'),
    );
    expect(dernierRecapitulatif('Europe/Paris', new Date('2026-11-02T16:59:59Z'))).toEqual(
      new Date('2026-11-01T17:00:00Z'),
    );
  });

  it('RG-04-14 suit le fuseau de chaque établissement, outre-mer compris', () => {
    // 22 h à Paris : 17 h en Martinique (UTC-4), récapitulatif de la veille encore.
    expect(dernierRecapitulatif('America/Martinique', new Date('2026-11-02T21:00:00Z'))).toEqual(
      new Date('2026-11-01T22:00:00Z'),
    );
    expect(dernierRecapitulatif('America/Martinique', new Date('2026-11-02T22:00:00Z'))).toEqual(
      new Date('2026-11-02T22:00:00Z'),
    );
    // La Réunion (UTC+4) : 18 h locales = 14 h UTC.
    expect(dernierRecapitulatif('Indian/Reunion', new Date('2026-11-02T15:00:00Z'))).toEqual(
      new Date('2026-11-02T14:00:00Z'),
    );
  });

  it('RG-04-14 garde 18 h locales au changement d’heure', () => {
    // Paris passe à l'heure d'été le 29 mars 2026 : 18 h = 16 h UTC ce jour, 17 h UTC la veille.
    expect(dernierRecapitulatif('Europe/Paris', new Date('2026-03-29T16:30:00Z'))).toEqual(
      new Date('2026-03-29T16:00:00Z'),
    );
    expect(dernierRecapitulatif('Europe/Paris', new Date('2026-03-29T15:00:00Z'))).toEqual(
      new Date('2026-03-28T17:00:00Z'),
    );
  });
});

describe('RG-04-14 badge « modifié »', () => {
  it('RG-04-14 affiche le badge pendant 7 jours par défaut', () => {
    expect(badgeModifie(new Date('2026-10-26T12:00:01Z'), maintenant)).toBe(true);
    expect(badgeModifie(new Date('2026-10-26T12:00:00Z'), maintenant)).toBe(false);
  });

  it('RG-04-14 n’affiche pas de badge sans modification', () => {
    expect(badgeModifie(null, maintenant)).toBe(false);
  });

  it('RG-04-14 suit la durée choisie et ignore une date future', () => {
    expect(badgeModifie(new Date('2026-10-30T12:00:00Z'), maintenant, 2)).toBe(false);
    expect(badgeModifie(new Date('2026-11-03T12:00:00Z'), maintenant)).toBe(false);
  });
});

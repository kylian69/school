import { describe, expect, it } from 'vitest';
import { conservationEchue, reculerDuree } from './conservation.js';

const instant = (iso: string) => new Date(iso);

describe('RGPD-04 calcul de la limite de conservation', () => {
  it('recule de mois et d’années en calendrier, heure conservée', () => {
    expect(reculerDuree(instant('2026-10-09T03:00:00Z'), 'P12M')).toEqual(
      instant('2025-10-09T03:00:00Z'),
    );
    expect(reculerDuree(instant('2026-10-09T03:00:00Z'), 'P1Y2M')).toEqual(
      instant('2025-08-09T03:00:00Z'),
    );
    expect(reculerDuree(instant('2026-01-15T00:00:00Z'), 'P1M')).toEqual(
      instant('2025-12-15T00:00:00Z'),
    );
  });

  it('ramène un jour absent au dernier jour du mois (limite la plus ancienne)', () => {
    expect(reculerDuree(instant('2026-03-31T12:00:00Z'), 'P1M')).toEqual(
      instant('2026-02-28T12:00:00Z'),
    );
    expect(reculerDuree(instant('2025-02-28T12:00:00Z'), 'P12M')).toEqual(
      instant('2024-02-28T12:00:00Z'),
    );
  });

  it('recule de semaines et de jours ; P0D laisse l’instant inchangé', () => {
    expect(reculerDuree(instant('2026-10-09T00:00:00Z'), 'P1W2D')).toEqual(
      instant('2026-09-30T00:00:00Z'),
    );
    expect(reculerDuree(instant('2026-10-09T08:00:00Z'), 'P0D')).toEqual(
      instant('2026-10-09T08:00:00Z'),
    );
  });

  it('refuse une durée invalide avec un message explicite', () => {
    for (const duree of ['P', '12M', 'P1H', 'PT1H', '']) {
      expect(() => reculerDuree(new Date(), duree)).toThrow(/Durée de conservation/);
    }
  });
});

describe('Conservation des indisponibilités (RG-04-18)', () => {
  const maintenant = instant('2026-10-09T03:00:00Z');

  it('RG-04-18 motif effacé dès la fin de l’indisponibilité (P0D)', () => {
    expect(conservationEchue(instant('2026-10-09T03:00:00Z'), maintenant, 'P0D')).toBe(true);
    expect(conservationEchue(instant('2026-10-08T18:00:00Z'), maintenant, 'P0D')).toBe(true);
    expect(conservationEchue(instant('2026-10-09T03:00:01Z'), maintenant, 'P0D')).toBe(false);
  });

  it('RG-04-18 ligne supprimée 12 mois après la fin de l’indisponibilité (P12M)', () => {
    expect(conservationEchue(instant('2025-10-09T03:00:00Z'), maintenant, 'P12M')).toBe(true);
    expect(conservationEchue(instant('2025-10-10T00:00:00Z'), maintenant, 'P12M')).toBe(false);
  });
});

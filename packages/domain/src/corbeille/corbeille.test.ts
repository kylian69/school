import { describe, expect, it } from 'vitest';
import { effacementLe, restaurable, verifierSuppressionPersonne } from './corbeille.js';

describe('RG-01-23 corbeille', () => {
  const supprimeLe = new Date('2026-10-06T10:00:00Z');

  it('efface définitivement 30 jours après la suppression', () => {
    expect(effacementLe(supprimeLe).toISOString()).toBe('2026-11-05T10:00:00.000Z');
  });

  it('restaure pendant 30 jours, plus après', () => {
    expect(restaurable(supprimeLe, new Date('2026-11-05T09:59:59Z'))).toBe(true);
    expect(restaurable(supprimeLe, new Date('2026-11-05T10:00:00Z'))).toBe(false);
  });

  it('ne supprime qu’une fiche dont le compte n’a jamais été activé', () => {
    expect(verifierSuppressionPersonne('cree')).toEqual({ ok: true });
    expect(verifierSuppressionPersonne('invite')).toEqual({ ok: true });
    expect(verifierSuppressionPersonne('actif')).toEqual({ ok: false, refus: 'compte-active' });
    expect(verifierSuppressionPersonne('desactive')).toEqual({
      ok: false,
      refus: 'compte-active',
    });
  });
});

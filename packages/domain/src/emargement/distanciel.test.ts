import { describe, expect, it } from 'vitest';
import { emargementADistance, MODES_PRESENCE } from './distanciel.js';

describe('RG-06-08 mode de présence de la séance', () => {
  it('trois modes, choisis dans l’emploi du temps', () => {
    expect(MODES_PRESENCE).toEqual(['presentiel', 'distanciel', 'hybride']);
  });
});

describe('US-06-06 émargement à distance', () => {
  it('RG-06-08 tout émargement d’une séance à distance est à distance', () => {
    expect(emargementADistance('distanciel', false)).toBe(true);
    expect(emargementADistance('distanciel', true)).toBe(true);
  });

  it('en hybride, seul l’apprenant qui le déclare émarge à distance', () => {
    expect(emargementADistance('hybride', true)).toBe(true);
    expect(emargementADistance('hybride', false)).toBe(false);
  });

  it('en présentiel, une déclaration « à distance » est ignorée', () => {
    expect(emargementADistance('presentiel', true)).toBe(false);
    expect(emargementADistance('presentiel', false)).toBe(false);
  });
});

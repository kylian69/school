import { describe, expect, it } from 'vitest';
import { emargementADistance, modePresence } from './distanciel.js';

describe('RG-06-08 mode de présence de la séance', () => {
  it('une séance cochée « à distance » est à distance, avec ou sans lien', () => {
    expect(modePresence({ distanciel: true, lienVisio: 'https://visio.example/a' })).toBe(
      'distanciel',
    );
    expect(modePresence({ distanciel: true, lienVisio: null })).toBe('distanciel');
  });

  it('une séance en salle avec un lien de visio est hybride, sans lien présentielle', () => {
    expect(modePresence({ distanciel: false, lienVisio: 'https://visio.example/a' })).toBe(
      'hybride',
    );
    expect(modePresence({ distanciel: false, lienVisio: null })).toBe('presentiel');
    expect(modePresence({ distanciel: false, lienVisio: '' })).toBe('presentiel');
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

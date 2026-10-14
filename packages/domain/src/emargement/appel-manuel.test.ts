import { describe, expect, it } from 'vitest';
import { comptePresent, statutDansAppel, verifierMarquage } from './appel-manuel.js';

const H = 3_600_000;
const seance = { debutMs: 10 * H, finMs: 13 * H };

describe('statutDansAppel', () => {
  const scan = { rejoue: false, localisation: 'sur-place' as const };

  it('US-06-04 la décision de l’intervenant l’emporte sur le scan', () => {
    expect(statutDansAppel(scan, { statut: 'absent', minutesRetard: null })).toBe('absent');
    expect(statutDansAppel(null, { statut: 'retard', minutesRetard: 12 })).toBe('retard');
  });

  it('US-06-05 sans scan ni décision, l’apprenant est en attente', () => {
    expect(statutDansAppel(null, null)).toBe('en-attente');
  });

  it('RG-06-11 un scan hors site, de position inconnue ou rejoué est à vérifier', () => {
    expect(statutDansAppel({ rejoue: false, localisation: 'hors-site' }, null)).toBe('a-verifier');
    expect(statutDansAppel({ rejoue: false, localisation: 'inconnu' }, null)).toBe('a-verifier');
    expect(statutDansAppel({ rejoue: true, localisation: null }, null)).toBe('a-verifier');
    expect(statutDansAppel(scan, null)).toBe('present');
    expect(statutDansAppel({ rejoue: false, localisation: null }, null)).toBe('present');
  });

  it('RG-06-11 sans décision, un scan à vérifier compte comme présent', () => {
    expect(comptePresent('a-verifier')).toBe(true);
    expect(comptePresent('present')).toBe(true);
    expect(comptePresent('retard')).toBe(true);
    expect(comptePresent('absent')).toBe(false);
    expect(comptePresent('en-attente')).toBe(false);
  });
});

describe('verifierMarquage', () => {
  const present = { statut: 'present' as const, minutesRetard: null };

  it('RG-06-02 refuse un marquage avant l’ouverture de la fenêtre de scan', () => {
    expect(verifierMarquage(seance, 10 * H - 11 * 60_000, present)).toBe('trop-tot');
    expect(verifierMarquage(seance, 10 * H - 10 * 60_000, present)).toBeNull();
  });

  it('RG-06-01 refuse un marquage une fois l’appel verrouillé, 7 jours après la séance', () => {
    expect(verifierMarquage(seance, 13 * H + 7 * 24 * H, present)).toBeNull();
    expect(verifierMarquage(seance, 13 * H + 7 * 24 * H + 1, present)).toBe('verrouille');
    // RG-06-15 : avec le droit spécifique, le délai est contrôlé par verifierModification.
    expect(verifierMarquage(seance, 13 * H + 7 * 24 * H + 1, present, undefined, true)).toBeNull();
  });

  it('RG-06-12 un retard porte un nombre entier de minutes, au plus la durée de la séance', () => {
    const retard = (minutesRetard: number | null) => ({ statut: 'retard' as const, minutesRetard });
    expect(verifierMarquage(seance, 11 * H, retard(12))).toBeNull();
    expect(verifierMarquage(seance, 11 * H, retard(180))).toBeNull();
    expect(verifierMarquage(seance, 11 * H, retard(181))).toBe('retard-invalide');
    expect(verifierMarquage(seance, 11 * H, retard(0))).toBe('retard-invalide');
    expect(verifierMarquage(seance, 11 * H, retard(2.5))).toBe('retard-invalide');
    expect(verifierMarquage(seance, 11 * H, retard(null))).toBe('retard-invalide');
  });

  it('RG-06-12 seul un retard porte des minutes', () => {
    expect(verifierMarquage(seance, 11 * H, { statut: 'absent', minutesRetard: 5 })).toBe(
      'retard-invalide',
    );
    expect(verifierMarquage(seance, 11 * H, { statut: 'absent', minutesRetard: null })).toBeNull();
  });
});

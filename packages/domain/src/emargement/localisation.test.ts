import { describe, expect, it } from 'vitest';
import { distanceMetres, evaluerLocalisation, localisationAVerifier } from './localisation.js';

/** Campus fictif ; 0,001° de latitude ≈ 111 m. */
const campus = { latitude: 45.75, longitude: 4.85, rayonMetres: 300 };
const aNord = (metres: number, precisionMetres = 20) => ({
  latitude: campus.latitude + metres / 111_195,
  longitude: campus.longitude,
  precisionMetres,
});

describe('distanceMetres', () => {
  it('vaut 0 pour un même point et ~111 km pour un degré de latitude', () => {
    expect(distanceMetres(campus, campus)).toBe(0);
    expect(distanceMetres(campus, { ...campus, latitude: campus.latitude + 1 })).toBeCloseTo(
      111_195,
      -1,
    );
  });

  it('reste définie aux antipodes', () => {
    expect(
      distanceMetres({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }),
    ).toBeCloseTo(Math.PI * 6_371_008.8, -1);
  });
});

describe('evaluerLocalisation', () => {
  it('RG-06-10 une position dans le rayon est sur place', () => {
    expect(
      evaluerLocalisation({ perimetre: campus, position: aNord(250), reseauCampus: false }),
    ).toBe('sur-place');
  });

  it('RG-06-10 le cercle d’incertitude qui touche le périmètre profite à l’apprenant', () => {
    expect(
      evaluerLocalisation({ perimetre: campus, position: aNord(400, 150), reseauCampus: false }),
    ).toBe('sur-place');
  });

  it('RG-06-10 une position précise loin du campus est hors site', () => {
    expect(
      evaluerLocalisation({ perimetre: campus, position: aNord(2000), reseauCampus: false }),
    ).toBe('hors-site');
  });

  it('RGPD-03 une précision plus large que le rayon rend la position inexploitable', () => {
    expect(
      evaluerLocalisation({ perimetre: campus, position: aNord(5000, 301), reseauCampus: false }),
    ).toBe('inconnu');
  });

  it('RGPD-03 sans position (refus, GPS indisponible) ni réseau du campus : inconnu', () => {
    expect(evaluerLocalisation({ perimetre: campus, position: null, reseauCampus: false })).toBe(
      'inconnu',
    );
  });

  it('RGPD-03 le réseau du campus suffit, même sans position', () => {
    expect(evaluerLocalisation({ perimetre: null, position: null, reseauCampus: true })).toBe(
      'sur-place',
    );
    expect(
      evaluerLocalisation({ perimetre: campus, position: aNord(2000), reseauCampus: true }),
    ).toBe('sur-place');
  });

  it('sans coordonnées du site, une position ne prouve rien', () => {
    expect(evaluerLocalisation({ perimetre: null, position: aNord(0), reseauCampus: false })).toBe(
      'inconnu',
    );
  });
});

describe('localisationAVerifier', () => {
  it('RG-06-09 signale hors site et inconnu, jamais sur place ni un scan non contrôlé', () => {
    expect(localisationAVerifier('hors-site')).toBe(true);
    expect(localisationAVerifier('inconnu')).toBe(true);
    expect(localisationAVerifier('sur-place')).toBe(false);
    expect(localisationAVerifier(null)).toBe(false);
    expect(localisationAVerifier(undefined)).toBe(false);
  });
});

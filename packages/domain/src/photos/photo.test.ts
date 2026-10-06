import { describe, expect, it } from 'vitest';
import { cadrageCarre, matriculeDuFichier, verifierDecisionPhoto } from './photo.js';

describe('RG-01-26 photo des apprenants', () => {
  it('recadre un portrait en carré, au quart supérieur', () => {
    expect(cadrageCarre(600, 800)).toEqual({ left: 0, top: 50, width: 600, height: 600 });
  });

  it('recadre une image en largeur au centre, et garde un carré tel quel', () => {
    expect(cadrageCarre(1000, 600)).toEqual({ left: 200, top: 0, width: 600, height: 600 });
    expect(cadrageCarre(512, 512)).toEqual({ left: 0, top: 0, width: 512, height: 512 });
  });

  it('valide une photo en attente ; un refus demande un motif', () => {
    expect(verifierDecisionPhoto('en_attente', 'valider', null)).toEqual({ ok: true });
    expect(verifierDecisionPhoto('en_attente', 'refuser', 'Photo floue')).toEqual({ ok: true });
    expect(verifierDecisionPhoto('en_attente', 'refuser', '  ')).toEqual({
      ok: false,
      refus: 'motif-manquant',
    });
    expect(verifierDecisionPhoto('validee', 'valider', null)).toEqual({
      ok: false,
      refus: 'rien-a-valider',
    });
    expect(verifierDecisionPhoto(null, 'refuser', 'x')).toEqual({
      ok: false,
      refus: 'rien-a-valider',
    });
  });

  it('US-01-20 lit le matricule du nom de fichier d’une archive', () => {
    expect(matriculeDuFichier('2026-00042.jpg')).toBe('2026-00042');
    expect(matriculeDuFichier('promo/BTS/000123.JPEG')).toBe('000123');
    expect(matriculeDuFichier('dossier\\000124.png')).toBe('000124');
    expect(matriculeDuFichier('notes.txt')).toBeNull();
    expect(matriculeDuFichier('__MACOSX/._000123.jpg')).toBeNull();
    expect(matriculeDuFichier('promo/')).toBeNull();
  });
});

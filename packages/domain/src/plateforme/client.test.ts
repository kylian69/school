import { describe, expect, it } from 'vitest';
import {
  accesSelonEtat,
  modulesActifs,
  verifierSousDomaine,
  verifierTransition,
} from './client.js';

describe('RG-19-02 cycle de vie d’un client', () => {
  it.each([
    ['actif', 'suspendu'],
    ['suspendu', 'actif'],
    ['actif', 'resilie'],
    ['suspendu', 'resilie'],
    ['resilie', 'supprime'],
  ] as const)('autorise %s → %s avec un motif', (depuis, vers) => {
    expect(verifierTransition(depuis, vers, 'Impayé de septembre')).toEqual({ ok: true });
  });

  it.each([
    ['actif', 'supprime'],
    ['resilie', 'actif'],
    ['supprime', 'actif'],
  ] as const)('refuse %s → %s', (depuis, vers) => {
    expect(verifierTransition(depuis, vers, 'motif')).toEqual({
      ok: false,
      refus: 'transition-interdite',
    });
  });

  it('exige un motif et un changement réel', () => {
    expect(verifierTransition('actif', 'suspendu', '  ')).toEqual({
      ok: false,
      refus: 'motif-absent',
    });
    expect(verifierTransition('actif', 'actif', 'motif')).toEqual({
      ok: false,
      refus: 'meme-etat',
    });
  });

  it('suspendu : lecture seule ; résilié ou supprimé : accès fermé', () => {
    expect(accesSelonEtat('actif')).toBe('complet');
    expect(accesSelonEtat('suspendu')).toBe('lecture-seule');
    expect(accesSelonEtat('resilie')).toBe('ferme');
    expect(accesSelonEtat('supprime')).toBe('ferme');
  });
});

describe('RG-19-04 modules actifs : formule et exceptions', () => {
  it('ajoute les ouvertures et retire les fermetures par exception', () => {
    expect(
      modulesActifs(
        ['socle', 'notes', 'emargement'],
        [
          { module: 'jurys', actif: true },
          { module: 'notes', actif: false },
        ],
      ),
    ).toEqual(['emargement', 'jurys', 'socle']);
  });
});

describe('RG-19-01 sous-domaine du client', () => {
  it.each(['ecole-lumerac', 'egl', 'inl2026'])('accepte %s', (valeur) => {
    expect(verifierSousDomaine(valeur)).toEqual({ ok: true });
  });

  it.each(['ab', '-ecole', 'ecole-', 'École', 'ecole--lumerac', 'a'.repeat(41), 'eco le'])(
    'refuse le format de « %s »',
    (valeur) => {
      expect(verifierSousDomaine(valeur)).toEqual({ ok: false, refus: 'format' });
    },
  );

  it('refuse un sous-domaine réservé à la plateforme', () => {
    expect(verifierSousDomaine('api')).toEqual({ ok: false, refus: 'reserve' });
  });
});

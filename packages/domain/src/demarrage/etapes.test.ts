import { describe, expect, it } from 'vitest';
import { etatDemarrage, type ConstatsDemarrage } from './etapes.js';

const VIDE: ConstatsDemarrage = {
  etablissementsComplets: 0,
  annees: 0,
  fermetures: 0,
  couleur: false,
  logo: false,
  personnesAvecRole: 1,
};

describe('US-01-01 liste de démarrage', () => {
  it('commence avec toutes les étapes à faire', () => {
    const etat = etatDemarrage(VIDE, {});
    expect(etat.etapes.map((e) => e.statut)).toEqual(['a-faire', 'a-faire', 'a-faire', 'a-faire']);
    expect(etat).toMatchObject({ avancement: 0, termine: false });
  });

  it('coche les étapes d’après les données de l’école', () => {
    const etat = etatDemarrage(
      {
        etablissementsComplets: 1,
        annees: 1,
        fermetures: 4,
        couleur: false,
        logo: true,
        personnesAvecRole: 3,
      },
      {},
    );
    expect(etat.etapes.every((e) => e.statut === 'faite' && e.automatique)).toBe(true);
    expect(etat).toMatchObject({ avancement: 100, termine: true });
  });

  it('demande des vacances pour le calendrier, une couleur ou un logo pour l’apparence', () => {
    const etat = etatDemarrage({ ...VIDE, annees: 1, couleur: true }, {});
    expect(etat.etapes.find((e) => e.code === 'calendrier')?.statut).toBe('a-faire');
    expect(etat.etapes.find((e) => e.code === 'apparence')?.statut).toBe('faite');
  });

  it('chaque étape peut être marquée faite ou passée ; la liste se termine alors', () => {
    const etat = etatDemarrage(VIDE, {
      organisation: 'faite',
      calendrier: 'sautee',
      apparence: 'sautee',
      roles: 'faite',
    });
    expect(etat.etapes.map((e) => [e.statut, e.automatique])).toEqual([
      ['faite', false],
      ['sautee', false],
      ['sautee', false],
      ['faite', false],
    ]);
    expect(etat).toMatchObject({ avancement: 50, termine: true });
  });

  it('une étape faite par les données l’emporte sur un choix « passée »', () => {
    const etat = etatDemarrage({ ...VIDE, couleur: true }, { apparence: 'sautee' });
    expect(etat.etapes.find((e) => e.code === 'apparence')).toMatchObject({
      statut: 'faite',
      automatique: true,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  CLES_EMARGEMENT,
  commandesPrechargement,
  commandesRetraitSeance,
  commandesSessions,
} from './emargement.js';

const seance = {
  organisationId: 'ecole',
  libelle: 'Droit',
  debut: Date.UTC(2026, 9, 6, 8),
  fin: Date.UTC(2026, 9, 6, 10),
  distanciel: false,
};

describe('RG-00-17 préchargement léger', () => {
  it('écrit les attendus par paquets dans une clé de chargement, puis les bascule d’un coup', () => {
    const attendus = new Map(Array.from({ length: 2500 }, (_, i) => [`compte-${i}`, `fiche-${i}`]));
    const commandes = commandesPrechargement('s1', seance, attendus);
    const enChargement = CLES_EMARGEMENT.attendusEnChargement('s1');
    const paquets = commandes.filter((c) => c[0] === 'hset' && c[1] === enChargement);
    expect(paquets.map((c) => (c.length - 2) / 2)).toEqual([1000, 1000, 500]);
    expect(commandes).toContainEqual(['rename', enChargement, CLES_EMARGEMENT.attendus('s1')]);
    expect(commandes.some((c) => c[0] === 'multi')).toBe(false);
  });

  it('vide la liste des attendus quand il n’y en a plus', () => {
    const commandes = commandesPrechargement('s1', seance, new Map());
    expect(commandes).toContainEqual(['del', CLES_EMARGEMENT.attendus('s1')]);
    expect(commandes.some((c) => c[0] === 'rename')).toBe(false);
  });

  it('remet en cache les seules sessions en cours, sans écraser (NX)', () => {
    const maintenant = Date.UTC(2026, 9, 6, 8);
    const commandes = commandesSessions(
      [
        { session: { token: 'a', expiresAt: new Date(maintenant + 60_000) }, user: { id: 'u' } },
        { session: { token: 'b', expiresAt: new Date(maintenant - 1) }, user: { id: 'u' } },
      ],
      maintenant,
    );
    expect(commandes).toHaveLength(1);
    expect(commandes[0]).toEqual([
      'set',
      'auth:a',
      expect.stringContaining('"token":"a"') as unknown as string,
      'EX',
      '60',
      'NX',
    ]);
  });
});

describe('US-04-11 séance retirée du cache', () => {
  it('US-04-11 efface la séance, ses attendus et son marqueur, sans toucher aux présences', () => {
    const [commande] = commandesRetraitSeance('s1');
    expect(commande).toEqual([
      'del',
      CLES_EMARGEMENT.seance('s1'),
      CLES_EMARGEMENT.attendus('s1'),
      CLES_EMARGEMENT.attendusEnChargement('s1'),
      CLES_EMARGEMENT.prechargee('s1'),
    ]);
    expect(commande).not.toContain(CLES_EMARGEMENT.presences('s1'));
  });
});

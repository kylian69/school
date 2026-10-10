import { describe, expect, it } from 'vitest';
import {
  CLES_EMARGEMENT,
  commandesPrechargement,
  commandesRetraitSeance,
  commandesSessions,
  lireSeanceEnCache,
  perimetreAControler,
  type SeanceEnCache,
} from './emargement.js';

const seance: SeanceEnCache = {
  organisationId: 'ecole',
  libelle: 'Droit',
  debut: Date.UTC(2026, 9, 6, 8),
  fin: Date.UTC(2026, 9, 6, 10),
  distanciel: false,
  localisation: null,
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

describe('RG-06-10 périmètre de localisation préchargé', () => {
  const etablissement = {
    localisationActive: true,
    localisationLatitude: 45.75,
    localisationLongitude: 4.85,
    localisationRayon: 300,
    localisationPlagesIp: ['192.0.2.0/24'],
  };

  it('relit le périmètre écrit avec la séance, et son absence', () => {
    const perimetre = perimetreAControler(false, etablissement);
    const hash = (s: typeof seance) => {
      const commande = commandesPrechargement('s1', s, new Map()).find(
        (c) => c[0] === 'hset' && c[1] === CLES_EMARGEMENT.seance('s1'),
      );
      const champs = commande?.slice(2) ?? [];
      return Object.fromEntries(
        champs.flatMap((v, i) => (i % 2 === 0 ? [[v, champs[i + 1] ?? '']] : [])),
      );
    };
    expect(lireSeanceEnCache(hash({ ...seance, localisation: perimetre }))?.localisation).toEqual({
      latitude: 45.75,
      longitude: 4.85,
      rayonMetres: 300,
      plagesIp: ['192.0.2.0/24'],
    });
    expect(lireSeanceEnCache(hash(seance))?.localisation).toBeNull();
  });

  it('RG-06-08 aucun contrôle à distance, désactivé, ou sans coordonnées ni plage', () => {
    expect(perimetreAControler(true, etablissement)).toBeNull();
    expect(perimetreAControler(false, null)).toBeNull();
    expect(perimetreAControler(false, { ...etablissement, localisationActive: false })).toBeNull();
    expect(
      perimetreAControler(false, {
        ...etablissement,
        localisationLatitude: null,
        localisationPlagesIp: [],
      }),
    ).toBeNull();
    expect(
      perimetreAControler(false, { ...etablissement, localisationLongitude: null }),
    ).toMatchObject({ latitude: null, longitude: null, plagesIp: ['192.0.2.0/24'] });
  });
});

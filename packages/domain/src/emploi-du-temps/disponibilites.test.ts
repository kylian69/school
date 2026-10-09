import { describe, expect, it } from 'vitest';
import {
  creneauApplicable,
  erreursCreneau,
  erreursIndisponibilite,
  type CreneauSaisi,
} from './disponibilites.js';

const plage = { debut: '08:00', fin: '19:00', joursOuvres: [1, 2, 3, 4, 5] };
const lundiMatin: CreneauSaisi = { jourSemaine: 1, heureDebut: '08:00', heureFin: '12:00' };

describe('RG-04-18 période de validité d’un créneau', () => {
  it('RG-04-18 applique un créneau sans période tous les jours', () => {
    expect(creneauApplicable(lundiMatin, '2026-10-05')).toBe(true);
  });

  it('RG-04-18 applique un créneau entre ses bornes, bornes comprises', () => {
    const c = { valableDu: '2026-09-01', valableAu: '2026-12-31' };
    expect(creneauApplicable(c, '2026-09-01')).toBe(true);
    expect(creneauApplicable(c, '2026-12-31')).toBe(true);
    expect(creneauApplicable(c, '2026-08-31')).toBe(false);
    expect(creneauApplicable(c, '2027-01-01')).toBe(false);
  });
});

describe('RG-04-18 contrôle d’un créneau de disponibilité', () => {
  it('RG-04-18 accepte un créneau dans la plage, sans chevauchement', () => {
    const apresMidi = { jourSemaine: 1, heureDebut: '12:00', heureFin: '18:00' };
    expect(erreursCreneau(apresMidi, [lundiMatin], plage)).toEqual([]);
  });

  it('RG-04-18 refuse des bornes incohérentes', () => {
    expect(
      erreursCreneau({ jourSemaine: 1, heureDebut: '12:00', heureFin: '12:00' }, [], plage),
    ).toEqual(['bornes']);
    expect(
      erreursCreneau(
        { ...lundiMatin, valableDu: '2026-10-10', valableAu: '2026-10-09' },
        [],
        plage,
      ),
    ).toEqual(['periode']);
  });

  it('RG-04-02 refuse un créneau hors de la plage de l’établissement', () => {
    expect(erreursCreneau({ ...lundiMatin, jourSemaine: 6 }, [], plage)).toEqual([
      'jour-non-ouvre',
    ]);
    expect(erreursCreneau({ ...lundiMatin, heureDebut: '07:45' }, [], plage)).toEqual([
      'hors-plage',
    ]);
    expect(erreursCreneau({ ...lundiMatin, heureFin: '19:15' }, [], plage)).toEqual(['hors-plage']);
  });

  it('RG-04-18 refuse un créneau qui chevauche un autre le même jour', () => {
    const chevauche = { jourSemaine: 1, heureDebut: '11:00', heureFin: '14:00' };
    expect(erreursCreneau(chevauche, [lundiMatin], plage)).toEqual(['chevauchement']);
    expect(erreursCreneau({ ...chevauche, jourSemaine: 2 }, [lundiMatin], plage)).toEqual([]);
  });

  it('RG-04-18 tient compte des périodes de validité pour le chevauchement', () => {
    const automne = { ...lundiMatin, valableDu: '2026-09-01', valableAu: '2026-12-31' };
    const printemps = { ...lundiMatin, valableDu: '2027-01-01', valableAu: '2027-06-30' };
    expect(erreursCreneau(printemps, [automne], plage)).toEqual([]);
    expect(erreursCreneau(automne, [printemps], plage)).toEqual([]);
    expect(erreursCreneau({ ...lundiMatin, valableDu: '2026-12-31' }, [automne], plage)).toEqual([
      'chevauchement',
    ]);
    expect(erreursCreneau({ ...lundiMatin, valableAu: '2026-09-01' }, [automne], plage)).toEqual([
      'chevauchement',
    ]);
    expect(erreursCreneau(lundiMatin, [automne], plage)).toEqual(['chevauchement']);
  });
});

describe('RG-04-18 contrôle d’une indisponibilité ponctuelle', () => {
  const maintenant = new Date('2026-10-09T10:00:00Z');
  const ind = (debut: string, fin: string) => ({ debut: new Date(debut), fin: new Date(fin) });
  const conge = ind('2026-10-12T00:00:00Z', '2026-10-14T00:00:00Z');

  it('RG-04-18 accepte une indisponibilité future sans chevauchement', () => {
    const suivante = ind('2026-10-14T00:00:00Z', '2026-10-15T00:00:00Z');
    expect(erreursIndisponibilite(suivante, [conge], maintenant)).toEqual([]);
    // Commencée mais pas finie : elle reste utile.
    const enCours = ind('2026-10-09T08:00:00Z', '2026-10-09T18:00:00Z');
    expect(erreursIndisponibilite(enCours, [], maintenant)).toEqual([]);
  });

  it('RG-04-18 refuse des bornes incohérentes ou une indisponibilité passée', () => {
    expect(
      erreursIndisponibilite(ind('2026-10-12T10:00:00Z', '2026-10-12T10:00:00Z'), [], maintenant),
    ).toEqual(['bornes']);
    expect(
      erreursIndisponibilite(ind('2026-10-01T10:00:00Z', '2026-10-02T10:00:00Z'), [], maintenant),
    ).toEqual(['passee']);
  });

  it('RG-04-18 refuse une indisponibilité de plus d’un an', () => {
    expect(
      erreursIndisponibilite(ind('2026-10-12T00:00:00Z', '2027-10-14T00:00:00Z'), [], maintenant),
    ).toEqual(['trop-longue']);
  });

  it('RG-04-18 refuse une indisponibilité qui en chevauche une autre', () => {
    expect(
      erreursIndisponibilite(
        ind('2026-10-13T00:00:00Z', '2026-10-16T00:00:00Z'),
        [conge],
        maintenant,
      ),
    ).toEqual(['chevauchement']);
  });
});

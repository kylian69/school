import { describe, expect, it } from 'vitest';
import { dateNaissancePlausible, motifsDoublon, normaliserNom } from './doublons.js';

const ines = {
  nom: 'Benali',
  prenom: 'Inès',
  email: 'ines.benali@exemple.test',
  dateNaissance: '2006-03-14',
};

describe('RG-01-07 recherche des doublons', () => {
  it('normalise les noms : accents, casse, tirets et espaces', () => {
    expect(normaliserNom('  Jean-Éric  ')).toBe('jean eric');
    expect(normaliserNom('D’Alembert')).toBe('d alembert');
  });

  it('repère un même email, sans tenir compte de la casse', () => {
    expect(
      motifsDoublon({ ...ines, email: 'INES.Benali@exemple.test ', dateNaissance: null }, ines),
    ).toEqual(['email']);
  });

  it('repère un même nom, prénom et date de naissance, écrits autrement', () => {
    expect(
      motifsDoublon({ ...ines, prenom: 'ines', nom: 'BENALI', email: 'autre@exemple.test' }, ines),
    ).toEqual(['identite']);
    expect(motifsDoublon(ines, ines)).toEqual(['email', 'identite']);
  });

  it('ne compare pas l’identité sans date de naissance, ni avec une autre date', () => {
    const autre = { ...ines, email: 'autre@exemple.test' };
    expect(motifsDoublon({ ...autre, dateNaissance: null }, ines)).toEqual([]);
    expect(motifsDoublon({ ...autre, dateNaissance: '2006-03-15' }, ines)).toEqual([]);
    expect(motifsDoublon({ ...autre, nom: 'Benalli' }, ines)).toEqual([]);
    expect(motifsDoublon({ ...autre, prenom: 'Inés-Marie' }, ines)).toEqual([]);
  });

  it('accepte une date de naissance plausible seulement', () => {
    expect(dateNaissancePlausible('2006-03-14', '2026-10-05')).toBe(true);
    expect(dateNaissancePlausible('2027-01-01', '2026-10-05')).toBe(false);
    expect(dateNaissancePlausible('1899-12-31', '2026-10-05')).toBe(false);
  });
});

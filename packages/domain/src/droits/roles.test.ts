import { describe, expect, it } from 'vitest';
import { estRoleParDefaut, verifierModificationRole, verifierSuppressionRole } from './roles.js';

const catalogue = new Set(['personnes:lire', 'roles:gerer']);
const scolarite = { code: 'scolarite', doubleAuthentificationRequise: true };
const personnalise = { code: null, doubleAuthentificationRequise: false };

describe('US-01-10 et RG-01-15 gestion des rôles', () => {
  it('distingue les rôles par défaut des rôles personnalisés', () => {
    expect(estRoleParDefaut(scolarite)).toBe(true);
    expect(estRoleParDefaut(personnalise)).toBe(false);
  });

  it('verrouille le rôle d’administrateur', () => {
    expect(
      verifierModificationRole(
        { code: 'administrateur', doubleAuthentificationRequise: true },
        { permissions: [] },
        catalogue,
      ),
    ).toEqual({ ok: false, refus: 'role-verrouille' });
  });

  it('accepte des permissions du catalogue, refuse les autres', () => {
    expect(
      verifierModificationRole(scolarite, { permissions: ['personnes:lire'] }, catalogue),
    ).toEqual({ ok: true });
    expect(
      verifierModificationRole(scolarite, { permissions: ['notes:pirater'] }, catalogue),
    ).toEqual({ ok: false, refus: 'permission-inconnue' });
  });

  it('RG-00-13 garde l’exigence de double authentification des rôles par défaut', () => {
    expect(
      verifierModificationRole(scolarite, { doubleAuthentificationRequise: false }, catalogue),
    ).toEqual({ ok: false, refus: 'double-authentification-imposee' });
    expect(
      verifierModificationRole(scolarite, { doubleAuthentificationRequise: true }, catalogue),
    ).toEqual({ ok: true });
    expect(
      verifierModificationRole(personnalise, { doubleAuthentificationRequise: true }, catalogue),
    ).toEqual({ ok: true });
  });

  it('ne supprime ni un rôle par défaut ni un rôle encore attribué', () => {
    expect(verifierSuppressionRole(scolarite, 0)).toEqual({ ok: false, refus: 'role-par-defaut' });
    expect(verifierSuppressionRole(personnalise, 2)).toEqual({ ok: false, refus: 'role-attribue' });
    expect(verifierSuppressionRole(personnalise, 0)).toEqual({ ok: true });
  });
});

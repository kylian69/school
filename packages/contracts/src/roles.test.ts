import { describe, expect, it } from 'vitest';
import { isPermission } from './permissions.js';
import { ROLE_ADMINISTRATEUR, ROLES_PAR_DEFAUT } from './roles.js';

describe('RG-01-15 les 13 rôles par défaut', () => {
  it('sont 13, avec des codes uniques et des permissions du catalogue', () => {
    expect(ROLES_PAR_DEFAUT).toHaveLength(13);
    expect(new Set(ROLES_PAR_DEFAUT.map((r) => r.code)).size).toBe(13);
    for (const role of ROLES_PAR_DEFAUT) {
      expect(role.permissions.every(isPermission)).toBe(true);
    }
  });

  it("RG-00-13 exigent la double authentification pour l'administration, la direction, la scolarité et la finance", () => {
    const exigeants = ROLES_PAR_DEFAUT.filter((r) => r.doubleAuthentificationRequise).map(
      (r) => r.code,
    );
    expect(exigeants).toEqual(
      expect.arrayContaining(['administrateur', 'direction', 'scolarite', 'comptable']),
    );
    expect(exigeants).not.toContain('apprenant');
    expect(exigeants).not.toContain('intervenant');
  });

  it("donnent à l'administrateur seul l'attribution des rôles et la création de rôles", () => {
    const avec = (permission: string) =>
      ROLES_PAR_DEFAUT.filter((r) => (r.permissions as readonly string[]).includes(permission)).map(
        (r) => r.code,
      );
    expect(avec('roles:attribuer')).toEqual([ROLE_ADMINISTRATEUR]);
    expect(avec('roles:gerer')).toEqual([ROLE_ADMINISTRATEUR]);
  });
});

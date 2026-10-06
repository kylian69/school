import { describe, expect, it } from 'vitest';
import {
  doubleAuthentificationExigee,
  permissionsEffectives,
  verifierChangementAdministrateur,
  type AttributionEffective,
} from './droits.js';

const attribution = (partiel: Partial<AttributionEffective>): AttributionEffective => ({
  roleCode: 'scolarite',
  permissions: ['personnes:lire'],
  doubleAuthentificationRequise: false,
  perimetre: { type: 'organisation', id: null },
  debut: '2026-09-01',
  fin: null,
  ...partiel,
});

describe('RG-00-11 sans attribution, aucun droit ; RG-00-10 les rôles se cumulent', () => {
  it("n'accorde rien sans attribution", () => {
    expect(permissionsEffectives([], '2026-10-01').size).toBe(0);
  });

  it('cumule les permissions et les périmètres de plusieurs rôles, sans doublon', () => {
    const droits = permissionsEffectives(
      [
        attribution({ perimetre: { type: 'etablissement', id: 'campus-a' } }),
        attribution({
          perimetre: { type: 'etablissement', id: 'campus-b' },
          permissions: ['personnes:lire', 'audit:lire'],
        }),
        attribution({ perimetre: { type: 'etablissement', id: 'campus-a' } }),
      ],
      '2026-10-01',
    );
    expect(droits.get('personnes:lire')).toEqual([
      { type: 'etablissement', id: 'campus-a' },
      { type: 'etablissement', id: 'campus-b' },
    ]);
    expect(droits.get('audit:lire')).toEqual([{ type: 'etablissement', id: 'campus-b' }]);
  });

  it("ignore une attribution qui n'a pas commencé ou qui est terminée (fin exclue)", () => {
    const attributions = [
      attribution({ debut: '2026-11-01', permissions: ['audit:lire'] }),
      attribution({ fin: '2026-10-01', permissions: ['roles:attribuer'] }),
    ];
    expect([...permissionsEffectives(attributions, '2026-10-01').keys()]).toEqual([]);
    expect([...permissionsEffectives(attributions, '2026-09-30').keys()]).toEqual([
      'roles:attribuer',
    ]);
  });
});

describe('RG-00-13 double authentification', () => {
  it("est exigée par un rôle en cours qui l'impose", () => {
    expect(
      doubleAuthentificationExigee(
        [attribution({ doubleAuthentificationRequise: true })],
        '2026-10-01',
      ),
    ).toBe(true);
    expect(doubleAuthentificationExigee([attribution({})], '2026-10-01')).toBe(false);
    expect(
      doubleAuthentificationExigee(
        [attribution({ doubleAuthentificationRequise: true, fin: '2026-09-15' })],
        '2026-10-01',
      ),
    ).toBe(false);
  });
});

describe('RG-01-12 administrateurs', () => {
  it("laisse passer un changement qui ne concerne pas l'administration", () => {
    expect(
      verifierChangementAdministrateur({
        auteurEstAdministrateur: false,
        concerneAdministrateur: false,
        administrateursActifsApres: 0,
      }),
    ).toEqual({ ok: true });
  });

  it("réserve le rôle d'administrateur aux administrateurs", () => {
    expect(
      verifierChangementAdministrateur({
        auteurEstAdministrateur: false,
        concerneAdministrateur: true,
        administrateursActifsApres: 2,
      }),
    ).toEqual({ ok: false, refus: 'reserve-aux-administrateurs' });
  });

  it('garde toujours au moins un administrateur actif', () => {
    expect(
      verifierChangementAdministrateur({
        auteurEstAdministrateur: true,
        concerneAdministrateur: true,
        administrateursActifsApres: 0,
      }),
    ).toEqual({ ok: false, refus: 'dernier-administrateur' });
    expect(
      verifierChangementAdministrateur({
        auteurEstAdministrateur: true,
        concerneAdministrateur: true,
        administrateursActifsApres: 1,
      }),
    ).toEqual({ ok: true });
  });
});

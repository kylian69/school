import { describe, expect, it } from 'vitest';
import { etatInvitation, expirationInvitation, peutEtreInvite, relanceDue } from './invitation.js';

const envoyeeLe = new Date('2026-10-01T08:00:00Z');
const jours = (n: number) => new Date(envoyeeLe.getTime() + n * 86_400_000);
const invitation = {
  envoyeeLe,
  relances: 0,
  accepteeLe: null,
  revoqueeLe: null,
  expireLe: expirationInvitation(envoyeeLe),
};

describe('RG-01-08 invitations', () => {
  it('expirent à J+14', () => {
    expect(expirationInvitation(envoyeeLe).toISOString()).toBe('2026-10-15T08:00:00.000Z');
    expect(etatInvitation(invitation, jours(13.9))).toBe('valide');
    expect(etatInvitation(invitation, jours(14))).toBe('expiree');
  });

  it('sont à usage unique et révocables', () => {
    expect(etatInvitation({ ...invitation, accepteeLe: jours(1) }, jours(2))).toBe('utilisee');
    expect(etatInvitation({ ...invitation, revoqueeLe: jours(1) }, jours(2))).toBe('revoquee');
  });

  it('sont relancées à J+3 puis J+7, pas au-delà ni après usage', () => {
    expect(relanceDue(invitation, jours(2))).toBeNull();
    expect(relanceDue(invitation, jours(3))).toBe(1);
    expect(relanceDue({ ...invitation, relances: 1 }, jours(5))).toBeNull();
    expect(relanceDue({ ...invitation, relances: 1 }, jours(7))).toBe(2);
    expect(relanceDue({ ...invitation, relances: 2 }, jours(10))).toBeNull();
    expect(relanceDue({ ...invitation, accepteeLe: jours(1) }, jours(3))).toBeNull();
  });

  it('ne concernent pas un compte actif ou désactivé', () => {
    expect(peutEtreInvite('cree')).toBe(true);
    expect(peutEtreInvite('invite')).toBe(true);
    expect(peutEtreInvite('actif')).toBe(false);
    expect(peutEtreInvite('desactive')).toBe(false);
  });
});

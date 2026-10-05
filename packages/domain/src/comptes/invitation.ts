/**
 * Cycle de vie d'un compte et invitations (RG-01-08) : créé → invité → actif → désactivé.
 * Un compte invité non activé est relancé à J+3 et J+7 ; le lien expire à J+14 et peut être
 * renvoyé. Les liens sont à usage unique (module 01, section 9).
 */
export const ETATS_COMPTE = ['cree', 'invite', 'actif', 'desactive'] as const;
export type EtatCompte = (typeof ETATS_COMPTE)[number];

export const EXPIRATION_INVITATION_JOURS = 14;
export const RELANCES_INVITATION_JOURS = [3, 7] as const;

const JOUR_MS = 86_400_000;

export function expirationInvitation(envoyeeLe: Date): Date {
  return new Date(envoyeeLe.getTime() + EXPIRATION_INVITATION_JOURS * JOUR_MS);
}

export type EtatInvitation = 'valide' | 'expiree' | 'utilisee' | 'revoquee';

export function etatInvitation(
  invitation: { expireLe: Date; accepteeLe: Date | null; revoqueeLe: Date | null },
  maintenant: Date,
): EtatInvitation {
  if (invitation.accepteeLe) return 'utilisee';
  if (invitation.revoqueeLe) return 'revoquee';
  if (maintenant >= invitation.expireLe) return 'expiree';
  return 'valide';
}

/** Une invitation est envoyée à un compte créé ou déjà invité (renvoi), jamais à un compte actif. */
export function peutEtreInvite(etat: EtatCompte): boolean {
  return etat === 'cree' || etat === 'invite';
}

/** Numéro de la relance due (1 pour J+3, 2 pour J+7), ou null si aucune n'est due. */
export function relanceDue(
  invitation: {
    envoyeeLe: Date;
    relances: number;
    accepteeLe: Date | null;
    revoqueeLe: Date | null;
    expireLe: Date;
  },
  maintenant: Date,
): number | null {
  if (etatInvitation(invitation, maintenant) !== 'valide') return null;
  const prochaine = RELANCES_INVITATION_JOURS[invitation.relances];
  if (prochaine === undefined) return null;
  return maintenant.getTime() - invitation.envoyeeLe.getTime() >= prochaine * JOUR_MS
    ? invitation.relances + 1
    : null;
}

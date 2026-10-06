import { z } from 'zod';
import { ApparenceEcole } from './apparence.js';
import { PERMISSION_CODES } from './permissions.js';

/** Contexte de la session : école active, écoles du compte, droits et modules (RG-01-29). */
export const EcoleDuCompte = z.object({
  id: z.uuid(),
  nom: z.string(),
  nomAffichage: z.string(),
  acces: z.enum(['complet', 'lecture_seule', 'ferme']),
});

export const ContexteSession = z
  .object({
    ecoleActive: EcoleDuCompte.nullable(),
    ecoles: z.array(EcoleDuCompte),
    permissions: z.array(z.enum(PERMISSION_CODES as [string, ...string[]])),
    modules: z.array(z.string()),
    doubleAuthentificationExigee: z.boolean(),
    /** Double authentification activée sur le compte. */
    doubleAuthentificationActive: z.boolean(),
    /** Apparence de l’école active (US-01-14) ; null sans école active. */
    apparence: ApparenceEcole.nullable(),
  })
  .meta({ id: 'ContexteSession' });
export type ContexteSession = z.infer<typeof ContexteSession>;

export const ChoixEcole = z.object({ organisationId: z.uuid() }).meta({ id: 'ChoixEcole' });
export type ChoixEcole = z.infer<typeof ChoixEcole>;

/** Invitation consultée depuis le lien reçu par email (parcours d'activation). */
export const InvitationPublique = z
  .object({
    etat: z.enum(['valide', 'expiree', 'utilisee', 'revoquee']),
    prenom: z.string(),
    email: z.string(),
    ecole: z.string(),
    expireLe: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'InvitationPublique' });
export type InvitationPublique = z.infer<typeof InvitationPublique>;

export const ActivationCompte = z
  .object({
    motDePasse: z
      .string()
      .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
      .max(128),
    conditionsAcceptees: z.literal(true, 'Acceptez les conditions d’utilisation pour continuer.'),
  })
  .meta({ id: 'ActivationCompte' });
export type ActivationCompte = z.infer<typeof ActivationCompte>;

export const ResultatActivation = z
  .object({ email: z.string(), compteExistant: z.boolean() })
  .meta({ id: 'ResultatActivation' });

export const InvitationEnvoyee = z
  .object({ etat: z.literal('invite'), expireLe: z.iso.datetime({ offset: true }) })
  .meta({ id: 'InvitationEnvoyee' });

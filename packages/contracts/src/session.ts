import { z } from 'zod';
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
  })
  .meta({ id: 'ContexteSession' });
export type ContexteSession = z.infer<typeof ContexteSession>;

export const ChoixEcole = z.object({ organisationId: z.uuid() }).meta({ id: 'ChoixEcole' });
export type ChoixEcole = z.infer<typeof ChoixEcole>;

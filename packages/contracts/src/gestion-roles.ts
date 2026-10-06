import { z } from 'zod';
import { PERMISSION_CODES, SCOPES, type Permission } from './permissions.js';

/** Contrats de l'écran « Rôles et permissions » (E-01-07 ; US-01-10, RG-01-14, RG-01-15). */

const permission = z.enum(PERMISSION_CODES as [Permission, ...Permission[]]);
const libelle = z.string().trim().min(2, 'Le nom du rôle compte au moins 2 caractères.').max(80);
const description = z.string().trim().max(200);

export const RoleDetail = z
  .object({
    id: z.uuid(),
    /** Code d'un rôle par défaut ; null pour un rôle personnalisé. */
    code: z.string().nullable(),
    libelle: z.string(),
    description: z.string().nullable(),
    perimetreParDefaut: z.enum(SCOPES),
    doubleAuthentificationRequise: z.boolean(),
    permissions: z.array(permission),
    /** Personnes qui ont ce rôle aujourd'hui. */
    personnes: z.int().min(0),
    /** Rôle par défaut : non supprimable (RG-01-15). */
    parDefaut: z.boolean(),
    /** Rôle d'administrateur : permissions non modifiables (RG-01-12). */
    verrouille: z.boolean(),
  })
  .meta({ id: 'RoleDetail' });
export type RoleDetail = z.infer<typeof RoleDetail>;

export const ListeRoles = z.object({ roles: z.array(RoleDetail) }).meta({ id: 'ListeRoles' });
export type ListeRoles = z.infer<typeof ListeRoles>;

/** Création d'un rôle personnalisé, vierge ou par duplication d'un rôle existant. */
export const NouveauRole = z
  .object({
    libelle,
    description: description.optional(),
    /** Rôle dupliqué : ses permissions, son périmètre et son exigence de double authentification. */
    sourceId: z.uuid().optional(),
    permissions: z.array(permission).max(PERMISSION_CODES.length).optional(),
    doubleAuthentificationRequise: z.boolean().optional(),
  })
  .meta({ id: 'NouveauRole' });
export type NouveauRole = z.infer<typeof NouveauRole>;

export const ModificationRole = z
  .object({
    libelle: libelle.optional(),
    description: description.nullable().optional(),
    permissions: z.array(permission).max(PERMISSION_CODES.length).optional(),
    doubleAuthentificationRequise: z.boolean().optional(),
  })
  .meta({ id: 'ModificationRole' });
export type ModificationRole = z.infer<typeof ModificationRole>;

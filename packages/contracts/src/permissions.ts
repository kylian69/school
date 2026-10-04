/**
 * Catalogue des permissions (RG-01-14) : une permission est un couple ressource × action, écrit
 * `ressource:action`. Chaque module ajoute les siennes ; l'API et l'interface partagent ce
 * catalogue (l'interface masque ce que l'utilisateur ne peut pas faire, l'API refuse).
 */
export const PERMISSIONS = {
  'organisation:lire': "Consulter l'organisation et ses établissements",
  'organisation:modifier': "Modifier l'organisation et les établissements",
} as const;

export type Permission = keyof typeof PERMISSIONS;

/** Périmètres d'une attribution de rôle (module 01, section 6 ; RG-00-10, RG-00-11). */
export const SCOPES = ['organisation', 'etablissement', 'formation', 'promotion', 'soi'] as const;
export type Scope = (typeof SCOPES)[number];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

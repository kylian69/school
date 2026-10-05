/**
 * Catalogue des permissions (RG-01-14) : une permission est un couple ressource × action, écrit
 * `ressource:action`. Chaque module ajoute les siennes ; l'API et l'interface partagent ce
 * catalogue (l'interface masque ce que l'utilisateur ne peut pas faire, l'API refuse).
 * Les actions sur soi-même (profil, mot de passe, double authentification, export de ses
 * données) ne demandent aucune permission : elles sont ouvertes à toute personne connectée.
 */
export const PERMISSIONS = {
  // Module 01 · Socle (matrice de la section 2)
  'organisation:lire': "Consulter l'organisation et ses établissements",
  'organisation:modifier': "Modifier l'organisation et les établissements",
  'calendrier:lire': 'Consulter les années, périodes et fermetures',
  'calendrier:gerer': 'Gérer les années, périodes et fermetures',
  'personnes:lire': 'Consulter les fiches des personnes',
  'apprenants:inviter': 'Créer et inviter des apprenants',
  'personnel:inviter': 'Créer et inviter des intervenants et du personnel',
  'personnes:importer': 'Importer des personnes',
  'personnes:exporter': 'Exporter des personnes',
  'personnes:voir-en-tant-que': 'Voir l’espace d’un apprenant en lecture seule (RG-00-15)',
  'comptes:desactiver': 'Désactiver et réactiver des comptes',
  'roles:attribuer': 'Attribuer et retirer des rôles',
  'roles:gerer': 'Créer et modifier des rôles personnalisés',
  'audit:lire': "Consulter le journal d'audit",
  'apparence:gerer': "Personnaliser l'apparence et les modèles",
  'corbeille:restaurer': 'Restaurer des éléments depuis la corbeille',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_CODES = Object.keys(PERMISSIONS) as Permission[];

/** Périmètres d'une attribution de rôle (module 01, section 6 ; RG-00-10, RG-00-11). */
export const SCOPES = ['organisation', 'etablissement', 'formation', 'promotion', 'soi'] as const;
export type Scope = (typeof SCOPES)[number];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

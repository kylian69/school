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
  // Module 02 · Référentiel pédagogique (matrice de la section 2)
  'referentiel:lire': 'Consulter les formations, les maquettes et leurs règles de validation',
  'referentiel:gerer':
    'Créer et modifier les formations, les maquettes et leurs règles de validation',
  'referentiel:publier': 'Publier une version de maquette',
  'referentiel:parametrer':
    'Définir l’échelle de maîtrise et la bibliothèque de règles particulières',
  'promotions:lire': 'Consulter les promotions, groupes et inscriptions',
  'promotions:gerer':
    'Créer les promotions et les groupes, inscrire les apprenants et les répartir dans les groupes',
  'promotions:changer-version':
    'Changer la version de maquette d’une promotion en cours d’année (RG-02-05)',
  'salles:lire': 'Consulter les salles et leurs équipements',
  'salles:gerer': 'Créer et modifier les salles de ses établissements',
  'affectations:gerer': 'Affecter les intervenants aux modules, avec leurs heures prévues',
  // Module 03 · Alternance et stages
  'entreprises:lire': 'Consulter les entreprises, leurs contacts et leurs tuteurs',
  'entreprises:gerer': 'Créer et modifier les entreprises, leurs contacts et leurs tuteurs',
  'contrats:lire': 'Consulter les contrats d’alternance et les conventions de stage',
  'contrats:gerer': 'Créer et modifier les contrats d’alternance et les conventions de stage',
  'rythmes:lire': 'Consulter les rythmes et calendriers d’alternance',
  'rythmes:gerer': 'Définir les modèles de rythme, les calendriers et les exceptions individuelles',
  // Module 06 · Émargement
  'emargement:animer': 'Ouvrir l’appel d’une séance et suivre les présences',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_CODES = Object.keys(PERMISSIONS) as Permission[];

/** Périmètres d'une attribution de rôle (module 01, section 6 ; RG-00-10, RG-00-11). */
export const SCOPES = ['organisation', 'etablissement', 'formation', 'promotion', 'soi'] as const;
export type Scope = (typeof SCOPES)[number];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

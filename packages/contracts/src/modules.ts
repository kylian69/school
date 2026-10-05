/**
 * Modules fonctionnels de Scolaly (cahier des charges, modules 01 à 19). Le code est celui du
 * module NestJS correspondant (architecture section 2). Un module inactif pour une organisation
 * ne répond pas et n'apparaît pas dans l'interface (RG-19-04).
 */
export const MODULES = [
  { code: 'socle', numero: '01', libelle: 'Socle' },
  { code: 'referentiel', numero: '02', libelle: 'Référentiel pédagogique' },
  { code: 'alternance', numero: '03', libelle: 'Alternance et stages' },
  { code: 'emplois-du-temps', numero: '04', libelle: 'Calendrier et emplois du temps' },
  { code: 'cahier-de-texte', numero: '05', libelle: 'Cahier de texte' },
  { code: 'emargement', numero: '06', libelle: 'Émargement et assiduité' },
  { code: 'notes', numero: '07', libelle: 'Évaluations, notes et bulletins' },
  { code: 'portails', numero: '08', libelle: 'Portails et notifications' },
  { code: 'crm', numero: '09', libelle: 'CRM, candidatures et inscriptions' },
  { code: 'contrats', numero: '10', libelle: 'Contrats, OPCO et NPEC' },
  { code: 'facturation', numero: '11', libelle: 'Facturation' },
  { code: 'qualite', numero: '12', libelle: 'Qualité, Qualiopi et BPF' },
  { code: 'livret', numero: '13', libelle: 'Livret d’apprentissage et visites' },
  { code: 'jurys', numero: '14', libelle: 'Jurys et diplomation' },
  { code: 'devoirs', numero: '15', libelle: 'Devoirs en ligne et examens' },
  { code: 'pilotage', numero: '16', libelle: 'Tableaux de bord et exports réglementaires' },
  { code: 'handicap', numero: '17', libelle: 'Référent handicap' },
  { code: 'api-publique', numero: '18', libelle: 'API, connecteurs et connexion unique' },
] as const;

export type ModuleCode = (typeof MODULES)[number]['code'];

export const MODULE_CODES: readonly ModuleCode[] = MODULES.map((m) => m.code);

export function isModuleCode(value: string): value is ModuleCode {
  return (MODULE_CODES as readonly string[]).includes(value);
}

/** Formules commerciales (module 19, RG-19-04). */
export const FORMULES = ['essentiel', 'pro', 'entreprise'] as const;
export type Formule = (typeof FORMULES)[number];

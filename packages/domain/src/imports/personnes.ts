import { controlerIne } from '../personnes/matricule.js';
import { normaliserNom } from '../personnes/doublons.js';

/**
 * Import de personnes (US-01-05 ; RG-01-18) : correspondance des colonnes, puis contrôle ligne par
 * ligne avec erreurs (ligne refusée) et avertissements (valeur interprétée, à vérifier).
 */
export const CHAMPS_IMPORT = [
  'civilite',
  'nom',
  'nomUsage',
  'prenom',
  'email',
  'telephone',
  'adresseLigne1',
  'codePostal',
  'ville',
  'dateNaissance',
  'lieuNaissance',
  'ine',
  'matricule',
] as const;
export type ChampImport = (typeof CHAMPS_IMPORT)[number];

export const CHAMPS_OBLIGATOIRES: readonly ChampImport[] = ['nom', 'prenom', 'email'];

/** Intitulés de colonne reconnus pour chaque champ (comparés sans accents ni casse). */
const SYNONYMES: Record<ChampImport, readonly string[]> = {
  civilite: ['civilite', 'genre', 'sexe'],
  nom: ['nom', 'nom de famille', 'nom de naissance', 'patronyme'],
  nomUsage: ['nom d usage', 'nom usage', 'nom marital'],
  prenom: ['prenom', 'prenoms', 'premier prenom'],
  email: ['email', 'e mail', 'courriel', 'mail', 'adresse email', 'adresse mail', 'adresse e mail'],
  telephone: ['telephone', 'tel', 'portable', 'mobile', 'numero de telephone'],
  adresseLigne1: ['adresse', 'adresse postale', 'rue'],
  codePostal: ['code postal', 'cp'],
  ville: ['ville', 'commune', 'localite'],
  dateNaissance: ['date de naissance', 'naissance', 'ne le', 'nee le', 'date naissance'],
  lieuNaissance: ['lieu de naissance', 'ville de naissance', 'commune de naissance'],
  ine: ['ine', 'numero ine', 'identifiant national'],
  matricule: ['matricule', 'numero etudiant', 'numero apprenant', 'identifiant'],
};

export type Correspondance = Record<string, ChampImport | null>;

/** Correspondance proposée : chaque colonne reconnue vers son champ, chaque champ une fois. */
export function proposerCorrespondance(colonnes: readonly string[]): Correspondance {
  const pris = new Set<ChampImport>();
  const correspondance: Correspondance = {};
  for (const colonne of colonnes) {
    const forme = normaliserNom(colonne);
    const champ = CHAMPS_IMPORT.find((c) => !pris.has(c) && SYNONYMES[c].includes(forme)) ?? null;
    if (champ) pris.add(champ);
    correspondance[colonne] = champ;
  }
  return correspondance;
}

export type ProblemeLigne =
  | 'obligatoire'
  | 'email-invalide'
  | 'email-en-double'
  | 'email-existant'
  | 'date-invalide'
  | 'date-interpretee'
  | 'ine-invalide'
  | 'ine-existant'
  | 'matricule-pris'
  | 'civilite-inconnue';

export interface Probleme {
  champ: ChampImport;
  code: ProblemeLigne;
  /** Valeur retenue après interprétation (avertissement). */
  valeur?: string;
}

/** Date lue : ISO, JJ/MM/AAAA, numéro de série Excel, ou MM/JJ/AAAA quand c'est sans ambiguïté. */
export function interpreterDate(saisie: string): { date: string; interpretee: boolean } | null {
  const valeur = saisie.trim();
  const valide = (a: number, m: number, j: number) => {
    const d = new Date(Date.UTC(a, m - 1, j));
    return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j
      ? d.toISOString().slice(0, 10)
      : null;
  };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (iso) {
    const date = valide(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return date ? { date, interpretee: false } : null;
  }
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(valeur);
  if (fr) {
    const [a, b, annee] = [Number(fr[1]), Number(fr[2]), Number(fr[3])];
    // Format français par défaut ; un « mois » supérieur à 12 trahit un format américain.
    if (b > 12 && a <= 12) {
      const date = valide(annee, a, b);
      return date ? { date, interpretee: true } : null;
    }
    const date = valide(annee, b, a);
    return date ? { date, interpretee: false } : null;
  }
  // Cellule Excel lue comme un nombre : jours depuis le 30/12/1899.
  if (/^\d{4,5}$/.test(valeur)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(valeur) * 86_400_000);
    return { date: date.toISOString().slice(0, 10), interpretee: true };
  }
  return null;
}

const CIVILITES: Record<string, 'madame' | 'monsieur'> = {
  madame: 'madame',
  mme: 'madame',
  f: 'madame',
  femme: 'madame',
  monsieur: 'monsieur',
  m: 'monsieur',
  mr: 'monsieur',
  homme: 'monsieur',
  h: 'monsieur',
};

export interface LigneAnalysee {
  donnees: Partial<Record<ChampImport, string>>;
  erreurs: Probleme[];
  avertissements: Probleme[];
}

/** Ce que l'école contient déjà, pour repérer les conflits (RG-01-06, RG-01-07). */
export interface Existant {
  emails: ReadonlySet<string>;
  ines: ReadonlySet<string>;
  matricules: ReadonlySet<string>;
}

/**
 * Analyse des lignes d'après la correspondance. Un email déjà présent dans l'école est signalé
 * (la ligne mettra à jour la fiche existante si l'utilisateur le choisit à la validation).
 */
export function analyserLignes(
  colonnes: readonly string[],
  lignes: readonly (readonly string[])[],
  correspondance: Correspondance,
  existant: Existant,
): LigneAnalysee[] {
  const vus = new Set<string>();
  return lignes.map((ligne) => {
    const donnees: Partial<Record<ChampImport, string>> = {};
    colonnes.forEach((colonne, rang) => {
      const champ = correspondance[colonne];
      const valeur = (ligne[rang] ?? '').trim();
      if (champ && valeur !== '') donnees[champ] = valeur;
    });
    const erreurs: Probleme[] = [];
    const avertissements: Probleme[] = [];
    for (const champ of CHAMPS_OBLIGATOIRES) {
      if (!donnees[champ]) erreurs.push({ champ, code: 'obligatoire' });
    }
    if (donnees.email) {
      const email = donnees.email.toLowerCase();
      donnees.email = email;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        erreurs.push({ champ: 'email', code: 'email-invalide' });
      } else if (vus.has(email)) {
        erreurs.push({ champ: 'email', code: 'email-en-double' });
      } else if (existant.emails.has(email)) {
        avertissements.push({ champ: 'email', code: 'email-existant' });
      }
      vus.add(email);
    }
    if (donnees.dateNaissance) {
      const date = interpreterDate(donnees.dateNaissance);
      if (!date) {
        erreurs.push({ champ: 'dateNaissance', code: 'date-invalide' });
      } else {
        if (date.interpretee) {
          avertissements.push({
            champ: 'dateNaissance',
            code: 'date-interpretee',
            valeur: date.date,
          });
        }
        donnees.dateNaissance = date.date;
      }
    }
    if (donnees.ine) {
      const ine = donnees.ine.replace(/\s+/g, '').toUpperCase();
      donnees.ine = ine;
      if (controlerIne(ine) !== 'valide') erreurs.push({ champ: 'ine', code: 'ine-invalide' });
      else if (existant.ines.has(ine) && !existant.emails.has(donnees.email ?? '')) {
        erreurs.push({ champ: 'ine', code: 'ine-existant' });
      }
    }
    if (donnees.matricule && existant.matricules.has(donnees.matricule)) {
      erreurs.push({ champ: 'matricule', code: 'matricule-pris' });
    }
    if (donnees.civilite) {
      const civilite = CIVILITES[normaliserNom(donnees.civilite).replace(/[^a-z]/g, '')];
      if (civilite) {
        donnees.civilite = civilite;
      } else {
        // Valeur non reconnue : la civilité reste vide, à compléter sur la fiche.
        avertissements.push({
          champ: 'civilite',
          code: 'civilite-inconnue',
          valeur: donnees.civilite,
        });
        delete donnees.civilite;
      }
    }
    return { donnees, erreurs, avertissements };
  });
}

/**
 * Contrôle des identifiants d'une organisation et de ses établissements (RG-01-02) : format, puis
 * clé de contrôle quand l'identifiant en porte une. Ils sont facultatifs : une valeur absente est
 * acceptée, puis signalée comme manquante.
 */
export type ControleIdentifiant = 'valide' | 'format' | 'cle';

/** Lettres de la clé d'un UAI : l'alphabet sans I, O ni Q. */
const LETTRES_UAI = 'ABCDEFGHJKLMNPRSTUVWXYZ';

/** Somme de Luhn : un chiffre sur deux est doublé, en partant de la droite. */
function sommeLuhn(chiffres: string): number {
  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    const chiffre = Number(chiffres[chiffres.length - 1 - i]);
    const valeur = i % 2 === 1 ? chiffre * 2 : chiffre;
    somme += valeur > 9 ? valeur - 9 : valeur;
  }
  return somme;
}

/** UAI : 7 chiffres et une lettre, la lettre étant la clé (reste de la division par 23). */
export function controlerUai(uai: string): ControleIdentifiant {
  if (!/^\d{7}[A-Z]$/.test(uai)) return 'format';
  return LETTRES_UAI[Number(uai.slice(0, 7)) % 23] === uai[7] ? 'valide' : 'cle';
}

/** SIREN : 9 chiffres, clé de Luhn. */
export function controlerSiren(siren: string): ControleIdentifiant {
  if (!/^\d{9}$/.test(siren)) return 'format';
  return sommeLuhn(siren) % 10 === 0 ? 'valide' : 'cle';
}

/** SIREN de La Poste, dont les SIRET suivent une clé particulière. */
const SIREN_LA_POSTE = '356000000';

/**
 * SIRET : 14 chiffres, clé de Luhn. Les établissements de La Poste font exception : la somme de
 * leurs chiffres est un multiple de 5.
 */
export function controlerSiret(siret: string): ControleIdentifiant {
  if (!/^\d{14}$/.test(siret)) return 'format';
  if (siret.startsWith(SIREN_LA_POSTE) && siret !== `${SIREN_LA_POSTE}00048`) {
    const somme = Array.from(siret, Number).reduce((total, c) => total + c, 0);
    return somme % 5 === 0 ? 'valide' : 'cle';
  }
  return sommeLuhn(siret) % 10 === 0 ? 'valide' : 'cle';
}

/** Numéro de déclaration d'activité (NDA) : 11 chiffres, sans clé de contrôle. */
export function controlerNda(nda: string): ControleIdentifiant {
  return /^\d{11}$/.test(nda) ? 'valide' : 'format';
}

/** Normalise une saisie : espaces retirés, lettres en majuscules ; vide devient null. */
export function normaliserIdentifiant(valeur: string | null | undefined): string | null {
  const propre = (valeur ?? '').replace(/\s+/g, '').toUpperCase();
  return propre === '' ? null : propre;
}

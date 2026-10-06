/**
 * Table réglementaire datée (architecture section 3, règle « aucune règle légale en dur ») :
 * chaque valeur a une date de début, une date de fin (exclue, ou null si en vigueur) et sa source.
 * Les dates sont des dates légales au format AAAA-MM-JJ, sans fuseau.
 */
export interface DatedEntry<T> {
  /** Clé de la valeur dans la table (par exemple le type de donnée) ; 'defaut' si unique. */
  cle: string;
  debut: string;
  fin: string | null;
  source: string;
  valeur: T;
}

export interface DatedTable<T> {
  code: string;
  libelle: string;
  /** Vrai tant que la table n'a pas été relue par un juriste ou un DPO. */
  aValider?: boolean;
  entries: readonly DatedEntry<T>[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export class ReferentialError extends Error {
  override name = 'ReferentialError';
}

/** Valeur en vigueur à une date donnée, pour une clé. Lève une erreur explicite si aucune. */
export function valueAt<T>(table: DatedTable<T>, date: string, cle = 'defaut'): DatedEntry<T> {
  if (!isValidIsoDate(date)) {
    throw new ReferentialError(`Date invalide « ${date} » : format attendu AAAA-MM-JJ.`);
  }
  const entry = table.entries.find(
    (e) => e.cle === cle && e.debut <= date && (e.fin === null || date < e.fin),
  );
  if (!entry) {
    throw new ReferentialError(
      `Aucune valeur en vigueur le ${date} pour « ${cle} » dans la table « ${table.code} ». ` +
        'Mettre à jour packages/referentials avec la valeur et sa source officielle.',
    );
  }
  return entry;
}

/** Liste les anomalies d'une table : dates invalides, source absente, périodes qui se chevauchent. */
export function validateTable<T>(table: DatedTable<T>): string[] {
  const problems: string[] = [];
  const byKey = new Map<string, DatedEntry<T>[]>();
  for (const entry of table.entries) {
    const where = `${table.code}[${entry.cle} ${entry.debut}]`;
    if (!isValidIsoDate(entry.debut)) problems.push(`${where} : date de début invalide`);
    if (entry.fin !== null && !isValidIsoDate(entry.fin)) {
      problems.push(`${where} : date de fin invalide`);
    }
    if (entry.fin !== null && entry.fin <= entry.debut) {
      problems.push(`${where} : la fin doit être postérieure au début`);
    }
    if (entry.source.trim() === '') problems.push(`${where} : source absente`);
    byKey.set(entry.cle, [...(byKey.get(entry.cle) ?? []), entry]);
  }
  for (const [cle, entries] of byKey) {
    const sorted = [...entries].sort((a, b) => a.debut.localeCompare(b.debut));
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (previous && current && (previous.fin === null || previous.fin > current.debut)) {
        problems.push(
          `${table.code}[${cle}] : périodes qui se chevauchent à partir du ${current.debut}`,
        );
      }
    }
  }
  return problems;
}

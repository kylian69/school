/**
 * Calcul des jours fériés d'une année (RG-01-04) à partir de règles fournies par
 * packages/referentials : le domaine ne contient aucune liste légale.
 */
export type RegleJourFerie =
  | { code: string; libelle: string; type: 'fixe'; mois: number; jour: number }
  | { code: string; libelle: string; type: 'paques'; decalage: number };

export interface JourFerie {
  code: string;
  libelle: string;
  /** Date légale AAAA-MM-JJ. */
  date: string;
}

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus, Jones et Butcher). */
export function dimancheDePaques(annee: number): string {
  if (!Number.isInteger(annee) || annee < 1583) {
    throw new RangeError(`Année hors du calendrier grégorien : ${annee}`);
  }
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return toIsoDate(new Date(Date.UTC(annee, mois - 1, jour)));
}

/** Jours fériés d'une année civile, triés par date. */
export function joursFeries(annee: number, regles: readonly RegleJourFerie[]): JourFerie[] {
  const paques = new Date(`${dimancheDePaques(annee)}T00:00:00Z`);
  return regles
    .map((regle) => {
      const date =
        regle.type === 'fixe'
          ? new Date(Date.UTC(annee, regle.mois - 1, regle.jour))
          : new Date(paques.getTime() + regle.decalage * 86_400_000);
      return { code: regle.code, libelle: regle.libelle, date: toIsoDate(date) };
    })
    .sort((x, y) => x.date.localeCompare(y.date));
}

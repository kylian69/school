/**
 * Fenêtre de scan d'une séance (RG-06-02) : de 10 minutes avant le début à 15 minutes après ; au-delà
 * du début plus 5 minutes de tolérance, la présence est un retard, avec le nombre de minutes. Ces
 * durées sont paramétrables par formation : les valeurs ci-dessous sont celles par défaut.
 */
export interface ReglesScan {
  ouvertureAvantMinutes: number;
  fermetureApresMinutes: number;
  toleranceRetardMinutes: number;
}

export const REGLES_SCAN_PAR_DEFAUT: ReglesScan = {
  ouvertureAvantMinutes: 10,
  fermetureApresMinutes: 15,
  toleranceRetardMinutes: 5,
};

export type EvaluationScan =
  { ok: true; retardMinutes: number } | { ok: false; refus: 'trop-tot' | 'trop-tard' };

const MINUTE = 60_000;

/** Évalue l'heure d'un scan par rapport au début de la séance. */
export function evaluerScan(
  debutMs: number,
  scanMs: number,
  regles: ReglesScan = REGLES_SCAN_PAR_DEFAUT,
): EvaluationScan {
  if (scanMs < debutMs - regles.ouvertureAvantMinutes * MINUTE) {
    return { ok: false, refus: 'trop-tot' };
  }
  if (scanMs > debutMs + regles.fermetureApresMinutes * MINUTE) {
    return { ok: false, refus: 'trop-tard' };
  }
  const retard = scanMs - debutMs - regles.toleranceRetardMinutes * MINUTE;
  return { ok: true, retardMinutes: retard > 0 ? Math.ceil((scanMs - debutMs) / MINUTE) : 0 };
}

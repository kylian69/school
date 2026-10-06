import { fr } from '@/i18n/fr';

export type Resultat =
  | { ok: true; body: unknown }
  | { ok: false; erreur: string; details: readonly string[]; body?: unknown };

/**
 * Écriture depuis le navigateur vers l'API (même origine) : renvoie le corps, ou le message
 * d'erreur de l'API et le détail champ par champ (« champ : message »).
 */
export async function envoyer(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  /** Corps JSON, ou fichier envoyé tel quel avec son type. */
  corps?: unknown,
  erreurParDefaut: string = fr.connexion.erreurs.inattendue,
): Promise<Resultat> {
  try {
    const response = await fetch(url, {
      method,
      headers:
        corps === undefined
          ? {}
          : { 'content-type': corps instanceof Blob ? corps.type : 'application/json' },
      ...(corps === undefined
        ? {}
        : { body: corps instanceof Blob ? corps : JSON.stringify(corps) }),
    });
    const body = (await response.json().catch(() => null)) as {
      message?: unknown;
      details?: unknown;
    } | null;
    if (response.ok) return { ok: true, body };
    return {
      ok: false,
      body,
      erreur: typeof body?.message === 'string' ? body.message : erreurParDefaut,
      details: Array.isArray(body?.details)
        ? body.details.filter((d): d is string => typeof d === 'string')
        : [],
    };
  } catch {
    return { ok: false, erreur: fr.connexion.erreurs.reseau, details: [] };
  }
}

/** Message d'erreur d'un champ, d'après le détail renvoyé par l'API. */
export function erreurDuChamp(details: readonly string[], champ: string): string | undefined {
  const prefixe = `${champ} : `;
  return details.find((d) => d.startsWith(prefixe))?.slice(prefixe.length);
}

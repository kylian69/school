import 'server-only';
import { cookies } from 'next/headers';
import type { z } from 'zod';

const apiUrl = () => process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

/**
 * Lecture côté serveur auprès de l'API, avec le cookie de la personne connectée. La réponse est
 * validée par le schéma du contrat (packages/contracts) : une réponse inattendue donne null.
 */
export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<{ status: number; data: z.infer<S> | null }> {
  const cookieHeader = (await cookies()).toString();
  try {
    const response = await fetch(`${apiUrl()}${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: 'no-store',
    });
    if (!response.ok) return { status: response.status, data: null };
    const parsed = schema.safeParse(await response.json());
    return { status: response.status, data: parsed.success ? parsed.data : null };
  } catch {
    return { status: 503, data: null };
  }
}

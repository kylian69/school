import 'server-only';
import { cookies } from 'next/headers';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

/** Session de la personne connectée, lue auprès de l'API (cookie transmis tel quel). */
export async function getSession(): Promise<{ user: SessionUser } | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;
  try {
    const response = await fetch(`${apiUrl}/api/auth/get-session`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as { user: SessionUser } | null;
  } catch {
    return null;
  }
}

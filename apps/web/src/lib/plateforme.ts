import 'server-only';
import { MembrePlateforme } from '@scolaly/contracts';
import { apiGet } from './api';

/**
 * Accès à la console : rôle dans l'équipe Scolaly (null en auto-hébergement ou pour un
 * non-membre), et double authentification encore à mettre en place (RG-19-10).
 */
export async function getStatutConsole(): Promise<{
  role: MembrePlateforme['role'] | null;
  doubleAuthentificationRequise: boolean;
}> {
  const { status, data } = await apiGet('/api/plateforme/moi', MembrePlateforme);
  return { role: data?.role ?? null, doubleAuthentificationRequise: status === 403 };
}

/** Rôle dans l'équipe Scolaly, ou null (console absente, auto-hébergement ou non-membre). */
export async function getRolePlateforme(): Promise<MembrePlateforme['role'] | null> {
  return (await getStatutConsole()).role;
}

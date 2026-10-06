import 'server-only';
import { MembrePlateforme } from '@scolaly/contracts';
import { apiGet } from './api';

/** Rôle dans l'équipe Scolaly, ou null (console absente, auto-hébergement ou non-membre). */
export async function getRolePlateforme(): Promise<MembrePlateforme['role'] | null> {
  const { data } = await apiGet('/api/plateforme/moi', MembrePlateforme);
  return data?.role ?? null;
}

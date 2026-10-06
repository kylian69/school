import 'server-only';
import { ContexteSession } from '@scolaly/contracts';
import { apiGet } from './api';

/** École active, écoles du compte, droits et modules de la session. */
export async function getContexte(): Promise<ContexteSession | null> {
  return (await apiGet('/api/session/contexte', ContexteSession)).data;
}

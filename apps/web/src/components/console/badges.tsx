import type { ClientFiche } from '@scolaly/contracts';
import { Badge } from '@scolaly/ui';
import { fr } from '@/i18n/fr';

const TONS = { actif: 'ok', suspendu: 'warn', resilie: 'bad', supprime: 'neutral' } as const;

export function EtatClient({ etat }: { etat: ClientFiche['etat'] }) {
  return <Badge tone={TONS[etat]}>{fr.console.etats[etat]}</Badge>;
}

const TONS_ACCES = { complet: 'ok', lecture_seule: 'warn', ferme: 'bad' } as const;

export function AccesEcole({ acces }: { acces: ClientFiche['ecoles'][number]['acces'] }) {
  return <Badge tone={TONS_ACCES[acces]}>{fr.console.acces_ecole[acces]}</Badge>;
}

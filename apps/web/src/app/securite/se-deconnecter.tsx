'use client';

import { Button } from '@scolaly/ui';
import { useRouter } from 'next/navigation';
import { fr } from '@/i18n/fr';

/** Sortie possible sans mettre en place la double authentification exigée. */
export function SeDeconnecter() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={() => {
        void fetch('/api/auth/sign-out', { method: 'POST' })
          .catch(() => undefined)
          .then(() => {
            router.replace('/connexion');
            router.refresh();
          });
      }}
    >
      {fr.coquille.deconnexion}
    </Button>
  );
}

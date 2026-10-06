'use client';

import { Button } from '@scolaly/ui';
import { fr } from '@/i18n/fr';

export function RetryButton() {
  return (
    <Button
      onClick={() => {
        window.location.reload();
      }}
    >
      {fr.horsLigne.reessayer}
    </Button>
  );
}

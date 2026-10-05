'use client';

import { Button } from '@scolaly/ui';
import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { LienMagiqueForm } from './lien-magique-form';
import { LoginForm } from './login-form';

/** Connexion par mot de passe, ou par lien reçu par email (mot de passe oublié). */
export function ConnexionChoix() {
  const [parLien, setParLien] = useState(false);
  if (parLien) {
    return (
      <LienMagiqueForm
        onRetour={() => {
          setParLien(false);
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <LoginForm />
      <Button
        variant="ghost"
        onClick={() => {
          setParLien(true);
        }}
      >
        {fr.connexion.lienMagique.proposer}
      </Button>
    </div>
  );
}

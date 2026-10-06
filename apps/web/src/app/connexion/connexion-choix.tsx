'use client';

import { Button } from '@scolaly/ui';
import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { CodeForm } from './code-form';
import { LienMagiqueForm } from './lien-magique-form';
import { LoginForm } from './login-form';

/**
 * Connexion par mot de passe (puis code si la double authentification est active), ou par lien
 * reçu par email (mot de passe oublié).
 */
export function ConnexionChoix() {
  const [mode, setMode] = useState<'mot-de-passe' | 'lien' | 'code'>('mot-de-passe');
  const retour = () => {
    setMode('mot-de-passe');
  };
  if (mode === 'lien') return <LienMagiqueForm onRetour={retour} />;
  if (mode === 'code') return <CodeForm onRetour={retour} />;
  return (
    <div className="flex flex-col gap-3">
      <LoginForm
        onCodeRequis={() => {
          setMode('code');
        }}
      />
      <Button
        variant="ghost"
        onClick={() => {
          setMode('lien');
        }}
      >
        {fr.connexion.lienMagique.proposer}
      </Button>
    </div>
  );
}

'use client';

import type { Etablissement } from '@scolaly/contracts';
import { Button } from '@scolaly/ui';
import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { FormationDialog } from './formulaire-formation';

/** Bouton « Nouvelle formation » et son formulaire (US-02-01). */
export function NouvelleFormation({
  etablissements,
}: {
  etablissements: readonly Etablissement[];
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOuvert(true);
        }}
      >
        {fr.referentiel.nouvelle}
      </Button>
      <FormationDialog
        ouvert={ouvert}
        etablissements={etablissements}
        onFermer={() => {
          setOuvert(false);
        }}
      />
    </>
  );
}

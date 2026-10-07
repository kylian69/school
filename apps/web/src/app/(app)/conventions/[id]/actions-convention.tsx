'use client';

import type { ConventionStage } from '@scolaly/contracts';
import { Button } from '@scolaly/ui';
import { MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { useEnvoi } from '../../formations/envoi';

const t = fr.contrats.actions;
const SUIVANT = {
  brouillon: ['signee', t.signee],
  signee: ['en_cours', t.enCours],
  en_cours: ['terminee', t.terminee],
} as const;

/** Statuts d'une convention : brouillon → signée → en cours → terminée, ou annulée. */
export function ActionsConvention({ convention }: { convention: ConventionStage }) {
  const { erreurs, envoi, executer } = useEnvoi();
  if (convention.statut === 'terminee' || convention.statut === 'annulee') return null;
  const [suivant, libelle] = SUIVANT[convention.statut];
  const changer = (statut: string) =>
    executer(`/api/conventions-stage/${convention.id}`, 'PATCH', { statut });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button disabled={envoi} onClick={() => void changer(suivant)}>
          {libelle}
        </Button>
        <Button
          variant="ghost"
          disabled={envoi}
          onClick={() => {
            if (window.confirm(t.confirmerAnnulation)) void changer('annulee');
          }}
        >
          {t.annuler}
        </Button>
      </div>
      <MessageErreur erreurs={erreurs} />
    </div>
  );
}

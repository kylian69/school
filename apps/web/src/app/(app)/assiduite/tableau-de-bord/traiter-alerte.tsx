'use client';

import { Button } from '@scolaly/ui';
import { MessageErreur } from '@/components/formulaire';
import { fr } from '@/i18n/fr';
import { useEnvoi } from '../../formations/envoi';

const t = fr.assiduite.tableauDeBord;

/** RG-06-23 : l'alerte suivie (convocation, échange…) est marquée traitée ; la page se recharge. */
export function TraiterAlerte({ alerteId, apprenant }: { alerteId: string; apprenant: string }) {
  const { erreurs, envoi, executer } = useEnvoi();
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        disabled={envoi}
        aria-label={t.traiterLibelle(apprenant)}
        onClick={() => void executer(`/api/assiduite/alertes/${alerteId}/traitement`, 'POST')}
      >
        {t.traiter}
      </Button>
      <MessageErreur erreurs={erreurs} />
    </div>
  );
}

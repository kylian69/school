import { EchelleMaitrise, ListeReglesBibliotheque } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { EditeurReglesEcole } from './editeur-regles-ecole';

const t = fr.referentiel.ecole;
export const metadata: Metadata = { title: t.titre };

/** E-02-10 · Règles de l'école : échelle de maîtrise (RG-02-22) et règles particulières (RG-02-26). */
export default async function ReglesEcolePage() {
  const contexte = await getContexte();
  if (!(contexte?.permissions ?? []).includes('referentiel:parametrer')) notFound();
  const [{ data: echelle }, { data: bibliotheque }] = await Promise.all([
    apiGet('/api/referentiel/echelle', EchelleMaitrise),
    apiGet('/api/referentiel/regles', ListeReglesBibliotheque),
  ]);
  return (
    <>
      <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
      {echelle && bibliotheque ? (
        <EditeurReglesEcole echelle={echelle} regles={bibliotheque.regles} />
      ) : (
        <Card>
          <p role="alert" className="text-sm">
            {fr.referentiel.indisponible}
          </p>
        </Card>
      )}
    </>
  );
}

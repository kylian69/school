import { Entreprise, ListeOpcos } from '@scolaly/contracts';
import { Badge, Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { ContactsEntreprise } from './contacts-entreprise';
import { IdentiteEntreprise } from './identite-entreprise';

const t = fr.entreprises;
export const metadata: Metadata = { title: 'Fiche entreprise' };

/** E-03-02 · Fiche entreprise : identité, convention collective et OPCO, contacts et tuteurs. */
export default async function FicheEntreprisePage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('entreprises:lire') && !permissions.includes('entreprises:gerer'))
    notFound();
  const { id } = await params;
  const [{ data: entreprise }, { data: opcos }] = await Promise.all([
    apiGet(`/api/entreprises/${id}`, Entreprise),
    apiGet('/api/opcos', ListeOpcos),
  ]);
  if (!entreprise) {
    return (
      <Card>
        <p role="alert" className="text-sm">
          {t.fiche.introuvable}
        </p>
      </Card>
    );
  }
  const inviter =
    permissions.includes('apprenants:inviter') || permissions.includes('personnel:inviter');

  return (
    <>
      <nav aria-label="Fil d’Ariane" className="text-sm text-muted">
        <Link href="/entreprises" className="hover:underline">
          {t.titre}
        </Link>{' '}
        / {entreprise.raisonSociale}
      </nav>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">
          {entreprise.raisonSociale}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Badge>{`${t.colonnes.siret} ${entreprise.siret}`}</Badge>
          {entreprise.statut === 'fermee' ? (
            <Badge tone="bad" title={t.fermeeAide}>
              {t.fermee}
            </Badge>
          ) : null}
          {entreprise.aVerifier ? (
            <Badge tone="warn" title={t.aVerifierAide}>
              {t.aVerifier}
            </Badge>
          ) : null}
        </div>
      </div>
      <IdentiteEntreprise entreprise={entreprise} opcos={opcos?.opcos ?? []} />
      <ContactsEntreprise entreprise={entreprise} inviter={inviter} />
    </>
  );
}

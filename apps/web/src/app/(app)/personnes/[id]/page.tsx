import {
  ListeAttributions,
  ListeRoles,
  OrganisationDetail,
  PersonneDetail,
} from '@scolaly/contracts';
import { Badge, Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { FicheIdentite } from './fiche-identite';
import { RolesCompte } from './roles-compte';

const t = fr.personnes;
const TONS = { cree: 'neutral', invite: 'warn', actif: 'ok', desactive: 'bad' } as const;

export const metadata: Metadata = { title: 'Fiche personne' };

/** E-01-05 · Fiche personne : identité, coordonnées, rôles et état du compte. */
export default async function FichePersonnePage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = (await getContexte())?.permissions ?? [];
  if (!permissions.includes('personnes:lire')) notFound();
  const { id } = await params;
  const { data: personne, status } = await apiGet(`/api/personnes/${id}`, PersonneDetail);
  if (!personne) {
    return (
      <Card>
        <p role="alert" className="text-sm">
          {status === 404 || status === 400 ? t.fiche.introuvable : t.indisponible}
        </p>
      </Card>
    );
  }
  const [{ data: attributions }, { data: roles }, { data: organisation }] = await Promise.all([
    apiGet(`/api/personnes/${id}/attributions`, ListeAttributions),
    apiGet('/api/roles', ListeRoles),
    apiGet('/api/organisation', OrganisationDetail),
  ]);
  const nom = `${personne.prenom} ${personne.nomUsage ?? personne.nom}`;
  const initiales = `${personne.prenom[0] ?? ''}${(personne.nomUsage ?? personne.nom)[0] ?? ''}`;

  return (
    <>
      <nav aria-label="Fil d’Ariane" className="text-sm text-muted">
        <Link href="/personnes" className="hover:underline">
          {t.titre}
        </Link>{' '}
        / {nom}
      </nav>
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-lg font-bold text-accent"
        >
          {initiales.toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{nom}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge tone={TONS[personne.compteEtat]}>{t.etats[personne.compteEtat]}</Badge>
            {personne.roles.length === 0 ? (
              <Badge>{t.fiche.aucunRole}</Badge>
            ) : (
              personne.roles.map((r) => (
                <Badge key={r} tone="accent">
                  {r}
                </Badge>
              ))
            )}
          </div>
          <p className="text-sm text-muted">
            {[personne.email, personne.telephone].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <FicheIdentite
        personne={personne}
        modifiable={
          permissions.includes('apprenants:inviter') || permissions.includes('personnel:inviter')
        }
      />
      <RolesCompte
        personne={personne}
        attributions={attributions?.attributions ?? []}
        roles={roles?.roles ?? []}
        etablissements={(organisation?.etablissements ?? []).filter((e) => e.statut === 'actif')}
        droits={{
          attribuer: permissions.includes('roles:attribuer'),
          inviter:
            permissions.includes('apprenants:inviter') || permissions.includes('personnel:inviter'),
          desactiver: permissions.includes('comptes:desactiver'),
        }}
      />
    </>
  );
}

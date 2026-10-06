import { ListeRoles } from '@scolaly/contracts';
import { Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { RolesEditeur } from './roles-editeur';

const t = fr.roles;
export const metadata: Metadata = { title: t.titre };

/** E-01-07 · Rôles et permissions : liste des rôles et matrice de permissions (US-01-10). */
export default async function RolesPage() {
  const contexte = await getContexte();
  const permissions = contexte?.permissions ?? [];
  if (!permissions.includes('roles:gerer') && !permissions.includes('roles:attribuer')) notFound();
  const { data } = await apiGet('/api/roles', ListeRoles);

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{t.filAriane}</p>
        <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
      </div>
      {data ? (
        <RolesEditeur roles={data.roles} modifiable={permissions.includes('roles:gerer')} />
      ) : (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      )}
    </>
  );
}

import {
  AffectationsPromotion,
  DetailPromotion,
  ListePromotions,
  ListeSalles,
  SemaineEdt,
} from '@scolaly/contracts';
import { Button, Card, Label } from '@scolaly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { getContexte } from '@/lib/contexte';
import { formatDate } from '@/lib/format';
import { SELECT } from '../formations/envoi';
import { Planificateur } from './planificateur';
import { ajouterJours, estJour, lundiDe, numeroSemaine, partiesLocales } from './semaine';
import type { Referentiels } from './types';

const t = fr.edt;
export const metadata: Metadata = { title: t.titre };

const VUES = ['promotion', 'groupe', 'intervenant', 'salle'] as const;
type Vue = (typeof VUES)[number];

type Recherche = { etablissement?: string; vue?: string; id?: string; semaine?: string };

/** E-04-01 · Planificateur : grille de la semaine par promotion, groupe, intervenant ou salle. */
export default async function EmploiDuTempsPage({
  searchParams,
}: {
  searchParams: Promise<Recherche>;
}) {
  const recherche = await searchParams;
  const contexte = await getContexte();
  const permissions = contexte?.permissions ?? [];
  if (
    !contexte?.modules.includes('emplois-du-temps') ||
    !(permissions.includes('edt:lire') || permissions.includes('edt:gerer'))
  )
    notFound();

  const { data: liste } = await apiGet('/api/promotions', ListePromotions);
  if (!liste) return <Indisponible />;
  const etablissements = [
    ...new Map(liste.promotions.map((p) => [p.etablissement.id, p.etablissement])).values(),
  ];
  const etablissement =
    etablissements.find((e) => e.id === recherche.etablissement) ?? etablissements[0];
  if (!etablissement) {
    return (
      <>
        <Entete />
        <Card>
          <p className="text-sm text-muted">{t.sansPromotion}</p>
        </Card>
      </>
    );
  }
  const promotions = liste.promotions.filter((p) => p.etablissement.id === etablissement.id);

  const [{ data: salles }, details, affectations] = await Promise.all([
    apiGet(`/api/salles?etablissementId=${etablissement.id}`, ListeSalles),
    Promise.all(promotions.map((p) => apiGet(`/api/promotions/${p.id}`, DetailPromotion))),
    Promise.all(
      promotions.map((p) => apiGet(`/api/promotions/${p.id}/affectations`, AffectationsPromotion)),
    ),
  ]);

  const referentiels: Referentiels = {
    promotions: promotions.map((p, rang) => ({
      id: p.id,
      libelle: p.libelle,
      effectif: p.effectifs.inscrits,
      groupes: (details[rang]?.data?.groupes ?? []).map((g) => ({
        id: g.id,
        libelle: g.libelle,
        effectif: g.effectif,
      })),
      modules: (affectations[rang]?.data?.modules ?? []).map((m) => ({
        id: m.id,
        libelle: `${m.code} · ${m.intitule}`,
      })),
    })),
    intervenants: [
      ...new Map(
        affectations
          .flatMap((a) => a.data?.affectations ?? [])
          .map((a) => [a.intervenant.id, `${a.intervenant.prenom} ${a.intervenant.nom}`]),
      ),
    ]
      .map(([id, nom]) => ({ id, nom }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    salles: (salles?.salles ?? []).map((s) => ({
      id: s.id,
      nom: s.nom,
      capacite: s.capacite,
      type: s.type,
      fermee: s.statut === 'fermee',
    })),
  };

  const ressources: Record<Vue, { id: string; libelle: string }[]> = {
    promotion: referentiels.promotions,
    groupe: [
      ...new Map(
        referentiels.promotions.flatMap((p) => p.groupes.map((g) => [g.id, g] as const)),
      ).values(),
    ],
    intervenant: referentiels.intervenants.map((i) => ({ id: i.id, libelle: i.nom })),
    salle: referentiels.salles.map((s) => ({ id: s.id, libelle: s.nom })),
  };
  const vue: Vue = VUES.find((v) => v === recherche.vue) ?? 'promotion';
  const ressource =
    ressources[vue].find((r) => r.id === recherche.id) ?? ressources[vue][0] ?? null;
  const fuseauDefaut = 'Europe/Paris';
  const debut = lundiDe(
    estJour(recherche.semaine)
      ? recherche.semaine
      : partiesLocales(new Date().toISOString(), fuseauDefaut).jour,
  );

  const filtre = ressource
    ? `&${{ promotion: 'promotionId', groupe: 'groupeId', intervenant: 'intervenantId', salle: 'salleId' }[vue]}=${ressource.id}`
    : '';
  const { data: semaine } = ressource
    ? await apiGet(
        `/api/edt/semaine?etablissementId=${etablissement.id}&debut=${debut}${filtre}`,
        SemaineEdt,
      )
    : { data: null };

  const lien = (jour: string) => {
    const params = new URLSearchParams({ etablissement: etablissement.id, vue, semaine: jour });
    if (ressource) params.set('id', ressource.id);
    return `/emploi-du-temps?${params.toString()}`;
  };
  const fin = ajouterJours(debut, 6);

  return (
    <>
      <Entete />
      <form
        method="get"
        action="/emploi-du-temps"
        aria-label={t.filtres}
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="semaine" value={debut} />
        {etablissements.length > 1 ? (
          <Choix nom="etablissement" label={t.etablissement} valeur={etablissement.id}>
            {etablissements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </Choix>
        ) : (
          <input type="hidden" name="etablissement" value={etablissement.id} />
        )}
        <Choix nom="vue" label={t.vue} valeur={vue}>
          {VUES.map((v) => (
            <option key={v} value={v}>
              {t.vues[v]}
            </option>
          ))}
        </Choix>
        <Choix nom="id" label={t.ressource} valeur={ressource?.id ?? ''}>
          {ressources[vue].length === 0 ? <option value="">{t.aucuneRessource}</option> : null}
          {ressources[vue].map((r) => (
            <option key={r.id} value={r.id}>
              {r.libelle}
            </option>
          ))}
        </Choix>
        <Button type="submit" variant="secondary">
          {t.afficher}
        </Button>
      </form>
      <nav aria-label={t.titre} className="flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" size="icon">
          <Link href={lien(ajouterJours(debut, -7))} aria-label={t.semainePrecedente}>
            ‹
          </Link>
        </Button>
        <p className="text-sm font-semibold num" aria-live="polite">
          {t.semaine(numeroSemaine(debut), formatDate(debut), formatDate(fin))}
        </p>
        <Button asChild variant="secondary" size="icon">
          <Link href={lien(ajouterJours(debut, 7))} aria-label={t.semaineSuivante}>
            ›
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href={lien(lundiDe(partiesLocales(new Date().toISOString(), fuseauDefaut).jour))}>
            {t.cetteSemaine}
          </Link>
        </Button>
        {permissions.includes('edt:gerer') ? (
          <Button asChild variant="ghost" className="md:ml-auto">
            <Link href="/emploi-du-temps/import">{t.lienImport}</Link>
          </Button>
        ) : null}
      </nav>
      {!ressource ? (
        <Card>
          <p className="text-sm text-muted">{t.aucuneRessource}</p>
        </Card>
      ) : !semaine ? (
        <Indisponible />
      ) : (
        <Planificateur
          key={`${vue}-${ressource.id}-${debut}`}
          semaine={semaine}
          titre={ressource.libelle}
          referentiels={referentiels}
          defaut={{
            promotionIds: vue === 'promotion' ? [ressource.id] : [],
            groupeIds: vue === 'groupe' ? [ressource.id] : [],
            intervenantIds: vue === 'intervenant' ? [ressource.id] : [],
            salleId: vue === 'salle' ? ressource.id : null,
          }}
          droits={{
            gerer: semaine.creation && permissions.includes('edt:gerer'),
            forcer: permissions.includes('edt:forcer'),
          }}
        />
      )}
    </>
  );
}

function Entete() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
      <p className="text-sm text-muted">{t.aide}</p>
    </div>
  );
}

function Indisponible() {
  return (
    <Card>
      <p role="alert" className="text-sm">
        {t.indisponible}
      </p>
    </Card>
  );
}

function Choix({
  nom,
  label,
  valeur,
  children,
}: {
  nom: string;
  label: string;
  valeur: string;
  children: React.ReactNode;
}) {
  const id = `edt-${nom}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={nom} defaultValue={valeur} className={`${SELECT} md:w-auto`}>
        {children}
      </select>
    </div>
  );
}

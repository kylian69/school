import { sql } from 'drizzle-orm';
import type { Transaction } from './organisation-context.js';

/**
 * Lectures des feuilles d'émargement PDF (I4.4 ; RG-06-25, RG-06-26), sous la RLS de l'école de la
 * session. Jamais sur le chemin du scan : à la demande, depuis l'API.
 */

/** En-tête d'une séance : organisme, établissement, public, module, salle, intervenants. */
export interface EnTeteSeanceLue {
  seanceId: string;
  libelle: string;
  debut: Date;
  fin: Date;
  mode: 'presentiel' | 'distanciel' | 'hybride';
  organisme: string;
  etablissement: string | null;
  nda: string | null;
  fuseau: string | null;
  limiteMidi: string | null;
  salle: string | null;
  module: string | null;
  promotionIds: string[];
  formations: string[];
  publics: string[];
  intervenants: string[];
}

/**
 * Établissement d'une séance (comme etablissementDeSeance) : celui de la salle, sinon de la série,
 * sinon de la promotion du public, sinon le seul établissement actif de l'école.
 */
export async function enTetesDeSeances(
  tx: Transaction,
  seanceIds: readonly string[],
): Promise<EnTeteSeanceLue[]> {
  if (seanceIds.length === 0) return [];
  const ids = sql.join(
    seanceIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const resultat = await tx.execute<{
    seance_id: string;
    libelle: string;
    debut: string;
    fin: string;
    mode: EnTeteSeanceLue['mode'];
    organisme: string;
    etablissement: string | null;
    nda: string | null;
    fuseau: string | null;
    limite_midi: string | null;
    salle: string | null;
    module: string | null;
    promotion_ids: string[];
    formations: string[];
    publics: string[];
    intervenants: string[];
  }>(sql`
    with pub as (
      select sp.seance_id, coalesce(sp.promotion_id, gp.promotion_id) as promotion_id,
        g.libelle as groupe
      from seance_public sp
      left join groupe_promotion gp
        on gp.organisation_id = sp.organisation_id and gp.groupe_id = sp.groupe_id
        and gp.deleted_at is null
      left join groupe_eleves g on g.organisation_id = sp.organisation_id and g.id = sp.groupe_id
      where sp.seance_id in (${ids}) and sp.deleted_at is null
    )
    select s.id as seance_id, s.libelle, s.debut, s.fin, s.mode_presence as mode,
      o.nom_affichage as organisme, e.nom as etablissement, e.nda,
      e.fuseau_horaire as fuseau, to_char(e.edt_limite_midi, 'HH24:MI') as limite_midi,
      sa.nom as salle,
      case when m.id is null then null else m.intitule || ' (' || m.code || ')' end as module,
      coalesce((select array_agg(distinct p.promotion_id) from pub p
        where p.seance_id = s.id and p.promotion_id is not null), '{}') as promotion_ids,
      coalesce((select array_agg(distinct f.intitule order by f.intitule) from pub p
        join promotion pr on pr.organisation_id = s.organisation_id and pr.id = p.promotion_id
        join formation f on f.organisation_id = pr.organisation_id and f.id = pr.formation_id
        where p.seance_id = s.id), '{}') as formations,
      coalesce((select array_agg(distinct x order by x) from (
        select pr.libelle as x from pub p
          join promotion pr on pr.organisation_id = s.organisation_id and pr.id = p.promotion_id
          where p.seance_id = s.id and p.groupe is null
        union select p.groupe from pub p where p.seance_id = s.id and p.groupe is not null
      ) t), '{}') as publics,
      coalesce((select array_agg(pe.prenom || ' ' || pe.nom order by pe.nom, pe.prenom)
        from seance_intervenant si
        join personne pe on pe.organisation_id = si.organisation_id and pe.id = si.personne_id
        where si.seance_id = s.id and si.deleted_at is null), '{}') as intervenants
    from seance s
    join organisation o on o.id = s.organisation_id
    left join salle sa on sa.organisation_id = s.organisation_id and sa.id = s.salle_id
    left join maquette_module m on m.organisation_id = s.organisation_id and m.id = s.module_id
    left join lateral (
      select e.* from etablissement e
      where e.organisation_id = s.organisation_id and e.deleted_at is null and (
        e.id = sa.etablissement_id
        or e.id = (select ss.etablissement_id from seance_serie ss
          where ss.organisation_id = s.organisation_id and ss.id = s.serie_id)
        or e.id in (select pr.etablissement_id from pub p
          join promotion pr on pr.organisation_id = s.organisation_id and pr.id = p.promotion_id
          where p.seance_id = s.id)
        or (e.statut = 'actif' and (select count(*) from etablissement e2
          where e2.organisation_id = s.organisation_id and e2.deleted_at is null
            and e2.statut = 'actif') = 1)
      )
      order by (e.id = sa.etablissement_id) desc nulls last,
        (e.id = (select ss.etablissement_id from seance_serie ss
          where ss.organisation_id = s.organisation_id and ss.id = s.serie_id)) desc nulls last,
        e.nom
      limit 1
    ) e on true
    where s.id in (${ids}) and s.deleted_at is null
    order by s.debut, s.libelle`);
  return resultat.rows.map((r) => ({
    seanceId: r.seance_id,
    libelle: r.libelle,
    debut: new Date(r.debut),
    fin: new Date(r.fin),
    mode: r.mode,
    organisme: r.organisme,
    etablissement: r.etablissement,
    nda: r.nda,
    fuseau: r.fuseau,
    limiteMidi: r.limite_midi,
    salle: r.salle,
    module: r.module,
    promotionIds: r.promotion_ids,
    formations: r.formations,
    publics: r.publics,
    intervenants: r.intervenants,
  }));
}

/** Ce qui complète la liste signée d'une séance : mode des scans, décisions, justification. */
export async function complementsDeFeuille(tx: Transaction, seanceId: string) {
  const resultat = await tx.execute<{
    personne_id: string;
    nom: string;
    prenom: string;
    mode_scan: 'qr' | 'code' | 'manuel' | null;
    marque: boolean;
    justification: 'non-justifiee' | 'justifiee' | null;
  }>(sql`
    select pe.id as personne_id, pe.nom, pe.prenom,
      (select p.mode from presence p where p.seance_id = ${seanceId}
        and p.personne_id = pe.id and p.deleted_at is null) as mode_scan,
      exists (select 1 from presence_marquage pm where pm.seance_id = ${seanceId}
        and pm.personne_id = pe.id and pm.deleted_at is null) as marque,
      (select a.statut from absence a where a.seance_id = ${seanceId}
        and a.personne_id = pe.id and a.deleted_at is null) as justification
    from personne pe
    where pe.id in (
      select (l->>'personneId')::uuid from appel_validation v, jsonb_array_elements(v.liste) l
      where v.seance_id = ${seanceId} and v.deleted_at is null
    )`);
  return new Map(
    resultat.rows.map((r) => [
      r.personne_id,
      {
        nom: r.nom,
        prenom: r.prenom,
        modeScan: r.mode_scan,
        marque: r.marque,
        justification: r.justification,
      },
    ]),
  );
}

/** Séances validées d'une promotion sur une période (feuilles d'un mois, US-06-11). */
export async function seancesValideesDePromotion(
  tx: Transaction,
  promotionId: string,
  du: Date,
  au: Date,
): Promise<string[]> {
  const resultat = await tx.execute<{ id: string }>(sql`
    select s.id from seance s
    where s.deleted_at is null and s.debut >= ${du.toISOString()} and s.debut < ${au.toISOString()}
      and exists (select 1 from appel_validation v
        where v.seance_id = s.id and v.deleted_at is null)
      and exists (select 1 from seance_public sp
        left join groupe_promotion gp
          on gp.organisation_id = sp.organisation_id and gp.groupe_id = sp.groupe_id
          and gp.deleted_at is null
        where sp.seance_id = s.id and sp.deleted_at is null
          and coalesce(sp.promotion_id, gp.promotion_id) = ${promotionId})
    order by s.debut, s.libelle`);
  return resultat.rows.map((r) => r.id);
}

/**
 * Données du récapitulatif mensuel (RG-06-26) : séances attendues des apprenants donnés sur la
 * période (hors séances annulées ou reportées), avec le cadre de leur établissement, et leurs
 * retards et absences.
 */
export async function donneesRecapitulatif(
  tx: Transaction,
  personneIds: readonly string[],
  du: Date,
  au: Date,
) {
  if (personneIds.length === 0) return { seances: [], attendus: [], absences: [] };
  const ids = sql.join(
    personneIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const attendus = await tx.execute<{
    seance_id: string;
    personne_id: string;
    libelle: string;
    debut: string;
    fin: string;
    fuseau: string | null;
    limite_midi: string | null;
    validee: boolean;
  }>(sql`
    select a.seance_id, a.personne_id, s.libelle, s.debut, s.fin,
      seance_fuseau_horaire(s.organisation_id, s.id) as fuseau,
      (select to_char(min(e.edt_limite_midi), 'HH24:MI') from seance_public sp
        left join groupe_promotion gp
          on gp.organisation_id = sp.organisation_id and gp.groupe_id = sp.groupe_id
          and gp.deleted_at is null
        join promotion pr on pr.organisation_id = sp.organisation_id
          and pr.id = coalesce(sp.promotion_id, gp.promotion_id)
        join etablissement e on e.organisation_id = pr.organisation_id and e.id = pr.etablissement_id
        where sp.seance_id = s.id and sp.deleted_at is null) as limite_midi,
      exists (select 1 from appel_validation v
        where v.seance_id = s.id and v.deleted_at is null) as validee
    from seance_attendu_calcule a
    join seance s on s.organisation_id = a.organisation_id and s.id = a.seance_id
    where a.personne_id in (${ids}) and s.deleted_at is null
      and s.statut in ('publiee', 'brouillon')
      and s.debut >= ${du.toISOString()} and s.debut < ${au.toISOString()}`);
  const absences = await tx.execute<{
    seance_id: string;
    personne_id: string;
    nature: 'absence' | 'retard';
    minutes: number;
    statut: 'non-justifiee' | 'justifiee';
  }>(sql`
    select a.seance_id, a.personne_id, a.nature, a.minutes, a.statut
    from absence a join seance s on s.organisation_id = a.organisation_id and s.id = a.seance_id
    where a.personne_id in (${ids}) and a.deleted_at is null
      and s.debut >= ${du.toISOString()} and s.debut < ${au.toISOString()}`);
  const seances = new Map<
    string,
    {
      id: string;
      libelle: string;
      debut: Date;
      fin: Date;
      fuseau: string | null;
      limiteMidi: string | null;
      validee: boolean;
    }
  >();
  for (const r of attendus.rows)
    seances.set(r.seance_id, {
      id: r.seance_id,
      libelle: r.libelle,
      debut: new Date(r.debut),
      fin: new Date(r.fin),
      fuseau: r.fuseau,
      limiteMidi: r.limite_midi,
      validee: r.validee,
    });
  return {
    seances: [...seances.values()],
    attendus: attendus.rows.map((r) => ({ seanceId: r.seance_id, personneId: r.personne_id })),
    absences: absences.rows.map((r) => ({
      seanceId: r.seance_id,
      personneId: r.personne_id,
      nature: r.nature,
      minutes: r.minutes,
      statut: r.statut,
    })),
  };
}

/** Apprenants inscrits dans une promotion pendant la période (récapitulatif d'une promotion). */
export async function apprenantsDePromotion(
  tx: Transaction,
  promotionId: string,
  du: string,
  au: string,
) {
  const resultat = await tx.execute<{ personne_id: string; nom: string; prenom: string }>(sql`
    select distinct pe.id as personne_id, pe.nom, pe.prenom
    from inscription i
    join personne pe on pe.organisation_id = i.organisation_id and pe.id = i.personne_id
      and pe.deleted_at is null
    where i.promotion_id = ${promotionId} and i.deleted_at is null and i.etat <> 'preinscrit'
      and i.date_entree < ${au} and (i.date_sortie is null or i.date_sortie > ${du})
    order by pe.nom, pe.prenom`);
  return resultat.rows.map((r) => ({ personneId: r.personne_id, nom: r.nom, prenom: r.prenom }));
}

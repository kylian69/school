import { and, eq, gt, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { withOrganisation, type Transaction } from './organisation-context.js';
import { absence, justificatif } from './schema/emargement.js';
import { organisation } from './schema/organisation.js';
import { formation } from './schema/referentiel.js';
import { inscription, promotion } from './schema/scolarite.js';

/**
 * RG-06-23 : écoles qui ont des absences non justifiées depuis `depuis` (AAAA-MM-JJ), ou des
 * alertes encore à notifier ; le worker les évalue ensuite une à une, sous RLS.
 */
export async function ecolesAvecAbsencesNonJustifiees(
  db: Database,
  depuis: string,
): Promise<string[]> {
  const ecoles = await db.execute<{ organisation_id: string }>(
    sql`select organisation_id from ecoles_avec_absences_non_justifiees(${depuis}::date)`,
  );
  return ecoles.rows.map((e) => e.organisation_id);
}

export interface BilanEffacementJustificatifs {
  justificatifs: number;
  documents: number;
}

/**
 * RG-06-20, conservation (packages/referentials, `justificatif-absence`) : efface le document, la
 * précision de l'apprenant et le message de la scolarité des justificatifs déposés au plus tard à
 * `limite`. Le motif, la décision et le statut des absences restent. Le document est supprimé du
 * stockage avant d'effacer sa clé : un échec laisse la ligne intacte pour le passage suivant.
 * Idempotent ; une transaction par école, sous RLS.
 */
export async function effacerJustificatifsEchus(
  db: Database,
  limite: Date,
  supprimerDocument: (cle: string) => Promise<void>,
): Promise<BilanEffacementJustificatifs> {
  const ecoles = await db.execute<{ organisation_id: string }>(
    sql`select organisation_id from justificatifs_a_effacer(${limite.toISOString()}::timestamptz)`,
  );
  const bilan: BilanEffacementJustificatifs = { justificatifs: 0, documents: 0 };
  for (const { organisation_id: organisationId } of ecoles.rows) {
    await withOrganisation(db, organisationId, async (tx) => {
      const echus = and(
        lte(justificatif.deposeLe, limite),
        or(
          isNotNull(justificatif.documentCle),
          isNotNull(justificatif.precisionChiffre),
          isNotNull(justificatif.messageChiffre),
        ),
      );
      const lignes = await tx
        .select({ id: justificatif.id, documentCle: justificatif.documentCle })
        .from(justificatif)
        .where(echus)
        .for('update');
      if (lignes.length === 0) return;
      for (const l of lignes) {
        if (l.documentCle) {
          await supprimerDocument(l.documentCle);
          bilan.documents += 1;
        }
      }
      const effaces = await tx
        .update(justificatif)
        .set({
          documentCle: null,
          documentType: null,
          documentTaille: null,
          documentSha256: null,
          precisionChiffre: null,
          messageChiffre: null,
        })
        .where(
          inArray(
            justificatif.id,
            lignes.map((l) => l.id),
          ),
        )
        .returning({ id: justificatif.id });
      bilan.justificatifs += effaces.length;
    });
  }
  return bilan;
}

/** Seuils lus en base (tous null : hérités). */
type ColonnesSeuils = {
  assiduiteSeuilNiveau1: number | null;
  assiduiteSeuilNiveau2: number | null;
  assiduiteFenetreJours: number | null;
};

/** Seuils d'une école ou d'une formation ; null quand ils sont hérités. */
export function lireSeuils(c: ColonnesSeuils) {
  return c.assiduiteSeuilNiveau1 !== null &&
    c.assiduiteSeuilNiveau2 !== null &&
    c.assiduiteFenetreJours !== null
    ? {
        niveau1: c.assiduiteSeuilNiveau1,
        niveau2: c.assiduiteSeuilNiveau2,
        fenetreJours: c.assiduiteFenetreJours,
      }
    : null;
}

/** Colonnes à écrire pour des seuils (null : hérités). */
export function colonnesSeuils(
  s: { niveau1: number; niveau2: number; fenetreJours: number } | null,
): ColonnesSeuils {
  return {
    assiduiteSeuilNiveau1: s?.niveau1 ?? null,
    assiduiteSeuilNiveau2: s?.niveau2 ?? null,
    assiduiteFenetreJours: s?.fenetreJours ?? null,
  };
}

export interface DonneesSeuilsApprenant {
  personneId: string;
  /** Absences non justifiées de la période (retards exclus), jours locaux des séances. */
  absences: {
    jour: string;
    matin: boolean;
    apresMidi: boolean;
    nature: 'absence';
    minutes: number;
    statut: 'non-justifiee';
  }[];
  /** Seuils des formations où l'apprenant est inscrit `aujourdhui` (null : ceux de l'école). */
  formations: (ReturnType<typeof lireSeuils> | null)[];
  /** Promotions où il est inscrit `aujourdhui`. */
  promotionIds: string[];
}

/**
 * RG-06-23 : données du calcul des seuils, dans l'école de la transaction : seuils de l'école, et
 * pour chaque apprenant ayant au moins une absence non justifiée entre `depuis` et `aujourdhui`
 * (restreint à `personneIds` si donné), ses absences et les seuils de ses formations du jour.
 */
export async function donneesSeuilsAssiduite(
  tx: Transaction,
  depuis: string,
  aujourdhui: string,
  personneIds: readonly string[] | null = null,
): Promise<{ ecole: ReturnType<typeof lireSeuils>; apprenants: DonneesSeuilsApprenant[] }> {
  const [ecole] = await tx
    .select({
      assiduiteSeuilNiveau1: organisation.assiduiteSeuilNiveau1,
      assiduiteSeuilNiveau2: organisation.assiduiteSeuilNiveau2,
      assiduiteFenetreJours: organisation.assiduiteFenetreJours,
    })
    .from(organisation);
  const lignes = await tx
    .select({
      personneId: absence.personneId,
      jour: absence.jour,
      matin: absence.matin,
      apresMidi: absence.apresMidi,
      minutes: absence.minutes,
    })
    .from(absence)
    .where(
      and(
        eq(absence.nature, 'absence'),
        eq(absence.statut, 'non-justifiee'),
        gte(absence.jour, depuis),
        lte(absence.jour, aujourdhui),
        personneIds ? inArray(absence.personneId, [...personneIds]) : undefined,
      ),
    );
  const parApprenant = new Map<string, DonneesSeuilsApprenant>();
  for (const l of lignes) {
    const a = parApprenant.get(l.personneId) ?? {
      personneId: l.personneId,
      absences: [],
      formations: [],
      promotionIds: [],
    };
    a.absences.push({ ...l, nature: 'absence', statut: 'non-justifiee' });
    parApprenant.set(l.personneId, a);
  }
  if (parApprenant.size > 0) {
    const inscrits = await tx
      .select({
        personneId: inscription.personneId,
        promotionId: inscription.promotionId,
        assiduiteSeuilNiveau1: formation.assiduiteSeuilNiveau1,
        assiduiteSeuilNiveau2: formation.assiduiteSeuilNiveau2,
        assiduiteFenetreJours: formation.assiduiteFenetreJours,
      })
      .from(inscription)
      .innerJoin(promotion, eq(promotion.id, inscription.promotionId))
      .innerJoin(formation, eq(formation.id, promotion.formationId))
      .where(
        and(
          inArray(inscription.personneId, [...parApprenant.keys()]),
          isNull(inscription.deletedAt),
          lte(inscription.dateEntree, aujourdhui),
          or(isNull(inscription.dateSortie), gt(inscription.dateSortie, aujourdhui)),
        ),
      );
    for (const i of inscrits) {
      const a = parApprenant.get(i.personneId);
      a?.formations.push(lireSeuils(i));
      a?.promotionIds.push(i.promotionId);
    }
  }
  return { ecole: ecole ? lireSeuils(ecole) : null, apprenants: [...parApprenant.values()] };
}

export interface DestinataireAlerte {
  apprenantId: string;
  personneId: string;
  email: string;
  prenom: string;
  /** Seulement par le rôle « direction » : ne reçoit que le niveau 2 (RG-06-23). */
  direction: boolean;
}

/**
 * RG-03-20, RG-06-23 : personnes qui détiennent `assiduite:alertes` sur un périmètre couvrant une
 * promotion où l'apprenant est inscrit aujourd'hui (école, établissement, formation, promotion).
 */
export async function destinatairesAlertesAssiduite(
  tx: Transaction,
  apprenantIds: readonly string[],
): Promise<DestinataireAlerte[]> {
  if (apprenantIds.length === 0) return [];
  const resultat = await tx.execute<{
    apprenant_id: string;
    personne_id: string;
    email: string;
    prenom: string;
    direction: boolean;
  }>(sql`
    select i.personne_id as apprenant_id, p.id as personne_id, p.email, p.prenom,
      bool_and(coalesce(r.code, '') = 'direction') as direction
    from inscription i
    join promotion pr on pr.id = i.promotion_id and pr.deleted_at is null
    join attribution a on a.deleted_at is null and a.debut <= current_date
      and (a.fin is null or a.fin > current_date)
      and (a.perimetre_type = 'organisation'
        or (a.perimetre_type = 'etablissement' and a.perimetre_id = pr.etablissement_id)
        or (a.perimetre_type = 'formation' and a.perimetre_id = pr.formation_id)
        or (a.perimetre_type = 'promotion' and a.perimetre_id = pr.id))
    join role r on r.id = a.role_id and r.deleted_at is null
    join role_permission rp on rp.role_id = r.id and rp.deleted_at is null
      and rp.permission = 'assiduite:alertes'
    join personne p on p.id = a.personne_id and p.deleted_at is null
    where i.personne_id in (${sql.join(
      apprenantIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
      and i.deleted_at is null and i.date_entree <= current_date
      and (i.date_sortie is null or i.date_sortie > current_date)
    group by i.personne_id, p.id, p.email, p.prenom
  `);
  return resultat.rows.map((r) => ({
    apprenantId: r.apprenant_id,
    personneId: r.personne_id,
    email: r.email,
    prenom: r.prenom,
    direction: r.direction,
  }));
}

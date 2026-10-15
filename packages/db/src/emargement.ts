import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
  type AnyColumn,
} from 'drizzle-orm';
import type { Database } from './client.js';
import { withOrganisation, type Transaction } from './organisation-context.js';
import {
  appelValidation,
  presence,
  seance,
  seanceAttenduCalcule,
  seancePublic,
  seanceSerie,
} from './schema/emargement.js';
import { formation } from './schema/referentiel.js';
import { groupePromotion, promotion, salle } from './schema/scolarite.js';
import { etablissement } from './schema/structure.js';
import { authSession, authUser } from './schema/auth.js';
import { personne } from './schema/personne.js';

/** Présence lue dans le flux de l'émargement. */
export interface PresenceAEcrire {
  organisationId: string;
  seanceId: string;
  personneId: string;
  scanneLe: string;
  mode: 'qr' | 'code' | 'manuel';
  rejoue: boolean;
  /** RG-06-10 : résultat du contrôle de localisation ; absent ou null sans contrôle. */
  localisation?: 'sur-place' | 'hors-site' | 'inconnu' | null;
  /** RG-06-08 : émargement à distance ; absent : en salle. */
  aDistance?: boolean;
  /** RG-06-02 : minutes de retard du scan ; absent ou 0 : à l'heure. */
  retardMinutes?: number;
}

/**
 * RG-06-09 : réglage du contrôle de localisation des formations du public de chaque séance
 * (promotions du public, et promotions des groupes du public). Une séance sans formation connue
 * n'a pas d'entrée. Lu au préchargement, jamais pendant le scan.
 */
export async function localisationDesFormations(
  tx: Transaction,
  seanceIds: readonly string[],
): Promise<Map<string, boolean[]>> {
  const parSeance = new Map<string, Map<string, boolean>>();
  if (seanceIds.length === 0) return new Map();
  const colonnes = {
    seanceId: seancePublic.seanceId,
    formationId: formation.id,
    active: formation.localisationActive,
  };
  // Requêtes successives : une transaction ne traite qu'une requête à la fois.
  const directes = await tx
    .select(colonnes)
    .from(seancePublic)
    .innerJoin(
      promotion,
      and(
        eq(promotion.organisationId, seancePublic.organisationId),
        eq(promotion.id, seancePublic.promotionId),
      ),
    )
    .innerJoin(
      formation,
      and(
        eq(formation.organisationId, promotion.organisationId),
        eq(formation.id, promotion.formationId),
      ),
    )
    .where(and(inArray(seancePublic.seanceId, [...seanceIds]), isNull(seancePublic.deletedAt)));
  const parGroupe = await tx
    .select(colonnes)
    .from(seancePublic)
    .innerJoin(
      groupePromotion,
      and(
        eq(groupePromotion.organisationId, seancePublic.organisationId),
        eq(groupePromotion.groupeId, seancePublic.groupeId),
        isNull(groupePromotion.deletedAt),
      ),
    )
    .innerJoin(
      promotion,
      and(
        eq(promotion.organisationId, groupePromotion.organisationId),
        eq(promotion.id, groupePromotion.promotionId),
      ),
    )
    .innerJoin(
      formation,
      and(
        eq(formation.organisationId, promotion.organisationId),
        eq(formation.id, promotion.formationId),
      ),
    )
    .where(and(inArray(seancePublic.seanceId, [...seanceIds]), isNull(seancePublic.deletedAt)));
  for (const l of [...directes, ...parGroupe]) {
    const formations = parSeance.get(l.seanceId) ?? new Map<string, boolean>();
    formations.set(l.formationId, l.active);
    parSeance.set(l.seanceId, formations);
  }
  return new Map([...parSeance].map(([id, f]) => [id, [...f.values()]]));
}

/**
 * Établissement d'une séance pour le contrôle de localisation (RG-06-10) : celui de la salle, sinon
 * celui de la série, sinon le seul établissement de l'école. Plusieurs établissements sans salle ni
 * série : on ne devine pas, rien n'est contrôlé. Lu au préchargement, jamais pendant le scan.
 */
export async function etablissementDeSeance(
  tx: Transaction,
  s: { salleId: string | null; serieId: string | null },
) {
  const colonnes = {
    localisationActive: etablissement.localisationActive,
    localisationLatitude: etablissement.localisationLatitude,
    localisationLongitude: etablissement.localisationLongitude,
    localisationRayon: etablissement.localisationRayon,
    localisationPlagesIp: etablissement.localisationPlagesIp,
  };
  if (s.salleId) {
    const [trouve] = await tx
      .select(colonnes)
      .from(salle)
      .innerJoin(
        etablissement,
        and(
          eq(etablissement.organisationId, salle.organisationId),
          eq(etablissement.id, salle.etablissementId),
        ),
      )
      .where(eq(salle.id, s.salleId));
    if (trouve) return trouve;
  }
  if (s.serieId) {
    const [trouve] = await tx
      .select(colonnes)
      .from(seanceSerie)
      .innerJoin(
        etablissement,
        and(
          eq(etablissement.organisationId, seanceSerie.organisationId),
          eq(etablissement.id, seanceSerie.etablissementId),
        ),
      )
      .where(eq(seanceSerie.id, s.serieId));
    if (trouve) return trouve;
  }
  const tous = await tx
    .select(colonnes)
    .from(etablissement)
    .where(and(isNull(etablissement.deletedAt), eq(etablissement.statut, 'actif')))
    .limit(2);
  return tous.length === 1 ? (tous[0] ?? null) : null;
}

/**
 * RGPD-03, conservation : efface le résultat du contrôle de localisation des présences scannées au
 * plus tard à `limite` (packages/referentials, `presence-localisation`) ; la présence reste.
 * Idempotent ; une transaction par école, sous RLS. Renvoie le nombre de résultats effacés.
 */
export async function effacerLocalisationsEchues(db: Database, limite: Date): Promise<number> {
  const ecoles = await db.execute<{ organisation_id: string }>(
    sql`select organisation_id from localisations_a_effacer(${limite.toISOString()}::timestamptz)`,
  );
  let effaces = 0;
  for (const { organisation_id: organisationId } of ecoles.rows) {
    effaces += await withOrganisation(db, organisationId, async (tx) => {
      const lignes = await tx
        .update(presence)
        .set({ localisation: null })
        .where(and(lte(presence.scanneLe, limite), isNotNull(presence.localisation)))
        .returning({ id: presence.id });
      return lignes.length;
    });
  }
  return effaces;
}

/** Séances qui commencent dans l'intervalle, toutes écoles confondues (préchargement, RG-00-17). */
export async function seancesAPrecharger(
  db: Database,
  de: Date,
  a: Date,
): Promise<{ organisationId: string; seanceId: string }[]> {
  const resultat = await db.execute<{ organisation_id: string; id: string }>(
    sql`select organisation_id, id from seances_a_precharger(${de.toISOString()}::timestamptz, ${a.toISOString()}::timestamptz)`,
  );
  return resultat.rows.map((r) => ({ organisationId: r.organisation_id, seanceId: r.id }));
}

export interface NotificationsEdtEnAttente {
  organisationId: string;
  personneId: string;
  urgente: boolean;
  premier: Date;
  dernier: Date;
}

/** RG-04-14 : personnes ayant des changements d'EDT à recevoir, toutes organisations (worker). */
export async function notificationsEdtEnAttente(
  db: Database,
): Promise<NotificationsEdtEnAttente[]> {
  const resultat = await db.execute<{
    organisation_id: string;
    personne_id: string;
    urgente: boolean;
    premier: string | Date;
    dernier: string | Date;
  }>(sql`select * from notifications_edt_en_attente()`);
  return resultat.rows.map((r) => ({
    organisationId: r.organisation_id,
    personneId: r.personne_id,
    urgente: r.urgente,
    premier: new Date(r.premier),
    dernier: new Date(r.dernier),
  }));
}

export interface NotificationsEdtParFuseau {
  organisationId: string;
  personneId: string;
  /** Fuseau de l'établissement des séances ; null : séance sans public. */
  fuseau: string | null;
  /** Plus ancien changement en attente. */
  premier: Date;
}

/**
 * RG-04-14 : personnes ayant des changements d'EDT à recevoir, par fuseau de séance, toutes
 * organisations (récapitulatif du worker).
 */
export async function notificationsEdtParFuseau(
  db: Database,
): Promise<NotificationsEdtParFuseau[]> {
  const resultat = await db.execute<{
    organisation_id: string;
    personne_id: string;
    fuseau: string | null;
    premier: string | Date;
  }>(sql`select * from notifications_edt_par_fuseau()`);
  return resultat.rows.map((r) => ({
    organisationId: r.organisation_id,
    personneId: r.personne_id,
    fuseau: r.fuseau,
    premier: new Date(r.premier),
  }));
}

/** Fuseau de l'établissement d'une séance (null sans public), sous la RLS de son école. */
export const fuseauDeSeance = (seanceId: AnyColumn) =>
  sql<string | null>`seance_fuseau_horaire(app_current_organisation_id(), ${seanceId})`;

/** La séance et ses apprenants attendus (avec leur compte), dans le contexte de son école. */
export async function seanceEtAttendus(tx: Transaction, seanceId: string) {
  const [ligne] = await tx
    .select()
    .from(seance)
    .where(and(eq(seance.id, seanceId), isNull(seance.deletedAt)));
  if (!ligne) return null;
  const attendus = await tx
    .select({
      personneId: personne.id,
      userId: personne.userId,
      nom: personne.nom,
      prenom: personne.prenom,
      /** Photo validée (RG-01-27 : visible des intervenants, pour la liste d'appel). */
      photoCle: personne.photoCle,
    })
    .from(seanceAttenduCalcule)
    .innerJoin(
      personne,
      and(
        eq(personne.organisationId, seanceAttenduCalcule.organisationId),
        eq(personne.id, seanceAttenduCalcule.personneId),
      ),
    )
    .where(and(eq(seanceAttenduCalcule.seanceId, seanceId), isNull(personne.deletedAt)))
    .orderBy(personne.nom, personne.prenom);
  return { seance: ligne, attendus };
}

/**
 * Écrit un lot de présences venues du flux (RG-00-18), une requête par école, en ignorant celles
 * déjà écrites : le lot peut être rejoué sans doublon. Renvoie le nombre de lignes ajoutées.
 */
export async function enregistrerPresences(
  db: Database,
  presences: readonly PresenceAEcrire[],
): Promise<number> {
  const parEcole = new Map<string, PresenceAEcrire[]>();
  for (const p of presences) {
    parEcole.set(p.organisationId, [...(parEcole.get(p.organisationId) ?? []), p]);
  }
  let ajoutees = 0;
  for (const [organisationId, lot] of parEcole) {
    ajoutees += await withOrganisation(db, organisationId, async (tx) => {
      const lignes = await tx
        .insert(presence)
        .values(
          lot.map((p) => ({
            organisationId,
            seanceId: p.seanceId,
            personneId: p.personneId,
            scanneLe: new Date(p.scanneLe),
            mode: p.mode,
            rejoue: p.rejoue,
            localisation: p.localisation ?? null,
            aDistance: p.aDistance ?? false,
            retardMinutes: p.retardMinutes || null,
          })),
        )
        .onConflictDoNothing({
          target: [presence.organisationId, presence.seanceId, presence.personneId],
        })
        .returning({ id: presence.id });
      return lignes.length;
    });
  }
  return ajoutees;
}

/** École d'une séance, toutes écoles confondues (mode dégradé de l'émargement). */
export async function organisationDeSeance(db: Database, seanceId: string): Promise<string | null> {
  const resultat = await db.execute<{ organisation_id: string | null }>(
    sql`select seance_organisation(${seanceId}::uuid) as organisation_id`,
  );
  return resultat.rows[0]?.organisation_id ?? null;
}

/**
 * Écrit une présence directement en base (mode dégradé) : renvoie la présence déjà enregistrée
 * si l'apprenant avait émargé, sinon rien.
 */
export async function enregistrerPresenceDirecte(
  tx: Transaction,
  p: PresenceAEcrire,
): Promise<{
  scanneLe: Date;
  rejoue: boolean;
  localisation: NonNullable<PresenceAEcrire['localisation']> | null;
  aDistance: boolean;
  retardMinutes: number | null;
} | null> {
  const [ajoutee] = await tx
    .insert(presence)
    .values({
      organisationId: p.organisationId,
      seanceId: p.seanceId,
      personneId: p.personneId,
      scanneLe: new Date(p.scanneLe),
      mode: p.mode,
      rejoue: p.rejoue,
      localisation: p.localisation ?? null,
      aDistance: p.aDistance ?? false,
      retardMinutes: p.retardMinutes || null,
    })
    .onConflictDoNothing({
      target: [presence.organisationId, presence.seanceId, presence.personneId],
    })
    .returning({ id: presence.id });
  if (ajoutee) return null;
  const [existante] = await tx
    .select({
      scanneLe: presence.scanneLe,
      rejoue: presence.rejoue,
      localisation: presence.localisation,
      aDistance: presence.aDistance,
      retardMinutes: presence.retardMinutes,
    })
    .from(presence)
    .where(and(eq(presence.seanceId, p.seanceId), eq(presence.personneId, p.personneId)));
  return existante ?? null;
}

/** Fiche attendue à la séance pour ce compte (mode dégradé : une ligne, pas toute la liste). */
export async function attenduDeSeance(
  tx: Transaction,
  seanceId: string,
  userId: string,
): Promise<string | null> {
  const [trouve] = await tx
    .select({ personneId: personne.id })
    .from(seanceAttenduCalcule)
    .innerJoin(
      personne,
      and(
        eq(personne.organisationId, seanceAttenduCalcule.organisationId),
        eq(personne.id, seanceAttenduCalcule.personneId),
      ),
    )
    .where(
      and(
        eq(seanceAttenduCalcule.seanceId, seanceId),
        eq(personne.userId, userId),
        isNull(personne.deletedAt),
      ),
    );
  return trouve?.personneId ?? null;
}

/** Sessions en cours des comptes donnés, avec leur utilisateur (remise en cache, RG-00-17). */
export async function sessionsDesComptes(db: Database, userIds: readonly string[]) {
  const sessions: {
    session: typeof authSession.$inferSelect;
    user: typeof authUser.$inferSelect;
  }[] = [];
  for (let debut = 0; debut < userIds.length; debut += 5000) {
    const lot = userIds.slice(debut, debut + 5000);
    const lignes = await db
      .select({ session: authSession, user: authUser })
      .from(authSession)
      .innerJoin(authUser, eq(authUser.id, authSession.userId))
      .where(and(inArray(authSession.userId, lot), gt(authSession.expiresAt, new Date())));
    sessions.push(...lignes);
  }
  return sessions;
}

/** Validations de l'appel d'une séance (RG-06-13), de la première à la dernière version. */
export async function validationsDeSeance(tx: Transaction, seanceId: string) {
  return tx
    .select({
      version: appelValidation.version,
      valideLe: appelValidation.valideLe,
      nom: personne.nom,
      prenom: personne.prenom,
      empreinte: appelValidation.empreinte,
      motif: appelValidation.motif,
      commentaire: appelValidation.commentaire,
      correctionVerrouillee: appelValidation.correctionVerrouillee,
      liste: appelValidation.liste,
    })
    .from(appelValidation)
    .innerJoin(
      personne,
      and(
        eq(personne.organisationId, appelValidation.organisationId),
        eq(personne.id, appelValidation.validePar),
      ),
    )
    .where(and(eq(appelValidation.seanceId, seanceId), isNull(appelValidation.deletedAt)))
    .orderBy(appelValidation.version);
}

/**
 * Apprenants que l'intervenant peut ajouter à l'appel (module 06, section 7 : inscrit dans le
 * mauvais groupe) : inscrits le jour de la séance dans une promotion d'un attendu, sans être
 * attendus. La liste reste limitée à ces promotions : l'intervenant ne voit pas toute l'école.
 */
export async function apprenantsAjoutables(tx: Transaction, seanceId: string) {
  const resultat = await tx.execute<{ personne_id: string; nom: string; prenom: string }>(sql`
    select distinct p.id as personne_id, p.nom, p.prenom
    from seance s
    join inscription i
      on i.organisation_id = s.organisation_id
      and i.deleted_at is null
      and i.etat <> 'preinscrit'
      and i.date_entree <= (s.debut at time zone 'Europe/Paris')::date
      and (i.date_sortie is null or (s.debut at time zone 'Europe/Paris')::date < i.date_sortie)
    join personne p
      on p.organisation_id = i.organisation_id and p.id = i.personne_id and p.deleted_at is null
    where s.id = ${seanceId}
      and i.promotion_id in (
        select i2.promotion_id from inscription i2
        join seance_attendu_calcule a
          on a.organisation_id = i2.organisation_id and a.personne_id = i2.personne_id
        where a.seance_id = s.id and i2.deleted_at is null
      )
      and not exists (
        select 1 from seance_attendu_calcule a
        where a.seance_id = s.id and a.personne_id = p.id
      )
    order by p.nom, p.prenom`);
  return resultat.rows.map((r) => ({ personneId: r.personne_id, nom: r.nom, prenom: r.prenom }));
}

/** Une validation telle que l'API la renvoie et que le cache la garde (contrat VersionAppel). */
export const versionAppel = (v: {
  version: number;
  valideLe: Date;
  nom: string;
  prenom: string;
  empreinte: string;
  motif: string | null;
  commentaire: string | null;
  correctionVerrouillee?: 'ecole' | 'intervenant' | null;
}) => ({
  version: v.version,
  valideLe: v.valideLe.toISOString(),
  validePar: `${v.prenom} ${v.nom}`,
  empreinte: v.empreinte,
  motif: v.motif,
  commentaire: v.commentaire,
  correctionVerrouillee: v.correctionVerrouillee ?? null,
});

/**
 * RG-06-15 : corrections d'appels verrouillés faites par des intervenants, les plus récentes
 * d'abord, pour la scolarité et la pédagogie.
 */
export async function correctionsVerrouilleesIntervenants(tx: Transaction, limite = 100) {
  return tx
    .select({
      seanceId: appelValidation.seanceId,
      libelle: seance.libelle,
      debut: seance.debut,
      version: appelValidation.version,
      corrigeeLe: appelValidation.valideLe,
      nom: personne.nom,
      prenom: personne.prenom,
      motif: appelValidation.motif,
    })
    .from(appelValidation)
    .innerJoin(
      seance,
      and(
        eq(seance.organisationId, appelValidation.organisationId),
        eq(seance.id, appelValidation.seanceId),
      ),
    )
    .innerJoin(
      personne,
      and(
        eq(personne.organisationId, appelValidation.organisationId),
        eq(personne.id, appelValidation.validePar),
      ),
    )
    .where(
      and(
        eq(appelValidation.correctionVerrouillee, 'intervenant'),
        isNull(appelValidation.deletedAt),
      ),
    )
    .orderBy(desc(appelValidation.valideLe))
    .limit(limite);
}

/** Dernière validation de l'appel, préchargée avec la séance (le scan la lit dans le cache). */
export async function derniereValidation(tx: Transaction, seanceId: string) {
  const versions = await validationsDeSeance(tx, seanceId);
  const derniere = versions.at(-1);
  return derniere ? versionAppel(derniere) : null;
}

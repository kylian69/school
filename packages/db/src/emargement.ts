import { and, eq, gt, inArray, isNull, sql, type AnyColumn } from 'drizzle-orm';
import type { Database } from './client.js';
import { withOrganisation, type Transaction } from './organisation-context.js';
import { presence, seance, seanceAttenduCalcule } from './schema/emargement.js';
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
): Promise<{ scanneLe: Date; rejoue: boolean } | null> {
  const [ajoutee] = await tx
    .insert(presence)
    .values({
      organisationId: p.organisationId,
      seanceId: p.seanceId,
      personneId: p.personneId,
      scanneLe: new Date(p.scanneLe),
      mode: p.mode,
      rejoue: p.rejoue,
    })
    .onConflictDoNothing({
      target: [presence.organisationId, presence.seanceId, presence.personneId],
    })
    .returning({ id: presence.id });
  if (ajoutee) return null;
  const [existante] = await tx
    .select({ scanneLe: presence.scanneLe, rejoue: presence.rejoue })
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

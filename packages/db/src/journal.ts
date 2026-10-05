import { sql } from 'drizzle-orm';
import type { Database } from './client.js';
import type { Transaction } from './organisation-context.js';
import { plateformeAudit } from './schema/plateforme.js';
import { auditEvenement, outboxEvenement } from './schema/journal.js';

export interface AuditEntry {
  action: string;
  objetType: string;
  objetId?: string | null;
  auteurId?: string | null;
  adresseIp?: string | null;
  avant?: unknown;
  apres?: unknown;
}

/**
 * Inscrit une action sensible au journal d'audit, dans la transaction du changement métier :
 * l'action et sa trace sont enregistrées ensemble ou pas du tout. L'organisation est celle de
 * la transaction. Les données sensibles ne doivent pas figurer en clair dans `avant` et `apres`.
 */
export async function enregistrerAudit(tx: Transaction, entry: AuditEntry): Promise<void> {
  await tx.insert(auditEvenement).values({
    action: entry.action,
    objetType: entry.objetType,
    objetId: entry.objetId ?? null,
    auteurId: entry.auteurId ?? null,
    adresseIp: entry.adresseIp ?? null,
    avant: entry.avant ?? null,
    apres: entry.apres ?? null,
  });
}

/** Ajoute un événement interne à la boîte d'envoi, dans la transaction du changement métier. */
export async function ajouterEvenement(
  tx: Transaction,
  type: string,
  charge: Record<string, unknown>,
): Promise<void> {
  await tx.insert(outboxEvenement).values({ type, charge });
}

export interface EvenementAPublier {
  id: string;
  organisationId: string;
  type: string;
  charge: unknown;
  survenuLe: Date;
}

/**
 * Réserve un lot d'événements non publiés (toutes organisations, SKIP LOCKED : plusieurs
 * publieurs peuvent tourner), les confie à `publier`, puis les acquitte. En cas d'échec, le lot
 * reste à publier et l'erreur est notée. Renvoie le nombre d'événements publiés.
 */
export async function publierEvenements(
  db: Database,
  taille: number,
  publier: (evenements: EvenementAPublier[]) => Promise<void>,
): Promise<number> {
  let reserves: EvenementAPublier[] = [];
  try {
    return await db.transaction(async (tx) => {
      const result = await tx.execute<{
        id: string;
        organisation_id: string;
        type: string;
        charge: unknown;
        survenu_le: string | Date;
      }>(sql`select * from outbox_evenement_reserver(${taille})`);
      reserves = result.rows.map((r) => ({
        id: r.id,
        organisationId: r.organisation_id,
        type: r.type,
        charge: r.charge,
        // Le pilote renvoie les horodatages des requêtes SQL brutes sous forme de texte.
        survenuLe: new Date(r.survenu_le),
      }));
      if (reserves.length === 0) return 0;
      await publier(reserves);
      await tx.execute(
        sql`select outbox_evenement_acquitter(${sql.param(reserves.map((e) => e.id))}::uuid[])`,
      );
      return reserves.length;
    });
  } catch (error) {
    if (reserves.length > 0) {
      const message = error instanceof Error ? error.message : String(error);
      await db.execute(
        sql`select outbox_evenement_acquitter(${sql.param(reserves.map((e) => e.id))}::uuid[], ${message})`,
      );
    }
    throw error;
  }
}

/** Crée les partitions mensuelles du journal d'audit à venir (tâche planifiée quotidienne). */
export async function creerPartitionsAudit(db: Database, moisAVenir = 3): Promise<void> {
  await db.execute(sql`select audit_evenement_creer_partitions(${moisAVenir})`);
}

/** Inscrit une action de la console au journal d'audit de la plateforme (module 19). */
export async function enregistrerAuditPlateforme(
  db: Database | Transaction,
  entry: AuditEntry,
): Promise<void> {
  await db.insert(plateformeAudit).values({
    action: entry.action,
    objetType: entry.objetType,
    objetId: entry.objetId ?? null,
    auteurId: entry.auteurId ?? null,
    adresseIp: entry.adresseIp ?? null,
    avant: entry.avant ?? null,
    apres: entry.apres ?? null,
  });
}

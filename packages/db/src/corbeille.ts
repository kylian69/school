import { and, eq, inArray, isNotNull, lt, notExists, notLike, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { withOrganisation } from './organisation-context.js';
import { attribution, role } from './schema/droits.js';
import { invitation } from './schema/invitation.js';
import { personne } from './schema/personne.js';
import { anneeScolaire, fermeture, periode } from './schema/structure.js';

export interface BilanPurge {
  personnes: number;
  annees: number;
  fermetures: number;
  roles: number;
}

/**
 * Effacement définitif des éléments restés dans la corbeille au-delà de la limite (RG-01-23).
 * Une fiche est anonymisée plutôt que supprimée : son matricule reste réservé (RG-01-06) et ses
 * traces dans le journal gardent un objet ; ses invitations, qui portent son email, sont effacées.
 */
export async function purgerCorbeille(db: Database, limite: Date): Promise<BilanPurge> {
  const ecoles = await db.execute<{ organisation_id: string }>(
    sql`select organisation_id from corbeille_organisations(${limite.toISOString()}::timestamptz)`,
  );
  const bilan: BilanPurge = { personnes: 0, annees: 0, fermetures: 0, roles: 0 };
  for (const { organisation_id: organisationId } of ecoles.rows) {
    await withOrganisation(db, organisationId, async (tx) => {
      const fiches = await tx
        .select({ id: personne.id })
        .from(personne)
        .where(and(lt(personne.deletedAt, limite), notLike(personne.email, 'efface+%@invalid')));
      for (const { id } of fiches) {
        await tx.delete(invitation).where(eq(invitation.personneId, id));
        await tx
          .update(personne)
          .set({
            nom: 'Fiche effacée',
            nomUsage: null,
            prenom: '—',
            email: `efface+${id}@invalid`,
            civilite: null,
            telephone: null,
            adresseLigne1: null,
            codePostal: null,
            ville: null,
            dateNaissance: null,
            lieuNaissance: null,
            ine: null,
          })
          .where(eq(personne.id, id));
      }
      const fermetures = await tx
        .delete(fermeture)
        .where(lt(fermeture.deletedAt, limite))
        .returning({ id: fermeture.id });
      const annees = await tx
        .select({ id: anneeScolaire.id })
        .from(anneeScolaire)
        .where(lt(anneeScolaire.deletedAt, limite));
      const anneeIds = annees.map((a) => a.id);
      if (anneeIds.length > 0) {
        await tx.delete(periode).where(inArray(periode.anneeScolaireId, anneeIds));
        await tx.delete(fermeture).where(inArray(fermeture.anneeScolaireId, anneeIds));
        await tx.delete(anneeScolaire).where(inArray(anneeScolaire.id, anneeIds));
      }
      // Un rôle encore cité par une attribution (même terminée) reste, pour l'historique.
      const roles = await tx
        .delete(role)
        .where(
          and(
            isNotNull(role.deletedAt),
            lt(role.deletedAt, limite),
            notExists(
              tx
                .select({ un: sql`1` })
                .from(attribution)
                .where(eq(attribution.roleId, role.id)),
            ),
          ),
        )
        .returning({ id: role.id });
      bilan.personnes += fiches.length;
      bilan.annees += anneeIds.length;
      bilan.fermetures += fermetures.length;
      bilan.roles += roles.length;
    });
  }
  return bilan;
}

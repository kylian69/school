import {
  ChargeDecisionJustificatif,
  cheminLogo,
  emailDecisionJustificatif,
  type EmailJob,
  type EvenementJob,
} from '@scolaly/contracts';
import { justificatif, organisation, personne, withOrganisation, type Database } from '@scolaly/db';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * RG-06-21 : la scolarité a décidé d'un justificatif ; l'apprenant reçoit un email sans motif ni
 * message (le détail est dans Scolaly). Le statut est relu au traitement : un justificatif encore
 * « à traiter » (document ajouté depuis) n'envoie rien. Rejouer l'événement ne double pas l'envoi.
 * Renvoie le nombre d'emails confiés.
 */
export async function signalerDecisionJustificatif(
  db: Database,
  evenement: EvenementJob,
  envoyer: (email: EmailJob, cle: string) => Promise<void>,
  publicUrl: string,
): Promise<number> {
  const charge = ChargeDecisionJustificatif.parse(evenement.charge);
  const email = await withOrganisation(db, evenement.organisationId, async (tx) => {
    const [ligne] = await tx
      .select({
        statut: justificatif.statut,
        email: personne.email,
        prenom: personne.prenom,
        ecole: organisation.nom,
        nomAffichage: organisation.nomAffichage,
        couleur: organisation.couleurPrincipale,
        logoEmpreinte: organisation.logoEmpreinte,
      })
      .from(justificatif)
      .innerJoin(
        personne,
        and(
          eq(personne.organisationId, justificatif.organisationId),
          eq(personne.id, justificatif.personneId),
        ),
      )
      .innerJoin(organisation, eq(organisation.id, justificatif.organisationId))
      .where(
        and(
          eq(justificatif.id, charge.justificatifId),
          isNull(justificatif.deletedAt),
          isNull(personne.deletedAt),
        ),
      );
    if (!ligne || ligne.statut === 'a-traiter') return null;
    return emailDecisionJustificatif({
      to: ligne.email,
      prenom: ligne.prenom,
      ecole: ligne.ecole,
      lien: new URL('/mes-absences', publicUrl).toString(),
      statut: ligne.statut,
      marque: {
        nom: ligne.nomAffichage,
        couleur: ligne.couleur,
        logoUrl: ligne.logoEmpreinte
          ? new URL(cheminLogo(evenement.organisationId, ligne.logoEmpreinte), publicUrl).toString()
          : null,
      },
    });
  });
  if (!email) return 0;
  // Confié après la transaction : la file le rejoue en cas d'échec d'envoi.
  await envoyer(email, `decision-justificatif-${evenement.id}`);
  return 1;
}

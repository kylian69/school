import { cheminLogo, emailInvitation, type EmailJob } from '@scolaly/contracts';
import {
  invitation,
  invitationsARelancer,
  nouveauJeton,
  organisation,
  personne,
  withOrganisation,
  type Database,
} from '@scolaly/db';
import { relanceDue } from '@scolaly/domain';
import { eq, inArray } from 'drizzle-orm';

/**
 * Relances des invitations non activées (RG-01-08) : J+3 puis J+7. Chaque relance porte un
 * nouveau lien (seule son empreinte est stockée) ; l'email part après la validation.
 * Renvoie le nombre de relances envoyées.
 */
export async function relancerInvitations(
  db: Database,
  envoyer: (email: EmailJob) => Promise<void>,
  publicUrl: string,
  maintenant = new Date(),
): Promise<number> {
  const parEcole = new Map<string, string[]>();
  for (const { organisationId, invitationId } of await invitationsARelancer(db)) {
    parEcole.set(organisationId, [...(parEcole.get(organisationId) ?? []), invitationId]);
  }
  let envoyees = 0;
  for (const [organisationId, ids] of parEcole) {
    const emails = await withOrganisation(db, organisationId, async (tx) => {
      const lignes = await tx
        .select({
          invitation,
          prenom: personne.prenom,
          ecole: organisation.nom,
          nomAffichage: organisation.nomAffichage,
          couleur: organisation.couleurPrincipale,
          logoEmpreinte: organisation.logoEmpreinte,
        })
        .from(invitation)
        .innerJoin(personne, eq(personne.id, invitation.personneId))
        .innerJoin(organisation, eq(organisation.id, invitation.organisationId))
        .where(inArray(invitation.id, ids))
        .for('update', { of: invitation });
      const aEnvoyer: EmailJob[] = [];
      for (const ligne of lignes) {
        const relance = relanceDue(ligne.invitation, maintenant);
        if (!relance) continue;
        const { jeton, empreinte } = nouveauJeton(organisationId);
        await tx
          .update(invitation)
          .set({ jetonEmpreinte: empreinte, relances: relance, derniereRelanceLe: maintenant })
          .where(eq(invitation.id, ligne.invitation.id));
        aEnvoyer.push(
          emailInvitation({
            to: ligne.invitation.email,
            prenom: ligne.prenom,
            ecole: ligne.ecole,
            lien: new URL(`/activation/${jeton}`, publicUrl).toString(),
            expireLe: ligne.invitation.expireLe,
            relance,
            marque: {
              nom: ligne.nomAffichage,
              couleur: ligne.couleur,
              logoUrl: ligne.logoEmpreinte
                ? new URL(cheminLogo(organisationId, ligne.logoEmpreinte), publicUrl).toString()
                : null,
            },
          }),
        );
      }
      return aEnvoyer;
    });
    for (const email of emails) await envoyer(email);
    envoyees += emails.length;
  }
  return envoyees;
}

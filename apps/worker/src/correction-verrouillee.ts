import {
  ChargeCorrectionVerrouillee,
  cheminLogo,
  emailCorrectionVerrouillee,
  FUSEAU_PAR_DEFAUT,
  type EmailJob,
  type EvenementJob,
} from '@scolaly/contracts';
import {
  appelValidation,
  attribution,
  fuseauDeSeance,
  organisation,
  personne,
  role,
  rolePermission,
  seance,
  withOrganisation,
  type Database,
} from '@scolaly/db';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';

/**
 * RG-06-15 : un intervenant a corrigé un appel verrouillé. Chaque personne qui a le droit de
 * corriger les appels verrouillés sur toute l'école (scolarité, pédagogie), sauf l'auteur, reçoit
 * un email. Rejouer l'événement ne double pas l'envoi (clé événement + destinataire).
 * Renvoie le nombre d'emails confiés.
 */
export async function signalerCorrectionVerrouillee(
  db: Database,
  evenement: EvenementJob,
  envoyer: (email: EmailJob, cle: string) => Promise<void>,
  publicUrl: string,
): Promise<number> {
  const charge = ChargeCorrectionVerrouillee.parse(evenement.charge);
  const emails = await withOrganisation(db, evenement.organisationId, async (tx) => {
    const [correction] = await tx
      .select({
        auteurId: appelValidation.validePar,
        nom: personne.nom,
        prenom: personne.prenom,
        libelle: seance.libelle,
        debut: seance.debut,
        fin: seance.fin,
        fuseau: fuseauDeSeance(seance.id),
        ecole: organisation.nom,
        nomAffichage: organisation.nomAffichage,
        couleur: organisation.couleurPrincipale,
        logoEmpreinte: organisation.logoEmpreinte,
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
      .innerJoin(organisation, eq(organisation.id, appelValidation.organisationId))
      .where(
        and(
          eq(appelValidation.seanceId, charge.seanceId),
          eq(appelValidation.version, charge.version),
        ),
      );
    if (!correction) return [];
    const destinataires = await tx
      .selectDistinct({ id: personne.id, email: personne.email, prenom: personne.prenom })
      .from(attribution)
      .innerJoin(
        role,
        and(eq(role.organisationId, attribution.organisationId), eq(role.id, attribution.roleId)),
      )
      .innerJoin(
        rolePermission,
        and(
          eq(rolePermission.organisationId, role.organisationId),
          eq(rolePermission.roleId, role.id),
        ),
      )
      .innerJoin(
        personne,
        and(
          eq(personne.organisationId, attribution.organisationId),
          eq(personne.id, attribution.personneId),
        ),
      )
      .where(
        and(
          eq(rolePermission.permission, 'emargement:corriger-verrouille'),
          isNull(rolePermission.deletedAt),
          eq(attribution.perimetreType, 'organisation'),
          isNull(attribution.deletedAt),
          sql`${attribution.debut} <= current_date`,
          or(isNull(attribution.fin), sql`${attribution.fin} > current_date`),
          isNull(role.deletedAt),
          isNull(personne.deletedAt),
          ne(personne.id, correction.auteurId),
        ),
      );
    const marque = {
      nom: correction.nomAffichage,
      couleur: correction.couleur,
      logoUrl: correction.logoEmpreinte
        ? new URL(
            cheminLogo(evenement.organisationId, correction.logoEmpreinte),
            publicUrl,
          ).toString()
        : null,
    };
    return destinataires.map((d) => ({
      cle: `correction-verrouillee-${evenement.id}-${d.id}`,
      email: emailCorrectionVerrouillee({
        to: d.email,
        prenom: d.prenom,
        ecole: correction.ecole,
        lien: new URL(`/seances/${charge.seanceId}/appel`, publicUrl).toString(),
        intervenant: `${correction.prenom} ${correction.nom}`,
        libelle: correction.libelle,
        debut: correction.debut,
        fin: correction.fin,
        fuseau: correction.fuseau ?? FUSEAU_PAR_DEFAUT,
        version: charge.version,
        marque,
      }),
    }));
  });
  // Emails confiés après la transaction : la file les rejoue en cas d'échec d'envoi.
  for (const { email, cle } of emails) await envoyer(email, cle);
  return emails.length;
}

import { createHash } from 'node:crypto';
import {
  ChargeChangementEdt,
  cheminLogo,
  emailChangementsEdt,
  type ChangementEdtAnnonce,
  type EmailJob,
  type EvenementJob,
} from '@scolaly/contracts';
import {
  etablissement,
  groupePromotion,
  notificationEdt,
  notificationsEdtEnAttente,
  organisation,
  personne,
  promotion,
  salle,
  seance,
  seanceAttenduCalcule,
  seanceIntervenant,
  seancePublic,
  withOrganisation,
  type Database,
  type Transaction,
} from '@scolaly/db';
import {
  changementUrgent,
  envoiImmediatDu,
  natureAnnoncee,
  type NatureNotificationEdt,
} from '@scolaly/domain';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

/** Lignes insérées par requête (publication d'un semestre entier pour plusieurs promotions). */
const LOT = 1000;

/**
 * RG-04-14 : note, pour chaque personne concernée (apprenants attendus, intervenants, intervenants
 * retirés), les séances d'un événement `edt.changement`. Une séance entièrement passée n'est pas
 * signalée. Rejouer l'événement ne crée aucun doublon (clé événement, personne, séance).
 * Renvoie le nombre de lignes ajoutées.
 */
export async function enregistrerChangementEdt(
  db: Database,
  evenement: EvenementJob,
  maintenant = new Date(),
): Promise<number> {
  const charge = ChargeChangementEdt.parse(evenement.charge);
  return withOrganisation(db, evenement.organisationId, async (tx) => {
    const seances = await tx
      .select({
        id: seance.id,
        debut: seance.debut,
        fin: seance.fin,
        reporteeVersId: seance.reporteeVersId,
      })
      .from(seance)
      .where(inArray(seance.id, charge.seanceIds));
    const remplacantes = seances.flatMap((s) => (s.reporteeVersId ? [s.reporteeVersId] : []));
    const nouvelles =
      remplacantes.length === 0
        ? []
        : await tx
            .select({ id: seance.id, debut: seance.debut, fin: seance.fin })
            .from(seance)
            .where(inArray(seance.id, remplacantes));
    // Séance signalée pour chaque séance lue : la remplaçante d'un report compte pour l'origine.
    const origine = new Map<string, string>();
    const urgente = new Map<string, boolean>();
    for (const s of seances) {
      const creneaux = [s, ...nouvelles.filter((n) => n.id === s.reporteeVersId)];
      if (creneaux.every((c) => c.fin <= maintenant)) continue;
      origine.set(s.id, s.id);
      if (s.reporteeVersId) origine.set(s.reporteeVersId, s.id);
      urgente.set(s.id, changementUrgent(creneaux, maintenant));
    }
    const lues = [...origine.keys()];
    if (lues.length === 0) return 0;
    const concernes = [
      ...(await tx
        .select({
          seanceId: seanceAttenduCalcule.seanceId,
          personneId: seanceAttenduCalcule.personneId,
        })
        .from(seanceAttenduCalcule)
        .where(inArray(seanceAttenduCalcule.seanceId, lues))),
      ...(await tx
        .select({ seanceId: seanceIntervenant.seanceId, personneId: seanceIntervenant.personneId })
        .from(seanceIntervenant)
        .where(
          and(inArray(seanceIntervenant.seanceId, lues), isNull(seanceIntervenant.deletedAt)),
        )),
    ];
    const lignes = new Map<string, typeof notificationEdt.$inferInsert>();
    const ajouter = (seanceLue: string, personneId: string, nature: NatureNotificationEdt) => {
      const seanceId = origine.get(seanceLue);
      if (!seanceId || lignes.has(`${seanceId}:${personneId}`)) return;
      lignes.set(`${seanceId}:${personneId}`, {
        organisationId: evenement.organisationId,
        evenementId: evenement.id,
        personneId,
        seanceId,
        nature,
        urgente: urgente.get(seanceId) ?? false,
      });
    };
    for (const c of concernes) ajouter(c.seanceId, c.personneId, charge.nature);
    for (const r of charge.retraits) ajouter(r.seanceId, r.personneId, 'retrait');
    const valeurs = [...lignes.values()];
    let ajoutees = 0;
    for (let i = 0; i < valeurs.length; i += LOT) {
      const inserees = await tx
        .insert(notificationEdt)
        .values(valeurs.slice(i, i + LOT))
        .onConflictDoNothing({
          target: [
            notificationEdt.organisationId,
            notificationEdt.evenementId,
            notificationEdt.personneId,
            notificationEdt.seanceId,
          ],
        })
        .returning({ id: notificationEdt.id });
      ajoutees += inserees.length;
    }
    return ajoutees;
  });
}

export type ModeEnvoiEdt = 'immediat' | 'recapitulatif';

/**
 * RG-04-14, RG-08-11 : envoie à chaque personne un seul email regroupant ses changements :
 * - `immediat` (chaque minute) : les changements urgents, une fois la rafale terminée ;
 * - `recapitulatif` (chaque jour à 18 h) : tous les changements restants.
 * Les lignes envoyées sont supprimées dans la transaction qui confie l'email à la file ; la clé
 * de la tâche dépend des lignes : une transaction rejouée ne crée pas de second email.
 * Renvoie le nombre d'emails confiés à la file.
 */
export async function envoyerNotificationsEdt(
  db: Database,
  envoyer: (email: EmailJob, cle: string) => Promise<void>,
  publicUrl: string,
  mode: ModeEnvoiEdt,
  maintenant = new Date(),
): Promise<number> {
  const parEcole = new Map<string, Set<string>>();
  for (const a of await notificationsEdtEnAttente(db)) {
    if (mode === 'immediat' && !(a.urgente && envoiImmediatDu(a, maintenant))) continue;
    parEcole.set(a.organisationId, (parEcole.get(a.organisationId) ?? new Set()).add(a.personneId));
  }
  let envoyes = 0;
  for (const [organisationId, personnes] of parEcole) {
    for (const personneId of personnes) {
      const envoye = await withOrganisation(db, organisationId, (tx) =>
        envoyerA(tx, { organisationId, personneId, mode, publicUrl, envoyer }),
      );
      if (envoye) envoyes += 1;
    }
  }
  return envoyes;
}

async function envoyerA(
  tx: Transaction,
  o: {
    organisationId: string;
    personneId: string;
    mode: ModeEnvoiEdt;
    publicUrl: string;
    envoyer: (email: EmailJob, cle: string) => Promise<void>;
  },
): Promise<boolean> {
  // SKIP LOCKED : deux workers ne traitent jamais les mêmes lignes.
  const lignes = await tx
    .select({
      id: notificationEdt.id,
      seanceId: notificationEdt.seanceId,
      nature: notificationEdt.nature,
    })
    .from(notificationEdt)
    .where(
      and(
        eq(notificationEdt.personneId, o.personneId),
        isNull(notificationEdt.deletedAt),
        o.mode === 'immediat' ? eq(notificationEdt.urgente, true) : undefined,
      ),
    )
    .for('update', { skipLocked: true });
  if (lignes.length === 0) return false;
  const ids = lignes.map((l) => l.id).sort();
  await tx.delete(notificationEdt).where(inArray(notificationEdt.id, ids));
  const [destinataire] = await tx
    .select({
      email: personne.email,
      prenom: personne.prenom,
      ecole: organisation.nom,
      nomAffichage: organisation.nomAffichage,
      couleur: organisation.couleurPrincipale,
      logoEmpreinte: organisation.logoEmpreinte,
    })
    .from(personne)
    .innerJoin(organisation, eq(organisation.id, personne.organisationId))
    .where(and(eq(personne.id, o.personneId), isNull(personne.deletedAt)));
  // Fiche supprimée entre-temps : les changements sont oubliés.
  if (!destinataire) return false;
  const changements = await annonces(tx, o.personneId, lignes);
  if (changements.length === 0) return false;
  const email = emailChangementsEdt({
    to: destinataire.email,
    prenom: destinataire.prenom,
    ecole: destinataire.ecole,
    lien: new URL('/', o.publicUrl).toString(),
    recapitulatif: o.mode === 'recapitulatif',
    changements,
    marque: {
      nom: destinataire.nomAffichage,
      couleur: destinataire.couleur,
      logoUrl: destinataire.logoEmpreinte
        ? new URL(cheminLogo(o.organisationId, destinataire.logoEmpreinte), o.publicUrl).toString()
        : null,
    },
  });
  const cle = createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 32);
  await o.envoyer(email, `edt-${cle}`);
  return true;
}

/** Une annonce par séance, d'après son état actuel, par ordre chronologique. */
async function annonces(
  tx: Transaction,
  personneId: string,
  lignes: readonly { seanceId: string; nature: NatureNotificationEdt }[],
): Promise<ChangementEdtAnnonce[]> {
  const seanceIds = [...new Set(lignes.map((l) => l.seanceId))];
  const seances = await tx
    .select({
      id: seance.id,
      libelle: seance.libelle,
      debut: seance.debut,
      fin: seance.fin,
      statut: seance.statut,
      reporteeVersId: seance.reporteeVersId,
      salle: salle.nom,
    })
    .from(seance)
    .leftJoin(
      salle,
      and(eq(salle.organisationId, seance.organisationId), eq(salle.id, seance.salleId)),
    )
    .where(and(inArray(seance.id, seanceIds), isNull(seance.deletedAt)));
  const remplacantes = seances.flatMap((s) => (s.reporteeVersId ? [s.reporteeVersId] : []));
  const nouvelles =
    remplacantes.length === 0
      ? []
      : await tx
          .select({ id: seance.id, debut: seance.debut, fin: seance.fin })
          .from(seance)
          .where(inArray(seance.id, remplacantes));
  const concernees = new Set(
    [
      ...(await tx
        .select({ seanceId: seanceAttenduCalcule.seanceId })
        .from(seanceAttenduCalcule)
        .where(
          and(
            inArray(seanceAttenduCalcule.seanceId, seanceIds),
            eq(seanceAttenduCalcule.personneId, personneId),
          ),
        )),
      ...(await tx
        .select({ seanceId: seanceIntervenant.seanceId })
        .from(seanceIntervenant)
        .where(
          and(
            inArray(seanceIntervenant.seanceId, seanceIds),
            eq(seanceIntervenant.personneId, personneId),
            isNull(seanceIntervenant.deletedAt),
          ),
        )),
    ].map((c) => c.seanceId),
  );
  const fuseaux = await fuseauxDesSeances(tx, seanceIds);
  return seances
    .map((s) => {
      const nouvelle = nouvelles.find((n) => n.id === s.reporteeVersId);
      return {
        nature: natureAnnoncee({
          statut: s.statut,
          natures: lignes.filter((l) => l.seanceId === s.id).map((l) => l.nature),
          concernee: concernees.has(s.id),
        }),
        libelle: s.libelle,
        debut: s.debut,
        fin: s.fin,
        fuseau: fuseaux.get(s.id) ?? 'Europe/Paris',
        salle: s.salle,
        reporteeVers:
          s.statut === 'reportee' && nouvelle ? { debut: nouvelle.debut, fin: nouvelle.fin } : null,
      };
    })
    .sort((a, b) => a.debut.getTime() - b.debut.getTime());
}

/** Fuseau de l'établissement de chaque séance, par sa promotion (directe ou par un groupe). */
async function fuseauxDesSeances(tx: Transaction, seanceIds: readonly string[]) {
  const lignes = await tx
    .select({ seanceId: seancePublic.seanceId, fuseau: etablissement.fuseauHoraire })
    .from(seancePublic)
    .leftJoin(
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
        eq(promotion.organisationId, seancePublic.organisationId),
        eq(
          promotion.id,
          sql`coalesce(${seancePublic.promotionId}, ${groupePromotion.promotionId})`,
        ),
      ),
    )
    .innerJoin(
      etablissement,
      and(
        eq(etablissement.organisationId, promotion.organisationId),
        eq(etablissement.id, promotion.etablissementId),
      ),
    )
    .where(and(inArray(seancePublic.seanceId, [...seanceIds]), isNull(seancePublic.deletedAt)));
  return new Map(lignes.map((l) => [l.seanceId, l.fuseau]));
}

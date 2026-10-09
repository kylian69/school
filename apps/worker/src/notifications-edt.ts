import { createHash } from 'node:crypto';
import {
  ChargeChangementEdt,
  cheminLogo,
  emailChangementsEdt,
  FUSEAU_PAR_DEFAUT,
  type ChangementEdtAnnonce,
  type EmailJob,
  type EvenementJob,
} from '@scolaly/contracts';
import {
  fuseauDeSeance,
  notificationEdt,
  notificationsEdtEnAttente,
  notificationsEdtParFuseau,
  organisation,
  personne,
  salle,
  seance,
  seanceAttenduCalcule,
  seanceIntervenant,
  withOrganisation,
  type Database,
  type Transaction,
} from '@scolaly/db';
import {
  changementUrgent,
  dernierRecapitulatif,
  envoiImmediatDu,
  natureAnnoncee,
  type NatureNotificationEdt,
} from '@scolaly/domain';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

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

/** Envoi à une personne ; pour le récapitulatif, les changements d'un fuseau notés avant 18 h. */
interface Envoi {
  organisationId: string;
  personneId: string;
  recapitulatif?: { fuseau: string | null; avant: Date };
}

/**
 * RG-04-14, RG-08-11 : envoie à chaque personne un seul email regroupant ses changements :
 * - `immediat` (chaque minute) : les changements urgents, une fois la rafale terminée ;
 * - `recapitulatif` (chaque quart d'heure) : dans chaque fuseau où il est 18 h passées, les
 *   changements notés avant 18 h locales et pas encore envoyés. Une personne dont les séances
 *   relèvent de plusieurs fuseaux reçoit un récapitulatif par fuseau, chaque séance dans un seul.
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
  const envois: Envoi[] = [];
  if (mode === 'immediat') {
    const vus = new Set<string>();
    for (const a of await notificationsEdtEnAttente(db)) {
      if (!(a.urgente && envoiImmediatDu(a, maintenant))) continue;
      if (vus.has(`${a.organisationId}:${a.personneId}`)) continue;
      vus.add(`${a.organisationId}:${a.personneId}`);
      envois.push({ organisationId: a.organisationId, personneId: a.personneId });
    }
  } else {
    for (const a of await notificationsEdtParFuseau(db)) {
      const avant = dernierRecapitulatif(a.fuseau ?? FUSEAU_PAR_DEFAUT, maintenant);
      if (a.premier >= avant) continue;
      envois.push({ ...a, recapitulatif: { fuseau: a.fuseau, avant } });
    }
  }
  let envoyes = 0;
  for (const envoi of envois) {
    const envoye = await withOrganisation(db, envoi.organisationId, (tx) =>
      envoyerA(tx, { ...envoi, publicUrl, envoyer }),
    );
    if (envoye) envoyes += 1;
  }
  return envoyes;
}

async function envoyerA(
  tx: Transaction,
  o: Envoi & {
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
        o.recapitulatif
          ? and(
              lt(notificationEdt.createdAt, o.recapitulatif.avant),
              sql`${fuseauDeSeance(notificationEdt.seanceId)} is not distinct from ${o.recapitulatif.fuseau}`,
            )
          : eq(notificationEdt.urgente, true),
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
    recapitulatif: o.recapitulatif !== undefined,
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
  const fuseaux = new Map(
    (
      await tx
        .select({ id: seance.id, fuseau: fuseauDeSeance(seance.id) })
        .from(seance)
        .where(inArray(seance.id, seanceIds))
    ).map((s) => [s.id, s.fuseau]),
  );
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
        fuseau: fuseaux.get(s.id) ?? FUSEAU_PAR_DEFAUT,
        salle: s.salle,
        reporteeVers:
          s.statut === 'reportee' && nouvelle ? { debut: nouvelle.debut, fin: nouvelle.fin } : null,
      };
    })
    .sort((a, b) => a.debut.getTime() - b.debut.getTime());
}

import { createHash } from 'node:crypto';
import { cheminLogo, emailAlertesAssiduite, type EmailJob } from '@scolaly/contracts';
import {
  alerteAssiduite,
  destinatairesAlertesAssiduite,
  donneesSeuilsAssiduite,
  ecolesAvecAbsencesNonJustifiees,
  organisation,
  withOrganisation,
  type Database,
} from '@scolaly/db';
import {
  alertesADeclencher,
  BORNES_SEUILS_ASSIDUITE,
  debutFenetre,
  evaluerAssiduite,
  seuilsApplicables,
} from '@scolaly/domain';
import { and, gte, inArray, isNull, sql } from 'drizzle-orm';

const JOUR = 86_400_000;
/** Période la plus longue qu'une école ou une formation puisse choisir. */
const PERIODE_MAX = BORNES_SEUILS_ASSIDUITE.fenetreJours.max;

export interface BilanAlertesAssiduite {
  alertes: number;
  emails: number;
}

/**
 * RG-06-23, RG-03-20 : évalue les apprenants qui ont des absences non justifiées, crée les alertes
 * des niveaux atteints (au plus une par niveau et par période : pas de rafale), puis envoie un seul
 * email par destinataire regroupant les nouvelles alertes : niveau 1 à la scolarité et à la
 * pédagogie, niveau 2 aussi à la direction. Une transaction par école, verrouillée : deux passages
 * simultanés ne doublent rien. Jour de référence : jour UTC du passage.
 */
export async function declencherAlertesAssiduite(
  db: Database,
  envoyer: (email: EmailJob, cle: string) => Promise<void>,
  publicUrl: string,
  maintenant = new Date(),
): Promise<BilanAlertesAssiduite> {
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const depuis = debutFenetre(aujourdhui, PERIODE_MAX);
  const bilan: BilanAlertesAssiduite = { alertes: 0, emails: 0 };
  for (const organisationId of await ecolesAvecAbsencesNonJustifiees(db, depuis)) {
    const emails = await withOrganisation(db, organisationId, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`alertes-${organisationId}`}))`);
      const { ecole, apprenants } = await donneesSeuilsAssiduite(tx, depuis, aujourdhui);
      const emises =
        apprenants.length === 0
          ? []
          : await tx
              .select({
                personneId: alerteAssiduite.personneId,
                niveau: alerteAssiduite.niveau,
                declencheeLe: alerteAssiduite.declencheeLe,
              })
              .from(alerteAssiduite)
              .where(
                and(
                  inArray(
                    alerteAssiduite.personneId,
                    apprenants.map((a) => a.personneId),
                  ),
                  gte(
                    alerteAssiduite.declencheeLe,
                    new Date(maintenant.getTime() - PERIODE_MAX * JOUR),
                  ),
                ),
              );
      const nouvelles = apprenants.flatMap((a) => {
        const seuils = seuilsApplicables(ecole, a.formations);
        const e = evaluerAssiduite(a.absences, seuils, aujourdhui);
        const siennes = emises.filter((x) => x.personneId === a.personneId);
        return alertesADeclencher(e.niveau, siennes, maintenant, seuils.fenetreJours).map(
          (niveau) => ({
            organisationId,
            personneId: a.personneId,
            niveau,
            declencheeLe: maintenant,
            demiJournees: e.demiJourneesNonJustifiees,
            seuil: niveau === 1 ? seuils.niveau1 : seuils.niveau2,
            fenetreJours: seuils.fenetreJours,
          }),
        );
      });
      if (nouvelles.length > 0) await tx.insert(alerteAssiduite).values(nouvelles);
      bilan.alertes += nouvelles.length;

      const aNotifier = await tx
        .select({
          id: alerteAssiduite.id,
          personneId: alerteAssiduite.personneId,
          niveau: alerteAssiduite.niveau,
        })
        .from(alerteAssiduite)
        .where(isNull(alerteAssiduite.notifieeLe));
      if (aNotifier.length === 0) return [];
      const destinataires = await destinatairesAlertesAssiduite(tx, [
        ...new Set(aNotifier.map((a) => a.personneId)),
      ]);
      const parDestinataire = new Map<
        string,
        { email: string; prenom: string; niveau1: Set<string>; niveau2: Set<string>; ids: string[] }
      >();
      for (const alerte of aNotifier) {
        for (const d of destinataires) {
          if (d.apprenantId !== alerte.personneId || (alerte.niveau === 1 && d.direction)) continue;
          const envoi = parDestinataire.get(d.personneId) ?? {
            email: d.email,
            prenom: d.prenom,
            niveau1: new Set<string>(),
            niveau2: new Set<string>(),
            ids: [],
          };
          (alerte.niveau === 2 ? envoi.niveau2 : envoi.niveau1).add(alerte.personneId);
          envoi.ids.push(alerte.id);
          parDestinataire.set(d.personneId, envoi);
        }
      }
      // Notifiées même sans destinataire : personne à prévenir aujourd'hui, l'alerte reste ouverte
      // sur le tableau de bord.
      await tx
        .update(alerteAssiduite)
        .set({ notifieeLe: maintenant })
        .where(
          inArray(
            alerteAssiduite.id,
            aNotifier.map((a) => a.id),
          ),
        );
      const [marque] = await tx
        .select({
          ecole: organisation.nom,
          nom: organisation.nomAffichage,
          couleur: organisation.couleurPrincipale,
          logoEmpreinte: organisation.logoEmpreinte,
        })
        .from(organisation);
      const lien = new URL('/assiduite/tableau-de-bord', publicUrl).toString();
      return [...parDestinataire].map(([personneId, envoi]) => ({
        // Rejouer le même lot (échec avant la fin de la transaction) ne double pas l'envoi.
        cle: `alertes-assiduite-${personneId}-${createHash('sha256')
          .update([...envoi.ids].sort().join(','))
          .digest('hex')
          .slice(0, 32)}`,
        email: emailAlertesAssiduite({
          to: envoi.email,
          prenom: envoi.prenom,
          ecole: marque?.ecole ?? '',
          lien,
          // Un apprenant au niveau 2 n'est compté qu'au niveau 2.
          niveau1: [...envoi.niveau1].filter((id) => !envoi.niveau2.has(id)).length,
          niveau2: envoi.niveau2.size,
          marque: marque
            ? {
                nom: marque.nom,
                couleur: marque.couleur,
                logoUrl: marque.logoEmpreinte
                  ? new URL(cheminLogo(organisationId, marque.logoEmpreinte), publicUrl).toString()
                  : null,
              }
            : null,
        }),
      }));
    });
    // Confiés après la transaction : la file d'emails gère les nouvelles tentatives.
    for (const { email, cle } of emails) await envoyer(email, cle);
    bilan.emails += emails.length;
  }
  return bilan;
}

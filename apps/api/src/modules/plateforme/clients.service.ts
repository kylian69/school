import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ChangementEtatClient,
  ClientFiche,
  ExceptionModule,
  FiltreClients,
  NouveauClient,
} from '@scolaly/contracts';
import {
  client,
  clientEtatEvenement,
  contrat,
  enregistrerAuditPlateforme,
  groupe,
  newId,
  organisation,
  organisationModule,
  type Database,
  type Transaction,
} from '@scolaly/db';
import { accesSelonEtat, verifierSousDomaine, verifierTransition } from '@scolaly/domain';
import { modulesParFormule, valueAt } from '@scolaly/referentials';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { PLATFORM_DATABASE } from './tokens.js';

export interface Auteur {
  userId: string;
  adresseIp: string;
}

const ACCES_ORGANISATION = {
  complet: 'complet',
  'lecture-seule': 'lecture_seule',
  ferme: 'ferme',
} as const;

const MESSAGES_TRANSITION = {
  'motif-absent': 'Indiquez le motif du changement d’état (RG-19-02).',
  'transition-interdite': 'Ce changement d’état n’est pas possible depuis l’état actuel du client.',
  'meme-etat': 'Le client est déjà dans cet état.',
} as const;

/** Modules de la formule en vigueur aujourd'hui (grille commerciale datée, RG-19-04). */
const modulesDeLaFormule = (formule: string) =>
  valueAt(modulesParFormule, new Date().toISOString().slice(0, 10), formule).valeur;

/** Clients de la plateforme (module 19, RG-19-01 à RG-19-04). Toujours avec le rôle plateforme. */
@Injectable()
export class ClientsService {
  constructor(@Inject(PLATFORM_DATABASE) private readonly db: Database) {}

  async lister(filtre: FiltreClients) {
    const ecoles = sql<number>`(
      select count(*)::int from ${organisation} o
      where o.id = ${client.organisationId} or o.groupe_id = ${client.groupeId})`;
    const conditions = [
      filtre.q
        ? or(
            ilike(client.raisonSociale, `%${filtre.q}%`),
            ilike(client.sousDomaine, `%${filtre.q}%`),
          )
        : undefined,
      filtre.etat ? eq(client.etat, filtre.etat) : undefined,
      filtre.formule ? sql`${contrat.formule} = ${filtre.formule}` : undefined,
    ].filter((c) => c !== undefined);
    const lignes = await this.db
      .select({
        id: client.id,
        raisonSociale: client.raisonSociale,
        sousDomaine: client.sousDomaine,
        etat: client.etat,
        groupeId: client.groupeId,
        formule: contrat.formule,
        volumeApprenants: contrat.volumeApprenants,
        dateFin: contrat.dateFin,
        ecoles,
      })
      .from(client)
      .leftJoin(contrat, eq(contrat.clientId, client.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(client.raisonSociale));
    return lignes.map(({ groupeId, ...ligne }) => ({
      ...ligne,
      type: groupeId ? ('groupe' as const) : ('organisation' as const),
    }));
  }

  async creer(entree: NouveauClient, auteur: Auteur): Promise<ClientFiche> {
    const sousDomaine = verifierSousDomaine(entree.sousDomaine);
    if (!sousDomaine.ok) {
      throw new BadRequestException(
        sousDomaine.refus === 'reserve'
          ? 'Ce sous-domaine est réservé à la plateforme. Choisissez-en un autre.'
          : 'Sous-domaine invalide : 3 à 40 caractères, lettres minuscules, chiffres et tirets.',
      );
    }
    const pris = await this.db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.sousDomaine, entree.sousDomaine));
    if (pris.length > 0) {
      throw new ConflictException('Ce sous-domaine est déjà utilisé par un autre client.');
    }
    const modules = modulesDeLaFormule(entree.formule);

    const clientId = await this.db.transaction(async (tx) => {
      const groupeId = entree.type === 'groupe' ? newId() : null;
      if (groupeId)
        await tx
          .insert(groupe)
          .values({ id: groupeId, nom: entree.raisonSociale, createdBy: auteur.userId });
      const organisations = entree.ecoles.map((ecole) => ({
        id: newId(),
        groupeId,
        nom: ecole.nom,
        nomAffichage: ecole.nomAffichage,
        ...(entree.siren && entree.type === 'organisation' ? { siren: entree.siren } : {}),
        createdBy: auteur.userId,
      }));
      await tx.insert(organisation).values(organisations);
      const id = newId();
      await tx.insert(client).values({
        id,
        groupeId,
        organisationId: groupeId ? null : (organisations[0]?.id ?? null),
        raisonSociale: entree.raisonSociale,
        siren: entree.siren ?? null,
        sousDomaine: entree.sousDomaine,
        administrateurNom: entree.administrateur.nom,
        administrateurEmail: entree.administrateur.email,
        contactFacturationNom: entree.contactFacturation?.nom ?? null,
        contactFacturationEmail: entree.contactFacturation?.email ?? null,
        createdBy: auteur.userId,
      });
      await tx.insert(contrat).values({
        clientId: id,
        formule: entree.formule,
        volumeApprenants: entree.volumeApprenants,
        dateDebut: entree.dateDebut,
        dateFin: entree.dateFin,
        referenceDevis: entree.referenceDevis ?? null,
        createdBy: auteur.userId,
      });
      await tx.insert(clientEtatEvenement).values({
        clientId: id,
        etat: 'actif',
        motif: 'Création du client (devis signé)',
        auteurId: auteur.userId,
      });
      await tx.insert(organisationModule).values(
        organisations.flatMap((o) =>
          modules.map((module) => ({
            organisationId: o.id,
            module,
            actif: true,
            origine: 'formule' as const,
          })),
        ),
      );
      await enregistrerAuditPlateforme(tx, {
        action: 'client.creer',
        objetType: 'client',
        objetId: id,
        auteurId: auteur.userId,
        adresseIp: auteur.adresseIp,
        apres: { ...entree, organisations: organisations.map((o) => o.id) },
      });
      return id;
    });
    return this.fiche(clientId);
  }

  async fiche(id: string, tx: Database | Transaction = this.db): Promise<ClientFiche> {
    const [ligne] = await tx.select().from(client).where(eq(client.id, id));
    if (!ligne) throw new NotFoundException('Client introuvable.');
    const [leContrat] = await tx
      .select()
      .from(contrat)
      .where(eq(contrat.clientId, id))
      .orderBy(desc(contrat.dateDebut))
      .limit(1);
    const ecoles = await this.ecolesDu(tx, ligne);
    const modules = await this.modulesDe(
      tx,
      ecoles.map((e) => e.id),
    );
    const historique = await tx
      .select()
      .from(clientEtatEvenement)
      .where(eq(clientEtatEvenement.clientId, id))
      .orderBy(desc(clientEtatEvenement.survenuLe));
    return {
      id: ligne.id,
      raisonSociale: ligne.raisonSociale,
      siren: ligne.siren,
      sousDomaine: ligne.sousDomaine,
      etat: ligne.etat,
      type: ligne.groupeId ? 'groupe' : 'organisation',
      administrateur: { nom: ligne.administrateurNom, email: ligne.administrateurEmail },
      contactFacturation:
        ligne.contactFacturationNom && ligne.contactFacturationEmail
          ? { nom: ligne.contactFacturationNom, email: ligne.contactFacturationEmail }
          : null,
      contrat: leContrat
        ? {
            formule: leContrat.formule,
            volumeApprenants: leContrat.volumeApprenants,
            dateDebut: leContrat.dateDebut,
            dateFin: leContrat.dateFin,
            referenceDevis: leContrat.referenceDevis,
          }
        : null,
      ecoles: ecoles.map((e) => ({
        id: e.id,
        nom: e.nom,
        nomAffichage: e.nomAffichage,
        acces: e.acces,
      })),
      modules: modules as ClientFiche['modules'],
      historique: historique.map((h) => ({
        etatPrecedent: h.etatPrecedent,
        etat: h.etat,
        motif: h.motif,
        survenuLe: h.survenuLe.toISOString(),
      })),
    };
  }

  async changerEtat(
    id: string,
    changement: ChangementEtatClient,
    auteur: Auteur,
  ): Promise<ClientFiche> {
    return this.db.transaction(async (tx) => {
      const [ligne] = await tx.select().from(client).where(eq(client.id, id)).for('update');
      if (!ligne) throw new NotFoundException('Client introuvable.');
      const verdict = verifierTransition(ligne.etat, changement.etat, changement.motif);
      if (!verdict.ok) throw new BadRequestException(MESSAGES_TRANSITION[verdict.refus]);

      await tx
        .update(client)
        .set({ etat: changement.etat, updatedBy: auteur.userId })
        .where(eq(client.id, id));
      const ecoles = await this.ecolesDu(tx, ligne);
      if (ecoles.length > 0) {
        await tx
          .update(organisation)
          .set({
            acces: ACCES_ORGANISATION[accesSelonEtat(changement.etat)],
            updatedBy: auteur.userId,
          })
          .where(
            inArray(
              organisation.id,
              ecoles.map((e) => e.id),
            ),
          );
      }
      await tx.insert(clientEtatEvenement).values({
        clientId: id,
        etatPrecedent: ligne.etat,
        etat: changement.etat,
        motif: changement.motif,
        auteurId: auteur.userId,
      });
      await enregistrerAuditPlateforme(tx, {
        action: 'client.changer-etat',
        objetType: 'client',
        objetId: id,
        auteurId: auteur.userId,
        adresseIp: auteur.adresseIp,
        avant: { etat: ligne.etat },
        apres: changement,
      });
      return this.fiche(id, tx);
    });
  }

  /** Ouvre ou ferme un module pour toutes les écoles du client, hors formule (RG-19-04). */
  async exceptionModule(
    id: string,
    exception: ExceptionModule,
    auteur: Auteur,
  ): Promise<ClientFiche> {
    return this.db.transaction(async (tx) => {
      const [ligne] = await tx.select().from(client).where(eq(client.id, id));
      if (!ligne) throw new NotFoundException('Client introuvable.');
      const [leContrat] = await tx
        .select()
        .from(contrat)
        .where(eq(contrat.clientId, id))
        .orderBy(desc(contrat.dateDebut))
        .limit(1);
      const dansLaFormule = leContrat
        ? modulesDeLaFormule(leContrat.formule).includes(exception.module)
        : false;
      const origine =
        exception.actif === dansLaFormule ? ('formule' as const) : ('exception' as const);
      const ecoles = await this.ecolesDu(tx, ligne);
      for (const ecole of ecoles) {
        await tx
          .insert(organisationModule)
          .values({
            organisationId: ecole.id,
            module: exception.module,
            actif: exception.actif,
            origine,
          })
          .onConflictDoUpdate({
            target: [organisationModule.organisationId, organisationModule.module],
            set: {
              actif: exception.actif,
              origine,
              updatedBy: auteur.userId,
              updatedAt: new Date(),
            },
          });
      }
      await enregistrerAuditPlateforme(tx, {
        action: 'client.module',
        objetType: 'client',
        objetId: id,
        auteurId: auteur.userId,
        adresseIp: auteur.adresseIp,
        apres: { ...exception, origine },
      });
      return this.fiche(id, tx);
    });
  }

  private ecolesDu(
    tx: Database | Transaction,
    ligne: { organisationId: string | null; groupeId: string | null },
  ) {
    return tx
      .select({
        id: organisation.id,
        nom: organisation.nom,
        nomAffichage: organisation.nomAffichage,
        acces: organisation.acces,
      })
      .from(organisation)
      .where(
        ligne.groupeId
          ? eq(organisation.groupeId, ligne.groupeId)
          : eq(organisation.id, ligne.organisationId ?? ''),
      )
      .orderBy(asc(organisation.nom));
  }

  /** Modules du client : identiques pour toutes ses écoles, lus sur la première. */
  private async modulesDe(tx: Database | Transaction, ecoles: string[]) {
    const [premiere] = ecoles;
    if (!premiere) return [];
    return tx
      .select({
        module: organisationModule.module,
        actif: organisationModule.actif,
        origine: organisationModule.origine,
      })
      .from(organisationModule)
      .where(eq(organisationModule.organisationId, premiere))
      .orderBy(asc(organisationModule.module));
  }
}

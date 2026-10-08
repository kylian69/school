import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  PassageAnnee,
  PreparationAnneeSuivante,
  ResultatPassage,
  ResultatPreparation,
} from '@scolaly/contracts';
import {
  affectation,
  affectationGroupe,
  anneeScolaire,
  enregistrerAudit,
  groupeEleves,
  groupePromotion,
  inscription,
  inscriptionStatut,
  maquetteModule,
  maquetteVersion,
  newId,
  promotion,
  type Transaction,
} from '@scolaly/db';
import { statutsReconduits, versionDeReference } from '@scolaly/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { aujourdhui } from '../../shared/dates.js';
import { couvrePromotion, droitsSurPromotion, promotionsCouvertes } from './perimetre.js';

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

/**
 * RG-02-20 : préparer l'année suivante (promotions N+1 sur la dernière version publiée, groupes
 * vides, affectations des intervenants) et passer en année supérieure les apprenants admis.
 * Les inscriptions ne sont jamais copiées.
 */
@Injectable()
export class AnneeSuivanteService {
  async preparer(
    tx: Transaction,
    access: Access,
    saisie: PreparationAnneeSuivante,
    adresseIp: string,
  ): Promise<ResultatPreparation> {
    const [source] = await tx
      .select()
      .from(anneeScolaire)
      .where(and(eq(anneeScolaire.id, saisie.anneeSourceId), isNull(anneeScolaire.deletedAt)));
    const [cible] = await tx
      .select()
      .from(anneeScolaire)
      .where(and(eq(anneeScolaire.id, saisie.anneeCibleId), isNull(anneeScolaire.deletedAt)));
    if (!source) throw invalide('anneeSourceId', 'Cette année scolaire n’existe pas dans l’école.');
    if (!cible)
      throw invalide(
        'anneeCibleId',
        'Créez d’abord l’année suivante dans le calendrier (Paramètres › Calendrier).',
      );
    if (cible.dateDebut <= source.dateDebut)
      throw invalide('anneeCibleId', 'L’année cible doit suivre l’année source.');

    const gestion = await promotionsCouvertes(tx, access, ['promotions:gerer']);
    const sources = (
      await tx
        .select()
        .from(promotion)
        .where(
          and(
            eq(promotion.anneeScolaireId, source.id),
            inArray(promotion.formationId, saisie.formationIds),
            isNull(promotion.deletedAt),
          ),
        )
    ).filter((p) => couvrePromotion(gestion, p.id));
    const existantes = await tx
      .select()
      .from(promotion)
      .where(and(eq(promotion.anneeScolaireId, cible.id), isNull(promotion.deletedAt)));
    const versions = await tx
      .select()
      .from(maquetteVersion)
      .where(inArray(maquetteVersion.formationId, saisie.formationIds));
    const copierAffectations = access.permissions.has('affectations:gerer');
    const resultat: ResultatPreparation = { apercu: saisie.apercu, promotions: [], creees: 0 };
    const groupesCopies = new Map<string, string>();

    for (const p of sources) {
      const version = versionDeReference(
        versions.filter((v) => v.formationId === p.formationId && v.statut === 'publiee'),
      );
      const existante = existantes.some(
        (e) =>
          e.formationId === p.formationId &&
          e.anneeFormation === p.anneeFormation &&
          e.etablissementId === p.etablissementId,
      );
      const liens = await tx
        .select()
        .from(groupePromotion)
        .where(eq(groupePromotion.promotionId, p.id));
      const groupes =
        liens.length === 0
          ? []
          : await tx
              .select()
              .from(groupeEleves)
              .where(
                and(
                  inArray(
                    groupeEleves.id,
                    liens.map((l) => l.groupeId),
                  ),
                  isNull(groupeEleves.deletedAt),
                ),
              );
      const affectations = copierAffectations
        ? await tx
            .select()
            .from(affectation)
            .where(and(eq(affectation.promotionId, p.id), isNull(affectation.deletedAt)))
        : [];
      // Modules de la nouvelle version, retrouvés par leur code si la version change.
      const modulesSource =
        affectations.length === 0
          ? []
          : await tx
              .select()
              .from(maquetteModule)
              .where(
                inArray(
                  maquetteModule.id,
                  affectations.map((a) => a.moduleId),
                ),
              );
      const modulesCible =
        version && version.id !== p.versionId
          ? await tx.select().from(maquetteModule).where(eq(maquetteModule.versionId, version.id))
          : [];
      const moduleCible = (moduleId: string) => {
        if (!version || version.id === p.versionId) return moduleId;
        const code = modulesSource.find((m) => m.id === moduleId)?.code;
        return modulesCible.find((m) => m.code === code)?.id ?? null;
      };
      const reprises = affectations.filter((a) => moduleCible(a.moduleId) !== null);
      const libelle = p.libelle.includes(source.libelle)
        ? p.libelle.replace(source.libelle, cible.libelle)
        : `${p.libelle} · ${cible.libelle}`;
      resultat.promotions.push({
        sourceId: p.id,
        libelle,
        version: version?.numero ?? 0,
        groupes: groupes.length,
        affectations: reprises.length,
        affectationsIgnorees: affectations.length - reprises.length,
        existante,
      });
      if (saisie.apercu || existante || !version) continue;

      const id = newId();
      await tx.insert(promotion).values({
        id,
        organisationId: access.organisationId,
        formationId: p.formationId,
        versionId: version.id,
        anneeFormation: p.anneeFormation,
        anneeScolaireId: cible.id,
        etablissementId: p.etablissementId,
        libelle,
        dateDebut: cible.dateDebut,
        dateFin: cible.dateFin,
        reconduiteDe: p.id,
        createdBy: access.userId,
      });
      for (const g of groupes) {
        let copie = groupesCopies.get(g.id);
        if (!copie) {
          copie = newId();
          groupesCopies.set(g.id, copie);
          await tx.insert(groupeEleves).values({
            id: copie,
            organisationId: access.organisationId,
            libelle: g.libelle,
            type: g.type,
            capacite: g.capacite,
            option: g.option,
            createdBy: access.userId,
          });
        }
        await tx.insert(groupePromotion).values({
          organisationId: access.organisationId,
          groupeId: copie,
          promotionId: id,
          createdBy: access.userId,
        });
      }
      for (const a of reprises) {
        const nouvelle = newId();
        await tx.insert(affectation).values({
          id: nouvelle,
          organisationId: access.organisationId,
          personneId: a.personneId,
          moduleId: moduleCible(a.moduleId) ?? a.moduleId,
          promotionId: id,
          heuresCm: a.heuresCm,
          heuresTd: a.heuresTd,
          heuresTp: a.heuresTp,
          heuresProjet: a.heuresProjet,
          heuresElearning: a.heuresElearning,
          reconduiteDe: a.id,
          createdBy: access.userId,
        });
        const groupesAffectes = await tx
          .select()
          .from(affectationGroupe)
          .where(eq(affectationGroupe.affectationId, a.id));
        const mappes = groupesAffectes.flatMap((ag) => groupesCopies.get(ag.groupeId) ?? []);
        if (mappes.length > 0) {
          await tx.insert(affectationGroupe).values(
            mappes.map((groupeId) => ({
              organisationId: access.organisationId,
              affectationId: nouvelle,
              groupeId,
              createdBy: access.userId,
            })),
          );
        }
      }
      resultat.creees += 1;
    }
    if (!saisie.apercu) {
      await enregistrerAudit(tx, {
        action: 'annee.preparer-suivante',
        objetType: 'annee_scolaire',
        objetId: cible.id,
        auteurId: access.userId,
        adresseIp,
        apres: {
          source: source.libelle,
          cible: cible.libelle,
          formations: saisie.formationIds,
          creees: resultat.creees,
        },
      });
    }
    return resultat;
  }

  /** Passage en année supérieure : nouvelles inscriptions, statut en vigueur repris. */
  async passer(
    tx: Transaction,
    access: Access,
    promotionId: string,
    saisie: PassageAnnee,
    adresseIp: string,
  ): Promise<ResultatPassage> {
    await droitsSurPromotion(tx, access, promotionId);
    const gestion = await promotionsCouvertes(tx, access, ['promotions:gerer']);
    if (!couvrePromotion(gestion, saisie.promotionCibleId)) {
      throw new ForbiddenException('La promotion cible est hors de votre périmètre de gestion.');
    }
    const [source] = await tx.select().from(promotion).where(eq(promotion.id, promotionId));
    const [cible] = await tx
      .select()
      .from(promotion)
      .where(and(eq(promotion.id, saisie.promotionCibleId), isNull(promotion.deletedAt)));
    if (!source || !cible) throw new NotFoundException('Promotion introuvable.');
    if (cible.formationId !== source.formationId || cible.dateDebut <= source.dateDebut) {
      throw invalide(
        'promotionCibleId',
        'Choisissez une promotion ultérieure de la même formation.',
      );
    }
    const inscriptions = await tx
      .select()
      .from(inscription)
      .where(
        and(
          eq(inscription.promotionId, promotionId),
          inArray(inscription.id, saisie.inscriptionIds),
          isNull(inscription.deletedAt),
        ),
      );
    if (inscriptions.length !== new Set(saisie.inscriptionIds).size) {
      throw invalide(
        'inscriptionIds',
        'Une des inscriptions choisies n’appartient pas à cette promotion.',
      );
    }
    const deja = new Set(
      (
        await tx
          .select({ personneId: inscription.personneId })
          .from(inscription)
          .where(and(eq(inscription.promotionId, cible.id), isNull(inscription.deletedAt)))
      ).map((i) => i.personneId),
    );
    const statuts = await tx
      .select()
      .from(inscriptionStatut)
      .where(
        inArray(
          inscriptionStatut.inscriptionId,
          inscriptions.map((i) => i.id),
        ),
      );
    let inscrites = 0;
    for (const i of inscriptions) {
      if (deja.has(i.personneId)) continue;
      const periodes = statuts
        .filter((s) => s.inscriptionId === i.id)
        .map((s) => ({ debut: s.debut, fin: s.fin, valeur: s.statut, echeance: s.echeance }));
      const id = newId();
      await tx.insert(inscription).values({
        id,
        organisationId: access.organisationId,
        personneId: i.personneId,
        promotionId: cible.id,
        dateEntree: cible.dateDebut,
        createdBy: access.userId,
      });
      await tx.insert(inscriptionStatut).values(
        statutsReconduits(periodes, aujourdhui(), cible.dateDebut).map((p) => ({
          organisationId: access.organisationId,
          inscriptionId: id,
          statut: p.valeur,
          debut: p.debut,
          fin: p.fin,
          echeance: p.echeance ?? null,
          createdBy: access.userId,
        })),
      );
      inscrites += 1;
    }
    await enregistrerAudit(tx, {
      action: 'promotion.passage',
      objetType: 'promotion',
      objetId: cible.id,
      auteurId: access.userId,
      adresseIp,
      apres: { source: source.libelle, cible: cible.libelle, inscrites },
    });
    return { inscrites, dejaInscrites: inscriptions.length - inscrites };
  }
}

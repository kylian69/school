import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Affectation,
  AffectationsPromotion,
  MesEnseignements,
  ModificationAffectation,
  SaisieAffectation,
} from '@scolaly/contracts';
import {
  affectation,
  affectationGroupe,
  enregistrerAudit,
  groupeEleves,
  groupePromotion,
  maquetteModule,
  maquetteUe,
  personne,
  promotion,
  type Transaction,
} from '@scolaly/db';
import { ecartsHeures, totalAffecte, TYPES_HEURES, type Heures } from '@scolaly/domain';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { couvrePromotion, droitsSurPromotion, promotionsCouvertes } from './perimetre.js';

type LigneAffectation = typeof affectation.$inferSelect;

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

const heuresDe = (l: {
  heuresCm: number;
  heuresTd: number;
  heuresTp: number;
  heuresProjet: number;
  heuresElearning: number;
}): Heures => ({
  cm: l.heuresCm,
  td: l.heuresTd,
  tp: l.heuresTp,
  projet: l.heuresProjet,
  elearning: l.heuresElearning,
});
const colonnes = (h: Heures) => ({
  heuresCm: h.cm,
  heuresTd: h.td,
  heuresTp: h.tp,
  heuresProjet: h.projet,
  heuresElearning: h.elearning,
});

/** Affectation des intervenants aux modules d'une promotion (US-02-08, US-02-11 ; RG-02-18). */
@Injectable()
export class AffectationsService {
  async lister(
    tx: Transaction,
    access: Access,
    promotionId: string,
  ): Promise<AffectationsPromotion> {
    await droitsSurPromotion(tx, access, promotionId);
    const promo = await this.promotion(tx, promotionId);
    const lignes = await tx
      .select()
      .from(affectation)
      .where(and(eq(affectation.promotionId, promotionId), isNull(affectation.deletedAt)));
    const affectations = await this.detailler(tx, lignes);
    const modules = await tx
      .select({ module: maquetteModule, ueCode: maquetteUe.code })
      .from(maquetteModule)
      .innerJoin(maquetteUe, eq(maquetteUe.id, maquetteModule.ueId))
      .where(
        and(
          eq(maquetteModule.versionId, promo.versionId),
          eq(maquetteUe.annee, promo.anneeFormation),
        ),
      )
      .orderBy(asc(maquetteUe.semestre), asc(maquetteUe.ordre), asc(maquetteModule.ordre));
    return {
      affectations,
      modules: modules.map(({ module: m, ueCode }) => {
        const siennes = affectations.filter((a) => a.moduleId === m.id);
        return {
          id: m.id,
          code: m.code,
          intitule: m.intitule,
          ueCode,
          prevu: heuresDe(m),
          affecte: totalAffecte(siennes),
          ecarts: ecartsHeures(heuresDe(m), siennes),
        };
      }),
      modifiable: await this.peutGerer(tx, access, promotionId),
    };
  }

  async creer(
    tx: Transaction,
    access: Access,
    promotionId: string,
    saisie: SaisieAffectation,
    adresseIp: string,
  ): Promise<Affectation> {
    await this.exigerGestion(tx, access, promotionId);
    const promo = await this.promotion(tx, promotionId);
    const [fiche] = await tx
      .select({ id: personne.id })
      .from(personne)
      .where(and(eq(personne.id, saisie.personneId), isNull(personne.deletedAt)));
    if (!fiche) throw invalide('personneId', 'Cet intervenant n’existe pas dans l’école.');
    const [module] = await tx
      .select({ id: maquetteModule.id })
      .from(maquetteModule)
      .where(
        and(eq(maquetteModule.id, saisie.moduleId), eq(maquetteModule.versionId, promo.versionId)),
      );
    if (!module)
      throw invalide(
        'moduleId',
        'Ce module n’appartient pas à la maquette suivie par la promotion.',
      );
    await this.verifierGroupes(tx, promotionId, saisie.groupeIds);
    const [ligne] = await tx
      .insert(affectation)
      .values({
        organisationId: access.organisationId,
        personneId: saisie.personneId,
        moduleId: saisie.moduleId,
        promotionId,
        ...colonnes(saisie.heures),
        createdBy: access.userId,
      })
      .returning();
    if (!ligne) throw new Error('Affectation impossible.');
    await this.ecrireGroupes(tx, access, ligne.id, saisie.groupeIds);
    const [resultat] = await this.detailler(tx, [ligne]);
    if (!resultat) throw new Error('Affectation introuvable après création.');
    await enregistrerAudit(tx, {
      action: 'affectation.creer',
      objetType: 'promotion',
      objetId: promotionId,
      auteurId: access.userId,
      adresseIp,
      apres: resultat,
    });
    return resultat;
  }

  async modifier(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationAffectation,
    adresseIp: string,
  ): Promise<Affectation> {
    const avant = await this.charger(tx, id);
    await this.exigerGestion(tx, access, avant.promotionId);
    if (changement.groupeIds) {
      await this.verifierGroupes(tx, avant.promotionId, changement.groupeIds);
      await this.ecrireGroupes(tx, access, id, changement.groupeIds);
    }
    if (changement.heures) {
      await tx
        .update(affectation)
        .set({ ...colonnes(changement.heures), updatedBy: access.userId })
        .where(eq(affectation.id, id));
    }
    const [resultat] = await this.detailler(tx, [await this.charger(tx, id)]);
    if (!resultat) throw new NotFoundException('Affectation introuvable.');
    await enregistrerAudit(tx, {
      action: 'affectation.modifier',
      objetType: 'promotion',
      objetId: avant.promotionId,
      auteurId: access.userId,
      adresseIp,
      avant,
      apres: resultat,
    });
    return resultat;
  }

  async supprimer(tx: Transaction, access: Access, id: string, adresseIp: string): Promise<void> {
    const avant = await this.charger(tx, id);
    await this.exigerGestion(tx, access, avant.promotionId);
    await tx
      .update(affectation)
      .set({ deletedAt: new Date(), updatedBy: access.userId })
      .where(eq(affectation.id, id));
    await enregistrerAudit(tx, {
      action: 'affectation.supprimer',
      objetType: 'promotion',
      objetId: avant.promotionId,
      auteurId: access.userId,
      adresseIp,
      avant,
    });
  }

  /** E-02-08 : modules, groupes et heures prévues de l'intervenant connecté. */
  async mesEnseignements(tx: Transaction, personneId: string): Promise<MesEnseignements> {
    const lignes = await tx
      .select({ affectation, promotion, module: maquetteModule })
      .from(affectation)
      .innerJoin(promotion, eq(promotion.id, affectation.promotionId))
      .innerJoin(maquetteModule, eq(maquetteModule.id, affectation.moduleId))
      .where(
        and(
          eq(affectation.personneId, personneId),
          isNull(affectation.deletedAt),
          isNull(promotion.deletedAt),
        ),
      )
      .orderBy(asc(promotion.libelle), asc(maquetteModule.code));
    const ids = lignes.map((l) => l.affectation.id);
    const groupes =
      ids.length === 0
        ? []
        : await tx
            .select({
              affectationId: affectationGroupe.affectationId,
              libelle: groupeEleves.libelle,
            })
            .from(affectationGroupe)
            .innerJoin(groupeEleves, eq(groupeEleves.id, affectationGroupe.groupeId))
            .where(inArray(affectationGroupe.affectationId, ids));
    const enseignements = lignes.map((l) => ({
      affectationId: l.affectation.id,
      promotion: { id: l.promotion.id, libelle: l.promotion.libelle },
      module: { code: l.module.code, intitule: l.module.intitule },
      groupes: groupes.filter((g) => g.affectationId === l.affectation.id).map((g) => g.libelle),
      heures: heuresDe(l.affectation),
      realisees: null,
    }));
    const total = totalAffecte(enseignements);
    return {
      enseignements,
      totalHeures: Math.round(TYPES_HEURES.reduce((s, t) => s + total[t], 0) * 100) / 100,
    };
  }

  private async detailler(
    tx: Transaction,
    lignes: readonly LigneAffectation[],
  ): Promise<Affectation[]> {
    if (lignes.length === 0) return [];
    const ids = lignes.map((l) => l.id);
    const groupes = await tx
      .select()
      .from(affectationGroupe)
      .where(inArray(affectationGroupe.affectationId, ids));
    const personnes = await tx
      .select()
      .from(personne)
      .where(inArray(personne.id, [...new Set(lignes.map((l) => l.personneId))]));
    return lignes.map((l) => {
      const p = personnes.find((x) => x.id === l.personneId);
      return {
        id: l.id,
        promotionId: l.promotionId,
        moduleId: l.moduleId,
        intervenant: {
          id: l.personneId,
          nom: p?.nomUsage ?? p?.nom ?? '',
          prenom: p?.prenom ?? '',
        },
        groupeIds: groupes.filter((g) => g.affectationId === l.id).map((g) => g.groupeId),
        heures: heuresDe(l),
      };
    });
  }

  private async charger(tx: Transaction, id: string) {
    const [ligne] = await tx
      .select()
      .from(affectation)
      .where(and(eq(affectation.id, id), isNull(affectation.deletedAt)));
    if (!ligne) throw new NotFoundException('Affectation introuvable.');
    return ligne;
  }

  private async promotion(tx: Transaction, id: string) {
    const [ligne] = await tx.select().from(promotion).where(eq(promotion.id, id));
    if (!ligne) throw new NotFoundException('Promotion introuvable.');
    return ligne;
  }

  private async peutGerer(tx: Transaction, access: Access, promotionId: string) {
    if (!access.permissions.has('affectations:gerer')) return false;
    return couvrePromotion(
      await promotionsCouvertes(tx, access, ['affectations:gerer']),
      promotionId,
    );
  }

  private async exigerGestion(tx: Transaction, access: Access, promotionId: string) {
    await droitsSurPromotion(tx, access, promotionId);
    if (!(await this.peutGerer(tx, access, promotionId))) {
      throw new ForbiddenException(
        'Les affectations de cette promotion sont hors de votre périmètre.',
      );
    }
  }

  private async verifierGroupes(
    tx: Transaction,
    promotionId: string,
    groupeIds: readonly string[],
  ) {
    if (groupeIds.length === 0) return;
    const liens = await tx
      .select({ id: groupePromotion.groupeId })
      .from(groupePromotion)
      .where(
        and(
          eq(groupePromotion.promotionId, promotionId),
          inArray(groupePromotion.groupeId, [...groupeIds]),
        ),
      );
    if (liens.length !== new Set(groupeIds).size) {
      throw invalide('groupeIds', 'Un des groupes choisis n’appartient pas à cette promotion.');
    }
  }

  private async ecrireGroupes(
    tx: Transaction,
    access: Access,
    affectationId: string,
    groupeIds: readonly string[],
  ) {
    await tx.delete(affectationGroupe).where(eq(affectationGroupe.affectationId, affectationId));
    const uniques = [...new Set(groupeIds)];
    if (uniques.length === 0) return;
    await tx.insert(affectationGroupe).values(
      uniques.map((groupeId) => ({
        organisationId: access.organisationId,
        affectationId,
        groupeId,
        createdBy: access.userId,
      })),
    );
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  DuplicationFormation,
  Formation,
  ListeFormations,
  ModificationFormation,
  NouvelleFormation,
  RechercheFormations,
  VersionResume,
} from '@scolaly/contracts';
import {
  enregistrerAudit,
  etablissement,
  formation,
  formationEtablissement,
  maquetteVersion,
  newId,
  type Transaction,
} from '@scolaly/db';
import { REGLES_VALIDATION_PAR_DEFAUT, versionDeReference } from '@scolaly/domain';
import { and, asc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { copierVersion } from './copie-version.js';
import {
  couvre,
  droitsSurFormation,
  etablissementsCouverts,
  exigerModification,
  formationsCouvertes,
  LECTURE,
} from './perimetre.js';

type LigneFormation = typeof formation.$inferSelect;
type LigneVersion = typeof maquetteVersion.$inferSelect;

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

/** Version résumée ; « utilisée » s'appuiera sur les promotions (I3.2). */
export const resumeVersion = (v: LigneVersion): VersionResume => ({
  id: v.id,
  numero: v.numero,
  statut: v.statut,
  publieeLe: v.publieeLe?.toISOString() ?? null,
  utilisee: false,
});

/** Catalogue des formations (E-02-01 ; US-02-01, US-02-04, RG-02-01). */
@Injectable()
export class FormationsService {
  async lister(
    tx: Transaction,
    access: Access,
    recherche: RechercheFormations,
  ): Promise<ListeFormations> {
    const couvertes = await formationsCouvertes(tx, access, LECTURE);
    const conditions: (SQL | undefined)[] = [isNull(formation.deletedAt)];
    if (couvertes !== null) {
      if (couvertes.size === 0) return { formations: [], creation: this.peutCreer(access) };
      conditions.push(inArray(formation.id, [...couvertes]));
    }
    if (recherche.type) conditions.push(eq(formation.type, recherche.type));
    if (recherche.niveau) conditions.push(eq(formation.niveau, recherche.niveau));
    if (recherche.mode) conditions.push(sql`${recherche.mode} = any(${formation.modes})`);
    if (recherche.statut) conditions.push(eq(formation.statut, recherche.statut));
    if (recherche.etablissementId) {
      conditions.push(
        inArray(
          formation.id,
          tx
            .select({ id: formationEtablissement.formationId })
            .from(formationEtablissement)
            .where(eq(formationEtablissement.etablissementId, recherche.etablissementId)),
        ),
      );
    }
    const lignes = await tx
      .select()
      .from(formation)
      .where(and(...conditions))
      .orderBy(asc(formation.intitule));
    return {
      formations: await this.detailler(tx, access, lignes),
      creation: this.peutCreer(access),
    };
  }

  async lire(tx: Transaction, access: Access, id: string): Promise<Formation> {
    const ligne = await this.charger(tx, access, id);
    const [detail] = await this.detailler(tx, access, [ligne]);
    if (!detail) throw new Error('Formation introuvable.');
    return detail;
  }

  async creer(
    tx: Transaction,
    access: Access,
    entree: NouvelleFormation,
    adresseIp: string,
  ): Promise<Formation> {
    this.verifierCreation(access, entree.etablissementIds);
    await this.verifierEtablissements(tx, entree.etablissementIds);
    const id = newId();
    await tx.insert(formation).values({
      id,
      organisationId: access.organisationId,
      intitule: entree.intitule,
      type: entree.type,
      niveau: entree.niveau,
      codeRncp: entree.codeRncp || null,
      dureeAnnees: entree.dureeAnnees,
      modes: entree.modes,
      createdBy: access.userId,
    });
    await this.ecrireEtablissements(tx, access, id, entree.etablissementIds);
    await tx.insert(maquetteVersion).values({
      organisationId: access.organisationId,
      formationId: id,
      numero: 1,
      regles: REGLES_VALIDATION_PAR_DEFAUT,
      createdBy: access.userId,
    });
    const resultat = await this.lire(tx, access, id);
    await enregistrerAudit(tx, {
      action: 'formation.creer',
      objetType: 'formation',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      apres: this.trace(resultat),
    });
    return resultat;
  }

  async modifier(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationFormation,
    adresseIp: string,
  ): Promise<Formation> {
    const avant = await this.lire(tx, access, id);
    exigerModification(avant);
    const { etablissementIds, ...colonnes } = changement;
    if (etablissementIds) {
      await this.verifierEtablissements(tx, etablissementIds);
      await this.ecrireEtablissements(tx, access, id, etablissementIds);
    }
    await tx
      .update(formation)
      .set({
        ...colonnes,
        ...(colonnes.codeRncp !== undefined ? { codeRncp: colonnes.codeRncp || null } : {}),
        updatedBy: access.userId,
      })
      .where(eq(formation.id, id));
    const apres = await this.lire(tx, access, id);
    await enregistrerAudit(tx, {
      action: 'formation.modifier',
      objetType: 'formation',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: this.trace(avant),
      apres: this.trace(apres),
    });
    return apres;
  }

  /**
   * US-02-04, RG-02-20 : copie de la formation, de ses établissements et de sa dernière version de
   * maquette (publiée, sinon le brouillon), qui devient la version 1 en brouillon.
   */
  async dupliquer(
    tx: Transaction,
    access: Access,
    id: string,
    entree: DuplicationFormation,
    adresseIp: string,
  ): Promise<Formation> {
    const source = await this.lire(tx, access, id);
    this.verifierCreation(access, source.etablissementIds);
    const reference = versionDeReference(source.versions);
    const copie = newId();
    await tx.insert(formation).values({
      id: copie,
      organisationId: access.organisationId,
      intitule: entree.intitule,
      type: source.type,
      niveau: source.niveau,
      codeRncp: source.codeRncp,
      dureeAnnees: source.dureeAnnees,
      modes: source.modes,
      dupliqueDe: source.id,
      createdBy: access.userId,
    });
    await this.ecrireEtablissements(tx, access, copie, source.etablissementIds);
    if (reference) {
      await copierVersion(tx, access, reference.id, { formationId: copie, numero: 1 });
    } else {
      await tx.insert(maquetteVersion).values({
        organisationId: access.organisationId,
        formationId: copie,
        numero: 1,
        regles: REGLES_VALIDATION_PAR_DEFAUT,
        createdBy: access.userId,
      });
    }
    const resultat = await this.lire(tx, access, copie);
    await enregistrerAudit(tx, {
      action: 'formation.dupliquer',
      objetType: 'formation',
      objetId: copie,
      auteurId: access.userId,
      adresseIp,
      apres: { ...this.trace(resultat), dupliqueDe: source.id, version: reference?.numero ?? null },
    });
    return resultat;
  }

  /** Charge une formation visible dans le périmètre de lecture (sinon 404). */
  async charger(tx: Transaction, access: Access, id: string): Promise<LigneFormation> {
    await droitsSurFormation(tx, access, id);
    const [ligne] = await tx
      .select()
      .from(formation)
      .where(and(eq(formation.id, id), isNull(formation.deletedAt)));
    if (!ligne) throw new NotFoundException('Formation introuvable.');
    return ligne;
  }

  private async detailler(
    tx: Transaction,
    access: Access,
    lignes: readonly LigneFormation[],
  ): Promise<Formation[]> {
    if (lignes.length === 0) return [];
    const ids = lignes.map((f) => f.id);
    const etablissements = await tx
      .select()
      .from(formationEtablissement)
      .where(inArray(formationEtablissement.formationId, ids));
    const versions = await tx
      .select()
      .from(maquetteVersion)
      .where(inArray(maquetteVersion.formationId, ids))
      .orderBy(asc(maquetteVersion.numero));
    const gestion = access.permissions.has('referentiel:gerer')
      ? await formationsCouvertes(tx, access, ['referentiel:gerer'])
      : new Set<string>();
    const publication = access.permissions.has('referentiel:publier')
      ? await formationsCouvertes(tx, access, ['referentiel:publier'])
      : new Set<string>();
    return lignes.map((f) => ({
      id: f.id,
      intitule: f.intitule,
      type: f.type,
      niveau: f.niveau,
      codeRncp: f.codeRncp,
      dureeAnnees: f.dureeAnnees,
      modes: f.modes,
      statut: f.statut,
      etablissementIds: etablissements
        .filter((e) => e.formationId === f.id)
        .map((e) => e.etablissementId),
      versions: versions.filter((v) => v.formationId === f.id).map(resumeVersion),
      modifiable: couvre(gestion, f.id),
      publiable: couvre(publication, f.id),
    }));
  }

  /**
   * Création : périmètre « organisation », ou établissement pour une formation dispensée dans ses
   * seuls établissements. Un responsable limité à ses formations n'en crée pas de nouvelle.
   */
  private peutCreer(access: Access): boolean {
    if (!access.permissions.has('referentiel:gerer')) return false;
    const perimetres = access.perimetres.get('referentiel:gerer') ?? [];
    return perimetres.some((p) => p.type === 'organisation' || p.type === 'etablissement');
  }

  private verifierCreation(access: Access, etablissementIds: readonly string[]): void {
    const perimetres = access.perimetres.get('referentiel:gerer') ?? [];
    if (perimetres.some((p) => p.type === 'organisation')) return;
    const autorises = etablissementsCouverts(access, ['referentiel:gerer']);
    if (
      autorises.length === 0 ||
      etablissementIds.length === 0 ||
      !etablissementIds.every((e) => autorises.includes(e))
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez créer une formation que dans vos établissements : choisissez-les dans la liste, ou demandez à un administrateur.',
      );
    }
  }

  private async verifierEtablissements(tx: Transaction, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const trouves = await tx
      .select({ id: etablissement.id })
      .from(etablissement)
      .where(and(inArray(etablissement.id, [...ids]), isNull(etablissement.deletedAt)));
    if (trouves.length !== new Set(ids).size) {
      throw invalide(
        'etablissementIds',
        'Un des établissements choisis n’existe pas dans l’école.',
      );
    }
  }

  private async ecrireEtablissements(
    tx: Transaction,
    access: Access,
    formationId: string,
    ids: readonly string[],
  ): Promise<void> {
    await tx
      .delete(formationEtablissement)
      .where(eq(formationEtablissement.formationId, formationId));
    const uniques = [...new Set(ids)];
    if (uniques.length === 0) return;
    await tx.insert(formationEtablissement).values(
      uniques.map((etablissementId) => ({
        organisationId: access.organisationId,
        formationId,
        etablissementId,
        createdBy: access.userId,
      })),
    );
  }

  private trace = ({ versions: _v, modifiable: _m, publiable: _p, ...reste }: Formation) => reste;
}

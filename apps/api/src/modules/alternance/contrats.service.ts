import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DOCUMENT_CONTRAT_TAILLE_MAX,
  type AvertissementContrat,
  type ChangementTuteur,
  type Contrat,
  type ConventionStage,
  type LienDocument,
  type ListeContrats,
  type ModificationContrat,
  type ModificationConvention,
  type NouveauContrat,
  type NouvelleConvention,
  type Permission,
  type RechercheContrats,
  type RuptureContrat,
} from '@scolaly/contracts';
import {
  contratAlternance,
  contratTuteur,
  conventionStage,
  enregistrerAudit,
  entreprise,
  formation,
  inscription,
  inscriptionStatut,
  personne,
  promotion,
  type Transaction,
} from '@scolaly/db';
import {
  bloquant,
  changerPeriode,
  contratActif,
  controlerStage,
  depasseCapaciteMaitre,
  MODE_DU_STATUT,
  statutDuContrat,
  transitionConventionPermise,
  transitionPermise,
  valeurA,
  verifierContrat,
  verifierRupture,
  type StatutApprenant,
} from '@scolaly/domain';
import {
  gratificationMinimale,
  opcos,
  reglesApprentissage,
  reglesStage,
  valueAt,
} from '@scolaly/referentials';
import { and, asc, desc, eq, inArray, isNull, ne, or, gt, type SQL } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { aujourdhui } from '../../shared/dates.js';
import { ObjectStorage } from '../../shared/storage/object-storage.js';
import { UploadRejectedError, type UploadService } from '../../shared/storage/uploads.js';
import { OBJECT_STORAGE, UPLOADS } from '../../shared/tokens.js';
import { couvrePromotion, promotionsCouvertes } from '../scolarite/index.js';
import { EntreprisesService } from './entreprises.service.js';

type LignePersonne = typeof personne.$inferSelect;

const LECTURE: readonly Permission[] = ['contrats:lire', 'contrats:gerer'];

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

const REFUS_CONTRAT = {
  dates: ['fin', 'La fin du contrat ne peut pas précéder son début.'],
  tuteurs: ['tuteurIds', 'Un contrat a un ou deux tuteurs à la fois.'],
  chevauchement: [
    'debut',
    'L’apprenant a déjà un contrat signé ou en cours sur cette période (RG-03-09) : rompez-le ou terminez-le d’abord.',
  ],
  transition: ['statut', 'Ce changement de statut n’est pas possible.'],
} as const;

const resume = (p: LignePersonne) => ({
  id: p.id,
  nom: p.nomUsage ?? p.nom,
  prenom: p.prenom,
  email: p.email,
  compteEtat: p.compteEtat,
});

/** Contrats d'alternance et conventions de stage (E-03-03, E-03-04 ; US-03-02, US-03-12, US-03-15). */
@Injectable()
export class ContratsService {
  constructor(
    private readonly entreprises: EntreprisesService,
    @Inject(UPLOADS) private readonly uploads: UploadService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  // ——— Lecture ———

  async lister(
    tx: Transaction,
    access: Access,
    recherche: RechercheContrats,
  ): Promise<ListeContrats> {
    const couvertes = await promotionsCouvertes(tx, access, LECTURE);
    const gestion = await this.gestion(tx, access);
    if (couvertes?.size === 0) return { contrats: [], conventions: [], creation: false };
    const filtres = (table: typeof contratAlternance | typeof conventionStage) => {
      const conditions: (SQL | undefined)[] = [isNull(table.deletedAt)];
      if (couvertes) conditions.push(inArray(inscription.promotionId, [...couvertes]));
      if (recherche.personneId) conditions.push(eq(table.personneId, recherche.personneId));
      if (recherche.entrepriseId) conditions.push(eq(table.entrepriseId, recherche.entrepriseId));
      if (recherche.promotionId)
        conditions.push(eq(inscription.promotionId, recherche.promotionId));
      return and(...conditions);
    };
    const contrats = await this.contrats(tx, gestion, filtres(contratAlternance));
    const conventions = await this.conventions(tx, gestion, filtres(conventionStage));
    return {
      contrats: contrats.map(({ tuteurs: _tuteurs, ...c }) => c),
      conventions,
      creation: access.permissions.has('contrats:gerer') && gestion?.size !== 0,
    };
  }

  async lire(tx: Transaction, access: Access, id: string): Promise<Contrat> {
    const { contrat } = await this.charger(tx, access, id);
    return contrat;
  }

  async lireConvention(tx: Transaction, access: Access, id: string): Promise<ConventionStage> {
    const { convention } = await this.chargerConvention(tx, access, id);
    return convention;
  }

  // ——— Contrats (RG-03-05 à RG-03-09) ———

  /** US-03-02 : contrat d'un alternant, avec un ou deux tuteurs de l'entreprise. */
  async creer(
    tx: Transaction,
    access: Access,
    entree: NouveauContrat,
    adresseIp: string,
  ): Promise<Contrat> {
    const cible = await this.inscriptionGeree(tx, access, entree.inscriptionId);
    const lEntreprise = await this.entreprises.charger(tx, entree.entrepriseId);
    const statut = statutDuContrat(entree.type);
    if (statut && !(cible.modes as readonly string[]).includes(MODE_DU_STATUT[statut])) {
      throw invalide(
        'type',
        'La formation n’est pas ouverte à ce type de contrat : modifiez ses modes (module 02) ou choisissez un autre type.',
      );
    }
    const tuteurIds = [...new Set(entree.tuteurIds)];
    await this.exigerTuteurs(tx, entree.entrepriseId, tuteurIds);
    if (entree.referentId) await this.exigerPersonne(tx, entree.referentId, 'referentId');
    this.refuser(
      verifierContrat({
        debut: entree.debut,
        fin: entree.fin,
        tuteurs: tuteurIds.length,
        statut: 'brouillon',
        autres: [],
      }),
    );
    const opco =
      entree.opco === undefined ? lEntreprise.opco : entree.opco && this.opco(entree.opco);
    const [ligne] = await tx
      .insert(contratAlternance)
      .values({
        organisationId: access.organisationId,
        inscriptionId: cible.inscription.id,
        personneId: cible.inscription.personneId,
        entrepriseId: lEntreprise.id,
        type: entree.type,
        debut: entree.debut,
        fin: entree.fin,
        opco,
        numeroDepot: entree.numeroDepot,
        referentId: entree.referentId,
        formationProlongee: entree.formationProlongee,
        createdBy: access.userId,
      })
      .returning();
    if (!ligne) throw new Error('Création du contrat impossible.');
    await tx.insert(contratTuteur).values(
      tuteurIds.map((personneId) => ({
        organisationId: access.organisationId,
        contratId: ligne.id,
        personneId,
        debut: entree.debut,
        createdBy: access.userId,
      })),
    );
    await this.auditer(tx, access, 'contrat.creer', ligne.id, adresseIp, null, ligne);
    return this.lire(tx, access, ligne.id);
  }

  /**
   * Modification et statut (RG-03-05). Un contrat signé ou en cours d'apprentissage ou de
   * professionnalisation passe l'inscription au statut correspondant à sa date de début (RG-03-06).
   */
  async modifier(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationContrat,
    adresseIp: string,
  ): Promise<Contrat> {
    const { ligne: avant } = await this.contratGere(tx, access, id);
    if (avant.statut === 'termine' || avant.statut === 'rompu') {
      throw new ConflictException('Un contrat terminé ou rompu n’est plus modifiable.');
    }
    const statut = changement.statut ?? avant.statut;
    if (!transitionPermise(avant.statut, statut)) this.refuser({ ok: false, refus: 'transition' });
    const debut = changement.debut ?? avant.debut;
    const fin = changement.fin ?? avant.fin;
    const tuteurs = await this.periodesTuteurs(tx, [id]);
    this.refuser(
      verifierContrat({
        debut,
        fin,
        tuteurs: tuteurs.filter((t) => t.debut <= debut && (t.fin === null || t.fin > debut))
          .length,
        statut,
        autres: await this.autresContrats(tx, avant.personneId, id),
      }),
    );
    if (changement.referentId) await this.exigerPersonne(tx, changement.referentId, 'referentId');
    const { opco, ...colonnes } = changement;
    const [apres] = await tx
      .update(contratAlternance)
      .set({
        ...colonnes,
        ...(opco !== undefined ? { opco: opco && this.opco(opco) } : {}),
        updatedBy: access.userId,
      })
      .where(eq(contratAlternance.id, id))
      .returning();
    if (!apres) throw new NotFoundException('Contrat introuvable.');
    if (debut !== avant.debut) {
      // Les tuteurs d'origine suivent la nouvelle date de début.
      await tx
        .update(contratTuteur)
        .set({ debut, updatedBy: access.userId })
        .where(and(eq(contratTuteur.contratId, id), eq(contratTuteur.debut, avant.debut)));
    }
    const statutApprenant = statutDuContrat(apres.type);
    if (statutApprenant && contratActif(apres.statut)) {
      await this.appliquerStatut(tx, access, apres.inscriptionId, statutApprenant, apres.debut);
    }
    await this.auditer(tx, access, 'contrat.modifier', id, adresseIp, avant, apres);
    return this.lire(tx, access, id);
  }

  /** Brouillon supprimé (saisie erronée) ; un contrat signé se rompt ou se termine. */
  async supprimer(tx: Transaction, access: Access, id: string, adresseIp: string): Promise<void> {
    const { ligne } = await this.contratGere(tx, access, id);
    if (ligne.statut !== 'brouillon') {
      throw new ConflictException(
        'Seul un contrat en brouillon se supprime : enregistrez sa rupture ou sa fin.',
      );
    }
    await tx
      .update(contratAlternance)
      .set({ deletedAt: new Date(), updatedBy: access.userId })
      .where(eq(contratAlternance.id, id));
    await this.auditer(tx, access, 'contrat.supprimer', id, adresseIp, ligne, null);
  }

  /** Section 7 : nouveau tuteur à une date d'effet ; l'ancien perd l'accès ce jour-là. */
  async changerTuteur(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ChangementTuteur,
    adresseIp: string,
  ): Promise<Contrat> {
    const { ligne } = await this.contratGere(tx, access, id);
    if (ligne.statut === 'termine' || ligne.statut === 'rompu') {
      throw new ConflictException('Un contrat terminé ou rompu n’est plus modifiable.');
    }
    if (changement.date < ligne.debut || changement.date > ligne.fin) {
      throw invalide('date', 'La date d’effet se situe entre le début et la fin du contrat.');
    }
    await this.exigerTuteurs(tx, ligne.entrepriseId, [changement.personneId]);
    const avant = await this.periodesTuteurs(tx, [id]);
    const actifs = avant.filter(
      (t) => t.debut <= changement.date && (t.fin === null || t.fin > changement.date),
    );
    if (actifs.some((t) => t.personneId === changement.personneId)) {
      throw new ConflictException('Cette personne est déjà tutrice du contrat à cette date.');
    }
    if (changement.remplace) {
      const remplace = actifs.find((t) => t.personneId === changement.remplace);
      if (!remplace) throw invalide('remplace', 'Ce tuteur n’encadre pas le contrat à cette date.');
      if (remplace.debut === changement.date) {
        await tx.delete(contratTuteur).where(eq(contratTuteur.id, remplace.id));
      } else {
        await tx
          .update(contratTuteur)
          .set({ fin: changement.date, updatedBy: access.userId })
          .where(eq(contratTuteur.id, remplace.id));
      }
    } else if (actifs.length >= 2) {
      this.refuser({ ok: false, refus: 'tuteurs' });
    }
    await tx.insert(contratTuteur).values({
      organisationId: access.organisationId,
      contratId: id,
      personneId: changement.personneId,
      debut: changement.date,
      createdBy: access.userId,
    });
    await this.auditer(
      tx,
      access,
      'contrat.tuteur',
      id,
      adresseIp,
      { tuteurs: avant.map((t) => [t.personneId, t.debut, t.fin]) },
      changement,
    );
    return this.lire(tx, access, id);
  }

  /**
   * US-03-12 et RG-03-07 : rupture datée et motivée. Le tuteur perd l'accès le jour de la
   * rupture ; l'inscription repasse en initial, à l'issue de la période sans employeur s'il y en a.
   */
  async rompre(
    tx: Transaction,
    access: Access,
    id: string,
    rupture: RuptureContrat,
    adresseIp: string,
  ): Promise<Contrat> {
    const { ligne: avant } = await this.contratGere(tx, access, id);
    if (!transitionPermise(avant.statut, 'rompu') || avant.statut === 'rompu') {
      throw new ConflictException(
        'Seul un contrat signé ou en cours peut être rompu ; un brouillon se supprime.',
      );
    }
    const verdict = verifierRupture({
      debut: avant.debut,
      fin: avant.fin,
      date: rupture.date,
      type: avant.type,
      poursuiteSansEmployeur: rupture.poursuiteSansEmployeur,
      moisSansEmployeur: valueAt(reglesApprentissage, rupture.date).valeur.sansEmployeurMois,
    });
    if (!verdict.ok) {
      throw verdict.refus === 'date-rupture'
        ? invalide('date', 'La rupture se date entre le début et la fin du contrat.')
        : invalide(
            'poursuiteSansEmployeur',
            'Seul un apprenti peut poursuivre sa formation sans employeur.',
          );
    }
    const [apres] = await tx
      .update(contratAlternance)
      .set({
        statut: 'rompu',
        dateRupture: rupture.date,
        motifRupture: rupture.motif,
        sansEmployeurJusquau: verdict.finSansEmployeur,
        updatedBy: access.userId,
      })
      .where(eq(contratAlternance.id, id))
      .returning();
    if (!apres) throw new NotFoundException('Contrat introuvable.');
    for (const t of await this.periodesTuteurs(tx, [id])) {
      if (t.debut >= rupture.date) {
        await tx.delete(contratTuteur).where(eq(contratTuteur.id, t.id));
      } else if (t.fin === null || t.fin > rupture.date) {
        await tx
          .update(contratTuteur)
          .set({ fin: rupture.date, updatedBy: access.userId })
          .where(eq(contratTuteur.id, t.id));
      }
    }
    if (statutDuContrat(apres.type)) {
      await this.appliquerStatut(
        tx,
        access,
        apres.inscriptionId,
        'initial',
        verdict.finSansEmployeur ?? rupture.date,
      );
    }
    await this.auditer(tx, access, 'contrat.rompre', id, adresseIp, avant, apres);
    return this.lire(tx, access, id);
  }

  // ——— Conventions de stage (RG-03-22 à RG-03-24) ———

  async creerConvention(
    tx: Transaction,
    access: Access,
    entree: NouvelleConvention,
    adresseIp: string,
  ): Promise<ConventionStage> {
    const cible = await this.inscriptionGeree(tx, access, entree.inscriptionId);
    await this.entreprises.charger(tx, entree.entrepriseId);
    const statut = valeurA(cible.statuts, entree.debut);
    if (statut === 'apprenti' || statut === 'professionnalisation') {
      throw invalide(
        'inscriptionId',
        'Cet apprenant est alternant à cette date : son contrat tient lieu de convention (RG-03-24).',
      );
    }
    const valeurs = {
      entrepriseId: entree.entrepriseId,
      tuteurId: entree.tuteurId,
      referentId: entree.referentId,
      debut: entree.debut,
      fin: entree.fin,
      heuresPresence: entree.heuresPresence,
      missions: entree.missions,
      gratificationHoraire: entree.gratificationHoraire,
      derogationMotif: entree.derogationMotif,
      statut: 'brouillon' as const,
    };
    await this.verifierConvention(tx, cible.inscription.personneId, cible.annee, valeurs, null);
    const [ligne] = await tx
      .insert(conventionStage)
      .values({
        organisationId: access.organisationId,
        inscriptionId: cible.inscription.id,
        personneId: cible.inscription.personneId,
        ...valeurs,
        createdBy: access.userId,
      })
      .returning();
    if (!ligne) throw new Error('Création de la convention impossible.');
    await this.auditer(tx, access, 'convention.creer', ligne.id, adresseIp, null, ligne);
    return this.lireConvention(tx, access, ligne.id);
  }

  async modifierConvention(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationConvention,
    adresseIp: string,
  ): Promise<ConventionStage> {
    const { ligne: avant, annee } = await this.conventionGeree(tx, access, id);
    if (avant.statut === 'terminee' || avant.statut === 'annulee') {
      throw new ConflictException('Une convention terminée ou annulée n’est plus modifiable.');
    }
    if (changement.statut && !transitionConventionPermise(avant.statut, changement.statut)) {
      throw invalide('statut', 'Ce changement de statut n’est pas possible.');
    }
    const valeurs = {
      ...avant,
      ...Object.fromEntries(Object.entries(changement).filter(([, v]) => v !== undefined)),
    };
    await this.verifierConvention(tx, avant.personneId, annee, valeurs, id);
    const [apres] = await tx
      .update(conventionStage)
      .set({ ...changement, updatedBy: access.userId })
      .where(eq(conventionStage.id, id))
      .returning();
    await this.auditer(tx, access, 'convention.modifier', id, adresseIp, avant, apres);
    return this.lireConvention(tx, access, id);
  }

  // ——— Documents signés (PDF) ———

  async deposerDocument(
    tx: Transaction,
    access: Access,
    objet: 'contrat' | 'convention',
    id: string,
    contenu: Buffer | undefined,
    adresseIp: string,
  ): Promise<void> {
    const avant =
      objet === 'contrat'
        ? (await this.contratGere(tx, access, id)).ligne
        : (await this.conventionGeree(tx, access, id)).ligne;
    if (!Buffer.isBuffer(contenu)) throw invalide('document', 'Déposez le document signé en PDF.');
    let fichier;
    try {
      fichier = await this.uploads.store(access.organisationId, 'contrats', contenu, {
        maxBytes: DOCUMENT_CONTRAT_TAILLE_MAX,
        types: ['pdf'],
      });
    } catch (erreur) {
      if (erreur instanceof UploadRejectedError) throw invalide('document', erreur.message);
      throw erreur;
    }
    const table = objet === 'contrat' ? contratAlternance : conventionStage;
    await tx
      .update(table)
      .set({ documentCle: fichier.key, updatedBy: access.userId })
      .where(eq(table.id, id));
    await this.auditer(
      tx,
      access,
      `${objet}.document`,
      id,
      adresseIp,
      { document: avant.documentCle !== null },
      { sha256: fichier.sha256, taille: fichier.size },
    );
  }

  /** Lien de téléchargement signé, valable quelques minutes. */
  async lienDocument(
    tx: Transaction,
    access: Access,
    objet: 'contrat' | 'convention',
    id: string,
  ): Promise<LienDocument> {
    const { ligne, apprenant } =
      objet === 'contrat'
        ? await this.charger(tx, access, id)
        : await this.chargerConvention(tx, access, id);
    if (!ligne.documentCle) throw new NotFoundException('Aucun document signé n’a été déposé.');
    const nom = `${objet === 'contrat' ? 'contrat' : 'convention-de-stage'} ${apprenant.prenom} ${apprenant.nom}.pdf`;
    return { url: await this.storage.signedDownloadUrl(ligne.documentCle, { filename: nom }) };
  }

  // ——— Outils ———

  private async gestion(tx: Transaction, access: Access) {
    return access.permissions.has('contrats:gerer')
      ? promotionsCouvertes(tx, access, ['contrats:gerer'])
      : new Set<string>();
  }

  /** Inscription d'une promotion gérée, encore en cours, avec ses statuts et sa formation. */
  private async inscriptionGeree(tx: Transaction, access: Access, id: string) {
    const [ligne] = await tx
      .select({ inscription, modes: formation.modes, annee: promotion.anneeScolaireId })
      .from(inscription)
      .innerJoin(promotion, eq(promotion.id, inscription.promotionId))
      .innerJoin(formation, eq(formation.id, promotion.formationId))
      .where(and(eq(inscription.id, id), isNull(inscription.deletedAt)));
    const lecture = await promotionsCouvertes(tx, access, LECTURE);
    if (!ligne || !couvrePromotion(lecture, ligne.inscription.promotionId)) {
      throw invalide('inscriptionId', 'Cette inscription n’existe pas dans votre périmètre.');
    }
    if (!couvrePromotion(await this.gestion(tx, access), ligne.inscription.promotionId)) {
      throw new ForbiddenException('Vous ne gérez pas les contrats de cette promotion.');
    }
    if (ligne.inscription.etat !== 'inscrit' && ligne.inscription.etat !== 'preinscrit') {
      throw invalide('inscriptionId', 'Cette inscription est close : rouvrez-la d’abord.');
    }
    const statuts = await tx
      .select()
      .from(inscriptionStatut)
      .where(and(eq(inscriptionStatut.inscriptionId, id), isNull(inscriptionStatut.deletedAt)));
    return {
      ...ligne,
      statuts: statuts.map((s) => ({ debut: s.debut, fin: s.fin, valeur: s.statut })),
    };
  }

  private async charger(tx: Transaction, access: Access, id: string) {
    const [contrat] = await this.contrats(
      tx,
      await this.gestion(tx, access),
      and(eq(contratAlternance.id, id), isNull(contratAlternance.deletedAt)),
    );
    const lecture = await promotionsCouvertes(tx, access, LECTURE);
    if (!contrat || !couvrePromotion(lecture, contrat.apprenant.promotion.id)) {
      throw new NotFoundException('Contrat introuvable.');
    }
    const [ligne] = await tx.select().from(contratAlternance).where(eq(contratAlternance.id, id));
    if (!ligne) throw new NotFoundException('Contrat introuvable.');
    return { contrat, ligne, apprenant: contrat.apprenant };
  }

  private async contratGere(tx: Transaction, access: Access, id: string) {
    const charge = await this.charger(tx, access, id);
    if (!charge.contrat.modifiable) {
      throw new ForbiddenException('Vous ne gérez pas les contrats de cette promotion.');
    }
    return charge;
  }

  private async chargerConvention(tx: Transaction, access: Access, id: string) {
    const [convention] = await this.conventions(
      tx,
      await this.gestion(tx, access),
      and(eq(conventionStage.id, id), isNull(conventionStage.deletedAt)),
    );
    const lecture = await promotionsCouvertes(tx, access, LECTURE);
    if (!convention || !couvrePromotion(lecture, convention.apprenant.promotion.id)) {
      throw new NotFoundException('Convention introuvable.');
    }
    const [ligne] = await tx
      .select({ convention: conventionStage, annee: promotion.anneeScolaireId })
      .from(conventionStage)
      .innerJoin(inscription, eq(inscription.id, conventionStage.inscriptionId))
      .innerJoin(promotion, eq(promotion.id, inscription.promotionId))
      .where(eq(conventionStage.id, id));
    if (!ligne) throw new NotFoundException('Convention introuvable.');
    return {
      convention,
      ligne: ligne.convention,
      annee: ligne.annee,
      apprenant: convention.apprenant,
    };
  }

  private async conventionGeree(tx: Transaction, access: Access, id: string) {
    const charge = await this.chargerConvention(tx, access, id);
    if (!charge.convention.modifiable) {
      throw new ForbiddenException('Vous ne gérez pas les conventions de cette promotion.');
    }
    return charge;
  }

  /** Contrats lus avec l'apprenant, l'entreprise, les tuteurs et les avertissements. */
  private async contrats(
    tx: Transaction,
    gestion: Set<string> | null,
    condition: SQL | undefined,
  ): Promise<Contrat[]> {
    const lignes = await tx
      .select({
        contrat: contratAlternance,
        inscription,
        promotion,
        entreprise,
        apprenant: personne,
      })
      .from(contratAlternance)
      .innerJoin(inscription, eq(inscription.id, contratAlternance.inscriptionId))
      .innerJoin(promotion, eq(promotion.id, inscription.promotionId))
      .innerJoin(entreprise, eq(entreprise.id, contratAlternance.entrepriseId))
      .innerJoin(personne, eq(personne.id, contratAlternance.personneId))
      .where(condition)
      .orderBy(desc(contratAlternance.debut), asc(personne.nom))
      .limit(1000);
    if (lignes.length === 0) return [];
    const tuteurs = await this.periodesTuteurs(
      tx,
      lignes.map((l) => l.contrat.id),
    );
    const personnes = await this.personnes(tx, [
      ...tuteurs.map((t) => t.personneId),
      ...lignes.flatMap((l) => (l.contrat.referentId ? [l.contrat.referentId] : [])),
    ]);
    const charges = await this.chargesMaitres(
      tx,
      tuteurs.map((t) => t.personneId),
    );
    const jour = aujourdhui();
    return lignes.map((l) => {
      const c = l.contrat;
      const lesTuteurs = tuteurs.filter((t) => t.contratId === c.id);
      const avertissements: AvertissementContrat[] = [];
      if (l.entreprise.statut === 'fermee') {
        avertissements.push({ type: 'entreprise-fermee', tuteurId: null });
      }
      if (l.entreprise.aVerifier) {
        avertissements.push({ type: 'entreprise-a-verifier', tuteurId: null });
      }
      if (c.type === 'apprentissage' && c.statut !== 'termine' && c.statut !== 'rompu') {
        for (const t of lesTuteurs) {
          if (t.fin !== null && t.fin <= jour) continue;
          // RG-03-04 : ce contrat compte avec ceux que le maître encadre déjà.
          const autres = (charges.get(t.personneId) ?? []).filter((a) => a.contratId !== c.id);
          const apprentis = [
            ...autres.map((a) => ({ prolonge: a.prolonge })),
            { prolonge: c.formationProlongee },
          ];
          const regles = valueAt(reglesApprentissage, jour).valeur;
          if (depasseCapaciteMaitre(apprentis, regles)) {
            avertissements.push({ type: 'capacite-maitre', tuteurId: t.personneId });
          }
        }
      }
      const referent = c.referentId ? personnes.get(c.referentId) : undefined;
      return {
        id: c.id,
        apprenant: this.apprenant(l),
        entreprise: {
          id: l.entreprise.id,
          raisonSociale: l.entreprise.raisonSociale,
          siret: l.entreprise.siret,
          statut: l.entreprise.statut,
        },
        type: c.type,
        debut: c.debut,
        fin: c.fin,
        opco: c.opco,
        numeroDepot: c.numeroDepot,
        statut: c.statut,
        referent: referent ? resume(referent) : null,
        formationProlongee: c.formationProlongee,
        rupture:
          c.dateRupture && c.motifRupture
            ? {
                date: c.dateRupture,
                motif: c.motifRupture,
                sansEmployeurJusquau: c.sansEmployeurJusquau,
              }
            : null,
        document: c.documentCle !== null,
        tuteurs: lesTuteurs.flatMap((t) => {
          const p = personnes.get(t.personneId);
          return p ? [{ id: t.id, personne: resume(p), debut: t.debut, fin: t.fin }] : [];
        }),
        avertissements,
        modifiable: couvrePromotion(gestion, l.inscription.promotionId),
      };
    });
  }

  private async conventions(
    tx: Transaction,
    gestion: Set<string> | null,
    condition: SQL | undefined,
  ): Promise<ConventionStage[]> {
    const lignes = await tx
      .select({
        convention: conventionStage,
        inscription,
        promotion,
        entreprise,
        apprenant: personne,
      })
      .from(conventionStage)
      .innerJoin(inscription, eq(inscription.id, conventionStage.inscriptionId))
      .innerJoin(promotion, eq(promotion.id, inscription.promotionId))
      .innerJoin(entreprise, eq(entreprise.id, conventionStage.entrepriseId))
      .innerJoin(personne, eq(personne.id, conventionStage.personneId))
      .where(condition)
      .orderBy(desc(conventionStage.debut), asc(personne.nom))
      .limit(1000);
    if (lignes.length === 0) return [];
    const personnes = await this.personnes(
      tx,
      lignes.flatMap((l) => [
        l.convention.referentId,
        ...(l.convention.tuteurId ? [l.convention.tuteurId] : []),
      ]),
    );
    const resultat: ConventionStage[] = [];
    for (const l of lignes) {
      const c = l.convention;
      const referent = personnes.get(c.referentId);
      const tuteur = c.tuteurId ? personnes.get(c.tuteurId) : undefined;
      if (!referent) continue;
      resultat.push({
        id: c.id,
        apprenant: this.apprenant(l),
        entreprise: {
          id: l.entreprise.id,
          raisonSociale: l.entreprise.raisonSociale,
          siret: l.entreprise.siret,
          statut: l.entreprise.statut,
        },
        tuteur: tuteur ? resume(tuteur) : null,
        referent: resume(referent),
        debut: c.debut,
        fin: c.fin,
        heuresPresence: c.heuresPresence,
        missions: c.missions,
        gratificationHoraire: c.gratificationHoraire,
        statut: c.statut,
        derogationMotif: c.derogationMotif,
        document: c.documentCle !== null,
        controles: await this.controles(tx, c.personneId, l.promotion.anneeScolaireId, c, c.id),
        modifiable: couvrePromotion(gestion, l.inscription.promotionId),
      });
    }
    return resultat;
  }

  private apprenant(l: {
    inscription: typeof inscription.$inferSelect;
    promotion: typeof promotion.$inferSelect;
    apprenant: LignePersonne;
  }) {
    return {
      personneId: l.apprenant.id,
      nom: l.apprenant.nomUsage ?? l.apprenant.nom,
      prenom: l.apprenant.prenom,
      inscriptionId: l.inscription.id,
      promotion: { id: l.promotion.id, libelle: l.promotion.libelle },
    };
  }

  /**
   * RG-03-23 : contrôles d'une convention avec les autres stages de l'étudiant sur la même année
   * d'enseignement (seuils des tables datées, à la date de début du stage).
   */
  private async controles(
    tx: Transaction,
    personneId: string,
    annee: string,
    c: {
      entrepriseId: string;
      debut: string;
      heuresPresence: number;
      gratificationHoraire: number | null;
    },
    exclue: string | null,
  ) {
    const autres = await tx
      .select({
        entrepriseId: conventionStage.entrepriseId,
        heures: conventionStage.heuresPresence,
      })
      .from(conventionStage)
      .innerJoin(inscription, eq(inscription.id, conventionStage.inscriptionId))
      .innerJoin(promotion, eq(promotion.id, inscription.promotionId))
      .where(
        and(
          eq(conventionStage.personneId, personneId),
          eq(promotion.anneeScolaireId, annee),
          ne(conventionStage.statut, 'annulee'),
          isNull(conventionStage.deletedAt),
          exclue ? ne(conventionStage.id, exclue) : undefined,
        ),
      );
    const somme = (lignes: typeof autres) => lignes.reduce((s, a) => s + a.heures, 0);
    return controlerStage({
      heuresPresence: c.heuresPresence,
      gratificationHoraire: c.gratificationHoraire,
      heuresAutresStagesAnnee: somme(autres),
      heuresAutresStagesOrganisme: somme(autres.filter((a) => a.entrepriseId === c.entrepriseId)),
      regles: valueAt(reglesStage, c.debut).valeur,
      gratificationMinimale: valueAt(gratificationMinimale, c.debut).valeur,
    });
  }

  /** RG-03-22 et RG-03-23 : dates, tuteur, référent ; gratification manquante bloquante. */
  private async verifierConvention(
    tx: Transaction,
    personneId: string,
    annee: string,
    c: {
      entrepriseId: string;
      tuteurId: string | null;
      referentId: string;
      debut: string;
      fin: string;
      heuresPresence: number;
      gratificationHoraire: number | null;
      derogationMotif: string | null;
      statut: string;
    },
    exclue: string | null,
  ) {
    if (c.fin < c.debut) throw invalide('fin', 'La fin du stage ne peut pas précéder son début.');
    if (c.tuteurId) await this.exigerTuteurs(tx, c.entrepriseId, [c.tuteurId]);
    await this.exigerPersonne(tx, c.referentId, 'referentId');
    if (c.statut === 'annulee') return;
    const controles = await this.controles(tx, personneId, annee, c, exclue);
    const bloque = controles.find(bloquant);
    if (bloque?.type === 'gratification-obligatoire' && !c.derogationMotif) {
      throw invalide(
        'gratificationHoraire',
        `Au-delà de ${String(bloque.seuil)} heures de stage sur l’année (ici ${String(bloque.heures)} h), une gratification est obligatoire : saisissez son montant horaire, ou le motif d’une dérogation.`,
      );
    }
  }

  /** Périodes des tuteurs des contrats donnés. */
  private periodesTuteurs(tx: Transaction, contratIds: string[]) {
    return tx
      .select()
      .from(contratTuteur)
      .where(and(inArray(contratTuteur.contratId, contratIds), isNull(contratTuteur.deletedAt)))
      .orderBy(asc(contratTuteur.debut));
  }

  /** RG-03-04 : contrats d'apprentissage en vigueur encadrés aujourd'hui par chaque maître. */
  private async chargesMaitres(tx: Transaction, tuteurIds: string[]) {
    const charges = new Map<string, { contratId: string; prolonge: boolean }[]>();
    if (tuteurIds.length === 0) return charges;
    const lignes = await tx
      .select({
        personneId: contratTuteur.personneId,
        contratId: contratAlternance.id,
        prolonge: contratAlternance.formationProlongee,
      })
      .from(contratTuteur)
      .innerJoin(contratAlternance, eq(contratAlternance.id, contratTuteur.contratId))
      .where(
        and(
          inArray(contratTuteur.personneId, [...new Set(tuteurIds)]),
          isNull(contratTuteur.deletedAt),
          or(isNull(contratTuteur.fin), gt(contratTuteur.fin, aujourdhui())),
          isNull(contratAlternance.deletedAt),
          eq(contratAlternance.type, 'apprentissage'),
          inArray(contratAlternance.statut, ['signe', 'en_cours']),
        ),
      );
    for (const l of lignes) {
      charges.set(l.personneId, [...(charges.get(l.personneId) ?? []), l]);
    }
    return charges;
  }

  private async personnes(tx: Transaction, ids: string[]) {
    const uniques = [...new Set(ids)];
    const lignes =
      uniques.length === 0
        ? []
        : await tx.select().from(personne).where(inArray(personne.id, uniques));
    return new Map(lignes.map((p) => [p.id, p]));
  }

  private async autresContrats(tx: Transaction, personneId: string, exclu: string) {
    return tx
      .select({
        debut: contratAlternance.debut,
        fin: contratAlternance.fin,
        statut: contratAlternance.statut,
      })
      .from(contratAlternance)
      .where(
        and(
          eq(contratAlternance.personneId, personneId),
          ne(contratAlternance.id, exclu),
          isNull(contratAlternance.deletedAt),
        ),
      );
  }

  /** Les tuteurs sont des contacts « tuteur » de l'entreprise (RG-03-03). */
  private async exigerTuteurs(tx: Transaction, entrepriseId: string, ids: string[]) {
    const tuteurs = await this.entreprises.tuteurs(tx, entrepriseId);
    if (ids.some((id) => !tuteurs.includes(id))) {
      throw invalide(
        'tuteurIds',
        'Le tuteur doit être un contact « tuteur » de l’entreprise : ajoutez-le depuis la fiche entreprise.',
      );
    }
  }

  private async exigerPersonne(tx: Transaction, id: string, champ: string) {
    const [fiche] = await tx
      .select({ id: personne.id })
      .from(personne)
      .where(and(eq(personne.id, id), isNull(personne.deletedAt)));
    if (!fiche) throw invalide(champ, 'Cette personne n’existe pas dans l’école.');
  }

  /**
   * RG-03-06 et section 7 : nouvelle période de statut de l'inscription à la date d'effet ; la
   * période précédente reste inchangée. Une date antérieure au statut en cours prend effet au
   * début de celui-ci.
   */
  private async appliquerStatut(
    tx: Transaction,
    access: Access,
    inscriptionId: string,
    statut: StatutApprenant,
    date: string,
  ) {
    const periodes = await tx
      .select()
      .from(inscriptionStatut)
      .where(
        and(
          eq(inscriptionStatut.inscriptionId, inscriptionId),
          isNull(inscriptionStatut.deletedAt),
        ),
      );
    const actuelles = periodes.map((p) => ({ debut: p.debut, fin: p.fin, valeur: p.statut }));
    const ouverte = actuelles.find((p) => p.fin === null);
    if (ouverte?.valeur === statut) return;
    const effet = ouverte && date < ouverte.debut ? ouverte.debut : date;
    const verdict = changerPeriode(actuelles, statut, effet);
    if (!verdict.ok) return;
    await tx.delete(inscriptionStatut).where(eq(inscriptionStatut.inscriptionId, inscriptionId));
    await tx.insert(inscriptionStatut).values(
      verdict.periodes.map((p) => ({
        organisationId: access.organisationId,
        inscriptionId,
        statut: p.valeur,
        debut: p.debut,
        fin: p.fin,
        createdBy: access.userId,
      })),
    );
  }

  private refuser(verdict: { ok: true } | { ok: false; refus: keyof typeof REFUS_CONTRAT }) {
    if (verdict.ok) return;
    const [champ, message] = REFUS_CONTRAT[verdict.refus];
    throw invalide(champ, message);
  }

  private opco(code: string) {
    if (!Object.hasOwn(valueAt(opcos, aujourdhui()).valeur, code)) {
      throw invalide('opco', 'Choisissez un OPCO de la liste.');
    }
    return code;
  }

  private auditer(
    tx: Transaction,
    access: Access,
    action: string,
    objetId: string,
    adresseIp: string,
    avant: unknown,
    apres: unknown,
  ) {
    return enregistrerAudit(tx, {
      action,
      objetType: action.startsWith('convention') ? 'convention_stage' : 'contrat',
      objetId,
      auteurId: access.userId,
      adresseIp,
      ...(avant === null ? {} : { avant }),
      ...(apres === null ? {} : { apres }),
    });
  }
}

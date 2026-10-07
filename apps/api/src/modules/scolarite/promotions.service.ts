import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AjoutMembres,
  ChangementStatut,
  DetailPromotion,
  Groupe,
  Inscription,
  ListePromotions,
  ModificationGroupe,
  ModificationInscription,
  ModificationPromotion,
  NouvelleInscription,
  NouvellePromotion,
  Promotion,
  RecherchePromotions,
  ResultatRepartition,
  RetraitMembre,
  SaisieGroupe,
  SaisieRepartition,
} from '@scolaly/contracts';
import {
  anneeScolaire,
  enregistrerAudit,
  etablissement,
  formation,
  groupeEleves,
  groupeMembre,
  groupePromotion,
  inscription,
  inscriptionStatut,
  maquetteUe,
  maquetteVersion,
  newId,
  personne,
  promotion,
  type Transaction,
} from '@scolaly/db';
import {
  ajouterMois,
  annulerRetourPrevu,
  changerPeriode,
  couvre,
  inscriptionActive,
  ouvrirSansEmployeur,
  repartir,
  valeurA,
  verifierAjoutMembre,
  verifierInscription,
  verifierPromotion,
  verifierSortie,
  versionDeReference,
  type RefusGroupe,
  type RefusInscription,
  type RefusPromotion,
  type StatutApprenant,
} from '@scolaly/domain';
import { reglesApprentissage, valueAt } from '@scolaly/referentials';
import { and, asc, eq, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { aujourdhui } from '../../shared/dates.js';
import {
  couvrePromotion,
  droitsSurPromotion,
  LECTURE_PROMOTIONS,
  promotionsCouvertes,
} from './perimetre.js';

const MESSAGES: Record<RefusPromotion | RefusInscription | RefusGroupe, string> = {
  'dates-promotion': 'La fin de la promotion doit être postérieure à son début.',
  'annee-hors-duree':
    'La formation ne comporte pas cette année : choisissez une année de formation valide.',
  'entree-hors-promotion':
    'La date d’entrée doit se situer entre le début et la fin de la promotion.',
  'sortie-avant-entree': 'La date de sortie doit être postérieure à la date d’entrée.',
  'sortie-sans-date':
    'Indiquez la date de sortie : l’apprenant quitte les listes d’appel ce jour-là.',
  'sortie-sans-motif': 'Indiquez le motif de la sortie : il reste dans le dossier de l’apprenant.',
  'statut-non-autorise':
    'Ce statut ne correspond à aucun mode autorisé de la formation : modifiez la formation ou choisissez un autre statut.',
  'deja-inscrit': 'Cet apprenant est déjà inscrit à cette promotion.',
  'etat-final': 'Cette inscription est close (sortie ou diplôme) : son état ne change plus.',
  'type-deja-pris': 'Cet apprenant est déjà dans un groupe de ce type.',
  'groupe-plein':
    'Le groupe est plein : augmentez sa capacité, ou forcez l’ajout si vous êtes responsable (l’action est tracée).',
  'hors-promotion': 'Ce groupe n’appartient pas à la promotion de l’apprenant.',
};

/**
 * Module 03, section 7 : un apprenti inscrit sans employeur a la durée légale de recherche (table
 * datée) pour signer son contrat ; à l'échéance, il repasse en initial.
 */
const periodesDuStatut = (
  periodes: Parameters<typeof ouvrirSansEmployeur>[0],
  statut: StatutApprenant,
  debut: string,
) =>
  statut === 'apprenti_sans_employeur'
    ? ouvrirSansEmployeur(
        periodes,
        debut,
        ajouterMois(debut, valueAt(reglesApprentissage, debut).valeur.rechercheEmployeurMois),
      )
    : null;

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

const refuser = (
  verdict: { ok: true } | { ok: false; refus: keyof typeof MESSAGES },
  champ: string,
) => {
  if (verdict.ok) return;
  if (
    verdict.refus === 'deja-inscrit' ||
    verdict.refus === 'etat-final' ||
    verdict.refus === 'groupe-plein'
  ) {
    throw new ConflictException(MESSAGES[verdict.refus]);
  }
  throw invalide(champ, MESSAGES[verdict.refus]);
};

type LignePromotion = typeof promotion.$inferSelect;

/** Promotions de l'année, groupes et inscriptions (E-02-04, E-02-05 ; US-02-06, US-02-07). */
@Injectable()
export class PromotionsService {
  async lister(
    tx: Transaction,
    access: Access,
    recherche: RecherchePromotions,
  ): Promise<ListePromotions> {
    const couvertes = await promotionsCouvertes(tx, access, LECTURE_PROMOTIONS);
    const conditions: (SQL | undefined)[] = [isNull(promotion.deletedAt)];
    if (couvertes !== null) {
      if (couvertes.size === 0) return { promotions: [], creation: this.peutCreer(access) };
      conditions.push(inArray(promotion.id, [...couvertes]));
    }
    if (recherche.anneeScolaireId)
      conditions.push(eq(promotion.anneeScolaireId, recherche.anneeScolaireId));
    if (recherche.formationId) conditions.push(eq(promotion.formationId, recherche.formationId));
    if (recherche.etablissementId)
      conditions.push(eq(promotion.etablissementId, recherche.etablissementId));
    const lignes = await tx
      .select()
      .from(promotion)
      .where(and(...conditions))
      .orderBy(asc(promotion.libelle));
    return { promotions: await this.resumer(tx, access, lignes), creation: this.peutCreer(access) };
  }

  async lire(tx: Transaction, access: Access, id: string): Promise<DetailPromotion> {
    const ligne = await this.charger(tx, access, id);
    const [resume] = await this.resumer(tx, access, [ligne]);
    if (!resume) throw new NotFoundException('Promotion introuvable.');
    const liens = await tx
      .select({ groupe: groupeEleves })
      .from(groupePromotion)
      .innerJoin(groupeEleves, eq(groupeEleves.id, groupePromotion.groupeId))
      .where(and(eq(groupePromotion.promotionId, id), isNull(groupeEleves.deletedAt)))
      .orderBy(asc(groupeEleves.type), asc(groupeEleves.libelle));
    const groupes = await this.detaillerGroupes(
      tx,
      liens.map((l) => l.groupe),
    );
    const options = await tx
      .selectDistinct({ option: maquetteUe.option })
      .from(maquetteUe)
      .where(and(eq(maquetteUe.versionId, ligne.versionId), isNotNull(maquetteUe.option)));
    const versions = await tx
      .select({ id: maquetteVersion.id, numero: maquetteVersion.numero })
      .from(maquetteVersion)
      .where(
        and(
          eq(maquetteVersion.formationId, ligne.formationId),
          eq(maquetteVersion.statut, 'publiee'),
        ),
      )
      .orderBy(asc(maquetteVersion.numero));
    return {
      ...resume,
      groupes,
      inscriptions: await this.inscriptionsDe(tx, [id]),
      options: options.flatMap((o) => (o.option ? [o.option] : [])).sort(),
      changementVersion: resume.modifiable && access.permissions.has('promotions:changer-version'),
      versionsDisponibles: versions,
    };
  }

  async creer(tx: Transaction, access: Access, entree: NouvellePromotion, adresseIp: string) {
    this.verifierCreation(access, entree.etablissementId, entree.formationId);
    const [laFormation] = await tx
      .select()
      .from(formation)
      .where(and(eq(formation.id, entree.formationId), isNull(formation.deletedAt)));
    if (!laFormation) throw invalide('formationId', 'Cette formation n’existe pas dans l’école.');
    const [annee] = await tx
      .select()
      .from(anneeScolaire)
      .where(and(eq(anneeScolaire.id, entree.anneeScolaireId), isNull(anneeScolaire.deletedAt)));
    if (!annee)
      throw invalide('anneeScolaireId', 'Cette année scolaire n’existe pas dans l’école.');
    const [campus] = await tx
      .select()
      .from(etablissement)
      .where(and(eq(etablissement.id, entree.etablissementId), isNull(etablissement.deletedAt)));
    if (!campus) throw invalide('etablissementId', 'Cet établissement n’existe pas dans l’école.');
    const versionId = await this.versionPubliee(tx, laFormation.id, entree.versionId);
    const dates = {
      dateDebut: entree.dateDebut ?? annee.dateDebut,
      dateFin: entree.dateFin ?? annee.dateFin,
    };
    refuser(
      verifierPromotion({
        ...dates,
        anneeFormation: entree.anneeFormation,
        dureeFormation: laFormation.dureeAnnees,
      }),
      'anneeFormation',
    );
    const [doublon] = await tx
      .select({ id: promotion.id })
      .from(promotion)
      .where(
        and(
          eq(promotion.formationId, laFormation.id),
          eq(promotion.anneeFormation, entree.anneeFormation),
          eq(promotion.anneeScolaireId, annee.id),
          eq(promotion.etablissementId, campus.id),
          isNull(promotion.deletedAt),
        ),
      );
    if (doublon) {
      throw new ConflictException(
        'Cette promotion existe déjà (même formation, année de formation, année scolaire et établissement).',
      );
    }
    const id = newId();
    await tx.insert(promotion).values({
      id,
      organisationId: access.organisationId,
      formationId: laFormation.id,
      versionId,
      anneeFormation: entree.anneeFormation,
      anneeScolaireId: annee.id,
      etablissementId: campus.id,
      libelle:
        entree.libelle ??
        `${laFormation.intitule} · ${String(entree.anneeFormation)}${entree.anneeFormation === 1 ? 're' : 'e'} année · ${annee.libelle}`,
      ...dates,
      createdBy: access.userId,
    });
    const resultat = await this.lire(tx, access, id);
    await this.auditer(tx, access, 'promotion.creer', id, adresseIp, null, this.trace(resultat));
    return resultat;
  }

  async modifier(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationPromotion,
    adresseIp: string,
  ) {
    const avant = await this.lire(tx, access, id);
    this.exigerGestion(avant);
    const versionId =
      changement.versionId && changement.versionId !== avant.version.id
        ? await this.changementDeVersion(tx, access, avant, changement)
        : undefined;
    const dates = {
      dateDebut: changement.dateDebut ?? avant.dateDebut,
      dateFin: changement.dateFin ?? avant.dateFin,
    };
    refuser(
      verifierPromotion({
        ...dates,
        anneeFormation: avant.anneeFormation,
        dureeFormation: avant.formation.dureeAnnees,
      }),
      'dateFin',
    );
    await tx
      .update(promotion)
      .set({
        ...dates,
        ...(changement.libelle ? { libelle: changement.libelle } : {}),
        ...(versionId ? { versionId } : {}),
        updatedBy: access.userId,
      })
      .where(eq(promotion.id, id));
    const apres = await this.lire(tx, access, id);
    await this.auditer(
      tx,
      access,
      versionId ? 'promotion.changer-version' : 'promotion.modifier',
      id,
      adresseIp,
      this.trace(avant),
      this.trace(apres),
    );
    return apres;
  }

  // ——— Inscriptions (RG-02-13, RG-02-17) ———

  async inscrire(
    tx: Transaction,
    access: Access,
    promotionId: string,
    entree: NouvelleInscription,
    adresseIp: string,
  ) {
    const detail = await this.lire(tx, access, promotionId);
    this.exigerGestion(detail);
    const [fiche] = await tx
      .select({ id: personne.id })
      .from(personne)
      .where(and(eq(personne.id, entree.personneId), isNull(personne.deletedAt)));
    if (!fiche) throw invalide('personneId', 'Cette personne n’existe pas dans l’école.');
    const modes = await this.modesFormation(tx, detail.formation.id);
    const dateEntree = entree.dateEntree ?? detail.dateDebut;
    refuser(
      verifierInscription({
        dateEntree,
        dateSortie: null,
        promotion: detail,
        statut: entree.statut,
        modesFormation: modes,
        dejaInscrit: detail.inscriptions.some((i) => i.personne.id === entree.personneId),
      }),
      'statut',
    );
    this.verifierOption(detail, entree.option);
    const id = newId();
    await tx.insert(inscription).values({
      id,
      organisationId: access.organisationId,
      personneId: entree.personneId,
      promotionId,
      etat: entree.etat,
      dateEntree,
      option: entree.option || null,
      createdBy: access.userId,
    });
    const periodes = periodesDuStatut([], entree.statut, dateEntree) ?? [
      { debut: dateEntree, fin: null, valeur: entree.statut },
    ];
    await tx.insert(inscriptionStatut).values(
      periodes.map((p) => ({
        organisationId: access.organisationId,
        inscriptionId: id,
        statut: p.valeur,
        debut: p.debut,
        fin: p.fin,
        createdBy: access.userId,
      })),
    );
    const [resultat] = await this.inscriptionsDe(tx, [promotionId], id);
    await this.auditer(
      tx,
      access,
      'inscription.creer',
      entree.personneId,
      adresseIp,
      null,
      resultat,
      'personne',
    );
    if (!resultat) throw new Error('Inscription introuvable après création.');
    return resultat;
  }

  async modifierInscription(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationInscription,
    adresseIp: string,
  ) {
    const avant = await this.chargerInscription(tx, access, id);
    const detail = await this.lire(tx, access, avant.promotionId);
    this.exigerGestion(detail);
    const etat = changement.etat ?? avant.etat;
    const dateEntree = changement.dateEntree ?? avant.dateEntree;
    const dateSortie =
      changement.dateSortie === undefined ? avant.dateSortie : changement.dateSortie;
    const motif = changement.motifSortie === undefined ? avant.motifSortie : changement.motifSortie;
    refuser(
      verifierSortie({ etat: avant.etat, nouvelEtat: etat, dateEntree, dateSortie, motif }),
      changement.motifSortie === undefined ? 'dateSortie' : 'motifSortie',
    );
    if (dateEntree < detail.dateDebut || dateEntree > detail.dateFin) {
      throw invalide('dateEntree', MESSAGES['entree-hors-promotion']);
    }
    if (changement.option !== undefined) this.verifierOption(detail, changement.option);
    await tx
      .update(inscription)
      .set({
        etat,
        dateEntree,
        dateSortie,
        motifSortie: motif || null,
        ...(changement.option !== undefined ? { option: changement.option || null } : {}),
        updatedBy: access.userId,
      })
      .where(eq(inscription.id, id));
    // RG-02-17 : à la sortie, les appartenances aux groupes se ferment à la même date.
    if (dateSortie) {
      await tx
        .update(groupeMembre)
        .set({ fin: dateSortie, updatedBy: access.userId })
        .where(and(eq(groupeMembre.inscriptionId, id), isNull(groupeMembre.fin)));
    }
    const [apres] = await this.inscriptionsDe(tx, [avant.promotionId], id);
    await this.auditer(
      tx,
      access,
      'inscription.modifier',
      avant.personneId,
      adresseIp,
      avant,
      apres,
      'personne',
    );
    if (!apres) throw new Error('Inscription introuvable.');
    return apres;
  }

  /** Section 7 : nouvelle période de statut à la date d'effet (début du contrat). */
  async changerStatut(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ChangementStatut,
    adresseIp: string,
  ) {
    const avant = await this.chargerInscription(tx, access, id);
    const detail = await this.lire(tx, access, avant.promotionId);
    this.exigerGestion(detail);
    const modes = await this.modesFormation(tx, detail.formation.id);
    refuser(
      verifierInscription({
        dateEntree: avant.dateEntree,
        dateSortie: null,
        promotion: detail,
        statut: changement.statut,
        modesFormation: modes,
        dejaInscrit: false,
      }),
      'statut',
    );
    const periodes = await tx
      .select()
      .from(inscriptionStatut)
      .where(and(eq(inscriptionStatut.inscriptionId, id), isNull(inscriptionStatut.deletedAt)));
    const enregistrees = periodes.map((p) => ({ debut: p.debut, fin: p.fin, valeur: p.statut }));
    const verdict = changerPeriode(
      annulerRetourPrevu(enregistrees, changement.debut),
      changement.statut,
      changement.debut,
    );
    if (!verdict.ok) {
      throw invalide(
        'debut',
        'Le changement de statut ne peut pas précéder le début du statut en cours.',
      );
    }
    const nouvelles =
      periodesDuStatut(enregistrees, changement.statut, changement.debut) ?? verdict.periodes;
    await tx.delete(inscriptionStatut).where(eq(inscriptionStatut.inscriptionId, id));
    await tx.insert(inscriptionStatut).values(
      nouvelles.map((p) => ({
        organisationId: access.organisationId,
        inscriptionId: id,
        statut: p.valeur,
        debut: p.debut,
        fin: p.fin,
        createdBy: access.userId,
      })),
    );
    const [apres] = await this.inscriptionsDe(tx, [avant.promotionId], id);
    await this.auditer(
      tx,
      access,
      'inscription.statut',
      avant.personneId,
      adresseIp,
      { statuts: periodes.map((p) => [p.statut, p.debut, p.fin]) },
      apres,
      'personne',
    );
    if (!apres) throw new Error('Inscription introuvable.');
    return apres;
  }

  // ——— Groupes (RG-02-14 à RG-02-16) ———

  async creerGroupe(
    tx: Transaction,
    access: Access,
    promotionId: string,
    saisie: SaisieGroupe,
    adresseIp: string,
  ) {
    const detail = await this.lire(tx, access, promotionId);
    this.exigerGestion(detail);
    const autres = [...new Set(saisie.autresPromotionIds.filter((p) => p !== promotionId))];
    const gestion = await promotionsCouvertes(tx, access, ['promotions:gerer']);
    if (autres.some((p) => !couvrePromotion(gestion, p))) {
      throw new ForbiddenException(
        'Une des promotions du groupe transversal est hors de votre périmètre.',
      );
    }
    if (autres.length > 0) {
      const trouvees = await tx
        .select({ id: promotion.id })
        .from(promotion)
        .where(and(inArray(promotion.id, autres), isNull(promotion.deletedAt)));
      if (trouvees.length !== autres.length) {
        throw invalide(
          'autresPromotionIds',
          'Une des promotions choisies n’existe pas dans l’école.',
        );
      }
    }
    const id = newId();
    await tx.insert(groupeEleves).values({
      id,
      organisationId: access.organisationId,
      libelle: saisie.libelle,
      type: saisie.type,
      capacite: saisie.capacite,
      option: saisie.option || null,
      createdBy: access.userId,
    });
    await tx.insert(groupePromotion).values(
      [promotionId, ...autres].map((p) => ({
        organisationId: access.organisationId,
        groupeId: id,
        promotionId: p,
        createdBy: access.userId,
      })),
    );
    const [groupe] = await this.detaillerGroupes(tx, [{ id }]);
    await this.auditer(tx, access, 'groupe.creer', id, adresseIp, null, groupe, 'groupe');
    if (!groupe) throw new Error('Groupe introuvable après création.');
    return groupe;
  }

  async modifierGroupe(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationGroupe,
    adresseIp: string,
  ) {
    const { groupe } = await this.chargerGroupe(tx, access, id);
    await tx
      .update(groupeEleves)
      .set({
        ...changement,
        ...(changement.option !== undefined ? { option: changement.option || null } : {}),
        updatedBy: access.userId,
      })
      .where(eq(groupeEleves.id, id));
    const [apres] = await this.detaillerGroupes(tx, [groupe]);
    await this.auditer(tx, access, 'groupe.modifier', id, adresseIp, groupe, apres, 'groupe');
    return apres;
  }

  /** Un groupe qui a eu des membres reste (historique) : seul un groupe jamais utilisé se supprime. */
  async supprimerGroupe(tx: Transaction, access: Access, id: string, adresseIp: string) {
    const { groupe } = await this.chargerGroupe(tx, access, id);
    const [membre] = await tx
      .select({ id: groupeMembre.id })
      .from(groupeMembre)
      .where(eq(groupeMembre.groupeId, id))
      .limit(1);
    if (membre) {
      throw new ConflictException(
        'Ce groupe a eu des membres : il reste dans l’historique. Retirez ses membres à une date pour le vider.',
      );
    }
    await tx
      .update(groupeEleves)
      .set({ deletedAt: new Date(), updatedBy: access.userId })
      .where(eq(groupeEleves.id, id));
    await this.auditer(tx, access, 'groupe.supprimer', id, adresseIp, groupe, null, 'groupe');
  }

  /**
   * Ajoute des membres à la date d'effet (section 7) : un apprenant déjà dans un autre groupe du
   * même type de sa promotion le quitte ce jour-là ; la capacité est respectée sauf forçage.
   */
  async ajouterMembres(
    tx: Transaction,
    access: Access,
    id: string,
    entree: AjoutMembres,
    adresseIp: string,
  ) {
    const { groupe, promotionIds } = await this.chargerGroupe(tx, access, id);
    const date = entree.date ?? aujourdhui();
    const inscriptions = await tx
      .select()
      .from(inscription)
      .where(and(inArray(inscription.id, entree.inscriptionIds), isNull(inscription.deletedAt)));
    if (inscriptions.length !== new Set(entree.inscriptionIds).size) {
      throw invalide('inscriptionIds', 'Une des inscriptions choisies n’existe pas dans l’école.');
    }
    const appartenances = await this.appartenances(tx, entree.inscriptionIds);
    let effectif = await this.effectif(tx, id, date);
    const ajoutes: string[] = [];
    for (const i of inscriptions) {
      const actuelles = appartenances.filter((a) => a.inscriptionId === i.id && couvre(a, date));
      if (actuelles.some((a) => a.groupeId === id)) continue;
      const memeType = actuelles.filter((a) => a.type === groupe.type);
      refuser(
        verifierAjoutMembre({
          groupeDeLaPromotion: promotionIds.includes(i.promotionId),
          typesActuels: actuelles.filter((a) => a.type !== groupe.type).map((a) => a.type),
          type: groupe.type,
          capacite: groupe.capacite,
          effectif,
          force: entree.forcer,
        }),
        'inscriptionIds',
      );
      for (const ancienne of memeType)
        await this.terminer(tx, access, ancienne.id, ancienne.debut, date);
      await tx.insert(groupeMembre).values({
        organisationId: access.organisationId,
        groupeId: id,
        inscriptionId: i.id,
        debut: date,
        createdBy: access.userId,
      });
      effectif += 1;
      ajoutes.push(i.id);
    }
    const [apres] = await this.detaillerGroupes(tx, [groupe]);
    await this.auditer(
      tx,
      access,
      'groupe.membres',
      id,
      adresseIp,
      null,
      {
        inscriptions: ajoutes,
        date,
        ...(entree.forcer && groupe.capacite !== null && effectif > groupe.capacite
          ? { capaciteForcee: true }
          : {}),
      },
      'groupe',
    );
    return apres;
  }

  async retirerMembre(
    tx: Transaction,
    access: Access,
    id: string,
    entree: RetraitMembre,
    adresseIp: string,
  ) {
    const { groupe } = await this.chargerGroupe(tx, access, id);
    const date = entree.date ?? aujourdhui();
    const [lien] = await tx
      .select()
      .from(groupeMembre)
      .where(
        and(
          eq(groupeMembre.groupeId, id),
          eq(groupeMembre.inscriptionId, entree.inscriptionId),
          isNull(groupeMembre.fin),
        ),
      );
    if (!lien) throw new NotFoundException('Cet apprenant n’est pas membre du groupe.');
    await this.terminer(tx, access, lien.id, lien.debut, date);
    await this.auditer(
      tx,
      access,
      'groupe.retrait',
      id,
      adresseIp,
      { inscription: entree.inscriptionId },
      { date },
      'groupe',
    );
    const [apres] = await this.detaillerGroupes(tx, [groupe]);
    return apres;
  }

  /** RG-02-16 : répartition des inscrits actifs sans groupe du type choisi. */
  async repartir(
    tx: Transaction,
    access: Access,
    promotionId: string,
    saisie: SaisieRepartition,
    adresseIp: string,
  ): Promise<ResultatRepartition> {
    const detail = await this.lire(tx, access, promotionId);
    this.exigerGestion(detail);
    const groupes = detail.groupes.filter((g) => saisie.groupeIds.includes(g.id));
    if (groupes.length !== new Set(saisie.groupeIds).size) {
      throw invalide('groupeIds', 'Un des groupes choisis n’appartient pas à cette promotion.');
    }
    const types = new Set(groupes.map((g) => g.type));
    if (types.size > 1)
      throw invalide(
        'groupeIds',
        'Choisissez des groupes d’un même type (par exemple tous les TD).',
      );
    const date = saisie.date ?? aujourdhui();
    const avecGroupeDuType = new Set(
      (
        await this.appartenances(
          tx,
          detail.inscriptions.map((i) => i.id),
        )
      )
        .filter((a) => couvre(a, date) && types.has(a.type))
        .map((a) => a.inscriptionId),
    );
    // Requêtes successives : une transaction ne traite qu'une requête à la fois.
    const remplis = [];
    for (const g of groupes) {
      remplis.push({
        id: g.id,
        capacite: g.capacite,
        effectif: await this.effectif(tx, g.id, date),
      });
    }
    const aRepartir = detail.inscriptions.filter(
      (i) => inscriptionActive(i, date) && !avecGroupeDuType.has(i.id),
    );
    const proposition = repartir(
      aRepartir.map((i) => ({
        id: i.id,
        nom: i.personne.nom,
        prenom: i.personne.prenom,
        critere:
          (saisie.critere === 'option'
            ? i.option
            : valeurA(
                i.statuts.map((s) => ({ ...s, valeur: s.statut })),
                date,
              )) ?? '',
      })),
      remplis,
      saisie.methode,
    );
    const resultat = {
      affectations: proposition.affectations.map((a) => ({
        inscriptionId: a.apprenantId,
        groupeId: a.groupeId,
      })),
      nonAffectes: proposition.nonAffectes,
      applique: !saisie.apercu,
    };
    if (saisie.apercu) return resultat;
    if (resultat.affectations.length > 0) {
      await tx.insert(groupeMembre).values(
        resultat.affectations.map((a) => ({
          organisationId: access.organisationId,
          groupeId: a.groupeId,
          inscriptionId: a.inscriptionId,
          debut: date,
          createdBy: access.userId,
        })),
      );
    }
    await this.auditer(tx, access, 'promotion.repartition', promotionId, adresseIp, null, {
      methode: saisie.methode,
      critere: saisie.critere ?? null,
      date,
      affectations: resultat.affectations.length,
      nonAffectes: resultat.nonAffectes.length,
    });
    return resultat;
  }

  // ——— Outils ———

  async charger(tx: Transaction, access: Access, id: string): Promise<LignePromotion> {
    await droitsSurPromotion(tx, access, id);
    const [ligne] = await tx
      .select()
      .from(promotion)
      .where(and(eq(promotion.id, id), isNull(promotion.deletedAt)));
    if (!ligne) throw new NotFoundException('Promotion introuvable.');
    return ligne;
  }

  private async chargerInscription(tx: Transaction, access: Access, id: string) {
    const [ligne] = await tx
      .select()
      .from(inscription)
      .where(and(eq(inscription.id, id), isNull(inscription.deletedAt)));
    if (!ligne) throw new NotFoundException('Inscription introuvable.');
    await droitsSurPromotion(tx, access, ligne.promotionId);
    return ligne;
  }

  /** Groupe et ses promotions ; gestion exigée sur l'une d'elles. */
  private async chargerGroupe(tx: Transaction, access: Access, id: string) {
    const [groupe] = await tx
      .select()
      .from(groupeEleves)
      .where(and(eq(groupeEleves.id, id), isNull(groupeEleves.deletedAt)));
    if (!groupe) throw new NotFoundException('Groupe introuvable.');
    const promotionIds = (
      await tx
        .select({ id: groupePromotion.promotionId })
        .from(groupePromotion)
        .where(eq(groupePromotion.groupeId, id))
    ).map((p) => p.id);
    const gestion = await promotionsCouvertes(tx, access, ['promotions:gerer']);
    if (
      !access.permissions.has('promotions:gerer') ||
      !promotionIds.some((p) => couvrePromotion(gestion, p))
    ) {
      const lecture = await promotionsCouvertes(tx, access, LECTURE_PROMOTIONS);
      if (!promotionIds.some((p) => couvrePromotion(lecture, p)))
        throw new NotFoundException('Groupe introuvable.');
      throw new ForbiddenException('Ce groupe est hors de votre périmètre de gestion.');
    }
    return { groupe, promotionIds };
  }

  private async resumer(
    tx: Transaction,
    access: Access,
    lignes: readonly LignePromotion[],
  ): Promise<Promotion[]> {
    if (lignes.length === 0) return [];
    const ids = lignes.map((p) => p.id);
    const formations = await tx
      .select()
      .from(formation)
      .where(inArray(formation.id, [...new Set(lignes.map((p) => p.formationId))]));
    const versions = await tx
      .select()
      .from(maquetteVersion)
      .where(inArray(maquetteVersion.id, [...new Set(lignes.map((p) => p.versionId))]));
    const annees = await tx
      .select()
      .from(anneeScolaire)
      .where(inArray(anneeScolaire.id, [...new Set(lignes.map((p) => p.anneeScolaireId))]));
    const campus = await tx
      .select()
      .from(etablissement)
      .where(inArray(etablissement.id, [...new Set(lignes.map((p) => p.etablissementId))]));
    const inscriptions = await this.inscriptionsDe(tx, ids);
    const gestion = access.permissions.has('promotions:gerer')
      ? await promotionsCouvertes(tx, access, ['promotions:gerer'])
      : new Set<string>();
    const date = aujourdhui();
    return lignes.map((p) => {
      const f = formations.find((x) => x.id === p.formationId);
      const siennes = inscriptions.filter((i) => i.promotionId === p.id);
      const actives = siennes.filter((i) => inscriptionActive(i, date));
      const parStatut = {
        initial: 0,
        apprenti: 0,
        apprenti_sans_employeur: 0,
        professionnalisation: 0,
        formation_continue: 0,
      };
      for (const i of actives) if (i.statut) parStatut[i.statut] += 1;
      return {
        id: p.id,
        libelle: p.libelle,
        formation: {
          id: p.formationId,
          intitule: f?.intitule ?? '',
          dureeAnnees: f?.dureeAnnees ?? 1,
        },
        version: {
          id: p.versionId,
          numero: versions.find((v) => v.id === p.versionId)?.numero ?? 0,
        },
        anneeFormation: p.anneeFormation,
        anneeScolaire: {
          id: p.anneeScolaireId,
          libelle: annees.find((a) => a.id === p.anneeScolaireId)?.libelle ?? '',
        },
        etablissement: {
          id: p.etablissementId,
          nom: campus.find((e) => e.id === p.etablissementId)?.nom ?? '',
        },
        dateDebut: p.dateDebut,
        dateFin: p.dateFin,
        effectifs: {
          inscrits: actives.length,
          preinscrits: siennes.filter((i) => i.etat === 'preinscrit').length,
          parStatut,
        },
        modifiable: couvrePromotion(gestion, p.id),
      };
    });
  }

  /** Inscriptions de promotions, avec identité, statuts et groupes (une seule si `seule`). */
  async inscriptionsDe(
    tx: Transaction,
    promotionIds: readonly string[],
    seule?: string,
  ): Promise<Inscription[]> {
    if (promotionIds.length === 0) return [];
    const lignes = await tx
      .select({ inscription, personne })
      .from(inscription)
      .innerJoin(personne, eq(personne.id, inscription.personneId))
      .where(
        and(
          inArray(inscription.promotionId, [...promotionIds]),
          isNull(inscription.deletedAt),
          seule ? eq(inscription.id, seule) : undefined,
        ),
      )
      .orderBy(asc(personne.nom), asc(personne.prenom));
    if (lignes.length === 0) return [];
    const ids = lignes.map((l) => l.inscription.id);
    const statuts = await tx
      .select()
      .from(inscriptionStatut)
      .where(
        and(inArray(inscriptionStatut.inscriptionId, ids), isNull(inscriptionStatut.deletedAt)),
      )
      .orderBy(asc(inscriptionStatut.debut));
    const membres = await tx
      .select()
      .from(groupeMembre)
      .where(and(inArray(groupeMembre.inscriptionId, ids), isNull(groupeMembre.deletedAt)))
      .orderBy(asc(groupeMembre.debut));
    const date = aujourdhui();
    return lignes.map(({ inscription: i, personne: p }) => {
      const periodes = statuts
        .filter((s) => s.inscriptionId === i.id)
        .map((s) => ({ debut: s.debut, fin: s.fin, statut: s.statut }));
      return {
        id: i.id,
        promotionId: i.promotionId,
        personne: { id: p.id, nom: p.nomUsage ?? p.nom, prenom: p.prenom, matricule: p.matricule },
        etat: i.etat,
        dateEntree: i.dateEntree,
        dateSortie: i.dateSortie,
        motifSortie: i.motifSortie,
        option: i.option,
        statut:
          valeurA(
            periodes.map((s) => ({ ...s, valeur: s.statut })),
            date,
          ) ??
          periodes.at(-1)?.statut ??
          null,
        statuts: periodes,
        groupes: membres
          .filter((m) => m.inscriptionId === i.id)
          .map((m) => ({ groupeId: m.groupeId, debut: m.debut, fin: m.fin })),
      };
    });
  }

  private async detaillerGroupes(
    tx: Transaction,
    groupes: readonly { id: string }[],
  ): Promise<Groupe[]> {
    if (groupes.length === 0) return [];
    const ids = groupes.map((g) => g.id);
    const lignes = await tx.select().from(groupeEleves).where(inArray(groupeEleves.id, ids));
    const liens = await tx
      .select()
      .from(groupePromotion)
      .where(inArray(groupePromotion.groupeId, ids));
    const date = aujourdhui();
    const membres = await tx
      .select()
      .from(groupeMembre)
      .where(and(inArray(groupeMembre.groupeId, ids), isNull(groupeMembre.deletedAt)));
    return ids.flatMap((id) => {
      const g = lignes.find((l) => l.id === id);
      if (!g) return [];
      return [
        {
          id: g.id,
          libelle: g.libelle,
          type: g.type,
          capacite: g.capacite,
          option: g.option,
          promotionIds: liens.filter((l) => l.groupeId === id).map((l) => l.promotionId),
          effectif: membres.filter((m) => m.groupeId === id && couvre(m, date)).length,
        },
      ];
    });
  }

  private async appartenances(tx: Transaction, inscriptionIds: readonly string[]) {
    if (inscriptionIds.length === 0) return [];
    return tx
      .select({
        id: groupeMembre.id,
        inscriptionId: groupeMembre.inscriptionId,
        groupeId: groupeMembre.groupeId,
        debut: groupeMembre.debut,
        fin: groupeMembre.fin,
        type: groupeEleves.type,
      })
      .from(groupeMembre)
      .innerJoin(groupeEleves, eq(groupeEleves.id, groupeMembre.groupeId))
      .where(
        and(
          inArray(groupeMembre.inscriptionId, [...inscriptionIds]),
          isNull(groupeMembre.deletedAt),
        ),
      );
  }

  private async effectif(tx: Transaction, groupeId: string, date: string) {
    const membres = await tx
      .select()
      .from(groupeMembre)
      .where(and(eq(groupeMembre.groupeId, groupeId), isNull(groupeMembre.deletedAt)));
    return membres.filter((m) => couvre(m, date)).length;
  }

  /** Termine une appartenance à une date ; commencée ce jour-là, elle est simplement annulée. */
  private async terminer(tx: Transaction, access: Access, id: string, debut: string, date: string) {
    if (debut >= date) {
      await tx.delete(groupeMembre).where(eq(groupeMembre.id, id));
      return;
    }
    await tx
      .update(groupeMembre)
      .set({ fin: date, updatedBy: access.userId })
      .where(eq(groupeMembre.id, id));
  }

  private async modesFormation(tx: Transaction, formationId: string) {
    const [f] = await tx
      .select({ modes: formation.modes })
      .from(formation)
      .where(eq(formation.id, formationId));
    return f?.modes ?? [];
  }

  private verifierOption(detail: DetailPromotion, option: string | null | undefined) {
    if (option && !detail.options.includes(option)) {
      throw invalide('option', 'Cette option n’existe pas dans la maquette de la promotion.');
    }
  }

  /** Dernière version publiée de la formation, ou celle demandée si elle est publiée. */
  private async versionPubliee(tx: Transaction, formationId: string, demandee?: string) {
    const versions = await tx
      .select()
      .from(maquetteVersion)
      .where(eq(maquetteVersion.formationId, formationId));
    const choisie = demandee
      ? versions.find((v) => v.id === demandee)
      : versionDeReference(versions.filter((v) => v.statut === 'publiee'));
    if (!choisie || choisie.statut !== 'publiee') {
      throw invalide(
        'versionId',
        'Une promotion suit une version publiée de la maquette : publiez d’abord la maquette de la formation.',
      );
    }
    return choisie.id;
  }

  /** RG-02-05 : droit spécifique, version publiée de la même formation, confirmation explicite. */
  private async changementDeVersion(
    tx: Transaction,
    access: Access,
    avant: DetailPromotion,
    changement: ModificationPromotion,
  ) {
    if (!access.permissions.has('promotions:changer-version')) {
      throw new ForbiddenException(
        'Changer la version de maquette d’une promotion demande un droit spécifique : adressez-vous à un administrateur.',
      );
    }
    const versionId = await this.versionPubliee(tx, avant.formation.id, changement.versionId);
    if (!changement.confirmation) {
      throw new ConflictException(
        'Changer de version en cours d’année recalcule les résultats de la promotion : confirmez le changement.',
      );
    }
    return versionId;
  }

  private exigerGestion(detail: { modifiable: boolean }) {
    if (!detail.modifiable) {
      throw new ForbiddenException('Cette promotion est hors de votre périmètre de gestion.');
    }
  }

  private peutCreer(access: Access) {
    return (
      access.permissions.has('promotions:gerer') &&
      (access.perimetres.get('promotions:gerer') ?? []).some(
        (p) => p.type !== 'promotion' && p.type !== 'soi',
      )
    );
  }

  /** Création : toute l'école, l'établissement de la promotion ou sa formation. */
  private verifierCreation(access: Access, etablissementId: string, formationId: string) {
    const ok = (access.perimetres.get('promotions:gerer') ?? []).some(
      (p) =>
        p.type === 'organisation' ||
        (p.type === 'etablissement' && p.id === etablissementId) ||
        (p.type === 'formation' && p.id === formationId),
    );
    if (!ok) {
      throw new ForbiddenException(
        'Vous ne pouvez créer une promotion que dans votre établissement ou pour votre formation.',
      );
    }
  }

  private trace(p: Promotion) {
    return {
      libelle: p.libelle,
      formation: p.formation.intitule,
      version: p.version.numero,
      anneeFormation: p.anneeFormation,
      anneeScolaire: p.anneeScolaire.libelle,
      etablissement: p.etablissement.nom,
      dateDebut: p.dateDebut,
      dateFin: p.dateFin,
    };
  }

  private async auditer(
    tx: Transaction,
    access: Access,
    action: string,
    objetId: string,
    adresseIp: string,
    avant: unknown,
    apres: unknown,
    objetType = 'promotion',
  ) {
    await enregistrerAudit(tx, {
      action,
      objetType,
      objetId,
      auteurId: access.userId,
      adresseIp,
      avant: avant ?? null,
      apres: apres ?? null,
    });
  }
}

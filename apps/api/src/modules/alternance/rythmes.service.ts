import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CalendrierPromotion,
  ExceptionRythme,
  GenerationCalendrier,
  ListeModelesRythme,
  ModeleRythme,
  ModificationModeleRythme,
  NouveauModeleRythme,
  NouvelleExceptionRythme,
  Permission,
  RetoucheJours,
} from '@scolaly/contracts';
import {
  calendrierAlternance,
  enregistrerAudit,
  exceptionRythme,
  fermeture,
  fermetureEtablissement,
  inscription,
  modeleRythme,
  personne,
  promotion,
  type Transaction,
} from '@scolaly/db';
import {
  compterJours,
  genererCalendrier,
  MODELES_FOURNIS,
  typeDuJour,
  verifierMotif,
  type Motif,
  type TypeJour,
} from '@scolaly/domain';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { joursFeriesNationauxDe } from '../../shared/calendrier/jours-feries.js';
import { couvrePromotion, promotionsCouvertes } from '../scolarite/index.js';

const LECTURE: readonly Permission[] = ['rythmes:lire', 'rythmes:gerer'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

type LignePromotion = typeof promotion.$inferSelect;

/** Rythmes d'alternance : modèles, calendriers des promotions, exceptions (E-03-05). */
@Injectable()
export class RythmesService {
  // ——— Modèles (RG-03-10) ———

  async listerModeles(tx: Transaction, access: Access): Promise<ListeModelesRythme> {
    const lignes = await tx
      .select()
      .from(modeleRythme)
      .where(isNull(modeleRythme.deletedAt))
      .orderBy(asc(modeleRythme.libelle));
    return {
      modeles: [
        ...MODELES_FOURNIS.map((m) => ({
          id: m.code,
          libelle: m.libelle,
          motif: m.motif.map((s) => [...s]),
          fourni: true,
        })),
        ...lignes.map((l) => this.modele(l)),
      ],
      creation: access.permissions.has('rythmes:gerer'),
    };
  }

  async creerModele(
    tx: Transaction,
    access: Access,
    entree: NouveauModeleRythme,
    adresseIp: string,
  ): Promise<ModeleRythme> {
    this.exigerMotif(entree.motif);
    await this.exigerLibelleLibre(tx, entree.libelle, null);
    const [ligne] = await tx
      .insert(modeleRythme)
      .values({
        organisationId: access.organisationId,
        libelle: entree.libelle,
        motif: entree.motif,
        createdBy: access.userId,
      })
      .returning();
    if (!ligne) throw new Error('Création du modèle impossible.');
    await this.auditer(tx, access, 'rythme.modele.creer', ligne.id, adresseIp, null, ligne);
    return this.modele(ligne);
  }

  async modifierModele(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationModeleRythme,
    adresseIp: string,
  ): Promise<ModeleRythme> {
    const avant = await this.chargerModele(tx, id);
    if (changement.motif) this.exigerMotif(changement.motif);
    if (changement.libelle) await this.exigerLibelleLibre(tx, changement.libelle, id);
    const [apres] = await tx
      .update(modeleRythme)
      .set({ ...changement, updatedBy: access.userId })
      .where(eq(modeleRythme.id, id))
      .returning();
    if (!apres) throw new NotFoundException('Modèle introuvable.');
    await this.auditer(tx, access, 'rythme.modele.modifier', id, adresseIp, avant, apres);
    return this.modele(apres);
  }

  /** Les calendriers déjà générés gardent leurs jours. */
  async supprimerModele(tx: Transaction, access: Access, id: string, adresseIp: string) {
    const avant = await this.chargerModele(tx, id);
    await tx
      .update(modeleRythme)
      .set({ deletedAt: new Date(), updatedBy: access.userId })
      .where(eq(modeleRythme.id, id));
    await this.auditer(tx, access, 'rythme.modele.supprimer', id, adresseIp, avant, null);
  }

  // ——— Calendrier d'une promotion (RG-03-11) et exceptions (RG-03-12) ———

  async calendrier(
    tx: Transaction,
    access: Access,
    promotionId: string,
  ): Promise<CalendrierPromotion> {
    const { promo, modifiable } = await this.promotion(tx, access, promotionId);
    const [ligne] = await tx
      .select()
      .from(calendrierAlternance)
      .where(
        and(
          eq(calendrierAlternance.promotionId, promotionId),
          isNull(calendrierAlternance.deletedAt),
        ),
      );
    const exceptions = await tx
      .select({ exception: exceptionRythme, inscription, personne })
      .from(exceptionRythme)
      .innerJoin(inscription, eq(inscription.id, exceptionRythme.inscriptionId))
      .innerJoin(personne, eq(personne.id, inscription.personneId))
      .where(and(eq(inscription.promotionId, promotionId), isNull(exceptionRythme.deletedAt)))
      .orderBy(asc(personne.nom), asc(exceptionRythme.debut));
    return {
      promotion: {
        id: promo.id,
        libelle: promo.libelle,
        dateDebut: promo.dateDebut,
        dateFin: promo.dateFin,
      },
      calendrier: ligne
        ? { modele: ligne.modele, jours: ligne.jours, compte: compterJours(ligne.jours) }
        : null,
      exceptions: exceptions.map((e) => this.exception(e)),
      modifiable,
    };
  }

  /** RG-03-11 : génération d'après un modèle, fériés et fermetures appliqués. */
  async generer(
    tx: Transaction,
    access: Access,
    promotionId: string,
    generation: GenerationCalendrier,
    adresseIp: string,
  ): Promise<CalendrierPromotion> {
    const { promo } = await this.promotionGeree(tx, access, promotionId);
    const modele = await this.motifDe(tx, generation.modele);
    const jours = await this.generation(tx, promo, promo.dateDebut, promo.dateFin, modele.motif);
    const [avant] = await tx
      .select()
      .from(calendrierAlternance)
      .where(
        and(
          eq(calendrierAlternance.promotionId, promotionId),
          isNull(calendrierAlternance.deletedAt),
        ),
      );
    if (avant) {
      await tx
        .update(calendrierAlternance)
        .set({ modele: modele.libelle, jours, updatedBy: access.userId })
        .where(eq(calendrierAlternance.id, avant.id));
    } else {
      await tx.insert(calendrierAlternance).values({
        organisationId: access.organisationId,
        promotionId,
        modele: modele.libelle,
        jours,
        createdBy: access.userId,
      });
    }
    await this.auditer(
      tx,
      access,
      'rythme.calendrier.generer',
      promotionId,
      adresseIp,
      avant ? { modele: avant.modele, compte: compterJours(avant.jours) } : null,
      { modele: modele.libelle, compte: compterJours(jours) },
    );
    return this.calendrier(tx, access, promotionId);
  }

  /** RG-03-11 : retouche à la main de jours du calendrier annuel. */
  async retoucher(
    tx: Transaction,
    access: Access,
    promotionId: string,
    retouche: RetoucheJours,
    adresseIp: string,
  ): Promise<CalendrierPromotion> {
    const { promo } = await this.promotionGeree(tx, access, promotionId);
    const [ligne] = await tx
      .select()
      .from(calendrierAlternance)
      .where(
        and(
          eq(calendrierAlternance.promotionId, promotionId),
          isNull(calendrierAlternance.deletedAt),
        ),
      );
    if (!ligne) {
      throw new ConflictException('Générez d’abord le calendrier à partir d’un modèle.');
    }
    const { jours, avant } = this.appliquer(ligne.jours, retouche, promo.dateDebut, promo.dateFin);
    await tx
      .update(calendrierAlternance)
      .set({ jours, updatedBy: access.userId })
      .where(eq(calendrierAlternance.id, ligne.id));
    await this.auditer(tx, access, 'rythme.calendrier.retoucher', promotionId, adresseIp, avant, {
      jours: retouche.jours,
    });
    return this.calendrier(tx, access, promotionId);
  }

  /** RG-03-12 : exception d'un apprenant sur une période, générée d'après un modèle. */
  async creerException(
    tx: Transaction,
    access: Access,
    promotionId: string,
    entree: NouvelleExceptionRythme,
    adresseIp: string,
  ): Promise<CalendrierPromotion> {
    const { promo } = await this.promotionGeree(tx, access, promotionId);
    const [ins] = await tx
      .select()
      .from(inscription)
      .where(
        and(
          eq(inscription.id, entree.inscriptionId),
          eq(inscription.promotionId, promotionId),
          isNull(inscription.deletedAt),
        ),
      );
    if (!ins) throw invalide('inscriptionId', 'Cet apprenant n’est pas inscrit à la promotion.');
    if (entree.fin < entree.debut) {
      throw invalide('fin', 'La fin de l’exception ne peut pas précéder son début.');
    }
    if (entree.debut < promo.dateDebut || entree.fin > promo.dateFin) {
      throw invalide('debut', 'L’exception se situe dans les dates de la promotion.');
    }
    const autres = await tx
      .select({ debut: exceptionRythme.debut, fin: exceptionRythme.fin })
      .from(exceptionRythme)
      .where(and(eq(exceptionRythme.inscriptionId, ins.id), isNull(exceptionRythme.deletedAt)));
    if (autres.some((a) => a.debut <= entree.fin && entree.debut <= a.fin)) {
      throw new ConflictException(
        'Cet apprenant a déjà une exception sur cette période : modifiez-la ou supprimez-la.',
      );
    }
    const modele = await this.motifDe(tx, entree.modele);
    const jours = await this.generation(tx, promo, entree.debut, entree.fin, modele.motif);
    const [ligne] = await tx
      .insert(exceptionRythme)
      .values({
        organisationId: access.organisationId,
        inscriptionId: ins.id,
        debut: entree.debut,
        fin: entree.fin,
        motif: entree.motif,
        jours,
        createdBy: access.userId,
      })
      .returning();
    if (!ligne) throw new Error('Création de l’exception impossible.');
    await this.auditer(tx, access, 'rythme.exception.creer', ligne.id, adresseIp, null, {
      inscriptionId: ins.id,
      debut: entree.debut,
      fin: entree.fin,
      modele: modele.libelle,
    });
    return this.calendrier(tx, access, promotionId);
  }

  async retoucherException(
    tx: Transaction,
    access: Access,
    id: string,
    retouche: RetoucheJours,
    adresseIp: string,
  ): Promise<CalendrierPromotion> {
    const { ligne, promotionId } = await this.exceptionGeree(tx, access, id);
    const { jours, avant } = this.appliquer(ligne.jours, retouche, ligne.debut, ligne.fin);
    await tx
      .update(exceptionRythme)
      .set({ jours, updatedBy: access.userId })
      .where(eq(exceptionRythme.id, id));
    await this.auditer(tx, access, 'rythme.exception.retoucher', id, adresseIp, avant, {
      jours: retouche.jours,
    });
    return this.calendrier(tx, access, promotionId);
  }

  async supprimerException(
    tx: Transaction,
    access: Access,
    id: string,
    adresseIp: string,
  ): Promise<CalendrierPromotion> {
    const { ligne, promotionId } = await this.exceptionGeree(tx, access, id);
    await tx
      .update(exceptionRythme)
      .set({ deletedAt: new Date(), updatedBy: access.userId })
      .where(eq(exceptionRythme.id, id));
    await this.auditer(tx, access, 'rythme.exception.supprimer', id, adresseIp, ligne, null);
    return this.calendrier(tx, access, promotionId);
  }

  /** Type de chaque jour pour un apprenant : son exception, sinon le calendrier de sa promotion. */
  async typeDuJourPour(tx: Transaction, inscriptionIds: string[]) {
    const parInscription = new Map<string, (jour: string) => TypeJour | null>();
    if (inscriptionIds.length === 0) return parInscription;
    const calendriers = await tx
      .select({ inscriptionId: inscription.id, jours: calendrierAlternance.jours })
      .from(inscription)
      .leftJoin(
        calendrierAlternance,
        and(
          eq(calendrierAlternance.promotionId, inscription.promotionId),
          isNull(calendrierAlternance.deletedAt),
        ),
      )
      .where(inArray(inscription.id, inscriptionIds));
    const exceptions = await tx
      .select()
      .from(exceptionRythme)
      .where(
        and(
          inArray(exceptionRythme.inscriptionId, inscriptionIds),
          isNull(exceptionRythme.deletedAt),
        ),
      );
    for (const c of calendriers) {
      const siennes = exceptions.filter((e) => e.inscriptionId === c.inscriptionId);
      parInscription.set(c.inscriptionId, (jour) => typeDuJour(c.jours, siennes, jour));
    }
    return parInscription;
  }

  // ——— Outils ———

  private async promotion(tx: Transaction, access: Access, id: string) {
    const lecture = await promotionsCouvertes(tx, access, LECTURE);
    const [promo] = await tx
      .select()
      .from(promotion)
      .where(and(eq(promotion.id, id), isNull(promotion.deletedAt)));
    if (!promo || !couvrePromotion(lecture, id)) {
      throw new NotFoundException('Promotion introuvable.');
    }
    const gestion = access.permissions.has('rythmes:gerer')
      ? await promotionsCouvertes(tx, access, ['rythmes:gerer'])
      : new Set<string>();
    return { promo, modifiable: couvrePromotion(gestion, id) };
  }

  private async promotionGeree(tx: Transaction, access: Access, id: string) {
    const resultat = await this.promotion(tx, access, id);
    if (!resultat.modifiable) {
      throw new ForbiddenException('Vous ne définissez pas les rythmes de cette promotion.');
    }
    return resultat;
  }

  private async exceptionGeree(tx: Transaction, access: Access, id: string) {
    const [ligne] = await tx
      .select({ exception: exceptionRythme, promotionId: inscription.promotionId })
      .from(exceptionRythme)
      .innerJoin(inscription, eq(inscription.id, exceptionRythme.inscriptionId))
      .where(and(eq(exceptionRythme.id, id), isNull(exceptionRythme.deletedAt)));
    if (!ligne) throw new NotFoundException('Exception introuvable.');
    await this.promotionGeree(tx, access, ligne.promotionId);
    return { ligne: ligne.exception, promotionId: ligne.promotionId };
  }

  /** Jours générés sur l'intervalle, avec les fériés nationaux et les fermetures de l'établissement. */
  private async generation(
    tx: Transaction,
    promo: LignePromotion,
    debut: string,
    fin: string,
    motif: Motif,
  ) {
    const feries: string[] = [];
    for (let annee = Number(debut.slice(0, 4)); annee <= Number(fin.slice(0, 4)); annee++) {
      feries.push(...joursFeriesNationauxDe(annee).map((j) => j.date));
    }
    const fermetures = await tx
      .select()
      .from(fermeture)
      .where(
        and(eq(fermeture.anneeScolaireId, promo.anneeScolaireId), isNull(fermeture.deletedAt)),
      );
    const cibles =
      fermetures.length === 0
        ? []
        : await tx
            .select()
            .from(fermetureEtablissement)
            .where(
              and(
                inArray(
                  fermetureEtablissement.fermetureId,
                  fermetures.map((f) => f.id),
                ),
                isNull(fermetureEtablissement.deletedAt),
              ),
            );
    // Une fermeture sans établissement listé s'applique à tous (RG-01-04).
    const applicables = fermetures.filter((f) => {
      const siennes = cibles.filter((c) => c.fermetureId === f.id);
      return (
        siennes.length === 0 || siennes.some((c) => c.etablissementId === promo.etablissementId)
      );
    });
    return genererCalendrier({ debut, fin, motif, feries, fermetures: applicables });
  }

  private appliquer(
    jours: Record<string, TypeJour>,
    retouche: RetoucheJours,
    debut: string,
    fin: string,
  ) {
    const avant: Record<string, TypeJour | null> = {};
    const apres = { ...jours };
    for (const { date, type } of retouche.jours) {
      if (date < debut || date > fin) {
        throw invalide('jours', `Le ${date} est hors de la période du calendrier.`);
      }
      avant[date] = jours[date] ?? null;
      apres[date] = type;
    }
    return { jours: apres, avant };
  }

  /** Motif d'un modèle fourni (par son code) ou de l'école (par son identifiant). */
  private async motifDe(tx: Transaction, modele: string) {
    const fourni = MODELES_FOURNIS.find((m) => m.code === modele);
    if (fourni) return { libelle: fourni.libelle, motif: fourni.motif };
    const [ligne] = UUID.test(modele)
      ? await tx
          .select()
          .from(modeleRythme)
          .where(and(eq(modeleRythme.id, modele), isNull(modeleRythme.deletedAt)))
      : [];
    if (!ligne) throw invalide('modele', 'Choisissez un modèle de rythme de la liste.');
    return { libelle: ligne.libelle, motif: ligne.motif };
  }

  private async chargerModele(tx: Transaction, id: string) {
    const [ligne] = await tx
      .select()
      .from(modeleRythme)
      .where(and(eq(modeleRythme.id, id), isNull(modeleRythme.deletedAt)));
    if (!ligne) throw new NotFoundException('Modèle introuvable.');
    return ligne;
  }

  private exigerMotif(motif: TypeJour[][]) {
    if (!verifierMotif(motif)) {
      throw invalide(
        'motif',
        'Le motif compte 1 à 4 semaines complètes et au moins un jour d’école.',
      );
    }
  }

  private async exigerLibelleLibre(tx: Transaction, libelle: string, exclu: string | null) {
    const [homonyme] = await tx
      .select({ id: modeleRythme.id })
      .from(modeleRythme)
      .where(
        and(
          eq(modeleRythme.libelle, libelle),
          isNull(modeleRythme.deletedAt),
          exclu ? ne(modeleRythme.id, exclu) : undefined,
        ),
      );
    if (homonyme || MODELES_FOURNIS.some((m) => m.libelle === libelle)) {
      throw new ConflictException('Un modèle porte déjà ce nom : choisissez-en un autre.');
    }
  }

  private modele(l: typeof modeleRythme.$inferSelect): ModeleRythme {
    return { id: l.id, libelle: l.libelle, motif: l.motif, fourni: false };
  }

  private exception(e: {
    exception: typeof exceptionRythme.$inferSelect;
    inscription: typeof inscription.$inferSelect;
    personne: typeof personne.$inferSelect;
  }): ExceptionRythme {
    return {
      id: e.exception.id,
      apprenant: {
        inscriptionId: e.inscription.id,
        personneId: e.personne.id,
        nom: e.personne.nomUsage ?? e.personne.nom,
        prenom: e.personne.prenom,
      },
      debut: e.exception.debut,
      fin: e.exception.fin,
      motif: e.exception.motif,
      jours: e.exception.jours,
    };
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
      objetType: action.startsWith('rythme.calendrier') ? 'promotion' : 'rythme',
      objetId,
      auteurId: access.userId,
      adresseIp,
      ...(avant === null ? {} : { avant }),
      ...(apres === null ? {} : { apres }),
    });
  }
}

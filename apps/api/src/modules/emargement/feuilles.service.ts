import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FUSEAU_PAR_DEFAUT, PLAGE_EDT_PAR_DEFAUT, type FiltreFeuilles } from '@scolaly/contracts';
import {
  apprenantsDePromotion,
  complementsDeFeuille,
  donneesRecapitulatif,
  enregistrerAudit,
  enTetesDeSeances,
  etablissement,
  organisation,
  personne,
  promotion,
  seanceIntervenant,
  seancesValideesDePromotion,
  validationsDeSeance,
  type EnTeteSeanceLue,
  type Transaction,
} from '@scolaly/db';
import {
  donneesFeuilleSeance,
  horodatageFr,
  jourLocal,
  moisEnClair,
  recapitulatifMensuel,
  type ApprenantRecapitulatif,
  type DonneesFeuilleSeance,
} from '@scolaly/domain';
import { loadTemplate, renderPdf } from '@scolaly/pdf';
import { and, eq, isNull } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { couvrePromotion, promotionsCouvertes } from '../scolarite/index.js';

/** PDF produit à la demande, remis par l'API (ADR 0007) une fois sa trace écrite. */
export interface PdfProduit {
  pdf: Buffer;
  nom: string;
  sha256: string;
}

/** Feuilles d'un mois : au-delà, la génération en tâche de fond prendra le relais (RG-06-27). */
export const FEUILLES_PAR_DOCUMENT = 200;

const JOUR_MS = 86_400_000;

/** Bornes larges (± 1 jour) d'un mois : le jour local de chaque séance tranche ensuite. */
function bornesLarges(mois: string): [Date, Date] {
  const [annee, numero] = mois.split('-').map(Number) as [number, number];
  return [
    new Date(Date.UTC(annee, numero - 1, 1) - JOUR_MS),
    new Date(Date.UTC(annee, numero, 1) + JOUR_MS),
  ];
}

const fichier = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

/**
 * Feuilles d'émargement PDF (I4.4 ; RG-06-25, RG-06-26, US-06-11), produites à la demande avec
 * packages/pdf, jamais sur le chemin du scan. Chaque remise est tracée au journal d'audit avec
 * l'empreinte SHA-256 du document : c'est la preuve de ce qui a été remis.
 */
@Injectable()
export class FeuillesService {
  /**
   * Droit sur une séance : la permission sur toute l'école ou sur une promotion du public, ou
   * l'un des intervenants de la séance (matrice du module 06 : « ses séances »).
   */
  private async controlerSeance(tx: Transaction, access: Access, e: EnTeteSeanceLue) {
    const couvertes = await promotionsCouvertes(tx, access, ['emargement:feuilles']);
    if (couvertes === null || e.promotionIds.some((id) => couvertes.has(id))) return;
    const [lien] = await tx
      .select({ id: seanceIntervenant.id })
      .from(seanceIntervenant)
      .where(
        and(
          eq(seanceIntervenant.seanceId, e.seanceId),
          eq(seanceIntervenant.personneId, access.personneId),
          isNull(seanceIntervenant.deletedAt),
        ),
      );
    if (!lien)
      throw new ForbiddenException(
        'Cette feuille n’est pas dans votre périmètre : demandez-la à la scolarité de l’école.',
      );
  }

  /** RG-06-25 : données d'une feuille, pour une version signée (la dernière par défaut). */
  private async feuille(
    tx: Transaction,
    e: EnTeteSeanceLue,
    numero: number | null,
  ): Promise<DonneesFeuilleSeance | null> {
    const validations = await validationsDeSeance(tx, e.seanceId);
    const derniere = validations.at(-1);
    if (!derniere) return null;
    const choisie = numero === null ? derniere : validations.find((v) => v.version === numero);
    if (!choisie)
      throw new NotFoundException(
        "Cette version de l'appel n'existe pas : choisissez-en une autre.",
      );
    const complements = await complementsDeFeuille(tx, e.seanceId);
    const fuseau = e.fuseau ?? FUSEAU_PAR_DEFAUT;
    return donneesFeuilleSeance(
      {
        organisme: e.organisme,
        nda: e.nda,
        etablissement: e.etablissement,
        formations: e.formations,
        publics: e.publics,
        libelle: e.libelle,
        module: e.module,
        debut: e.debut,
        fin: e.fin,
        fuseau,
        salle: e.salle,
        mode: e.mode,
        intervenants: e.intervenants,
      },
      choisie.liste.map((l) => {
        const c = complements.get(l.personneId);
        return {
          ...l,
          nom: c?.nom ?? '',
          prenom: c?.prenom ?? '',
          modeScan: c?.modeScan ?? null,
          // La décision en cours de l'intervenant n'éclaire que la dernière version.
          decisionIntervenant: choisie === derniere && Boolean(c?.marque),
          justification: c?.justification ?? null,
        };
      }),
      validations.map((v) => ({
        version: v.version,
        valideLe: v.valideLe,
        validePar: `${v.prenom} ${v.nom}`,
        empreinte: v.empreinte,
        motif: v.motif,
        correctionVerrouillee: v.correctionVerrouillee,
      })),
      choisie.version,
    );
  }

  private async rendre(
    modele: string,
    donnees: Record<string, unknown>,
    fuseau: string,
  ): Promise<Omit<PdfProduit, 'nom'>> {
    const maintenant = new Date();
    const rendu = renderPdf({
      template: await loadTemplate(modele),
      donnees: { ...donnees, editeLe: horodatageFr(maintenant, fuseau) },
      emisLe: maintenant,
    });
    return { pdf: rendu.pdf, sha256: rendu.sha256 };
  }

  /** US-06-11, RG-06-25 : feuille signée d'une séance, tracée à chaque téléchargement. */
  async feuilleSeance(
    tx: Transaction,
    access: Access,
    seanceId: string,
    numero: number | null,
    adresseIp: string,
  ): Promise<PdfProduit> {
    const [e] = await enTetesDeSeances(tx, [seanceId]);
    if (!e) throw new NotFoundException('Séance introuvable dans cette école.');
    await this.controlerSeance(tx, access, e);
    const donnees = await this.feuille(tx, e, numero);
    if (!donnees)
      throw new ConflictException(
        "L'appel de cette séance n'est pas encore validé : la feuille sera disponible dès que l'intervenant l'aura validé.",
      );
    const fuseau = e.fuseau ?? FUSEAU_PAR_DEFAUT;
    const rendu = await this.rendre(
      'feuille-seance',
      { titre: `Feuille d'émargement · ${e.libelle}`, organisme: e.organisme, feuilles: [donnees] },
      fuseau,
    );
    await enregistrerAudit(tx, {
      action: 'telechargement.feuille-emargement',
      objetType: 'seance',
      objetId: seanceId,
      auteurId: access.userId,
      adresseIp,
      apres: { version: donnees.version.numero, sha256: rendu.sha256 },
    });
    return {
      ...rendu,
      nom: `feuille-emargement-${jourLocal(e.debut, fuseau)}-${fichier(e.libelle)}-v${donnees.version.numero}.pdf`,
    };
  }

  /**
   * E-06-09, US-06-11 : feuilles d'une promotion pour un mois, par séance (feuilles signées, une
   * par page) ou par apprenant (récapitulatifs mensuels, RG-06-26), en un seul PDF.
   */
  async feuillesPromotion(
    tx: Transaction,
    access: Access,
    filtre: FiltreFeuilles,
    adresseIp: string,
  ): Promise<PdfProduit> {
    const couvertes = await promotionsCouvertes(tx, access, ['emargement:feuilles']);
    const [promo] = couvrePromotion(couvertes, filtre.promotionId)
      ? await tx
          .select({
            libelle: promotion.libelle,
            organisme: organisation.nomAffichage,
            nda: etablissement.nda,
            fuseau: etablissement.fuseauHoraire,
          })
          .from(promotion)
          .innerJoin(organisation, eq(organisation.id, promotion.organisationId))
          .innerJoin(etablissement, eq(etablissement.id, promotion.etablissementId))
          .where(and(eq(promotion.id, filtre.promotionId), isNull(promotion.deletedAt)))
      : [];
    if (!promo) throw new NotFoundException('Promotion introuvable dans votre périmètre.');
    const [du, au] = bornesLarges(filtre.mois);
    let rendu: Omit<PdfProduit, 'nom'>;
    let quantite: number;
    if (filtre.format === 'seances') {
      const entetes = (
        await enTetesDeSeances(tx, await seancesValideesDePromotion(tx, filtre.promotionId, du, au))
      ).filter((e) => jourLocal(e.debut, e.fuseau ?? FUSEAU_PAR_DEFAUT).startsWith(filtre.mois));
      if (entetes.length === 0)
        throw new NotFoundException(
          'Aucun appel validé pour cette promotion ce mois-ci : choisissez un autre mois, ou relancez les intervenants.',
        );
      if (entetes.length > FEUILLES_PAR_DOCUMENT)
        throw new ConflictException(
          `Plus de ${FEUILLES_PAR_DOCUMENT} séances ce mois-ci : téléchargez les récapitulatifs par apprenant, ou les feuilles séance par séance.`,
        );
      const feuilles: DonneesFeuilleSeance[] = [];
      for (const e of entetes) {
        const f = await this.feuille(tx, e, null);
        if (f) feuilles.push(f);
      }
      quantite = feuilles.length;
      rendu = await this.rendre(
        'feuille-seance',
        {
          titre: `Feuilles d'émargement · ${promo.libelle} · ${moisEnClair(filtre.mois)}`,
          organisme: promo.organisme,
          feuilles,
        },
        promo.fuseau,
      );
    } else {
      let apprenants = await apprenantsDePromotion(
        tx,
        filtre.promotionId,
        jourLocal(du, 'UTC'),
        jourLocal(au, 'UTC'),
      );
      if (filtre.personneId)
        apprenants = apprenants.filter((a) => a.personneId === filtre.personneId);
      if (apprenants.length === 0)
        throw new NotFoundException('Aucun apprenant inscrit dans cette promotion ce mois-ci.');
      quantite = apprenants.length;
      rendu = await this.rendre(
        'recapitulatif-mensuel',
        await this.recapitulatif(tx, apprenants, filtre.mois, {
          titre: `Récapitulatifs d'assiduité · ${promo.libelle} · ${moisEnClair(filtre.mois)}`,
          organisme: { nom: promo.organisme, nda: promo.nda },
          promotion: promo.libelle,
        }),
        promo.fuseau,
      );
    }
    await enregistrerAudit(tx, {
      action: 'telechargement.feuilles-emargement',
      objetType: 'promotion',
      objetId: filtre.promotionId,
      auteurId: access.userId,
      adresseIp,
      apres: {
        mois: filtre.mois,
        format: filtre.format,
        personneId: filtre.personneId ?? null,
        documents: quantite,
        sha256: rendu.sha256,
      },
    });
    const sorte = filtre.format === 'seances' ? 'feuilles-emargement' : 'recapitulatifs-assiduite';
    return { ...rendu, nom: `${sorte}-${fichier(promo.libelle)}-${filtre.mois}.pdf` };
  }

  /** RG-06-26 : données du récapitulatif mensuel des apprenants donnés. */
  private async recapitulatif(
    tx: Transaction,
    apprenants: readonly ApprenantRecapitulatif[],
    mois: string,
    entete: Record<string, unknown>,
  ) {
    const [du, au] = bornesLarges(mois);
    const d = await donneesRecapitulatif(
      tx,
      apprenants.map((a) => a.personneId),
      du,
      au,
    );
    const seances = d.seances
      .map((s) => ({
        ...s,
        fuseau: s.fuseau ?? FUSEAU_PAR_DEFAUT,
        limiteMidi: s.limiteMidi ?? PLAGE_EDT_PAR_DEFAUT.limiteMidi,
      }))
      .filter((s) => jourLocal(s.debut, s.fuseau).startsWith(mois));
    return {
      ...entete,
      mois: moisEnClair(mois),
      apprenants: recapitulatifMensuel({
        apprenants,
        seances,
        attendus: d.attendus,
        absences: d.absences,
      }),
    };
  }

  /** E-06-04 : son propre récapitulatif mensuel, sans permission (matrice : « ses récapitulatifs »). */
  async monRecapitulatif(
    tx: Transaction,
    access: Access,
    mois: string,
    adresseIp: string,
  ): Promise<PdfProduit> {
    const [moi] = await tx
      .select({
        personneId: personne.id,
        nom: personne.nom,
        prenom: personne.prenom,
        organisme: organisation.nomAffichage,
      })
      .from(personne)
      .innerJoin(organisation, eq(organisation.id, personne.organisationId))
      .where(eq(personne.id, access.personneId));
    if (!moi) throw new NotFoundException('Votre fiche est introuvable dans cette école.');
    const rendu = await this.rendre(
      'recapitulatif-mensuel',
      await this.recapitulatif(tx, [moi], mois, {
        titre: `Récapitulatif d'assiduité · ${moisEnClair(mois)}`,
        organisme: { nom: moi.organisme, nda: null },
        promotion: null,
      }),
      FUSEAU_PAR_DEFAUT,
    );
    await enregistrerAudit(tx, {
      action: 'telechargement.recapitulatif-assiduite',
      objetType: 'personne',
      objetId: moi.personneId,
      auteurId: access.userId,
      adresseIp,
      apres: { mois, sha256: rendu.sha256 },
    });
    return { ...rendu, nom: `recapitulatif-assiduite-${mois}.pdf` };
  }
}

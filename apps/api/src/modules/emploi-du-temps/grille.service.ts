import { Inject, Injectable } from '@nestjs/common';
import type { RechercheSemaine, SemaineEdt } from '@scolaly/contracts';
import {
  affectation,
  calendrierAlternance,
  indisponibiliteIntervenant,
  groupePromotion,
  maquetteModule,
  maquetteUe,
  promotion,
  seance,
  type Transaction,
} from '@scolaly/db';
import { creneauApplicable, volumesAPlacer } from '@scolaly/domain';
import { and, asc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import { FieldEncryption } from '../../shared/crypto/field-encryption.js';
import { FIELD_ENCRYPTION } from '../../shared/tokens.js';
import { ContexteService, joursEntre, versPlanifiee, volumeEnMinutes } from './contexte.service.js';
import { lireMotifIndisponibilite } from './disponibilites.service.js';

type Fond = Pick<SemaineEdt, 'jours' | 'disponibilites' | 'aPlacer'>;

export interface DemandeFond {
  organisationId: string;
  etablissementId: string;
  /** Premier et dernier jours de la semaine, et la même semaine en instants UTC. */
  debut: string;
  fin: string;
  debutFenetre: Date;
  finFenetre: Date;
  recherche: RechercheSemaine;
  /** Promotions lisibles (null : toutes). */
  lecture: Set<string> | null;
  /** Promotions gérées (null : toutes ; false : aucune). */
  gestion: Set<string> | null | false;
}

/**
 * E-04-01 : fond de la grille d'une semaine, une requête par type de donnée. Fermetures et jours
 * fériés ; jours en entreprise du public affiché (RG-03-13) ; pour qui construit l'emploi du
 * temps, disponibilités de l'intervenant affiché (RG-04-18) et modules à placer (RG-04-16).
 */
@Injectable()
export class GrilleService {
  constructor(
    private readonly contexte: ContexteService,
    @Inject(FIELD_ENCRYPTION) private readonly chiffrement: FieldEncryption,
  ) {}

  async fond(tx: Transaction, d: DemandeFond): Promise<Fond> {
    const promos = await this.promotionsDuPublic(tx, d);
    const fermetures = await this.contexte.fermetures(tx, d.etablissementId, d.debut, d.fin);
    const calendriers =
      promos.length === 0
        ? []
        : await tx
            .select({
              promotionId: calendrierAlternance.promotionId,
              jours: calendrierAlternance.jours,
            })
            .from(calendrierAlternance)
            .where(
              and(
                inArray(
                  calendrierAlternance.promotionId,
                  promos.map((p) => p.id),
                ),
                isNull(calendrierAlternance.deletedAt),
              ),
            );
    // Un jour n'est grisé que si tout le public est en entreprise ; une promotion sans calendrier
    // d'alternance (formation initiale) ne l'est jamais.
    const jours = joursEntre(d.debut, d.fin).map((jour) => ({
      jour,
      fermeture: fermetures.find((f) => f.dateDebut <= jour && jour <= f.dateFin)?.libelle ?? null,
      entreprise:
        promos.length > 0 &&
        promos.every(
          (p) => calendriers.find((c) => c.promotionId === p.id)?.jours[jour] === 'entreprise',
        ),
    }));
    const construction =
      d.gestion !== false &&
      promos.every((p) => d.gestion === null || (d.gestion !== false && d.gestion.has(p.id)));
    return {
      jours,
      disponibilites:
        d.gestion !== false && d.recherche.intervenantId
          ? await this.disponibilites(tx, d.recherche.intervenantId, d)
          : null,
      aPlacer: construction && promos.length > 0 ? await this.aPlacer(tx, promos, d) : null,
    };
  }

  /**
   * Promotions de l'établissement du public affiché (la promotion, ou celles du groupe), toutes
   * lisibles ; sinon aucune, pour ne rien laisser deviner d'un public hors périmètre.
   */
  private async promotionsDuPublic(tx: Transaction, d: DemandeFond) {
    const { promotionId, groupeId } = d.recherche;
    if (!promotionId && !groupeId) return [];
    const colonnes = {
      id: promotion.id,
      versionId: promotion.versionId,
      anneeFormation: promotion.anneeFormation,
      etablissementId: promotion.etablissementId,
    };
    const promos = promotionId
      ? await tx
          .select(colonnes)
          .from(promotion)
          .where(and(eq(promotion.id, promotionId), isNull(promotion.deletedAt)))
      : await tx
          .select(colonnes)
          .from(groupePromotion)
          .innerJoin(promotion, eq(promotion.id, groupePromotion.promotionId))
          .where(
            and(
              eq(groupePromotion.groupeId, groupeId ?? ''),
              isNull(groupePromotion.deletedAt),
              isNull(promotion.deletedAt),
            ),
          );
    const visibles = promos.every(
      (p) => p.etablissementId === d.etablissementId && (d.lecture === null || d.lecture.has(p.id)),
    );
    return visibles ? promos : [];
  }

  private async disponibilites(
    tx: Transaction,
    intervenantId: string,
    d: DemandeFond,
  ): Promise<NonNullable<Fond['disponibilites']>> {
    const { disponibilites } = await this.contexte.disponibilites(
      tx,
      [intervenantId],
      d.debutFenetre,
      d.finFenetre,
    );
    const indisponibilites = await tx
      .select({
        id: indisponibiliteIntervenant.id,
        debut: indisponibiliteIntervenant.debut,
        fin: indisponibiliteIntervenant.fin,
        motifChiffre: indisponibiliteIntervenant.motifChiffre,
      })
      .from(indisponibiliteIntervenant)
      .where(
        and(
          eq(indisponibiliteIntervenant.personneId, intervenantId),
          isNull(indisponibiliteIntervenant.deletedAt),
          lt(indisponibiliteIntervenant.debut, d.finFenetre),
          gt(indisponibiliteIntervenant.fin, d.debutFenetre),
        ),
      )
      .orderBy(asc(indisponibiliteIntervenant.debut));
    // Le motif (donnée personnelle chiffrée) ne va qu'aux gestionnaires de l'intervenant : toute
    // l'école, ou une promotion gérée où il est affecté. Aucune trace : les lectures ne sont pas
    // journalisées.
    const motifVisible =
      indisponibilites.some((i) => i.motifChiffre !== null) &&
      (await this.gereIntervenant(tx, intervenantId, d.gestion));
    // Un créneau ne figure que s'il est valable le jour de la semaine affichée qui lui correspond
    // (période de validité) ; jour ISO : lundi = 1 … dimanche = 7.
    const jourIso = (jour: string) => ((new Date(`${jour}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const jours = joursEntre(d.debut, d.fin);
    return {
      creneaux: disponibilites
        .filter((c) => {
          const jour = jours.find((j) => jourIso(j) === c.jourSemaine);
          return jour !== undefined && creneauApplicable(c, jour);
        })
        .map(({ jourSemaine, heureDebut, heureFin }) => ({
          jourSemaine,
          heureDebut,
          heureFin,
        })),
      indisponibilites: indisponibilites.map((i) => ({
        debut: i.debut.toISOString(),
        fin: i.fin.toISOString(),
        motif: motifVisible
          ? lireMotifIndisponibilite(this.chiffrement, d.organisationId, i)
          : null,
      })),
    };
  }

  /** L'intervenant est dans le périmètre de gestion : toute l'école, ou affecté à une promotion gérée. */
  private async gereIntervenant(
    tx: Transaction,
    intervenantId: string,
    gestion: DemandeFond['gestion'],
  ): Promise<boolean> {
    if (gestion === false) return false;
    if (gestion === null) return true;
    if (gestion.size === 0) return false;
    const [lien] = await tx
      .select({ id: affectation.id })
      .from(affectation)
      .where(
        and(
          eq(affectation.personneId, intervenantId),
          inArray(affectation.promotionId, [...gestion]),
          isNull(affectation.deletedAt),
        ),
      )
      .limit(1);
    return lien !== undefined;
  }

  /**
   * RG-04-16 : modules de la maquette (année de formation) des promotions du public et volume
   * restant par type. Les séances comptées sont celles du public affiché : pour un groupe, aussi
   * celles de ses promotions entières (cours communs).
   */
  private async aPlacer(
    tx: Transaction,
    promos: readonly { id: string; versionId: string; anneeFormation: number }[],
    d: DemandeFond,
  ): Promise<NonNullable<Fond['aPlacer']>> {
    const modules = await tx
      .select({ module: maquetteModule })
      .from(maquetteModule)
      .innerJoin(maquetteUe, eq(maquetteUe.id, maquetteModule.ueId))
      .where(
        or(
          ...promos.map((p) =>
            and(eq(maquetteModule.versionId, p.versionId), eq(maquetteUe.annee, p.anneeFormation)),
          ),
        ),
      )
      .orderBy(asc(maquetteUe.semestre), asc(maquetteUe.ordre), asc(maquetteModule.ordre));
    if (modules.length === 0) return [];
    const parId = new Map(modules.map(({ module: m }) => [m.id, m]));
    const ids = [...parId.keys()];
    const seances = await this.contexte.seances(tx, inArray(seance.moduleId, ids));
    const publicIds = d.recherche.groupeId
      ? [d.recherche.groupeId, ...promos.map((p) => p.id)]
      : promos.map((p) => p.id);
    return volumesAPlacer(
      ids,
      Object.fromEntries([...parId].map(([id, m]) => [id, volumeEnMinutes(m)])),
      seances.map(versPlanifiee),
      publicIds,
    ).map((v) => {
      const m = parId.get(v.moduleId);
      return { ...v, code: m?.code ?? '', intitule: m?.intitule ?? '' };
    });
  }
}

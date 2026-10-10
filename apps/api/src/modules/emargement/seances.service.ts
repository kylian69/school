import { Inject, Injectable } from '@nestjs/common';
import { perimetreAControler, type SeanceProche } from '@scolaly/contracts';
import {
  etablissement,
  etablissementDeSeance,
  personne,
  salle,
  seance,
  seanceAttenduCalcule,
  seanceIntervenant,
  seanceSerie,
  type Transaction,
} from '@scolaly/db';
import { badgeModifie, jourLocal } from '@scolaly/domain';
import { and, asc, eq, gt, inArray, isNull, lt, type SQL } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import type { Env } from '../../config/env.js';
import { dureeBadgeModifie } from '../../shared/badge-modifie.js';
import { ENV } from '../../shared/tokens.js';

const HEURE = 3600_000;
const FUSEAU_PAR_DEFAUT = 'Europe/Paris';

/** RG-04-01 : séances dont la personne est l'un des intervenants. */
function seancesDe(tx: Transaction, personneId: string) {
  return tx
    .select({ id: seanceIntervenant.seanceId })
    .from(seanceIntervenant)
    .where(and(eq(seanceIntervenant.personneId, personneId), isNull(seanceIntervenant.deletedAt)));
}

/** Séances proches : celles de l'intervenant, de toute l'école, ou où l'apprenant est attendu. */
@Injectable()
export class SeancesService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Séances publiées de la fenêtre, avec l'établissement (salle, sinon série) qui fixe le fuseau. */
  private async lister(tx: Transaction, fenetre: SQL | undefined, filtre: SQL | undefined) {
    return tx
      .selectDistinct({
        id: seance.id,
        libelle: seance.libelle,
        debut: seance.debut,
        fin: seance.fin,
        distanciel: seance.distanciel,
        modifieeLe: seance.modifieeLe,
        salleId: seance.salleId,
        serieId: seance.serieId,
        etablissementSalle: salle.etablissementId,
        etablissementSerie: seanceSerie.etablissementId,
      })
      .from(seance)
      .leftJoin(
        seanceAttenduCalcule,
        and(
          eq(seanceAttenduCalcule.organisationId, seance.organisationId),
          eq(seanceAttenduCalcule.seanceId, seance.id),
        ),
      )
      .leftJoin(
        salle,
        and(eq(salle.organisationId, seance.organisationId), eq(salle.id, seance.salleId)),
      )
      .leftJoin(
        seanceSerie,
        and(
          eq(seanceSerie.organisationId, seance.organisationId),
          eq(seanceSerie.id, seance.serieId),
        ),
      )
      .where(
        and(
          isNull(seance.deletedAt),
          // RG-04-13 : les brouillons ne sont vus que de la pédagogie ; une séance annulée n'a pas d'appel.
          eq(seance.statut, 'publiee'),
          fenetre,
          filtre,
        ),
      )
      .orderBy(asc(seance.debut));
  }

  private async presenter(
    tx: Transaction,
    lignes: Awaited<ReturnType<SeancesService['lister']>>,
    maintenant: number,
  ): Promise<SeanceProche[]> {
    const noms = await this.intervenants(
      tx,
      lignes.map((l) => l.id),
    );
    const dureeBadge = await dureeBadgeModifie(tx, this.env);
    // RGPD-03 : l'apprenant est informé avant le scan quand sa position sera comparée au campus.
    // Une lecture par salle ou série distincte, pas par séance.
    const parLieu = new Map<string, Awaited<ReturnType<typeof etablissementDeSeance>>>();
    const controles = new Map<string, boolean>();
    for (const l of lignes) {
      const lieu = `${l.salleId ?? ''}|${l.serieId ?? ''}`;
      if (!parLieu.has(lieu)) parLieu.set(lieu, await etablissementDeSeance(tx, l));
      controles.set(l.id, perimetreAControler(l.distanciel, parLieu.get(lieu) ?? null) !== null);
    }
    return lignes.map((l) => ({
      id: l.id,
      libelle: l.libelle,
      debut: l.debut.toISOString(),
      fin: l.fin.toISOString(),
      distanciel: l.distanciel,
      intervenant: noms.get(l.id)?.join(', ') ?? null,
      modifiee: badgeModifie(l.modifieeLe, new Date(maintenant), dureeBadge),
      localisation: controles.get(l.id) ?? false,
    }));
  }

  /** RG-04-01 : noms des intervenants de chaque séance, par ordre alphabétique. */
  private async intervenants(tx: Transaction, seanceIds: readonly string[]) {
    const noms = new Map<string, string[]>();
    if (seanceIds.length === 0) return noms;
    const lignes = await tx
      .select({
        seanceId: seanceIntervenant.seanceId,
        prenom: personne.prenom,
        nom: personne.nom,
      })
      .from(seanceIntervenant)
      .innerJoin(
        personne,
        and(
          eq(personne.organisationId, seanceIntervenant.organisationId),
          eq(personne.id, seanceIntervenant.personneId),
        ),
      )
      .where(
        and(
          inArray(seanceIntervenant.seanceId, [...seanceIds]),
          isNull(seanceIntervenant.deletedAt),
        ),
      )
      .orderBy(asc(personne.nom), asc(personne.prenom));
    for (const l of lignes)
      noms.set(l.seanceId, [...(noms.get(l.seanceId) ?? []), `${l.prenom} ${l.nom}`]);
    return noms;
  }

  /**
   * US-06-01 : séances du jour de l'intervenant (toutes celles de l'école avec un périmètre
   * « toute l'école »), terminées comprises, le jour s'entendant dans le fuseau de l'établissement
   * de la séance (salle, sinon série, sinon premier établissement de l'école).
   */
  async aAnimer(tx: Transaction, access: Access): Promise<SeanceProche[]> {
    const ecole = (access.perimetres.get('emargement:animer') ?? []).some(
      (p) => p.type === 'organisation',
    );
    const maintenant = Date.now();
    // Un jour local contient l'instant présent : ses séances débutent à moins de 24 h de lui.
    const lignes = await this.lister(
      tx,
      and(
        gt(seance.debut, new Date(maintenant - 24 * HEURE)),
        lt(seance.debut, new Date(maintenant + 24 * HEURE)),
      ),
      ecole ? undefined : inArray(seance.id, seancesDe(tx, access.personneId)),
    );
    const campus = await tx
      .select({ id: etablissement.id, fuseau: etablissement.fuseauHoraire })
      .from(etablissement)
      .orderBy(asc(etablissement.createdAt));
    const fuseaux = new Map(campus.map((c) => [c.id, c.fuseau]));
    const parDefaut = campus[0]?.fuseau ?? FUSEAU_PAR_DEFAUT;
    const duJour = lignes.filter((l) => {
      const fuseau = fuseaux.get(l.etablissementSalle ?? l.etablissementSerie ?? '') ?? parDefaut;
      return jourLocal(l.debut, fuseau) === jourLocal(new Date(maintenant), fuseau);
    });
    return this.presenter(tx, duJour, maintenant);
  }

  /** Pour l'apprenant : les séances où il est attendu, en cours ou dans les 12 heures. */
  async aEmarger(tx: Transaction, access: Access): Promise<SeanceProche[]> {
    const maintenant = Date.now();
    const lignes = await this.lister(
      tx,
      and(
        gt(seance.fin, new Date(maintenant - HEURE)),
        lt(seance.debut, new Date(maintenant + 12 * HEURE)),
      ),
      eq(seanceAttenduCalcule.personneId, access.personneId),
    );
    return this.presenter(tx, lignes, maintenant);
  }
}

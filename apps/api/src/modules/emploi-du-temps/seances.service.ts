import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  commandesRetraitSeance,
  type AnnulationSeance,
  type ApercuSerie,
  type ModificationSeance,
  type Permission,
  type PlageEdt,
  type PublicationSeances,
  type RemplacementIntervenant,
  type ReportSeance,
  type RechercheSemaine,
  type ResultatSeances,
  type ResultatVerification,
  type SaisieSeance,
  type SaisieSerie,
  type Seance,
  type SemaineEdt,
  type SerieCreee,
  type VerificationSeance,
  EVENEMENT_CHANGEMENT_EDT,
  type ChargeChangementEdt,
} from '@scolaly/contracts';
import {
  ajouterEvenement,
  enregistrerAudit,
  etablissement,
  groupeEleves,
  groupePromotion,
  maquetteModule,
  newId,
  personne,
  presence,
  promotion,
  salle,
  seance,
  seanceForcage,
  seanceIntervenant,
  seancePublic,
  seanceSerie,
  type Transaction,
} from '@scolaly/db';
import {
  badgeModifie,
  changementSignificatif,
  conflitsBloquants,
  creneauxLibres,
  detecterConflits,
  instantLocal,
  occurrencesSerie,
  PAS_GRILLE_MINUTES,
  remplacerIntervenant,
  sallesLibres,
  seancesConcernees,
  verifierAnnulationSeance,
  verifierForcage,
  verifierReport,
  verifierSerie,
  type Conflit,
  type ContexteConflits,
  type Forcage,
  type RefusRemplacement,
  type RefusReport,
  type RefusSerie,
  type SeancePlanifiee,
} from '@scolaly/domain';
import { and, count, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Access } from '../../access/access-resolver.js';
import { plageEdt } from '../../shared/plage-edt.js';
import type { Env } from '../../config/env.js';
import { dureeBadgeModifie } from '../../shared/badge-modifie.js';
import { ENV, VALKEY } from '../../shared/tokens.js';
import { promotionsCouvertes } from '../scolarite/index.js';
import {
  ContexteService,
  joursEntre,
  versPlanifiee,
  type LigneSeance,
} from './contexte.service.js';
import { GrilleService } from './grille.service.js';

const LECTURE: readonly Permission[] = ['edt:lire', 'edt:gerer'];
const JOUR_MS = 86_400_000;
/** RG-04-07 : créneaux recherchés jusqu'à une semaine avant et après la séance. */
const JOURS_RECHERCHE = 7;
const CRENEAUX_PROPOSES = 5;

const REFUS_SERIE: Record<RefusSerie, [string, string]> = {
  'dates-serie': ['dateFin', 'La fin de la série doit être postérieure ou égale à son début.'],
  'duree-serie': [
    'dateFin',
    'Une série couvre au plus une année. Découpez-la en plusieurs séries.',
  ],
  'jours-semaine': ['joursSemaine', 'Choisissez au moins un jour de la semaine, sans doublon.'],
  intervalle: ['intervalleSemaines', 'L’intervalle va de 1 à 52 semaines.'],
  heures: ['heureFin', 'L’heure de fin doit suivre l’heure de début.'],
  'pas-grille': ['heureDebut', 'Les heures suivent le pas de la grille (15 minutes).'],
  fuseau: ['etablissementId', 'Le fuseau horaire de l’établissement est invalide.'],
};

const REFUS_REPORT: Record<RefusReport, () => Error> = {
  'motif-requis': () => invalide('motif', 'Donnez le motif du report.'),
  'non-publiee': () =>
    new ConflictException(
      'Seule une séance publiée se reporte. Un brouillon se déplace directement dans la grille.',
    ),
  'appel-fait': () =>
    new ConflictException(
      'L’appel de cette séance est déjà fait : elle ne se reporte plus. Annulez-la puis créez une nouvelle séance ; ses présences sont conservées.',
    ),
  horaire: () => invalide('fin', 'La fin de la nouvelle séance doit suivre son début.'),
  'meme-creneau': () => invalide('debut', 'Choisissez un créneau différent du créneau actuel.'),
  passe: () => invalide('debut', 'Le nouveau créneau doit être à venir.'),
};

const REFUS_REMPLACEMENT: Record<RefusRemplacement, [string, string]> = {
  identique: ['nouveauId', 'Choisissez un intervenant différent de celui à remplacer.'],
  absent: ['ancienId', 'Cet intervenant n’anime pas cette séance.'],
  'deja-present': ['nouveauId', 'Cet intervenant anime déjà cette séance.'],
};

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

export interface ContenuValide {
  etablissementId: string;
  fuseau: string;
  /** RG-04-02 : plage horaire et jours ouvrés de l'établissement. */
  plage: PlageEdt;
  promotionIds: string[];
  groupeIds: string[];
  /** Promotions couvertes par le public (celles des groupes comprises). */
  promotions: string[];
  /** RG-04-01 : intervenants, sans doublon, triés. */
  intervenantIds: string[];
  libelle: string;
}

type Contenu = Pick<
  SaisieSeance,
  'moduleId' | 'activite' | 'promotionIds' | 'groupeIds' | 'salleId' | 'intervenantIds'
>;

/**
 * Emploi du temps (module 04) : séances unitaires et séries (US-04-01, US-04-02), conflits et
 * solutions (US-04-03, RG-04-05 à RG-04-07), brouillon et publication (US-04-06, RG-04-13).
 * Seconde barrière : une séance est visible si l'une de ses promotions est dans le périmètre,
 * modifiable si toutes le sont.
 */
@Injectable()
export class SeancesService {
  private readonly logger = new Logger(SeancesService.name);

  constructor(
    private readonly contexte: ContexteService,
    private readonly grille: GrilleService,
    @Inject(VALKEY) private readonly valkey: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * RG-04-14 : publication ou changement significatif de séances publiées, signalé aux personnes
   * concernées par le worker (boîte d'envoi : l'événement part avec la transaction ou pas du tout).
   */
  private async signaler(tx: Transaction, charge: ChargeChangementEdt): Promise<void> {
    if (charge.seanceIds.length === 0) return;
    await ajouterEvenement(tx, EVENEMENT_CHANGEMENT_EDT, charge);
  }

  // ——— Lecture ———

  async semaine(tx: Transaction, access: Access, recherche: RechercheSemaine): Promise<SemaineEdt> {
    const campus = await this.etablissement(tx, recherche.etablissementId);
    const fin = new Date(Date.parse(`${recherche.debut}T00:00:00Z`) + 6 * JOUR_MS)
      .toISOString()
      .slice(0, 10);
    const debutFenetre = instantLocal(recherche.debut, '00:00', campus.fuseauHoraire);
    const finFenetre = new Date(
      instantLocal(fin, '00:00', campus.fuseauHoraire).getTime() + JOUR_MS,
    );
    const lignes = await this.contexte.seances(
      tx,
      and(lt(seance.debut, finFenetre), gt(seance.fin, debutFenetre)),
    );
    const promotionsDe = await this.promotionsDesSeances(tx, lignes);
    const lecture = await promotionsCouvertes(tx, access, LECTURE);
    const retenues = lignes.filter((l) => {
      const promos = promotionsDe.get(l.id) ?? [];
      return (
        promos.some((p) => p.etablissementId === campus.id) &&
        (lecture === null || promos.some((p) => lecture.has(p.id))) &&
        (!recherche.promotionId || promos.some((p) => p.id === recherche.promotionId)) &&
        (!recherche.groupeId || l.groupeIds.includes(recherche.groupeId)) &&
        (!recherche.salleId || l.salleId === recherche.salleId) &&
        (!recherche.intervenantId || l.intervenantIds.includes(recherche.intervenantId))
      );
    });
    const gestion = await this.gestion(tx, access);
    return {
      debut: recherche.debut,
      fin,
      fuseau: campus.fuseauHoraire,
      plage: plageEdt(campus),
      seances: await this.versContrats(tx, access, retenues, {
        etablissementId: campus.id,
        fuseau: campus.fuseauHoraire,
      }),
      creation: gestion !== false,
      ...(await this.grille.fond(tx, {
        etablissementId: campus.id,
        debut: recherche.debut,
        fin,
        debutFenetre,
        finFenetre,
        recherche,
        lecture,
        gestion,
      })),
    };
  }

  // ——— Contrôle et solutions ———

  async verifier(
    tx: Transaction,
    access: Access,
    v: VerificationSeance,
  ): Promise<ResultatVerification> {
    const contenu = await this.validerContenu(tx, access, v);
    const candidate: SeancePlanifiee = {
      id: v.id ?? newId(),
      debut: new Date(v.debut),
      fin: new Date(v.fin),
      statut: 'brouillon',
      type: v.type,
      moduleId: v.moduleId,
      salleId: v.salleId,
      intervenantIds: contenu.intervenantIds,
      groupeIds: [...contenu.promotionIds, ...contenu.groupeIds],
    };
    if (candidate.fin <= candidate.debut) throw invalide('fin', 'La fin doit suivre le début.');
    const marge = JOURS_RECHERCHE * JOUR_MS + JOUR_MS;
    const ctx = await this.contexte.charger(tx, {
      etablissementId: contenu.etablissementId,
      fuseau: contenu.fuseau,
      debut: new Date(candidate.debut.getTime() - marge),
      fin: new Date(candidate.fin.getTime() + marge),
      moduleIds: v.moduleId ? [v.moduleId] : [],
      publicIds: candidate.groupeIds,
      intervenantIds: candidate.intervenantIds,
    });
    const conflits = detecterConflits(candidate, ctx);
    const codes = new Set(conflits.map((c) => c.code));
    const salles =
      codes.has('salle-occupee') || codes.has('capacite-salle')
        ? sallesLibres(candidate, ctx, {
            ...(v.typeSalle ? { type: v.typeSalle } : {}),
            equipements: v.equipements,
          })
        : [];
    const noms = await this.nomsSalles(
      tx,
      salles.map((s) => s.id),
    );
    const creneaux =
      codes.has('intervenant-occupe') || codes.has('groupe-occupe')
        ? creneauxLibres(candidate, ctx, {
            plageDebut: v.plageDebut ?? contenu.plage.debut,
            plageFin: v.plageFin ?? contenu.plage.fin,
            joursOuverts: v.joursOuverts ?? contenu.plage.joursOuvres,
            joursRecherche: JOURS_RECHERCHE,
            nombre: CRENEAUX_PROPOSES,
            apres: new Date(),
          })
        : [];
    return {
      conflits,
      sallesLibres: salles.map((s) => ({
        id: s.id,
        nom: noms.get(s.id) ?? '',
        capacite: s.capacite ?? 0,
        type: s.type,
      })),
      creneauxLibres: creneaux.map((c) => ({
        debut: c.debut.toISOString(),
        fin: c.fin.toISOString(),
      })),
    };
  }

  // ——— Séance unitaire ———

  async creer(
    tx: Transaction,
    access: Access,
    saisie: SaisieSeance,
    adresseIp: string,
  ): Promise<Seance> {
    const contenu = await this.validerContenu(tx, access, saisie);
    const debut = new Date(saisie.debut);
    const fin = new Date(saisie.fin);
    this.validerHoraire(debut, fin);
    const id = newId();
    await tx.insert(seance).values({
      id,
      organisationId: access.organisationId,
      libelle: contenu.libelle,
      debut,
      fin,
      statut: 'brouillon',
      type: saisie.type,
      moduleId: saisie.moduleId,
      activite: saisie.moduleId ? null : saisie.activite,
      salleId: saisie.salleId,
      intervenantId: contenu.intervenantIds[0] ?? null,
      lienVisio: saisie.lienVisio,
      distanciel: saisie.distanciel,
      createdBy: access.userId,
    });
    await this.ecrirePublic(tx, access, id, contenu);
    await this.ecrireIntervenants(tx, access, id, [], contenu.intervenantIds);
    const [ligne] = await this.contexte.seances(tx, eq(seance.id, id));
    if (!ligne) throw new Error('Création de la séance impossible.');
    const ctx = await this.contexteDe(tx, [ligne], contenu);
    await this.forcer(tx, access, ligne, contenu, ctx, saisie.forcages, adresseIp);
    const [resultat] = await this.versContrats(tx, access, [ligne], contenu, ctx);
    await enregistrerAudit(tx, {
      action: 'seance.creer',
      objetType: 'seance',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      apres: resultat,
    });
    return resultat as Seance;
  }

  /**
   * Brouillon enregistré et tracé sans calcul de ses conflits, pour un import en lot (US-04-04) :
   * les conflits du lot se calculent ensuite une seule fois (contrats). Le cache évite de
   * revalider un même contenu (public, module, salle, intervenants) d'une ligne à l'autre.
   */
  async creerBrouillon(
    tx: Transaction,
    access: Access,
    saisie: SaisieSeance,
    adresseIp: string,
    cache: Map<string, ContenuValide>,
  ): Promise<string> {
    const cle = JSON.stringify([
      saisie.moduleId,
      saisie.activite,
      saisie.promotionIds,
      saisie.groupeIds,
      saisie.salleId,
      saisie.intervenantIds,
    ]);
    const contenu = cache.get(cle) ?? (await this.validerContenu(tx, access, saisie));
    cache.set(cle, contenu);
    const debut = new Date(saisie.debut);
    const fin = new Date(saisie.fin);
    this.validerHoraire(debut, fin);
    const id = newId();
    const valeurs = {
      id,
      organisationId: access.organisationId,
      libelle: contenu.libelle,
      debut,
      fin,
      statut: 'brouillon' as const,
      type: saisie.type,
      moduleId: saisie.moduleId,
      activite: saisie.moduleId ? null : saisie.activite,
      salleId: saisie.salleId,
      intervenantId: contenu.intervenantIds[0] ?? null,
      lienVisio: saisie.lienVisio,
      distanciel: saisie.distanciel,
      createdBy: access.userId,
    };
    await tx.insert(seance).values(valeurs);
    await this.ecrirePublic(tx, access, id, contenu);
    await this.ecrireIntervenants(tx, access, id, [], contenu.intervenantIds);
    await enregistrerAudit(tx, {
      action: 'seance.creer',
      objetType: 'seance',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      apres: {
        ...valeurs,
        promotionIds: contenu.promotionIds,
        groupeIds: contenu.groupeIds,
        intervenantIds: contenu.intervenantIds,
      },
    });
    return id;
  }

  /** Contrats de séances d'un établissement, conflits calculés en une fois (import en lot). */
  async contrats(
    tx: Transaction,
    access: Access,
    ids: readonly string[],
    lieu: { etablissementId: string; fuseau: string },
  ): Promise<Seance[]> {
    if (ids.length === 0) return [];
    const lignes = await this.contexte.seances(tx, inArray(seance.id, [...ids]));
    return this.versContrats(tx, access, lignes, lieu);
  }

  async modifier(
    tx: Transaction,
    access: Access,
    id: string,
    m: ModificationSeance,
    adresseIp: string,
  ): Promise<ResultatSeances> {
    const cible = await this.seanceGeree(tx, access, id);
    if (m.portee !== 'seance' && (m.debut !== undefined || m.fin !== undefined))
      throw invalide(
        'portee',
        'Le début et la fin ne se changent que pour une seule séance. Pour décaler la série, annulez-la et recréez-la.',
      );
    if (m.portee !== 'seance' && m.forcages.length > 0)
      throw invalide('forcages', 'Un conflit se force séance par séance.');
    const concernees = await this.concernees(tx, access, cible, m.portee);
    const avant = await this.versContrats(tx, access, concernees, null);
    let contenu: ContenuValide | null = null;
    const maintenant = new Date();
    const aRetirer: string[] = [];
    const signalees: string[] = [];
    const retraits: ChargeChangementEdt['retraits'] = [];
    for (const l of concernees) {
      const moduleId = m.moduleId !== undefined ? m.moduleId : l.moduleId;
      const activite =
        m.activite !== undefined ? m.activite : m.moduleId ? null : (l.activite ?? null);
      if ((moduleId === null) === (activite === null))
        throw invalide('moduleId', 'Choisissez un module, ou décrivez une activité hors maquette.');
      contenu = await this.validerContenu(tx, access, {
        moduleId,
        activite,
        promotionIds: m.promotionIds ?? l.promotionIds,
        groupeIds: m.groupeIds ?? l.groupeIds,
        salleId: m.salleId !== undefined ? m.salleId : l.salleId,
        intervenantIds: m.intervenantIds ?? l.intervenantIds,
      });
      const debut = m.debut ? new Date(m.debut) : l.debut;
      const fin = m.fin ? new Date(m.fin) : l.fin;
      const salleId = m.salleId !== undefined ? m.salleId : l.salleId;
      if (debut.getTime() !== l.debut.getTime() || fin.getTime() !== l.fin.getTime()) {
        this.validerHoraire(debut, fin);
        await this.exigerSansAppel(tx, l.id);
      }
      // L'émargement relit la séance si son horaire ou son public change.
      if (
        debut.getTime() !== l.debut.getTime() ||
        fin.getTime() !== l.fin.getTime() ||
        m.promotionIds !== undefined ||
        m.groupeIds !== undefined
      )
        aRetirer.push(l.id);
      const significatif = changementSignificatif(l, {
        statut: l.statut,
        debut,
        fin,
        salleId,
        intervenantIds: contenu.intervenantIds,
      });
      if (significatif) {
        signalees.push(l.id);
        for (const personneId of l.intervenantIds)
          if (!contenu.intervenantIds.includes(personneId))
            retraits.push({ seanceId: l.id, personneId });
      }
      await tx
        .update(seance)
        .set({
          libelle: contenu.libelle,
          debut,
          fin,
          type: m.type ?? l.type,
          moduleId,
          activite: moduleId ? null : activite,
          salleId,
          intervenantId: contenu.intervenantIds[0] ?? null,
          lienVisio: m.lienVisio !== undefined ? m.lienVisio : l.lienVisio,
          distanciel: m.distanciel ?? l.distanciel,
          modifieeLe: significatif ? maintenant : l.modifieeLe,
          updatedBy: access.userId,
        })
        .where(eq(seance.id, l.id));
      if (m.promotionIds !== undefined || m.groupeIds !== undefined) {
        await tx
          .update(seancePublic)
          .set({ deletedAt: new Date(), updatedBy: access.userId })
          .where(and(eq(seancePublic.seanceId, l.id), isNull(seancePublic.deletedAt)));
        await this.ecrirePublic(tx, access, l.id, contenu);
      }
      if (m.intervenantIds !== undefined)
        await this.ecrireIntervenants(tx, access, l.id, l.intervenantIds, contenu.intervenantIds);
    }
    const apres = await this.contexte.seances(
      tx,
      inArray(
        seance.id,
        concernees.map((l) => l.id),
      ),
    );
    if (!contenu) throw new NotFoundException('Séance introuvable.');
    const ctx = await this.contexteDe(tx, apres, contenu);
    const nouvelle = apres.find((l) => l.id === cible.id);
    if (nouvelle) await this.forcer(tx, access, nouvelle, contenu, ctx, m.forcages, adresseIp);
    const resultat = await this.versContrats(tx, access, apres, contenu, ctx);
    // RG-04-06 : une séance publiée reste publiable ; sinon on la garde telle quelle.
    this.exigerPubliables(resultat.filter((s) => s.statut === 'publiee'));
    await this.retirerDuCache(aRetirer);
    await this.signaler(tx, { nature: 'modification', seanceIds: signalees, retraits });
    for (const s of resultat) {
      await enregistrerAudit(tx, {
        action: 'seance.modifier',
        objetType: 'seance',
        objetId: s.id,
        auteurId: access.userId,
        adresseIp,
        avant: avant.find((a) => a.id === s.id) ?? null,
        apres: s,
      });
    }
    return { seances: resultat };
  }

  /** RG-04-04 : annulation motivée, les présences et notes sont conservées. */
  async annuler(
    tx: Transaction,
    access: Access,
    id: string,
    a: AnnulationSeance,
    adresseIp: string,
  ): Promise<ResultatSeances> {
    const verdict = verifierAnnulationSeance(a.motif);
    if (!verdict.ok) throw invalide('motif', 'Donnez le motif de l’annulation.');
    const cible = await this.seanceGeree(tx, access, id);
    const concernees = await this.concernees(tx, access, cible, a.portee);
    const avant = await this.versContrats(tx, access, concernees, null);
    const maintenant = new Date();
    await this.signaler(tx, {
      nature: 'annulation',
      seanceIds: concernees.filter((l) => l.statut === 'publiee').map((l) => l.id),
      retraits: [],
    });
    for (const publiees of [true, false]) {
      const ids = concernees.filter((l) => (l.statut === 'publiee') === publiees).map((l) => l.id);
      if (ids.length === 0) continue;
      await tx
        .update(seance)
        .set({
          statut: 'annulee',
          motifAnnulation: a.motif,
          // RG-04-14 : seule l'annulation d'une séance publiée est un changement à signaler.
          ...(publiees ? { modifieeLe: maintenant } : {}),
          updatedBy: access.userId,
        })
        .where(inArray(seance.id, ids));
    }
    await this.retirerDuCache(concernees.map((l) => l.id));
    const apres = await this.versContrats(
      tx,
      access,
      await this.contexte.seances(
        tx,
        inArray(
          seance.id,
          concernees.map((l) => l.id),
        ),
      ),
      null,
    );
    for (const s of apres) {
      await enregistrerAudit(tx, {
        action: 'seance.annuler',
        objetType: 'seance',
        objetId: s.id,
        auteurId: access.userId,
        adresseIp,
        avant: avant.find((x) => x.id === s.id) ?? null,
        apres: s,
      });
    }
    return { seances: apres };
  }

  /**
   * US-04-11 : report d'une séance publiée. Une séance de remplacement, publiée, est créée sur le
   * nouveau créneau (même contenu, salle au choix), contrôlée comme une publication (RG-04-06) ;
   * la séance d'origine passe « reportée », avec son motif et le lien vers la nouvelle.
   */
  async reporter(
    tx: Transaction,
    access: Access,
    id: string,
    r: ReportSeance,
    adresseIp: string,
  ): Promise<ResultatSeances> {
    const cible = await this.seanceGeree(tx, access, id);
    const nouveau = { debut: new Date(r.debut), fin: new Date(r.fin) };
    const [usage] = await tx
      .select({ n: count() })
      .from(presence)
      .where(and(eq(presence.seanceId, id), isNull(presence.deletedAt)));
    const verdict = verifierReport({
      motif: r.motif,
      statut: cible.statut,
      presences: usage?.n ?? 0,
      ancien: cible,
      nouveau,
      maintenant: new Date(),
    });
    if (!verdict.ok) throw REFUS_REPORT[verdict.refus]();
    this.validerHoraire(nouveau.debut, nouveau.fin);
    const salleId = r.salleId !== undefined ? r.salleId : cible.salleId;
    const contenu = await this.validerContenu(tx, access, { ...cible, salleId });
    const [avant] = await this.versContrats(tx, access, [cible], null);
    const nouvelId = newId();
    const maintenant = new Date();
    await tx.insert(seance).values({
      id: nouvelId,
      organisationId: access.organisationId,
      libelle: contenu.libelle,
      debut: nouveau.debut,
      fin: nouveau.fin,
      statut: 'publiee',
      type: cible.type,
      moduleId: cible.moduleId,
      activite: cible.activite,
      salleId,
      intervenantId: contenu.intervenantIds[0] ?? null,
      lienVisio: cible.lienVisio,
      distanciel: cible.distanciel,
      modifieeLe: maintenant,
      createdBy: access.userId,
    });
    await this.ecrirePublic(tx, access, nouvelId, contenu);
    await this.ecrireIntervenants(tx, access, nouvelId, [], contenu.intervenantIds);
    await tx
      .update(seance)
      .set({
        statut: 'reportee',
        motifAnnulation: r.motif,
        reporteeVersId: nouvelId,
        modifieeLe: maintenant,
        updatedBy: access.userId,
      })
      .where(eq(seance.id, id));
    const lignes = await this.contexte.seances(tx, inArray(seance.id, [id, nouvelId]));
    const nouvelle = lignes.find((l) => l.id === nouvelId);
    if (!nouvelle) throw new Error('Report de la séance impossible.');
    const ctx = await this.contexteDe(tx, [nouvelle], contenu);
    await this.forcer(tx, access, nouvelle, contenu, ctx, r.forcages, adresseIp);
    const seances = await this.versContrats(tx, access, lignes, contenu, ctx);
    this.exigerPubliables(seances.filter((s) => s.id === nouvelId));
    await this.retirerDuCache([id]);
    await this.signaler(tx, { nature: 'report', seanceIds: [id], retraits: [] });
    await enregistrerAudit(tx, {
      action: 'seance.reporter',
      objetType: 'seance',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: avant ?? null,
      apres: {
        seance: seances.find((s) => s.id === id),
        remplacement: seances.find((s) => s.id === nouvelId),
      },
    });
    return { seances };
  }

  /**
   * US-04-11 : remplacement d'un intervenant par un autre, sur la séance, les suivantes ou toute
   * la série ; les séances de la portée qu'il n'anime pas restent telles quelles. Une séance
   * publiée doit rester sans conflit bloquant (le remplaçant doit être libre).
   */
  async remplacer(
    tx: Transaction,
    access: Access,
    id: string,
    r: RemplacementIntervenant,
    adresseIp: string,
  ): Promise<ResultatSeances> {
    const cible = await this.seanceGeree(tx, access, id);
    const verdict = remplacerIntervenant(cible.intervenantIds, r.ancienId, r.nouveauId);
    if (!verdict.ok) throw invalide(...REFUS_REMPLACEMENT[verdict.refus]);
    const concernees = (await this.concernees(tx, access, cible, r.portee)).filter(
      (l) => remplacerIntervenant(l.intervenantIds, r.ancienId, r.nouveauId).ok,
    );
    const avant = await this.versContrats(tx, access, concernees, null);
    const maintenant = new Date();
    let contenu: ContenuValide | null = null;
    for (const l of concernees) {
      const v = remplacerIntervenant(l.intervenantIds, r.ancienId, r.nouveauId);
      if (!v.ok) continue;
      contenu = await this.validerContenu(tx, access, { ...l, intervenantIds: v.intervenantIds });
      await tx
        .update(seance)
        .set({
          intervenantId: v.intervenantIds[0] ?? null,
          modifieeLe: l.statut === 'publiee' ? maintenant : l.modifieeLe,
          updatedBy: access.userId,
        })
        .where(eq(seance.id, l.id));
      await this.ecrireIntervenants(tx, access, l.id, l.intervenantIds, v.intervenantIds);
    }
    if (!contenu) throw new NotFoundException('Séance introuvable.');
    const apres = await this.contexte.seances(
      tx,
      inArray(
        seance.id,
        concernees.map((l) => l.id),
      ),
    );
    const resultat = await this.versContrats(tx, access, apres, contenu);
    this.exigerPubliables(resultat.filter((s) => s.statut === 'publiee'));
    const publiees = concernees.filter((l) => l.statut === 'publiee').map((l) => l.id);
    await this.signaler(tx, {
      nature: 'modification',
      seanceIds: publiees,
      retraits: publiees.map((seanceId) => ({ seanceId, personneId: r.ancienId })),
    });
    for (const s of resultat) {
      await enregistrerAudit(tx, {
        action: 'seance.remplacer-intervenant',
        objetType: 'seance',
        objetId: s.id,
        auteurId: access.userId,
        adresseIp,
        avant: avant.find((a) => a.id === s.id) ?? null,
        apres: s,
      });
    }
    return { seances: resultat };
  }

  /** RG-04-06, RG-04-13 : tout ou rien ; un conflit bloquant non forcé empêche la publication. */
  async publier(
    tx: Transaction,
    access: Access,
    p: PublicationSeances,
    adresseIp: string,
  ): Promise<ResultatSeances> {
    const ids = [...new Set(p.seanceIds)];
    const lignes = await this.contexte.seances(tx, inArray(seance.id, ids));
    if (lignes.length !== ids.length) throw new NotFoundException('Séance introuvable.');
    const promotionsDe = await this.promotionsDesSeances(tx, lignes);
    const gestion = await this.gestion(tx, access);
    for (const l of lignes) {
      if (!this.couvre(gestion, promotionsDe.get(l.id) ?? []))
        throw new ForbiddenException('Vous ne publiez que les séances de votre périmètre.');
      if (l.statut === 'annulee' || l.statut === 'reportee')
        throw new ConflictException(
          'Une séance annulée ou reportée ne se publie pas. Retirez-la de la sélection.',
        );
    }
    const etablissements = new Set(
      [...promotionsDe.values()].flatMap((ps) => ps.map((x) => x.etablissementId)),
    );
    const resultat: Seance[] = [];
    for (const etablissementId of etablissements) {
      const campus = await this.etablissement(tx, etablissementId);
      const siennes = lignes.filter((l) =>
        (promotionsDe.get(l.id) ?? []).some((x) => x.etablissementId === etablissementId),
      );
      const contenu = { etablissementId, fuseau: campus.fuseauHoraire };
      const ctx = await this.contexteDe(tx, siennes, contenu);
      const contrats = await this.versContrats(tx, access, siennes, contenu, ctx);
      this.exigerPubliables(contrats);
      resultat.push(...contrats.filter((c) => !resultat.some((r) => r.id === c.id)));
    }
    const aPublier = lignes.filter((l) => l.statut === 'brouillon').map((l) => l.id);
    if (aPublier.length > 0)
      await tx
        .update(seance)
        .set({ statut: 'publiee', updatedBy: access.userId })
        .where(inArray(seance.id, aPublier));
    await this.signaler(tx, { nature: 'publication', seanceIds: aPublier, retraits: [] });
    for (const id of aPublier) {
      await enregistrerAudit(tx, {
        action: 'seance.publier',
        objetType: 'seance',
        objetId: id,
        auteurId: access.userId,
        adresseIp,
        avant: { statut: 'brouillon' },
        apres: { statut: 'publiee' },
      });
    }
    return {
      seances: resultat.map((s) => (aPublier.includes(s.id) ? { ...s, statut: 'publiee' } : s)),
    };
  }

  // ——— Séries ———

  async apercuSerie(tx: Transaction, access: Access, saisie: SaisieSerie): Promise<ApercuSerie> {
    const { apercu } = await this.calculerSerie(tx, access, saisie);
    return {
      occurrences: apercu.occurrences.map((o) => ({
        jour: o.jour,
        debut: o.debut.toISOString(),
        fin: o.fin.toISOString(),
      })),
      sautees: apercu.sautees,
    };
  }

  async creerSerie(
    tx: Transaction,
    access: Access,
    saisie: SaisieSerie,
    adresseIp: string,
  ): Promise<SerieCreee> {
    const { contenu, apercu } = await this.calculerSerie(tx, access, saisie);
    if (apercu.occurrences.length === 0)
      throw invalide('joursSemaine', 'Aucune séance : tous les jours de la série sont sautés.');
    const serieId = newId();
    await tx.insert(seanceSerie).values({
      id: serieId,
      organisationId: access.organisationId,
      etablissementId: contenu.etablissementId,
      dateDebut: saisie.dateDebut,
      dateFin: saisie.dateFin,
      joursSemaine: saisie.joursSemaine,
      intervalleSemaines: saisie.intervalleSemaines,
      heureDebut: saisie.heureDebut,
      heureFin: saisie.heureFin,
      sauterJoursEntreprise: saisie.sauterJoursEntreprise,
      joursExclus: saisie.joursExclus,
      createdBy: access.userId,
    });
    const ids = apercu.occurrences.map(() => newId());
    await tx.insert(seance).values(
      apercu.occurrences.map((o, i) => ({
        id: ids[i] ?? newId(),
        organisationId: access.organisationId,
        libelle: contenu.libelle,
        debut: o.debut,
        fin: o.fin,
        statut: 'brouillon' as const,
        type: saisie.type,
        moduleId: saisie.moduleId,
        activite: saisie.moduleId ? null : saisie.activite,
        salleId: saisie.salleId,
        intervenantId: contenu.intervenantIds[0] ?? null,
        lienVisio: saisie.lienVisio,
        distanciel: saisie.distanciel,
        serieId,
        createdBy: access.userId,
      })),
    );
    for (const id of ids) {
      await this.ecrirePublic(tx, access, id, contenu);
      await this.ecrireIntervenants(tx, access, id, [], contenu.intervenantIds);
    }
    const lignes = await this.contexte.seances(tx, eq(seance.serieId, serieId));
    const seances = await this.versContrats(tx, access, lignes, contenu);
    await enregistrerAudit(tx, {
      action: 'seance.serie.creer',
      objetType: 'seance_serie',
      objetId: serieId,
      auteurId: access.userId,
      adresseIp,
      apres: { ...saisie, seanceIds: ids, sautees: apercu.sautees },
    });
    return { serieId, seances, sautees: apercu.sautees };
  }

  private async calculerSerie(tx: Transaction, access: Access, saisie: SaisieSerie) {
    const contenu = await this.validerContenu(tx, access, saisie);
    const regle = { ...saisie, fuseau: contenu.fuseau };
    const verdict = verifierSerie(regle);
    if (!verdict.ok) throw invalide(...REFUS_SERIE[verdict.refus]);
    const fermetures = await this.contexte.fermetures(
      tx,
      contenu.etablissementId,
      saisie.dateDebut,
      saisie.dateFin,
    );
    let joursEntreprise: string[] = [];
    if (saisie.sauterJoursEntreprise) {
      const { apprenantsParGroupe, inscriptions } = await this.contexte.apprenants(
        tx,
        [...contenu.promotionIds, ...contenu.groupeIds],
        saisie.dateDebut,
        saisie.dateFin,
      );
      const apprenants = new Set(Object.values(apprenantsParGroupe).flat());
      const parApprenant = await this.contexte.joursEntreprise(
        tx,
        inscriptions,
        saisie.dateDebut,
        saisie.dateFin,
      );
      // Un jour est sauté quand tout le public est en entreprise ; sinon il reste, signalé.
      joursEntreprise =
        apprenants.size === 0
          ? []
          : joursEntre(saisie.dateDebut, saisie.dateFin).filter((j) =>
              [...apprenants].every((a) => parApprenant[a]?.includes(j)),
            );
    }
    const apercu = occurrencesSerie(regle, {
      fermetures,
      joursEntreprise,
      joursExclus: saisie.joursExclus,
    });
    return { contenu, apercu };
  }

  // ——— Outils ———

  async etablissement(tx: Transaction, id: string) {
    const [campus] = await tx
      .select()
      .from(etablissement)
      .where(and(eq(etablissement.id, id), isNull(etablissement.deletedAt)));
    if (!campus) throw new NotFoundException('Établissement introuvable.');
    return campus;
  }

  /** Promotions gérées : null pour toute l'école, false sans droit de gestion. */
  async gestion(tx: Transaction, access: Access): Promise<Set<string> | null | false> {
    if (!access.permissions.has('edt:gerer')) return false;
    const couvertes = await promotionsCouvertes(tx, access, ['edt:gerer']);
    return couvertes !== null && couvertes.size === 0 ? false : couvertes;
  }

  couvre(gestion: Set<string> | null | false, promotions: readonly { id: string }[]) {
    if (gestion === false || promotions.length === 0) return false;
    return gestion === null || promotions.every((p) => gestion.has(p.id));
  }

  /** Promotions et établissement de chaque séance, d'après son public (groupes compris). */
  async promotionsDesSeances(tx: Transaction, lignes: readonly LigneSeance[]) {
    const groupeIds = [...new Set(lignes.flatMap((l) => l.groupeIds))];
    const liens =
      groupeIds.length === 0
        ? []
        : await tx
            .select()
            .from(groupePromotion)
            .where(
              and(inArray(groupePromotion.groupeId, groupeIds), isNull(groupePromotion.deletedAt)),
            );
    const parSeance = new Map<string, string[]>();
    for (const l of lignes)
      parSeance.set(l.id, [
        ...new Set([
          ...l.promotionIds,
          ...liens.filter((g) => l.groupeIds.includes(g.groupeId)).map((g) => g.promotionId),
        ]),
      ]);
    const ids = [...new Set([...parSeance.values()].flat())];
    const promos =
      ids.length === 0
        ? []
        : await tx
            .select({ id: promotion.id, etablissementId: promotion.etablissementId })
            .from(promotion)
            .where(inArray(promotion.id, ids));
    return new Map(
      [...parSeance].map(([id, pIds]) => [id, promos.filter((p) => pIds.includes(p.id))]),
    );
  }

  /**
   * RG-04-01 : public (promotions et groupes d'un même établissement, tous dans le périmètre de
   * gestion), module de la maquette suivie, salle ouverte du même établissement, intervenants.
   */
  private async validerContenu(
    tx: Transaction,
    access: Access,
    c: Contenu,
  ): Promise<ContenuValide> {
    const promotionIds = [...new Set(c.promotionIds)].sort();
    const groupeIds = [...new Set(c.groupeIds)].sort();
    if (promotionIds.length + groupeIds.length === 0)
      throw invalide('groupeIds', 'Choisissez au moins une promotion ou un groupe.');
    if (groupeIds.length > 0) {
      const groupes = await tx
        .select({ id: groupeEleves.id })
        .from(groupeEleves)
        .where(and(inArray(groupeEleves.id, groupeIds), isNull(groupeEleves.deletedAt)));
      if (groupes.length !== groupeIds.length)
        throw invalide('groupeIds', 'Un des groupes n’existe pas dans l’école.');
    }
    const brute = { promotionIds, groupeIds } as LigneSeance;
    const promos = (await this.promotionsDesSeances(tx, [{ ...brute, id: '' }])).get('') ?? [];
    const connues = await tx
      .select()
      .from(promotion)
      .where(
        and(
          inArray(
            promotion.id,
            promos.map((p) => p.id),
          ),
          isNull(promotion.deletedAt),
        ),
      );
    if (promotionIds.some((id) => !connues.some((p) => p.id === id)))
      throw invalide('promotionIds', 'Une des promotions n’existe pas dans l’école.');
    const etablissements = new Set(connues.map((p) => p.etablissementId));
    const [etablissementId] = [...etablissements];
    if (etablissements.size !== 1 || !etablissementId)
      throw invalide(
        'promotionIds',
        'Les promotions et groupes d’une séance relèvent d’un même établissement.',
      );
    if (!this.couvre(await this.gestion(tx, access), connues))
      throw new ForbiddenException(
        'Vous ne planifiez que les séances des promotions de votre périmètre.',
      );
    const campus = await this.etablissement(tx, etablissementId);
    let libelle = c.activite ?? '';
    if (c.moduleId) {
      const [module] = await tx
        .select()
        .from(maquetteModule)
        .where(and(eq(maquetteModule.id, c.moduleId), isNull(maquetteModule.deletedAt)));
      if (!module || !connues.some((p) => p.versionId === module.versionId))
        throw invalide('moduleId', 'Ce module n’est pas dans la maquette suivie par ce public.');
      libelle = module.intitule;
    }
    if (c.salleId) {
      const [laSalle] = await tx
        .select()
        .from(salle)
        .where(and(eq(salle.id, c.salleId), isNull(salle.deletedAt)));
      if (!laSalle || laSalle.etablissementId !== etablissementId)
        throw invalide('salleId', 'Cette salle n’existe pas dans l’établissement de la séance.');
      if (laSalle.statut === 'fermee')
        throw invalide('salleId', 'Cette salle est fermée. Choisissez une autre salle.');
    }
    const intervenantIds = [...new Set(c.intervenantIds)].sort();
    if (intervenantIds.length > 0) {
      const fiches = await tx
        .select({ id: personne.id })
        .from(personne)
        .where(and(inArray(personne.id, intervenantIds), isNull(personne.deletedAt)));
      if (fiches.length !== intervenantIds.length)
        throw invalide('intervenantIds', 'Un des intervenants n’existe pas dans l’école.');
    }
    return {
      etablissementId,
      fuseau: campus.fuseauHoraire,
      plage: plageEdt(campus),
      promotionIds,
      groupeIds,
      promotions: connues.map((p) => p.id),
      intervenantIds,
      libelle,
    };
  }

  /** RG-04-02 : pas de 15 minutes. */
  private validerHoraire(debut: Date, fin: Date) {
    if (fin <= debut) throw invalide('fin', 'La fin de la séance doit suivre son début.');
    const pas = PAS_GRILLE_MINUTES * 60_000;
    if (debut.getTime() % pas !== 0 || fin.getTime() % pas !== 0)
      throw invalide('debut', 'Les heures suivent le pas de la grille (15 minutes).');
  }

  /** Cas limite : une séance dont l'appel est fait ne se déplace pas. */
  private async exigerSansAppel(tx: Transaction, seanceId: string) {
    const [ligne] = await tx
      .select({ n: count() })
      .from(presence)
      .where(and(eq(presence.seanceId, seanceId), isNull(presence.deletedAt)));
    if ((ligne?.n ?? 0) > 0)
      throw new ConflictException(
        'L’appel de cette séance est déjà fait : elle ne se déplace plus. Annulez-la puis recréez-la ; ses présences sont conservées.',
      );
  }

  private async ecrirePublic(
    tx: Transaction,
    access: Access,
    seanceId: string,
    contenu: Pick<ContenuValide, 'promotionIds' | 'groupeIds'>,
  ) {
    await tx.insert(seancePublic).values([
      ...contenu.promotionIds.map((promotionId) => ({
        organisationId: access.organisationId,
        seanceId,
        promotionId,
        createdBy: access.userId,
      })),
      ...contenu.groupeIds.map((groupeId) => ({
        organisationId: access.organisationId,
        seanceId,
        groupeId,
        createdBy: access.userId,
      })),
    ]);
  }

  /** RG-04-01 : retire les intervenants enlevés, ajoute les nouveaux. */
  private async ecrireIntervenants(
    tx: Transaction,
    access: Access,
    seanceId: string,
    avant: readonly string[],
    apres: readonly string[],
  ) {
    const retires = avant.filter((id) => !apres.includes(id));
    const ajoutes = apres.filter((id) => !avant.includes(id));
    if (retires.length > 0)
      await tx
        .update(seanceIntervenant)
        .set({ deletedAt: new Date(), updatedBy: access.userId })
        .where(
          and(
            eq(seanceIntervenant.seanceId, seanceId),
            inArray(seanceIntervenant.personneId, retires),
            isNull(seanceIntervenant.deletedAt),
          ),
        );
    if (ajoutes.length > 0)
      await tx.insert(seanceIntervenant).values(
        ajoutes.map((personneId) => ({
          organisationId: access.organisationId,
          seanceId,
          personneId,
          createdBy: access.userId,
        })),
      );
  }

  /** Séance visible et gérée par la personne connectée (sinon 404 ou 403). */
  private async seanceGeree(tx: Transaction, access: Access, id: string) {
    const [ligne] = await this.contexte.seances(tx, eq(seance.id, id));
    if (!ligne) throw new NotFoundException('Séance introuvable.');
    const promos = (await this.promotionsDesSeances(tx, [ligne])).get(id) ?? [];
    const lecture = await promotionsCouvertes(tx, access, LECTURE);
    if (lecture !== null && !promos.some((p) => lecture.has(p.id)))
      throw new NotFoundException('Séance introuvable.');
    if (!this.couvre(await this.gestion(tx, access), promos))
      throw new ForbiddenException('Vous ne modifiez que les séances de votre périmètre.');
    if (ligne.statut === 'annulee')
      throw new ConflictException('Cette séance est annulée : elle ne se modifie plus.');
    if (ligne.statut === 'reportee')
      throw new ConflictException(
        'Cette séance est reportée : elle ne se modifie plus. Modifiez sa séance de remplacement.',
      );
    return ligne;
  }

  /**
   * Retire les séances du cache de l'émargement (sans requête SQL sur le chemin du scan) : une
   * séance annulée ou reportée ne s'émarge plus, une séance changée est rechargée à jour. Valkey
   * indisponible : le scan passe en mode dégradé, qui relit la séance en base.
   */
  private async retirerDuCache(ids: readonly string[]) {
    if (ids.length === 0) return;
    try {
      await this.valkey.pipeline(ids.flatMap((id) => commandesRetraitSeance(id))).exec();
    } catch (erreur) {
      this.logger.warn(`Cache de l’émargement non mis à jour : ${String(erreur)}`);
    }
  }

  /** RG-04-03 : séances touchées selon la portée, hors séances annulées ou reportées. */
  private async concernees(
    tx: Transaction,
    access: Access,
    cible: LigneSeance,
    portee: ModificationSeance['portee'],
  ) {
    if (portee === 'seance' || !cible.serieId) return [cible];
    const serie = await this.contexte.seances(tx, eq(seance.serieId, cible.serieId));
    const gestion = await this.gestion(tx, access);
    const promotionsDe = await this.promotionsDesSeances(tx, serie);
    return seancesConcernees(serie, cible, portee).filter((s) => {
      if (s.statut === 'annulee' || s.statut === 'reportee') return false;
      if (!this.couvre(gestion, promotionsDe.get(s.id) ?? []))
        throw new ForbiddenException('Vous ne modifiez que les séances de votre périmètre.');
      return true;
    });
  }

  private contexteDe(
    tx: Transaction,
    lignes: readonly LigneSeance[],
    lieu: { etablissementId: string; fuseau: string },
  ): Promise<ContexteConflits> {
    return this.contexte.charger(tx, {
      ...lieu,
      debut: new Date(Math.min(...lignes.map((l) => l.debut.getTime()))),
      fin: new Date(Math.max(...lignes.map((l) => l.fin.getTime()))),
      moduleIds: [...new Set(lignes.flatMap((l) => (l.moduleId ? [l.moduleId] : [])))],
      publicIds: [...new Set(lignes.flatMap((l) => [...l.promotionIds, ...l.groupeIds]))],
    });
  }

  /**
   * RG-04-06 : forçage d'un conflit précis de la séance, par une personne qui en a le droit sur
   * toutes ses promotions ; enregistré et tracé (avant : le conflit, après : le forçage).
   */
  private async forcer(
    tx: Transaction,
    access: Access,
    ligne: LigneSeance,
    contenu: ContenuValide,
    ctx: ContexteConflits,
    forcages: readonly Forcage[],
    adresseIp: string,
  ) {
    if (forcages.length === 0) return;
    const autorisees = access.permissions.has('edt:forcer')
      ? await promotionsCouvertes(tx, access, ['edt:forcer'])
      : new Set<string>();
    if (autorisees !== null && !contenu.promotions.every((p) => autorisees.has(p)))
      throw new ForbiddenException(
        'Seul un responsable peut forcer un conflit. Demandez-lui, ou changez de salle ou de créneau.',
      );
    const conflits = detecterConflits(versPlanifiee(ligne), ctx);
    const deja = (await this.contexte.forcages(tx, [ligne.id])).get(ligne.id) ?? [];
    for (const f of forcages) {
      const conflit = conflits.find(
        (c): c is Conflit & { seanceId: string } =>
          c.code === f.code && 'seanceId' in c && c.seanceId === f.seanceId,
      );
      if (!conflit)
        throw invalide('forcages', 'Ce conflit n’existe pas (ou plus) pour cette séance.');
      const verdict = verifierForcage(conflit, f.motif);
      if (!verdict.ok) throw invalide('forcages', 'Donnez le motif du forçage.');
      if (deja.some((d) => d.code === f.code && d.seanceId === f.seanceId)) continue;
      await tx.insert(seanceForcage).values({
        organisationId: access.organisationId,
        seanceId: ligne.id,
        code: verdict.forcage.code,
        autreSeanceId: verdict.forcage.seanceId,
        motif: verdict.forcage.motif,
        createdBy: access.userId,
      });
      await enregistrerAudit(tx, {
        action: 'seance.conflit.forcer',
        objetType: 'seance',
        objetId: ligne.id,
        auteurId: access.userId,
        adresseIp,
        avant: { conflit },
        apres: { forcage: verdict.forcage },
      });
    }
  }

  private exigerPubliables(seances: readonly Seance[]) {
    const bloquees = seances.filter(
      (s) => conflitsBloquants(s.conflits as Conflit[], s.forcages).length > 0,
    );
    if (bloquees.length > 0)
      throw new ConflictException({
        message:
          'Des conflits bloquants empêchent la publication. Corrigez-les, ou faites-les forcer par un responsable, puis réessayez.',
        details: bloquees.map(
          (s) =>
            `${s.libelle} (${s.debut}) : ${conflitsBloquants(s.conflits as Conflit[], s.forcages)
              .map((c) => c.code)
              .join(', ')}`,
        ),
      });
  }

  private async nomsSalles(tx: Transaction, ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const lignes = await tx
      .select({ id: salle.id, nom: salle.nom })
      .from(salle)
      .where(inArray(salle.id, [...ids]));
    return new Map(lignes.map((l) => [l.id, l.nom]));
  }

  /**
   * Contrats des séances, avec leurs conflits (sans contexte : aucun conflit calculé, pour
   * l'audit) et leurs forçages.
   */
  private async versContrats(
    tx: Transaction,
    access: Access,
    lignes: readonly LigneSeance[],
    lieu: { etablissementId: string; fuseau: string } | null,
    contexte?: ContexteConflits,
  ): Promise<Seance[]> {
    if (lignes.length === 0) return [];
    const ctx = lieu ? (contexte ?? (await this.contexteDe(tx, lignes, lieu))) : null;
    const forcages = await this.contexte.forcages(
      tx,
      lignes.map((l) => l.id),
    );
    const promotionsDe = await this.promotionsDesSeances(tx, lignes);
    const gestion = await this.gestion(tx, access);
    const maintenant = new Date();
    const dureeBadge = await dureeBadgeModifie(tx, this.env);
    return lignes.map((l) => ({
      id: l.id,
      libelle: l.libelle,
      debut: l.debut.toISOString(),
      fin: l.fin.toISOString(),
      statut: l.statut,
      type: l.type,
      moduleId: l.moduleId,
      activite: l.activite,
      promotionIds: l.promotionIds,
      groupeIds: l.groupeIds,
      intervenantIds: l.intervenantIds,
      salleId: l.salleId,
      lienVisio: l.lienVisio,
      distanciel: l.distanciel,
      motifAnnulation: l.motifAnnulation,
      serieId: l.serieId,
      reporteeVersId: l.reporteeVersId,
      modifieeLe: l.modifieeLe?.toISOString() ?? null,
      modifiee: badgeModifie(l.modifieeLe, maintenant, dureeBadge),
      conflits:
        ctx && (l.statut === 'brouillon' || l.statut === 'publiee')
          ? detecterConflits(versPlanifiee(l), ctx)
          : [],
      forcages: forcages.get(l.id) ?? [],
      modifiable:
        (l.statut === 'brouillon' || l.statut === 'publiee') &&
        this.couvre(gestion, promotionsDe.get(l.id) ?? []),
    }));
  }
}

import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import type {
  CorrespondanceEdt,
  ListeCorrespondancesEdt,
  ParametresImportEdt,
  ResultatImportEdt,
  SaisieCorrespondancesEdt,
  Seance,
} from '@scolaly/contracts';
import {
  affectation,
  correspondanceEdt,
  enregistrerAudit,
  groupeEleves,
  groupePromotion,
  maquetteModule,
  personne,
  promotion,
  salle,
  seance,
  type Transaction,
} from '@scolaly/db';
import {
  conflitsBloquants,
  deciderReimport,
  empreinteSeance,
  normaliserNom,
  rapprocher,
  type Candidat,
  type Conflit,
  type LectureImportEdt,
  type SeanceImportee as LigneLue,
} from '@scolaly/domain';
import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import type { LigneSeance } from './contexte.service.js';
import { ContexteService } from './contexte.service.js';
import { SeancesService, type ContenuValide } from './seances.service.js';

type Nature = CorrespondanceEdt['nature'];
type Resultat = ResultatImportEdt;
type Action = Resultat['seances'][number]['action'];

/** Sortie volontaire d'un savepoint : rien n'est écrit (aperçu, ou import tout ou rien refusé). */
class Abandon extends Error {}

const PAR_LOT = 1000;
const lots = <T>(liste: readonly T[]) =>
  Array.from({ length: Math.ceil(liste.length / PAR_LOT) }, (_, i) =>
    liste.slice(i * PAR_LOT, (i + 1) * PAR_LOT),
  );

/** Message d'une erreur métier, sans le nom technique du champ. */
function messageDe(erreur: HttpException): string {
  const reponse = erreur.getResponse();
  if (typeof reponse === 'string') return reponse;
  const { message, details } = reponse as { message?: unknown; details?: unknown };
  if (Array.isArray(details) && details.length > 0)
    return details.map((d) => String(d).replace(/^[\w.]+ : /, '')).join(' ');
  return typeof message === 'string' ? message : erreur.message;
}

interface Referentiels {
  promotions: (typeof promotion.$inferSelect)[];
  groupes: { id: string; libelle: string; promotionIds: string[] }[];
  modules: (typeof maquetteModule.$inferSelect)[];
  salles: { id: string; nom: string }[];
  intervenants: Candidat[];
  correspondances: Map<string, string | null>;
}

const cleDe = (nature: Nature, libelle: string) => `${nature}|${normaliserNom(libelle)}`;

/** Saisie d'une séance du fichier, une fois ses libellés rapprochés. */
interface Preparee {
  lue: LigneLue;
  contenu: {
    type: LigneLue['type'];
    moduleId: string | null;
    activite: string | null;
    promotionIds: string[];
    groupeIds: string[];
    salleId: string | null;
    intervenantIds: string[];
  };
}

/**
 * Import d'un emploi du temps (US-04-04, US-04-05 ; RG-04-08 à RG-04-12). Les libellés du
 * fichier sont rapprochés des objets de l'établissement, d'office ou par une correspondance
 * mémorisée. L'aperçu exécute l'import dans un savepoint annulé : erreurs ligne par ligne et
 * conflits sont ceux de l'import réel, et rien n'est écrit. Chaque séance garde son identifiant
 * externe ; un réimport met à jour sans doublon, et signale les séances disparues sans les annuler.
 */
@Injectable()
export class ImportEdtService {
  constructor(
    private readonly seances: SeancesService,
    private readonly contexte: ContexteService,
  ) {}

  async importer(
    tx: Transaction,
    access: Access,
    p: ParametresImportEdt,
    format: Resultat['format'],
    lecture: LectureImportEdt,
    adresseIp: string,
  ): Promise<Resultat> {
    const campus = await this.seances.etablissement(tx, p.etablissementId);
    const resultat: Resultat = {
      apercu: p.apercu,
      importe: false,
      format,
      compteurs: {
        lues: lecture.seances.length,
        creees: 0,
        modifiees: 0,
        inchangees: 0,
        conservees: 0,
        ignorees: 0,
        rejetees: 0,
        disparues: 0,
      },
      erreurs: [...lecture.erreurs],
      avertissements: [...lecture.avertissements],
      inconnus: [],
      choix: [],
      seances: [],
      disparues: [],
    };
    const ref = await this.referentiels(tx, campus.id, lecture.seances);
    const inconnus = new Map<string, Resultat['inconnus'][number]>();
    const preparees: Preparee[] = [];
    for (const lue of lecture.seances) {
      const preparee = this.preparer(lue, ref, p, inconnus, resultat.erreurs);
      if (preparee) preparees.push(preparee);
    }
    if (inconnus.size > 0) {
      resultat.inconnus = [...inconnus.values()];
      resultat.choix = this.choix(ref);
      return resultat;
    }

    const existantes = await this.existantes(
      tx,
      preparees.map((x) => x.lue.identifiant),
    );
    const traitees: { id: string; statut: Seance['statut'] }[] = [];
    const cache = new Map<string, ContenuValide>();
    const lieu = { etablissementId: campus.id, fuseau: campus.fuseauHoraire };
    try {
      await tx.transaction(async (sp) => {
        for (const x of preparees) {
          try {
            await sp.transaction(async (s) => {
              const sortie = await this.traiter(s, access, p, x, existantes, adresseIp, cache);
              resultat.compteurs[
                (
                  {
                    creee: 'creees',
                    modifiee: 'modifiees',
                    inchangee: 'inchangees',
                    conservee: 'conservees',
                    ignoree: 'ignorees',
                  } as const
                )[sortie.action]
              ]++;
              if (sortie.seance) traitees.push(sortie.seance);
              if (sortie.action === 'inchangee') return;
              resultat.seances.push({
                ligne: x.lue.ligne,
                identifiant: x.lue.identifiant,
                seanceId: sortie.seance?.id ?? null,
                libelle: sortie.libelle,
                debut: x.lue.debut.toISOString(),
                fin: x.lue.fin.toISOString(),
                action: sortie.action,
                conflits: [],
              });
              if (sortie.avertissement)
                resultat.avertissements.push({
                  ligne: x.lue.ligne,
                  message: sortie.avertissement,
                });
            });
          } catch (erreur) {
            if (!(erreur instanceof HttpException)) throw erreur;
            resultat.erreurs.push({ ligne: x.lue.ligne, message: messageDe(erreur) });
          }
        }
        resultat.compteurs.rejetees = new Set(
          resultat.erreurs.flatMap((e) => (e.ligne === null ? [] : [e.ligne])),
        ).size;
        resultat.disparues = await this.disparues(sp, access, campus.id, preparees, traitees);
        resultat.compteurs.disparues = resultat.disparues.length;
        // RG-04-05 : conflits de toutes les séances du fichier, calculés en une fois.
        const contrats = new Map(
          (
            await this.seances.contrats(
              sp,
              access,
              traitees.map((t) => t.id),
              lieu,
            )
          ).map((c) => [c.id, c]),
        );
        for (const ligne of resultat.seances) {
          const contrat = ligne.seanceId ? contrats.get(ligne.seanceId) : undefined;
          if (!contrat) continue;
          ligne.conflits = contrat.conflits;
          if (ligne.libelle === '') ligne.libelle = contrat.libelle;
        }
        const refuse = resultat.erreurs.length > 0 && !p.lignesValides;
        if (p.publier && !refuse) {
          // RG-04-06 : une séance en conflit bloquant reste en brouillon, signalée.
          const brouillons: string[] = [];
          for (const t of traitees) {
            const contrat = contrats.get(t.id);
            if (t.statut !== 'brouillon' || !contrat) continue;
            if (conflitsBloquants(contrat.conflits as Conflit[], contrat.forcages).length === 0)
              brouillons.push(t.id);
            else
              resultat.avertissements.push({
                ligne: resultat.seances.find((l) => l.seanceId === t.id)?.ligne ?? null,
                message:
                  'Conflit bloquant : séance laissée en brouillon. Réglez le conflit dans le planificateur, puis publiez-la.',
              });
          }
          try {
            if (brouillons.length > 0)
              await this.seances.publier(sp, access, { seanceIds: brouillons }, adresseIp);
          } catch (erreur) {
            if (!(erreur instanceof HttpException)) throw erreur;
            resultat.erreurs.push({ ligne: null, message: messageDe(erreur) });
            throw new Abandon();
          }
        }
        if (refuse || p.apercu) throw new Abandon();
        await enregistrerAudit(sp, {
          action: 'edt.importer',
          objetType: 'etablissement',
          objetId: campus.id,
          auteurId: access.userId,
          adresseIp,
          apres: { format, publier: p.publier, ...resultat.compteurs },
        });
      });
      resultat.importe = true;
    } catch (erreur) {
      if (!(erreur instanceof Abandon)) throw erreur;
    }
    return resultat;
  }

  // ——— Rapprochement (RG-04-09) ———

  private async referentiels(
    tx: Transaction,
    etablissementId: string,
    lues: readonly LigneLue[],
  ): Promise<Referentiels> {
    const promotions = await tx
      .select()
      .from(promotion)
      .where(and(eq(promotion.etablissementId, etablissementId), isNull(promotion.deletedAt)));
    const promotionIds = promotions.map((x) => x.id);
    const versions = [...new Set(promotions.map((x) => x.versionId))];
    const liens =
      promotionIds.length === 0
        ? []
        : await tx
            .select({
              id: groupeEleves.id,
              libelle: groupeEleves.libelle,
              promotionId: groupePromotion.promotionId,
            })
            .from(groupePromotion)
            .innerJoin(groupeEleves, eq(groupeEleves.id, groupePromotion.groupeId))
            .where(
              and(
                inArray(groupePromotion.promotionId, promotionIds),
                isNull(groupePromotion.deletedAt),
                isNull(groupeEleves.deletedAt),
              ),
            );
    const groupes = new Map<string, Referentiels['groupes'][number]>();
    for (const l of liens) {
      const g = groupes.get(l.id) ?? { id: l.id, libelle: l.libelle, promotionIds: [] };
      g.promotionIds.push(l.promotionId);
      groupes.set(l.id, g);
    }
    const modules =
      versions.length === 0
        ? []
        : await tx
            .select()
            .from(maquetteModule)
            .where(
              and(inArray(maquetteModule.versionId, versions), isNull(maquetteModule.deletedAt)),
            );
    const salles = await tx
      .select({ id: salle.id, nom: salle.nom })
      .from(salle)
      .where(and(eq(salle.etablissementId, etablissementId), isNull(salle.deletedAt)));
    // Intervenants : par email dans toute l'école, par nom parmi ceux affectés à l'établissement.
    const emails = [
      ...new Set(
        lues.flatMap((l) =>
          l.intervenants.filter((i) => i.includes('@')).map((i) => i.toLowerCase()),
        ),
      ),
    ];
    const affectes =
      promotionIds.length === 0
        ? []
        : await tx
            .selectDistinct({ id: affectation.personneId })
            .from(affectation)
            .where(
              and(inArray(affectation.promotionId, promotionIds), isNull(affectation.deletedAt)),
            );
    const fiches = [
      ...(affectes.length === 0
        ? []
        : await tx
            .select()
            .from(personne)
            .where(
              and(
                inArray(
                  personne.id,
                  affectes.map((a) => a.id),
                ),
                isNull(personne.deletedAt),
              ),
            )),
      ...(await Promise.all(
        lots(emails).map((lot) =>
          tx
            .select()
            .from(personne)
            .where(and(inArray(sql`lower(${personne.email})`, lot), isNull(personne.deletedAt))),
        ),
      ).then((r) => r.flat())),
    ];
    const intervenants = new Map<string, Candidat>();
    for (const f of fiches) {
      const noms = [f.nom, ...(f.nomUsage ? [f.nomUsage] : [])];
      intervenants.set(f.id, {
        id: f.id,
        libelles: [f.email, ...noms.flatMap((n) => [`${f.prenom} ${n}`, `${n} ${f.prenom}`])],
      });
    }
    const memorisees = await tx
      .select()
      .from(correspondanceEdt)
      .where(isNull(correspondanceEdt.deletedAt));
    return {
      promotions,
      groupes: [...groupes.values()],
      modules,
      salles,
      intervenants: [...intervenants.values()],
      correspondances: new Map(memorisees.map((c) => [`${c.nature}|${c.cle}`, c.objetId])),
    };
  }

  /**
   * Objet d'un libellé : correspondance mémorisée (null : volontairement sans objet), sinon
   * rapprochement d'office ; undefined si le libellé reste inconnu.
   */
  private resoudre(
    ref: Referentiels,
    nature: Nature,
    libelle: string,
    candidats: readonly Candidat[],
  ): string | null | undefined {
    const cle = cleDe(nature, libelle);
    if (ref.correspondances.has(cle)) return ref.correspondances.get(cle) ?? null;
    return rapprocher(libelle, candidats) ?? undefined;
  }

  private preparer(
    lue: LigneLue,
    ref: Referentiels,
    p: ParametresImportEdt,
    inconnus: Map<string, Resultat['inconnus'][number]>,
    erreurs: Resultat['erreurs'],
  ): Preparee | null {
    let complete = true;
    const inconnu = (nature: Nature, libelle: string) => {
      complete = false;
      const cle = cleDe(nature, libelle);
      const deja = inconnus.get(cle) ?? { nature, libelle, lignes: [] };
      if (!deja.lignes.includes(lue.ligne)) deja.lignes.push(lue.ligne);
      inconnus.set(cle, deja);
    };
    const publics = [
      ...ref.promotions.map((x) => ({ id: x.id, libelles: [x.libelle] })),
      ...ref.groupes.map((g) => ({ id: g.id, libelles: [g.libelle] })),
    ];
    const promotionIds: string[] = [];
    const groupeIds: string[] = [];
    const ajouterPublic = (id: string) => {
      if (ref.promotions.some((x) => x.id === id)) promotionIds.push(id);
      else groupeIds.push(id);
    };
    for (const libelle of lue.publics) {
      const id = this.resoudre(ref, 'public', libelle, publics);
      if (id === undefined || id === null) inconnu('public', libelle);
      else ajouterPublic(id);
    }
    if (lue.publics.length === 0) {
      if (p.promotionId) promotionIds.push(p.promotionId);
      if (p.groupeId) groupeIds.push(p.groupeId);
      if (!p.promotionId && !p.groupeId) {
        erreurs.push({
          ligne: lue.ligne,
          message:
            'Aucun groupe indiqué : complétez le fichier, ou choisissez un public par défaut.',
        });
        return null;
      }
    }
    // Modules de la maquette suivie par le public, ou de tout l'établissement s'il est inconnu.
    const promotionsDuPublic = new Set([
      ...promotionIds,
      ...ref.groupes.filter((g) => groupeIds.includes(g.id)).flatMap((g) => g.promotionIds),
    ]);
    const versions = new Set(
      ref.promotions.filter((x) => promotionsDuPublic.has(x.id)).map((x) => x.versionId),
    );
    const modules = ref.modules
      .filter((m) => versions.size === 0 || versions.has(m.versionId))
      .map((m) => ({ id: m.id, libelles: [m.code, m.intitule, `${m.code} ${m.intitule}`] }));
    const moduleId = this.resoudre(ref, 'module', lue.module, modules);
    if (moduleId === undefined) inconnu('module', lue.module);
    let salleId: string | null = null;
    if (lue.salle) {
      const id = this.resoudre(
        ref,
        'salle',
        lue.salle,
        ref.salles.map((s) => ({ id: s.id, libelles: [s.nom] })),
      );
      if (id === undefined) inconnu('salle', lue.salle);
      else salleId = id;
    }
    const intervenantIds: string[] = [];
    for (const libelle of lue.intervenants) {
      const id = this.resoudre(ref, 'intervenant', libelle, ref.intervenants);
      if (id === undefined) inconnu('intervenant', libelle);
      else if (id) intervenantIds.push(id);
    }
    if (!complete || moduleId === undefined) return null;
    return {
      lue,
      contenu: {
        type: lue.type,
        moduleId,
        activite: moduleId ? null : lue.module.slice(0, 120),
        promotionIds: [...new Set(promotionIds)],
        groupeIds: [...new Set(groupeIds)],
        salleId,
        intervenantIds: [...new Set(intervenantIds)],
      },
    };
  }

  private choix(ref: Referentiels): Resultat['choix'] {
    const nomPromotion = new Map(ref.promotions.map((x) => [x.id, x.libelle]));
    const intervenants = ref.intervenants.map((i) => ({
      nature: 'intervenant' as const,
      id: i.id,
      libelle: i.libelles[1] ?? i.libelles[0] ?? '',
    }));
    return [
      ...ref.modules.map((m) => ({
        nature: 'module' as const,
        id: m.id,
        libelle: `${m.code} · ${m.intitule}`,
      })),
      ...ref.promotions.map((x) => ({ nature: 'public' as const, id: x.id, libelle: x.libelle })),
      ...ref.groupes.map((g) => ({
        nature: 'public' as const,
        id: g.id,
        libelle: `${g.libelle} (${g.promotionIds.map((id) => nomPromotion.get(id) ?? '').join(', ')})`,
      })),
      ...ref.salles.map((s) => ({ nature: 'salle' as const, id: s.id, libelle: s.nom })),
      ...intervenants,
    ].sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
  }

  // ——— Création et mise à jour (RG-04-11, RG-04-12) ———

  private async existantes(tx: Transaction, identifiants: readonly string[]) {
    const lignes = (
      await Promise.all(
        lots(identifiants).map((lot) =>
          this.contexte.seances(tx, inArray(seance.identifiantExterne, lot)),
        ),
      )
    ).flat();
    return new Map(lignes.map((l) => [l.identifiantExterne ?? '', l]));
  }

  private async traiter(
    tx: Transaction,
    access: Access,
    p: ParametresImportEdt,
    x: Preparee,
    existantes: Map<string, LigneSeance>,
    adresseIp: string,
    cache: Map<string, ContenuValide>,
  ): Promise<{
    action: Action;
    libelle: string;
    seance: { id: string; statut: Seance['statut'] } | null;
    avertissement?: string;
  }> {
    const cible = { debut: x.lue.debut, fin: x.lue.fin, ...x.contenu };
    const empreinteFichier = empreinteSeance(cible);
    const existante = existantes.get(x.lue.identifiant) ?? null;
    if (existante && (existante.statut === 'annulee' || existante.statut === 'reportee'))
      return {
        action: 'ignoree',
        libelle: existante.libelle,
        seance: null,
        avertissement: `Séance ${existante.statut === 'annulee' ? 'annulée' : 'reportée'} dans Scolaly : le fichier ne la modifie pas.`,
      };
    const decision = deciderReimport({
      existante: existante
        ? {
            empreinteImport: existante.empreinteImport,
            empreinteActuelle: empreinteSeance(existante),
          }
        : null,
      empreinteFichier,
      versionConservee: p.versionConservee,
    });
    if (existante && (decision === 'inchangee' || decision === 'conserver')) {
      if (decision === 'inchangee' && existante.empreinteImport !== empreinteFichier)
        await tx
          .update(seance)
          .set({ empreinteImport: empreinteFichier })
          .where(eq(seance.id, existante.id));
      return {
        action: decision === 'inchangee' ? 'inchangee' : 'conservee',
        libelle: existante.libelle,
        seance: { id: existante.id, statut: existante.statut },
        ...(decision === 'conserver'
          ? { avertissement: 'Séance modifiée dans Scolaly depuis le dernier import : conservée.' }
          : {}),
      };
    }
    const saisie = {
      ...x.contenu,
      debut: x.lue.debut.toISOString(),
      fin: x.lue.fin.toISOString(),
      forcages: [],
    };
    // Une création ne calcule pas ses conflits : ceux du lot le sont une fois, à la fin.
    const resultat = existante
      ? (
          await this.seances.modifier(
            tx,
            access,
            existante.id,
            { portee: 'seance', ...saisie },
            adresseIp,
          )
        ).seances.find((s) => s.id === existante.id)
      : {
          id: await this.seances.creerBrouillon(
            tx,
            access,
            { ...saisie, lienVisio: null, distanciel: false },
            adresseIp,
            cache,
          ),
          statut: 'brouillon' as const,
          libelle: '',
        };
    if (!resultat) throw new BadRequestException('Séance introuvable après l’import.');
    await tx
      .update(seance)
      .set({ identifiantExterne: x.lue.identifiant, empreinteImport: empreinteFichier })
      .where(eq(seance.id, resultat.id));
    return {
      action: existante ? 'modifiee' : 'creee',
      libelle: resultat.libelle,
      seance: { id: resultat.id, statut: resultat.statut },
    };
  }

  /**
   * RG-04-11 : séances déjà importées, sur la période du fichier et pour les mêmes promotions,
   * qui n'y figurent plus. Elles sont signalées ; leur annulation reste une décision humaine.
   */
  private async disparues(
    tx: Transaction,
    access: Access,
    etablissementId: string,
    preparees: readonly Preparee[],
    traitees: readonly { id: string }[],
  ): Promise<Resultat['disparues']> {
    if (preparees.length === 0) return [];
    const debut = new Date(Math.min(...preparees.map((x) => x.lue.debut.getTime())));
    const fin = new Date(Math.max(...preparees.map((x) => x.lue.fin.getTime())));
    const identifiants = new Set(preparees.map((x) => x.lue.identifiant));
    const candidates = (
      await this.contexte.seances(
        tx,
        and(
          isNotNull(seance.identifiantExterne),
          inArray(seance.statut, ['brouillon', 'publiee']),
          gte(seance.debut, debut),
          lte(seance.debut, fin),
        ),
      )
    ).filter((l) => !identifiants.has(l.identifiantExterne ?? ''));
    if (candidates.length === 0) return [];
    const promotionsDe = await this.seances.promotionsDesSeances(tx, [
      ...candidates,
      ...(await this.contexte.seances(
        tx,
        inArray(
          seance.id,
          traitees.map((t) => t.id),
        ),
      )),
    ]);
    const duFichier = new Set(
      traitees.flatMap((t) => (promotionsDe.get(t.id) ?? []).map((x) => x.id)),
    );
    const gestion = await this.seances.gestion(tx, access);
    return candidates
      .filter((l) => {
        const promos = promotionsDe.get(l.id) ?? [];
        return (
          promos.some((x) => x.etablissementId === etablissementId && duFichier.has(x.id)) &&
          this.seances.couvre(gestion, promos)
        );
      })
      .map((l) => ({ id: l.id, libelle: l.libelle, debut: l.debut.toISOString() }))
      .sort((a, b) => a.debut.localeCompare(b.debut));
  }

  // ——— Correspondances mémorisées (RG-04-09) ———

  async correspondances(tx: Transaction): Promise<ListeCorrespondancesEdt> {
    const lignes = await tx
      .select()
      .from(correspondanceEdt)
      .where(isNull(correspondanceEdt.deletedAt))
      .orderBy(correspondanceEdt.nature, correspondanceEdt.cle);
    return {
      correspondances: lignes.map((c) => ({
        nature: c.nature,
        libelle: c.libelle,
        objetId: c.objetId,
      })),
    };
  }

  async enregistrerCorrespondances(
    tx: Transaction,
    access: Access,
    saisie: SaisieCorrespondancesEdt,
    adresseIp: string,
  ): Promise<ListeCorrespondancesEdt> {
    for (const c of saisie.correspondances) {
      await this.exigerObjet(tx, c);
      const cle = normaliserNom(c.libelle);
      const [avant] = await tx
        .select()
        .from(correspondanceEdt)
        .where(
          and(
            eq(correspondanceEdt.nature, c.nature),
            eq(correspondanceEdt.cle, cle),
            isNull(correspondanceEdt.deletedAt),
          ),
        );
      if (avant)
        await tx
          .update(correspondanceEdt)
          .set({ libelle: c.libelle, objetId: c.objetId, updatedBy: access.userId })
          .where(eq(correspondanceEdt.id, avant.id));
      else
        await tx.insert(correspondanceEdt).values({
          organisationId: access.organisationId,
          nature: c.nature,
          libelle: c.libelle,
          cle,
          objetId: c.objetId,
          createdBy: access.userId,
        });
      await enregistrerAudit(tx, {
        action: 'edt.correspondance',
        objetType: 'correspondance_edt',
        objetId: avant?.id ?? null,
        auteurId: access.userId,
        adresseIp,
        avant: avant
          ? { nature: avant.nature, libelle: avant.libelle, objetId: avant.objetId }
          : null,
        apres: c,
      });
    }
    return this.correspondances(tx);
  }

  private async exigerObjet(tx: Transaction, c: CorrespondanceEdt) {
    const refus = (message: string) =>
      new BadRequestException({
        message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
        details: [`correspondances : « ${c.libelle} » : ${message}`],
      });
    if (c.objetId === null) {
      if (c.nature === 'public') throw refus('choisissez une promotion ou un groupe.');
      return;
    }
    const id = c.objetId;
    const existe = async (requete: Promise<unknown[]>) => (await requete).length > 0;
    const trouve =
      c.nature === 'module'
        ? await existe(
            tx
              .select({ id: maquetteModule.id })
              .from(maquetteModule)
              .where(and(eq(maquetteModule.id, id), isNull(maquetteModule.deletedAt))),
          )
        : c.nature === 'salle'
          ? await existe(
              tx
                .select({ id: salle.id })
                .from(salle)
                .where(and(eq(salle.id, id), isNull(salle.deletedAt))),
            )
          : c.nature === 'intervenant'
            ? await existe(
                tx
                  .select({ id: personne.id })
                  .from(personne)
                  .where(and(eq(personne.id, id), isNull(personne.deletedAt))),
              )
            : (await existe(
                tx
                  .select({ id: promotion.id })
                  .from(promotion)
                  .where(and(eq(promotion.id, id), isNull(promotion.deletedAt))),
              )) ||
              (await existe(
                tx
                  .select({ id: groupeEleves.id })
                  .from(groupeEleves)
                  .where(and(eq(groupeEleves.id, id), isNull(groupeEleves.deletedAt))),
              ));
    if (!trouve) throw refus('cet objet n’existe pas dans l’école.');
  }
}

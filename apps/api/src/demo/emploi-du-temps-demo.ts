import {
  affectation,
  calendrierAlternance,
  disponibiliteIntervenant,
  etablissement,
  fermeture,
  groupeMembre,
  groupePromotion,
  indisponibiliteIntervenant,
  inscription,
  maquetteModule,
  newId,
  personne,
  promotion,
  salle,
  seance,
  seanceIntervenant,
  seancePublic,
  seanceSerie,
  type Database,
  type Transaction,
} from '@scolaly/db';
import {
  detecterConflits,
  instantLocal,
  jourLocal,
  occurrencesSerie,
  sallesLibres,
  verifierSerie,
  type Conflit,
  type ContexteConflits,
  type CreneauDisponibilite,
  type Indisponibilite,
  type SalleEdt,
  type SeancePlanifiee,
  type TypeSeance,
} from '@scolaly/domain';
import type { DemoDataset } from '@scolaly/db/demo';
import { and, asc, eq, getTableColumns, gte, inArray, isNull, lte } from 'drizzle-orm';
import { joursFeriesNationauxDe } from '../shared/calendrier/jours-feries.js';
import { volumeEnMinutes } from '../modules/emploi-du-temps/contexte.service.js';

/**
 * Emploi du temps de démonstration (I4.1), entièrement fictif et relatif au jour du chargement :
 * trois intervenants inventés par école, leurs affectations, des séries hebdomadaires publiées
 * sur la semaine courante et les cinq suivantes, quelques séances unitaires (dont une
 * co-animée, une à distance et deux brouillons), des disponibilités et une indisponibilité.
 * Chaque séance passe par la détection des conflits du domaine (RG-04-05) : une occurrence en
 * conflit bloquant, un jour fermé ou en entreprise, un intervenant indisponible ou un volume
 * dépassé est sautée ; la salle est la plus petite salle libre assez grande (RG-04-07).
 * Idempotent : une école dont le premier intervenant fictif existe déjà est laissée telle quelle.
 */
const SEMAINES = 6;

const INTERVENANTS = [
  ['Vasseur', 'Hélène'],
  ['Delorme', 'Marc'],
  ['Aubrac', 'Sophie'],
] as const;

/** Salles ajoutées au premier campus, pour accueillir une promotion entière ou un TP. */
const SALLES = [
  { nom: 'Amphithéâtre A', capacite: 150, type: 'amphitheatre' as const, equipements: ['micro'] },
  {
    nom: 'Plateau numérique',
    capacite: 64,
    type: 'tp_informatique' as const,
    equipements: ['ordinateurs', 'vidéoprojecteur'],
  },
];

/** Jours d'école de chaque promotion de l'école, dans l'ordre (1 = lundi). */
const JOURS_PAR_PROMOTION = [[1, 2], [3, 4], [5]] as const;

interface Gabarit {
  jour: 0 | 1;
  debut: string;
  fin: string;
  type: TypeSeance;
  module: number | null;
  activite?: string;
  /** null : toute la promotion ; sinon le rang du groupe. */
  groupe: number | null;
  /** Série : toutes les N semaines ; unitaire : la semaine (0 = courante). */
  serie?: number;
  semaine?: number;
  statut?: 'publiee' | 'brouillon';
  coAnimation?: boolean;
  distanciel?: boolean;
}

const GABARITS: readonly Gabarit[] = [
  { jour: 0, debut: '09:00', fin: '12:00', type: 'cm', module: 0, groupe: null, serie: 1 },
  { jour: 0, debut: '13:30', fin: '15:30', type: 'td', module: 1, groupe: 0, serie: 1 },
  { jour: 0, debut: '15:45', fin: '17:45', type: 'td', module: 1, groupe: 1, serie: 1 },
  { jour: 1, debut: '09:00', fin: '11:00', type: 'tp', module: 2, groupe: 0, serie: 2 },
  { jour: 1, debut: '11:00', fin: '13:00', type: 'tp', module: 2, groupe: 1, serie: 2 },
  {
    jour: 1,
    debut: '14:00',
    fin: '17:00',
    type: 'projet',
    module: null,
    activite: 'Atelier projet professionnel',
    groupe: null,
    semaine: 1,
    coAnimation: true,
  },
  {
    jour: 1,
    debut: '14:00',
    fin: '16:00',
    type: 'td',
    module: 3,
    groupe: 0,
    semaine: 2,
    distanciel: true,
  },
  {
    jour: 1,
    debut: '14:00',
    fin: '16:00',
    type: 'td',
    module: 3,
    groupe: 1,
    semaine: 3,
    statut: 'brouillon',
  },
  {
    jour: 1,
    debut: '16:15',
    fin: '18:15',
    type: 'td',
    module: 3,
    groupe: 0,
    semaine: 3,
    statut: 'brouillon',
  },
];

const JOUR_MS = 86_400_000;
const ajouterJours = (jour: string, n: number) =>
  new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const rangDuJour = (jour: string) => ((new Date(`${jour}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const BLOQUANTS = new Set<Conflit['code']>([
  'salle-occupee',
  'intervenant-occupe',
  'groupe-occupe',
  'jour-ferme',
  'jour-entreprise',
  'intervenant-indisponible',
  'volume-module',
]);

/** Charge l'emploi du temps de démonstration de chaque école. Renvoie le nombre de séances. */
export async function seedDemoEmploiDuTemps(
  owner: Database,
  dataset: DemoDataset,
  maintenant = new Date(),
): Promise<number> {
  let total = 0;
  for (const compte of dataset.comptes.filter((c) => c.role === 'intervenant')) {
    const organisationId = dataset.organisations[compte.organisationIndex]?.id;
    if (!organisationId) continue;
    const domaine = compte.email.slice(compte.email.indexOf('@') + 1);
    total += await owner.transaction((tx) =>
      planifierEcole(tx, organisationId, domaine, maintenant),
    );
  }
  return total;
}

async function planifierEcole(
  tx: Transaction,
  organisationId: string,
  domaine: string,
  maintenant: Date,
): Promise<number> {
  const emails = INTERVENANTS.map(([nom, prenom]) =>
    `${prenom}.${nom}@${domaine}`.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''),
  );
  const deja = await tx
    .select({ id: personne.id })
    .from(personne)
    .where(and(eq(personne.organisationId, organisationId), eq(personne.email, emails[0] ?? '')));
  if (deja.length > 0) return 0;

  // Le campus des promotions de démonstration.
  const [campus] = await tx
    .select(getTableColumns(etablissement))
    .from(etablissement)
    .innerJoin(promotion, eq(promotion.etablissementId, etablissement.id))
    .where(and(eq(etablissement.organisationId, organisationId), isNull(promotion.deletedAt)))
    .orderBy(asc(promotion.libelle))
    .limit(1);
  if (!campus) return 0;
  const fuseau = campus.fuseauHoraire;
  const aujourdhui = jourLocal(maintenant, fuseau);
  const lundi = ajouterJours(aujourdhui, 1 - rangDuJour(aujourdhui));
  const dernier = ajouterJours(lundi, SEMAINES * 7 - 1);
  const commun = { organisationId };

  // Intervenants fictifs (sans compte), salles, disponibilités et une indisponibilité.
  const fictifs = INTERVENANTS.map(([nom, prenom], rang) => ({
    ...commun,
    id: newId(),
    nom,
    prenom,
    email: emails[rang] ?? '',
  }));
  await tx.insert(personne).values(fictifs);
  const [f1, f2, f3] = fictifs.map((f) => f.id) as [string, string, string];
  await tx
    .insert(salle)
    .values(SALLES.map((s) => ({ ...commun, id: newId(), etablissementId: campus.id, ...s })));
  const disponibilites: CreneauDisponibilite[] = [
    ...[1, 2].map((j) => ({
      intervenantId: f1,
      jourSemaine: j,
      heureDebut: '08:00',
      heureFin: '18:00',
    })),
    ...[3, 4].map((j) => ({
      intervenantId: f2,
      jourSemaine: j,
      heureDebut: '08:00',
      heureFin: '19:00',
    })),
  ];
  await tx.insert(disponibiliteIntervenant).values(
    disponibilites.map((d) => ({
      ...commun,
      personneId: d.intervenantId,
      jourSemaine: d.jourSemaine,
      heureDebut: d.heureDebut,
      heureFin: d.heureFin,
    })),
  );
  const vendredi = ajouterJours(lundi, 7 + 4);
  const indisponibilites: Indisponibilite[] = [
    {
      intervenantId: f3,
      debut: instantLocal(vendredi, '08:00', fuseau),
      fin: instantLocal(vendredi, '19:00', fuseau),
    },
  ];
  await tx.insert(indisponibiliteIntervenant).values(
    indisponibilites.map((i) => ({
      ...commun,
      personneId: i.intervenantId,
      debut: i.debut,
      fin: i.fin,
    })),
  );

  // Ressources de l'école : promotions du campus, groupes, apprenants, salles, modules.
  const promotions = await tx
    .select()
    .from(promotion)
    .where(
      and(
        eq(promotion.organisationId, organisationId),
        eq(promotion.etablissementId, campus.id),
        isNull(promotion.deletedAt),
        lte(promotion.dateDebut, dernier),
        gte(promotion.dateFin, lundi),
      ),
    )
    .orderBy(asc(promotion.createdAt), asc(promotion.id));
  const promotionIds = promotions.map((p) => p.id);
  if (promotionIds.length === 0) return 0;
  const groupes = await tx
    .select({ groupeId: groupePromotion.groupeId, promotionId: groupePromotion.promotionId })
    .from(groupePromotion)
    .where(
      and(inArray(groupePromotion.promotionId, promotionIds), isNull(groupePromotion.deletedAt)),
    )
    .orderBy(asc(groupePromotion.createdAt), asc(groupePromotion.id));
  const inscrits = await tx
    .select({
      id: inscription.id,
      personneId: inscription.personneId,
      promotionId: inscription.promotionId,
    })
    .from(inscription)
    .where(and(inArray(inscription.promotionId, promotionIds), isNull(inscription.deletedAt)));
  const membres =
    groupes.length === 0
      ? []
      : await tx
          .select({ groupeId: groupeMembre.groupeId, inscriptionId: groupeMembre.inscriptionId })
          .from(groupeMembre)
          .where(
            and(
              inArray(
                groupeMembre.groupeId,
                groupes.map((g) => g.groupeId),
              ),
              isNull(groupeMembre.deletedAt),
            ),
          );
  const apprenantsParGroupe: Record<string, string[]> = {};
  for (const i of inscrits) (apprenantsParGroupe[i.promotionId] ??= []).push(i.personneId);
  for (const m of membres) {
    const i = inscrits.find((x) => x.id === m.inscriptionId);
    if (i) (apprenantsParGroupe[m.groupeId] ??= []).push(i.personneId);
  }
  const salles: Record<string, SalleEdt & { nom: string }> = {};
  for (const s of await tx
    .select()
    .from(salle)
    .where(and(eq(salle.etablissementId, campus.id), isNull(salle.deletedAt)))) {
    salles[s.id] = { ...s, equipements: s.equipements };
  }
  const virtuelle = Object.values(salles).find((s) => s.type === 'virtuelle');
  const fermetures: { dateDebut: string; dateFin: string }[] = await tx
    .select({ dateDebut: fermeture.dateDebut, dateFin: fermeture.dateFin })
    .from(fermeture)
    .where(and(eq(fermeture.organisationId, organisationId), isNull(fermeture.deletedAt)));
  for (const annee of new Set([lundi.slice(0, 4), dernier.slice(0, 4)]))
    for (const { date } of joursFeriesNationauxDe(Number(annee)))
      fermetures.push({ dateDebut: date, dateFin: date });
  const calendriers = await tx
    .select()
    .from(calendrierAlternance)
    .where(
      and(
        inArray(calendrierAlternance.promotionId, promotionIds),
        isNull(calendrierAlternance.deletedAt),
      ),
    );
  const titulaires = new Map(
    (
      await tx
        .select()
        .from(affectation)
        .where(and(eq(affectation.organisationId, organisationId), isNull(affectation.deletedAt)))
    ).map((a) => [`${a.moduleId}|${a.promotionId}`, a.personneId]),
  );

  const contexte: ContexteConflits & {
    seances: SeancePlanifiee[];
    volumesModules: Record<string, Partial<Record<TypeSeance, number>>>;
  } = {
    fuseau,
    seances: [],
    apprenantsParGroupe,
    salles,
    fermetures,
    joursEntreprise: {},
    stages: {},
    indisponibilites,
    disponibilites,
    volumesModules: {},
  };
  // Séances déjà présentes sur la période (séance de démonstration, par exemple).
  const existantes = await tx
    .select({
      id: seance.id,
      debut: seance.debut,
      fin: seance.fin,
      statut: seance.statut,
      type: seance.type,
      moduleId: seance.moduleId,
      salleId: seance.salleId,
    })
    .from(seance)
    .where(
      and(
        eq(seance.organisationId, organisationId),
        isNull(seance.deletedAt),
        gte(seance.fin, instantLocal(lundi, '00:00', fuseau)),
        lte(seance.debut, instantLocal(ajouterJours(dernier, 1), '00:00', fuseau)),
      ),
    );
  if (existantes.length > 0) {
    const ids = existantes.map((s) => s.id);
    const publics = await tx.select().from(seancePublic).where(inArray(seancePublic.seanceId, ids));
    const animateurs = await tx
      .select()
      .from(seanceIntervenant)
      .where(inArray(seanceIntervenant.seanceId, ids));
    for (const s of existantes)
      contexte.seances.push({
        ...s,
        type: s.type ?? 'cm',
        intervenantIds: animateurs.filter((a) => a.seanceId === s.id).map((a) => a.personneId),
        groupeIds: publics
          .filter((p) => p.seanceId === s.id)
          .flatMap((p) => p.promotionId ?? p.groupeId ?? []),
      });
  }

  const lignes = {
    affectations: [] as (typeof affectation.$inferInsert)[],
    series: [] as (typeof seanceSerie.$inferInsert)[],
    seances: [] as (typeof seance.$inferInsert)[],
    publics: [] as (typeof seancePublic.$inferInsert)[],
    intervenants: [] as (typeof seanceIntervenant.$inferInsert)[],
  };

  // Les promotions à rythme d'alternance d'abord : elles prennent le lundi et le mardi.
  const rythmees = new Set(calendriers.map((c) => c.promotionId));
  promotions.sort((a, b) => Number(rythmees.has(b.id)) - Number(rythmees.has(a.id)));
  const plage = { debut: campus.edtDebut.slice(0, 5), fin: campus.edtFin.slice(0, 5) };
  for (const [rangPromotion, promo] of promotions.entries()) {
    const jours = JOURS_PAR_PROMOTION[rangPromotion];
    if (!jours) break;
    const debutPromo = promo.dateDebut > lundi ? promo.dateDebut : lundi;
    const finPromo = promo.dateFin < dernier ? promo.dateFin : dernier;
    const sesGroupes = groupes.filter((g) => g.promotionId === promo.id).map((g) => g.groupeId);
    const modules = await tx
      .select()
      .from(maquetteModule)
      .where(and(eq(maquetteModule.versionId, promo.versionId), isNull(maquetteModule.deletedAt)))
      .orderBy(asc(maquetteModule.code));
    for (const m of modules) contexte.volumesModules[m.id] = volumeEnMinutes(m);
    // Jours où la promotion est en entreprise d'après son rythme : aucun cours n'y est placé.
    const entreprise = Object.entries(
      calendriers.find((c) => c.promotionId === promo.id)?.jours ?? {},
    ).flatMap(([jour, type]) => (type === 'entreprise' ? [jour] : []));

    // Intervenants de chaque module : l'affectation existante, sinon un intervenant fictif.
    const intervenantDe = (rang: number): string | null => {
      const m = modules[rang];
      if (!m) return null;
      const existant = titulaires.get(`${m.id}|${promo.id}`);
      if (existant) return existant;
      const personneId = rang % 2 === 1 ? f3 : rangPromotion === 0 ? f1 : f2;
      titulaires.set(`${m.id}|${promo.id}`, personneId);
      lignes.affectations.push({
        ...commun,
        personneId,
        moduleId: m.id,
        promotionId: promo.id,
        heuresCm: m.heuresCm,
        heuresTd: m.heuresTd,
        heuresTp: m.heuresTp,
        heuresProjet: m.heuresProjet,
      });
      return personneId;
    };

    for (const g of GABARITS) {
      const jourSemaine = jours[g.jour];
      const module = g.module === null ? null : modules[g.module];
      const groupeId = g.groupe === null ? promo.id : sesGroupes[g.groupe];
      if (!jourSemaine || (g.module !== null && !module) || !groupeId) continue;
      // RG-04-02 : plage horaire et jours ouvrés de l'établissement.
      if (g.debut < plage.debut || g.fin > plage.fin) continue;
      if (!campus.edtJoursOuvres.includes(jourSemaine)) continue;
      const titulaire =
        g.module === null ? (rangPromotion === 0 ? f1 : f2) : intervenantDe(g.module);
      if (!titulaire) continue;
      const intervenantIds = g.coAnimation ? [titulaire, f3] : [titulaire];
      // Type : celui du gabarit si le module en prévoit des heures, sinon le premier prévu.
      const volume = module ? volumeEnMinutes(module) : null;
      const type: TypeSeance =
        !volume || volume[g.type as keyof typeof volume] > 0
          ? g.type
          : ((['cm', 'td', 'tp', 'projet'] as const).find((t) => volume[t] > 0) ?? g.type);
      const regle = {
        dateDebut: g.serie ? debutPromo : ajouterJours(lundi, 7 * (g.semaine ?? 0)),
        // Séance unitaire : la première semaine ouverte à partir de la semaine visée.
        dateFin: finPromo,
        joursSemaine: [jourSemaine],
        intervalleSemaines: g.serie ?? 1,
        heureDebut: g.debut,
        heureFin: g.fin,
        fuseau,
        sauterJoursEntreprise: entreprise.length > 0,
      };
      if (regle.dateFin < regle.dateDebut || !verifierSerie(regle).ok) continue;
      const serieId = g.serie ? newId() : null;
      let creees = 0;
      for (const o of occurrencesSerie(regle, { fermetures, joursEntreprise: entreprise })
        .occurrences) {
        const planifiee: SeancePlanifiee = {
          id: newId(),
          debut: o.debut,
          fin: o.fin,
          statut: g.statut ?? 'publiee',
          type,
          moduleId: module?.id ?? null,
          salleId: null,
          intervenantIds,
          groupeIds: [groupeId],
        };
        const libres = sallesLibres(
          planifiee,
          contexte,
          type === 'tp' ? { type: 'tp_informatique' } : {},
        );
        const choisie = g.distanciel
          ? virtuelle
          : (libres.find((s) => type === 'tp' || s.type !== 'tp_informatique') ?? libres[0]);
        if (!choisie) continue;
        planifiee.salleId = choisie.id;
        if (detecterConflits(planifiee, contexte).some((c) => BLOQUANTS.has(c.code))) continue;
        contexte.seances.push(planifiee);
        creees++;
        lignes.seances.push({
          ...commun,
          id: planifiee.id,
          libelle: module?.intitule ?? g.activite ?? '',
          debut: o.debut,
          fin: o.fin,
          statut: planifiee.statut,
          type,
          moduleId: planifiee.moduleId,
          activite: module ? null : (g.activite ?? null),
          salleId: choisie.id,
          intervenantId: titulaire,
          distanciel: g.distanciel ?? false,
          lienVisio: g.distanciel ? `https://visio.${domaine}/${planifiee.id.slice(-8)}` : null,
          serieId,
        });
        lignes.publics.push({
          ...commun,
          seanceId: planifiee.id,
          ...(g.groupe === null ? { promotionId: promo.id } : { groupeId }),
        });
        for (const personneId of intervenantIds)
          lignes.intervenants.push({ ...commun, seanceId: planifiee.id, personneId });
        if (!serieId) break;
      }
      if (serieId && creees > 0)
        lignes.series.push({
          ...commun,
          id: serieId,
          etablissementId: campus.id,
          dateDebut: regle.dateDebut,
          dateFin: regle.dateFin,
          joursSemaine: regle.joursSemaine,
          intervalleSemaines: regle.intervalleSemaines,
          heureDebut: regle.heureDebut,
          heureFin: regle.heureFin,
          sauterJoursEntreprise: regle.sauterJoursEntreprise,
        });
    }
  }

  if (lignes.affectations.length > 0) await tx.insert(affectation).values(lignes.affectations);
  if (lignes.series.length > 0) await tx.insert(seanceSerie).values(lignes.series);
  if (lignes.seances.length > 0) {
    await tx.insert(seance).values(lignes.seances);
    await tx.insert(seancePublic).values(lignes.publics);
    await tx.insert(seanceIntervenant).values(lignes.intervenants);
  }
  return lignes.seances.length;
}

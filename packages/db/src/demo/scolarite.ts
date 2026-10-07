import type { InferInsertModel } from 'drizzle-orm';
import type {
  groupeEleves,
  groupeMembre,
  groupePromotion,
  inscription,
  inscriptionStatut,
  promotion,
  salle,
} from '../schema/index.js';
import { SeededRandom } from './random.js';
import type { DemoReferentiel } from './referentiel.js';

/**
 * Scolarité de démonstration (I3.2) : une promotion de 1re année par formation, sur le premier
 * campus de l'école, les fiches fictives inscrites (un tiers d'apprentis) et réparties en deux TD.
 * Graine propre, pour ne pas changer les identifiants du reste du jeu.
 */
const GRAINE = 20_261_103;
const CREATED_AT = new Date('2026-09-01T08:00:00Z');

export interface DemoScolarite {
  promotions: InferInsertModel<typeof promotion>[];
  groupes: InferInsertModel<typeof groupeEleves>[];
  groupePromotions: InferInsertModel<typeof groupePromotion>[];
  inscriptions: InferInsertModel<typeof inscription>[];
  statuts: InferInsertModel<typeof inscriptionStatut>[];
  membres: InferInsertModel<typeof groupeMembre>[];
  salles: InferInsertModel<typeof salle>[];
}

export function buildDemoScolarite(source: {
  referentiel: DemoReferentiel;
  annees: readonly {
    id?: string | undefined;
    organisationId: string;
    libelle: string;
    dateDebut: string;
    dateFin: string;
  }[];
  etablissements: readonly { id?: string | undefined; organisationId: string }[];
  personnes: readonly { id?: string | undefined; organisationId: string }[];
}): DemoScolarite {
  const random = new SeededRandom(GRAINE);
  const id = () => random.uuid(CREATED_AT);
  const jeu: DemoScolarite = {
    promotions: [],
    groupes: [],
    groupePromotions: [],
    inscriptions: [],
    statuts: [],
    membres: [],
    salles: [],
  };
  // RG-02-19 : la salle virtuelle de chaque établissement, et deux salles de cours.
  for (const e of source.etablissements) {
    if (!e.id) continue;
    const commun = {
      organisationId: e.organisationId,
      etablissementId: e.id,
      createdAt: CREATED_AT,
    };
    jeu.salles.push(
      { ...commun, id: id(), nom: 'Salle virtuelle (à distance)', type: 'virtuelle' },
      {
        ...commun,
        id: id(),
        nom: 'Salle 101',
        capacite: 35,
        equipements: ['vidéoprojecteur'],
        pmr: true,
      },
      {
        ...commun,
        id: id(),
        nom: 'Salle informatique 2',
        capacite: 24,
        type: 'tp_informatique',
        equipements: ['ordinateurs', 'vidéoprojecteur'],
      },
    );
  }
  const organisations = [...new Set(source.referentiel.formations.map((f) => f.organisationId))];
  for (const organisationId of organisations) {
    const annee = source.annees.find((a) => a.organisationId === organisationId);
    const campus = source.etablissements.find((e) => e.organisationId === organisationId);
    const formations = source.referentiel.formations.filter(
      (f) => f.organisationId === organisationId,
    );
    const personnes = source.personnes.filter((p) => p.organisationId === organisationId);
    if (!annee?.id || !campus?.id) continue;
    // Les fiches se partagent entre les formations de l'école, à parts égales.
    const parFormation = Math.floor(personnes.length / Math.max(1, formations.length));
    formations.forEach((f, rangFormation) => {
      const version = source.referentiel.versions.find((v) => v.formationId === f.id);
      if (!f.id || !version?.id || !annee.id || !campus.id) return;
      const commun = { organisationId, createdAt: CREATED_AT };
      const promotionId = id();
      jeu.promotions.push({
        ...commun,
        id: promotionId,
        formationId: f.id,
        versionId: version.id,
        anneeFormation: 1,
        anneeScolaireId: annee.id,
        etablissementId: campus.id,
        libelle: `${f.intitule} · 1re année · ${annee.libelle}`,
        dateDebut: annee.dateDebut,
        dateFin: annee.dateFin,
      });
      const groupes = ['TD 1', 'TD 2'].map((libelle) => {
        const groupeId = id();
        jeu.groupes.push({ ...commun, id: groupeId, libelle, type: 'td', capacite: 40 });
        jeu.groupePromotions.push({ ...commun, id: id(), groupeId, promotionId });
        return groupeId;
      });
      personnes
        .slice(rangFormation * parFormation, (rangFormation + 1) * parFormation)
        .forEach((p, rang) => {
          if (!p.id) return;
          const inscriptionId = id();
          jeu.inscriptions.push({
            ...commun,
            id: inscriptionId,
            personneId: p.id,
            promotionId,
            dateEntree: annee.dateDebut,
          });
          jeu.statuts.push({
            ...commun,
            id: id(),
            inscriptionId,
            statut: rang % 3 === 0 ? 'apprenti' : 'initial',
            debut: annee.dateDebut,
          });
          jeu.membres.push({
            ...commun,
            id: id(),
            groupeId: groupes[rang % 2] ?? '',
            inscriptionId,
            debut: annee.dateDebut,
          });
        });
    });
  }
  return jeu;
}

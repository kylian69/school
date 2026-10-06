import { z } from 'zod';

/** Contrats de l'écran « Calendrier de l'année » (E-01-03 ; US-01-03, RG-01-03, RG-01-04). */

const jour = z.iso.date('Date attendue au format AAAA-MM-JJ.');
const libelle = z.string().trim().min(1, 'Ce champ est obligatoire.').max(80);

export const STATUTS_ANNEE = ['preparation', 'en_cours', 'cloturee'] as const;
export const TYPES_FERMETURE = ['ferie', 'vacances', 'autre'] as const;

export const Periode = z
  .object({ id: z.uuid(), libelle: z.string(), dateDebut: jour, dateFin: jour, ordre: z.int() })
  .meta({ id: 'Periode' });
export type Periode = z.infer<typeof Periode>;

export const Fermeture = z
  .object({
    id: z.uuid(),
    libelle: z.string(),
    dateDebut: jour,
    dateFin: jour,
    type: z.enum(TYPES_FERMETURE),
    /** Établissements concernés ; vide : tous les établissements. */
    etablissementIds: z.array(z.uuid()),
  })
  .meta({ id: 'Fermeture' });
export type Fermeture = z.infer<typeof Fermeture>;

/** Jour férié national calculé (RG-01-04), jamais saisi. */
export const JourFerie = z
  .object({ code: z.string(), libelle: z.string(), date: jour })
  .meta({ id: 'JourFerie' });
export type JourFerie = z.infer<typeof JourFerie>;

export const AnneeScolaire = z
  .object({
    id: z.uuid(),
    libelle: z.string(),
    dateDebut: jour,
    dateFin: jour,
    statut: z.enum(STATUTS_ANNEE),
    periodes: z.array(Periode),
  })
  .meta({ id: 'AnneeScolaire' });
export type AnneeScolaire = z.infer<typeof AnneeScolaire>;

export const ListeAnnees = z.object({ annees: z.array(AnneeScolaire) }).meta({ id: 'ListeAnnees' });
export type ListeAnnees = z.infer<typeof ListeAnnees>;

export const CalendrierAnnee = AnneeScolaire.extend({
  fermetures: z.array(Fermeture),
  feries: z.array(JourFerie),
}).meta({ id: 'CalendrierAnnee' });
export type CalendrierAnnee = z.infer<typeof CalendrierAnnee>;

/** Période saisie : avec son identifiant pour la modifier, sans pour la créer. */
const PeriodeSaisie = z.object({
  id: z.uuid().optional(),
  libelle,
  dateDebut: jour,
  dateFin: jour,
});

export const SaisieFermeture = z
  .object({
    libelle,
    dateDebut: jour,
    dateFin: jour,
    type: z.enum(TYPES_FERMETURE),
    etablissementIds: z.array(z.uuid()).max(100).default([]),
  })
  .meta({ id: 'SaisieFermeture' });
export type SaisieFermeture = z.infer<typeof SaisieFermeture>;

export const NouvelleAnnee = z
  .object({
    libelle,
    dateDebut: jour,
    dateFin: jour,
    periodes: z
      .array(PeriodeSaisie.omit({ id: true }))
      .min(1)
      .max(12),
    /** Fermetures de l'année, reprises par exemple d'une duplication (RG-01-05). */
    fermetures: z.array(SaisieFermeture).max(100).optional(),
    /** Année dupliquée : tracée dans le journal d'audit. */
    dupliqueDe: z.uuid().optional(),
  })
  .meta({ id: 'NouvelleAnnee' });
export type NouvelleAnnee = z.infer<typeof NouvelleAnnee>;

/** Les périodes envoyées remplacent la liste : une période absente est supprimée. */
export const ModificationAnnee = z
  .object({
    libelle: libelle.optional(),
    dateDebut: jour.optional(),
    dateFin: jour.optional(),
    statut: z.enum(STATUTS_ANNEE).optional(),
    periodes: z.array(PeriodeSaisie).min(1).max(12).optional(),
  })
  .meta({ id: 'ModificationAnnee' });
export type ModificationAnnee = z.infer<typeof ModificationAnnee>;

/** Année suivante proposée par duplication, à vérifier avant validation (US-01-04, RG-01-05). */
export const PropositionDuplication = z
  .object({
    libelle: z.string(),
    dateDebut: jour,
    dateFin: jour,
    periodes: z.array(z.object({ libelle: z.string(), dateDebut: jour, dateFin: jour })),
    fermetures: z.array(SaisieFermeture),
    dupliqueDe: z.uuid(),
  })
  .meta({ id: 'PropositionDuplication' });
export type PropositionDuplication = z.infer<typeof PropositionDuplication>;

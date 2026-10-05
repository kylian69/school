import { z } from 'zod';
import { FORMULES, MODULE_CODES } from './modules.js';

/** Contrats de la console de la plateforme (module 19, écrans E-19-01 à E-19-03). */

const dateIso = z.iso.date();
const email = z.email().max(254).toLowerCase();

export const ETATS_CLIENT = ['actif', 'suspendu', 'resilie', 'supprime'] as const;
export const ROLES_PLATEFORME = ['super_administrateur', 'support'] as const;
export type RolePlateforme = (typeof ROLES_PLATEFORME)[number];

export const NouveauClient = z
  .object({
    type: z.enum(['organisation', 'groupe']),
    raisonSociale: z.string().trim().min(2).max(200),
    siren: z
      .string()
      .regex(/^\d{9}$/, 'Le SIREN compte 9 chiffres.')
      .optional(),
    sousDomaine: z.string().trim().toLowerCase(),
    formule: z.enum(FORMULES),
    volumeApprenants: z.int().min(1).max(1_000_000),
    dateDebut: dateIso,
    dateFin: dateIso,
    referenceDevis: z.string().trim().max(100).optional(),
    contactFacturation: z.object({ nom: z.string().trim().min(2).max(200), email }).optional(),
    administrateur: z.object({ nom: z.string().trim().min(2).max(200), email }),
    ecoles: z
      .array(
        z.object({
          nom: z.string().trim().min(2).max(200),
          nomAffichage: z.string().trim().min(1).max(60),
        }),
      )
      .min(1)
      .max(50),
  })
  .refine((v) => v.dateFin > v.dateDebut, {
    path: ['dateFin'],
    message: 'La fin du contrat doit suivre son début.',
  })
  .refine((v) => v.type === 'groupe' || v.ecoles.length === 1, {
    path: ['ecoles'],
    message: 'Un client « organisation » compte une seule école ; choisir « groupe » sinon.',
  })
  .meta({ id: 'NouveauClient' });
export type NouveauClient = z.infer<typeof NouveauClient>;

export const ClientResume = z
  .object({
    id: z.uuid(),
    raisonSociale: z.string(),
    sousDomaine: z.string(),
    etat: z.enum(ETATS_CLIENT),
    type: z.enum(['organisation', 'groupe']),
    formule: z.enum(FORMULES).nullable(),
    volumeApprenants: z.int().nullable(),
    dateFin: dateIso.nullable(),
    ecoles: z.int(),
  })
  .meta({ id: 'ClientResume' });
export type ClientResume = z.infer<typeof ClientResume>;

export const ListeClients = z
  .object({ clients: z.array(ClientResume) })
  .meta({ id: 'ListeClients' });

export const FiltreClients = z.object({
  q: z.string().trim().max(100).optional(),
  etat: z.enum(ETATS_CLIENT).optional(),
  formule: z.enum(FORMULES).optional(),
});
export type FiltreClients = z.infer<typeof FiltreClients>;

export const ClientFiche = z
  .object({
    id: z.uuid(),
    raisonSociale: z.string(),
    siren: z.string().nullable(),
    sousDomaine: z.string(),
    etat: z.enum(ETATS_CLIENT),
    type: z.enum(['organisation', 'groupe']),
    administrateur: z.object({ nom: z.string(), email: z.string() }),
    contactFacturation: z.object({ nom: z.string(), email: z.string() }).nullable(),
    contrat: z
      .object({
        formule: z.enum(FORMULES),
        volumeApprenants: z.int(),
        dateDebut: dateIso,
        dateFin: dateIso,
        referenceDevis: z.string().nullable(),
      })
      .nullable(),
    ecoles: z.array(
      z.object({
        id: z.uuid(),
        nom: z.string(),
        nomAffichage: z.string(),
        acces: z.enum(['complet', 'lecture_seule', 'ferme']),
      }),
    ),
    modules: z.array(
      z.object({
        module: z.enum(MODULE_CODES),
        actif: z.boolean(),
        origine: z.enum(['formule', 'exception']),
      }),
    ),
    historique: z.array(
      z.object({
        etatPrecedent: z.enum(ETATS_CLIENT).nullable(),
        etat: z.enum(ETATS_CLIENT),
        motif: z.string(),
        survenuLe: z.iso.datetime({ offset: true }),
      }),
    ),
  })
  .meta({ id: 'ClientFiche' });
export type ClientFiche = z.infer<typeof ClientFiche>;

export const ChangementEtatClient = z
  .object({
    etat: z.enum(['actif', 'suspendu', 'resilie']),
    motif: z.string().trim().min(3).max(500),
  })
  .meta({ id: 'ChangementEtatClient' });
export type ChangementEtatClient = z.infer<typeof ChangementEtatClient>;

export const ExceptionModule = z
  .object({ module: z.enum(MODULE_CODES), actif: z.boolean() })
  .meta({ id: 'ExceptionModule' });
export type ExceptionModule = z.infer<typeof ExceptionModule>;

import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ApercuImport, ValidationImport } from '@scolaly/contracts';
import {
  attribution,
  enregistrerAudit,
  importPersonnes,
  personne,
  role,
  type Transaction,
} from '@scolaly/db';
import {
  analyserLignes,
  CHAMPS_OBLIGATOIRES,
  verifierAnnulation,
  verifierValidation,
  type ChampImport,
  type Correspondance,
  type RefusAnnulation,
  type RefusValidation,
} from '@scolaly/domain';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { RequestContext } from '../../access/request-context.js';
import { aujourdhui } from '../../shared/dates.js';
import { attribuerMatricule } from '../../shared/matricule.js';
import { ObjectStorage } from '../../shared/storage/object-storage.js';
import { OBJECT_STORAGE } from '../../shared/tokens.js';
import { ImportsService, type ResultatImport as Resultat } from './imports.service.js';

const MESSAGES_VALIDATION: Record<RefusValidation, string> = {
  'colonnes-manquantes':
    'Associez d’abord les colonnes obligatoires (nom, prénom, email) à l’étape « Correspondance ».',
  'lignes-en-erreur':
    'Le fichier contient des lignes en erreur. Corrigez-les, ou choisissez de n’importer que les lignes valides.',
  'rien-a-importer': 'Aucune ligne à importer : toutes sont en erreur ou déjà présentes.',
};

const MESSAGES_ANNULATION: Record<RefusAnnulation, string> = {
  'non-valide': 'Seul un import validé peut être annulé.',
  'delai-depasse': 'Un import ne s’annule que dans les 24 h qui suivent sa validation.',
  'deja-utilise':
    'Des fiches créées par cet import ont déjà servi (invitation, compte ou rôle) : l’import ne peut plus être annulé. Supprimez ou corrigez les fiches une à une.',
};

/** Rôle donné aux personnes créées, selon le type d'import. */
const ROLE_DU_TYPE = {
  apprenants: 'apprenant',
  intervenants: 'intervenant',
  personnel: null,
} as const;

/** Champs repris d'une ligne lors d'une mise à jour (l'email identifie la fiche). */
const CHAMPS_MIS_A_JOUR: readonly ChampImport[] = [
  'civilite',
  'nom',
  'nomUsage',
  'prenom',
  'telephone',
  'adresseLigne1',
  'codePostal',
  'ville',
  'dateNaissance',
  'lieuNaissance',
  'ine',
];

interface Rapport {
  lignes: { numero: number; motifs: { champ: string; message: string }[] }[];
}

/** Valeurs d'une fiche telles qu'en base, pour les champs importables. */
const valeurs = (donnees: Partial<Record<ChampImport, string>>, champs: readonly ChampImport[]) =>
  Object.fromEntries(champs.flatMap((c) => (donnees[c] ? [[c, donnees[c]]] : [])));

/** Assistant d'import, étape 4 : validation, rapport des rejets, annulation (RG-01-19, RG-01-20). */
@Injectable()
export class ValidationImportService {
  constructor(
    private readonly imports: ImportsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async valider(
    tx: Transaction,
    access: Access,
    id: string,
    { mode, existants }: ValidationImport,
    adresseIp: string,
  ): Promise<ApercuImport> {
    const ligne = await this.imports.charger(tx, id);
    if (ligne.statut !== 'en_preparation') {
      throw new ConflictException('Cet import est déjà validé ou annulé.');
    }
    const tableau = await this.imports.tableau(ligne);
    const correspondance = ligne.correspondance as Correspondance;
    const analyse = analyserLignes(
      tableau.colonnes,
      tableau.lignes,
      correspondance,
      await this.imports.existant(tx),
    );
    const associes = new Set(Object.values(correspondance));
    const enErreur = analyse.filter((l) => l.erreurs.length > 0);
    const existe = (l: (typeof analyse)[number]) =>
      l.avertissements.some((a) => a.code === 'email-existant');
    const aTraiter = analyse.filter(
      (l) => l.erreurs.length === 0 && (existants === 'mettre-a-jour' || !existe(l)),
    );
    const verdict = verifierValidation({
      mode,
      champsManquants: CHAMPS_OBLIGATOIRES.filter((c) => !associes.has(c)).length,
      lignesValides: aTraiter.length,
      lignesEnErreur: enErreur.length,
    });
    if (!verdict.ok) {
      throw new BadRequestException({
        message: MESSAGES_VALIDATION[verdict.refus],
        details: [`mode : ${MESSAGES_VALIDATION[verdict.refus]}`],
      });
    }

    const codeRole = ROLE_DU_TYPE[ligne.type];
    const [roleDuType] = codeRole
      ? await tx.select({ id: role.id }).from(role).where(eq(role.code, codeRole))
      : [];
    const resultat: Resultat = { crees: [], modifies: [], attributions: [] };
    for (const l of aTraiter) {
      const donnees = l.donnees;
      if (existe(l)) {
        const [fiche] = await tx
          .select()
          .from(personne)
          .where(
            and(sql`lower(${personne.email}) = ${donnees.email ?? ''}`, isNull(personne.deletedAt)),
          );
        if (!fiche) continue;
        const changement = valeurs(donnees, CHAMPS_MIS_A_JOUR);
        if (donnees.matricule && !fiche.matricule) changement.matricule = donnees.matricule;
        const avant = Object.fromEntries(
          Object.keys(changement).map((c) => [c, fiche[c as keyof typeof fiche]]),
        );
        await tx
          .update(personne)
          .set({ ...changement, updatedBy: access.userId })
          .where(eq(personne.id, fiche.id));
        resultat.modifies.push({ id: fiche.id, avant });
        continue;
      }
      const [creee] = await tx
        .insert(personne)
        .values({
          ...valeurs(donnees, CHAMPS_MIS_A_JOUR),
          nom: donnees.nom ?? '',
          prenom: donnees.prenom ?? '',
          email: donnees.email ?? '',
          civilite: (donnees.civilite as 'madame' | 'monsieur' | undefined) ?? null,
          matricule: donnees.matricule ?? (await attribuerMatricule(tx, access.organisationId)),
          organisationId: access.organisationId,
          createdBy: access.userId,
        })
        .returning({ id: personne.id });
      if (!creee) throw new Error('Création d’une fiche importée impossible.');
      resultat.crees.push(creee.id);
      if (roleDuType) {
        const [donne] = await tx
          .insert(attribution)
          .values({
            organisationId: access.organisationId,
            personneId: creee.id,
            roleId: roleDuType.id,
            perimetreType: 'soi',
            debut: aujourdhui(),
            createdBy: access.userId,
          })
          .returning({ id: attribution.id });
        if (donne) resultat.attributions.push(donne.id);
      }
    }

    // RG-01-19 : rapport des lignes rejetées (en erreur, ou fiche existante ignorée).
    const rapport: Rapport = {
      lignes: analyse.flatMap((l, rang) => {
        if (l.erreurs.length > 0) {
          return [
            {
              numero: rang + 2,
              motifs: l.erreurs.map((e) => ({ champ: e.champ, message: e.code })),
            },
          ];
        }
        if (existe(l) && existants === 'ignorer') {
          return [{ numero: rang + 2, motifs: [{ champ: 'email', message: 'fiche-existante' }] }];
        }
        return [];
      }),
    };
    const maintenant = new Date();
    await tx
      .update(importPersonnes)
      .set({
        statut: 'valide',
        valideLe: maintenant,
        crees: resultat.crees.length,
        modifies: resultat.modifies.length,
        rejetes: rapport.lignes.length,
        resultat,
        rapport,
        updatedBy: access.userId,
      })
      .where(eq(importPersonnes.id, id));
    // RG-01-20 : chaque import est enregistré, avec son auteur et son bilan.
    await enregistrerAudit(tx, {
      action: 'import.valider',
      objetType: 'import_personnes',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      apres: {
        fichier: ligne.fichierNom,
        type: ligne.type,
        mode,
        existants,
        crees: resultat.crees.length,
        modifies: resultat.modifies.length,
        rejetes: rapport.lignes.length,
      },
    });
    // Le fichier n'est plus utile une fois l'import enregistré : le bilan et le rapport sont en base.
    RequestContext.apresValidation(() => this.storage.delete(ligne.fichierCle));
    return this.imports.lire(tx, id);
  }

  async annuler(
    tx: Transaction,
    access: Access,
    id: string,
    adresseIp: string,
  ): Promise<ApercuImport> {
    const ligne = await this.imports.charger(tx, id);
    const resultat = (ligne.resultat ?? { crees: [], modifies: [], attributions: [] }) as Resultat;
    const verdict = verifierAnnulation({
      valideLe: ligne.statut === 'valide' ? ligne.valideLe : null,
      maintenant: new Date(),
      fichesUtilisees: await this.imports.fichesUtilisees(tx, resultat),
    });
    if (!verdict.ok) throw new ConflictException(MESSAGES_ANNULATION[verdict.refus]);
    const suppression = { deletedAt: new Date(), updatedBy: access.userId };
    if (resultat.attributions.length > 0) {
      await tx
        .update(attribution)
        .set(suppression)
        .where(inArray(attribution.id, resultat.attributions));
    }
    if (resultat.crees.length > 0) {
      // Les matricules attribués ne seront jamais réattribués (RG-01-06).
      await tx.update(personne).set(suppression).where(inArray(personne.id, resultat.crees));
    }
    for (const { id: ficheId, avant } of resultat.modifies) {
      await tx
        .update(personne)
        .set({ ...avant, updatedBy: access.userId })
        .where(eq(personne.id, ficheId));
    }
    await tx
      .update(importPersonnes)
      .set({ statut: 'annule', annuleLe: new Date(), updatedBy: access.userId })
      .where(eq(importPersonnes.id, id));
    await enregistrerAudit(tx, {
      action: 'import.annuler',
      objetType: 'import_personnes',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: { crees: resultat.crees.length, modifies: resultat.modifies.length },
    });
    return this.imports.lire(tx, id);
  }

  /** RG-01-19 : rapport des lignes rejetées, au format CSV (séparateur « ; », UTF-8). */
  async rapportCsv(tx: Transaction, id: string, libelle: (code: string) => string) {
    const ligne = await this.imports.charger(tx, id);
    const rapport = (ligne.rapport ?? { lignes: [] }) as Rapport;
    const echapper = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const lignes = rapport.lignes.flatMap((l) =>
      l.motifs.map((m) => [String(l.numero), m.champ, libelle(m.message)].map(echapper).join(';')),
    );
    return {
      nom: `rejets-${ligne.fichierNom.replace(/\.[^.]+$/, '')}.csv`,
      contenu: `${String.fromCharCode(0xfeff)}${['Ligne;Champ;Motif', ...lignes].join('\r\n')}\r\n`,
    };
  }
}

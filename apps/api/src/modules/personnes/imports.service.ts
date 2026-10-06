import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IMPORT_TAILLE_MAX,
  TYPES_FICHIER_IMPORT,
  type ApercuImport,
  type ChampImport,
  type LigneApercu,
  type ModificationCorrespondance,
  type NouvelImport,
} from '@scolaly/contracts';
import { attribution, importPersonnes, invitation, personne, type Transaction } from '@scolaly/db';
import {
  analyserLignes,
  CHAMPS_OBLIGATOIRES,
  lireCsv,
  proposerCorrespondance,
  type Correspondance,
  type Probleme,
  type ProblemeLigne,
  type TableauLu,
  verifierAnnulation,
} from '@scolaly/domain';
import { and, count, desc, eq, inArray, isNull, lt, ne, notInArray } from 'drizzle-orm';
import { readSheet } from 'read-excel-file/node';
import type { Access } from '../../access/access-resolver.js';
import { ObjectStorage } from '../../shared/storage/object-storage.js';
import { UploadRejectedError, type UploadService } from '../../shared/storage/uploads.js';
import { OBJECT_STORAGE, UPLOADS } from '../../shared/tokens.js';

/** Lignes renvoyées dans l'aperçu : toutes les lignes à revoir, puis un échantillon des autres. */
const APERCU_PROBLEMES_MAX = 1000;
const APERCU_VALIDES_MAX = 20;
/** Reprise d'un import interrompu : fichier et correspondance conservés 24 h (section 7). */
const DUREE_REPRISE_MS = 24 * 3_600_000;

const MESSAGES: Record<ProblemeLigne, string> = {
  obligatoire: 'Valeur obligatoire manquante.',
  'email-invalide': 'Adresse email invalide.',
  'email-en-double': 'Cet email figure déjà plus haut dans le fichier.',
  'email-existant': 'Une fiche porte déjà cet email : elle sera mise à jour si vous le choisissez.',
  'date-invalide': 'Date illisible : utilisez le format JJ/MM/AAAA.',
  'date-interpretee': 'Date convertie : vérifiez la valeur retenue.',
  'ine-invalide': 'L’INE compte 11 caractères, terminés par une lettre.',
  'ine-existant': 'Une autre fiche de l’école porte déjà cet INE.',
  'matricule-pris': 'Ce matricule est déjà attribué dans l’école.',
  'civilite-inconnue': 'Civilité non reconnue (Madame ou Monsieur) : elle restera vide.',
};

const FORMATS = new Map<string, 'csv' | 'xlsx'>(Object.entries(TYPES_FICHIER_IMPORT));

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

/** Texte d'un CSV : UTF-8 s'il est valide, sinon Windows-1252 (RG-01-17, détection automatique). */
function decoder(contenu: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(contenu);
  } catch {
    return new TextDecoder('windows-1252').decode(contenu);
  }
}

/** Valeur d'une cellule Excel en texte ; une date devient AAAA-MM-JJ. */
function cellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  if (valeur instanceof Date) return valeur.toISOString().slice(0, 10);
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
  if (typeof valeur === 'number' || typeof valeur === 'string') return String(valeur);
  return '';
}

/** Ce qu'un import validé a créé ou modifié, pour pouvoir l'annuler (RG-01-20). */
export interface ResultatImport {
  crees: string[];
  modifies: { id: string; avant: Record<string, unknown> }[];
  attributions: string[];
}

interface RapportImport {
  lignes: { numero: number; motifs: { champ: string; message: string }[] }[];
}

/** Libellé d'un motif de rejet (codes du domaine, ou « fiche-existante »). */
export const libelleMotif = (code: string) =>
  code === 'fiche-existante'
    ? 'Une fiche porte déjà cet email : ligne ignorée.'
    : code in MESSAGES
      ? MESSAGES[code as ProblemeLigne]
      : code;

const message = (p: Probleme) => ({
  champ: p.champ,
  message: MESSAGES[p.code],
  ...(p.valeur !== undefined ? { valeur: p.valeur } : {}),
});

type LigneImport = typeof importPersonnes.$inferSelect;

/** Assistant d'import des personnes, étapes 1 à 3 : fichier, correspondance, aperçu (RG-01-18). */
@Injectable()
export class ImportsService {
  constructor(
    @Inject(UPLOADS) private readonly uploads: UploadService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async creer(
    tx: Transaction,
    access: Access,
    entree: NouvelImport,
    contenu: Buffer | undefined,
    typeContenu: string | undefined,
  ): Promise<ApercuImport> {
    const fichierType = FORMATS.get((typeContenu ?? '').split(';')[0] ?? '');
    if (!fichierType || !Buffer.isBuffer(contenu)) {
      throw invalide('fichier', 'Déposez un fichier CSV ou Excel (.xlsx).');
    }
    if (contenu.length > IMPORT_TAILLE_MAX) {
      throw invalide(
        'fichier',
        'Le fichier dépasse 10 Mo (environ 20 000 lignes). Découpez-le en plusieurs fichiers.',
      );
    }
    await this.purgerAbandonnes(tx);
    let stocke;
    try {
      stocke = await this.uploads.store(access.organisationId, 'imports', contenu, {
        maxBytes: IMPORT_TAILLE_MAX,
        types: [fichierType],
      });
    } catch (erreur) {
      if (erreur instanceof UploadRejectedError) throw invalide('fichier', erreur.message);
      throw erreur;
    }
    const tableau = await this.lireTableau(contenu, fichierType);
    if (tableau.colonnes.length === 0) {
      throw invalide(
        'fichier',
        'Le fichier est vide : la première ligne doit porter les intitulés.',
      );
    }
    const [creee] = await tx
      .insert(importPersonnes)
      .values({
        organisationId: access.organisationId,
        type: entree.type,
        fichierCle: stocke.key,
        fichierNom: entree.fichier,
        fichierType,
        colonnes: tableau.colonnes,
        correspondance: await this.correspondanceInitiale(tx, entree.type, tableau.colonnes),
        lignes: tableau.lignes.length,
        expireLe: new Date(Date.now() + DUREE_REPRISE_MS),
        createdBy: access.userId,
      })
      .returning();
    if (!creee) throw new Error('Création de l’import impossible.');
    return this.apercu(tx, creee, tableau);
  }

  async lire(tx: Transaction, id: string): Promise<ApercuImport> {
    return this.apercu(tx, await this.charger(tx, id));
  }

  async modifierCorrespondance(
    tx: Transaction,
    access: Access,
    id: string,
    { correspondance }: ModificationCorrespondance,
  ): Promise<ApercuImport> {
    const ligne = await this.charger(tx, id);
    if (ligne.statut !== 'en_preparation') {
      throw invalide('correspondance', 'Cet import est déjà validé ou annulé.');
    }
    const inconnues = Object.keys(correspondance).filter((c) => !ligne.colonnes.includes(c));
    if (inconnues.length > 0) {
      throw invalide('correspondance', `Colonnes absentes du fichier : ${inconnues.join(', ')}.`);
    }
    const champs = Object.values(correspondance).filter((c): c is ChampImport => c !== null);
    const doubles = champs.filter((c, i) => champs.indexOf(c) !== i);
    if (doubles.length > 0) {
      throw invalide('correspondance', 'Chaque champ ne peut venir que d’une seule colonne.');
    }
    const complete = Object.fromEntries(ligne.colonnes.map((c) => [c, correspondance[c] ?? null]));
    const [modifie] = await tx
      .update(importPersonnes)
      .set({ correspondance: complete, updatedBy: access.userId })
      .where(eq(importPersonnes.id, id))
      .returning();
    if (!modifie) throw new NotFoundException('Import introuvable dans cette école.');
    return this.apercu(tx, modifie);
  }

  /** Tableau lu depuis le fichier conservé (reprise d'un import interrompu). */
  async tableau(ligne: LigneImport): Promise<TableauLu> {
    return this.lireTableau(await this.storage.get(ligne.fichierCle), ligne.fichierType);
  }

  /** Ce que l'école contient déjà : emails, INE et matricules (même supprimés, RG-01-06). */
  async existant(tx: Transaction) {
    const fiches = await tx
      .select({
        email: personne.email,
        ine: personne.ine,
        matricule: personne.matricule,
        supprimee: personne.deletedAt,
      })
      .from(personne);
    const actives = fiches.filter((f) => f.supprimee === null);
    return {
      emails: new Set(actives.map((f) => f.email.toLowerCase())),
      ines: new Set(actives.flatMap((f) => (f.ine ? [f.ine] : []))),
      matricules: new Set(fiches.flatMap((f) => (f.matricule ? [f.matricule] : []))),
    };
  }

  /** Fiches créées par l'import qui ont servi depuis (compte, invitation, autre rôle). */
  async fichesUtilisees(tx: Transaction, resultat: ResultatImport): Promise<number> {
    if (resultat.crees.length === 0) return 0;
    const [{ comptes } = { comptes: 0 }] = await tx
      .select({ comptes: count() })
      .from(personne)
      .where(and(inArray(personne.id, resultat.crees), ne(personne.compteEtat, 'cree')));
    const [{ invitations } = { invitations: 0 }] = await tx
      .select({ invitations: count() })
      .from(invitation)
      .where(inArray(invitation.personneId, resultat.crees));
    const [{ roles } = { roles: 0 }] = await tx
      .select({ roles: count() })
      .from(attribution)
      .where(
        and(
          inArray(attribution.personneId, resultat.crees),
          resultat.attributions.length > 0
            ? notInArray(attribution.id, resultat.attributions)
            : undefined,
        ),
      );
    return comptes + invitations + roles;
  }

  /**
   * Imports abandonnés depuis plus de 24 h : leur fichier est supprimé (section 7). Une purge
   * planifiée par le worker complétera ce nettoyage, fait ici à chaque nouveau dépôt.
   */
  private async purgerAbandonnes(tx: Transaction) {
    const abandonnes = await tx
      .select({ id: importPersonnes.id, cle: importPersonnes.fichierCle })
      .from(importPersonnes)
      .where(
        and(
          eq(importPersonnes.statut, 'en_preparation'),
          isNull(importPersonnes.deletedAt),
          lt(importPersonnes.expireLe, new Date()),
        ),
      );
    for (const { id, cle } of abandonnes) {
      await this.storage.delete(cle);
      await tx
        .update(importPersonnes)
        .set({ deletedAt: new Date() })
        .where(eq(importPersonnes.id, id));
    }
  }

  async charger(tx: Transaction, id: string): Promise<LigneImport> {
    const [ligne] = await tx
      .select()
      .from(importPersonnes)
      .where(and(eq(importPersonnes.id, id), isNull(importPersonnes.deletedAt)));
    if (!ligne) throw new NotFoundException('Import introuvable dans cette école.');
    return ligne;
  }

  private async lireTableau(contenu: Buffer, fichierType: string): Promise<TableauLu> {
    if (fichierType === 'csv') return lireCsv(decoder(contenu));
    let lignes;
    try {
      lignes = await readSheet(contenu);
    } catch {
      throw invalide(
        'fichier',
        'Ce classeur Excel est illisible. Enregistrez-le de nouveau au format .xlsx, ou en CSV.',
      );
    }
    const texte = lignes.map((l) => l.map(cellule)).filter((l) => l.some((v) => v.trim() !== ''));
    const [colonnes = [], ...donnees] = texte;
    return { colonnes: colonnes.map((c) => c.trim()), lignes: donnees };
  }

  /** RG-01-18 : la correspondance du dernier import de même type est reprise si elle convient. */
  private async correspondanceInitiale(
    tx: Transaction,
    type: NouvelImport['type'],
    colonnes: readonly string[],
  ): Promise<Correspondance> {
    const [precedent] = await tx
      .select({ correspondance: importPersonnes.correspondance })
      .from(importPersonnes)
      .where(eq(importPersonnes.type, type))
      .orderBy(desc(importPersonnes.createdAt))
      .limit(1);
    const memorisee = precedent?.correspondance;
    if (memorisee && colonnes.every((c) => Object.hasOwn(memorisee, c))) {
      return Object.fromEntries(
        colonnes.map((c) => [c, (memorisee[c] ?? null) as ChampImport | null]),
      );
    }
    return proposerCorrespondance(colonnes);
  }

  private async apercu(
    tx: Transaction,
    ligne: LigneImport,
    dejaLu?: TableauLu,
  ): Promise<ApercuImport> {
    if (ligne.statut !== 'en_preparation') return this.bilan(tx, ligne);
    const tableau = dejaLu ?? (await this.tableau(ligne));
    const correspondance = ligne.correspondance as Correspondance;
    const analyse = analyserLignes(
      tableau.colonnes,
      tableau.lignes,
      correspondance,
      await this.existant(tx),
    );
    const associes = new Set(Object.values(correspondance));
    const lignes: LigneApercu[] = analyse.map((l, rang) => ({
      numero: rang + 2,
      donnees: l.donnees,
      erreurs: l.erreurs.map(message),
      avertissements: l.avertissements.map(message),
    }));
    const aRevoir = lignes.filter((l) => l.erreurs.length + l.avertissements.length > 0);
    const autres = lignes.filter((l) => l.erreurs.length + l.avertissements.length === 0);
    return {
      id: ligne.id,
      type: ligne.type,
      statut: ligne.statut,
      fichierNom: ligne.fichierNom,
      colonnes: tableau.colonnes,
      correspondance,
      champsManquants: CHAMPS_OBLIGATOIRES.filter((c) => !associes.has(c)),
      totaux: {
        lignes: lignes.length,
        valides: lignes.filter((l) => l.erreurs.length === 0).length,
        enErreur: lignes.filter((l) => l.erreurs.length > 0).length,
        avecAvertissement: lignes.filter((l) => l.avertissements.length > 0).length,
        existantes: analyse.filter((l) => l.avertissements.some((a) => a.code === 'email-existant'))
          .length,
      },
      lignes: [...aRevoir.slice(0, APERCU_PROBLEMES_MAX), ...autres.slice(0, APERCU_VALIDES_MAX)],
      expireLe: ligne.expireLe.toISOString(),
      bilan: null,
    };
  }

  /** Import validé ou annulé : bilan et lignes rejetées, sans relire le fichier (supprimé). */
  private async bilan(tx: Transaction, ligne: LigneImport): Promise<ApercuImport> {
    const rapport = (ligne.rapport ?? { lignes: [] }) as RapportImport;
    const resultat = (ligne.resultat ?? {
      crees: [],
      modifies: [],
      attributions: [],
    }) as ResultatImport;
    const crees = ligne.crees ?? 0;
    const modifies = ligne.modifies ?? 0;
    const rejetes = ligne.rejetes ?? 0;
    const valideLe = ligne.valideLe ?? ligne.createdAt;
    const annulable =
      ligne.statut === 'valide' &&
      verifierAnnulation({
        valideLe,
        maintenant: new Date(),
        fichesUtilisees: await this.fichesUtilisees(tx, resultat),
      }).ok;
    return {
      id: ligne.id,
      type: ligne.type,
      statut: ligne.statut,
      fichierNom: ligne.fichierNom,
      colonnes: ligne.colonnes,
      correspondance: ligne.correspondance as Correspondance,
      champsManquants: [],
      totaux: {
        lignes: ligne.lignes,
        valides: crees + modifies,
        enErreur: rejetes,
        avecAvertissement: 0,
        existantes: modifies,
      },
      lignes: rapport.lignes.map((l) => ({
        numero: l.numero,
        donnees: {},
        erreurs: l.motifs.map((m) => ({
          champ: m.champ as ChampImport,
          message: libelleMotif(m.message),
        })),
        avertissements: [],
      })),
      expireLe: ligne.expireLe.toISOString(),
      bilan: { crees, modifies, rejetes, valideLe: valideLe.toISOString(), annulable },
    };
  }
}

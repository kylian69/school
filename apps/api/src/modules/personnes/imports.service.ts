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
import { importPersonnes, personne, type Transaction } from '@scolaly/db';
import {
  analyserLignes,
  CHAMPS_OBLIGATOIRES,
  lireCsv,
  proposerCorrespondance,
  type Correspondance,
  type Probleme,
  type ProblemeLigne,
  type TableauLu,
} from '@scolaly/domain';
import { and, desc, eq, isNull } from 'drizzle-orm';
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
  return String(valeur as string | number);
}

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
    };
  }
}

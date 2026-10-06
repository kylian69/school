import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { emailPhotoRefusee, type DecisionPhoto, type PhotoPersonne } from '@scolaly/contracts';
import { enregistrerAudit, organisation, personne, type Transaction } from '@scolaly/db';
import { cadrageCarre, PHOTO_COTE, PHOTO_TAILLE_MAX, verifierDecisionPhoto } from '@scolaly/domain';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Access } from '../../access/access-resolver.js';
import { RequestContext } from '../../access/request-context.js';
import type { Env } from '../../config/env.js';
import type { EmailsQueue } from '../../shared/emails.js';
import { ObjectStorage } from '../../shared/storage/object-storage.js';
import {
  detectType,
  UploadRejectedError,
  type UploadService,
} from '../../shared/storage/uploads.js';
import { EMAILS, ENV, OBJECT_STORAGE, UPLOADS } from '../../shared/tokens.js';

type LignePersonne = typeof personne.$inferSelect;

const invalide = (message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`photo : ${message}`],
  });

/** Dernier segment de la clé de stockage : version de l'adresse de la photo (cache). */
const version = (cle: string) => cle.slice(cle.lastIndexOf('/') + 1, cle.lastIndexOf('/') + 17);

/**
 * Photos des personnes (US-01-20 ; RG-01-26, RG-01-27). L'image reçue est recadrée en carré,
 * ramenée à 512 px et réencodée en JPEG : les métadonnées (position GPS, appareil) disparaissent
 * et seul le résultat est conservé.
 */
@Injectable()
export class PhotosService {
  constructor(
    @Inject(UPLOADS) private readonly uploads: UploadService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(EMAILS) private readonly emails: EmailsQueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Photo telle que la voit la personne connectée (la photo en attente : pour la valider). */
  photoDe(p: LignePersonne, peutValider: boolean): PhotoPersonne {
    const base = `/api/personnes/${p.id}/photo`;
    return {
      url: p.photoCle ? `${base}?v=${version(p.photoCle)}` : null,
      attenteUrl:
        peutValider && p.photoAttenteCle
          ? `${base}?attente=1&v=${version(p.photoAttenteCle)}`
          : null,
      statut: p.photoStatut,
      motif: p.photoMotif,
    };
  }

  /** Recadrage et réencodage ; une image illisible est refusée. */
  async traiter(contenu: Buffer | undefined): Promise<Buffer> {
    if (!Buffer.isBuffer(contenu) || contenu.length === 0) {
      throw invalide('Déposez une photo au format JPEG ou PNG.');
    }
    if (contenu.length > PHOTO_TAILLE_MAX) {
      throw invalide('La photo dépasse 5 Mo. Réduisez-la puis réessayez.');
    }
    const type = detectType(contenu);
    if (type !== 'jpeg' && type !== 'png')
      throw invalide('Seuls les formats JPEG et PNG sont acceptés.');
    try {
      // Orientation de l'appareil appliquée avant le recadrage.
      const orientee = await sharp(contenu).rotate().toBuffer({ resolveWithObject: true });
      return await sharp(orientee.data)
        .extract(cadrageCarre(orientee.info.width, orientee.info.height))
        .resize(PHOTO_COTE, PHOTO_COTE)
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw invalide(
        'Cette image est illisible. Enregistrez-la de nouveau en JPEG, puis réessayez.',
      );
    }
  }

  private async stocker(organisationId: string, photo: Buffer): Promise<string> {
    try {
      return (
        await this.uploads.store(organisationId, 'photos', photo, {
          maxBytes: PHOTO_TAILLE_MAX,
          types: ['jpeg'],
        })
      ).key;
    } catch (erreur) {
      if (erreur instanceof UploadRejectedError) throw invalide(erreur.message);
      throw erreur;
    }
  }

  /**
   * Dépôt d'une photo : par la scolarité, elle est validée d'office ; par la personne elle-même,
   * elle attend la validation (RG-01-26).
   */
  async deposer(
    tx: Transaction,
    access: Access,
    fiche: LignePersonne,
    contenu: Buffer | undefined,
    origine: 'scolarite' | 'personne',
    adresseIp: string,
  ): Promise<LignePersonne> {
    const cle = await this.stocker(access.organisationId, await this.traiter(contenu));
    const valeurs =
      origine === 'scolarite'
        ? {
            photoCle: cle,
            photoAttenteCle: null,
            photoStatut: 'validee' as const,
            photoMotif: null,
          }
        : { photoAttenteCle: cle, photoStatut: 'en_attente' as const, photoMotif: null };
    const [apres] = await tx
      .update(personne)
      .set({ ...valeurs, updatedBy: access.userId })
      .where(eq(personne.id, fiche.id))
      .returning();
    if (!apres) throw new NotFoundException('Personne introuvable dans cette école.');
    // Les photos remplacées ne sont pas gardées (minimisation) : supprimées après la validation.
    this.supprimerApres(
      origine === 'scolarite' ? [fiche.photoCle, fiche.photoAttenteCle] : [fiche.photoAttenteCle],
    );
    await enregistrerAudit(tx, {
      action: 'photo.deposer',
      objetType: 'personne',
      objetId: fiche.id,
      auteurId: access.userId,
      adresseIp,
      apres: { origine, statut: valeurs.photoStatut },
    });
    return apres;
  }

  /** RG-01-26 : la scolarité valide la photo déposée, ou la refuse avec un motif notifié. */
  async decider(
    tx: Transaction,
    access: Access,
    fiche: LignePersonne,
    { decision, motif }: DecisionPhoto,
    adresseIp: string,
  ): Promise<LignePersonne> {
    const verdict = verifierDecisionPhoto(fiche.photoStatut, decision, motif);
    if (!verdict.ok) {
      if (verdict.refus === 'rien-a-valider') {
        throw new ConflictException('Aucune photo n’attend de validation pour cette personne.');
      }
      throw new BadRequestException({
        message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
        details: ['motif : Indiquez le motif du refus : il sera expliqué à la personne.'],
      });
    }
    const attente = fiche.photoAttenteCle;
    const valeurs =
      decision === 'valider'
        ? {
            photoCle: attente,
            photoAttenteCle: null,
            photoStatut: 'validee' as const,
            photoMotif: null,
          }
        : {
            photoAttenteCle: null,
            photoStatut: 'refusee' as const,
            photoMotif: motif?.trim() ?? null,
          };
    const [apres] = await tx
      .update(personne)
      .set({ ...valeurs, updatedBy: access.userId })
      .where(eq(personne.id, fiche.id))
      .returning();
    if (!apres) throw new NotFoundException('Personne introuvable dans cette école.');
    await enregistrerAudit(tx, {
      action: decision === 'valider' ? 'photo.valider' : 'photo.refuser',
      objetType: 'personne',
      objetId: fiche.id,
      auteurId: access.userId,
      adresseIp,
      apres: { statut: valeurs.photoStatut, ...(decision === 'refuser' ? { motif } : {}) },
    });
    this.supprimerApres(decision === 'valider' ? [fiche.photoCle] : [attente]);
    if (decision === 'refuser') {
      const [ecole] = await tx
        .select({ nom: organisation.nom })
        .from(organisation)
        .where(eq(organisation.id, access.organisationId));
      const job = emailPhotoRefusee({
        to: fiche.email,
        prenom: fiche.prenom,
        ecole: ecole?.nom ?? '',
        motif: motif?.trim() ?? '',
        lien: new URL('/mon-compte', this.env.PUBLIC_URL).toString(),
      });
      RequestContext.apresValidation(() => this.emails.envoyer(job));
    }
    return apres;
  }

  private supprimerApres(cles: readonly (string | null)[]) {
    for (const cle of cles) {
      if (cle) RequestContext.apresValidation(() => this.storage.delete(cle));
    }
  }

  /** Contenu de la photo validée, ou de celle en attente. */
  async image(fiche: LignePersonne, attente: boolean): Promise<Buffer> {
    const cle = attente ? fiche.photoAttenteCle : fiche.photoCle;
    if (!cle) throw new NotFoundException('Pas de photo pour cette personne.');
    return this.storage.get(cle);
  }
}

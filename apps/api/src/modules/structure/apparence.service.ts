import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  cheminLogo,
  LOGO_TAILLE_MAX,
  TYPES_LOGO,
  type ApparenceEcole,
  type TypeLogo,
  type ModificationApparence,
} from '@scolaly/contracts';
import { enregistrerAudit, organisation, type Transaction } from '@scolaly/db';
import { analyserSvg, paletteDe, verifierCouleur } from '@scolaly/domain';
import { contrasteMinimal, valueAt } from '@scolaly/referentials';
import { eq } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { aujourdhui } from '../../shared/dates.js';
import { ObjectStorage } from '../../shared/storage/object-storage.js';
import { UploadRejectedError, type UploadService } from '../../shared/storage/uploads.js';
import { OBJECT_STORAGE, UPLOADS } from '../../shared/tokens.js';

/**
 * Fonds du système de design (packages/ui, theme.css) sur lesquels la couleur principale est lue :
 * fond clair, fond sombre le plus clair (surface2) et surface sombre.
 */
const FONDS = { clair: '#FFFFFF', sombre: '#1B1E28', surfaceSombre: '#13151C' };

const invalide = (champ: string, message: string, extra: Record<string, unknown> = {}) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
    ...extra,
  });

const FORMATS_LOGO = new Map<string, TypeLogo>(Object.entries(TYPES_LOGO));

type LigneOrganisation = typeof organisation.$inferSelect;

/** Apparence de l'école : nom affiché, couleur et logo (E-01-09 ; US-01-14, RG-01-24). */
@Injectable()
export class ApparenceService {
  constructor(
    @Inject(UPLOADS) private readonly uploads: UploadService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Seuil de contraste en vigueur (packages/referentials). */
  private seuil(): number {
    return valueAt(contrasteMinimal, aujourdhui()).valeur;
  }

  async lire(tx: Transaction, organisationId: string): Promise<ApparenceEcole> {
    return this.detail(await this.charger(tx, organisationId));
  }

  async modifier(
    tx: Transaction,
    access: Access,
    changement: ModificationApparence,
    adresseIp: string,
  ): Promise<ApparenceEcole> {
    const avant = await this.charger(tx, access.organisationId);
    let couleur: string | null | undefined = changement.couleur;
    if (couleur) {
      const verdict = verifierCouleur(couleur, FONDS.clair, this.seuil());
      if (!verdict.ok) {
        throw verdict.refus === 'format'
          ? invalide('couleur', 'Couleur attendue au format #RRGGBB, par exemple #4F46E5.')
          : invalide(
              'couleur',
              `Cette couleur n’est pas assez contrastée sur fond blanc (${String(verdict.contraste).replace('.', ',')} pour 1, il faut au moins ${String(this.seuil()).replace('.', ',')}) : le texte serait difficile à lire. Essayez ${verdict.proposition}, une teinte proche.`,
              { proposition: verdict.proposition },
            );
      }
      couleur = verdict.couleur;
    }
    await tx
      .update(organisation)
      .set({
        ...(changement.nomAffichage !== undefined ? { nomAffichage: changement.nomAffichage } : {}),
        ...(couleur !== undefined ? { couleurPrincipale: couleur || null } : {}),
        updatedBy: access.userId,
      })
      .where(eq(organisation.id, access.organisationId));
    const apres = await this.charger(tx, access.organisationId);
    await enregistrerAudit(tx, {
      action: 'apparence.modifier',
      objetType: 'organisation',
      objetId: access.organisationId,
      auteurId: access.userId,
      adresseIp,
      avant: { nomAffichage: avant.nomAffichage, couleur: avant.couleurPrincipale },
      apres: { nomAffichage: apres.nomAffichage, couleur: apres.couleurPrincipale },
    });
    return this.detail(apres);
  }

  /** RG-01-24 : PNG ou SVG autonome, 2 Mo au plus, analysé par l'antivirus. */
  async deposerLogo(
    tx: Transaction,
    access: Access,
    contenu: Buffer | undefined,
    typeContenu: string | undefined,
    adresseIp: string,
  ): Promise<ApparenceEcole> {
    const type = FORMATS_LOGO.get((typeContenu ?? '').split(';')[0] ?? '');
    if (!type || !Buffer.isBuffer(contenu)) {
      throw invalide('logo', 'Déposez un fichier PNG ou SVG.');
    }
    if (contenu.length > LOGO_TAILLE_MAX) {
      throw invalide('logo', 'Le logo dépasse 2 Mo. Réduisez-le ou exportez-le en SVG.');
    }
    if (type === 'svg') {
      const verdict = analyserSvg(contenu.toString('utf8'));
      if (!verdict.ok) {
        throw invalide(
          'logo',
          verdict.refus === 'svg-invalide'
            ? 'Ce fichier n’est pas un SVG valide. Exportez de nouveau le logo depuis votre logiciel.'
            : 'Ce SVG contient du script ou des ressources externes. Exportez-le en « SVG simple » ou en PNG.',
        );
      }
    }
    let stocke;
    try {
      stocke = await this.uploads.store(access.organisationId, 'apparence', contenu, {
        maxBytes: LOGO_TAILLE_MAX,
        types: [type],
      });
    } catch (erreur) {
      if (erreur instanceof UploadRejectedError) throw invalide('logo', erreur.message);
      throw erreur;
    }
    const avant = await this.charger(tx, access.organisationId);
    await tx
      .update(organisation)
      .set({
        logoCle: stocke.key,
        logoType: type,
        logoEmpreinte: stocke.sha256,
        updatedBy: access.userId,
      })
      .where(eq(organisation.id, access.organisationId));
    await enregistrerAudit(tx, {
      action: 'apparence.logo',
      objetType: 'organisation',
      objetId: access.organisationId,
      auteurId: access.userId,
      adresseIp,
      avant: { logo: avant.logoEmpreinte },
      apres: { logo: stocke.sha256, type, taille: stocke.size },
    });
    return this.lire(tx, access.organisationId);
  }

  async retirerLogo(tx: Transaction, access: Access, adresseIp: string): Promise<ApparenceEcole> {
    const avant = await this.charger(tx, access.organisationId);
    await tx
      .update(organisation)
      .set({ logoCle: null, logoType: null, logoEmpreinte: null, updatedBy: access.userId })
      .where(eq(organisation.id, access.organisationId));
    await enregistrerAudit(tx, {
      action: 'apparence.logo-retire',
      objetType: 'organisation',
      objetId: access.organisationId,
      auteurId: access.userId,
      adresseIp,
      avant: { logo: avant.logoEmpreinte },
    });
    return this.lire(tx, access.organisationId);
  }

  /** Logo public de l'école (contenu et type), ou null s'il n'y en a pas. */
  async logo(
    tx: Transaction,
    organisationId: string,
  ): Promise<{ contenu: Buffer; type: string; empreinte: string } | null> {
    const [ligne] = await tx
      .select({
        cle: organisation.logoCle,
        type: organisation.logoType,
        empreinte: organisation.logoEmpreinte,
      })
      .from(organisation)
      .where(eq(organisation.id, organisationId));
    if (!ligne?.cle || !ligne.type || !ligne.empreinte) return null;
    const mime = Object.entries(TYPES_LOGO).find(([, t]) => t === ligne.type)?.[0];
    if (!mime) return null;
    return { contenu: await this.storage.get(ligne.cle), type: mime, empreinte: ligne.empreinte };
  }

  private async charger(tx: Transaction, organisationId: string): Promise<LigneOrganisation> {
    const [ligne] = await tx.select().from(organisation).where(eq(organisation.id, organisationId));
    if (!ligne) throw new NotFoundException('École introuvable.');
    return ligne;
  }

  private detail(ligne: LigneOrganisation): ApparenceEcole {
    return {
      nomAffichage: ligne.nomAffichage,
      couleur: ligne.couleurPrincipale,
      palette: ligne.couleurPrincipale
        ? paletteDe(ligne.couleurPrincipale, FONDS, this.seuil())
        : null,
      logoUrl: ligne.logoEmpreinte ? cheminLogo(ligne.id, ligne.logoEmpreinte) : null,
    };
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Etablissement,
  ModificationEtablissement,
  ModificationOrganisation,
  NouvelEtablissement,
  OrganisationDetail,
} from '@scolaly/contracts';
import {
  enregistrerAudit,
  etablissement,
  organisation,
  type Transaction,
  salle,
} from '@scolaly/db';
import {
  controlerNda,
  controlerSiren,
  controlerSiret,
  controlerUai,
  informationsManquantes,
  analyserModeleMatricule,
  genererMatricule,
  MODELE_MATRICULE_PAR_DEFAUT,
  normaliserIdentifiant,
  verifierArchivageEtablissement,
  type ControleIdentifiant,
} from '@scolaly/domain';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { anneeDeReference } from '../../shared/matricule.js';

type LigneEtablissement = typeof etablissement.$inferSelect;

/** Contrôles de RG-01-02, avec le message affiché sous le champ. */
const IDENTIFIANTS = {
  siren: {
    controler: controlerSiren,
    format: 'Le SIREN compte 9 chiffres.',
    cle: 'Ce SIREN est invalide : vérifiez les 9 chiffres (la clé de contrôle ne correspond pas).',
  },
  uai: {
    controler: controlerUai,
    format: 'L’UAI compte 7 chiffres suivis d’une lettre, par exemple 0691234A.',
    cle: 'Cet UAI est invalide : la lettre ne correspond pas aux 7 chiffres. Vérifiez la saisie.',
  },
  siret: {
    controler: controlerSiret,
    format: 'Le SIRET compte 14 chiffres.',
    cle: 'Ce SIRET est invalide : vérifiez les 14 chiffres (la clé de contrôle ne correspond pas).',
  },
  nda: {
    controler: controlerNda,
    format: 'Le numéro de déclaration d’activité (NDA) compte 11 chiffres.',
    cle: '',
  },
} satisfies Record<
  string,
  { controler: (v: string) => ControleIdentifiant; format: string; cle: string }
>;

/** Normalise un identifiant saisi et le contrôle ; undefined reste undefined (champ non modifié). */
function identifiant(
  champ: keyof typeof IDENTIFIANTS,
  saisie: string | null | undefined,
): string | null | undefined {
  if (saisie === undefined) return undefined;
  const valeur = normaliserIdentifiant(saisie);
  if (valeur === null) return null;
  const { controler, ...messages } = IDENTIFIANTS[champ];
  const verdict = controler(valeur);
  if (verdict !== 'valide') {
    throw new BadRequestException({
      message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
      details: [`${champ} : ${messages[verdict]}`],
    });
  }
  return valeur;
}

const MESSAGES_MODELE = {
  'numero-absent': 'Le modèle doit contenir un numéro séquentiel, par exemple {NUM:5}.',
  'numero-multiple': 'Le modèle ne doit contenir qu’un seul numéro {NUM:n}.',
  'jeton-inconnu':
    'Utilisez seulement {ANNEE}, {AA}, {NUM:n} (n de 1 à 10), des lettres, des chiffres et . _ / -.',
  'trop-long': 'Le modèle compte 30 caractères au plus.',
} as const;

const vide = (v: string | null | undefined) => (v === undefined ? undefined : v || null);

/** Organisation et établissements de l'école (E-01-02 ; US-01-02, RG-01-01, RG-01-02). */
@Injectable()
export class OrganisationService {
  async lire(tx: Transaction, access: Access): Promise<OrganisationDetail> {
    const [ecole] = await tx
      .select()
      .from(organisation)
      .where(eq(organisation.id, access.organisationId));
    if (!ecole) throw new NotFoundException('École introuvable.');
    const etablissements = await tx
      .select()
      .from(etablissement)
      .where(isNull(etablissement.deletedAt))
      // Établissements actifs d'abord, puis par nom.
      .orderBy(asc(etablissement.statut), asc(etablissement.nom));
    return {
      id: ecole.id,
      nom: ecole.nom,
      nomAffichage: ecole.nomAffichage,
      siren: ecole.siren,
      modeleMatricule: ecole.modeleMatricule ?? MODELE_MATRICULE_PAR_DEFAUT,
      exempleMatricule: genererMatricule(ecole.modeleMatricule ?? MODELE_MATRICULE_PAR_DEFAUT, {
        annee: await anneeDeReference(tx),
        numero: ecole.matriculeCompteur + 1,
      }),
      etablissements: etablissements.map((e) => this.detail(e)),
    };
  }

  async modifier(
    tx: Transaction,
    access: Access,
    changement: ModificationOrganisation,
    adresseIp: string,
  ): Promise<OrganisationDetail> {
    const avant = await this.lire(tx, access);
    const siren = identifiant('siren', changement.siren);
    const modele =
      changement.modeleMatricule === undefined
        ? undefined
        : changement.modeleMatricule?.toUpperCase() || null;
    if (modele) {
      const verdict = analyserModeleMatricule(modele);
      if (!verdict.ok) {
        throw new BadRequestException({
          message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
          details: [`modeleMatricule : ${MESSAGES_MODELE[verdict.refus]}`],
        });
      }
    }
    await tx
      .update(organisation)
      .set({
        ...(changement.nom !== undefined ? { nom: changement.nom } : {}),
        ...(changement.nomAffichage !== undefined ? { nomAffichage: changement.nomAffichage } : {}),
        ...(siren !== undefined ? { siren } : {}),
        ...(modele !== undefined ? { modeleMatricule: modele } : {}),
        updatedBy: access.userId,
      })
      .where(eq(organisation.id, access.organisationId));
    const apres = await this.lire(tx, access);
    await enregistrerAudit(tx, {
      action: 'organisation.modifier',
      objetType: 'organisation',
      objetId: access.organisationId,
      auteurId: access.userId,
      adresseIp,
      avant: {
        nom: avant.nom,
        nomAffichage: avant.nomAffichage,
        siren: avant.siren,
        modeleMatricule: avant.modeleMatricule,
      },
      apres: {
        nom: apres.nom,
        nomAffichage: apres.nomAffichage,
        siren: apres.siren,
        modeleMatricule: apres.modeleMatricule,
      },
    });
    return apres;
  }

  async creerEtablissement(
    tx: Transaction,
    access: Access,
    entree: NouvelEtablissement,
    adresseIp: string,
  ): Promise<Etablissement> {
    const [cree] = await tx
      .insert(etablissement)
      .values({
        organisationId: access.organisationId,
        ...this.valeurs(entree),
        nom: entree.nom,
        adresseLigne1: entree.adresseLigne1,
        codePostal: entree.codePostal,
        ville: entree.ville,
        fuseauHoraire: entree.fuseauHoraire,
        createdBy: access.userId,
      })
      .returning();
    if (!cree) throw new Error('Création de l’établissement impossible.');
    // RG-02-19 : une salle virtuelle (à distance) existe par défaut dans chaque établissement.
    await tx.insert(salle).values({
      organisationId: access.organisationId,
      etablissementId: cree.id,
      nom: 'Salle virtuelle (à distance)',
      type: 'virtuelle',
      createdBy: access.userId,
    });
    await enregistrerAudit(tx, {
      action: 'etablissement.creer',
      objetType: 'etablissement',
      objetId: cree.id,
      auteurId: access.userId,
      adresseIp,
      apres: this.trace(cree),
    });
    return this.detail(cree);
  }

  async modifierEtablissement(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationEtablissement,
    adresseIp: string,
  ): Promise<Etablissement> {
    const avant = await this.charger(tx, id);
    const [apres] = await tx
      .update(etablissement)
      .set({ ...this.valeurs(changement), updatedBy: access.userId })
      .where(eq(etablissement.id, id))
      .returning();
    if (!apres) throw new NotFoundException('Établissement introuvable dans cette école.');
    await enregistrerAudit(tx, {
      action: 'etablissement.modifier',
      objetType: 'etablissement',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: this.trace(avant),
      apres: this.trace(apres),
    });
    return this.detail(apres);
  }

  /**
   * RG-01-01 : un établissement s'archive (il garde ses données) ; le dernier établissement actif
   * ne peut pas l'être.
   */
  async changerStatut(
    tx: Transaction,
    access: Access,
    id: string,
    statut: 'actif' | 'archive',
    adresseIp: string,
  ): Promise<Etablissement> {
    const avant = await this.charger(tx, id);
    if (avant.statut === statut) return this.detail(avant);
    if (statut === 'archive') {
      const [{ n } = { n: 0 }] = await tx
        .select({ n: count() })
        .from(etablissement)
        .where(and(eq(etablissement.statut, 'actif'), isNull(etablissement.deletedAt)));
      const verdict = verifierArchivageEtablissement(n);
      if (!verdict.ok) {
        throw new ConflictException(
          'Votre école doit garder au moins un établissement actif. Créez d’abord le nouvel établissement, puis archivez celui-ci.',
        );
      }
    }
    const [apres] = await tx
      .update(etablissement)
      .set({ statut, updatedBy: access.userId })
      .where(eq(etablissement.id, id))
      .returning();
    if (!apres) throw new NotFoundException('Établissement introuvable dans cette école.');
    await enregistrerAudit(tx, {
      action: statut === 'archive' ? 'etablissement.archiver' : 'etablissement.reactiver',
      objetType: 'etablissement',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: { statut: avant.statut },
      apres: { statut },
    });
    return this.detail(apres);
  }

  private async charger(tx: Transaction, id: string): Promise<LigneEtablissement> {
    const [trouve] = await tx
      .select()
      .from(etablissement)
      .where(and(eq(etablissement.id, id), isNull(etablissement.deletedAt)));
    if (!trouve) throw new NotFoundException('Établissement introuvable dans cette école.');
    return trouve;
  }

  /** Champs modifiables, identifiants normalisés et contrôlés (RG-01-02). */
  private valeurs(saisie: ModificationEtablissement) {
    const uai = identifiant('uai', saisie.uai);
    const siret = identifiant('siret', saisie.siret);
    const nda = identifiant('nda', saisie.nda);
    const champs = {
      nom: saisie.nom,
      adresseLigne1: saisie.adresseLigne1,
      adresseLigne2: vide(saisie.adresseLigne2),
      codePostal: saisie.codePostal?.toUpperCase(),
      ville: saisie.ville,
      fuseauHoraire: saisie.fuseauHoraire,
      telephone: vide(saisie.telephone),
      email: vide(saisie.email),
      uai,
      siret,
      nda,
    };
    return Object.fromEntries(Object.entries(champs).filter(([, v]) => v !== undefined));
  }

  private trace(e: LigneEtablissement) {
    return {
      nom: e.nom,
      adresseLigne1: e.adresseLigne1,
      adresseLigne2: e.adresseLigne2,
      codePostal: e.codePostal,
      ville: e.ville,
      uai: e.uai,
      siret: e.siret,
      nda: e.nda,
      fuseauHoraire: e.fuseauHoraire,
      telephone: e.telephone,
      email: e.email,
    };
  }

  private detail(e: LigneEtablissement): Etablissement {
    return {
      id: e.id,
      nom: e.nom,
      adresseLigne1: e.adresseLigne1,
      adresseLigne2: e.adresseLigne2,
      codePostal: e.codePostal,
      ville: e.ville,
      uai: e.uai,
      siret: e.siret,
      nda: e.nda,
      fuseauHoraire: e.fuseauHoraire,
      telephone: e.telephone,
      email: e.email,
      statut: e.statut,
      manquantes: informationsManquantes(e),
    };
  }
}

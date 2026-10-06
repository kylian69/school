import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AnneeScolaire,
  CalendrierAnnee,
  Fermeture,
  ListeAnnees,
  ModificationAnnee,
  NouvelleAnnee,
  SaisieFermeture,
} from '@scolaly/contracts';
import {
  anneeScolaire,
  enregistrerAudit,
  etablissement,
  fermeture,
  fermetureEtablissement,
  periode,
  type Transaction,
} from '@scolaly/db';
import {
  joursFeriesEntre,
  verifierAnnee,
  verifierFermeture,
  verifierModificationAnnee,
  verifierSuppressionAnnee,
  type RefusCalendrier,
  type VerdictCalendrier,
} from '@scolaly/domain';
import { joursFeriesNationaux, valueAt } from '@scolaly/referentials';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';

const MESSAGES: Record<RefusCalendrier, string> = {
  'dates-annee': 'La fin de l’année doit être postérieure à son début.',
  'aucune-periode': 'Une année compte au moins une période (par exemple un semestre).',
  'dates-periode': 'La fin d’une période doit être postérieure ou égale à son début.',
  'periode-hors-annee': 'Chaque période doit rester entre le début et la fin de l’année.',
  'periodes-chevauchement':
    'Deux périodes se chevauchent : faites commencer chaque période après la fin de la précédente.',
  'dates-fermeture': 'La fin d’une fermeture doit être postérieure ou égale à son début.',
  'fermeture-hors-annee':
    'Une fermeture doit rester dans l’année scolaire. Ajustez ses dates ou celles de l’année.',
  'annee-cloturee':
    'Cette année est clôturée : elle est en lecture seule. Une correction demandera un droit spécifique, tracé.',
  'statut-retour': 'Le statut d’une année avance (préparation, en cours, clôturée) sans retour.',
  'annee-utilisee':
    'Seule une année en préparation peut être supprimée : celle-ci est déjà en cours ou clôturée.',
};

function refuser(verdict: VerdictCalendrier, champ?: string): void {
  if (verdict.ok) return;
  const message = MESSAGES[verdict.refus];
  if (verdict.refus === 'annee-cloturee' || verdict.refus === 'annee-utilisee') {
    throw new ConflictException(message);
  }
  const chemin =
    champ && verdict.rang !== undefined ? `${champ}.${verdict.rang}` : (champ ?? 'corps');
  throw new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${chemin} : ${message}`],
  });
}

/** Jours fériés nationaux, selon les règles en vigueur au 1er janvier de chaque année civile. */
const feriesNationaux = (anneeCivile: number) =>
  valueAt(joursFeriesNationaux, `${anneeCivile}-01-01`).valeur;

type LigneAnnee = typeof anneeScolaire.$inferSelect;

/** Calendrier de l'école : années, périodes, fermetures et jours fériés (E-01-03). */
@Injectable()
export class CalendrierService {
  async lister(tx: Transaction): Promise<ListeAnnees> {
    const annees = await tx
      .select()
      .from(anneeScolaire)
      .where(isNull(anneeScolaire.deletedAt))
      .orderBy(desc(anneeScolaire.dateDebut));
    const periodes = await this.periodesDe(
      tx,
      annees.map((a) => a.id),
    );
    return { annees: annees.map((a) => this.resume(a, periodes)) };
  }

  async lire(tx: Transaction, id: string): Promise<CalendrierAnnee> {
    const annee = await this.charger(tx, id);
    const periodes = await this.periodesDe(tx, [id]);
    return {
      ...this.resume(annee, periodes),
      fermetures: await this.fermeturesDe(tx, id),
      feries: joursFeriesEntre(annee, feriesNationaux),
    };
  }

  async creer(
    tx: Transaction,
    access: Access,
    entree: NouvelleAnnee,
    adresseIp: string,
  ): Promise<CalendrierAnnee> {
    refuser(verifierAnnee(entree, entree.periodes), 'periodes');
    const [creee] = await tx
      .insert(anneeScolaire)
      .values({
        organisationId: access.organisationId,
        libelle: entree.libelle,
        dateDebut: entree.dateDebut,
        dateFin: entree.dateFin,
        createdBy: access.userId,
      })
      .returning();
    if (!creee) throw new Error('Création de l’année impossible.');
    await this.ecrirePeriodes(tx, access, creee.id, entree.periodes);
    const resultat = await this.lire(tx, creee.id);
    await enregistrerAudit(tx, {
      action: 'annee.creer',
      objetType: 'annee_scolaire',
      objetId: creee.id,
      auteurId: access.userId,
      adresseIp,
      apres: this.trace(resultat),
    });
    return resultat;
  }

  async modifier(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationAnnee,
    adresseIp: string,
  ): Promise<CalendrierAnnee> {
    const avant = await this.lire(tx, id);
    refuser(verifierModificationAnnee(avant.statut, changement.statut));
    const intervalle = {
      dateDebut: changement.dateDebut ?? avant.dateDebut,
      dateFin: changement.dateFin ?? avant.dateFin,
    };
    const periodes = changement.periodes ?? avant.periodes;
    refuser(verifierAnnee(intervalle, periodes, avant.fermetures), 'periodes');
    await tx
      .update(anneeScolaire)
      .set({
        ...intervalle,
        ...(changement.libelle !== undefined ? { libelle: changement.libelle } : {}),
        ...(changement.statut !== undefined ? { statut: changement.statut } : {}),
        updatedBy: access.userId,
      })
      .where(eq(anneeScolaire.id, id));
    if (changement.periodes) await this.ecrirePeriodes(tx, access, id, changement.periodes);
    const apres = await this.lire(tx, id);
    await enregistrerAudit(tx, {
      action: 'annee.modifier',
      objetType: 'annee_scolaire',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: this.trace(avant),
      apres: this.trace(apres),
    });
    return apres;
  }

  async supprimer(tx: Transaction, access: Access, id: string, adresseIp: string): Promise<void> {
    const annee = await this.lire(tx, id);
    refuser(verifierSuppressionAnnee(annee.statut));
    const maintenant = new Date();
    const suppression = { deletedAt: maintenant, updatedBy: access.userId };
    await tx.update(periode).set(suppression).where(eq(periode.anneeScolaireId, id));
    await tx.update(fermeture).set(suppression).where(eq(fermeture.anneeScolaireId, id));
    await tx.update(anneeScolaire).set(suppression).where(eq(anneeScolaire.id, id));
    await enregistrerAudit(tx, {
      action: 'annee.supprimer',
      objetType: 'annee_scolaire',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: this.trace(annee),
    });
  }

  async ajouterFermeture(
    tx: Transaction,
    access: Access,
    anneeId: string,
    saisie: SaisieFermeture,
    adresseIp: string,
  ): Promise<Fermeture> {
    const annee = await this.charger(tx, anneeId);
    refuser(verifierModificationAnnee(annee.statut));
    refuser(verifierFermeture(annee, saisie));
    await this.verifierEtablissements(tx, saisie.etablissementIds);
    const [creee] = await tx
      .insert(fermeture)
      .values({
        organisationId: access.organisationId,
        anneeScolaireId: anneeId,
        libelle: saisie.libelle,
        dateDebut: saisie.dateDebut,
        dateFin: saisie.dateFin,
        type: saisie.type,
        createdBy: access.userId,
      })
      .returning();
    if (!creee) throw new Error('Création de la fermeture impossible.');
    await this.ecrireEtablissements(tx, access, creee.id, saisie.etablissementIds);
    const resultat = { ...this.fermeture(creee), etablissementIds: saisie.etablissementIds };
    await enregistrerAudit(tx, {
      action: 'fermeture.creer',
      objetType: 'fermeture',
      objetId: creee.id,
      auteurId: access.userId,
      adresseIp,
      apres: resultat,
    });
    return resultat;
  }

  async modifierFermeture(
    tx: Transaction,
    access: Access,
    id: string,
    saisie: SaisieFermeture,
    adresseIp: string,
  ): Promise<Fermeture> {
    const { ligne, avant } = await this.chargerFermeture(tx, id);
    const annee = await this.charger(tx, ligne.anneeScolaireId);
    refuser(verifierModificationAnnee(annee.statut));
    refuser(verifierFermeture(annee, saisie));
    await this.verifierEtablissements(tx, saisie.etablissementIds);
    const [modifiee] = await tx
      .update(fermeture)
      .set({
        libelle: saisie.libelle,
        dateDebut: saisie.dateDebut,
        dateFin: saisie.dateFin,
        type: saisie.type,
        updatedBy: access.userId,
      })
      .where(eq(fermeture.id, id))
      .returning();
    if (!modifiee) throw new NotFoundException('Fermeture introuvable dans cette école.');
    await tx.delete(fermetureEtablissement).where(eq(fermetureEtablissement.fermetureId, id));
    await this.ecrireEtablissements(tx, access, id, saisie.etablissementIds);
    const apres = { ...this.fermeture(modifiee), etablissementIds: saisie.etablissementIds };
    await enregistrerAudit(tx, {
      action: 'fermeture.modifier',
      objetType: 'fermeture',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant,
      apres,
    });
    return apres;
  }

  async supprimerFermeture(
    tx: Transaction,
    access: Access,
    id: string,
    adresseIp: string,
  ): Promise<void> {
    const { ligne, avant } = await this.chargerFermeture(tx, id);
    const annee = await this.charger(tx, ligne.anneeScolaireId);
    refuser(verifierModificationAnnee(annee.statut));
    await tx
      .update(fermeture)
      .set({ deletedAt: new Date(), updatedBy: access.userId })
      .where(eq(fermeture.id, id));
    await enregistrerAudit(tx, {
      action: 'fermeture.supprimer',
      objetType: 'fermeture',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant,
    });
  }

  private async charger(tx: Transaction, id: string): Promise<LigneAnnee> {
    const [annee] = await tx
      .select()
      .from(anneeScolaire)
      .where(and(eq(anneeScolaire.id, id), isNull(anneeScolaire.deletedAt)));
    if (!annee) throw new NotFoundException('Année scolaire introuvable dans cette école.');
    return annee;
  }

  private async chargerFermeture(tx: Transaction, id: string) {
    const [ligne] = await tx
      .select()
      .from(fermeture)
      .where(and(eq(fermeture.id, id), isNull(fermeture.deletedAt)));
    if (!ligne) throw new NotFoundException('Fermeture introuvable dans cette école.');
    const liens = await tx
      .select({ etablissementId: fermetureEtablissement.etablissementId })
      .from(fermetureEtablissement)
      .where(eq(fermetureEtablissement.fermetureId, id));
    return {
      ligne,
      avant: { ...this.fermeture(ligne), etablissementIds: liens.map((l) => l.etablissementId) },
    };
  }

  private async periodesDe(tx: Transaction, anneeIds: readonly string[]) {
    if (anneeIds.length === 0) return [];
    return tx
      .select()
      .from(periode)
      .where(and(inArray(periode.anneeScolaireId, [...anneeIds]), isNull(periode.deletedAt)))
      .orderBy(asc(periode.ordre));
  }

  private async fermeturesDe(tx: Transaction, anneeId: string): Promise<Fermeture[]> {
    const lignes = await tx
      .select()
      .from(fermeture)
      .where(and(eq(fermeture.anneeScolaireId, anneeId), isNull(fermeture.deletedAt)))
      .orderBy(asc(fermeture.dateDebut));
    const liens =
      lignes.length === 0
        ? []
        : await tx
            .select()
            .from(fermetureEtablissement)
            .where(
              inArray(
                fermetureEtablissement.fermetureId,
                lignes.map((l) => l.id),
              ),
            );
    return lignes.map((l) => ({
      ...this.fermeture(l),
      etablissementIds: liens.filter((e) => e.fermetureId === l.id).map((e) => e.etablissementId),
    }));
  }

  /** Remplace les périodes : celles qui ont un identifiant sont modifiées, les absentes supprimées. */
  private async ecrirePeriodes(
    tx: Transaction,
    access: Access,
    anneeId: string,
    periodes: readonly {
      id?: string | undefined;
      libelle: string;
      dateDebut: string;
      dateFin: string;
    }[],
  ) {
    const existantes = await this.periodesDe(tx, [anneeId]);
    const gardees = new Set(periodes.flatMap((p) => (p.id ? [p.id] : [])));
    for (const ancienne of existantes) {
      if (!gardees.has(ancienne.id)) {
        await tx
          .update(periode)
          .set({ deletedAt: new Date(), updatedBy: access.userId })
          .where(eq(periode.id, ancienne.id));
      }
    }
    for (const [rang, saisie] of periodes.entries()) {
      const valeurs = {
        libelle: saisie.libelle,
        dateDebut: saisie.dateDebut,
        dateFin: saisie.dateFin,
        ordre: rang + 1,
      };
      if (saisie.id && existantes.some((e) => e.id === saisie.id)) {
        await tx
          .update(periode)
          .set({ ...valeurs, updatedBy: access.userId })
          .where(eq(periode.id, saisie.id));
      } else {
        await tx.insert(periode).values({
          ...valeurs,
          organisationId: access.organisationId,
          anneeScolaireId: anneeId,
          createdBy: access.userId,
        });
      }
    }
  }

  /** Les établissements désignés existent dans l'école (la RLS cache ceux des autres écoles). */
  private async verifierEtablissements(tx: Transaction, ids: readonly string[]) {
    if (ids.length === 0) return;
    const trouves = await tx
      .select({ id: etablissement.id })
      .from(etablissement)
      .where(and(inArray(etablissement.id, [...ids]), isNull(etablissement.deletedAt)));
    if (trouves.length !== new Set(ids).size) {
      throw new BadRequestException({
        message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
        details: [
          'etablissementIds : Un des établissements choisis n’existe pas dans cette école.',
        ],
      });
    }
  }

  private async ecrireEtablissements(
    tx: Transaction,
    access: Access,
    fermetureId: string,
    ids: readonly string[],
  ) {
    const uniques = [...new Set(ids)];
    if (uniques.length === 0) return;
    await tx.insert(fermetureEtablissement).values(
      uniques.map((etablissementId) => ({
        organisationId: access.organisationId,
        fermetureId,
        etablissementId,
        createdBy: access.userId,
      })),
    );
  }

  private resume(
    annee: LigneAnnee,
    periodes: readonly (typeof periode.$inferSelect)[],
  ): AnneeScolaire {
    return {
      id: annee.id,
      libelle: annee.libelle,
      dateDebut: annee.dateDebut,
      dateFin: annee.dateFin,
      statut: annee.statut,
      periodes: periodes
        .filter((p) => p.anneeScolaireId === annee.id)
        .map((p) => ({
          id: p.id,
          libelle: p.libelle,
          dateDebut: p.dateDebut,
          dateFin: p.dateFin,
          ordre: p.ordre,
        })),
    };
  }

  private fermeture(f: typeof fermeture.$inferSelect): Omit<Fermeture, 'etablissementIds'> {
    return {
      id: f.id,
      libelle: f.libelle,
      dateDebut: f.dateDebut,
      dateFin: f.dateFin,
      type: f.type,
    };
  }

  private trace(annee: AnneeScolaire) {
    return {
      libelle: annee.libelle,
      dateDebut: annee.dateDebut,
      dateFin: annee.dateFin,
      statut: annee.statut,
      periodes: annee.periodes.map((p) => ({
        libelle: p.libelle,
        dateDebut: p.dateDebut,
        dateFin: p.dateFin,
      })),
    };
  }
}

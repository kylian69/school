import { Injectable, NotFoundException } from '@nestjs/common';
import {
  RegleParticuliere,
  type EchelleMaitrise,
  type ListeReglesBibliotheque,
  type RegleBibliotheque,
  type SaisieEchelle,
  type SaisieRegleBibliotheque,
} from '@scolaly/contracts';
import { enregistrerAudit, niveauMaitrise, regleParticuliere, type Transaction } from '@scolaly/db';
import { ECHELLE_PAR_DEFAUT } from '@scolaly/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';

/** Règles de l'école (E-02-10) : échelle de maîtrise (RG-02-22) et règles particulières (RG-02-26). */
@Injectable()
export class BibliothequeService {
  /** L'échelle de l'école, ou l'échelle par défaut tant qu'elle n'a pas été enregistrée. */
  async echelle(tx: Transaction): Promise<EchelleMaitrise> {
    const niveaux = await tx
      .select()
      .from(niveauMaitrise)
      .where(isNull(niveauMaitrise.deletedAt))
      .orderBy(asc(niveauMaitrise.ordre));
    if (niveaux.length === 0) {
      return {
        parDefaut: true,
        niveaux: ECHELLE_PAR_DEFAUT.map((n, ordre) => ({
          id: `defaut-${String(ordre + 1)}`,
          libelle: n.libelle,
          couleur: n.couleur,
          valeur: n.valeur,
          ordre: ordre + 1,
          valide: n.valide,
        })),
      };
    }
    return {
      parDefaut: false,
      niveaux: niveaux.map((n) => ({
        id: n.id,
        libelle: n.libelle,
        couleur: n.couleur,
        valeur: n.valeur,
        ordre: n.ordre,
        valide: n.valide,
      })),
    };
  }

  /**
   * L'échelle envoyée remplace la précédente. Les anciens niveaux passent à la corbeille : les
   * évaluations de compétences (module 07) qui les citent restent lisibles.
   */
  async definirEchelle(
    tx: Transaction,
    access: Access,
    saisie: SaisieEchelle,
    adresseIp: string,
  ): Promise<EchelleMaitrise> {
    const avant = await this.echelle(tx);
    await tx
      .update(niveauMaitrise)
      .set({ deletedAt: new Date(), updatedBy: access.userId })
      .where(isNull(niveauMaitrise.deletedAt));
    await tx.insert(niveauMaitrise).values(
      saisie.niveaux.map((n, rang) => ({
        organisationId: access.organisationId,
        libelle: n.libelle,
        couleur: n.couleur,
        valeur: n.valeur,
        ordre: rang + 1,
        valide: n.valide,
        createdBy: access.userId,
      })),
    );
    const apres = await this.echelle(tx);
    await enregistrerAudit(tx, {
      action: 'echelle-maitrise.modifier',
      objetType: 'organisation',
      objetId: access.organisationId,
      auteurId: access.userId,
      adresseIp,
      avant: avant.niveaux,
      apres: apres.niveaux,
    });
    return apres;
  }

  async listerRegles(tx: Transaction): Promise<ListeReglesBibliotheque> {
    const lignes = await tx
      .select()
      .from(regleParticuliere)
      .where(isNull(regleParticuliere.deletedAt))
      .orderBy(asc(regleParticuliere.libelle));
    return { regles: lignes.map((l) => this.versContrat(l)) };
  }

  async creerRegle(
    tx: Transaction,
    access: Access,
    saisie: SaisieRegleBibliotheque,
    adresseIp: string,
  ): Promise<RegleBibliotheque> {
    const [ligne] = await tx
      .insert(regleParticuliere)
      .values({
        organisationId: access.organisationId,
        libelle: saisie.libelle,
        type: saisie.regle.type,
        parametres: saisie.regle,
        createdBy: access.userId,
      })
      .returning();
    if (!ligne) throw new Error('Création de la règle impossible.');
    const resultat = this.versContrat(ligne);
    await enregistrerAudit(tx, {
      action: 'regle-particuliere.creer',
      objetType: 'regle_particuliere',
      objetId: ligne.id,
      auteurId: access.userId,
      adresseIp,
      apres: resultat,
    });
    return resultat;
  }

  /** Modifier la bibliothèque ne change pas les versions où la règle est déjà activée (RG-02-28). */
  async modifierRegle(
    tx: Transaction,
    access: Access,
    id: string,
    saisie: SaisieRegleBibliotheque,
    adresseIp: string,
  ): Promise<RegleBibliotheque> {
    const avant = await this.chargerRegle(tx, id);
    await tx
      .update(regleParticuliere)
      .set({
        libelle: saisie.libelle,
        type: saisie.regle.type,
        parametres: saisie.regle,
        updatedBy: access.userId,
      })
      .where(eq(regleParticuliere.id, id));
    const apres = await this.chargerRegle(tx, id);
    await enregistrerAudit(tx, {
      action: 'regle-particuliere.modifier',
      objetType: 'regle_particuliere',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant,
      apres,
    });
    return apres;
  }

  async supprimerRegle(
    tx: Transaction,
    access: Access,
    id: string,
    adresseIp: string,
  ): Promise<void> {
    const avant = await this.chargerRegle(tx, id);
    await tx
      .update(regleParticuliere)
      .set({ deletedAt: new Date(), updatedBy: access.userId })
      .where(eq(regleParticuliere.id, id));
    await enregistrerAudit(tx, {
      action: 'regle-particuliere.supprimer',
      objetType: 'regle_particuliere',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant,
    });
  }

  private async chargerRegle(tx: Transaction, id: string): Promise<RegleBibliotheque> {
    const [ligne] = await tx
      .select()
      .from(regleParticuliere)
      .where(and(eq(regleParticuliere.id, id), isNull(regleParticuliere.deletedAt)));
    if (!ligne) throw new NotFoundException('Règle introuvable.');
    return this.versContrat(ligne);
  }

  private versContrat(ligne: typeof regleParticuliere.$inferSelect): RegleBibliotheque {
    return {
      id: ligne.id,
      libelle: ligne.libelle,
      regle: RegleParticuliere.parse(ligne.parametres),
    };
  }
}

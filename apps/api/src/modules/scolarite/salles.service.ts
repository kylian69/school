import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ListeSalles,
  ModificationSalle,
  RechercheSalles,
  Salle,
  SaisieSalle,
} from '@scolaly/contracts';
import { enregistrerAudit, etablissement, salle, type Transaction } from '@scolaly/db';
import { and, asc, eq, gte, isNull, sql, type SQL } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';

type LigneSalle = typeof salle.$inferSelect;

/** Salles et ressources (E-02-06 ; US-02-09, RG-02-19). */
@Injectable()
export class SallesService {
  async lister(tx: Transaction, access: Access, recherche: RechercheSalles): Promise<ListeSalles> {
    const conditions: (SQL | undefined)[] = [isNull(salle.deletedAt)];
    if (recherche.etablissementId)
      conditions.push(eq(salle.etablissementId, recherche.etablissementId));
    if (recherche.capaciteMin) conditions.push(gte(salle.capacite, recherche.capaciteMin));
    if (recherche.type) conditions.push(eq(salle.type, recherche.type));
    if (recherche.equipement) {
      conditions.push(
        sql`exists (select 1 from unnest(${salle.equipements}) e where e ilike ${`%${recherche.equipement.replace(/[\\%_]/g, (c) => `\\${c}`)}%`})`,
      );
    }
    const lignes = await tx
      .select()
      .from(salle)
      .where(and(...conditions))
      .orderBy(asc(salle.etablissementId), asc(salle.nom));
    return {
      salles: lignes.map((l) => this.versContrat(access, l)),
      creation: this.etablissementsGeres(access) !== false,
    };
  }

  async creer(
    tx: Transaction,
    access: Access,
    saisie: SaisieSalle,
    adresseIp: string,
  ): Promise<Salle> {
    this.exigerGestion(access, saisie.etablissementId);
    const [campus] = await tx
      .select({ id: etablissement.id })
      .from(etablissement)
      .where(and(eq(etablissement.id, saisie.etablissementId), isNull(etablissement.deletedAt)));
    if (!campus) {
      throw new BadRequestException({
        message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
        details: ['etablissementId : Cet établissement n’existe pas dans l’école.'],
      });
    }
    const [ligne] = await tx
      .insert(salle)
      .values({ organisationId: access.organisationId, ...saisie, createdBy: access.userId })
      .returning();
    if (!ligne) throw new Error('Création de la salle impossible.');
    const resultat = this.versContrat(access, ligne);
    await enregistrerAudit(tx, {
      action: 'salle.creer',
      objetType: 'salle',
      objetId: ligne.id,
      auteurId: access.userId,
      adresseIp,
      apres: resultat,
    });
    return resultat;
  }

  async modifier(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationSalle,
    adresseIp: string,
  ): Promise<Salle> {
    const [avant] = await tx
      .select()
      .from(salle)
      .where(and(eq(salle.id, id), isNull(salle.deletedAt)));
    if (!avant) throw new NotFoundException('Salle introuvable.');
    this.exigerGestion(access, avant.etablissementId);
    const [apres] = await tx
      .update(salle)
      .set({ ...changement, updatedBy: access.userId })
      .where(eq(salle.id, id))
      .returning();
    if (!apres) throw new NotFoundException('Salle introuvable.');
    const resultat = this.versContrat(access, apres);
    await enregistrerAudit(tx, {
      action: 'salle.modifier',
      objetType: 'salle',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant,
      apres: resultat,
    });
    return resultat;
  }

  /** Établissements gérés : true pour toute l'école, la liste sinon, false sans droit de gestion. */
  private etablissementsGeres(access: Access): true | string[] | false {
    if (!access.permissions.has('salles:gerer')) return false;
    const perimetres = access.perimetres.get('salles:gerer') ?? [];
    if (perimetres.some((p) => p.type === 'organisation')) return true;
    const ids = perimetres.filter((p) => p.type === 'etablissement').flatMap((p) => p.id ?? []);
    return ids.length > 0 ? ids : false;
  }

  private peutGerer(access: Access, etablissementId: string) {
    const geres = this.etablissementsGeres(access);
    return geres === true || (geres !== false && geres.includes(etablissementId));
  }

  private exigerGestion(access: Access, etablissementId: string) {
    if (!this.peutGerer(access, etablissementId)) {
      throw new ForbiddenException('Vous ne gérez que les salles de votre établissement.');
    }
  }

  private versContrat(access: Access, l: LigneSalle): Salle {
    return {
      id: l.id,
      etablissementId: l.etablissementId,
      nom: l.nom,
      capacite: l.capacite,
      type: l.type,
      equipements: l.equipements,
      pmr: l.pmr,
      statut: l.statut,
      modifiable: this.peutGerer(access, l.etablissementId),
    };
  }
}

import { ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import type { Corbeille, ElementCorbeille, TypeCorbeille } from '@scolaly/contracts';
import {
  anneeScolaire,
  attribution,
  enregistrerAudit,
  fermeture,
  periode,
  personne,
  role,
  type Transaction,
} from '@scolaly/db';
import { DELAI_CORBEILLE_JOURS, effacementLe, restaurable } from '@scolaly/domain';
import { and, eq, gt, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Access } from '../../access/access-resolver.js';

interface Supprime {
  type: TypeCorbeille;
  id: string;
  libelle: string;
  supprimeLe: Date;
  supprimePar: string | null;
  lies: number;
}

/** Corbeille de l'école (E-01-10 ; US-01-16, RG-01-23). */
@Injectable()
export class CorbeilleService {
  /**
   * Périmètre : toute la corbeille avec un périmètre « organisation » ; sinon ses propres
   * suppressions (matrice du module 01 : la scolarité restaure ses suppressions).
   */
  private auteurSeulement(access: Access): string | null {
    const perimetres = access.perimetres.get('corbeille:restaurer') ?? [];
    return perimetres.some((p) => p.type === 'organisation') ? null : access.userId;
  }

  async lister(tx: Transaction, access: Access): Promise<Corbeille> {
    const depuis = new Date(Date.now() - DELAI_CORBEILLE_JOURS * 86_400_000);
    const auteur = this.auteurSeulement(access);
    const filtre = (deletedAt: AnyPgColumn, updatedBy: AnyPgColumn) =>
      and(isNotNull(deletedAt), gt(deletedAt, depuis), auteur ? eq(updatedBy, auteur) : undefined);

    const personnes = await tx
      .select({ p: personne })
      .from(personne)
      .where(filtre(personne.deletedAt, personne.updatedBy));
    const annees = await tx
      .select({ a: anneeScolaire })
      .from(anneeScolaire)
      .where(filtre(anneeScolaire.deletedAt, anneeScolaire.updatedBy));
    // Une fermeture supprimée avec son année est restaurée avec elle : elle n'apparaît pas seule.
    const fermetures = await tx
      .select({ f: fermeture })
      .from(fermeture)
      .innerJoin(anneeScolaire, eq(anneeScolaire.id, fermeture.anneeScolaireId))
      .where(
        and(filtre(fermeture.deletedAt, fermeture.updatedBy), isNull(anneeScolaire.deletedAt)),
      );
    const roles = await tx
      .select({ r: role })
      .from(role)
      .where(filtre(role.deletedAt, role.updatedBy));

    const elements: Supprime[] = [];
    for (const { p } of personnes) {
      elements.push({
        type: 'personne',
        id: p.id,
        libelle: `${p.prenom} ${p.nom}`,
        supprimeLe: p.deletedAt ?? p.updatedAt,
        supprimePar: p.updatedBy,
        lies: await this.lies(tx, 'personne', p.id, p.deletedAt),
      });
    }
    for (const { a } of annees) {
      elements.push({
        type: 'annee',
        id: a.id,
        libelle: a.libelle,
        supprimeLe: a.deletedAt ?? a.updatedAt,
        supprimePar: a.updatedBy,
        lies: await this.lies(tx, 'annee', a.id, a.deletedAt),
      });
    }
    for (const { f } of fermetures) {
      elements.push({
        type: 'fermeture',
        id: f.id,
        libelle: f.libelle,
        supprimeLe: f.deletedAt ?? f.updatedAt,
        supprimePar: f.updatedBy,
        lies: 0,
      });
    }
    for (const { r } of roles) {
      elements.push({
        type: 'role',
        id: r.id,
        libelle: r.libelle,
        supprimeLe: r.deletedAt ?? r.updatedAt,
        supprimePar: r.updatedBy,
        lies: 0,
      });
    }
    return { elements: await this.nommer(tx, elements) };
  }

  async restaurer(
    tx: Transaction,
    access: Access,
    type: TypeCorbeille,
    id: string,
    adresseIp: string,
  ): Promise<void> {
    const auteur = this.auteurSeulement(access);
    const element = (await this.lister(tx, access)).elements.find(
      (e) => e.type === type && e.id === id,
    );
    if (!element) throw new NotFoundException('Élément introuvable dans la corbeille.');
    const supprimeLe = new Date(element.supprimeLe);
    if (!restaurable(supprimeLe, new Date())) {
      throw new GoneException('Cet élément a dépassé 30 jours dans la corbeille : il est effacé.');
    }
    const restauration = { deletedAt: null, updatedBy: access.userId };
    // Éléments liés supprimés au même instant (RG-01-23).
    const memeInstant = (colonne: AnyPgColumn) => eq(colonne, supprimeLe);
    if (type === 'personne') {
      const [fiche] = await tx.select().from(personne).where(eq(personne.id, id));
      const [autre] = await tx
        .select({ id: personne.id })
        .from(personne)
        .where(
          and(
            sql`lower(${personne.email}) = lower(${fiche?.email ?? ''})`,
            isNull(personne.deletedAt),
            ne(personne.id, id),
          ),
        );
      if (autre) {
        throw new ConflictException(
          'Une autre fiche porte désormais cet email : modifiez-la ou supprimez-la avant de restaurer celle-ci.',
        );
      }
      await tx.update(personne).set(restauration).where(eq(personne.id, id));
      await tx
        .update(attribution)
        .set(restauration)
        .where(and(eq(attribution.personneId, id), memeInstant(attribution.deletedAt)));
    } else if (type === 'annee') {
      await tx.update(anneeScolaire).set(restauration).where(eq(anneeScolaire.id, id));
      for (const table of [periode, fermeture] as const) {
        await tx
          .update(table)
          .set(restauration)
          .where(and(eq(table.anneeScolaireId, id), memeInstant(table.deletedAt)));
      }
    } else if (type === 'fermeture') {
      await tx.update(fermeture).set(restauration).where(eq(fermeture.id, id));
    } else {
      await tx.update(role).set(restauration).where(eq(role.id, id));
    }
    await enregistrerAudit(tx, {
      action: 'corbeille.restaurer',
      objetType: type === 'annee' ? 'annee_scolaire' : type,
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: {
        supprimeLe: element.supprimeLe,
        ...(auteur ? { perimetre: 'ses-suppressions' } : {}),
      },
      apres: { restaure: true, lies: element.lies },
    });
  }

  /** Éléments liés supprimés au même instant qu'une fiche ou qu'une année. */
  private async lies(
    tx: Transaction,
    type: 'personne' | 'annee',
    id: string,
    instant: Date | null,
  ): Promise<number> {
    if (!instant) return 0;
    if (type === 'personne') {
      const roles = await tx
        .select({ id: attribution.id })
        .from(attribution)
        .where(and(eq(attribution.personneId, id), eq(attribution.deletedAt, instant)));
      return roles.length;
    }
    const periodes = await tx
      .select({ id: periode.id })
      .from(periode)
      .where(and(eq(periode.anneeScolaireId, id), eq(periode.deletedAt, instant)));
    const fermetures = await tx
      .select({ id: fermeture.id })
      .from(fermeture)
      .where(and(eq(fermeture.anneeScolaireId, id), eq(fermeture.deletedAt, instant)));
    return periodes.length + fermetures.length;
  }

  /** Auteurs des suppressions, retrouvés par leur fiche dans l'école. */
  private async nommer(tx: Transaction, elements: Supprime[]): Promise<ElementCorbeille[]> {
    const comptes = [...new Set(elements.flatMap((e) => (e.supprimePar ? [e.supprimePar] : [])))];
    const fiches =
      comptes.length === 0
        ? []
        : await tx
            .select({ userId: personne.userId, nom: personne.nom, prenom: personne.prenom })
            .from(personne)
            .where(inArray(personne.userId, comptes));
    const noms = new Map(fiches.map((f) => [f.userId, `${f.prenom} ${f.nom}`]));
    return elements
      .sort((a, b) => b.supprimeLe.getTime() - a.supprimeLe.getTime())
      .map((e) => ({
        type: e.type,
        id: e.id,
        libelle: e.libelle,
        supprimeLe: e.supprimeLe.toISOString(),
        supprimePar: e.supprimePar ? (noms.get(e.supprimePar) ?? null) : null,
        effacementLe: effacementLe(e.supprimeLe).toISOString(),
        lies: e.lies,
      }));
  }
}

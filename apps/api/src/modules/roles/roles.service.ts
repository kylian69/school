import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSION_CODES,
  type ListeRoles,
  type ModificationRole,
  type NouveauRole,
  type Permission,
  type RoleDetail,
} from '@scolaly/contracts';
import { attribution, enregistrerAudit, role, rolePermission, type Transaction } from '@scolaly/db';
import {
  estRoleParDefaut,
  estRoleVerrouille,
  verifierModificationRole,
  verifierSuppressionRole,
  type RefusRole,
} from '@scolaly/domain';
import { and, asc, countDistinct, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { aujourdhui } from '../../shared/dates.js';

const CATALOGUE: ReadonlySet<string> = new Set(PERMISSION_CODES);

const MESSAGES: Record<RefusRole, string> = {
  'role-verrouille':
    'Le rôle d’administrateur garde toutes ses permissions : sans lui, plus personne ne pourrait administrer l’école. Créez un rôle personnalisé pour des droits plus restreints.',
  'role-par-defaut':
    'Les rôles livrés avec Scolaly ne se suppriment pas. Vous pouvez modifier leurs permissions ou les dupliquer.',
  'permission-inconnue': 'Une des permissions demandées n’existe pas. Rechargez la page.',
  'role-attribue':
    'Ce rôle est encore attribué. Retirez-le d’abord aux personnes concernées, puis supprimez-le.',
  'double-authentification-imposee':
    'La double authentification de ce rôle est fixée par les règles de sécurité de Scolaly.',
};

const refuser = (verdict: { ok: true } | { ok: false; refus: RefusRole }) => {
  if (!verdict.ok) throw new ConflictException(MESSAGES[verdict.refus]);
};

/** Rôles et permissions de l'école (E-01-07 ; US-01-10, RG-01-14 à RG-01-16, RG-00-12). */
@Injectable()
export class RolesService {
  async lister(tx: Transaction): Promise<ListeRoles> {
    const date = aujourdhui();
    const lignes = await tx
      .select({
        role,
        personnes: countDistinct(attribution.personneId),
      })
      .from(role)
      .leftJoin(
        attribution,
        and(
          eq(attribution.roleId, role.id),
          isNull(attribution.deletedAt),
          lte(attribution.debut, date),
          or(isNull(attribution.fin), gt(attribution.fin, date)),
        ),
      )
      .where(isNull(role.deletedAt))
      .groupBy(role.id)
      // Rôles par défaut d'abord, dans l'ordre de création, puis les rôles personnalisés.
      .orderBy(sql`${role.code} is null`, asc(role.id));
    const permissions = await tx
      .select({ roleId: rolePermission.roleId, permission: rolePermission.permission })
      .from(rolePermission);
    return {
      roles: lignes.map(({ role: r, personnes }) =>
        this.detail(
          r,
          permissions.filter((p) => p.roleId === r.id).map((p) => p.permission),
          personnes,
        ),
      ),
    };
  }

  async creer(
    tx: Transaction,
    access: Access,
    entree: NouveauRole,
    adresseIp: string,
  ): Promise<RoleDetail> {
    const source = entree.sourceId ? await this.charger(tx, entree.sourceId) : null;
    const permissions = entree.permissions ?? source?.permissions ?? [];
    // Une copie garde au moins l'exigence de double authentification de sa source (RG-00-13).
    const doubleAuthentificationRequise =
      (source?.role.doubleAuthentificationRequise ?? false) ||
      (entree.doubleAuthentificationRequise ?? false);
    const [cree] = await tx
      .insert(role)
      .values({
        organisationId: access.organisationId,
        libelle: entree.libelle,
        description: entree.description ?? null,
        perimetreParDefaut: source?.role.perimetreParDefaut ?? 'organisation',
        doubleAuthentificationRequise,
        createdBy: access.userId,
      })
      .returning();
    if (!cree) throw new Error('Création du rôle impossible.');
    await this.ecrirePermissions(tx, access, cree.id, permissions);
    await enregistrerAudit(tx, {
      action: 'role.creer',
      objetType: 'role',
      objetId: cree.id,
      auteurId: access.userId,
      adresseIp,
      apres: {
        libelle: cree.libelle,
        permissions: [...permissions].sort(),
        doubleAuthentificationRequise,
        ...(source ? { dupliqueDe: source.role.id } : {}),
      },
    });
    return this.detail(cree, permissions, 0);
  }

  async modifier(
    tx: Transaction,
    access: Access,
    id: string,
    changement: ModificationRole,
    adresseIp: string,
  ): Promise<RoleDetail> {
    const { role: avant, permissions: permissionsAvant } = await this.charger(tx, id);
    refuser(verifierModificationRole(avant, changement, CATALOGUE));
    const [apres] = await tx
      .update(role)
      .set({
        ...(changement.libelle !== undefined ? { libelle: changement.libelle } : {}),
        ...(changement.description !== undefined ? { description: changement.description } : {}),
        ...(changement.doubleAuthentificationRequise !== undefined
          ? { doubleAuthentificationRequise: changement.doubleAuthentificationRequise }
          : {}),
        updatedBy: access.userId,
      })
      .where(eq(role.id, id))
      .returning();
    if (!apres) throw new NotFoundException('Rôle introuvable dans cette école.');
    const permissions = changement.permissions ?? permissionsAvant;
    if (changement.permissions) {
      await tx.delete(rolePermission).where(eq(rolePermission.roleId, id));
      await this.ecrirePermissions(tx, access, id, changement.permissions);
    }
    // RG-00-12 : valeurs avant et après ; le changement s'applique à la requête suivante (RG-01-16).
    await enregistrerAudit(tx, {
      action: 'role.modifier',
      objetType: 'role',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: {
        libelle: avant.libelle,
        description: avant.description,
        permissions: [...permissionsAvant].sort(),
        doubleAuthentificationRequise: avant.doubleAuthentificationRequise,
      },
      apres: {
        libelle: apres.libelle,
        description: apres.description,
        permissions: [...permissions].sort(),
        doubleAuthentificationRequise: apres.doubleAuthentificationRequise,
      },
    });
    return this.detail(apres, permissions, await this.personnes(tx, id));
  }

  async supprimer(tx: Transaction, access: Access, id: string, adresseIp: string): Promise<void> {
    const { role: cible, permissions } = await this.charger(tx, id);
    const date = aujourdhui();
    const [{ n } = { n: 0 }] = await tx
      .select({ n: countDistinct(attribution.id) })
      .from(attribution)
      .where(
        and(
          eq(attribution.roleId, id),
          isNull(attribution.deletedAt),
          or(isNull(attribution.fin), gt(attribution.fin, date)),
        ),
      );
    refuser(verifierSuppressionRole(cible, n));
    await tx
      .update(role)
      .set({ deletedAt: new Date(), updatedBy: access.userId })
      .where(eq(role.id, id));
    await enregistrerAudit(tx, {
      action: 'role.supprimer',
      objetType: 'role',
      objetId: id,
      auteurId: access.userId,
      adresseIp,
      avant: { libelle: cible.libelle, permissions: [...permissions].sort() },
    });
  }

  private async charger(tx: Transaction, id: string) {
    const [trouve] = await tx
      .select()
      .from(role)
      .where(and(eq(role.id, id), isNull(role.deletedAt)));
    if (!trouve) throw new NotFoundException('Rôle introuvable dans cette école.');
    const permissions = await tx
      .select({ permission: rolePermission.permission })
      .from(rolePermission)
      .where(eq(rolePermission.roleId, id));
    return { role: trouve, permissions: permissions.map((p) => p.permission) };
  }

  private async personnes(tx: Transaction, id: string): Promise<number> {
    const date = aujourdhui();
    const [{ n } = { n: 0 }] = await tx
      .select({ n: countDistinct(attribution.personneId) })
      .from(attribution)
      .where(
        and(
          eq(attribution.roleId, id),
          isNull(attribution.deletedAt),
          lte(attribution.debut, date),
          or(isNull(attribution.fin), gt(attribution.fin, date)),
        ),
      );
    return n;
  }

  private async ecrirePermissions(
    tx: Transaction,
    access: Access,
    roleId: string,
    permissions: readonly string[],
  ) {
    const uniques = [...new Set(permissions)];
    if (uniques.length === 0) return;
    await tx.insert(rolePermission).values(
      uniques.map((permission) => ({
        organisationId: access.organisationId,
        roleId,
        permission,
        createdBy: access.userId,
      })),
    );
  }

  private detail(
    r: typeof role.$inferSelect,
    permissions: readonly string[],
    personnes: number,
  ): RoleDetail {
    return {
      id: r.id,
      code: r.code,
      libelle: r.libelle,
      description: r.description,
      perimetreParDefaut: r.perimetreParDefaut,
      doubleAuthentificationRequise: r.doubleAuthentificationRequise,
      permissions: permissions
        .filter((p): p is Permission => CATALOGUE.has(p))
        .sort((a, b) => PERMISSION_CODES.indexOf(a) - PERMISSION_CODES.indexOf(b)),
      personnes,
      parDefaut: estRoleParDefaut(r),
      verrouille: estRoleVerrouille(r),
    };
  }
}

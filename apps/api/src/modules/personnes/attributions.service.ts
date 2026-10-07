import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AttributionPersonne,
  ListeAttributions,
  NouvelleAttribution,
} from '@scolaly/contracts';
import {
  administrateursActifs,
  attribution,
  enregistrerAudit,
  etablissement,
  formation,
  personne,
  promotion,
  role,
  type Transaction,
} from '@scolaly/db';
import {
  CODE_ADMINISTRATEUR,
  estEnCours,
  retraitAttribution,
  verifierChangementAdministrateur,
  verifierNouvelleAttribution,
  type RefusNouvelleAttribution,
  type TypePerimetre,
} from '@scolaly/domain';
import { and, asc, desc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { aujourdhui } from '../../shared/dates.js';
import { PersonnesService } from './personnes.service.js';

const PERIMETRES_DISPONIBLES: readonly TypePerimetre[] = [
  'organisation',
  'etablissement',
  'formation',
  'promotion',
  'soi',
];

const MESSAGES: Record<RefusNouvelleAttribution, string> = {
  'perimetre-sans-cible':
    'Choisissez l’établissement, la formation ou la promotion sur lequel ce rôle s’exerce.',
  'perimetre-cible-inattendue':
    'Ce périmètre ne désigne ni établissement, ni formation, ni promotion : retirez la cible.',
  'perimetre-indisponible': 'Ce périmètre n’est pas disponible.',
  dates: 'La fin du rôle doit être postérieure à son début.',
  'deja-attribue': 'Cette personne a déjà ce rôle sur ce périmètre pour cette période.',
};

const MESSAGES_ADMINISTRATEUR = {
  'dernier-administrateur':
    'Impossible : c’est le dernier administrateur actif de l’école. Nommez d’abord un autre administrateur.',
  'reserve-aux-administrateurs':
    'Seul un administrateur peut attribuer ou retirer le rôle d’administrateur.',
} as const;

const invalide = (champ: string, message: string) =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: [`${champ} : ${message}`],
  });

/** Rôles et périmètres d'une personne (US-01-09 ; RG-01-12, RG-01-14, RG-01-16). */
@Injectable()
export class AttributionsService {
  constructor(private readonly personnes: PersonnesService) {}

  async lister(tx: Transaction, access: Access, personneId: string): Promise<ListeAttributions> {
    await this.personnes.lire(tx, access, personneId);
    const date = aujourdhui();
    const lignes = await tx
      .select({
        attribution,
        roleLibelle: role.libelle,
        etablissement: etablissement.nom,
        formation: formation.intitule,
        promotion: promotion.libelle,
      })
      .from(attribution)
      .innerJoin(role, eq(role.id, attribution.roleId))
      .leftJoin(
        etablissement,
        and(
          eq(attribution.perimetreType, 'etablissement'),
          eq(etablissement.id, attribution.perimetreId),
        ),
      )
      .leftJoin(
        formation,
        and(eq(attribution.perimetreType, 'formation'), eq(formation.id, attribution.perimetreId)),
      )
      .leftJoin(
        promotion,
        and(eq(attribution.perimetreType, 'promotion'), eq(promotion.id, attribution.perimetreId)),
      )
      .where(and(eq(attribution.personneId, personneId), isNull(attribution.deletedAt)))
      .orderBy(desc(attribution.debut), asc(role.libelle));
    return {
      attributions: lignes.map(
        ({
          attribution: a,
          roleLibelle,
          etablissement: nom,
          formation: intitule,
          promotion: promo,
        }) => ({
          id: a.id,
          roleId: a.roleId,
          roleLibelle,
          perimetreType: a.perimetreType,
          perimetreId: a.perimetreId,
          perimetreLibelle: nom ?? intitule ?? promo,
          debut: a.debut,
          fin: a.fin,
          statut: estEnCours(a, date) ? 'en-cours' : a.debut > date ? 'a-venir' : 'terminee',
        }),
      ),
    };
  }

  async attribuer(
    tx: Transaction,
    access: Access,
    personneId: string,
    entree: NouvelleAttribution,
    adresseIp: string,
  ): Promise<AttributionPersonne> {
    await this.personnes.lire(tx, access, personneId);
    const [leRole] = await tx
      .select()
      .from(role)
      .where(and(eq(role.id, entree.roleId), isNull(role.deletedAt)));
    if (!leRole) throw invalide('roleId', 'Ce rôle n’existe pas dans l’école.');
    const debut = entree.debut ?? aujourdhui();
    const fin = entree.fin ?? null;
    const perimetreId = entree.perimetreId ?? null;
    if (entree.perimetreType === 'etablissement' && perimetreId) {
      const [cible] = await tx
        .select({ id: etablissement.id })
        .from(etablissement)
        .where(and(eq(etablissement.id, perimetreId), isNull(etablissement.deletedAt)));
      if (!cible) throw invalide('perimetreId', 'Cet établissement n’existe pas dans l’école.');
    }
    if (entree.perimetreType === 'formation' && perimetreId) {
      const [cible] = await tx
        .select({ id: formation.id })
        .from(formation)
        .where(and(eq(formation.id, perimetreId), isNull(formation.deletedAt)));
      if (!cible) throw invalide('perimetreId', 'Cette formation n’existe pas dans l’école.');
    }
    if (entree.perimetreType === 'promotion' && perimetreId) {
      const [cible] = await tx
        .select({ id: promotion.id })
        .from(promotion)
        .where(and(eq(promotion.id, perimetreId), isNull(promotion.deletedAt)));
      if (!cible) throw invalide('perimetreId', 'Cette promotion n’existe pas dans l’école.');
    }
    const [existante] = await tx
      .select({ id: attribution.id })
      .from(attribution)
      .where(
        and(
          eq(attribution.personneId, personneId),
          eq(attribution.roleId, leRole.id),
          eq(attribution.perimetreType, entree.perimetreType),
          sql`${attribution.perimetreId} is not distinct from ${perimetreId}`,
          isNull(attribution.deletedAt),
          or(isNull(attribution.fin), gt(attribution.fin, debut)),
          fin ? sql`${attribution.debut} < ${fin}` : undefined,
        ),
      );
    const verdict = verifierNouvelleAttribution({
      perimetreType: entree.perimetreType,
      perimetreId,
      debut,
      fin,
      perimetresDisponibles: PERIMETRES_DISPONIBLES,
      dejaAttribue: existante !== undefined,
    });
    if (!verdict.ok) {
      if (verdict.refus === 'deja-attribue') throw new ConflictException(MESSAGES[verdict.refus]);
      throw invalide(verdict.refus === 'dates' ? 'fin' : 'perimetreType', MESSAGES[verdict.refus]);
    }
    if (leRole.code === CODE_ADMINISTRATEUR) {
      const administrateurs = await administrateursActifs(tx, aujourdhui());
      const refus = verifierChangementAdministrateur({
        auteurEstAdministrateur: administrateurs.includes(access.personneId),
        concerneAdministrateur: true,
        administrateursActifsApres: administrateurs.length + 1,
      });
      if (!refus.ok) throw new ConflictException(MESSAGES_ADMINISTRATEUR[refus.refus]);
    }
    const [creee] = await tx
      .insert(attribution)
      .values({
        organisationId: access.organisationId,
        personneId,
        roleId: leRole.id,
        perimetreType: entree.perimetreType,
        perimetreId,
        debut,
        fin,
        createdBy: access.userId,
      })
      .returning();
    if (!creee) throw new Error('Attribution impossible.');
    await enregistrerAudit(tx, {
      action: 'role.attribuer',
      objetType: 'personne',
      objetId: personneId,
      auteurId: access.userId,
      adresseIp,
      apres: {
        attribution: creee.id,
        role: leRole.libelle,
        perimetreType: entree.perimetreType,
        perimetreId,
        debut,
        fin,
      },
    });
    const { attributions } = await this.lister(tx, access, personneId);
    const resultat = attributions.find((a) => a.id === creee.id);
    if (!resultat) throw new Error('Attribution introuvable après création.');
    return resultat;
  }

  async retirer(
    tx: Transaction,
    access: Access,
    attributionId: string,
    adresseIp: string,
  ): Promise<void> {
    const date = aujourdhui();
    const [ligne] = await tx
      .select({ attribution, role })
      .from(attribution)
      .innerJoin(role, eq(role.id, attribution.roleId))
      .innerJoin(personne, eq(personne.id, attribution.personneId))
      .where(
        and(
          eq(attribution.id, attributionId),
          isNull(attribution.deletedAt),
          isNull(personne.deletedAt),
        ),
      );
    if (!ligne) throw new NotFoundException('Attribution introuvable dans cette école.');
    const { attribution: a, role: leRole } = ligne;
    const retrait = retraitAttribution(a, date);
    if (retrait.action === 'deja-terminee') {
      throw new ConflictException('Ce rôle est déjà terminé.');
    }
    if (leRole.code === CODE_ADMINISTRATEUR && estEnCours(a, date)) {
      const administrateurs = await administrateursActifs(tx, date);
      // La personne reste administratrice si une autre attribution du rôle est en cours.
      const [autre] = await tx
        .select({ id: attribution.id })
        .from(attribution)
        .where(
          and(
            eq(attribution.personneId, a.personneId),
            eq(attribution.roleId, a.roleId),
            ne(attribution.id, a.id),
            isNull(attribution.deletedAt),
            sql`${attribution.debut} <= ${date}`,
            or(isNull(attribution.fin), gt(attribution.fin, date)),
          ),
        );
      const verdict = verifierChangementAdministrateur({
        auteurEstAdministrateur: administrateurs.includes(access.personneId),
        concerneAdministrateur: true,
        administrateursActifsApres: autre
          ? administrateurs.length
          : administrateurs.filter((id) => id !== a.personneId).length,
      });
      if (!verdict.ok) throw new ConflictException(MESSAGES_ADMINISTRATEUR[verdict.refus]);
    }
    await tx
      .update(attribution)
      .set(
        retrait.action === 'terminer'
          ? { fin: retrait.fin, updatedBy: access.userId }
          : { deletedAt: new Date(), updatedBy: access.userId },
      )
      .where(eq(attribution.id, a.id));
    // RG-01-16 : le retrait s'applique dès la requête suivante de la personne.
    await enregistrerAudit(tx, {
      action: 'role.retirer',
      objetType: 'personne',
      objetId: a.personneId,
      auteurId: access.userId,
      adresseIp,
      avant: { attribution: a.id, role: leRole.libelle, debut: a.debut, fin: a.fin },
      apres: retrait.action === 'terminer' ? { fin: retrait.fin } : { annulee: true },
    });
  }
}

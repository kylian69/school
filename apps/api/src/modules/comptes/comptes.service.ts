import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  administrateursActifs,
  authTwoFactor,
  authUser,
  enregistrerAudit,
  fichesDuCompte,
  personne,
  type Database,
  type Transaction,
} from '@scolaly/db';
import { verifierChangementAdministrateur } from '@scolaly/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';
import { RequestContext } from '../../access/request-context.js';
import type { Auth } from '../../auth/auth.js';
import { aujourdhui } from '../../shared/dates.js';
import { AUTH, DATABASE } from '../../shared/tokens.js';

const MESSAGES_ADMINISTRATEUR = {
  'dernier-administrateur':
    'Impossible : c’est le dernier administrateur actif de l’école. Nommez d’abord un autre administrateur.',
  'reserve-aux-administrateurs':
    'Seul un administrateur peut désactiver le compte d’un administrateur.',
} as const;

/** Désactivation et réactivation des comptes (RG-01-09, RG-01-12, RG-01-13 ; US-01-12). */
@Injectable()
export class ComptesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  async desactiver(
    tx: Transaction,
    access: Access,
    personneId: string,
    adresseIp: string,
  ): Promise<void> {
    const fiche = await this.fiche(tx, personneId);
    if (fiche.compteEtat === 'desactive')
      throw new ConflictException('Ce compte est déjà désactivé.');

    const administrateurs = await this.administrateursActifs(tx);
    const verdict = verifierChangementAdministrateur({
      auteurEstAdministrateur: administrateurs.includes(access.personneId),
      concerneAdministrateur: administrateurs.includes(personneId),
      administrateursActifsApres: administrateurs.filter((id) => id !== personneId).length,
    });
    if (!verdict.ok) throw new ConflictException(MESSAGES_ADMINISTRATEUR[verdict.refus]);

    await tx
      .update(personne)
      .set({ compteEtat: 'desactive', updatedBy: access.userId })
      .where(eq(personne.id, personneId));
    await enregistrerAudit(tx, {
      action: 'compte.desactiver',
      objetType: 'personne',
      objetId: personneId,
      auteurId: access.userId,
      adresseIp,
      avant: { compteEtat: fiche.compteEtat },
      apres: { compteEtat: 'desactive' },
    });
    // RG-01-13 : sans autre école active, toutes les sessions du compte sont révoquées.
    const userId = fiche.userId;
    if (userId) {
      RequestContext.apresValidation(async () => {
        const fiches = await fichesDuCompte(this.db, userId);
        if (fiches.actives === 0) {
          const context = await this.auth.$context;
          await context.internalAdapter.deleteUserSessions(userId);
        }
      });
    }
  }

  async reactiver(
    tx: Transaction,
    access: Access,
    personneId: string,
    adresseIp: string,
  ): Promise<void> {
    const fiche = await this.fiche(tx, personneId);
    if (fiche.compteEtat !== 'desactive')
      throw new ConflictException('Ce compte n’est pas désactivé.');
    const etat = fiche.userId ? ('actif' as const) : ('cree' as const);
    await tx
      .update(personne)
      .set({ compteEtat: etat, updatedBy: access.userId })
      .where(eq(personne.id, personneId));
    await enregistrerAudit(tx, {
      action: 'compte.reactiver',
      objetType: 'personne',
      objetId: personneId,
      auteurId: access.userId,
      adresseIp,
      avant: { compteEtat: 'desactive' },
      apres: { compteEtat: etat },
    });
  }

  /** RG-01-11 : réinitialisation de la double authentification par un administrateur, tracée. */
  async reinitialiserDoubleAuthentification(
    tx: Transaction,
    access: Access,
    personneId: string,
    adresseIp: string,
  ): Promise<void> {
    const fiche = await this.fiche(tx, personneId);
    if (!fiche.userId) throw new ConflictException('Ce compte n’est pas encore activé.');
    const userId = fiche.userId;
    await tx.delete(authTwoFactor).where(eq(authTwoFactor.userId, userId));
    await tx.update(authUser).set({ twoFactorEnabled: false }).where(eq(authUser.id, userId));
    await enregistrerAudit(tx, {
      action: 'compte.reinitialiser-double-authentification',
      objetType: 'personne',
      objetId: personneId,
      auteurId: access.userId,
      adresseIp,
    });
    RequestContext.apresValidation(async () => {
      const context = await this.auth.$context;
      await context.internalAdapter.deleteUserSessions(userId);
    });
  }

  private async fiche(tx: Transaction, personneId: string) {
    const [fiche] = await tx
      .select()
      .from(personne)
      .where(and(eq(personne.id, personneId), isNull(personne.deletedAt)))
      .for('update');
    if (!fiche) throw new NotFoundException('Personne introuvable dans cette école.');
    return fiche;
  }

  /** Fiches actives qui ont une attribution d'administrateur en cours (RG-01-12). */
  private administrateursActifs(tx: Transaction): Promise<string[]> {
    return administrateursActifs(tx, aujourdhui());
  }
}

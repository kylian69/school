import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ROLE_ADMINISTRATEUR,
  type ActivationCompte,
  type InvitationPublique,
} from '@scolaly/contracts';
import {
  attribution,
  enregistrerAudit,
  invitation,
  organisation,
  personne,
  role,
  withOrganisation,
  type Database,
  type Transaction,
} from '@scolaly/db';
import { etatInvitation, expirationInvitation, peutEtreInvite } from '@scolaly/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { createPasswordAccount, type Auth } from '../../auth/auth.js';
import type { Env } from '../../config/env.js';
import { aujourdhui } from '../../shared/dates.js';
import type { EmailsQueue } from '../../shared/emails.js';
import { AUTH, DATABASE, EMAILS, ENV } from '../../shared/tokens.js';
import { lireJeton, nouveauJeton } from './jeton.js';

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short' }).format(date);

const MESSAGES_ETAT = {
  expiree: 'Ce lien d’invitation a expiré. Demandez à votre établissement de vous le renvoyer.',
  utilisee: 'Ce lien a déjà servi : votre compte est activé. Connectez-vous avec votre email.',
  revoquee: 'Ce lien n’est plus valable. Utilisez le dernier email d’invitation reçu.',
} as const;

/** Invitations et activation des comptes (RG-01-08 ; parcours d'activation du module 01). */
@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(EMAILS) private readonly emails: EmailsQueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Envoie (ou renvoie) l'invitation d'une personne de l'école de la transaction. Le lien
   * précédent est révoqué. L'email part après la validation de la transaction.
   */
  async inviter(
    tx: Transaction,
    organisationId: string,
    personneId: string,
    auteur: { userId: string | null; adresseIp: string | null },
  ): Promise<{ expireLe: Date; envoyer: () => Promise<void> }> {
    const [fiche] = await tx
      .select()
      .from(personne)
      .where(and(eq(personne.id, personneId), isNull(personne.deletedAt)))
      .for('update');
    if (!fiche) throw new NotFoundException('Personne introuvable dans cette école.');
    if (!peutEtreInvite(fiche.compteEtat)) {
      throw new ConflictException(
        fiche.compteEtat === 'actif'
          ? 'Ce compte est déjà activé : aucune invitation n’est nécessaire.'
          : 'Ce compte est désactivé : réactivez-le avant de l’inviter.',
      );
    }
    const maintenant = new Date();
    await tx
      .update(invitation)
      .set({ revoqueeLe: maintenant })
      .where(
        and(
          eq(invitation.personneId, personneId),
          isNull(invitation.accepteeLe),
          isNull(invitation.revoqueeLe),
        ),
      );
    const { jeton, empreinte } = nouveauJeton(organisationId);
    const expireLe = expirationInvitation(maintenant);
    await tx.insert(invitation).values({
      organisationId,
      personneId,
      jetonEmpreinte: empreinte,
      email: fiche.email,
      envoyeeLe: maintenant,
      expireLe,
      createdBy: auteur.userId,
    });
    await tx
      .update(personne)
      .set({ compteEtat: 'invite', updatedBy: auteur.userId })
      .where(eq(personne.id, personneId));
    await enregistrerAudit(tx, {
      action: 'compte.inviter',
      objetType: 'personne',
      objetId: personneId,
      auteurId: auteur.userId,
      adresseIp: auteur.adresseIp,
      avant: { compteEtat: fiche.compteEtat },
      apres: { compteEtat: 'invite', email: fiche.email, expireLe: expireLe.toISOString() },
    });
    const [ecole] = await tx
      .select({ nom: organisation.nom })
      .from(organisation)
      .where(eq(organisation.id, organisationId));
    const lien = new URL(`/activation/${jeton}`, this.env.PUBLIC_URL).toString();
    return {
      expireLe,
      envoyer: () =>
        this.emails.envoyer({
          to: fiche.email,
          subject: `Activez votre compte Scolaly · ${ecole?.nom ?? 'votre école'}`,
          text: [
            `Bonjour ${fiche.prenom},`,
            '',
            `${ecole?.nom ?? 'Votre école'} vous invite à utiliser Scolaly : emploi du temps, émargement, notes et documents.`,
            '',
            `Activez votre compte avant le ${formatDate(expireLe)} :`,
            lien,
            '',
            'Ce lien est personnel et ne sert qu’une fois. Si vous n’attendiez pas cet email, ignorez-le.',
          ].join('\n'),
        }),
    };
  }

  /** Administrateur initial d'une école créée par la console (RG-19-01) : fiche, rôle, invitation. */
  async inviterAdministrateurInitial(
    organisationId: string,
    administrateur: { nom: string; email: string },
    auteurId: string,
  ): Promise<void> {
    const { envoyer } = await withOrganisation(this.db, organisationId, async (tx) => {
      const [prenom = administrateur.nom, ...reste] = administrateur.nom.trim().split(/\s+/);
      const [fiche] = await tx
        .insert(personne)
        .values({
          organisationId,
          prenom,
          nom: reste.join(' ') || prenom,
          email: administrateur.email,
          createdBy: auteurId,
        })
        .returning({ id: personne.id });
      const [admin] = await tx
        .select({ id: role.id })
        .from(role)
        .where(eq(role.code, ROLE_ADMINISTRATEUR));
      if (!fiche || !admin)
        throw new Error('Rôle administrateur absent : rôles par défaut non initialisés.');
      await tx.insert(attribution).values({
        organisationId,
        personneId: fiche.id,
        roleId: admin.id,
        perimetreType: 'organisation',
        debut: aujourdhui(),
        createdBy: auteurId,
      });
      await enregistrerAudit(tx, {
        action: 'role.attribuer',
        objetType: 'personne',
        objetId: fiche.id,
        auteurId,
        apres: { role: ROLE_ADMINISTRATEUR, origine: 'creation-du-client' },
      });
      return this.inviter(tx, organisationId, fiche.id, { userId: auteurId, adresseIp: null });
    });
    await envoyer();
  }

  async consulter(jeton: string): Promise<InvitationPublique> {
    const lu = lireJeton(jeton);
    if (!lu) throw new NotFoundException('Lien d’invitation invalide.');
    return withOrganisation(this.db, lu.organisationId, async (tx) => {
      const ligne = await this.trouver(tx, lu.empreinte);
      return {
        etat: etatInvitation(ligne.invitation, new Date()),
        prenom: ligne.prenom,
        email: ligne.invitation.email,
        ecole: ligne.ecole,
        expireLe: ligne.invitation.expireLe.toISOString(),
      };
    });
  }

  /**
   * Active le compte : crée le compte de connexion, ou rattache le compte existant de la même
   * personne (RG-00-26), puis marque l'invitation comme utilisée (usage unique).
   */
  async activer(
    jeton: string,
    entree: ActivationCompte,
    adresseIp: string,
  ): Promise<{ email: string; compteExistant: boolean }> {
    const lu = lireJeton(jeton);
    if (!lu) throw new NotFoundException('Lien d’invitation invalide.');
    return withOrganisation(this.db, lu.organisationId, async (tx) => {
      const ligne = await this.trouver(tx, lu.empreinte, true);
      const etat = etatInvitation(ligne.invitation, new Date());
      if (etat !== 'valide') throw new GoneException(MESSAGES_ETAT[etat]);

      const email = ligne.invitation.email.toLowerCase();
      const context = await this.auth.$context;
      const existant = await context.internalAdapter.findUserByEmail(email);
      const userId =
        existant?.user.id ??
        (
          await createPasswordAccount(this.auth, {
            email,
            name: `${ligne.prenom} ${ligne.nom}`.trim(),
            password: entree.motDePasse,
          })
        ).userId;
      const maintenant = new Date();
      await tx
        .update(personne)
        .set({ userId, compteEtat: 'actif', conditionsAccepteesLe: maintenant, updatedBy: userId })
        .where(eq(personne.id, ligne.invitation.personneId));
      await tx
        .update(invitation)
        .set({ accepteeLe: maintenant })
        .where(eq(invitation.id, ligne.invitation.id));
      await enregistrerAudit(tx, {
        action: 'compte.activer',
        objetType: 'personne',
        objetId: ligne.invitation.personneId,
        auteurId: userId,
        adresseIp,
        avant: { compteEtat: 'invite' },
        apres: { compteEtat: 'actif', compteExistant: Boolean(existant) },
      });
      return { email, compteExistant: Boolean(existant) };
    });
  }

  private async trouver(tx: Transaction, empreinte: string, verrouiller = false) {
    const requete = tx
      .select({ invitation, prenom: personne.prenom, nom: personne.nom, ecole: organisation.nom })
      .from(invitation)
      .innerJoin(personne, eq(personne.id, invitation.personneId))
      .innerJoin(organisation, eq(organisation.id, invitation.organisationId))
      .where(eq(invitation.jetonEmpreinte, empreinte));
    const [ligne] = verrouiller ? await requete.for('update', { of: invitation }) : await requete;
    if (!ligne) throw new NotFoundException('Lien d’invitation invalide.');
    return ligne;
  }
}

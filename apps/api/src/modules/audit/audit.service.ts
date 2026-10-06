import { BadRequestException, Injectable } from '@nestjs/common';
import type { EvenementAudit, JournalAudit, RechercheJournal } from '@scolaly/contracts';
import { auditEvenement, enregistrerAudit, personne, type Transaction } from '@scolaly/db';
import { ecrireCsv } from '@scolaly/domain';
import { and, desc, eq, inArray, like, sql, type SQL } from 'drizzle-orm';
import type { Access } from '../../access/access-resolver.js';

/** Export du journal limité à 10 000 événements : au-delà, affiner la période. */
const EXPORT_MAX = 10_000;
const FUSEAU = 'Europe/Paris';

const curseurInvalide = () =>
  new BadRequestException({
    message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
    details: ['curseur : Lien de page invalide : rechargez le journal.'],
  });

/** Curseur : instant et identifiant du dernier événement affiché. */
function lireCurseur(curseur: string): { instant: string; id: string } {
  const [instant, id] = Buffer.from(curseur, 'base64url').toString('utf8').split('|');
  if (!instant || !id || Number.isNaN(Date.parse(instant)) || !/^[0-9a-f-]{36}$/.test(id)) {
    throw curseurInvalide();
  }
  return { instant, id };
}

const ecrireCurseur = (e: { survenuLe: Date; id: string }) =>
  Buffer.from(`${e.survenuLe.toISOString()}|${e.id}`).toString('base64url');

const dateHeure = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU,
  dateStyle: 'short',
  timeStyle: 'medium',
});

/** Journal d'audit consultable (E-01-08 ; US-01-13, RG-01-22) : lecture seule, jamais modifié. */
@Injectable()
export class AuditService {
  private conditions(recherche: Omit<RechercheJournal, 'parPage' | 'curseur'>): SQL[] {
    const conditions: SQL[] = [];
    if (recherche.auteur) conditions.push(eq(auditEvenement.auteurId, recherche.auteur));
    if (recherche.action) {
      conditions.push(
        like(auditEvenement.action, `${recherche.action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`),
      );
    }
    if (recherche.objet) conditions.push(eq(auditEvenement.objetId, recherche.objet));
    // Bornes en jours civils de l'établissement, incluses.
    if (recherche.du) {
      conditions.push(
        sql`${auditEvenement.survenuLe} >= (${recherche.du}::date)::timestamp at time zone ${FUSEAU}`,
      );
    }
    if (recherche.au) {
      conditions.push(
        sql`${auditEvenement.survenuLe} < (${recherche.au}::date + 1)::timestamp at time zone ${FUSEAU}`,
      );
    }
    return conditions;
  }

  async lister(tx: Transaction, recherche: RechercheJournal): Promise<JournalAudit> {
    const conditions = this.conditions(recherche);
    if (recherche.curseur) {
      const { instant, id } = lireCurseur(recherche.curseur);
      conditions.push(
        sql`(${auditEvenement.survenuLe}, ${auditEvenement.id}) < (${instant}::timestamptz, ${id}::uuid)`,
      );
    }
    const lignes = await tx
      .select()
      .from(auditEvenement)
      .where(and(...conditions))
      .orderBy(desc(auditEvenement.survenuLe), desc(auditEvenement.id))
      .limit(recherche.parPage + 1);
    const page = lignes.slice(0, recherche.parPage);
    const derniere = page.at(-1);
    return {
      evenements: await this.detailler(tx, page),
      suivant: lignes.length > recherche.parPage && derniere ? ecrireCurseur(derniere) : null,
    };
  }

  /** Export CSV du journal filtré, lui-même tracé (RG-01-21). */
  async exporter(
    tx: Transaction,
    access: Access,
    recherche: Omit<RechercheJournal, 'parPage' | 'curseur'>,
    adresseIp: string,
  ): Promise<string> {
    const lignes = await tx
      .select()
      .from(auditEvenement)
      .where(and(...this.conditions(recherche)))
      .orderBy(desc(auditEvenement.survenuLe), desc(auditEvenement.id))
      .limit(EXPORT_MAX);
    const evenements = await this.detailler(tx, lignes);
    await enregistrerAudit(tx, {
      action: 'audit.exporter',
      objetType: 'audit_evenement',
      auteurId: access.userId,
      adresseIp,
      apres: { total: evenements.length, filtres: recherche },
    });
    return ecrireCsv(
      ['Date', 'Auteur', 'Adresse IP', 'Action', 'Objet', 'Identifiant', 'Avant', 'Après'],
      evenements.map((e) => [
        dateHeure.format(new Date(e.survenuLe)),
        e.auteur?.nom ?? '',
        e.adresseIp ?? '',
        e.action,
        e.objetType,
        e.objetId ?? '',
        e.avant === null || e.avant === undefined ? '' : JSON.stringify(e.avant),
        e.apres === null || e.apres === undefined ? '' : JSON.stringify(e.apres),
      ]),
    );
  }

  /** Auteurs retrouvés par leur fiche dans l'école (le journal garde l'identifiant du compte). */
  private async detailler(
    tx: Transaction,
    lignes: readonly (typeof auditEvenement.$inferSelect)[],
  ): Promise<EvenementAudit[]> {
    const comptes = [...new Set(lignes.flatMap((l) => (l.auteurId ? [l.auteurId] : [])))];
    const fiches =
      comptes.length === 0
        ? []
        : await tx
            .select({ userId: personne.userId, nom: personne.nom, prenom: personne.prenom })
            .from(personne)
            .where(inArray(personne.userId, comptes));
    const noms = new Map(fiches.map((f) => [f.userId, `${f.prenom} ${f.nom}`]));
    return lignes.map((l) => ({
      id: l.id,
      survenuLe: l.survenuLe.toISOString(),
      auteur: l.auteurId
        ? { id: l.auteurId, nom: noms.get(l.auteurId) ?? 'Compte hors de l’école' }
        : null,
      adresseIp: l.adresseIp,
      action: l.action,
      objetType: l.objetType,
      objetId: l.objetId,
      avant: l.avant,
      apres: l.apres,
    }));
  }
}

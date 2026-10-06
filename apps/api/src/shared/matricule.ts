import { anneeScolaire, organisation, personne, type Transaction } from '@scolaly/db';
import { genererMatricule, MODELE_MATRICULE_PAR_DEFAUT } from '@scolaly/domain';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { aujourdhui } from './dates.js';

/**
 * Année de référence des matricules (jetons {ANNEE} et {AA}) : début de l'année scolaire en
 * cours, sinon l'année civile. Un matricule créé en janvier 2027 pour 2026-2027 porte 2026.
 */
export async function anneeDeReference(tx: Transaction): Promise<number> {
  const date = aujourdhui();
  const [enCours] = await tx
    .select({ debut: anneeScolaire.dateDebut })
    .from(anneeScolaire)
    .where(
      and(
        isNull(anneeScolaire.deletedAt),
        lte(anneeScolaire.dateDebut, date),
        gte(anneeScolaire.dateFin, date),
      ),
    )
    .orderBy(desc(anneeScolaire.dateDebut))
    .limit(1);
  return Number((enCours?.debut ?? date).slice(0, 4));
}

/**
 * Attribue le prochain matricule de l'école (RG-01-06) : le compteur avance dans la transaction
 * (la ligne de l'organisation est verrouillée jusqu'à la validation), et saute les matricules déjà
 * pris, par exemple importés. Un numéro n'est jamais réattribué.
 */
export async function attribuerMatricule(tx: Transaction, organisationId: string): Promise<string> {
  const annee = await anneeDeReference(tx);
  for (let essai = 0; essai < 1000; essai++) {
    const [ligne] = await tx
      .update(organisation)
      .set({ matriculeCompteur: sql`${organisation.matriculeCompteur} + 1` })
      .where(eq(organisation.id, organisationId))
      .returning({ numero: organisation.matriculeCompteur, modele: organisation.modeleMatricule });
    if (!ligne) throw new Error('École introuvable pour le matricule.');
    const matricule = genererMatricule(ligne.modele ?? MODELE_MATRICULE_PAR_DEFAUT, {
      annee,
      numero: ligne.numero,
    });
    const [pris] = await tx
      .select({ id: personne.id })
      .from(personne)
      .where(eq(personne.matricule, matricule));
    if (!pris) return matricule;
  }
  throw new Error('Aucun matricule libre : vérifiez le modèle de matricule de l’école.');
}

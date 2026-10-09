import { sql } from 'drizzle-orm';
import { FieldEncryptionError, type FieldEncryption } from './chiffrement.js';
import type { Database } from './client.js';
import { enregistrerAudit } from './journal.js';
import { withOrganisation } from './organisation-context.js';

/**
 * Inventaire des champs chiffrés (ADR 0002) : table, colonne, et contexte lié à la valeur (données
 * associées). Les services l'utilisent pour chiffrer, le worker pour rechiffrer ; un nouveau champ
 * s'ajoute ici et dans la fonction `valeurs_chiffrees_par_version` (test d'inventaire).
 */
export const CHAMPS_CHIFFRES = {
  'indisponibilite_intervenant.motif': {
    table: 'indisponibilite_intervenant',
    colonne: 'motif_chiffre',
    colonneContexte: 'id',
  },
  'flux_ical.jeton': {
    table: 'flux_ical',
    colonne: 'jeton_chiffre',
    colonneContexte: 'personne_id',
  },
} as const;

export type ChampChiffre = keyof typeof CHAMPS_CHIFFRES;

/** Contexte du chiffrement d'une valeur : `<champ>:<identifiant de la ligne ou de la personne>`. */
export const contexteChiffrement = (champ: ChampChiffre, cle: string) => `${champ}:${cle}`;

export interface ComptageChiffrement {
  organisationId: string;
  champ: string;
  /** Version de la clé maîtresse ; nulle pour une valeur mal formée. */
  version: number | null;
  nombre: number;
}

/** Nombre de valeurs chiffrées par école, champ et version de clé (aucune valeur lue). */
export async function compterValeursChiffrees(db: Database): Promise<ComptageChiffrement[]> {
  const resultat = await db.execute<{
    organisation_id: string;
    champ: string;
    version: number | null;
    nombre: string;
  }>(sql`select organisation_id, champ, version, nombre from valeurs_chiffrees_par_version()`);
  return resultat.rows.map((ligne) => ({
    organisationId: ligne.organisation_id,
    champ: ligne.champ,
    version: ligne.version,
    nombre: Number(ligne.nombre),
  }));
}

export interface BilanRechiffrement {
  /** Valeurs rechiffrées avec la version courante. */
  rechiffrees: number;
  /** Valeurs illisibles (altérées, ou clé de leur version absente) : laissées telles quelles. */
  echecs: number;
  /** Transactions courtes exécutées (un lot chacune). */
  lots: number;
}

export interface OptionsRechiffrement {
  /** Valeurs par lot, donc par transaction. */
  taille?: number;
  /** Nombre maximal de lots pour ce passage ; le suivant reprend là où il s'est arrêté. */
  lotsMax?: number;
  /** Limite le passage à ces écoles (toutes par défaut). */
  organisationIds?: readonly string[];
}

const UUID_MIN = '00000000-0000-0000-0000-000000000000';

/**
 * Rotation de la clé maîtresse (ADR 0006) : rechiffre avec la version courante les valeurs
 * d'anciennes versions, école par école et champ par champ, par lots de `taille` valeurs dans des
 * transactions courtes sous RLS. Les lignes verrouillées par un utilisateur sont sautées
 * (SKIP LOCKED) et une valeur n'est remplacée que si elle n'a pas changé entre-temps : la tâche est
 * idempotente et reprend, après une interruption, avec ce qui reste. Chaque lot est inscrit au
 * journal d'audit (comptes seulement, jamais de valeur).
 */
export async function rechiffrerValeurs(
  db: Database,
  chiffrement: FieldEncryption,
  options: OptionsRechiffrement = {},
): Promise<BilanRechiffrement> {
  const taille = options.taille ?? 200;
  const lotsMax = options.lotsMax ?? Number.POSITIVE_INFINITY;
  const courante = chiffrement.currentVersion;
  const prefixe = `v${courante}.`;
  const bilan: BilanRechiffrement = { rechiffrees: 0, echecs: 0, lots: 0 };
  const aTraiter = new Map<string, { organisationId: string; champ: ChampChiffre }>();
  for (const c of await compterValeursChiffrees(db)) {
    if (c.version === courante || !(c.champ in CHAMPS_CHIFFRES)) continue;
    if (options.organisationIds && !options.organisationIds.includes(c.organisationId)) continue;
    const champ = c.champ as ChampChiffre;
    aTraiter.set(`${c.organisationId}|${champ}`, { organisationId: c.organisationId, champ });
  }
  for (const { organisationId, champ } of aTraiter.values()) {
    const { table, colonne, colonneContexte } = CHAMPS_CHIFFRES[champ];
    const [t, col, ctx] = [table, colonne, colonneContexte].map((nom) => sql.identifier(nom));
    let apres = UUID_MIN;
    for (;;) {
      if (bilan.lots >= lotsMax) return bilan;
      const lot = await withOrganisation(db, organisationId, async (tx) => {
        const lignes = await tx.execute<{ id: string; cle: string; valeur: string }>(
          sql`select id, ${ctx}::text as cle, ${col} as valeur from ${t}
              where ${col} is not null and not starts_with(${col}, ${prefixe})
                and id > ${apres}::uuid
              order by id limit ${taille} for update skip locked`,
        );
        let rechiffrees = 0;
        const versions = new Set<string>();
        for (const ligne of lignes.rows) {
          let nouvelle: string;
          try {
            nouvelle = chiffrement.reencrypt(
              ligne.valeur,
              organisationId,
              contexteChiffrement(champ, ligne.cle),
            );
          } catch (error) {
            if (!(error instanceof FieldEncryptionError)) throw error;
            bilan.echecs += 1;
            continue;
          }
          const maj = await tx.execute(
            sql`update ${t} set ${col} = ${nouvelle} where id = ${ligne.id} and ${col} = ${ligne.valeur}`,
          );
          if ((maj.rowCount ?? 0) > 0) {
            rechiffrees += 1;
            versions.add(ligne.valeur.slice(0, ligne.valeur.indexOf('.')));
          }
        }
        if (rechiffrees > 0) {
          await enregistrerAudit(tx, {
            action: 'chiffrement.rechiffrement',
            objetType: champ,
            avant: { versions: [...versions].sort() },
            apres: { version: `v${courante}`, nombre: rechiffrees },
          });
        }
        return { nombre: lignes.rows.length, dernier: lignes.rows.at(-1)?.id, rechiffrees };
      });
      bilan.lots += 1;
      bilan.rechiffrees += lot.rechiffrees;
      if (lot.nombre < taille || !lot.dernier) break;
      apres = lot.dernier;
    }
  }
  return bilan;
}

/**
 * Indicateur de retrait (ADR 0006) : une version de clé peut être retirée quand ce n'est pas la
 * version courante et qu'aucune valeur ne l'utilise plus, ni aucune valeur illisible (à examiner
 * avant tout retrait).
 */
export function retraitPossible(
  comptages: readonly ComptageChiffrement[],
  version: number,
  courante: number,
): { possible: boolean; restantes: number; illisibles: number } {
  const total = (filtre: (c: ComptageChiffrement) => boolean) =>
    comptages.filter(filtre).reduce((somme, c) => somme + c.nombre, 0);
  const restantes = total((c) => c.version === version);
  const illisibles = total((c) => c.version === null);
  return {
    possible: version !== courante && restantes === 0 && illisibles === 0,
    restantes,
    illisibles,
  };
}

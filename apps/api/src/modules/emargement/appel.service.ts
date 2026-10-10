import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  JETON_PERIODE_SECONDES,
  type AppelEnDirect,
  commandesSessions,
  type OuvertureAppel,
  perimetreAControler,
  type PresenceEnCache,
  type ResultatLocalisation,
} from '@scolaly/contracts';
import {
  cleMaitresseCourante,
  etablissementDeSeance,
  presence,
  seanceEtAttendus,
  seanceIntervenant,
  sessionsDesComptes,
  withOrganisation,
  type Database,
  type Transaction,
} from '@scolaly/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { ServerResponse } from 'node:http';
import type { Access } from '../../access/access-resolver.js';
import type { Env } from '../../config/env.js';
import { DATABASE, ENV, VALKEY } from '../../shared/tokens.js';
import { CacheEmargement, CacheIndisponible, cleDeSeance } from './cache-emargement.js';

/** Liste en direct : lecture du cache toutes les 500 ms (module 06, section 9 : moins d'une seconde). */
const INTERVALLE_DIRECT_MS = 500;
/** Le flux se referme au bout de 30 minutes ; le navigateur se reconnecte et les droits sont revus. */
const DUREE_FLUX_MS = 30 * 60_000;
/** Commentaire envoyé sans changement, pour que les relais ne coupent pas la connexion. */
const BATTEMENT_MS = 15_000;
/** Mode dégradé (Valkey indisponible) : les scans sont en base, relue au plus toutes les 5 s. */
const RELECTURE_BASE_MS = 5_000;

type Attendu = { personneId: string; nom: string; prenom: string };
type Scans = Map<
  string,
  { scanneLe: string; rejoue: boolean; localisation: ResultatLocalisation | null }
>;

/** Ce que le flux en direct garde en mémoire : attendus et présences déjà en base, lus une fois. */
export interface EtatDirect {
  organisationId: string;
  seanceId: string;
  attendus: Attendu[];
  enBase: Scans;
}

function composer(attendus: readonly Attendu[], enBase: Scans, enCache: PresenceEnCache[]) {
  const scans: Scans = new Map(enBase);
  for (const p of enCache)
    scans.set(p.personneId, {
      scanneLe: p.scanneLe,
      rejoue: p.rejoue,
      localisation: p.localisation ?? null,
    });
  const liste = attendus.map((a) => ({
    personneId: a.personneId,
    nom: a.nom,
    prenom: a.prenom,
    scanneLe: scans.get(a.personneId)?.scanneLe ?? null,
    rejoue: scans.get(a.personneId)?.rejoue ?? false,
    localisation: scans.get(a.personneId)?.localisation ?? null,
  }));
  return {
    presents: liste.filter((l) => l.scanneLe !== null).length,
    attendus: liste.length,
    liste,
  } satisfies AppelEnDirect;
}

/** Ouverture de l'appel et liste en direct, pour l'intervenant (US-06-01, US-06-03). */
@Injectable()
export class AppelService implements OnModuleDestroy {
  private readonly cache: CacheEmargement;
  private readonly cleMaitresse: Buffer;
  private readonly logger = new Logger('Emargement');
  /** Flux en direct ouverts, refermés à l'arrêt de l'API. */
  private readonly flux = new Set<() => void>();

  constructor(
    @Inject(VALKEY) valkey: Redis,
    @Inject(ENV) env: Env,
    @Inject(DATABASE) private readonly db: Database,
  ) {
    this.cache = new CacheEmargement(valkey);
    // Clé de séance dérivée de la clé maîtresse courante (ADR 0006).
    this.cleMaitresse = cleMaitresseCourante(env.chiffrement);
  }

  onModuleDestroy() {
    for (const arreter of [...this.flux]) arreter();
  }

  /** L'un des intervenants de la séance (RG-04-01), ou une personne habilitée sur toute l'école. */
  private async charger(tx: Transaction, access: Access, seanceId: string) {
    const trouve = await seanceEtAttendus(tx, seanceId);
    if (!trouve) throw new NotFoundException('Séance introuvable dans cette école.');
    const ecole = (access.perimetres.get('emargement:animer') ?? []).some(
      (p) => p.type === 'organisation',
    );
    if (!ecole) {
      const [lien] = await tx
        .select({ id: seanceIntervenant.id })
        .from(seanceIntervenant)
        .where(
          and(
            eq(seanceIntervenant.seanceId, seanceId),
            eq(seanceIntervenant.personneId, access.personneId),
            isNull(seanceIntervenant.deletedAt),
          ),
        );
      if (!lien)
        throw new ForbiddenException(
          "Seuls les intervenants de cette séance peuvent en ouvrir l'appel.",
        );
    }
    return trouve;
  }

  /** Précharge la séance dans Valkey (RG-00-17) et donne à l'écran de quoi calculer le QR. */
  async ouvrir(tx: Transaction, access: Access, seanceId: string): Promise<OuvertureAppel> {
    const { seance: ligne, attendus } = await this.charger(tx, access, seanceId);
    // US-04-11, RG-04-13 : une séance annulée, reportée ou en brouillon n'a pas d'appel.
    if (ligne.statut !== 'publiee')
      throw new ConflictException(
        ligne.statut === 'brouillon'
          ? "Cette séance n'est pas encore publiée : son appel ne s'ouvre pas."
          : "Cette séance est annulée ou reportée : son appel ne s'ouvre plus. Ouvrez celui de la séance de remplacement s'il y en a une.",
      );
    // Sans Valkey, l'appel s'ouvre quand même : le scan passera en mode dégradé.
    await this.cache
      .precharger(
        seanceId,
        {
          organisationId: access.organisationId,
          libelle: ligne.libelle,
          debut: ligne.debut.getTime(),
          fin: ligne.fin.getTime(),
          distanciel: ligne.distanciel,
          // RG-06-10 : périmètre préchargé, le scan le compare sans requête SQL.
          localisation: perimetreAControler(
            ligne.distanciel,
            await etablissementDeSeance(tx, ligne),
          ),
        },
        new Map(attendus.flatMap((a) => (a.userId ? [[a.userId, a.personneId] as const] : []))),
      )
      .catch((erreur: unknown) => {
        if (!(erreur instanceof CacheIndisponible)) throw erreur;
      });
    // Sessions des attendus remises en cache : le scan ne doit pas les relire en base.
    const comptes = attendus.flatMap((a) => (a.userId ? [a.userId] : []));
    await this.cache
      .rechaufferSessions(commandesSessions(await sessionsDesComptes(this.db, comptes)))
      .catch((erreur: unknown) => {
        if (!(erreur instanceof CacheIndisponible)) throw erreur;
      });
    return {
      seanceId,
      libelle: ligne.libelle,
      debut: ligne.debut.toISOString(),
      fin: ligne.fin.toISOString(),
      cle: Buffer.from(cleDeSeance(this.cleMaitresse, access.organisationId, seanceId)).toString(
        'base64url',
      ),
      periodeSecondes: JETON_PERIODE_SECONDES,
      maintenant: new Date().toISOString(),
    };
  }

  private static scansEnBase(lignes: (typeof presence.$inferSelect)[]): Scans {
    return new Map(
      lignes.map((p) => [
        p.personneId,
        { scanneLe: p.scanneLe.toISOString(), rejoue: p.rejoue, localisation: p.localisation },
      ]),
    );
  }

  /** Présences du cache, ou null si Valkey ne répond pas. */
  private async presencesEnCache(seanceId: string): Promise<PresenceEnCache[] | null> {
    if (!this.cache.disponible()) return null;
    return this.cache.presences(seanceId).catch((erreur: unknown) => {
      if (!(erreur instanceof CacheIndisponible)) throw erreur;
      return null;
    });
  }

  /** Droits vérifiés, attendus et présences en base lus une fois, avant d'ouvrir le flux. */
  async preparerDirect(tx: Transaction, access: Access, seanceId: string): Promise<EtatDirect> {
    const { attendus } = await this.charger(tx, access, seanceId);
    const enBase = await tx.select().from(presence).where(eq(presence.seanceId, seanceId));
    return {
      organisationId: access.organisationId,
      seanceId,
      attendus: attendus.map((a) => ({ personneId: a.personneId, nom: a.nom, prenom: a.prenom })),
      enBase: AppelService.scansEnBase(enBase),
    };
  }

  /** Présents du cache (en direct) et de la base (déjà écrits par le worker). */
  async enDirect(tx: Transaction, access: Access, seanceId: string): Promise<AppelEnDirect> {
    const etat = await this.preparerDirect(tx, access, seanceId);
    return composer(etat.attendus, etat.enBase, (await this.presencesEnCache(seanceId)) ?? []);
  }

  /**
   * Flux SSE de la liste en direct (RG-06-05, US-06-03) : un événement AppelEnDirect à chaque
   * changement. Seul le cache est relu (aucune requête SQL tant que Valkey répond) ; le flux tourne
   * hors de la transaction de la requête, qui est déjà validée.
   */
  diffuser(reponse: ServerResponse, etat: EtatDirect) {
    reponse.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      // no-transform : ni compression ni mise en tampon par un relais.
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    });
    reponse.write('retry: 2000\n\n');
    const ouvertLe = Date.now();
    let enBase = etat.enBase;
    let envoye = '';
    let dernierEnvoi = ouvertLe;
    let relueLe = ouvertLe;
    let minuterie: NodeJS.Timeout | undefined;
    let actif = true;
    const arreter = () => {
      if (!actif) return;
      actif = false;
      clearTimeout(minuterie);
      this.flux.delete(arreter);
      reponse.end();
    };
    const tic = async () => {
      const enCache = await this.presencesEnCache(etat.seanceId);
      if (enCache === null && Date.now() - relueLe >= RELECTURE_BASE_MS) {
        relueLe = Date.now();
        enBase = AppelService.scansEnBase(
          await withOrganisation(this.db, etat.organisationId, (tx) =>
            tx.select().from(presence).where(eq(presence.seanceId, etat.seanceId)),
          ),
        );
      }
      if (!actif) return;
      const donnees = JSON.stringify(composer(etat.attendus, enBase, enCache ?? []));
      if (donnees !== envoye) {
        envoye = donnees;
        dernierEnvoi = Date.now();
        reponse.write(`data: ${donnees}\n\n`);
      } else if (Date.now() - dernierEnvoi >= BATTEMENT_MS) {
        dernierEnvoi = Date.now();
        reponse.write(': battement\n\n');
      }
    };
    const boucle = async () => {
      if (!actif) return;
      if (Date.now() - ouvertLe >= DUREE_FLUX_MS) {
        arreter();
        return;
      }
      await tic().catch((erreur: unknown) => {
        this.logger.warn(`Liste en direct : lecture impossible (${String(erreur)}).`);
      });
      // Flux refermé pendant la lecture (navigateur parti, arrêt de l'API) : on s'arrête là.
      if (!reponse.writableEnded) minuterie = setTimeout(() => void boucle(), INTERVALLE_DIRECT_MS);
    };
    reponse.on('close', arreter);
    this.flux.add(arreter);
    void boucle();
  }
}

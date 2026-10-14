import {
  BadRequestException,
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
  type MarquageEnCache,
  type MarquagePresence,
  type OuvertureAppel,
  perimetreAControler,
  type PhotosAppel,
  type PresenceEnCache,
  type ResultatLocalisation,
} from '@scolaly/contracts';
import {
  cleMaitresseCourante,
  enregistrerAudit,
  etablissementDeSeance,
  presence,
  presenceMarquage,
  seanceEtAttendus,
  seanceIntervenant,
  sessionsDesComptes,
  withOrganisation,
  type Database,
  type Transaction,
} from '@scolaly/db';
import { comptePresent, modePresence, statutDansAppel, verifierMarquage } from '@scolaly/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { ServerResponse } from 'node:http';
import type { Access } from '../../access/access-resolver.js';
import { RequestContext } from '../../access/request-context.js';
import type { Env } from '../../config/env.js';
import { ObjectStorage, SIGNED_URL_TTL_SECONDS } from '../../shared/storage/object-storage.js';
import { DATABASE, ENV, OBJECT_STORAGE, VALKEY } from '../../shared/tokens.js';
import { UrlSignee } from '../../shared/url-signee.js';
import { CacheEmargement, CacheIndisponible, cleDeSeance } from './cache-emargement.js';

/** Adresse des photos signées de la liste d'appel (servies par PhotosAppelController). */
export const ROUTE_PHOTOS_SIGNEES = '/api/photos/appel';

const REFUS_MARQUAGE = {
  'trop-tot':
    "L'appel de cette séance n'est pas encore ouvert : réessayez 10 minutes avant son début.",
  verrouille:
    "L'appel de cette séance est verrouillé (7 jours après la séance) : demandez à la scolarité.",
  'retard-invalide':
    'Indiquez le retard en minutes entières, entre 1 et la durée de la séance ; seul un retard en porte.',
} as const;

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
  {
    scanneLe: string;
    rejoue: boolean;
    localisation: ResultatLocalisation | null;
    aDistance: boolean;
  }
>;
type Marquages = Map<string, MarquageEnCache>;

/** Ce que le flux en direct garde en mémoire : attendus, présences et décisions en base, lus une fois. */
export interface EtatDirect {
  organisationId: string;
  seanceId: string;
  attendus: Attendu[];
  enBase: Scans;
  marquagesEnBase: Marquages;
}

/** Ce que la liste lit dans Valkey à chaque tour. */
interface LectureCache {
  presences: PresenceEnCache[];
  marquages: Marquages;
}

function composer(
  attendus: readonly Attendu[],
  etat: Pick<EtatDirect, 'enBase' | 'marquagesEnBase'>,
  cache: LectureCache,
) {
  const scans: Scans = new Map(etat.enBase);
  for (const p of cache.presences)
    scans.set(p.personneId, {
      scanneLe: p.scanneLe,
      rejoue: p.rejoue,
      localisation: p.localisation ?? null,
      aDistance: p.aDistance ?? false,
    });
  // La décision la plus récente l'emporte : la base fait foi, le cache peut être en avance.
  const marquages: Marquages = new Map(etat.marquagesEnBase);
  for (const [personneId, m] of cache.marquages) {
    const enBase = marquages.get(personneId);
    if (!enBase || Date.parse(m.marqueLe) > Date.parse(enBase.marqueLe))
      marquages.set(personneId, m);
  }
  const liste = attendus.map((a) => {
    const scan = scans.get(a.personneId) ?? null;
    const marquage = marquages.get(a.personneId) ?? null;
    return {
      personneId: a.personneId,
      nom: a.nom,
      prenom: a.prenom,
      scanneLe: scan?.scanneLe ?? null,
      rejoue: scan?.rejoue ?? false,
      localisation: scan?.localisation ?? null,
      aDistance: scan?.aDistance ?? false,
      statut: statutDansAppel(scan, marquage),
      marquage,
    };
  });
  return {
    presents: liste.filter((l) => comptePresent(l.statut)).length,
    attendus: liste.length,
    liste,
  } satisfies AppelEnDirect;
}

const marquagesDe = (lignes: (typeof presenceMarquage.$inferSelect)[]): Marquages =>
  new Map(
    lignes.map((m) => [
      m.personneId,
      { statut: m.statut, minutesRetard: m.minutesRetard, marqueLe: m.marqueLe.toISOString() },
    ]),
  );

const lireMarquagesEnBase = async (tx: Transaction, seanceId: string) =>
  marquagesDe(
    await tx
      .select()
      .from(presenceMarquage)
      .where(and(eq(presenceMarquage.seanceId, seanceId), isNull(presenceMarquage.deletedAt))),
  );

/** Ouverture de l'appel et liste en direct, pour l'intervenant (US-06-01, US-06-03). */
@Injectable()
export class AppelService implements OnModuleDestroy {
  private readonly cache: CacheEmargement;
  private readonly cleMaitresse: Buffer;
  private readonly logger = new Logger('Emargement');
  /** Flux en direct ouverts, refermés à l'arrêt de l'API. */
  private readonly flux = new Set<() => void>();

  private readonly signature: UrlSignee;

  constructor(
    @Inject(VALKEY) valkey: Redis,
    @Inject(ENV) env: Env,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {
    this.cache = new CacheEmargement(valkey);
    // Clé de séance dérivée de la clé maîtresse courante (ADR 0006).
    this.cleMaitresse = cleMaitresseCourante(env.chiffrement);
    this.signature = new UrlSignee(this.cleMaitresse, 'photos-appel');
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
          mode: modePresence(ligne),
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
      mode: modePresence(ligne),
      maintenant: new Date().toISOString(),
    };
  }

  private static scansEnBase(lignes: (typeof presence.$inferSelect)[]): Scans {
    return new Map(
      lignes.map((p) => [
        p.personneId,
        {
          scanneLe: p.scanneLe.toISOString(),
          rejoue: p.rejoue,
          localisation: p.localisation,
          aDistance: p.aDistance,
        },
      ]),
    );
  }

  /** Présences et décisions du cache, ou null si Valkey ne répond pas. */
  private async lireCache(seanceId: string): Promise<LectureCache | null> {
    if (!this.cache.disponible()) return null;
    return Promise.all([this.cache.presences(seanceId), this.cache.marquages(seanceId)])
      .then(([presences, marquages]) => ({ presences, marquages }))
      .catch((erreur: unknown) => {
        if (!(erreur instanceof CacheIndisponible)) throw erreur;
        return null;
      });
  }

  /** Droits vérifiés, attendus, présences et décisions en base lus une fois, avant le flux. */
  async preparerDirect(tx: Transaction, access: Access, seanceId: string): Promise<EtatDirect> {
    const { attendus } = await this.charger(tx, access, seanceId);
    const enBase = await tx.select().from(presence).where(eq(presence.seanceId, seanceId));
    return {
      organisationId: access.organisationId,
      seanceId,
      attendus: attendus.map((a) => ({ personneId: a.personneId, nom: a.nom, prenom: a.prenom })),
      enBase: AppelService.scansEnBase(enBase),
      marquagesEnBase: await lireMarquagesEnBase(tx, seanceId),
    };
  }

  /** Présents du cache (en direct) et de la base (déjà écrits par le worker). */
  async enDirect(tx: Transaction, access: Access, seanceId: string): Promise<AppelEnDirect> {
    const etat = await this.preparerDirect(tx, access, seanceId);
    return composer(
      etat.attendus,
      etat,
      (await this.lireCache(seanceId)) ?? { presences: [], marquages: new Map() },
    );
  }

  /**
   * Appel manuel (US-06-04, US-06-05 ; RG-06-11, RG-06-12) : l'intervenant marque un attendu
   * présent, en retard ou absent, qu'il ait scanné ou non. Le scan reste en base tel quel ; la
   * décision est tracée (valeur avant et après) puis copiée dans le cache pour la liste en direct.
   */
  async marquer(
    tx: Transaction,
    access: Access,
    seanceId: string,
    personneId: string,
    corps: MarquagePresence,
    adresseIp: string,
  ): Promise<AppelEnDirect> {
    const { seance: ligne, attendus } = await this.charger(tx, access, seanceId);
    if (ligne.statut !== 'publiee')
      throw new ConflictException(
        "Cette séance n'est pas publiée, ou elle est annulée ou reportée : son appel ne se fait pas.",
      );
    if (!attendus.some((a) => a.personneId === personneId))
      throw new NotFoundException(
        "Cet apprenant n'est pas attendu à cette séance. Vérifiez son groupe auprès de la scolarité.",
      );
    const refus = verifierMarquage(
      { debutMs: ligne.debut.getTime(), finMs: ligne.fin.getTime() },
      Date.now(),
      corps,
    );
    if (refus)
      throw new BadRequestException({
        message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
        details: [`marquage : ${REFUS_MARQUAGE[refus]}`],
      });

    const [scan] = await tx
      .select()
      .from(presence)
      .where(and(eq(presence.seanceId, seanceId), eq(presence.personneId, personneId)));
    const [ancien] = await tx
      .select()
      .from(presenceMarquage)
      .where(
        and(eq(presenceMarquage.seanceId, seanceId), eq(presenceMarquage.personneId, personneId)),
      );
    const enCache = (await this.lireCache(seanceId))?.presences.find(
      (p) => p.personneId === personneId,
    );
    const scanConnu = enCache
      ? { rejoue: enCache.rejoue, localisation: enCache.localisation ?? null }
      : (scan ?? null);
    const marquageAvant = ancien && !ancien.deletedAt ? ancien : null;
    const marqueLe = new Date();
    const valeurs = {
      statut: corps.statut,
      minutesRetard: corps.statut === 'retard' ? corps.minutesRetard : null,
      marquePar: access.personneId,
      marqueLe,
      deletedAt: null,
      updatedBy: access.userId,
    };
    const [ecrit] = await tx
      .insert(presenceMarquage)
      .values({
        ...valeurs,
        organisationId: access.organisationId,
        seanceId,
        personneId,
        createdBy: access.userId,
      })
      .onConflictDoUpdate({
        target: [
          presenceMarquage.organisationId,
          presenceMarquage.seanceId,
          presenceMarquage.personneId,
        ],
        set: { ...valeurs, updatedAt: marqueLe },
      })
      .returning({ id: presenceMarquage.id });
    // Absences et présences : action sensible, tracée avec la valeur avant et après.
    await enregistrerAudit(tx, {
      action: 'presence.marquer',
      objetType: 'presence_marquage',
      objetId: ecrit?.id ?? null,
      auteurId: access.userId,
      adresseIp,
      avant: {
        seanceId,
        personneId,
        statut: statutDansAppel(scanConnu, marquageAvant),
        minutesRetard: marquageAvant?.minutesRetard ?? null,
        scanneLe: enCache?.scanneLe ?? scan?.scanneLe.toISOString() ?? null,
      },
      apres: { seanceId, personneId, statut: valeurs.statut, minutesRetard: valeurs.minutesRetard },
    });
    const enMemoire: MarquageEnCache = {
      statut: valeurs.statut,
      minutesRetard: valeurs.minutesRetard,
      marqueLe: marqueLe.toISOString(),
    };
    RequestContext.apresValidation(() =>
      this.cache
        .marquer(seanceId, personneId, enMemoire, ligne.fin.getTime())
        .catch((erreur: unknown) => {
          // Sans Valkey, la liste en direct relit la base (mode dégradé).
          if (!(erreur instanceof CacheIndisponible)) throw erreur;
        }),
    );
    return this.enDirect(tx, access, seanceId);
  }

  /**
   * Photos des attendus (RG-01-27 : intervenants des groupes de l'apprenant, liste d'appel ;
   * RG-06-11). Chaque adresse est signée pour le compte qui la demande et vaut quelques minutes :
   * la photo reste privée dans le stockage, jamais publique.
   */
  async photos(tx: Transaction, access: Access, seanceId: string): Promise<PhotosAppel> {
    const { attendus } = await this.charger(tx, access, seanceId);
    const expireLe = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
    return {
      expireLe: new Date(expireLe).toISOString(),
      photos: attendus.flatMap((a) =>
        a.photoCle
          ? [
              {
                personneId: a.personneId,
                url: `${ROUTE_PHOTOS_SIGNEES}?jeton=${this.signature.signer({ c: a.photoCle, u: access.userId }, expireLe)}`,
              },
            ]
          : [],
      ),
    };
  }

  /** Photo d'une adresse signée, pour le seul compte à qui elle a été donnée. */
  async photoSignee(jeton: string, userId: string | undefined): Promise<Buffer> {
    const charge = this.signature.verifier(jeton);
    if (!charge || typeof charge.c !== 'string' || !userId || charge.u !== userId)
      throw new NotFoundException('Photo introuvable ou adresse expirée : rechargez la liste.');
    return this.storage.get(charge.c).catch(() => {
      throw new NotFoundException('Photo introuvable ou adresse expirée : rechargez la liste.');
    });
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
    let enBase = { enBase: etat.enBase, marquagesEnBase: etat.marquagesEnBase };
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
      const enCache = await this.lireCache(etat.seanceId);
      if (enCache === null && Date.now() - relueLe >= RELECTURE_BASE_MS) {
        relueLe = Date.now();
        enBase = await withOrganisation(this.db, etat.organisationId, async (tx) => ({
          enBase: AppelService.scansEnBase(
            await tx.select().from(presence).where(eq(presence.seanceId, etat.seanceId)),
          ),
          marquagesEnBase: await lireMarquagesEnBase(tx, etat.seanceId),
        }));
      }
      if (!actif) return;
      const donnees = JSON.stringify(
        composer(etat.attendus, enBase, enCache ?? { presences: [], marquages: new Map() }),
      );
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

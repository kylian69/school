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
  type ApprenantsAjoutables,
  commandesSessions,
  type FeuilleAppel,
  type MarquageEnCache,
  type MarquagePresence,
  type OuvertureAppel,
  perimetreAControler,
  type PhotosAppel,
  type PresenceEnCache,
  type ResultatLocalisation,
  type ValidationAppel,
  type VersionAppel,
} from '@scolaly/contracts';
import {
  apprenantsAjoutables,
  appelValidation,
  cleMaitresseCourante,
  enregistrerAudit,
  etablissementDeSeance,
  personne,
  presence,
  presenceMarquage,
  seanceEtAttendus,
  seanceIntervenant,
  sessionsDesComptes,
  validationsDeSeance,
  versionAppel,
  withOrganisation,
  type Database,
  type LigneAppelValidee,
  type Transaction,
} from '@scolaly/db';
import {
  comptePresent,
  decisionAVerifier,
  etatAppel,
  listeCanonique,
  minutesDeRetard,
  raisonAVerifier,
  statutDansAppel,
  verifierMarquage,
  verifierModification,
  type RefusModification,
} from '@scolaly/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
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

/** RG-06-01, RG-06-15 : pourquoi l'appel ne se modifie pas (ou plus). */
const REFUS_MODIFICATION: Record<RefusModification, string> = {
  'trop-tot': REFUS_MARQUAGE['trop-tot'],
  verrouille:
    "L'appel de cette séance est verrouillé (7 jours après la séance) : il ne se modifie plus.",
  'delai-intervenant':
    "Le délai de correction de l'intervenant (2 jours après la séance) est passé : demandez la correction à la scolarité ou à la pédagogie.",
  'motif-requis':
    'Cet appel est déjà validé : indiquez le motif de la correction (3 caractères au moins), puis réessayez.',
};

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
    retardMinutes: number | null;
  }
>;
type Marquages = Map<string, MarquageEnCache>;

/** Ce que le flux en direct garde en mémoire : attendus, présences et décisions en base, lus une fois. */
export interface EtatDirect {
  organisationId: string;
  seanceId: string;
  debutMs: number;
  finMs: number;
  attendus: Attendu[];
  /** Apprenants non attendus ajoutés par l'intervenant. */
  ajoutes: Attendu[];
  enBase: Scans;
  marquagesEnBase: Marquages;
  validation: VersionAppel | null;
}

/** Ce que la liste lit dans Valkey à chaque tour. */
interface LectureCache {
  presences: PresenceEnCache[];
  marquages: Marquages;
  validation: VersionAppel | null;
}

const CACHE_VIDE: LectureCache = { presences: [], marquages: new Map(), validation: null };

function composer(etat: Omit<EtatDirect, 'organisationId' | 'seanceId'>, cache: LectureCache) {
  const scans: Scans = new Map(etat.enBase);
  for (const p of cache.presences)
    scans.set(p.personneId, {
      scanneLe: p.scanneLe,
      rejoue: p.rejoue,
      localisation: p.localisation ?? null,
      aDistance: p.aDistance ?? false,
      retardMinutes: p.retardMinutes ?? null,
    });
  // La décision la plus récente l'emporte : la base fait foi, le cache peut être en avance.
  const marquages: Marquages = new Map(etat.marquagesEnBase);
  for (const [personneId, m] of cache.marquages) {
    const enBase = marquages.get(personneId);
    if (!enBase || Date.parse(m.marqueLe) > Date.parse(enBase.marqueLe))
      marquages.set(personneId, m);
  }
  const ligne = (a: Attendu, nonAttendu: boolean) => {
    const scan = scans.get(a.personneId) ?? null;
    const marquage = marquages.get(a.personneId) ?? null;
    const statut = statutDansAppel(scan, marquage);
    const raison = scan ? raisonAVerifier(scan) : null;
    return {
      personneId: a.personneId,
      nom: a.nom,
      prenom: a.prenom,
      scanneLe: scan?.scanneLe ?? null,
      rejoue: scan?.rejoue ?? false,
      localisation: scan?.localisation ?? null,
      aDistance: scan?.aDistance ?? false,
      statut,
      minutesRetard: minutesDeRetard(statut, scan, marquage),
      raison,
      decision: decisionAVerifier(raison, marquage),
      nonAttendu,
      marquage: marquage
        ? {
            statut: marquage.statut,
            minutesRetard: marquage.minutesRetard,
            marqueLe: marquage.marqueLe,
          }
        : null,
    };
  };
  const liste = [
    ...etat.attendus.map((a) => ligne(a, false)),
    ...etat.ajoutes.map((a) => ligne(a, true)),
  ];
  // Le cache peut avoir une validation plus récente que celle lue à l'ouverture du flux.
  const validation =
    cache.validation && cache.validation.version > (etat.validation?.version ?? 0)
      ? cache.validation
      : etat.validation;
  return {
    etat: etatAppel({ debutMs: etat.debutMs, finMs: etat.finMs }, validation !== null, Date.now()),
    validation,
    presents: liste.filter((l) => comptePresent(l.statut)).length,
    attendus: etat.attendus.length,
    liste,
  } satisfies AppelEnDirect;
}

const marquagesDe = (lignes: (typeof presenceMarquage.$inferSelect)[]): Marquages =>
  new Map(
    lignes.map((m) => [
      m.personneId,
      {
        statut: m.statut,
        minutesRetard: m.minutesRetard,
        marqueLe: m.marqueLe.toISOString(),
        nonAttendu: m.nonAttendu,
      },
    ]),
  );

const lireMarquagesEnBase = async (tx: Transaction, seanceId: string) =>
  marquagesDe(
    await tx
      .select()
      .from(presenceMarquage)
      .where(and(eq(presenceMarquage.seanceId, seanceId), isNull(presenceMarquage.deletedAt))),
  );

/** Noms des fiches données (apprenants ajoutés, ou plus attendus depuis une version validée). */
const nomsDe = async (tx: Transaction, ids: readonly string[]): Promise<Attendu[]> =>
  ids.length === 0
    ? []
    : tx
        .select({ personneId: personne.id, nom: personne.nom, prenom: personne.prenom })
        .from(personne)
        .where(inArray(personne.id, [...ids]))
        .orderBy(personne.nom, personne.prenom);

/**
 * Ligne signée : la liste validée, sans les noms (les fiches font foi). RGPD-03 : le résultat de
 * localisation est effacé de la présence à deux mois ; la version signée, inaltérable, ne le garde
 * donc pas (ni « hors site » ni « inconnu » comme raison) : seuls le statut « à vérifier », le
 * rejeu hors ligne et la décision de l'intervenant y figurent.
 */
const ligneValidee = (l: AppelEnDirect['liste'][number]): LigneAppelValidee => ({
  personneId: l.personneId,
  statut: l.statut,
  scanneLe: l.scanneLe,
  minutesRetard: l.minutesRetard,
  aDistance: l.aDistance,
  localisation: null,
  raison: l.raison === 'rejoue' ? 'rejoue' : null,
  decision: l.decision,
  nonAttendu: l.nonAttendu,
});

const sha256 = (texte: string) => createHash('sha256').update(texte).digest('hex');

/** Ce qui identifie l'auteur d'une validation (RG-06-13), en plus de sa session. */
export interface ClientValidation {
  adresseIp: string;
  userAgent: string | undefined;
}

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

  /**
   * L'un des intervenants de la séance (RG-04-01), ou une personne habilitée sur toute l'école
   * (scolarité, pédagogie : gestionnaire de l'appel, RG-06-15).
   */
  private async charger(tx: Transaction, access: Access, seanceId: string) {
    const trouve = await seanceEtAttendus(tx, seanceId);
    if (!trouve) throw new NotFoundException('Séance introuvable dans cette école.');
    const gestionnaire = (access.perimetres.get('emargement:animer') ?? []).some(
      (p) => p.type === 'organisation',
    );
    if (!gestionnaire) {
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
    return { ...trouve, gestionnaire };
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
    const validation = (await validationsDeSeance(tx, seanceId)).at(-1);
    // Sans Valkey, l'appel s'ouvre quand même : le scan passera en mode dégradé.
    await this.cache
      .precharger(
        seanceId,
        {
          organisationId: access.organisationId,
          libelle: ligne.libelle,
          debut: ligne.debut.getTime(),
          fin: ligne.fin.getTime(),
          distanciel: ligne.modePresence === 'distanciel',
          mode: ligne.modePresence,
          // RG-06-10 : périmètre préchargé, le scan le compare sans requête SQL.
          localisation: perimetreAControler(
            ligne.modePresence === 'distanciel',
            await etablissementDeSeance(tx, ligne),
          ),
          // RG-06-13 : un appel validé refuse les scans, sans requête SQL.
          validation: validation ? versionAppel(validation) : null,
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
      mode: ligne.modePresence,
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
          retardMinutes: p.retardMinutes,
        },
      ]),
    );
  }

  /** Présences, décisions et validation du cache, ou null si Valkey ne répond pas. */
  private async lireCache(seanceId: string): Promise<LectureCache | null> {
    if (!this.cache.disponible()) return null;
    return Promise.all([
      this.cache.presences(seanceId),
      this.cache.marquages(seanceId),
      this.cache.validation(seanceId),
    ])
      .then(([presences, marquages, validation]) => ({ presences, marquages, validation }))
      .catch((erreur: unknown) => {
        if (!(erreur instanceof CacheIndisponible)) throw erreur;
        return null;
      });
  }

  /** Droits vérifiés, attendus, présences et décisions en base lus une fois, avant le flux. */
  async preparerDirect(tx: Transaction, access: Access, seanceId: string): Promise<EtatDirect> {
    const { seance: ligne, attendus } = await this.charger(tx, access, seanceId);
    const enBase = await tx.select().from(presence).where(eq(presence.seanceId, seanceId));
    const marquagesEnBase = await lireMarquagesEnBase(tx, seanceId);
    const derniere = (await validationsDeSeance(tx, seanceId)).at(-1);
    return {
      organisationId: access.organisationId,
      seanceId,
      debutMs: ligne.debut.getTime(),
      finMs: ligne.fin.getTime(),
      attendus: attendus.map((a) => ({ personneId: a.personneId, nom: a.nom, prenom: a.prenom })),
      ajoutes: await nomsDe(
        tx,
        [...marquagesEnBase].flatMap(([id, m]) => (m.nonAttendu ? [id] : [])),
      ),
      enBase: AppelService.scansEnBase(enBase),
      marquagesEnBase,
      validation: derniere ? versionAppel(derniere) : null,
    };
  }

  /** Présents du cache (en direct) et de la base (déjà écrits par le worker). */
  async enDirect(tx: Transaction, access: Access, seanceId: string): Promise<AppelEnDirect> {
    const etat = await this.preparerDirect(tx, access, seanceId);
    return composer(etat, (await this.lireCache(seanceId)) ?? CACHE_VIDE);
  }

  /**
   * Refuse une modification de l'appel hors de son cycle (RG-06-01) ; après validation, c'est une
   * correction, avec motif et dans les délais (RG-06-15). Renvoie la dernière validation.
   */
  private async controlerModification(
    tx: Transaction,
    seanceId: string,
    ligne: { debut: Date; fin: Date; statut: string },
    gestionnaire: boolean,
    motif: string | null,
  ) {
    if (ligne.statut !== 'publiee')
      throw new ConflictException(
        "Cette séance n'est pas publiée, ou elle est annulée ou reportée : son appel ne se fait pas.",
      );
    const validations = await validationsDeSeance(tx, seanceId);
    const refus = verifierModification(
      { debutMs: ligne.debut.getTime(), finMs: ligne.fin.getTime() },
      validations.length > 0,
      Date.now(),
      { gestionnaire, motif },
    );
    if (refus === 'motif-requis')
      throw new BadRequestException({
        message: 'Données invalides. Corrigez les champs signalés puis réessayez.',
        details: [`motif : ${REFUS_MODIFICATION[refus]}`],
      });
    if (refus) throw new ConflictException(REFUS_MODIFICATION[refus]);
    return validations.at(-1) ?? null;
  }

  /**
   * Appel manuel (US-06-04, US-06-05 ; RG-06-11, RG-06-12) : l'intervenant marque un attendu
   * présent, en retard ou absent, qu'il ait scanné ou non. Le scan reste en base tel quel ; la
   * décision est tracée (valeur avant et après) puis copiée dans le cache pour la liste en direct.
   * Un apprenant non attendu de la même promotion peut être ajouté (anomalie signalée). Sur un
   * appel validé, c'est une correction : une nouvelle version est signée (RG-06-13, RG-06-15).
   */
  async marquer(
    tx: Transaction,
    access: Access,
    seanceId: string,
    personneId: string,
    corps: MarquagePresence,
    client: ClientValidation,
  ): Promise<AppelEnDirect> {
    const { seance: ligne, attendus, gestionnaire } = await this.charger(tx, access, seanceId);
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
    const motif = corps.motif ?? null;
    const derniere = await this.controlerModification(tx, seanceId, ligne, gestionnaire, motif);
    const [ancien] = await tx
      .select()
      .from(presenceMarquage)
      .where(
        and(eq(presenceMarquage.seanceId, seanceId), eq(presenceMarquage.personneId, personneId)),
      );
    const attendu = attendus.some((a) => a.personneId === personneId);
    const dejaAjoute = ancien?.nonAttendu === true && !ancien.deletedAt;
    if (
      !attendu &&
      !dejaAjoute &&
      !(await apprenantsAjoutables(tx, seanceId)).some((a) => a.personneId === personneId)
    )
      throw new NotFoundException(
        "Cet apprenant n'est pas attendu à cette séance et n'est inscrit dans aucune de ses promotions. Vérifiez son inscription auprès de la scolarité.",
      );

    const [scan] = await tx
      .select()
      .from(presence)
      .where(and(eq(presence.seanceId, seanceId), eq(presence.personneId, personneId)));
    const enCache = (await this.lireCache(seanceId))?.presences.find(
      (p) => p.personneId === personneId,
    );
    const scanConnu = enCache
      ? {
          rejoue: enCache.rejoue,
          localisation: enCache.localisation ?? null,
          retardMinutes: enCache.retardMinutes ?? null,
        }
      : (scan ?? null);
    const marquageAvant = ancien && !ancien.deletedAt ? ancien : null;
    const nonAttendu = !attendu;
    const marqueLe = new Date();
    const valeurs = {
      statut: corps.statut,
      minutesRetard: corps.statut === 'retard' ? corps.minutesRetard : null,
      marquePar: access.personneId,
      marqueLe,
      nonAttendu,
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
    // Absences et présences : action sensible, tracée avec la valeur avant et après. L'ajout d'un
    // apprenant non attendu a sa propre action : la scolarité la retrouve dans le journal.
    await enregistrerAudit(tx, {
      action: nonAttendu && !dejaAjoute ? 'presence.ajouter-non-attendu' : 'presence.marquer',
      objetType: 'presence_marquage',
      objetId: ecrit?.id ?? null,
      auteurId: access.userId,
      adresseIp: client.adresseIp,
      avant: {
        seanceId,
        personneId,
        statut: marquageAvant || attendu ? statutDansAppel(scanConnu, marquageAvant) : null,
        minutesRetard: marquageAvant?.minutesRetard ?? null,
        scanneLe: enCache?.scanneLe ?? scan?.scanneLe.toISOString() ?? null,
      },
      apres: {
        seanceId,
        personneId,
        statut: valeurs.statut,
        minutesRetard: valeurs.minutesRetard,
        nonAttendu,
        motif,
      },
    });
    const enMemoire: MarquageEnCache = {
      statut: valeurs.statut,
      minutesRetard: valeurs.minutesRetard,
      marqueLe: marqueLe.toISOString(),
      nonAttendu,
    };
    RequestContext.apresValidation(() =>
      this.cache
        .marquer(seanceId, personneId, enMemoire, ligne.fin.getTime())
        .catch((erreur: unknown) => {
          // Sans Valkey, la liste en direct relit la base (mode dégradé).
          if (!(erreur instanceof CacheIndisponible)) throw erreur;
        }),
    );
    const appel = await this.enDirect(tx, access, seanceId);
    if (!derniere) return appel;
    // RG-06-13 : toute modification après validation crée une nouvelle version de la feuille.
    const version = await this.signer(tx, access, seanceId, ligne.fin, appel, client, {
      version: derniere.version + 1,
      motif,
      commentaire: null,
      avant: { version: derniere.version, empreinte: derniere.empreinte },
    });
    return { ...appel, etat: 'valide', validation: version };
  }

  /**
   * RG-06-12, RG-06-13 : l'intervenant valide son appel (signature électronique simple). Identité,
   * heure du serveur, adresse IP, appareil (haché) et empreinte de la liste sont enregistrés ; les
   * scans sont ensuite refusés. Une seule première validation : la suite passe par les corrections.
   */
  async valider(
    tx: Transaction,
    access: Access,
    seanceId: string,
    corps: ValidationAppel,
    client: ClientValidation,
  ): Promise<AppelEnDirect> {
    const { seance: ligne, gestionnaire } = await this.charger(tx, access, seanceId);
    if ((await validationsDeSeance(tx, seanceId)).length > 0)
      throw new ConflictException(
        "Cet appel est déjà validé. Pour le corriger, changez le statut d'un apprenant en indiquant le motif.",
      );
    await this.controlerModification(tx, seanceId, ligne, gestionnaire, null);
    const appel = await this.enDirect(tx, access, seanceId);
    const version = await this.signer(tx, access, seanceId, ligne.fin, appel, client, {
      version: 1,
      motif: null,
      commentaire: corps.commentaire || null,
      avant: null,
    });
    return { ...appel, etat: 'valide', validation: version };
  }

  /** Enregistre une version signée de la liste, la trace, puis la copie dans le cache. */
  private async signer(
    tx: Transaction,
    access: Access,
    seanceId: string,
    fin: Date,
    appel: AppelEnDirect,
    client: ClientValidation,
    v: {
      version: number;
      motif: string | null;
      commentaire: string | null;
      avant: { version: number; empreinte: string } | null;
    },
  ): Promise<VersionAppel> {
    const liste = appel.liste.map(ligneValidee);
    const empreinte = sha256(listeCanonique(seanceId, v.version, liste));
    const valideLe = new Date();
    const [ecrit] = await tx
      .insert(appelValidation)
      .values({
        organisationId: access.organisationId,
        seanceId,
        version: v.version,
        validePar: access.personneId,
        valideLe,
        adresseIp: client.adresseIp,
        appareil: sha256(client.userAgent ?? ''),
        empreinte,
        liste,
        motif: v.motif,
        commentaire: v.commentaire,
        createdBy: access.userId,
      })
      .returning({ id: appelValidation.id });
    await enregistrerAudit(tx, {
      action: v.version === 1 ? 'appel.valider' : 'appel.corriger',
      objetType: 'appel_validation',
      objetId: ecrit?.id ?? null,
      auteurId: access.userId,
      adresseIp: client.adresseIp,
      avant: v.avant ? { seanceId, ...v.avant } : null,
      apres: {
        seanceId,
        version: v.version,
        empreinte,
        presents: appel.presents,
        attendus: appel.attendus,
        motif: v.motif,
      },
    });
    const [auteur] = await nomsDe(tx, [access.personneId]);
    const version = versionAppel({
      version: v.version,
      valideLe,
      nom: auteur?.nom ?? '',
      prenom: auteur?.prenom ?? '',
      empreinte,
      motif: v.motif,
      commentaire: v.commentaire,
    });
    RequestContext.apresValidation(() =>
      this.cache.valider(seanceId, version, fin.getTime()).catch((erreur: unknown) => {
        // Sans Valkey, le mode dégradé lit la validation en base.
        if (!(erreur instanceof CacheIndisponible)) throw erreur;
      }),
    );
    return version;
  }

  /**
   * Feuille d'appel de l'intervenant : la liste en cours (scans et décisions combinés) ou celle
   * d'une version validée, avec l'historique des versions (RG-06-13). La feuille PDF vient en I4.4.
   */
  async feuille(
    tx: Transaction,
    access: Access,
    seanceId: string,
    version: number | null,
  ): Promise<FeuilleAppel> {
    const { seance: ligne } = await this.charger(tx, access, seanceId);
    const appel = await this.enDirect(tx, access, seanceId);
    const validations = await validationsDeSeance(tx, seanceId);
    const base = {
      ...appel,
      seance: {
        libelle: ligne.libelle,
        debut: ligne.debut.toISOString(),
        fin: ligne.fin.toISOString(),
        mode: ligne.modePresence,
      },
      versions: validations.map(versionAppel),
      version: null,
    };
    if (version === null) return base;
    const choisie = validations.find((v) => v.version === version);
    if (!choisie)
      throw new NotFoundException(
        "Cette version de l'appel n'existe pas : choisissez-en une autre.",
      );
    const noms = new Map(
      (
        await nomsDe(
          tx,
          choisie.liste.map((l) => l.personneId),
        )
      ).map((n) => [n.personneId, n]),
    );
    const liste = choisie.liste.map((l) => ({
      ...l,
      localisation: (l.localisation as ResultatLocalisation | null) ?? null,
      nom: noms.get(l.personneId)?.nom ?? '',
      prenom: noms.get(l.personneId)?.prenom ?? '',
      rejoue: l.raison === 'rejoue',
      marquage: null,
    }));
    return {
      ...base,
      presents: liste.filter((l) => comptePresent(l.statut)).length,
      attendus: liste.filter((l) => !l.nonAttendu).length,
      liste,
      version,
    };
  }

  /** Apprenants de la même promotion que l'intervenant peut ajouter (mauvais groupe). */
  async ajoutables(
    tx: Transaction,
    access: Access,
    seanceId: string,
  ): Promise<ApprenantsAjoutables> {
    await this.charger(tx, access, seanceId);
    const ajoutes = await lireMarquagesEnBase(tx, seanceId);
    return (await apprenantsAjoutables(tx, seanceId)).filter(
      (a) => !ajoutes.get(a.personneId)?.nonAttendu,
    );
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
      const donnees = JSON.stringify(composer({ ...etat, ...enBase }, enCache ?? CACHE_VIDE));
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

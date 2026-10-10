import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  JETON_PERIODE_SECONDES,
  lireJeton,
  verifierCode,
  verifierJeton,
  type CodeEmargement,
  type PositionScan,
  type ResultatLocalisation,
  type ResultatScan,
  type ScanEmargement,
  type SeanceEnCache,
} from '@scolaly/contracts';
import { evaluerLocalisation, evaluerScan } from '@scolaly/domain';
import { BlockList, isIPv4, isIPv6 } from 'node:net';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import type { Auth } from '../../auth/auth.js';
import type { Env } from '../../config/env.js';
import { AUTH, DATABASE, ENV, VALKEY } from '../../shared/tokens.js';
import { clesMaitressesParPriorite, type Database } from '@scolaly/db';
import type { Redis } from 'ioredis';
import {
  CacheEmargement,
  CacheIndisponible,
  cleDeSeance,
  type Magasin,
} from './cache-emargement.js';
import { MagasinDegrade } from './magasin-degrade.js';

const pasOuvert = () =>
  new ConflictException(
    "L'appel de cette séance n'est pas ouvert. Attendez que l'intervenant l'ouvre, ou signalez-vous à lui.",
  );

/** Plages déjà analysées, par liste : le scan ne les relit pas à chaque fois (calcul en mémoire). */
const listesIp = new Map<string, BlockList>();

/** Type d'adresse pour BlockList ; une adresse IPv4 vue en IPv6 (::ffff:a.b.c.d) est ramenée en IPv4. */
function adresse(ip: string): { ip: string; type: 'ipv4' | 'ipv6' } | null {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIPv4(v4)) return { ip: v4, type: 'ipv4' };
  return isIPv6(ip) ? { ip, type: 'ipv6' } : null;
}

/** RGPD-03 : l'adresse IP de l'envoi est-elle dans les plages du réseau du campus ? */
export function reseauDuCampus(plages: readonly string[], ip: string): boolean {
  if (plages.length === 0) return false;
  const cle = plages.join(',');
  let liste = listesIp.get(cle);
  if (!liste) {
    liste = new BlockList();
    for (const plage of plages) {
      const [base = '', longueur] = plage.split('/');
      const lue = adresse(base);
      if (!lue) continue;
      if (longueur === undefined) liste.addAddress(lue.ip, lue.type);
      else liste.addSubnet(lue.ip, Number(longueur), lue.type);
    }
    if (listesIp.size > 1000) listesIp.clear();
    listesIp.set(cle, liste);
  }
  const lue = adresse(ip);
  return lue !== null && liste.check(lue.ip, lue.type);
}

/**
 * Chemin rapide du scan (architecture, section 5 ; RG-00-16 à RG-00-18) : session, séance,
 * attendus et présences sont lus dans Valkey ; la clé de la séance est recalculée en mémoire.
 * Aucune requête SQL : la présence part dans un flux que le worker écrit par lots. Sans Valkey,
 * le mode dégradé écrit directement en base.
 */
@Injectable()
export class ScanService {
  private readonly cache: CacheEmargement;
  /** Clé maîtresse courante d'abord : un QR dérivé d'une autre version reste valable (ADR 0006). */
  private readonly clesMaitresses: Buffer[];
  private readonly logger = new Logger('Emargement');

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VALKEY) valkey: Redis,
    @Inject(ENV) env: Env,
  ) {
    this.cache = new CacheEmargement(valkey);
    this.clesMaitresses = clesMaitressesParPriorite(env.chiffrement);
  }

  scanner(headers: IncomingHttpHeaders, corps: ScanEmargement, ip: string): Promise<ResultatScan> {
    return this.avecBascule((magasin) => this.scannerAvec(magasin, headers, corps, ip));
  }

  saisirCode(
    headers: IncomingHttpHeaders,
    corps: CodeEmargement,
    ip: string,
  ): Promise<ResultatScan> {
    return this.avecBascule((magasin) => this.saisirCodeAvec(magasin, headers, corps, ip));
  }

  /**
   * Mode dégradé (architecture, section 5) : si Valkey ne répond pas, le scan passe par
   * PostgreSQL, plus lentement mais sans interruption, et une alerte est journalisée.
   */
  private async avecBascule(travail: (magasin: Magasin) => Promise<ResultatScan>) {
    if (this.cache.disponible()) {
      try {
        return await travail(this.cache);
      } catch (erreur) {
        if (!(erreur instanceof CacheIndisponible)) throw erreur;
      }
    }
    this.logger.error(
      'Émargement en mode dégradé : Valkey indisponible, écriture directe en base.',
    );
    return travail(new MagasinDegrade(this.db));
  }

  /** Session lue dans Valkey, sans la prolonger (une prolongation écrirait en base). */
  private async utilisateur(headers: IncomingHttpHeaders): Promise<string> {
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(headers),
      query: { disableRefresh: true },
    });
    if (!session) {
      throw new UnauthorizedException(
        'Session expirée : reconnectez-vous puis scannez de nouveau.',
      );
    }
    return session.user.id;
  }

  private async scannerAvec(
    magasin: Magasin,
    headers: IncomingHttpHeaders,
    corps: ScanEmargement,
    ip: string,
  ): Promise<ResultatScan> {
    const lu = lireJeton(corps.jeton);
    if (!lu) throw new BadRequestException('Ce QR code n’est pas un QR d’émargement Scolaly.');
    const [seance, userId] = await Promise.all([
      magasin.seance(lu.seanceId),
      this.utilisateur(headers),
    ]);
    if (!seance) throw pasOuvert();
    const maintenant = Date.now();
    const verification = await this.avecChaqueCle(
      seance.organisationId,
      lu.seanceId,
      (cle) => verifierJeton(cle, lu, maintenant, { horsLigne: corps.horsLigne ?? false }),
      (resultat) => resultat.ok || resultat.refus !== 'signature',
    );
    if (!verification.ok) {
      throw new BadRequestException(
        verification.refus === 'perime'
          ? 'Ce QR code a expiré : scannez celui affiché maintenant.'
          : 'Ce QR code n’est pas valide : scannez celui affiché par l’intervenant.',
      );
    }
    // RG-00-19 : un scan rejoué compte à l'heure prouvée par son jeton, pas à l'heure de réception.
    const instant = verification.rejoue
      ? verification.fenetre * JETON_PERIODE_SECONDES * 1000
      : maintenant;
    return this.enregistrer(magasin, lu.seanceId, seance, userId, instant, {
      mode: 'qr',
      rejoue: verification.rejoue,
      // RG-00-19 : un scan rejoué a été fait ailleurs et plus tôt : ni sa position ni l'adresse
      // de l'envoi ne disent où était l'apprenant (il est déjà « à vérifier »).
      position: verification.rejoue ? undefined : corps.position,
      ip: verification.rejoue ? undefined : ip,
    });
  }

  /**
   * Vérifie avec la clé de séance dérivée de la clé maîtresse courante, puis, pendant une rotation,
   * avec les autres versions présentes : un appel ouvert avant la bascule reste valable (calcul en
   * mémoire seulement, aucune requête).
   */
  private async avecChaqueCle<T>(
    organisationId: string,
    seanceId: string,
    verifier: (cle: Uint8Array) => Promise<T>,
    concluant: (resultat: T) => boolean,
  ): Promise<T> {
    let resultat: T | undefined;
    for (const cleMaitresse of this.clesMaitresses) {
      resultat = await verifier(cleDeSeance(cleMaitresse, organisationId, seanceId));
      if (concluant(resultat)) return resultat;
    }
    if (resultat === undefined) throw new Error('Aucune clé maîtresse.');
    return resultat;
  }

  private async saisirCodeAvec(
    magasin: Magasin,
    headers: IncomingHttpHeaders,
    corps: CodeEmargement,
    ip: string,
  ): Promise<ResultatScan> {
    const [seance, userId] = await Promise.all([
      magasin.seance(corps.seanceId),
      this.utilisateur(headers),
    ]);
    if (!seance) throw pasOuvert();
    const maintenant = Date.now();
    const valide = await this.avecChaqueCle(
      seance.organisationId,
      corps.seanceId,
      (cle) => verifierCode(cle, corps.seanceId, corps.code, maintenant),
      (resultat) => resultat,
    );
    if (!valide) {
      throw new BadRequestException(
        'Ce code n’est pas le bon : saisissez celui affiché maintenant.',
      );
    }
    return this.enregistrer(magasin, corps.seanceId, seance, userId, maintenant, {
      mode: 'code',
      rejoue: false,
      position: corps.position,
      ip,
    });
  }

  /**
   * RG-06-09, RG-06-10, RGPD-03 : résultat du contrôle de localisation, calculé en mémoire avec le
   * périmètre préchargé ; la position et l'adresse IP ne sont ni conservées ni journalisées. Null :
   * pas de contrôle pour cette séance.
   */
  private localiser(
    seance: SeanceEnCache,
    position: PositionScan | undefined,
    ip: string | undefined,
  ): ResultatLocalisation | null {
    const perimetre = seance.localisation;
    if (!perimetre) return null;
    return evaluerLocalisation({
      perimetre:
        perimetre.latitude !== null && perimetre.longitude !== null
          ? {
              latitude: perimetre.latitude,
              longitude: perimetre.longitude,
              rayonMetres: perimetre.rayonMetres,
            }
          : null,
      position: position ?? null,
      reseauCampus: ip !== undefined && reseauDuCampus(perimetre.plagesIp, ip),
    });
  }

  private async enregistrer(
    magasin: Magasin,
    seanceId: string,
    seance: SeanceEnCache,
    userId: string,
    instant: number,
    scan: {
      mode: 'qr' | 'code';
      rejoue: boolean;
      position: PositionScan | undefined;
      ip: string | undefined;
    },
  ): Promise<ResultatScan> {
    const { mode, rejoue } = scan;
    const personneId = await magasin.attendu(seanceId, userId);
    if (!personneId) {
      throw new ForbiddenException(
        "Vous n'êtes pas attendu à cette séance. Signalez-vous à l'intervenant.",
      );
    }
    const evaluation = evaluerScan(seance.debut, instant);
    if (!evaluation.ok) {
      throw new ConflictException(
        evaluation.refus === 'trop-tot'
          ? "L'émargement ouvre 10 minutes avant le début de la séance."
          : "Le temps d'émargement est écoulé. Signalez-vous à l'intervenant.",
      );
    }
    const scanneLe = new Date(instant).toISOString();
    const localisation = this.localiser(seance, scan.position, scan.ip);
    const existante = await magasin.enregistrer(
      {
        organisationId: seance.organisationId,
        seanceId,
        personneId,
        scanneLe,
        mode,
        rejoue,
        localisation,
      },
      seance.fin,
    );
    if (existante) {
      // RG-06-06 : un second scan est ignoré, sans erreur.
      const retard = evaluerScan(seance.debut, Date.parse(existante.scanneLe));
      return {
        statut: 'deja-emarge',
        seance: seance.libelle,
        scanneLe: existante.scanneLe,
        retardMinutes: retard.ok ? retard.retardMinutes : 0,
        rejoue: existante.rejoue,
        localisation: existante.localisation ?? null,
      };
    }
    return {
      statut: evaluation.retardMinutes > 0 ? 'retard' : 'present',
      seance: seance.libelle,
      scanneLe,
      retardMinutes: evaluation.retardMinutes,
      rejoue,
      localisation,
    };
  }
}

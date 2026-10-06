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
  type ResultatScan,
  type ScanEmargement,
  type SeanceEnCache,
} from '@scolaly/contracts';
import { evaluerScan } from '@scolaly/domain';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import type { Auth } from '../../auth/auth.js';
import type { Env } from '../../config/env.js';
import { AUTH, DATABASE, ENV, VALKEY } from '../../shared/tokens.js';
import type { Database } from '@scolaly/db';
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

/**
 * Chemin rapide du scan (architecture, section 5 ; RG-00-16 à RG-00-18) : session, séance,
 * attendus et présences sont lus dans Valkey ; la clé de la séance est recalculée en mémoire.
 * Aucune requête SQL : la présence part dans un flux que le worker écrit par lots. Sans Valkey,
 * le mode dégradé écrit directement en base.
 */
@Injectable()
export class ScanService {
  private readonly cache: CacheEmargement;
  private readonly cleMaitresse: Buffer;
  private readonly logger = new Logger('Emargement');

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VALKEY) valkey: Redis,
    @Inject(ENV) env: Env,
  ) {
    this.cache = new CacheEmargement(valkey);
    this.cleMaitresse = Buffer.from(env.ENCRYPTION_MASTER_KEY_V1, 'base64');
  }

  scanner(headers: IncomingHttpHeaders, corps: ScanEmargement): Promise<ResultatScan> {
    return this.avecBascule((magasin) => this.scannerAvec(magasin, headers, corps));
  }

  saisirCode(headers: IncomingHttpHeaders, corps: CodeEmargement): Promise<ResultatScan> {
    return this.avecBascule((magasin) => this.saisirCodeAvec(magasin, headers, corps));
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
  ): Promise<ResultatScan> {
    const lu = lireJeton(corps.jeton);
    if (!lu) throw new BadRequestException('Ce QR code n’est pas un QR d’émargement Scolaly.');
    const [seance, userId] = await Promise.all([
      magasin.seance(lu.seanceId),
      this.utilisateur(headers),
    ]);
    if (!seance) throw pasOuvert();
    const maintenant = Date.now();
    const verification = await verifierJeton(
      cleDeSeance(this.cleMaitresse, seance.organisationId, lu.seanceId),
      lu,
      maintenant,
      { horsLigne: corps.horsLigne ?? false },
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
    return this.enregistrer(
      magasin,
      lu.seanceId,
      seance,
      userId,
      instant,
      'qr',
      verification.rejoue,
    );
  }

  private async saisirCodeAvec(
    magasin: Magasin,
    headers: IncomingHttpHeaders,
    corps: CodeEmargement,
  ): Promise<ResultatScan> {
    const [seance, userId] = await Promise.all([
      magasin.seance(corps.seanceId),
      this.utilisateur(headers),
    ]);
    if (!seance) throw pasOuvert();
    const maintenant = Date.now();
    const valide = await verifierCode(
      cleDeSeance(this.cleMaitresse, seance.organisationId, corps.seanceId),
      corps.seanceId,
      corps.code,
      maintenant,
    );
    if (!valide) {
      throw new BadRequestException(
        'Ce code n’est pas le bon : saisissez celui affiché maintenant.',
      );
    }
    return this.enregistrer(magasin, corps.seanceId, seance, userId, maintenant, 'code', false);
  }

  private async enregistrer(
    magasin: Magasin,
    seanceId: string,
    seance: SeanceEnCache,
    userId: string,
    instant: number,
    mode: 'qr' | 'code',
    rejoue: boolean,
  ): Promise<ResultatScan> {
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
    const existante = await magasin.enregistrer(
      { organisationId: seance.organisationId, seanceId, personneId, scanneLe, mode, rejoue },
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
      };
    }
    return {
      statut: evaluation.retardMinutes > 0 ? 'retard' : 'present',
      seance: seance.libelle,
      scanneLe,
      retardMinutes: evaluation.retardMinutes,
      rejoue,
    };
  }
}

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  JETON_PERIODE_SECONDES,
  type AppelEnDirect,
  type OuvertureAppel,
} from '@scolaly/contracts';
import { presence, seanceEtAttendus, type Transaction } from '@scolaly/db';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Access } from '../../access/access-resolver.js';
import type { Env } from '../../config/env.js';
import { ENV, VALKEY } from '../../shared/tokens.js';
import { CacheEmargement, CacheIndisponible, cleDeSeance } from './cache-emargement.js';

/** Ouverture de l'appel et liste en direct, pour l'intervenant (US-06-01, US-06-03). */
@Injectable()
export class AppelService {
  private readonly cache: CacheEmargement;
  private readonly cleMaitresse: Buffer;

  constructor(@Inject(VALKEY) valkey: Redis, @Inject(ENV) env: Env) {
    this.cache = new CacheEmargement(valkey);
    this.cleMaitresse = Buffer.from(env.ENCRYPTION_MASTER_KEY_V1, 'base64');
  }

  /** L'intervenant de la séance, ou une personne habilitée sur toute l'école. */
  private async charger(tx: Transaction, access: Access, seanceId: string) {
    const trouve = await seanceEtAttendus(tx, seanceId);
    if (!trouve) throw new NotFoundException('Séance introuvable dans cette école.');
    const ecole = (access.perimetres.get('emargement:animer') ?? []).some(
      (p) => p.type === 'organisation',
    );
    if (!ecole && trouve.seance.intervenantId !== access.personneId) {
      throw new ForbiddenException("Seul l'intervenant de cette séance peut en ouvrir l'appel.");
    }
    return trouve;
  }

  /** Précharge la séance dans Valkey (RG-00-17) et donne à l'écran de quoi calculer le QR. */
  async ouvrir(tx: Transaction, access: Access, seanceId: string): Promise<OuvertureAppel> {
    const { seance: ligne, attendus } = await this.charger(tx, access, seanceId);
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
        },
        new Map(attendus.flatMap((a) => (a.userId ? [[a.userId, a.personneId] as const] : []))),
      )
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

  /** Présents du cache (en direct) et de la base (déjà écrits par le worker). */
  async enDirect(tx: Transaction, access: Access, seanceId: string): Promise<AppelEnDirect> {
    const { attendus } = await this.charger(tx, access, seanceId);
    const [enCache, enBase] = await Promise.all([
      this.cache.presences(seanceId).catch((erreur: unknown) => {
        if (!(erreur instanceof CacheIndisponible)) throw erreur;
        return [];
      }),
      tx.select().from(presence).where(eq(presence.seanceId, seanceId)),
    ]);
    const scans = new Map<string, { scanneLe: string; rejoue: boolean }>();
    for (const p of enBase) {
      scans.set(p.personneId, { scanneLe: p.scanneLe.toISOString(), rejoue: p.rejoue });
    }
    for (const p of enCache) scans.set(p.personneId, { scanneLe: p.scanneLe, rejoue: p.rejoue });
    const liste = attendus.map((a) => ({
      personneId: a.personneId,
      nom: a.nom,
      prenom: a.prenom,
      scanneLe: scans.get(a.personneId)?.scanneLe ?? null,
      rejoue: scans.get(a.personneId)?.rejoue ?? false,
    }));
    return {
      presents: liste.filter((l) => l.scanneLe !== null).length,
      attendus: liste.length,
      liste,
    };
  }
}

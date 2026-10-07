import { Inject, Injectable, Logger } from '@nestjs/common';
import { lireFicheAnnuaire, type FicheAnnuaire } from '@scolaly/domain';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { ENV, VALKEY } from './tokens.js';

const CACHE_SECONDES = 30 * 24 * 3600;
const DELAI_MS = 2500;

/** Résultat d'une recherche : fiche trouvée, introuvable, ou annuaire indisponible ou désactivé. */
export type ResultatAnnuaire =
  { etat: 'trouve'; fiche: FicheAnnuaire } | { etat: 'introuvable' } | { etat: 'indisponible' };

/**
 * Annuaire public des entreprises (API Recherche d'entreprises de l'État, RG-03-01). Les réponses
 * sont mises en cache 30 jours (module 03, section 9). Aucune donnée de l'école n'est envoyée :
 * seul le SIRET saisi part vers l'annuaire.
 */
@Injectable()
export class AnnuaireEntreprises {
  private readonly logger = new Logger(AnnuaireEntreprises.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(VALKEY) private readonly valkey: Redis,
  ) {}

  get actif(): boolean {
    return !this.env.ANNUAIRE_ENTREPRISES_DISABLED;
  }

  async rechercher(siret: string): Promise<ResultatAnnuaire> {
    if (!this.actif) return { etat: 'indisponible' };
    const cle = `annuaire:siret:${siret}`;
    const enCache = await this.valkey.get(cle).catch(() => null);
    if (enCache) {
      const fiche = JSON.parse(enCache) as FicheAnnuaire | null;
      return fiche ? { etat: 'trouve', fiche } : { etat: 'introuvable' };
    }
    let reponse: unknown;
    try {
      const url = new URL('/search', this.env.ANNUAIRE_ENTREPRISES_URL);
      url.searchParams.set('q', siret);
      const resultat = await fetch(url, { signal: AbortSignal.timeout(DELAI_MS) });
      if (!resultat.ok) throw new Error(`Statut ${String(resultat.status)}`);
      reponse = await resultat.json();
    } catch (erreur) {
      this.logger.warn(`Annuaire des entreprises indisponible : ${String(erreur)}`);
      return { etat: 'indisponible' };
    }
    const fiche = lireFicheAnnuaire(reponse, siret);
    await this.valkey.set(cle, JSON.stringify(fiche), 'EX', CACHE_SECONDES).catch(() => undefined);
    return fiche ? { etat: 'trouve', fiche } : { etat: 'introuvable' };
  }
}

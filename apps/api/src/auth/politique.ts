import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { apresEchec, attenteRestante, verifierMotDePasse, type EtatVerrou } from '@scolaly/domain';
import { motsDePasseCompromis } from '@scolaly/referentials';
import type { Redis } from 'ioredis';

const MESSAGES_MOT_DE_PASSE = {
  'trop-court':
    'Le mot de passe doit contenir au moins 12 caractères. Une phrase facile à retenir fonctionne très bien.',
  'trop-long': 'Le mot de passe ne doit pas dépasser 128 caractères.',
  compromis:
    'Ce mot de passe figure dans les listes de mots de passe divulgués. Choisissez-en un autre, par exemple une phrase.',
} as const;

/** Message d'erreur si le mot de passe est refusé (RG-01-10), null s'il est accepté. */
export function refusMotDePasse(motDePasse: string): string | null {
  const verdict = verifierMotDePasse(motDePasse, motsDePasseCompromis());
  return verdict.ok ? null : MESSAGES_MOT_DE_PASSE[verdict.refus];
}

export function exigerMotDePasseValide(motDePasse: string): void {
  const refus = refusMotDePasse(motDePasse);
  if (refus) throw new BadRequestException(refus);
}

/**
 * Verrouillage progressif par compte (module 01, section 9), état dans Valkey. La clé porte
 * l'adresse saisie : la réponse est la même que le compte existe ou non.
 */
export class VerrouConnexion {
  constructor(private readonly valkey: Redis) {}

  private cle(email: string) {
    // Empreinte de l'adresse : aucune donnée personnelle en clair dans Valkey.
    const empreinte = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    return `verrou-connexion:${empreinte}`;
  }

  async attente(email: string, maintenant = Date.now()): Promise<number> {
    const brut = await this.valkey.get(this.cle(email));
    return attenteRestante(brut ? (JSON.parse(brut) as EtatVerrou) : null, maintenant);
  }

  async echec(email: string, maintenant = Date.now()): Promise<void> {
    const brut = await this.valkey.get(this.cle(email));
    const etat = apresEchec(brut ? (JSON.parse(brut) as EtatVerrou) : null, maintenant);
    await this.valkey.set(this.cle(email), JSON.stringify(etat), 'PX', 2 * 60 * 60_000);
  }

  async reussite(email: string): Promise<void> {
    await this.valkey.del(this.cle(email));
  }
}

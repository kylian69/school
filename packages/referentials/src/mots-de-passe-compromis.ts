import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

let liste: ReadonlySet<string> | undefined;

/**
 * Mots de passe compromis (RG-01-10), embarqués avec l'application : la vérification fonctionne
 * hors ligne, en SaaS comme en auto-hébergement, sans envoyer quoi que ce soit à un tiers.
 * Source et date d'extraction : data/README.md.
 */
export function motsDePasseCompromis(): ReadonlySet<string> {
  liste ??= new Set(
    gunzipSync(readFileSync(new URL('../data/mots-de-passe-compromis.txt.gz', import.meta.url)))
      .toString('utf8')
      .split('\n')
      .filter(Boolean),
  );
  return liste;
}

import {
  compterValeursChiffrees,
  rechiffrerValeurs,
  retraitPossible,
  type Database,
  type FieldEncryption,
  type FieldEncryptionKeys,
} from '@scolaly/db';

/**
 * Commande d'exploitation de la rotation de la clé maîtresse (ADR 0006), sans jamais afficher de
 * valeur ni de clé :
 * - `etat` : valeurs chiffrées par champ et par version de clé ;
 * - `rechiffrer` : rechiffre tout de suite ce qui reste (même traitement que la tâche horaire) ;
 * - `retrait-possible <version>` : code 0 si la clé de cette version peut être retirée, 1 sinon.
 */
export async function commandeRotation(
  argv: readonly string[],
  contexte: {
    db: Database;
    keys: FieldEncryptionKeys;
    chiffrement: FieldEncryption;
    ecrire: (ligne: string) => void;
  },
): Promise<number> {
  const { db, keys, ecrire } = contexte;
  const [commande, argument] = argv;
  const versions = [...keys.masterKeys.keys()].sort((a, b) => a - b);
  if (commande === 'etat') {
    ecrire(`Version courante : v${keys.currentVersion}`);
    ecrire(`Clés présentes : ${versions.map((v) => `v${v}`).join(', ')}`);
    const totaux = new Map<string, number>();
    for (const c of await compterValeursChiffrees(db)) {
      const cle = `${c.champ} ${c.version === null ? 'illisible' : `v${c.version}`}`;
      totaux.set(cle, (totaux.get(cle) ?? 0) + c.nombre);
    }
    if (totaux.size === 0) ecrire('Aucune valeur chiffrée.');
    for (const [cle, nombre] of [...totaux].sort()) ecrire(`${cle} : ${nombre}`);
    return 0;
  }
  if (commande === 'rechiffrer') {
    const bilan = await rechiffrerValeurs(db, contexte.chiffrement);
    ecrire(
      `Rechiffrées : ${bilan.rechiffrees} ; illisibles laissées en place : ${bilan.echecs} ; lots : ${bilan.lots}`,
    );
    return bilan.echecs > 0 ? 1 : 0;
  }
  if (commande === 'retrait-possible' && argument && /^[1-9]\d{0,5}$/.test(argument)) {
    const version = Number(argument);
    const verdict = retraitPossible(
      await compterValeursChiffrees(db),
      version,
      keys.currentVersion,
    );
    if (version === keys.currentVersion) {
      ecrire(`v${version} est la version courante : basculer d'abord sur une autre version.`);
    } else if (verdict.possible) {
      ecrire(`Aucune valeur n'utilise v${version} : la clé peut être retirée.`);
    } else {
      ecrire(
        `v${version} ne peut pas encore être retirée : ${verdict.restantes} valeur(s) à rechiffrer, ${verdict.illisibles} valeur(s) illisible(s) à examiner.`,
      );
    }
    return verdict.possible ? 0 : 1;
  }
  ecrire('Usage : chiffrement.js etat | rechiffrer | retrait-possible <version>');
  return 2;
}

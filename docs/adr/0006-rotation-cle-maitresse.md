# ADR 0006 — Rotation de la clé maîtresse de chiffrement

- **Statut** : accepté (à valider par l'utilisateur)
- **Date** : 09/10/2026
- **Origine** : PR #96, décision 3 (la rotation prévue par l'ADR 0002 n'était pas opérationnelle)
- **Complète** : [ADR 0002](0002-tables-plateforme-et-cles-par-organisation.md), section « Clés de chiffrement par organisation ». Ne modifie aucune décision : précise comment « ajouter, basculer, retirer » s'applique à la clé maîtresse.

## Contexte

`FieldEncryption` savait déchiffrer plusieurs versions de clé maîtresse, mais l'API ne lisait que `ENCRYPTION_MASTER_KEY_V1`, le worker aucune clé, et rien ne rechiffrait les anciennes valeurs ni ne disait quand une ancienne clé pouvait être retirée. Les clés de séance de l'émargement (QR et code à 6 chiffres) étaient dérivées de la seule v1.

## Décision

1. **Lecture validée au démarrage** (API et worker, `lireClesDeChiffrement` dans `packages/db`) : toutes les variables `ENCRYPTION_MASTER_KEY_V<n>` non vides (base64 strict, 32 octets) et `ENCRYPTION_KEY_VERSION`. Démarrage refusé si une clé est mal formée, si aucune clé n'est présente, si la version courante n'a pas de clé, ou si plusieurs clés sont présentes **sans** `ENCRYPTION_KEY_VERSION` : la bascule est toujours explicite. Les messages nomment la variable, jamais sa valeur.
2. **Écriture** avec la version courante seulement ; lecture avec toutes les versions présentes.
3. **Émargement** : la clé de séance est dérivée de la clé maîtresse courante ; le scan vérifie avec la courante, puis avec les autres versions présentes (calcul en mémoire, aucune requête SQL ajoutée sur le chemin du scan). Un appel ouvert avant la bascule reste valable.
4. **Ré-chiffrement par le worker** (tâche `rechiffrement`, chaque heure à 45) : une fonction `SECURITY DEFINER`, `valeurs_chiffrees_par_version()`, ne renvoie que des comptes par école, champ et version ; le worker traite chaque école **dans son contexte RLS**, par lots de 200 valeurs, une transaction courte par lot, `FOR UPDATE SKIP LOCKED`, et ne remplace une valeur que si elle n'a pas changé entre-temps. La tâche est idempotente et reprend après une interruption avec ce qui reste. Une valeur illisible (altérée, ou clé absente) est laissée en place et comptée. Chaque lot est inscrit au journal d'audit de l'école (`chiffrement.rechiffrement`, comptes et versions seulement).
5. **Inventaire unique** des champs chiffrés (`CHAMPS_CHIFFRES` dans `packages/db`) : les services en tirent leur contexte de chiffrement, le worker ses requêtes ; un test vérifie que toute colonne `*_chiffre` du schéma y figure. Un nouveau champ chiffré s'ajoute à l'inventaire et à la fonction de comptage.
6. **Retrait contrôlé** : `chiffrement.js retrait-possible <n>` (worker) répond 0 seulement si la version n'est pas la courante, qu'aucune valeur ne l'utilise et qu'aucune valeur n'est illisible. `infra/compose/rotation-cle.sh` enchaîne les étapes `ajouter`, `basculer`, `etat`, `retirer <n>` et refuse le retrait sinon.
7. **Clé retirée conservée hors service** : `retirer` la passe en commentaire daté dans `infra/compose/.env`, car elle seule relit les sauvegardes antérieures à la rotation. Elle est à déplacer avec ces sauvegardes et à effacer quand elles expirent.
8. `FieldEncryption` passe de l'API à `packages/db`, que l'API et le worker partagent déjà.

## Conséquences

- Une rotation se fait sans arrêt de service : `ajouter` (toutes les instances connaissent la nouvelle clé avant qu'elle serve), `basculer` (nouvelles écritures et ré-chiffrement), `retirer`.
- Le worker exige désormais les clés : `compose.yml` les transmet (v1 à v5) à l'API et au worker. Les autres déploiements (préproduction k3s) doivent faire de même.
- Après une bascule, les QR d'un appel déjà ouvert sont vérifiés jusqu'à deux fois tant que l'ancienne clé est présente : coût négligeable (HMAC en mémoire).
- La fonction de comptage lit toutes les écoles (comptes seulement, sans valeur) : revue renforcée à chaque nouveau champ chiffré.

## Alternatives écartées

- **Version courante implicite (la plus haute présente)** : ajouter une clé suffirait à basculer, avant que toutes les instances la connaissent ; une instance sans la clé ne relirait pas les nouvelles valeurs.
- **Ré-chiffrement par une migration** : une longue transaction sur toutes les écoles, hors RLS, et des clés dans le processus de migration.
- **Effacer la clé retirée** : rendrait illisibles les champs chiffrés des sauvegardes antérieures à la rotation.
- **Clé d'émargement dérivée d'une version figée** : la rotation ne couvrirait pas les QR, qui dépendent eux aussi de la clé maîtresse.

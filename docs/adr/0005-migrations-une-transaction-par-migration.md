# ADR 0005 — Migrations : une transaction par migration

- **Statut** : accepté (à valider par l'utilisateur)
- **Date** : 08/10/2026
- **Origine** : anomalie signalée dans la PR #89 (mise à jour d'une base d'avant la migration 0042)
- **Complète** : [architecture technique](../architecture/architecture-technique.md), règle « ajouter, basculer, retirer ». Ne modifie aucune décision.

## Contexte

Le migrateur de Drizzle (`migrate()` de `drizzle-orm/node-postgres/migrator`) applique **toutes** les migrations en attente dans **une seule transaction**. Or PostgreSQL interdit d'utiliser une valeur d'enum ajoutée par `ALTER TYPE … ADD VALUE` avant que la transaction qui l'a ajoutée soit validée (erreur `55P04`, « unsafe use of new value »), sauf si le type lui-même a été créé dans cette transaction.

Conséquence : une base neuve passe (le type `statut_apprenant` est créé dans la même transaction), une base déjà en 0042 aussi, mais une base entre 0001 et 0041 échoue à la migration 0046, qui lit la valeur `apprenti_sans_employeur` ajoutée par 0042. Sont concernées les installations et la préproduction mises à jour depuis une version antérieure à 0042 (`update.sh`, `pnpm dev:up` sur une base existante).

## Décision

1. `runMigrations` (`packages/db/src/migrate.ts`) applique les migrations **une par une, chacune dans sa propre transaction** : instructions de la migration puis ligne de suivi, validées ensemble. Le verrou consultatif reste pris pour toute l'exécution.
2. Le suivi est **identique** à celui de Drizzle : même table `drizzle.__drizzle_migrations` (`hash`, `created_at`), même lecture du journal (`readMigrationFiles`), même critère (une migration est appliquée si sa date `when` du journal est postérieure à la dernière enregistrée). Les bases déjà migrées ne rejouent et ne divergent de rien.
3. Aucun fichier de migration existant n'est modifié.
4. Garde-fou : `packages/db/test/migrations.test.ts` met à jour, en CI, une base arrêtée juste avant chaque migration contenant `ADD VALUE` (et en particulier avant 0042) vers la dernière version, et vérifie qu'une base à jour ne rejoue rien. Les autres suites couvrent la migration depuis zéro.

## Conséquences

- Une migration en échec annule seulement elle-même : les précédentes restent appliquées et la relance reprend à la migration fautive. C'est compatible avec la règle « ajouter, basculer, retirer », où chaque migration laisse la base cohérente.
- Une valeur d'enum ajoutée ne peut toujours pas être utilisée **dans la même migration** : son usage va dans une migration suivante (drizzle-kit génère déjà l'`ADD VALUE` dans un fichier à part).
- Le migrateur ne dépend plus que de `readMigrationFiles` de Drizzle ; à revoir si Drizzle change le format du journal ou de la table de suivi.

## Alternatives écartées

- **Réécrire 0046 sans la valeur littérale** (comparaison via `::text`) : corrige ce cas seulement, modifie un fichier déjà appliqué (son hachage change, sans effet sur Drizzle mais trompeur), et le prochain `ADD VALUE` reproduirait l'anomalie.
- **Valider la transaction seulement après un `ADD VALUE`** : même résultat dans ce cas, mais logique plus fragile (détection textuelle) pour aucun gain.
- **Changer d'outil de migration** : disproportionné.

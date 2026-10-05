# ADR 0004 — Accès de la console de la plateforme : rôle PostgreSQL dédié aux droits restreints

- **Statut** : accepté
- **Date** : 05/10/2026
- **Origine** : proposition de fin de phase P0, validée par l'utilisateur le 05/10/2026 (décision 1 de P1)
- **Complète** : [architecture technique](../architecture/architecture-technique.md), section 3 (cloisonnement), et l'[ADR 0002](0002-tables-plateforme-et-cles-par-organisation.md). Ne modifie aucune décision.

## Contexte

La console de la plateforme (module 19) crée les écoles, leurs contrats et leurs modules, et suit leur cycle de vie. Elle agit donc sur **toutes** les organisations, alors que le rôle applicatif `scolaly_app` est limité par la RLS à l'organisation de la session. RG-19-09 interdit pourtant à l'équipe Scolaly tout accès aux données d'une école sans autorisation de celle-ci.

## Décision

1. Un troisième rôle PostgreSQL, **`scolaly_platform`** (`NOSUPERUSER NOBYPASSRLS`, non propriétaire), est utilisé par le seul module « plateforme » de l'API, avec un pool de connexions distinct.
2. Ses droits sont **accordés table par table** dans les migrations, et **rien par défaut** :
   - tables de la plateforme (client, contrat, historique des états, membres, audit de la plateforme) : lecture et écriture, l'historique et l'audit en ajout seul ;
   - `groupe` et `organisation` : lecture, création et modification, avec une politique RLS qui lui ouvre toutes les lignes de ces deux tables seulement ;
   - `organisation_module` (modules actifs d'une école) : lecture et écriture sur toutes les écoles ;
   - **aucun droit sur les données métier des écoles** (établissements, personnes, audit de l'école…).
3. Le rôle applicatif `scolaly_app` n'a **aucun droit** sur les tables privées de la plateforme (contrats, membres, audit de la plateforme) ; il lit seulement les modules actifs de sa propre école.
4. Un test du contrôle de schéma vérifie ces frontières : toute nouvelle table métier reste hors de portée du rôle plateforme.
5. L'accès du support aux données d'une école (RG-19-09, RG-19-10) passera par une autorisation datée accordée par l'école, en lecture ou en écriture, avec le rôle applicatif et l'organisation de l'école : jamais par le rôle plateforme.

La proposition initiale évoquait des fonctions `SECURITY DEFINER` dédiées. Des droits accordés table par table donnent la même frontière, plus simple à relire et à tester ; les fonctions restent possibles pour une opération plus fine.

## Complément (I1.2, 05/10/2026)

À la création d'une école, la console doit lui donner ses 13 rôles par défaut (RG-01-15), qui sont des données de l'école. Plutôt que d'ouvrir les tables `role` et `role_permission` au rôle plateforme, la migration 0011 crée la fonction `organisation_initialiser_roles(organisation, roles)` (`SECURITY DEFINER`, `search_path` fixé). C'est la **seule** écriture de la console dans les données d'une école : elle crée les rôles manquants, ne modifie rien d'existant, et ne lit rien.

## Conséquences

- Une erreur de code dans la console ne peut pas lire les données d'une école : la base le refuse.
- En auto-hébergement, le module « plateforme » n'est pas monté et le rôle peut ne pas être créé ; l'organisation est créée à l'installation.
- Un mot de passe de plus à gérer (`PLATFORM_DATABASE_PASSWORD`), généré par `install.sh`.

## Alternatives écartées

- **Rôle avec `BYPASSRLS`** : la console lirait toutes les données de toutes les écoles ; contraire à RG-19-09.
- **Rôle propriétaire (`scolaly_migrator`)** : mêmes risques, et mélange des usages.
- **Console dans un service séparé** : plus d'exploitation pour un gain nul au MVP ; à reconsidérer si la console grandit.

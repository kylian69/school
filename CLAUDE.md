# CLAUDE.md — instructions pour les agents IA

Scolaly est un ERP de gestion d'établissement d'enseignement supérieur (formation initiale et alternance), en SaaS et en auto-hébergement Docker, sous forme de PWA. Ce fichier résume les règles de travail ; en cas de doute, les documents de référence font foi.

## Documents de référence (validés, à lire avant de coder)

| Document | Rôle |
| --- | --- |
| [`docs/cahier-des-charges/`](docs/cahier-des-charges/) | Modules 00 à 19 : user stories (US-NN-xx), règles de gestion (RG-NN-xx), critères d'acceptation |
| [`docs/architecture/architecture-technique.md`](docs/architecture/architecture-technique.md) | Stack, organisation du code, données, sécurité, émargement, exploitation |
| [`docs/plan-developpement/plan-developpement-mvp.md`](docs/plan-developpement/plan-developpement-mvp.md) | Périmètre du MVP, phases et incréments, definition of done, conventions, outillage |
| [`docs/maquettes/`](docs/maquettes/) | 43 écrans de référence et identité visuelle |
| [`docs/adr/`](docs/adr/) | Décisions d'architecture prises après la validation de l'architecture |

Ne réécris jamais une décision validée. Si quelque chose semble à revoir, signale-le à l'utilisateur ; une nouvelle décision se consigne dans un ADR.

## Règles non négociables

- **Aucune règle légale en dur.** Seuils, taux, nomenclatures, durées (minimum de formation, gratification, NPEC, TVA, conservation RGPD…) vivent dans `packages/referentials`, en tables datées (date de début, date de fin, source).
- **Cloisonnement entre organisations.** Toute table métier porte `organisation_id`, une politique RLS et passe le test d'isolation. Tout index commence par `organisation_id`.
- **Deux barrières.** Chaque route déclare sa permission et son périmètre ; la RLS limite toujours la base à l'organisation de la session.
- **Audit.** Toute action sensible (notes, absences, droits, documents officiels, exports) écrit dans le journal d'audit, avec la valeur avant et après.
- **Données sensibles** chiffrées par champ, jamais dans les journaux. Aucun secret dans le code.
- **Émargement** : aucune requête SQL sur le chemin du scan (architecture, section 5).
- **Calculs métier** dans `packages/domain`, sans framework ni accès réseau, avec 100 % des branches critiques testées.
- **Migrations** : « ajouter, basculer, retirer » ; jamais de retour arrière destructif.
- **Données réelles** : jamais hors production. Le jeu de démonstration est entièrement fictif (aucune enseigne ni école réelle).

## Flux de travail

- `main` est toujours déployable et protégée : pas de poussée directe, pas de réécriture d'historique, pas de force-push.
- Branches courtes : `feat/<incrément>-<sujet>` (ex. `feat/i4.3-appel-manuel`), `fix/…`, `chore/…`, `docs/…` ; les sessions d'agent utilisent `claude/<sujet>`.
- Une PR = un sujet, idéalement moins de 400 lignes hors fichiers générés. Titre en Conventional Commits, en français : `feat(emargement): appel manuel avec photos`.
- Description de PR : objectif, US et RG couvertes, captures, tests ajoutés, impact données et RGPD, migration.
- **Un agent IA ne fusionne jamais une PR et n'approuve jamais la sienne**, sauf accord explicite de l'utilisateur.
- Revue renforcée pour : politiques RLS, authentification, permissions, chiffrement, `packages/referentials`, chemin de l'émargement, migrations.

## Conventions

- **Langue** : interface, commits, PR, tickets et documentation en français. Vocabulaire technique en anglais dans le code ; termes métier du glossaire (module 00) en français sans accents : `organisation`, `etablissement`, `promotion`, `inscription`, `seance`, `emargement`.
- **TypeScript strict** partout ; lint et formatage automatiques ; règles de dépendance entre modules vérifiées par la CI.
- **Tests d'acceptation** nommés d'après la règle ou la story vérifiée : `RG-06-13 valide l'appel avec horodatage`.
- **Textes de l'interface** externalisés ; erreurs expliquées en français clair, avec la marche à suivre.
- **Dates** stockées en UTC, affichées dans le fuseau de l'établissement, format JJ/MM/AAAA ; montants en centimes entiers ; identifiants UUID v7.
- **Versions** numérotées `AAAA.MM.N`, avec note de version en français.

## Definition of done d'un incrément (résumé)

Critères d'acceptation couverts par des tests numérotés ; RLS et test d'isolation pour toute nouvelle table ; permissions déclarées ; aucune valeur légale en dur ; test E2E du parcours principal (360 px pour les rôles mobiles) sans violation d'accessibilité ; migrations compatibles ; jeu de démonstration à jour ; OpenAPI régénérée ; registre RGPD (`docs/rgpd/registre.md`) et note de version à jour. Détail : plan de développement, section 3.

## Commandes

Prérequis : Node 24 (`.nvmrc`) et pnpm via corepack (`corepack enable`).

| Commande | Effet |
| --- | --- |
| `pnpm install` | Installe les dépendances du monorepo |
| `pnpm build` | Construit tous les paquets et applications (Turborepo, avec cache) |
| `pnpm dev` | Lance les applications en mode développement |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Lint, typage strict, tests Vitest |
| `pnpm format` / `pnpm format:check` | Formatage Prettier |
| `pnpm check` | Tout ce que vérifie la CI avant une PR |
| `pnpm --filter @scolaly/api test` | Tests d'un seul paquet |
| `pnpm --filter @scolaly/web e2e` | Tests de bout en bout et d'accessibilité (Playwright, axe ; après `pnpm build`, Chromium installé par `pnpm --filter @scolaly/web exec playwright install chromium`) |
| `pnpm deps:check` | Règles de dépendance entre modules (dependency-cruiser) |
| `docker build -f infra/docker/node-app.Dockerfile --build-arg APP=api .` | Image de l'API (`APP=worker` pour le worker ; `infra/docker/web.Dockerfile` pour l'interface) |

Les tests de `packages/db` demandent un PostgreSQL 17 (base jetable créée par test) : `docker run -d --name scolaly-pg-dev -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:55432:5432 postgres:17`, ou `TEST_ADMIN_DATABASE_URL` vers un autre serveur. Ceux de `apps/api` demandent aussi Valkey : `docker run -d --name scolaly-valkey-dev -p 127.0.0.1:56379:6379 valkey/valkey:8` (ou `TEST_VALKEY_URL`) et un stockage S3 : `docker run -d --name scolaly-minio-dev -p 127.0.0.1:59000:9000 -e MINIO_ROOT_USER=scolaly -e MINIO_ROOT_PASSWORD=scolaly-dev-minio cgr.dev/chainguard/minio:latest server /data`. Ceux de `apps/worker` utilisent aussi Mailpit : `docker run -d --name scolaly-mailpit-dev -p 127.0.0.1:51025:1025 -p 127.0.0.1:58025:8025 axllent/mailpit`. Le Docker Compose de développement (I0.5) remplacera ces commandes. Après une modification de `packages/db/src/schema`, générer la migration avec `pnpm --filter @scolaly/db db:generate` ; la CI vérifie la concordance (`db:check`). Toute nouvelle table cloisonnée ajoute une ligne d'exemple dans `packages/db/test/isolation/registry.ts` (sinon le test d'isolation échoue) ; une table sans `organisation_id` exige un ADR et une entrée dans `PLATFORM_TABLES`.

Les versions partagées sont figées dans le `catalog` de `pnpm-workspace.yaml`. Les configurations communes (TypeScript, ESLint, Vitest) sont dans `packages/config`.

## État du dépôt

Monorepo en place depuis l'incrément I0.1 (organisation de l'architecture, section 2) : `apps/web`, `apps/api`, `apps/worker`, `packages/{db,domain,contracts,ui,pdf,referentials,config}`, `infra/`. Les paquets se remplissent au fil des incréments du plan de développement.

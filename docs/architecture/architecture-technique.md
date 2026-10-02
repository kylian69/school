# Architecture technique Scolaly

> Document de travail : https://claude.ai/code/artifact/65341f3e-13bc-4c72-88e1-31e3a9b7a22f
> Sections 1 à 3 validées le 02/10/2026 ; sections 4 à 7 en rédaction.

Ce document traduit le cahier des charges validé (modules 00 à 19) en architecture technique. Il est rédigé par lots et validé lot par lot, puis versionné dans `docs/architecture/`.

## 1. Vue d'ensemble

### Contraintes qui façonnent l'architecture

| Contrainte | Source | Conséquence technique |
| --- | --- | --- |
| SaaS multi-écoles et auto-hébergement | module 00 | Une seule base de code, deux modes choisis par configuration : `MULTI_TENANT` et `SINGLE_TENANT` |
| Écoles de 500 apprenants et plus, groupes d'écoles | modules 00 et 01 | Cloisonnement par organisation directement dans la base (RLS) ; un groupe est un ensemble d'organisations |
| Pic de 5 000 scans QR en 60 secondes, p99 < 200 ms | module 06 | Chemin d'émargement séparé, sans accès à la base pendant le scan |
| Pages courantes p95 < 300 ms pour 500 utilisateurs simultanés | module 00 | Rendu serveur, cache, requêtes indexées, pool de connexions |
| Application installable, utilisable sans réseau par moments | modules 00, 06, 13, 15 | PWA avec file d'attente locale (émargement, comptes rendus, examens) |
| Données sensibles (handicap, IBAN, identifiants OPCO) | modules 10, 11, 17 | Chiffrement champ par champ, journal d'accès |
| Documents officiels (bulletins, factures, diplômes) | modules 07, 11, 14 | Génération PDF déterministe, archivage avec empreinte |
| Règles légales qui changent (NPEC, TVA, SIFA, Qualiopi…) | modules 10 à 16 | Référentiels datés et versionnés, livrés avec les mises à jour |

### Stack retenue

| Couche | Choix | Raison |
| --- | --- | --- |
| Interface | Next.js (React 19), Tailwind CSS v4, shadcn/ui, PWA | Rendu serveur rapide, composants accessibles, application installable |
| API | NestJS sur Fastify, validation Zod | Un module par domaine, bonnes performances, schémas partagés avec l'interface |
| Base de données | PostgreSQL 17 derrière PgBouncer, ORM Drizzle | Robuste, cloisonnement natif par RLS, migrations typées |
| Cache et files | Valkey et BullMQ | Émargement en mémoire, traitements en tâche de fond |
| Authentification | Better Auth | Sessions, double authentification, comptes Google et Microsoft |
| Fichiers | Stockage compatible S3 (MinIO en auto-hébergement) | Pièces, documents produits, exports |
| PDF | Typst | Rendu rapide et fidèle des documents officiels |
| Déploiement | Conteneurs Docker, Docker Compose, Caddy | Même installation en SaaS et chez l'école, HTTPS automatique |
| Tests de charge | k6 | Preuve du pic d'émargement avant chaque version |

Les versions exactes seront figées au démarrage du développement, sur les dernières versions stables.

### Schéma de déploiement

*Schéma (dans le document de travail) : déploiement · même topologie en SaaS et en auto-hébergement.*

Caddy reçoit tout le trafic et le répartit entre l'interface, l'API et des instances dédiées à l'émargement. Le scan n'écrit que dans Valkey ; les présences sont ensuite persistées par lots dans PostgreSQL. Les workers traitent tout ce qui peut attendre : PDF, emails, exports, webhooks, connecteurs. En SaaS, chaque boîte peut être multipliée ; chez une école, tout tient sur un seul serveur avec Docker Compose.

## 2. Organisation du code

### Monorepo

Tout le code vit dans un seul dépôt, géré avec pnpm (espaces de travail) et Turborepo (tâches et cache de construction). TypeScript partout, en mode strict.

```
scolaly/
├─ apps/
│  ├─ web/        interface Next.js et PWA
│  ├─ api/        API NestJS (interface, API publique, émargement)
│  └─ worker/     traitements BullMQ (PDF, emails, exports, webhooks, connecteurs)
├─ packages/
│  ├─ db/         schéma Drizzle, migrations, politiques RLS, données de démonstration
│  ├─ domain/     règles métier pures (calcul des notes, échéanciers, rémunération…)
│  ├─ contracts/  schémas Zod partagés, génération OpenAPI et client typé
│  ├─ ui/         composants shadcn/ui et système de design
│  ├─ pdf/        modèles Typst et moteur de rendu
│  ├─ referentials/ tables réglementaires datées (NPEC, TVA, SIFA, Qualiopi…)
│  └─ config/     configurations partagées (TypeScript, lint, tests)
├─ infra/        Docker, Docker Compose, Caddy, scénarios k6
└─ docs/         étude business, cahier des charges, architecture
```

### Applications et paquets

| Élément | Rôle | Dépend de |
| --- | --- | --- |
| `apps/web` | Pages, formulaires, PWA hors ligne ; rendu serveur pour la vitesse d'affichage | `contracts`, `ui` |
| `apps/api` | Un module NestJS par domaine du cahier des charges ; contrôle des droits ; API publique `/v1` | `db`, `domain`, `contracts`, `referentials` |
| `apps/worker` | Consommateurs des files BullMQ ; tâches planifiées (relances, rafraîchissement des indicateurs) | `db`, `domain`, `pdf`, `contracts` |
| `packages/domain` | Calculs métier sans accès réseau ni base : testés à 100 % des branches critiques | aucun paquet métier |
| `packages/contracts` | Source unique des formats échangés : l'API valide, l'interface affiche, la documentation se génère | aucun |

L'émargement est un module de `apps/api`, déployé à part sur des instances dédiées (même image, autre point d'entrée) pour que le pic de scans ne ralentisse jamais le reste.

### Modules de l'API

Chaque module du cahier des charges devient un module NestJS au même nom, avec ses contrôleurs, ses services et ses tests : `socle`, `referentiel`, `alternance`, `emplois-du-temps`, `cahier-de-texte`, `emargement`, `notes`, `portails`, puis en V2 `crm`, `contrats`, `facturation`, `qualite`, `livret`, `jurys`, `devoirs`, `pilotage`, `api-publique`, et en V3 `handicap`. Les services transverses (droits, journal d'audit, notifications, signature, paiement, stockage) sont des modules partagés.

Chaque module métier s'active par organisation selon la formule (RG-19-04) : un module inactif ne répond pas et n'apparaît pas dans l'interface.

### Règles de dépendance

- Un module métier n'appelle un autre module que par son service public ou par un événement interne ; jamais par ses tables directement.
- Les événements internes (« absence enregistrée », « note publiée »…) servent aussi aux webhooks, aux notifications et aux indicateurs : une seule source.
- `packages/domain` ne dépend d'aucun framework : les règles de calcul se testent seules.
- Ces règles sont vérifiées automatiquement dans la CI (contrôle des imports).

### Conventions

- Lint et formatage automatiques, revue de code obligatoire avant fusion.
- Tests : unitaires (Vitest) pour `domain` et les services, intégration sur une vraie base PostgreSQL pour l'API et les politiques RLS, bout en bout (Playwright) pour les parcours clés.
- Interface en français d'abord, textes centralisés pour une traduction future.

## 3. Données

### Modèle logique

*Schéma (dans le document de travail) : modèle logique · entités centrales du MVP.*

La structure descend du groupe d'écoles jusqu'au groupe de TD. L'inscription est le pivot : elle relie une personne à une promotion et porte le statut (initial, apprenti, professionnalisation), les dates et, pour un alternant, le contrat. Les séances sont planifiées par groupe ; l'émargement enregistre la présence de chaque inscription à chaque séance. Les notes se rattachent aux modules de la maquette et aux inscriptions.

| Domaine | Entités principales | Modules |
| --- | --- | --- |
| Structure | groupe d'écoles, organisation, établissement, année scolaire, périodes, salles | 01 |
| Référentiel | formation, version de maquette, blocs, UE, modules, compétences, règles de calcul | 02 |
| Personnes et droits | personne, compte, rôle, périmètre | 01 |
| Scolarité | promotion, groupe, inscription, affectation aux groupes | 01, 02 |
| Alternance | entreprise, contact, tuteur, contrat, rythme, convention de stage | 03, 10, 13 |
| Temps | séance, travail à faire, contenu de séance | 04, 05 |
| Assiduité | émargement, absence, justificatif | 06 |
| Évaluation | évaluation, note, résultat calculé, document produit | 07 |
| Modules V2 et V3 | chaque module possède ses propres tables, dans son propre schéma PostgreSQL | 09 à 18 |

### Cloisonnement entre organisations

- Chaque table métier porte une colonne `organisation_id` obligatoire. Une politique RLS n'autorise que les lignes de l'organisation fixée pour la transaction en cours.
- L'API fixe cette organisation au début de chaque transaction, à partir de la session (`SET LOCAL`, compatible avec PgBouncer en mode transaction). Le rôle de base utilisé par l'application ne peut pas contourner RLS ; les migrations utilisent un autre rôle.
- La direction de groupe lit des vues agrégées par un rôle dédié ; le détail d'une école n'est visible que si une autorisation datée existe (RG-00-24). L'accès du support Scolaly suit le même principe (RG-19-09).
- Un test automatique vérifie, pour chaque table, qu'une organisation ne lit aucune ligne d'une autre.
- En auto-hébergement, le schéma est identique : l'instance contient une organisation, ou les écoles d'un même groupe.

### Conventions de données

- Clés primaires en UUID v7 (ordonnées dans le temps). Dates et heures stockées en UTC, affichées dans le fuseau de l'établissement.
- Montants en centimes entiers ; dates légales en type `date`.
- Corbeille (module 01) : colonne `deleted_at` et purge automatique après le délai prévu ; colonnes de suivi (créé par, modifié le) sur chaque table.

### Migrations et données de démonstration

- Migrations Drizzle versionnées dans `packages/db`, appliquées automatiquement au démarrage (en SaaS comme chez l'école), avec un verrou pour éviter deux exécutions simultanées.
- Une suppression ou un renommage se fait en deux versions (ajout, bascule, puis retrait) pour que la mise à jour se fasse sans coupure.
- Un jeu de données de démonstration réaliste alimente le site de démonstration décidé dans l'étude business et sert aux tests.

### Référentiels réglementaires datés

Le paquet `packages/referentials` contient les tables légales : grille de rémunération des alternants, NPEC, TVA et mentions de facture, nomenclatures SIFA, référentiel Qualiopi, modèle de BPF, mentions des diplômes. Chaque ligne a une date de début, une date de fin et sa source. Elles sont livrées avec chaque version de Scolaly dans un schéma commun en lecture seule, et chaque document produit (contrat, facture, diplôme) garde la version utilisée.

### Données sensibles et journal d'audit

- Chiffrement applicatif champ par champ (AES-256-GCM) pour le dossier handicap, les IBAN, le numéro de sécurité sociale, les identifiants OPCO et les jetons des services externes. Une clé par organisation, conservée hors de la base, avec rotation possible.
- Journal d'audit en ajout seul : qui, quoi, quand, valeur avant et après, pour les actions sensibles (notes, absences, factures, diplômes, droits). Le rôle de l'application ne peut ni le modifier ni le supprimer ; il est partitionné par mois.
- Empreinte SHA-256 de chaque document officiel, vérifiable par le QR code (RG-07-17).

### Volumétrie de référence

Pour une école de 2 000 apprenants sur une année : environ 40 000 séances, 600 000 lignes d'émargement et 100 000 notes. Les tables les plus volumineuses (émargement, audit, journaux) sont partitionnées par période, et tous les index commencent par `organisation_id`.

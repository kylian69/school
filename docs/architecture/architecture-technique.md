# Architecture technique Scolaly

> Document de travail : https://claude.ai/code/artifact/65341f3e-13bc-4c72-88e1-31e3a9b7a22f
> Validé le 02/10/2026 (sections 1 à 8)

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

## 4. Sécurité et identité

### Authentification

- Better Auth gère les comptes, les sessions et la connexion Google ou Microsoft (module 18). La session est stockée côté serveur et transmise par un cookie `HttpOnly`, `Secure`, `SameSite=Lax` ; aucun jeton n'est lisible par le JavaScript de la page.
- Mots de passe hachés avec Argon2id, vérifiés contre les listes de mots de passe compromis ; limitation des tentatives par compte et par adresse IP.
- Double authentification (application TOTP ou clé d'accès) obligatoire pour l'administrateur, la direction, la comptabilité, le référent handicap et le support ; proposée à tous les autres.
- Les accès externes sans compte (tuteur, employeur, membre de jury, répondant d'enquête) passent par un lien à jeton aléatoire, limité dans le temps, complété par un code à usage unique envoyé par email quand les données le justifient.

### Autorisation : deux barrières

1. **Dans l'API** : chaque route déclare la permission attendue. Un intercepteur NestJS vérifie le rôle et le périmètre (organisation, établissement, formation, promotion ou soi-même, RG-00-10 et RG-00-11) avant d'exécuter quoi que ce soit.
2. **Dans la base** : la politique RLS limite toute requête à l'organisation de la session (section 3). Même une erreur de code dans l'API ne peut pas exposer les données d'une autre école.

Les accès exceptionnels (support Scolaly, direction de groupe) reposent sur une autorisation datée, accordée par l'école, vérifiée à chaque requête et inscrite au journal d'audit.

### Protection de l'application

- HTTPS partout (HSTS), en-têtes de sécurité et politique de contenu (CSP) stricte, protection contre la falsification de requêtes.
- Validation de toutes les entrées par les schémas Zod partagés ; requêtes SQL toujours paramétrées par l'ORM.
- Fichiers déposés : type contrôlé, taille limitée, analyse antivirus (ClamAV) avant mise à disposition, téléchargement par lien signé de courte durée.
- Limitation de débit par utilisateur, par clé d'API et par adresse IP, stockée dans Valkey.
- Secrets (clés de chiffrement, mots de passe des services, clés HMAC) hors du code : coffre de secrets chiffré au repos, injecté au démarrage, avec rotation possible.

### Chaîne de développement sécurisée

- Analyse automatique des dépendances et des images de conteneurs à chaque modification ; mises à jour de sécurité proposées automatiquement.
- Analyse statique du code et recherche de secrets dans la CI.
- Images construites et signées par la CI ; seules les images signées sont déployées.
- Test d'intrusion par un prestataire avant l'ouverture commerciale, puis chaque année.

### RGPD

- Registre des traitements tenu à jour par module ; Scolaly agit comme sous-traitant des écoles en SaaS.
- Durées de conservation appliquées par des tâches planifiées (suppression ou anonymisation), paramétrables par l'école dans les limites légales.
- Droits des personnes : export de toutes les données d'une personne et effacement, depuis l'administration.
- Données hébergées en France, sur l'infrastructure de Scolaly (section 7).

## 5. Émargement QR à fort pic

### Objectif

Tenir 5 000 scans en 60 secondes avec un temps de réponse inférieur à 200 ms pour 99 % des scans (module 06), sans ralentir le reste de Scolaly. Le principe : aucune requête SQL pendant le scan.

*Schéma (dans le document de travail) : émargement · chemin rapide puis persistance différée.*

### Déroulement

1. **Préchargement** : 5 minutes avant chaque séance, un worker place dans Valkey la clé secrète de la séance, la liste des inscriptions attendues et les règles (retard, contrôle de localisation).
2. **QR projeté** : l'écran de l'intervenant affiche un jeton qui change toutes les 10 à 15 secondes : identifiant de séance, fenêtre de temps et signature HMAC (RG-00-16). Il est calculé sur place, sans appel au serveur.
3. **Scan** : l'application de l'apprenant envoie le jeton avec sa session.
4. **Vérification** : l'instance d'émargement recalcule la signature avec la clé en mémoire, accepte la fenêtre en cours et la précédente (pour absorber la latence), vérifie que l'apprenant est attendu, puis écrit sa présence avec une écriture unique (`SET NX`). Un second scan renvoie simplement « déjà émargé ». La réponse part tout de suite.
5. **Persistance** : chaque présence est aussi ajoutée à un flux Valkey. Un worker le lit toutes les 1 à 2 secondes (ou par 500 lignes) et l'écrit dans PostgreSQL en une seule requête, en ignorant les doublons. La liste d'appel de l'intervenant se met à jour en direct.

### Hors ligne

Sans réseau, la PWA garde le scan (jeton, heure de l'appareil, inscription) dans le stockage local et le renvoie dès le retour de la connexion. Le serveur l'accepte si le jeton correspond à la séance et si l'heure déclarée reste dans une fenêtre de tolérance ; le scan est marqué « rejoué » pour que l'intervenant puisse le vérifier.

### Dimensionnement

| Mesure | Valeur | Commentaire |
| --- | --- | --- |
| Exigence | 5 000 scans en 60 s | environ 85 scans par seconde en moyenne |
| Pic réaliste | quelques centaines par seconde | la plupart des scans tombent dans les 20 premières secondes |
| Opérations Valkey par scan | 3 à 4 | une instance Valkey en traite plus de 100 000 par seconde |
| Instances d'émargement | 3 au minimum | une par nœud, pour survivre à la perte d'une machine |
| Cible des tests de charge | 50 000 scans en 60 s | marge de 10 fois l'exigence |

Un scénario k6 rejoue ce pic : il tourne dans la CI sur chaque modification du module et en grandeur réelle avant chaque rentrée.

### Montée en charge anticipée

L'emploi du temps est connu à l'avance : Scolaly sait à quelle heure commencent les séances et combien d'apprenants sont attendus. Le nombre d'instances d'émargement est donc augmenté **avant** chaque début de créneau (mise à l'échelle planifiée, calculée chaque nuit à partir des séances du lendemain), puis réduit après le pic. Une mise à l'échelle automatique sur la charge réelle (processeur et requêtes par seconde) couvre en plus l'imprévu. Le détail est donné en section 7.

### Mode dégradé

Si Valkey devient indisponible, l'émargement bascule sur une écriture directe dans PostgreSQL (plus lente, mais fonctionnelle), et l'intervenant garde l'appel manuel (module 06). Une alerte part immédiatement.

## 6. Traitements asynchrones et intégrations

### Files de traitement

Tout ce qui peut attendre quelques secondes sort du chemin de la requête et passe par une file BullMQ traitée par les workers. Chaque file a sa priorité et ses limites, pour qu'un gros export ne retarde jamais une notification d'absence.

| File | Contenu | Priorité | Exemples de modules |
| --- | --- | --- | --- |
| `emargement` | persistance des présences, préchargement des séances | très haute | 06 |
| `notifications` | emails, notifications PWA, relances | haute | 03, 06, 08 |
| `documents` | génération PDF (bulletins, attestations, factures, diplômes) | normale | 07, 11, 14 |
| `integrations` | webhooks, agendas, Teams et Meet, Moodle, OPCO, signature, paiement | normale | 10, 13, 18 |
| `exports` | exports libres, exports réglementaires, dossiers d'audit | basse | 12, 16 |
| `indicateurs` | rafraîchissement des indicateurs pré-calculés | basse | 16 |

### Fiabilité

- Chaque tâche est idempotente : rejouée deux fois, elle produit le même résultat (identifiant unique, écritures « insérer sinon ignorer »).
- Échec : nouvelles tentatives avec un délai croissant, puis passage dans une file des échecs définitifs, visible dans l'administration et relançable.
- Les événements métier sont enregistrés dans la même transaction que la donnée (table « boîte d'envoi »), puis publiés vers les files : aucun webhook ni notification n'est perdu si un composant s'arrête entre les deux.
- Les files sont stockées dans Valkey avec persistance sur disque ; un redémarrage ne perd rien.

### Tâches planifiées

Relances (absences, impayés, livrets, enquêtes), purges de conservation RGPD, préchargement des séances, calcul de la mise à l'échelle du lendemain, rafraîchissement des indicateurs, sauvegardes et vérifications. Un seul planificateur actif à la fois (verrou), pour qu'une tâche ne parte jamais deux fois.

### Documents PDF

Les modèles Typst sont versionnés dans `packages/pdf`. Un document produit garde la version du modèle et des données utilisées, son empreinte et son QR code de vérification. Les bulletins d'une promotion sont produits en parallèle par plusieurs workers.

### Emails

L'envoi passe par un relais SMTP sortant dédié, avec les enregistrements SPF, DKIM et DMARC du domaine d'envoi. Envoyer directement depuis l'adresse IP de l'infrastructure fait souvent classer les messages en indésirables : un service d'envoi spécialisé et hébergé en Europe est recommandé pour les emails transactionnels. Les écoles qui utilisent leur propre adresse d'envoi (module 08) configurent leur domaine. Les retours (adresse invalide, plainte) sont traités automatiquement.

### Intégrations externes

- Chaque service externe (signature, paiement, OPCO, agendas, visio, Moodle) est caché derrière une interface propre à Scolaly : changer de prestataire ne touche pas le reste du code.
- Appels sortants avec délai maximal, disjoncteur et nouvelles tentatives ; un service en panne ne bloque jamais Scolaly (RG-18-19).
- Notifications entrantes (paiement Stripe, signature, OPCO) reçues sur une route dédiée, signature vérifiée, traitées une seule fois.

## 7. Exploitation et hébergement

### Deux cibles, les mêmes images

| Cible | Plateforme | Pour qui |
| --- | --- | --- |
| SaaS Scolaly | Kubernetes léger (k3s) sur le cluster Proxmox de Scolaly | toutes les écoles clientes du SaaS |
| Auto-hébergement | Docker Compose sur un seul serveur, avec Caddy et MinIO | une école qui héberge Scolaly elle-même |

Les deux utilisent exactement les mêmes images de conteneurs : seule la manière de les lancer change.

### Hébergement SaaS sur l'infrastructure de Scolaly

Contexte retenu : plusieurs serveurs sous Proxmox, trois au moins pour Scolaly, sur un seul site, reliés par une fibre professionnelle avec IP fixe ; moins de 5 000 apprenants la première année.

*Schéma (dans le document de travail) : hébergement SaaS · cluster Proxmox de 3 nœuds sur un site.*

- **Cluster Proxmox de 3 nœuds** : le quorum à trois permet de perdre une machine sans arrêt. Les disques des machines virtuelles sont sur Ceph, répliqué sur les trois nœuds : si un serveur tombe, Proxmox redémarre ses VM sur un autre. Les données PostgreSQL sont sur les disques NVMe locaux de chaque nœud, car PostgreSQL se réplique déjà lui-même.
- **Réseaux séparés (VLAN)** : administration (Proxmox, accès seulement par VPN WireGuard), réseau interne du cluster et du stockage (10 Gbit/s conseillés), réseau des services, et exposition publique limitée au port HTTPS.
- **Kubernetes k3s** : une VM « serveur » et une VM « agent » par nœud. Une IP virtuelle (kube-vip) suit le nœud disponible ; le routeur redirige le port 443 vers elle. Le routage HTTPS est assuré par l'ingress de k3s, avec des certificats Let's Encrypt renouvelés automatiquement.
- **PostgreSQL** : opérateur CloudNativePG avec trois instances (une primaire, deux réplicas dont une synchrone pour ne perdre aucune transaction), bascule automatique en moins d'une minute, PgBouncer intégré.
- **Valkey** : trois instances en réplication surveillées par Sentinel, avec persistance sur disque.
- **Fichiers** : la passerelle S3 de Ceph sert de stockage objet, puisque Ceph est déjà en place ; MinIO reste la solution des écoles auto-hébergées.

### Absorber le pic de l'émargement

- **Planifié** : chaque nuit, Scolaly calcule, à partir des séances du lendemain, le nombre d'instances d'émargement nécessaire pour chaque début de créneau (par exemple 7 h 50 – 8 h 20, 13 h 20 – 13 h 50). KEDA applique ce calendrier : les instances sont prêtes avant l'arrivée des apprenants.
- **Automatique** : en plus, l'autoscaling de Kubernetes ajoute des instances dès que le processeur ou le nombre de requêtes dépasse un seuil ; les workers grandissent selon la longueur de leurs files.
- **Toujours trois au minimum** : une instance d'émargement par nœud, pour que la perte d'une machine pendant un pic ne coupe rien.
- **Réserve N-1** : le cluster est dimensionné pour encaisser le pic même avec un nœud en panne.
- **Application déjà en cache** : la PWA garde ses fichiers sur le téléphone ; au moment du scan, seule une petite requête part vers le serveur, et la bande passante de la fibre reste largement suffisante.

### Dimensionnement de départ (moins de 5 000 apprenants)

| Composant | Instances | Par instance | Total |
| --- | --- | --- | --- |
| VM k3s serveur | 3 | 4 vCPU, 8 Go | 12 vCPU, 24 Go |
| VM k3s agent (applications, PostgreSQL, Valkey) | 3 | 12 vCPU, 40 Go, NVMe local 500 Go | 36 vCPU, 120 Go |
| Ceph (disques des VM et fichiers) | 3 nœuds | 2 disques par nœud | environ 2 To utiles au départ |

Par serveur physique, cela représente au minimum 16 cœurs, 64 Go de mémoire, un NVMe pour PostgreSQL et deux disques pour Ceph, avec une carte 10 Gbit/s pour le réseau interne. Avec cette base, la plateforme garde une marge confortable au-delà de 5 000 apprenants ; on ajoute des nœuds quand la supervision le demande.

### Point d'attention : le lien internet unique

> **Décision du 02/10/2026** : pas de redondance réseau pour le moment (ni lien de secours, ni point d'entrée externe). Les recommandations ci-dessous restent la feuille de route quand le nombre d'écoles augmentera. Un onduleur protège déjà les serveurs.

C'est le principal risque de cette installation : si la fibre est coupée, Scolaly devient inaccessible pour toutes les écoles. Recommandations, par ordre de priorité :

1. **Lien de secours 4G/5G** sur le routeur, avec bascule automatique.
2. **Point d'entrée externe** : une petite VM chez un hébergeur en France reçoit le trafic et le renvoie vers le site par un tunnel WireGuard. L'adresse publique reste la même quand le lien bascule, l'adresse du site n'est pas exposée, les attaques sont filtrées avant d'arriver chez toi, et une page d'état s'affiche si le site est injoignable.
3. **Surveillance externe** qui prévient immédiatement en cas de coupure.

Pendant une coupure courte, la file hors ligne de la PWA protège l'émargement (section 5). Prévoir aussi un onduleur pour les trois serveurs et l'équipement réseau, avec arrêt propre automatique.

### Sauvegardes (règle 3-2-1)

> **Décision du 02/10/2026** : la copie hors site et les objectifs de reprise chiffrés sont reportés. Les sauvegardes locales (journaux en continu, sauvegarde quotidienne, test de restauration) sont en place dès le départ. Tant que la copie hors site n'existe pas, un sinistre touchant le site entier (incendie, vol, dégât des eaux) entraînerait la perte des données : à mettre en place avant d'accueillir un nombre important d'écoles.

- PostgreSQL : archivage continu des journaux de transactions et sauvegarde complète chaque nuit vers le stockage objet local.
- Copie chiffrée **hors du site**, indispensable puisqu'il n'y a qu'un lieu : un second lieu (autre bâtiment, domicile) ou un stockage objet externe hébergé en France. Les fichiers des écoles y sont copiés chaque nuit.
- Toute la configuration du cluster est décrite dans Git : le cluster peut être reconstruit à l'identique.
- Restauration testée automatiquement chaque mois.
- Objectifs proposés : perte d'un serveur, bascule en moins d'une minute sans perte de données ; perte totale du site, au plus 5 minutes de données perdues et remise en service en moins de 4 heures sur du matériel de remplacement.

### Supervision

Prometheus et Grafana pour les métriques, Loki pour les journaux, traces OpenTelemetry, Alertmanager pour les alertes (email, SMS ou messagerie). Tableaux de bord dédiés : temps de réponse de l'émargement, longueur des files, retard de réplication PostgreSQL, santé de Ceph. Une sonde extérieure vérifie l'accès depuis Internet.

### Intégration et déploiement continus

- GitHub Actions : lint, tests, construction des images, analyse de sécurité, signature des images, publication dans un registre (GitHub ou registre hébergé sur le cluster).
- Déploiement GitOps avec Argo CD : le cluster applique ce qui est décrit dans un dépôt de configuration ; tout changement est tracé et réversible.
- Trois environnements : recette, production et site de démonstration.
- Pour les écoles auto-hébergées : les mêmes versions, publiées avec un fichier Docker Compose et une procédure de mise à jour en une commande.

### Mises à jour sans coupure

Les nouvelles versions remplacent les instances une par une. Les migrations de base suivent la règle « ajouter, basculer, retirer » (section 3). La maintenance de Proxmox et de k3s se fait nœud par nœud, après avoir déplacé les charges sur les deux autres.

## 8. Décisions

| Sujet | Décision (02/10/2026) |
| --- | --- |
| Stack | Next.js, NestJS sur Fastify, PostgreSQL 17 avec RLS, Valkey et BullMQ, Better Auth, Typst, stockage S3, Docker |
| Organisation du code | Monorepo pnpm et Turborepo ; un module d'API par module du cahier des charges |
| Émargement | Chemin rapide sans SQL, persistance par lots, montée en charge planifiée à partir de l'emploi du temps |
| Hébergement SaaS | Sur l'infrastructure de Scolaly : cluster Proxmox de 3 nœuds, k3s, CloudNativePG, Ceph |
| Auto-hébergement des écoles | Docker Compose sur un serveur, mêmes images |
| Redondance réseau | Reportée (pas de lien de secours ni de point d'entrée externe pour le moment) |
| Sauvegarde hors site | Reportée ; sauvegardes locales dès le départ |
| Objectifs de reprise (RPO, RTO) | Reportés |
| Alimentation | Onduleur déjà en place |

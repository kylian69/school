# ADR 0003 — Stockage S3 de l'auto-hébergement : Garage à la place de MinIO

- **Statut** : accepté
- **Date** : 05/10/2026
- **Origine** : incrément I0.3 (PR #17), constat signalé à l'utilisateur ; choix validé le 05/10/2026
- **Remplace partiellement** : [architecture technique](../architecture/architecture-technique.md), sections 1 (stack : « Stockage compatible S3 (MinIO en auto-hébergement) ») et 7 (« MinIO reste la solution des écoles auto-hébergées »). Le SaaS reste sur la passerelle S3 de Ceph.

## Contexte

L'architecture prévoit MinIO pour le stockage des fichiers des écoles auto-hébergées. En octobre 2026, MinIO ne publie plus d'images ni de binaires pour son édition communautaire : `minio/minio` (Docker Hub), `quay.io/minio/minio` et `bitnami/minio` sont inaccessibles. Seule une image tierce (Chainguard) existe, sans version figée gratuite. Scolaly ne peut pas livrer aux écoles une installation qui dépend d'une image non versionnée ou qu'il faudrait compiler et maintenir lui-même.

L'auto-hébergement vise aussi une machine de 4 vCPU et 8 Go qui doit tout porter (plan, « mémoire de la cible auto-hébergée ») : le stockage doit être sobre.

## Décision

1. **Garage** (Deuxfleurs, AGPL-3.0, écrit en Rust) est le stockage compatible S3 de l'installation Docker Compose, en un seul nœud (`replication_factor = 1`), image `dxflrs/garage` en version figée (v2.4.1 au départ).
2. Il est initialisé par son API d'administration avec `infra/garage/init.mjs` (topologie, clé d'accès, bucket), un script sans dépendance et idempotent.
3. Le développement local et la CI utilisent aussi Garage, pour tester ce qui sera livré.
4. Le code ne dépend que de l'API S3 standard (SDK AWS, style de chemin, URL signées v4). Le SaaS garde la passerelle S3 de Ceph (architecture, section 7).

## Conséquences

- Fonctions utilisées par Scolaly vérifiées sur Garage par les tests : dépôt, métadonnées (empreinte SHA-256), URL signées de courte durée, en-tête `Content-Disposition` imposé, refus d'une signature altérée.
- Garage n'implémente pas toutes les API de S3 (pas de verrouillage d'objets WORM, pas de politiques de bucket IAM complètes). Les archives probantes (feuilles d'émargement, documents officiels) reposent donc sur l'empreinte SHA-256 et le journal d'audit, pas sur un verrouillage S3. Si un verrouillage devient nécessaire, il faudra un nouvel ADR.
- Licence AGPL-3.0 : Garage est utilisé tel quel comme service séparé, sans modification. Scolaly n'est pas une œuvre dérivée.
- Un service de plus à initialiser au premier démarrage, couvert par le script et le Docker Compose (I0.5).

## Alternatives écartées

- **Compiler MinIO à partir des sources** : une image de plus à construire, signer et suivre en sécurité, pour un projet dont l'édition communautaire n'est plus distribuée.
- **Image Chainguard de MinIO** : pas de version figée gratuite, donc pas de mise à jour maîtrisée chez les écoles.
- **SeaweedFS** : plus complet, mais plus lourd à exploiter pour un seul serveur.
- **Système de fichiers local** : simple, mais deux chemins de code (SaaS et auto-hébergement) contre RG-00-07 (fonctionnalités identiques), et pas d'URL signées.

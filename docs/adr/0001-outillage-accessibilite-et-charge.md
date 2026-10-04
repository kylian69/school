# ADR 0001 — Outillage : tests d'accessibilité automatiques et exécuteur de CI auto-hébergé

- **Statut** : accepté
- **Date** : 03/10/2026
- **Origine** : plan de développement du MVP, section 5 (lot 2 validé le 03/10/2026) et section « Points signalés à revoir »
- **Complète** : [architecture technique](../architecture/architecture-technique.md), sections 2 (conventions) et 7 (intégration et déploiement continus). Ne modifie aucune décision de l'architecture.

## Contexte

L'architecture prévoit Vitest, des tests d'intégration sur PostgreSQL, Playwright et k6, dans une CI GitHub Actions. Deux exigences du cahier des charges ne sont pas outillées :

1. **Accessibilité** : RGAA 4 / WCAG 2.2 AA, « vérifiée par des tests automatiques et un audit manuel avant chaque version majeure » (ACC-01). Aucun outil de test automatique n'est désigné.
2. **Charge de l'émargement** : 5 000 scans en 60 s, p99 < 200 ms, mesurés sur une machine de 4 vCPU et 8 Go (module 00, section 6), et une version qui ne tient pas l'objectif n'est pas publiée (RG-00-22). Les exécuteurs hébergés par GitHub ont des ressources partagées et variables : une mesure de latence p99 y est bruitée et ne représente pas la machine de référence.

## Décision

1. **axe-core**, intégré aux tests Playwright (`@axe-core/playwright`), analyse chaque page couverte par les tests de bout en bout. Toute violation détectée bloque la PR. L'audit manuel RGAA reste exigé avant J7, puis avant chaque version majeure.
2. **Un exécuteur GitHub Actions auto-hébergé** tourne sur une VM Proxmox dédiée de 4 vCPU et 8 Go, la configuration de référence de l'auto-hébergement. Il est réservé aux jobs de `main`, aux jobs planifiés et aux versions :
   - k6 émargement 5 000 scans en 60 s, chaque nuit et à chaque version ;
   - installation à neuf, mise à jour, sauvegarde et restauration de l'installation Docker Compose, à chaque version.

   Les PR restent sur les exécuteurs hébergés par GitHub, avec un scénario k6 réduit qui vérifie zéro perte et zéro doublon, sans seuil de latence.
3. Le test à **50 000 scans en 60 s** (marge de 10 fois) tourne sur la préproduction k3s à chaque version, hors des heures de cours tant que la production a des utilisateurs.

## Conséquences

- L'exigence ACC-01 a un contrôle automatique dès l'incrément I0.4, et RG-00-22 une mesure fiable dès J2 (29/01/2027).
- **Sécurité** : l'exécuteur auto-hébergé n'exécute jamais le code d'une PR (risque d'exécution de code non relu sur l'infrastructure). Il est isolé dans le VLAN des services, sans accès au réseau d'administration ni aux secrets de production, et sa VM est recréée à partir d'une image propre à chaque version.
- **Exploitation** : une VM de plus à maintenir sur le cluster ; elle consomme 4 vCPU et 8 Go pris sur la réserve N-1 hors des tests, ou s'arrête entre deux campagnes.
- **Limite** : axe-core ne détecte qu'une partie des non-conformités RGAA ; il ne remplace pas l'audit manuel.

## Alternatives écartées

- **Mesurer la charge sur les exécuteurs hébergés de GitHub** : résultats non reproductibles, sans rapport avec la cible de 4 vCPU et 8 Go.
- **Exécuteurs GitHub plus puissants (payants)** : plus chers et toujours différents de la machine de référence.
- **Pa11y ou Lighthouse pour l'accessibilité** : redondants avec Playwright, déjà retenu ; axe-core s'y intègre directement.

# Preuve de charge de l'émargement — rapport du 06/10/2026

Incrément I2.2 (plan de développement, phase P2). Objectif du jalon J2 : **5 000 scans en 60 s, p99 < 200 ms, 0 perte et 0 doublon avec 5 % de répétitions** ; **50 000 scans en 60 s** (marge de 10 fois) ; **mode dégradé vérifié** (module 00, section 6 ; RG-00-16 à RG-00-22 ; architecture, section 5).

## Résultats

Tous les tirs portent sur le même code : la pile de PR #55 à #63.

| Tir | Instances de l'API | Scans envoyés | Échecs | p95 | p99 | Max | Présences en base | Pertes | Doublons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **5 000 apprenants en 60 s** | 1 | 5 250 | 0 | 5,3 ms | **8,8 ms** | 45 ms | 5 000 | **0** | **0** |
| **50 000 apprenants en 60 s** | 6 | 52 500 | 0 | 21 ms | **42,8 ms** | 88 ms | 50 000 | **0** | **0** |
| **5 000 en 60 s, Valkey arrêté** (mode dégradé) | 1 | 5 250 | 0 | 29 ms | **36,9 ms** | 1,02 s | 5 000 | **0** | **0** |

- **Objectif J2 atteint**, avec une marge de plus de 20 fois sur la latence (8,8 ms pour 200 ms), sur une seule instance de l'API.
- **50 000 scans en 60 s** : tenus sur 6 instances, comme le prévoit l'architecture (« 3 instances au minimum », mises à l'échelle avant les créneaux). Une seule instance plafonne à environ 560 scans par seconde, et le pic de ce tir en demande environ 2 250.
- **Mode dégradé** : avec Valkey arrêté, chaque scan est écrit directement dans PostgreSQL, sans perte ni doublon. La bascule prend au plus une seconde (le maximum de 1,02 s est celui des premiers scans de la coupure).
- **Aucune requête SQL sur le chemin du scan** en fonctionnement normal, vérifiée par un test d'intégration qui compte les requêtes reçues par PostgreSQL.

## Protocole

- **Profil** : 75 % des scans dans les 20 premières secondes, en rampe de 5 s puis palier de 15 s, et le reste sur 40 s. Par bloc de 21 scans : 20 premiers scans, puis la répétition de l'un d'eux, soit 5 % de répétitions intercalées.
- **Scan réaliste** : chaque requête porte un cookie de session réel (Better Auth) et un jeton calculé à l'instant comme sur l'écran de l'intervenant (HMAC, fenêtre de 15 s).
- **Vérification indépendante** (`charge-verifier`), une fois le flux vidé par le worker :
  - nombre d'apprenants distincts en base = nombre d'apprenants scannés selon k6 (0 perte) ;
  - lignes en base = apprenants distincts (0 doublon) ;
  - réponses « présent » ou « retard » = lignes en base, ce qui exclut une double acceptation ;
  - présences en cache = présences en base.
- **Worker en marche pendant les tirs** : écriture par lots et préchargement planifié, comme en production.

Reproduire : `pnpm dev:up`, puis construire et lancer l'API et le worker avec `LOG_LEVEL=warn`, puis :

```sh
APPRENANTS=5000 sh infra/charge/lancer.sh
APPRENANTS=50000 API_URLS=http://host.docker.internal:3001,…,http://host.docker.internal:3006 sh infra/charge/lancer.sh
```

## Environnement et limites

- **Machine** : AMD Ryzen 7 7800X3D (8 cœurs, 16 fils), 31 Go, Windows 11 ; PostgreSQL 17, PgBouncer et Valkey 8 dans Docker Desktop ; API et worker sous Node 24 ; k6 2.3.0 dans Docker, **sur la même machine** que le système testé. Le générateur prend donc du processeur à l'API, ce qui rend la mesure pessimiste.
- **Écart avec la référence** : la mesure contractuelle se fait sur une machine de 4 vCPU et 8 Go (ADR 0001), et le tir à 50 000 sur la préproduction k3s. Ce rapport a été produit sur le poste de développement, à la demande du porteur du projet. Une instance de l'API n'utilise qu'un cœur ; le tir à 5 000 sur une instance reste donc représentatif d'une machine de 4 vCPU, avec PostgreSQL et Valkey à côté. **À refaire sur la machine de référence et sur k3s dès qu'elles existent.**
- **Journaux** : réduits aux avertissements pendant les tirs. Un journal par requête coûte cher à ce débit ; c'est un réglage d'exploitation à prévoir pour les instances d'émargement.

## Défauts trouvés et corrigés pendant la campagne

La campagne a fait apparaître cinq défauts, tous corrigés avant les mesures ci-dessus :

1. **Premiers scans d'une instance neuve en mode dégradé** (#61). La connexion paresseuse à Valkey (état `wait`) était prise pour une panne.
2. **Mode dégradé trop lent sous charge** (#61) :
   - la lecture des sessions attendait les nouvelles tentatives du client Valkey ;
   - chaque scan rechargeait toute la liste des attendus.
3. **Sessions jamais remises en cache après un redémarrage de Valkey** (#62). Better Auth les relisait en base à chaque scan : le p99 passait de 76 à 420 ms.
4. **Préchargement bloquant** (#62). Le worker réécrivait chaque minute, en une seule transaction, toutes les séances de la fenêtre : p99 de 19 ms sans le worker, plus de 800 ms avec. Désormais : paquets de 1 000, bascule par `RENAME`, une fois toutes les 5 minutes.
5. **Bascule en mode dégradé jusqu'à 15 s** au moment d'une coupure (#62). Une commande Valkey échoue maintenant après 1 s.

## Suite

- Scénario réduit dans la CI (500 apprenants, 0 perte et 0 doublon, sans seuil de latence) sur chaque PR.
- Mesure nocturne à 5 000 scans sur la machine de référence et tir à 50 000 sur k3s à chaque version (ADR 0001), quand l'exécuteur auto-hébergé et la préproduction seront en place.
- Charge du reste de l'application (500 utilisateurs simultanés, recherche, bulletins) : plan de développement, section 5, au fil des phases.

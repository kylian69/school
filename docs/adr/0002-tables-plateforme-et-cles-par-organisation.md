# ADR 0002 — Tables de plateforme et clés de chiffrement par organisation

- **Statut** : accepté
- **Date** : 04/10/2026
- **Origine** : découpage de la phase P0, points 3 et 4 validés par l'utilisateur le 04/10/2026
- **Complète** : [architecture technique](../architecture/architecture-technique.md), sections 3 (cloisonnement, données sensibles) et 4 (authentification). Ne modifie aucune décision de l'architecture.

## Contexte

1. **Cloisonnement** : toute table métier porte `organisation_id` et une politique RLS (RG-00-01). Certaines données ne sont pourtant rattachées à aucune organisation : le groupe d'écoles (module 01, section 6, seule entité sans `organisation_id`) et les comptes. Un compte peut être lié à plusieurs fiches dans les écoles d'un groupe (RG-00-26), et le support Scolaly est transverse (RG-19-09). Better Auth gère ces comptes et leurs sessions.
2. **Chiffrement par champ** : l'architecture prévoit une clé par organisation, conservée hors de la base, avec rotation possible, sans préciser comment ces clés sont produites ni stockées.

## Décision

### Tables de plateforme

Les tables suivantes ne portent pas d'`organisation_id`. Elles figurent dans une liste explicite, vérifiée par le contrôle du schéma, et toute nouvelle exception passe par un ADR :

| Table | Accès du rôle applicatif `scolaly_app` |
| --- | --- |
| `groupe` | Lecture seule |
| Tables de Better Auth (utilisateur, session, compte, vérification, double authentification) | Lecture et écriture, uniquement par le module d'authentification |

La table `organisation` est cloisonnée par son propre identifiant : une session ne voit que sa propre organisation et ne peut ni en créer ni en supprimer. Ces opérations relèvent de la console de la plateforme (module 19).

Le lien entre un compte et une organisation (fiche personne, attributions de rôles) est porté par des tables cloisonnées, avec `organisation_id` et RLS. Un compte seul ne donne donc accès à aucune donnée d'école : l'organisation de la session est choisie parmi celles où le compte a une fiche active (RG-01-29).

### Clés de chiffrement par organisation

- Une **clé maîtresse** de 256 bits par version (`ENCRYPTION_MASTER_KEY_V1`, `_V2`…) est injectée par le coffre de secrets au démarrage ; elle n'est jamais stockée en base.
- La clé d'une organisation est **dérivée** par HKDF-SHA-256 à partir de la clé maîtresse, avec l'identifiant de l'organisation comme contexte. Aucune clé d'organisation n'est stockée, ni en base ni ailleurs.
- Chaque valeur chiffrée (AES-256-GCM) porte le numéro de version de la clé maîtresse. La **rotation** ajoute une nouvelle version : les nouvelles écritures l'utilisent, une tâche de fond rechiffre les anciennes valeurs, puis l'ancienne version est retirée (« ajouter, basculer, retirer »).

## Conséquences

- Les tables de plateforme sont peu nombreuses, listées et relues en revue renforcée. Le test d'isolation s'applique à toutes les autres.
- Une fuite de la base seule ne livre aucune donnée chiffrée lisible. Une fuite de la clé maîtresse compromet toutes les organisations d'une instance : elle est protégée par le coffre de secrets, et sa rotation est outillée dès le départ.
- En auto-hébergement, l'école détient sa clé maîtresse : la perdre rend les champs chiffrés illisibles. La procédure de sauvegarde le rappelle.

## Alternatives écartées

- **Clés d'organisation aléatoires, chiffrées par la clé maîtresse et stockées en base** (enveloppe) : rotation par organisation plus fine, mais une table de clés de plus à sauvegarder et à protéger, sans gain au MVP.
- **Service de gestion de clés externe** (Vault, KMS) : dépendance lourde pour l'auto-hébergement ; possible plus tard derrière la même interface.
- **Mettre `organisation_id` sur les comptes** : contraire au compte unique d'un groupe (RG-00-26) et au support transverse.

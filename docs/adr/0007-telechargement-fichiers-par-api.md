# ADR 0007 — Téléchargement des fichiers privés par l'API, sans exposer le stockage S3

- **Statut** : accepté (à valider par l'utilisateur)
- **Date** : 12/10/2026
- **Origine** : constat de la PR #108 (photos de l'appel manuel servies par l'API) ; correction `fix(fichiers)`
- **Complète** : [ADR 0003](0003-stockage-s3-garage.md) (point 4 : « URL signées v4 ») et l'[architecture technique](../architecture/architecture-technique.md), section 4 (« téléchargement par lien signé de courte durée »)

## Contexte

Les documents signés des contrats et conventions de stage, et les exports de personnes de plus de 100 lignes envoyés par email, étaient téléchargés par une URL présignée S3 générée avec `S3_ENDPOINT`. En installation Docker Compose, cette adresse est `http://garage:3900` : un nom du réseau interne, injoignable depuis le navigateur. Caddy ne relaie que `/api` (vers l'API) et le reste (vers l'interface). Le téléchargement échouait donc chez toutes les écoles auto-hébergées, sans qu'aucun test ne le détecte (le test de fumée de l'installation ne téléchargeait rien). En SaaS, le même problème se pose si la passerelle S3 n'est joignable que du réseau interne, ce qui est souhaitable.

La PR #108 a servi les photos de l'appel par l'API avec une adresse signée HMAC de 5 minutes liée au compte.

## Décision

1. **Tout fichier privé se télécharge par l'API**, à l'adresse `/api/fichiers/telechargement?jeton=…` ; le stockage S3 (Garage ou Ceph) n'est jamais exposé au navigateur et n'a besoin d'aucun point d'accès public. Les URL présignées S3 ne sont plus utilisées (dépendance `@aws-sdk/s3-request-presigner` retirée).
2. **Le jeton est chiffré et authentifié** (AES-256-GCM, clé dérivée de la clé maîtresse courante par HKDF pour l'usage `telechargements`) : il porte la clé de l'objet, le nom proposé (qui peut contenir le nom d'une personne), le type MIME, le compte, l'organisation, les permissions qui ouvrent le droit et l'expiration. L'adresse ne dévoile donc rien dans un historique, un email ou un journal de relais. Le paramètre `jeton` est déjà masqué dans les journaux de l'API.
3. **Contrôles à chaque téléchargement** : session exigée et appartenant au compte à qui l'adresse a été donnée ; objet sous `organisations/<id>/` de l'organisation du jeton ; droits recalculés dans cette organisation (une des permissions encore détenue, accès de l'école non fermé, double authentification active si le rôle l'exige). Un compte désactivé ou un rôle retiré n'ouvre plus le fichier, même avec une adresse encore valable.
4. **Durées** : 5 minutes par défaut (document de contrat ou de convention, demandé au clic) ; 24 heures au plus, pour le lien d'export envoyé par email (RG-01-21). Une durée hors de ces bornes est refusée par le code.
5. **Réponse** : flux relayé depuis S3 sans charger le fichier en mémoire, `Content-Disposition: attachment` (nom ASCII de repli et nom UTF-8), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Referrer-Policy: no-referrer`.

## Conséquences

- Fonctionne à l'identique en auto-hébergement et en SaaS (RG-00-07), quelle que soit l'adresse du stockage ; aucune configuration Caddy ni DNS supplémentaire.
- Le trafic des téléchargements passe par l'API. Les fichiers concernés sont petits (PDF de 10 Mo au plus, exports CSV) ; le flux évite la mémoire. Si de gros fichiers apparaissent (archives, vidéos), la question d'un relais dédié se reposera.
- Le lien d'export envoyé par email n'est plus utilisable par un tiers qui l'intercepterait : il faut être connecté avec le compte qui a demandé l'export. Sans session, l'API répond 401 avec la marche à suivre (« reconnectez-vous »).
- Après une bascule de clé maîtresse (ADR 0006), les adresses émises avec l'ancienne clé ne sont plus lues : au pire un lien d'export de moins de 24 h est à redemander.
- Le périmètre fin (promotion) est contrôlé à l'émission de l'adresse, pas au téléchargement : la permission est revérifiée, le périmètre ne l'est pas pendant la durée de vie de l'adresse (5 minutes pour les documents).
- Les photos (personnes, appel) restent servies par leurs routes dédiées, qui relisent déjà l'objet par l'API.

## Alternatives écartées

- **Point d'accès public de Garage via Caddy** (`/s3/*` ou sous-domaine) : expose l'API S3 entière au réseau public (surface d'attaque, énumération, déni de service), exige de réécrire l'hôte signé dans les URL présignées et un réglage différent en SaaS ; la révocation d'un lien déjà émis devient impossible.
- **Adresse signée HMAC comme les photos de l'appel** : la charge serait lisible, alors qu'elle porte ici le nom d'une personne (nom du fichier) ; le chiffrement authentifié coûte quelques lignes de plus.
- **Charger le fichier en mémoire et le renvoyer** (comme les photos) : simple, mais un export volumineux occuperait la mémoire de l'API.

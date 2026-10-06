# Registre des traitements de Scolaly

> Tenu à jour à chaque incrément (plan de développement, section 6). Il alimente le registre et l'analyse d'impact (AIPD) fournis aux écoles (RGPD-02).
> **Rôles** : l'école (organisation cliente) est **responsable de traitement** ; Scolaly agit comme **sous-traitant** en SaaS (RGPD-01). En auto-hébergement, l'école héberge et traite elle-même ; Scolaly n'accède pas aux données.
> **Bases légales** : elles relèvent du responsable de traitement. Les propositions ci-dessous sont **à confirmer par chaque établissement** et par un juriste ou un DPO (question ouverte du module 00, à trancher avant J7).

Dernière mise à jour : incrément I1.4 (personnes).

## Traitements en place

| N° | Traitement | Finalité | Personnes concernées | Données | Conservation | Destinataires |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Comptes et authentification (module 01) | Permettre l'accès sécurisé à l'espace Scolaly | Personnel, intervenants, apprenants, tuteurs disposant d'un compte | Nom, email, mot de passe **haché (Argon2id)**, état de vérification de l'email ; double authentification : secret TOTP et 10 codes de secours **chiffrés** (Better Auth) ; compteur d'échecs de connexion dans Valkey sous une **empreinte SHA-256** de l'adresse (effacé à la connexion réussie, expiration 2 h) ; jetons de fournisseurs externes chiffrés (connexion unique, V2) | Durée du compte ; durée après désactivation **à définir** (table datée des durées, après relecture juridique) | Personnes habilitées de l'école ; support Scolaly uniquement sur autorisation datée (RG-19-09, P1) |
| T1b | Invitations et activation des comptes (RG-01-08) | Inviter une personne à activer son compte, à usage unique | Personnes invitées | Email, dates d'envoi, d'expiration (J+14), de relance et d'activation, **empreinte** du lien (jamais le lien lui-même) ; date d'acceptation des conditions d'utilisation | Durée du compte ; invitations expirées : **à définir** | Personnes habilitées à inviter dans l'école |
| T2 | Sessions | Maintenir la connexion, limiter les abus, permettre la révocation (RG-01-13) | Titulaires d'un compte | Identifiant de session, adresse IP, navigateur (agent utilisateur), dates de création et d'expiration, école active | Jusqu'à expiration ou révocation ; purge des sessions expirées **à définir** | Titulaire du compte (« Mes appareils », P1) |
| T3 | Fiche personne (module 01, E-01-05) | Identifier chaque personne dans l'école (RG-01-06) et éviter les doublons (RG-01-07) | Apprenants, personnel, intervenants | Civilité, nom de naissance, nom d'usage, prénom, email, téléphone, adresse, matricule (jamais réattribué), INE ; **date et lieu de naissance, visibles par la scolarité et l'administration seulement** (module 01, section 9) | Dossier pédagogique : 5 ans après la sortie, puis anonymisation (valeur par défaut **à valider**, table `durees-conservation`) | Personnes habilitées selon leur rôle et leur périmètre (RLS et permissions) |
| T4 | Journal d'audit (RG-01-22) | Tracer les actions sensibles (qui, quoi, quand, valeurs avant et après) | Auteurs des actions ; personnes concernées par les objets modifiés | Identifiant de l'auteur, adresse IP, action, objet, valeurs avant et après (**jamais de donnée sensible en clair**) | **À définir** ; ajout seul, partitions mensuelles purgées par partition entière à l'échéance | Administrateurs de l'école ; personne ne peut le modifier |
| T5 | Envoi d'emails transactionnels | Invitations, relances et notifications | Destinataires des messages | Adresse email, objet et contenu du message | Non conservés par Scolaly après envoi (journal technique sans contenu) | Fournisseur d'envoi de l'établissement ou de Scolaly (**à choisir, situé dans l'UE**, RGPD-06) |
| T6 | Fichiers déposés (socle) | Stocker les pièces utiles (photos, justificatifs, documents) | Personnes qui déposent ou sont concernées par les pièces | Contenu du fichier, type, taille, empreinte SHA-256 | Selon le type de pièce (photo : suppression à la sortie, RG-01-27) | Personnes habilitées, par lien signé de 5 minutes |
| T10 | Imports de personnes (US-01-05) | Créer ou mettre à jour des fiches à partir d'un fichier CSV ou Excel | Personnes listées dans le fichier | Contenu du fichier déposé (champs de la fiche) ; correspondance des colonnes ; bilan de l'import | Fichier : **24 h** pour reprendre un import interrompu (purge planifiée livrée avec la validation de l'import) ; bilan : durée du journal d'audit | Personnes habilitées à importer dans l'école |
| T8 | Clients de la plateforme (module 19, SaaS) — **Scolaly responsable de traitement** | Gérer les contrats, l'ouverture et le cycle de vie des espaces clients | Contacts des écoles clientes (facturation, administrateur à inviter) | Raison sociale, SIREN, nom et email des contacts, formule, volume, dates, historique des états avec motifs | Durée du contrat, puis **à définir** (obligations comptables et commerciales) | Équipe Scolaly (super-administrateurs ; support en lecture) |
| T9 | Membres et audit de la console (module 19) — **Scolaly responsable de traitement** | Contrôler l'accès à la console et tracer chaque action | Membres de l'équipe Scolaly | Compte, rôle ; actions avec auteur, adresse IP, valeurs avant et après | Audit : **3 ans** (module 19, table `durees-conservation`) | Super-administrateurs |
| T7 | Journaux techniques | Exploitation, sécurité, diagnostic | Utilisateurs de la plateforme | Méthode et chemin des requêtes, statut, durée, adresse IP ; **sans mot de passe, cookie, jeton ni contenu d'email** (masqués et testés) | **À définir** (exploitation, section 7) | Exploitants de la plateforme |

## Mesures de sécurité communes

- Console de la plateforme : rôle de base de données dédié, **sans aucun accès aux données des écoles** (ADR 0004) ; l'accès du support aux données d'une école passera par une autorisation datée de l'école (RG-19-09).

- Cloisonnement par organisation dans la base (RLS), vérifié table par table par un test automatique ; contrôle des permissions à chaque route.
- Chiffrement en transit (HTTPS, HSTS) ; chiffrement par champ des données sensibles avec une clé par organisation (ADR 0002).
- Mots de passe hachés (Argon2id), 12 caractères au moins, refusés s'ils figurent dans la liste embarquée des mots de passe divulgués ; sessions côté serveur ; cookies `HttpOnly`, `Secure`, `SameSite=Lax` ; limitation des tentatives par adresse IP et verrouillage progressif par compte.
- Double authentification (TOTP et codes de secours) obligatoire pour les rôles qui l'exigent et pour l'équipe Scolaly ; réinitialisation par un administrateur tracée dans le journal d'audit.
- Fichiers : type réel contrôlé, taille limitée, antivirus, liens signés de courte durée.
- Données de démonstration et de test **entièrement fictives** ; aucune donnée réelle hors production.
- Lecture des fiches limitée au périmètre : toute l'école pour un périmètre « organisation », sa propre fiche sinon, en attendant le rattachement aux établissements par les inscriptions (I3.2).

## Sous-traitants ultérieurs (SaaS)

| Service | Statut |
| --- | --- |
| Hébergement | Infrastructure de Scolaly en France (architecture, section 7) |
| Envoi d'emails | À choisir, dans l'Union européenne (plan, point « fournisseur d'emails ») |
| Notifications push | P6 ; services des navigateurs (Apple, Google, Mozilla), contenu chiffré et sans donnée sensible (plan, points signalés) |

## Points ouverts

- Durées de conservation par défaut à faire relire par un juriste ou un DPO (avant J7).
- Bases légales à confirmer avec les écoles pilotes.
- Choix du fournisseur d'emails.

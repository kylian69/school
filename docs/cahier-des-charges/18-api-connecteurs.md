# Cahier des charges Scolaly — 18 · API, connecteurs et connexion unique

> Statut : **validé** le 02/10/2026.
> Document de travail (avec le schéma d'ouverture de Scolaly) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b
## 1. Objectif et périmètre

Ce module ouvre Scolaly aux autres outils de l'école sans affaiblir ses règles d'accès : une API publique documentée avec des webhooks, des connecteurs prêts à l'emploi pour les agendas, les cours à distance et Moodle, et la connexion avec un compte Google ou Microsoft. Leur disponibilité dépend de la formule de l'école (RG-19-04). **Phase : V2** (connecteur Moodle en V3).

**Inclus :**

- **API publique documentée** et **webhooks** (décision du 02/10/2026) ;
- connecteurs **agendas** (Google, Outlook), **cours à distance** (Teams, Meet) et **Moodle** pour les inscrits et les notes (décision du 02/10/2026) ;
- connexion avec un compte **Google ou Microsoft** (décision du 02/10/2026) ;
- journaux, quotas et état de santé des connexions.

**Exclus (décisions du 02/10/2026) :**

- connexion unique par SAML, par OpenID Connect avec le fournisseur d'identité propre à l'école, ou par CAS ;
- connecteurs Parcoursup et MonMaster ;
- synchronisation des agendas dans les deux sens : Scolaly reste la source de l'emploi du temps.

## 2. Acteurs et droits

Un développeur (de l'école ou d'un partenaire) n'a pas de compte : il agit avec une clé créée par l'administrateur, ou par une application autorisée par un utilisateur.

| Action | Admin de l'organisation | Responsable pédagogique | Intervenant | Apprenant et autres utilisateurs | Super-admin plateforme |
| --- | --- | --- | --- | --- | --- |
| Créer, révoquer une clé d'API | Oui | Non | Non | Non | Non |
| Gérer les webhooks | Oui | Non | Non | Non | Non |
| Consulter le journal et la consommation | Oui | Non | Non | Non | Limites globales |
| Activer la connexion Google ou Microsoft | Oui | Non | Non | Non | Non |
| Activer un connecteur pour l'organisation | Oui | Non | Non | Non | État de tous les connecteurs |
| Relier son compte Google ou Microsoft, connecter son agenda | Oui | Oui | Oui | Oui | Non |
| Relier les cours et notes Moodle | Oui | Ses formations | Ses modules | Non | Non |
| Autoriser une application tierce à agir en son nom | Oui | Oui | Oui | Oui | Non |

## 3. User stories

Le module compte 14 user stories, dont 10 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-18-01 | administrateur | créer une clé d'API limitée à certaines données, en lecture seule | ne donner que le nécessaire | Must |
| US-18-02 | développeur d'une école | disposer d'une documentation complète, avec exemples et environnement de test | brancher notre outil en quelques jours | Must |
| US-18-03 | développeur | recevoir un webhook quand une absence est enregistrée | réagir sans interroger Scolaly en boucle | Must |
| US-18-04 | administrateur | voir les appels et les envois en échec, et les relancer | garder des intégrations fiables | Must |
| US-18-05 | utilisateur | me connecter avec mon compte Google ou Microsoft de l'école | ne pas gérer un mot de passe de plus | Must |
| US-18-06 | administrateur | imposer cette connexion au personnel de notre domaine | appliquer notre politique de sécurité | Should |
| US-18-07 | intervenant | voir mes séances directement dans mon agenda Google ou Outlook | n'avoir qu'un seul agenda | Must |
| US-18-08 | responsable pédagogique | voir les créneaux occupés des intervenants dans leur agenda | planifier sans conflit | Should |
| US-18-09 | intervenant | que le lien Teams ou Meet soit créé seul pour mes cours à distance | ne plus le copier à la main | Must |
| US-18-10 | apprenant | trouver le lien du cours à distance dans mon emploi du temps et le rappel | me connecter à l'heure | Must |
| US-18-11 | responsable pédagogique | que les inscrits de mes formations soient synchronisés dans Moodle | ne rien ressaisir | Must |
| US-18-12 | intervenant | récupérer dans Scolaly les notes saisies dans Moodle, après validation | n'avoir qu'un bulletin juste | Must |
| US-18-13 | administrateur | voir l'état de santé de chaque connecteur | détecter une panne tôt | Should |
| US-18-14 | éditeur partenaire | proposer une application qui agit au nom d'un utilisateur, avec son accord | étendre Scolaly | Could |

## 4. Règles de gestion

Ouverture (schéma dans le document de travail) : les outils de l'école lisent et écrivent par l'API et sont prévenus par webhooks ; Scolaly publie vers les agendas, crée les réunions et synchronise Moodle ; la connexion passe par les comptes Google ou Microsoft. Partout, les droits et le cloisonnement de Scolaly s'appliquent.

### API publique

- **RG-18-01** : l'API est de style REST, décrite par une spécification OpenAPI publiée, avec un portail de documentation en français et en anglais (exemples, guides) et un environnement de test sur l'organisation de démonstration. Elle est versionnée dans l'adresse (/v1/…) : aucune modification incompatible sans nouvelle version, et une version remplacée reste disponible au moins 12 mois, avec un journal des changements.
- **RG-18-02** : l'accès se fait par une clé créée par l'administrateur : nom, portées (domaines de données, lecture ou écriture), date d'expiration, adresses IP autorisées en option. La clé n'est affichée qu'une fois et stockée sous forme d'empreinte ; elle est révocable, et deux clés peuvent être actives le temps d'un remplacement. Une application tierce qui agit au nom d'un utilisateur passe par OAuth 2.0, avec son accord et des portées limitées.
- **RG-18-03** : l'API applique exactement les mêmes droits, périmètres et cloisonnement entre organisations que l'interface. Le dossier handicap (module 17) et les notes internes réservées au personnel ne sont jamais exposés.
- **RG-18-04** : ressources disponibles : référentiel (formations, promotions, groupes, modules), personnes (apprenants, intervenants, tuteurs), inscriptions, séances, présences et absences, évaluations et notes publiées, entreprises et contrats, factures et encaissements (si le module 11 est actif), documents publiés. Pagination par curseur, filtres, tri et choix des champs ; les écritures sont idempotentes grâce à une clé d'idempotence.
- **RG-18-05** : chaque clé a une limite de débit (600 requêtes par minute par défaut, selon la formule), indiquée dans les en-têtes de réponse ; un dépassement reçoit une réponse d'attente explicite. Les gros volumes passent par des exports asynchrones (module 16).
- **RG-18-06** : chaque appel est journalisé (clé, ressource, résultat, durée) et consultable 90 jours par l'administrateur, avec un tableau de consommation.

### Webhooks

- **RG-18-07** : l'administrateur abonne une adresse HTTPS à des événements : inscription créée ou modifiée, absence enregistrée ou justifiée, séance modifiée ou annulée, note publiée, contrat signé ou déposé, facture émise, paiement reçu, diplôme délivré… Le message contient l'identifiant de l'événement et les données permises par les portées de l'abonnement.
- **RG-18-08** : chaque envoi est signé (HMAC avec un secret propre à l'abonnement, horodatage contre le rejeu) et porte un identifiant unique pour dédoublonner. En cas d'échec, il est retenté avec un délai croissant pendant 24 heures, puis marqué en échec ; l'administrateur peut le renvoyer. Un abonnement en échec continu est suspendu, avec une alerte.

### Connexion unique

- **RG-18-09** : l'organisation peut activer la connexion avec un compte Google ou Microsoft, pour les domaines qu'elle indique. Le compte est rattaché à l'utilisateur Scolaly par son adresse email vérifiée ; aucun compte n'est créé automatiquement : les comptes restent créés par l'école (module 01).
- **RG-18-10** : l'école peut imposer cette connexion au personnel de son domaine (son mot de passe Scolaly est alors désactivé) ; les apprenants et les extérieurs gardent la connexion habituelle. La double authentification du fournisseur s'applique.
- **RG-18-11** : SAML, OpenID Connect avec le fournisseur d'identité propre à l'école et CAS sont hors périmètre pour le moment (décision du 02/10/2026).

### Agendas

- **RG-18-12** : chaque utilisateur peut connecter son agenda Google ou Outlook. Scolaly y crée, modifie et supprime ses séances dans un agenda dédié « Scolaly », sans toucher aux autres événements, quelques minutes après chaque publication. Le flux iCal (RG-04-15) reste disponible pour les autres agendas.
- **RG-18-13** : en option, un intervenant autorise Scolaly à lire ses créneaux occupés, sans leur contenu, pour que la planification (module 04) signale les conflits.

### Cours à distance

- **RG-18-14** : l'organisation connecte son compte Microsoft 365 ou Google Workspace. Pour une séance marquée « à distance » ou « hybride », Scolaly crée la réunion Teams ou Meet au nom de l'intervenant, la déplace si la séance change et la supprime si elle est annulée. Le lien apparaît dans l'emploi du temps, dans le rappel avant la séance et dans les flux d'agenda.
- **RG-18-15** : l'émargement reste dans Scolaly (module 06), par le QR code affiché dans la réunion ou par l'appel de l'intervenant. Le rapport de participation de la réunion peut être importé comme aide, sans valoir émargement.

### Moodle

- **RG-18-16** : Scolaly crée et tient à jour dans Moodle les catégories et cours (formations et modules), les groupes et les inscriptions des apprenants et des intervenants avec leur rôle, à chaque changement et chaque nuit. Scolaly fait foi : une modification faite dans Moodle n'est pas renvoyée.
- **RG-18-17** : l'intervenant relie un élément noté de Moodle à une évaluation du module 07. Les notes importées restent en brouillon jusqu'à sa validation, puis suivent les règles de publication du module 07.
- **RG-18-18** : quand l'école l'active, les utilisateurs se connectent à Moodle avec leur compte Scolaly.

### Règles communes aux connecteurs

- **RG-18-19** : chaque connecteur s'active par organisation, avec un assistant et un test de connexion. Son état de santé (dernier succès, erreurs) et le journal des synchronisations sont visibles, avec relance manuelle. Un connecteur en panne ne bloque jamais Scolaly : les opérations attendent dans une file et sont rejouées.
- **RG-18-20** : les jetons des services externes sont chiffrés, les autorisations demandées sont minimales, et une déconnexion supprime les jetons. En auto-hébergement, les connecteurs fonctionnent si l'instance peut joindre ces services et dispose d'une adresse publique pour leurs retours.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-18-01 · Clés d'API | Admin | Création, portées, expiration, remplacement, révocation |
| E-18-02 · Webhooks | Admin | Abonnements, événements, secret, journal des envois, renvoi |
| E-18-03 · Journal et consommation | Admin | Appels, erreurs, quotas |
| E-18-04 · Portail développeur | Public | Documentation OpenAPI, guides, exemples, journal des changements, environnement de test |
| E-18-05 · Connexion unique | Admin | Fournisseurs, domaines, obligation pour le personnel |
| E-18-06 · Connecteurs | Admin | Catalogue (agendas, Teams, Meet, Moodle), assistant, état de santé, journal |
| E-18-07 · Mes connexions | Tous les utilisateurs | Compte Google ou Microsoft relié, agenda connecté, créneaux partagés, applications autorisées |
| E-18-08 · Correspondance Moodle | Responsable pédagogique, intervenant | Cours liés, éléments notés reliés aux évaluations, notes à valider |

### Parcours « brancher un outil interne de l'école »

1. L'administrateur crée une clé en lecture sur les inscriptions et les absences, valable un an.
2. Le développeur teste son code sur l'organisation de démonstration, avec la documentation.
3. Il abonne son adresse à l'événement « absence enregistrée ».
4. À chaque absence, l'outil reçoit un webhook signé, vérifie la signature et met à jour ses données.
5. Un envoi échoue pendant la nuit ; il est retenté puis réussit, et l'administrateur en voit l'historique.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Clé d'API | organisation, nom, empreinte, portées, expiration, IP autorisées, dernier usage, statut | génère des appels journalisés |
| Application tierce | éditeur, portées, adresses de retour, statut | autorisée par des utilisateurs |
| Autorisation d'application | utilisateur, application, portées, date, révocation | une par utilisateur et application |
| Abonnement webhook | organisation, adresse, événements, secret chiffré, statut | produit des envois |
| Envoi webhook | abonnement, événement, identifiant unique, tentatives, statut, réponse | journalisé |
| Journal d'appels | clé, ressource, méthode, résultat, durée, date | conservé 90 jours |
| Fournisseur de connexion | organisation, type (Google ou Microsoft), domaines, obligatoire pour le personnel | un par type |
| Connecteur | organisation, type, jetons chiffrés, paramètres, état de santé | journal de synchronisation |
| Liaison d'agenda | utilisateur, fournisseur, agenda dédié, lecture des créneaux | une par utilisateur |
| Réunion | séance, fournisseur, identifiant, lien | une par séance à distance |
| Correspondance Moodle | formation ou module et cours, groupe, élément noté et évaluation | par organisation |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Clé d'API compromise | Révocation immédiate, nouvelle clé, appels journalisés pour l'enquête |
| Destinataire d'un webhook en panne | Nouvelles tentatives pendant 24 heures, puis suspension avec alerte ; renvoi possible |
| Événements reçus dans le désordre | L'horodatage et l'identifiant permettent de les remettre en ordre ; la documentation l'explique |
| Adresse Google ou Microsoft inconnue de Scolaly | Connexion refusée avec un message clair, sans création de compte |
| Membre du personnel parti (compte Google ou Microsoft désactivé) | Il ne peut plus se connecter ; l'école désactive son compte Scolaly |
| Séance déplacée ou annulée | Événement d'agenda et réunion mis à jour ou supprimés |
| Jeton d'un service externe expiré | Connecteur en alerte, opérations en attente, rejouées après reconnexion |
| Note modifiée dans Moodle après import | Signalée comme différente ; l'intervenant choisit de réimporter |
| Nouvelle version de l'API | L'ancienne reste disponible 12 mois ; un avertissement figure dans les réponses |

## 8. Critères d'acceptation

- [ ] La spécification OpenAPI est publiée et valide ; chaque ressource est testée automatiquement contre elle.
- [ ] Une clé en lecture seule ne peut rien écrire ; une clé limitée aux absences ne lit pas les notes.
- [ ] Aucune donnée d'une autre organisation ni du module 17 n'est accessible par l'API (tests automatisés).
- [ ] Un webhook part moins de 30 secondes après l'événement, et sa signature se vérifie avec l'exemple de la documentation.
- [ ] Une séance publiée apparaît dans un agenda Google ou Outlook connecté en moins de 5 minutes.
- [ ] Le lien Teams ou Meet d'une séance à distance est créé automatiquement et supprimé à son annulation.
- [ ] Une promotion de 30 apprenants est synchronisée dans Moodle sans doublon ; les notes importées attendent la validation de l'intervenant.
- [ ] Un connecteur en panne n'empêche aucune action dans Scolaly.

## 9. Exigences propres au module

- **Sécurité** : HTTPS uniquement, clés stockées sous forme d'empreinte, secrets et jetons chiffrés, autorisations minimales, protection contre le rejeu, test d'intrusion de l'API avant son ouverture.
- **Performance** : lectures unitaires sous 300 ms au 95e centile, comme l'interface (cadre général) ; gros volumes en asynchrone.
- **Fiabilité** : files persistantes pour les webhooks et les connecteurs, reprise après panne sans perte.
- **Compatibilité** : versions documentées, maintien d'une version remplacée pendant 12 mois.
- **Disponibilité** : selon l'engagement de la formule (RG-19-04).

## 10. Décisions

| Sujet | Décision (02/10/2026) |
| --- | --- |
| API publique | Documentée (OpenAPI), avec webhooks |
| Connecteurs | Agendas (Google, Outlook), cours à distance (Teams, Meet), inscrits et notes (Moodle) |
| Connexion unique | Comptes Google et Microsoft seulement ; SAML, OpenID Connect propre à l'école et CAS hors périmètre pour le moment |
| Parcoursup et MonMaster | Non retenus |

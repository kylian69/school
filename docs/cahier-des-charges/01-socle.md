# Cahier des charges Scolaly — 01 · Socle

> Statut : **validé** le 01/10/2026.
> Document de travail : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objectif et périmètre

Le socle permet à une école de configurer son espace et d'y faire entrer toutes les personnes avec les bons droits en moins d'une journée. Il porte les fonctions transverses dont dépendent tous les autres modules. **Phase : MVP.**

**Inclus :**

- organisation et établissements (identité, adresses, UAI, SIRET, NDA, fuseau horaire) ;
- années scolaires, périodes, jours fériés et fermetures ;
- comptes utilisateurs : création, invitation, activation, connexion, double authentification, désactivation ;
- rôles, permissions et périmètres, y compris les rôles personnalisés ;
- imports et exports CSV / Excel des personnes (apprenants, intervenants, personnel) ;
- journal d'audit et corbeille ;
- personnalisation : logo, couleurs, nom d'affichage, domaine, modèles d'emails et en-têtes des PDF ;
- paramètres généraux : barème de notes par défaut, formats, politique de mots de passe ;
- photo des apprenants et groupe d'écoles (décisions du 01/10/2026).

**Exclus** (traités ailleurs) :

- formations, promotions et groupes (module 02) ;
- entreprises et tuteurs (module 03) ;
- création des organisations et abonnements (module 19) ;
- SSO et connexion Google / Microsoft (module 18, V2).

## 2. Acteurs et droits

L'administrateur d'organisation configure le socle ; les autres rôles le consultent ou gèrent des personnes dans leur périmètre. Ce sont les droits par défaut, modifiables par l'administrateur sauf mention contraire.

| Action | Admin organisation | Direction | Resp. pédagogique | Scolarité | Intervenant | Apprenant | Tuteur |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Modifier l'organisation et les établissements | Oui | Lecture | Non | Non | Non | Non | Non |
| Gérer les années, périodes et fermetures | Oui | Lecture | Lecture | Lecture | Non | Non | Non |
| Créer et inviter des apprenants | Oui | Non | Non | Oui (son établissement) | Non | Non | Non |
| Créer et inviter des intervenants et du personnel | Oui | Non | Oui (intervenants de ses formations) | Non | Non | Non | Non |
| Attribuer des rôles | Oui | Non | Non | Non | Non | Non | Non |
| Créer des rôles personnalisés | Oui | Non | Non | Non | Non | Non | Non |
| Importer et exporter des personnes | Oui | Export | Export (ses formations) | Oui (son établissement) | Non | Non | Non |
| Désactiver un compte | Oui | Non | Non | Oui (apprenants) | Non | Non | Non |
| Consulter le journal d'audit | Oui | Oui | Non | Non | Non | Non | Non |
| Personnaliser l'apparence et les modèles | Oui | Non | Non | Non | Non | Non | Non |
| Restaurer depuis la corbeille | Oui | Non | Non | Oui (ses suppressions) | Non | Non | Non |
| Modifier son profil, son mot de passe et sa 2FA | Oui | Oui | Oui | Oui | Oui | Oui | Oui |
| Exporter ses propres données (RGPD) | Oui | Oui | Oui | Oui | Oui | Oui | Oui |

Non modifiable : seul un administrateur d'organisation peut attribuer le rôle d'administrateur, et il doit toujours rester au moins un administrateur actif (RG-01-12).

**Groupe d'écoles.** L'administrateur de groupe crée les écoles du groupe et nomme les directions de groupe. La direction de groupe consulte le tableau de bord consolidé en lecture seule. Elle n'a aucun droit dans une école, sauf si l'administrateur de cette école lui en attribue (RG-00-24).

## 3. User stories

Le socle compte 20 user stories. Les 15 marquées « Must » sont indispensables au MVP.

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-01-01 | administrateur | suivre une liste de démarrage (établissement, année, rôles, imports) | rendre l'espace utilisable en moins d'une journée | Must |
| US-01-02 | administrateur | créer et modifier mes établissements (adresse, UAI, SIRET, NDA, fuseau) | que les documents officiels portent les bonnes mentions | Must |
| US-01-03 | administrateur | créer une année scolaire, ses périodes et ses fermetures | que l'EDT et les bulletins s'appuient sur le bon calendrier | Must |
| US-01-04 | administrateur | dupliquer l'année précédente | gagner du temps à chaque rentrée | Should |
| US-01-05 | scolarité | importer 500 apprenants depuis un fichier Excel en vérifiant les erreurs avant de valider | éviter la ressaisie et les doublons | Must |
| US-01-06 | scolarité | envoyer les invitations par email en masse et suivre qui a activé son compte | savoir qui relancer | Must |
| US-01-07 | apprenant | activer mon compte depuis l'email, choisir mon mot de passe et installer l'application sur mon téléphone | émarger dès mon premier cours | Must |
| US-01-08 | utilisateur | me connecter par lien magique envoyé par email si j'ai oublié mon mot de passe | ne pas rester bloqué | Must |
| US-01-09 | administrateur | attribuer un ou plusieurs rôles à une personne, avec un périmètre | qu'elle voie exactement ce dont elle a besoin | Must |
| US-01-10 | administrateur | créer un rôle personnalisé en cochant des permissions | coller à l'organisation de mon école | Should |
| US-01-11 | personnel administratif | activer la double authentification en moins d'une minute | protéger les données dont j'ai la charge | Must |
| US-01-12 | administrateur | désactiver un compte sans perdre son historique | gérer les départs | Must |
| US-01-13 | administrateur | consulter et filtrer le journal d'audit (personne, action, date) | savoir qui a modifié quoi | Must |
| US-01-14 | administrateur | téléverser mon logo et choisir ma couleur avec un aperçu immédiat | que la plateforme ressemble à mon école | Must |
| US-01-15 | administrateur | personnaliser les modèles d'emails (invitation, rappel) | parler avec le ton de l'école | Could |
| US-01-16 | scolarité | restaurer un élément supprimé par erreur dans les 30 jours | annuler une fausse manipulation | Must |
| US-01-17 | utilisateur | exporter toutes mes données personnelles | exercer mon droit d'accès RGPD | Should |
| US-01-18 | scolarité | fusionner deux fiches qui désignent la même personne | corriger un doublon | Should |
| US-01-19 | direction de groupe | voir sur un seul tableau de bord les effectifs, l'assiduité et les moyennes de toutes les écoles du groupe, et les comparer | piloter le groupe sans demander de reporting à chaque école | Must |
| US-01-20 | scolarité | importer les photos des apprenants en masse (archive ZIP nommée par matricule), ou laisser chaque apprenant déposer la sienne pour validation | que les intervenants reconnaissent leurs apprenants (trombinoscope, appel) | Must |

## 4. Règles de gestion

### Établissements et calendrier

- **RG-01-01** : une organisation a au moins un établissement. Un établissement qui porte des données (salles, inscriptions) ne peut pas être supprimé, seulement archivé.
- **RG-01-02** : le numéro UAI (7 chiffres + 1 lettre), le SIRET (14 chiffres, clé de Luhn) et le NDA (11 chiffres) sont contrôlés à la saisie. Ils sont facultatifs mais signalés comme manquants s'ils sont requis par un document officiel.
- **RG-01-03** : une année scolaire a une date de début, une date de fin et au moins une période. Les périodes ne se chevauchent pas et restent dans l'année. Deux années peuvent se chevaucher (formations qui démarrent en octobre).
- **RG-01-04** : les jours fériés français sont pré-remplis chaque année (calculés, y compris Pâques). Les fermetures (vacances, ponts) se définissent par établissement.
- **RG-01-05** : dupliquer une année copie les périodes et fermetures en décalant les dates d'un an, à vérifier avant validation. Les inscriptions ne sont jamais copiées.

### Personnes et comptes

- **RG-01-06** : une personne est identifiée de façon unique par son email dans l'organisation. Elle a aussi un matricule, généré selon un modèle paramétrable par l'école (par exemple `{ANNEE}{ETAB}{NUM:5}` ; un numéro séquentiel par défaut) ou importé. Le matricule est unique dans l'école et jamais réattribué. Les apprenants qui en ont un ont aussi leur INE (11 caractères, contrôlé).
- **RG-01-07** : avant toute création, le système cherche les doublons (email, INE, ou nom + prénom + date de naissance) et propose la fiche existante.
- **RG-01-08** : cycle de vie d'un compte : *créé* → *invité* → *actif* → *désactivé*. Un compte invité non activé est relancé automatiquement à J+3 et J+7 ; le lien d'invitation expire à J+14 et peut être renvoyé.
- **RG-01-09** : un compte désactivé ne peut plus se connecter, mais ses données et son historique restent visibles par les personnes autorisées. Il peut être réactivé.
- **RG-01-10** : mots de passe d'au moins 12 caractères, comparés à une liste de mots de passe compromis, sans règle de complexité imposée (recommandations ANSSI et NIST). Le lien magique est valable 15 minutes et ne sert qu'une fois.
- **RG-01-11** : la double authentification, quand elle est obligatoire (RG-00-13), est demandée dès la première connexion. Dix codes de secours sont fournis. Sa réinitialisation par un administrateur est tracée.
- **RG-01-12** : il reste toujours au moins un administrateur actif. Retirer ou désactiver le dernier est refusé, avec un message explicatif.
- **RG-01-13** : une session est révoquée quand le compte est désactivé, quand le mot de passe change, ou à la demande de l'utilisateur depuis « Mes appareils ».

### Rôles et permissions

- **RG-01-14** : une permission est un couple *ressource × action* (par exemple notes × modifier). Un rôle est un ensemble de permissions. Une attribution relie une personne, un rôle et un périmètre.
- **RG-01-15** : les 13 rôles par défaut ne sont pas supprimables. Ils peuvent être dupliqués pour créer un rôle personnalisé.
- **RG-01-16** : un changement de droits prend effet à la requête suivante de la personne concernée, sans qu'elle ait à se reconnecter.

### Imports et exports

- **RG-01-17** : formats acceptés : CSV (UTF-8 ou Windows-1252, détection automatique, séparateur `;` ou `,`) et Excel (.xlsx). Taille maximale de 10 Mo, soit environ 20 000 lignes.
- **RG-01-18** : un import se déroule en 4 étapes : téléversement, correspondance des colonnes (mémorisée pour la fois suivante), aperçu avec erreurs et avertissements ligne par ligne, puis validation. Rien n'est écrit avant la validation.
- **RG-01-19** : un import est tout ou rien par défaut. L'utilisateur peut choisir d'importer seulement les lignes valides ; un rapport des lignes rejetées est alors téléchargeable.
- **RG-01-20** : chaque import est enregistré (auteur, fichier, nombre de lignes créées et modifiées) et peut être annulé dans les 24 h s'il n'a pas encore été utilisé.
- **RG-01-21** : les exports respectent le périmètre de l'utilisateur et sont journalisés. Un export de plus de 100 personnes est préparé en tâche de fond et envoyé par un lien valable 24 h.

### Audit, corbeille et personnalisation

- **RG-01-22** : le journal d'audit enregistre la date, l'auteur, l'adresse IP, l'action, l'objet, et les valeurs avant et après pour les champs sensibles. Personne ne peut le modifier ni le supprimer, pas même un administrateur.
- **RG-01-23** : un élément supprimé reste 30 jours dans la corbeille, puis il est effacé définitivement. La restauration remet aussi les éléments liés supprimés en même temps.
- **RG-01-24** : logo en PNG ou SVG, 2 Mo au maximum. Une couleur principale qui ne respecte pas le contraste AA sur fond blanc est refusée, avec une teinte proche conforme proposée.
- **RG-01-25** : en SaaS, un domaine personnalisé est vérifié par un enregistrement DNS. Le certificat HTTPS est émis automatiquement.

### Photo et groupe d'écoles

- **RG-01-26** : la photo de l'apprenant est prévue dès le MVP. Elle est déposée par la scolarité (en masse, par une archive ZIP dont les fichiers portent le matricule) ou par l'apprenant lui-même, puis validée par la scolarité. Formats JPEG ou PNG, 5 Mo maximum. Elle est recadrée en portrait carré et redimensionnée à 512 px.
- **RG-01-27** : la photo n'est visible que par la scolarité, l'administration, la direction et les intervenants des groupes de l'apprenant (trombinoscope, liste d'appel). Les autres apprenants et les tuteurs ne la voient pas. Elle est supprimée à la sortie de l'apprenant, après le délai de conservation.
- **RG-01-28** : un administrateur de groupe crée les écoles du groupe (chacune est une organisation, RG-00-23) et attribue le rôle de direction de groupe. Il n'a aucun droit dans une école, sauf si l'administrateur de cette école lui en donne.
- **RG-01-29** : le sélecteur d'école n'apparaît que pour une personne qui a des droits dans plusieurs écoles du groupe. Changer d'école ne demande pas de nouvelle connexion.

## 5. Écrans et parcours

Le socle compte 13 écrans, regroupés sous un menu « Paramètres » pour l'administration, plus les écrans personnels accessibles à tous.

### Liste des écrans

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-01-01 · Liste de démarrage | Administrateur | Étapes de configuration avec leur avancement et un lien direct vers chacune |
| E-01-02 · Organisation et établissements | Administrateur | Fiche de l'organisation, liste des établissements, formulaire d'établissement |
| E-01-03 · Calendrier de l'année | Administrateur, lecture pour les autres | Vue annuelle avec périodes, jours fériés et fermetures en couleur ; ajout par glisser sur les dates |
| E-01-04 · Personnes | Administrateur, scolarité, resp. pédagogique | Tableau filtrable (rôle, établissement, statut du compte), actions en masse (inviter, relancer, désactiver, exporter) |
| E-01-05 · Fiche personne | Idem | Identité, coordonnées, rôles et périmètres, état du compte, historique |
| E-01-06 · Assistant d'import | Administrateur, scolarité | Les 4 étapes de RG-01-18, avec un modèle de fichier téléchargeable |
| E-01-07 · Rôles et permissions | Administrateur | Liste des rôles ; matrice de permissions à cocher, regroupées par module |
| E-01-08 · Journal d'audit | Administrateur, direction | Fil chronologique filtrable, détail avant / après, export |
| E-01-09 · Apparence | Administrateur | Logo, couleur, nom d'affichage, domaine, aperçu en direct (web, email, PDF) |
| E-01-10 · Corbeille | Administrateur, scolarité | Éléments supprimés, auteur, date d'effacement définitif, bouton Restaurer |
| E-01-11 · Mon compte | Tous | Profil, mot de passe, double authentification, appareils connectés, notifications, export de mes données |
| E-01-12 · Tableau de bord de groupe | Direction de groupe | Indicateurs par école et pour le groupe (RG-00-25), comparaison côte à côte, export |
| E-01-13 · Trombinoscope et photos | Scolarité, intervenants | Photos par promotion ou groupe, imprimable ; import en masse et file de validation des photos déposées |

### Parcours de première configuration (administrateur)

Objectif : un espace prêt à recevoir les cours en moins de 2 heures de manipulation.

1. Première connexion : l'administrateur choisit son mot de passe, active la double authentification et arrive sur la liste de démarrage.
2. Il complète l'organisation et le premier établissement (5 champs obligatoires, le reste plus tard).
3. Il personnalise l'apparence : logo et couleur, avec un aperçu immédiat.
4. Il crée l'année scolaire. Les jours fériés sont déjà placés ; il ajoute les vacances.
5. Il importe le personnel et les intervenants, puis attribue les rôles (en masse depuis la liste).
6. Il passe au module 02 pour créer les formations, puis importe les apprenants rattachés à leurs promotions.
7. Il envoie les invitations et suit les activations depuis le tableau des personnes.

Chaque étape peut être sautée et reprise. La liste de démarrage disparaît quand tout est fait, et reste accessible depuis les paramètres.

### Parcours d'activation (apprenant, sur mobile)

1. L'apprenant ouvre l'email d'invitation et touche « Activer mon compte ».
2. Il choisit son mot de passe (ou continue avec un lien magique) et accepte les conditions d'utilisation.
3. Il reçoit une proposition d'installer l'application sur son écran d'accueil et d'autoriser les notifications.
4. Il arrive sur son accueil : emploi du temps du jour et prochain cours.

Cible : moins de 90 secondes, sans aide.

## 6. Données

Le socle définit 13 entités. Toutes portent `organisation_id` (RG-00-01), sauf le groupe, ainsi que des dates de création et de modification et une date de suppression logique pour la corbeille.

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Groupe | nom, logo, abonnement ou licence commun (facultatif) | rassemble plusieurs organisations ; a des administrateurs et des directions de groupe |
| Organisation | nom, nom d'affichage, SIREN, logo, couleur, domaine, modèle de matricule, paramètres (barème, formats, politique de mots de passe) | appartient éventuellement à un groupe ; a plusieurs établissements, années, personnes |
| Établissement | nom, adresse, UAI, SIRET, NDA, fuseau horaire, téléphone, email, statut (actif / archivé) | appartient à une organisation ; a des salles (module 02) et des fermetures |
| Année scolaire | libellé, date de début, date de fin, statut (préparation / en cours / clôturée) | a plusieurs périodes |
| Période | libellé (S1, T2…), début, fin, ordre | appartient à une année |
| Fermeture | libellé, début, fin, type (férié / vacances / autre) | appartient à une année ; s'applique à un ou plusieurs établissements |
| Personne | civilité, nom, nom d'usage, prénom, date et lieu de naissance, email, téléphone, adresse, matricule, INE, photo (et son statut de validation) | a un compte ; peut être apprenant, intervenant, personnel ou tuteur |
| Compte | statut (créé / invité / actif / désactivé), mot de passe haché, 2FA activée, codes de secours hachés, dernière connexion | appartient à une personne ; a des sessions ; un même compte peut être lié à plusieurs fiches dans les écoles d'un groupe (RG-00-26) |
| Session | appareil, adresse IP, date de création, dernière activité, expiration | appartient à un compte |
| Rôle | nom, description, par défaut (oui / non), liste de permissions | attribué via des attributions |
| Attribution de rôle | personne, rôle, type de périmètre (groupe / organisation / établissement / formation / promotion), identifiant du périmètre, début, fin | relie une personne, un rôle et un périmètre |
| Import | auteur, type (apprenants / intervenants / personnel / photos), fichier, correspondance des colonnes, nombre de lignes créées / modifiées / rejetées, statut, date d'annulation | crée ou modifie des personnes |
| Événement d'audit | date, auteur, adresse IP, action, type et identifiant de l'objet, valeurs avant / après | en ajout seul, jamais modifié |

Les responsables légaux d'apprenants mineurs ne sont pas gérés dans le MVP (décision du 01/10/2026).

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Import : email déjà utilisé par une autre personne | Ligne signalée en erreur, avec un lien vers la fiche existante et le choix entre mettre à jour cette fiche et ignorer la ligne |
| Import : date de naissance au format américain ou cellule Excel en nombre | Conversion automatique quand elle est sans ambiguïté, sinon avertissement avec la valeur interprétée |
| Import interrompu (fermeture du navigateur) | Rien n'est écrit ; le fichier et la correspondance sont conservés 24 h pour reprendre |
| Deux personnes modifient la même fiche en même temps | La seconde sauvegarde est refusée avec un affichage des différences et le choix de fusionner |
| Email d'invitation rejeté (adresse invalide, boîte pleine) | Compte signalé « email en échec » dans la liste, avec la raison et l'action « corriger l'email » |
| Apprenant sans email | Création possible avec un code d'activation imprimable valable 14 jours |
| Perte du téléphone de double authentification | Code de secours ; à défaut, réinitialisation par un administrateur après vérification d'identité, tracée |
| Changement de nom (mariage, usage) | Nom d'usage modifiable ; le nom de naissance est conservé pour les documents officiels |
| Suppression d'une personne liée à des notes ou des présences | Refusée ; seule la désactivation est proposée. La suppression définitive passe par la procédure RGPD d'anonymisation |
| Photo de mauvaise qualité ou non conforme | Refusée par la scolarité avec un motif ; l'apprenant est notifié et peut en déposer une autre |

## 8. Critères d'acceptation

- [ ] Un administrateur configure un établissement, une année avec 2 semestres et ses vacances, et importe 500 apprenants, en moins de 2 heures et sans aide (test avec 3 utilisateurs).
- [ ] Un import de 500 lignes contenant 10 erreurs variées affiche les 10 erreurs avant validation, et n'écrit rien si l'on annule.
- [ ] Un apprenant active son compte sur mobile en moins de 90 secondes.
- [ ] Une personne sans rôle ne voit aucune donnée. Une scolarité d'un établissement A ne voit aucun apprenant de l'établissement B (test automatisé).
- [ ] Un utilisateur d'une organisation ne peut lire aucune donnée d'une autre organisation, même en appelant directement l'API (test automatisé sur chaque ressource).
- [ ] Une direction de groupe voit les indicateurs consolidés de toutes les écoles du groupe, mais aucune liste nominative sans autorisation de l'école (test automatisé).
- [ ] Retirer ses droits au dernier administrateur est refusé.
- [ ] Chaque attribution de rôle, désactivation, import et export apparaît dans le journal d'audit avec son auteur.
- [ ] Un élément supprimé se restaure à l'identique pendant 30 jours.
- [ ] Le logo et la couleur s'appliquent à l'interface, aux emails et aux PDF ; une couleur au contraste insuffisant est refusée.
- [ ] Un import ZIP de 500 photos nommées par matricule les associe aux bonnes fiches et signale les fichiers sans correspondance.
- [ ] Tous les écrans du socle passent les tests automatiques d'accessibilité (axe) sans erreur.

## 9. Exigences propres au module

- **Performance** : la liste des personnes s'affiche en moins d'une seconde pour 20 000 personnes (pagination côté serveur, recherche indexée). Un import de 5 000 lignes est analysé en moins de 10 s.
- **Sécurité** : limitation des tentatives de connexion (5 échecs par compte en 15 minutes, puis délai croissant). Les liens d'invitation et les liens magiques sont à usage unique. Les emails de connexion ne révèlent pas si un compte existe.
- **RGPD** : la date et le lieu de naissance ne sont visibles que par la scolarité et l'administration. La photo suit RG-01-27. L'export personnel comprend toutes les données liées à la personne, au format JSON et PDF lisible.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Groupe d'écoles | Dès le MVP, avec un tableau de bord commun (RG-01-28, RG-01-29) |
| Format du matricule | Paramétrable par école, avec un numéro séquentiel par défaut (RG-01-06) |
| Photo des apprenants | Dès le MVP (RG-01-26, RG-01-27) |
| Connexion Google ou Microsoft | En V2, avec le SSO (module 18) |
| Responsables légaux | Hors MVP |

Plus aucune question ouverte sur ce module.

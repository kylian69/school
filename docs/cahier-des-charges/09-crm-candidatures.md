# Cahier des charges Scolaly — 09 · CRM, candidatures et inscriptions

> Statut : **validé** le 01/10/2026.
> Document de travail (avec le schéma du parcours de recrutement) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objectif et périmètre

Ce module couvre tout le recrutement, du premier contact au premier jour de cours : attirer des prospects, recevoir et traiter les candidatures, organiser les tests et entretiens, trouver une entreprise aux futurs alternants, puis transformer l'admis en apprenant inscrit, sans ressaisie. **Phase : V2** (rentrée 2028).

**Inclus :**

- CRM : prospects, sources, événements (salons, portes ouvertes), relances, entonnoir de recrutement ;
- campagnes de recrutement par formation et par année ;
- **formulaire de candidature public** aux couleurs de l'école, intégrable au site (décision du 01/10/2026) et espace candidat ;
- **frais de dossier payés en ligne** ;
- **import des candidatures Parcoursup et Mon Master** par fichier ;
- traitement : étapes, grilles d'évaluation, jury d'admission, décisions ;
- **tests et entretiens** avec réservation de créneaux par le candidat ;
- **offres d'alternance** déposées par les entreprises et rapprochement avec les candidats ;
- **pré-inscription** : dossier administratif, contrat de scolarité signé en ligne, acompte, création automatique de l'inscription.

**Exclus :**

- CERFA et dépôt OPCO (module 10) ;
- facturation des frais de scolarité et échéancier après l'acompte (module 11) ;
- échanges automatiques avec les plateformes Parcoursup et Mon Master (pas d'API ouverte : import et export de fichiers seulement) ;
- campagnes marketing avancées (séquences automatisées, publicité).

## 2. Acteurs et droits

Deux nouveaux types de comptes externes apparaissent dans ce module : le **candidat** et le **recruteur d'entreprise** (contact d'une entreprise partenaire qui dépose des offres). Leurs comptes sont séparés des comptes de l'école et limités à leurs propres données.

| Action | Admin | Direction | Resp. pédagogique | Chargé de relations entreprises | Scolarité | Candidat | Recruteur d'entreprise |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Paramétrer une campagne et son formulaire | Oui | Non | Oui (ses formations) | Non | Oui | Non | Non |
| Gérer les prospects et événements | Oui | Lecture | Lecture | Oui | Oui | Non | Non |
| Traiter les candidatures | Oui | Lecture | Oui (ses formations) | Lecture | Oui | Non | Non |
| Évaluer (tests, entretiens) | Non | Non | Oui | Oui (volet entreprise) | Non | Non | Non |
| Décider de l'admission | Non | Oui | Oui (selon paramétrage) | Non | Non | Non | Non |
| Déposer et suivre sa candidature | Non | Non | Non | Non | Non | Oui (la sienne) | Non |
| Déposer une offre d'alternance | Non | Non | Non | Oui (pour une entreprise) | Non | Non | Oui (son entreprise) |
| Valider et diffuser une offre | Oui | Non | Non | Oui | Non | Non | Non |
| Proposer des candidats à une offre | Non | Non | Non | Oui | Non | Postuler lui-même | Voir les profils proposés |
| Finaliser une pré-inscription | Oui | Non | Non | Non | Oui | Compléter et signer | Non |

## 3. User stories

Le module compte 20 user stories, dont 15 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-09-01 | scolarité | ouvrir une campagne de recrutement pour une formation (places, dates, pièces, frais, étapes) en dupliquant celle de l'an dernier | lancer le recrutement en quelques minutes | Must |
| US-09-02 | candidat | postuler depuis le site de l'école sur mon téléphone, en plusieurs étapes, avec sauvegarde automatique | finir ma candidature quand je veux | Must |
| US-09-03 | candidat | payer les frais de dossier en ligne par carte | finaliser ma candidature immédiatement | Must |
| US-09-04 | candidat | suivre l'avancement de mon dossier et savoir quelles pièces manquent | ne pas être dans l'incertitude | Must |
| US-09-05 | scolarité | importer les candidatures reçues sur Parcoursup ou Mon Master depuis leur fichier d'export | traiter tous les candidats au même endroit | Must |
| US-09-06 | responsable pédagogique | voir les candidatures en colonnes par étape et les faire avancer par glisser-déposer ou en masse | traiter des centaines de dossiers rapidement | Must |
| US-09-07 | responsable pédagogique | publier des créneaux de tests et d'entretiens que les candidats réservent eux-mêmes | ne pas organiser les rendez-vous par email | Must |
| US-09-08 | évaluateur | noter un entretien sur une grille, depuis mon téléphone ou mon ordinateur | évaluer de façon homogène | Must |
| US-09-09 | direction | prononcer les décisions d'admission (admis, liste d'attente, refus) avec les avis des évaluateurs sous les yeux | décider vite et de façon traçable | Must |
| US-09-10 | candidat | recevoir la décision et, si je suis admis, confirmer ma place en ligne | m'engager sans déplacement | Must |
| US-09-11 | candidat admis | compléter mon dossier d'inscription, signer mon contrat de scolarité et payer l'acompte en ligne | finaliser mon inscription en 15 minutes | Must |
| US-09-12 | scolarité | qu'un admis qui a signé et payé devienne automatiquement apprenant inscrit, avec son compte | ne rien ressaisir | Must |
| US-09-13 | recruteur d'entreprise | déposer une offre d'alternance en 5 minutes | trouver un alternant dans l'école | Must |
| US-09-14 | chargé de relations entreprises | voir les candidats compatibles avec une offre et leur proposer l'offre ou envoyer leur profil à l'entreprise | placer les admis en alternance | Must |
| US-09-15 | chargé de relations entreprises | suivre les admis sans entreprise et leurs démarches, avec des relances automatiques | qu'aucun ne démarre sans solution | Must |
| US-09-16 | chargé de relations entreprises | enregistrer les prospects d'un salon depuis une tablette | ne pas perdre les contacts | Should |
| US-09-17 | direction | voir l'entonnoir de recrutement par formation et par source, avec les taux de conversion | piloter le recrutement et les dépenses de communication | Should |
| US-09-18 | scolarité | gérer les inscriptions aux portes ouvertes et y faire l'appel | suivre la participation | Should |
| US-09-19 | candidat | postuler moi-même aux offres d'alternance de l'école | trouver mon entreprise | Should |
| US-09-20 | scolarité | exporter les décisions pour les reporter sur Parcoursup ou Mon Master | gagner du temps sur la saisie | Could |

## 4. Règles de gestion

Parcours (schéma dans le document de travail) : prospect → candidature → évaluation → décision. Un admis en formation initiale passe par la pré-inscription (contrat signé, acompte) et devient inscrit. Un admis en alternance passe en plus par la recherche d'entreprise (offres, entretiens) : la signature du contrat (modules 03 et 10) le fait passer au statut apprenti. Les listes d'attente, refus et désistements sortent à l'étape de décision.

### Campagnes de recrutement

- **RG-09-01** : une campagne porte une formation (ou plusieurs, au choix du candidat), une année de rentrée, les modes proposés (initial, alternance), le nombre de places, les dates d'ouverture et de clôture, les pièces demandées, les frais de dossier et la liste des étapes. Elle se duplique d'une année sur l'autre.
- **RG-09-02** : les étapes sont paramétrables par campagne. Par défaut : *reçue* → *complète* → *test* → *entretien* → *décision*, puis *admis*, *liste d'attente*, *refusé* ou *désisté*. Chaque étape peut déclencher un email modèle au candidat (désactivable).
- **RG-09-03** : une campagne peut recevoir plusieurs vagues (sessions d'admission avec leurs dates). Le nombre d'admis et de places restantes est affiché en direct ; au-delà des places, une admission demande une confirmation.

### Formulaire de candidature et espace candidat

- **RG-09-04** : le formulaire public est aux couleurs de l'école, accessible par un lien (candidature.ecole.scolaly.fr) et intégrable au site de l'école par un widget. Il est fait d'étapes : identité, formation et mode souhaités, parcours scolaire, pièces, questions spécifiques de l'école, frais, récapitulatif. Les questions spécifiques se construisent sans code (texte, choix, fichier, date).
- **RG-09-05** : le candidat confirme son email par un code avant de commencer. Son dossier est sauvegardé à chaque champ et reste reprenable depuis son espace candidat, sur tout appareil.
- **RG-09-06** : une candidature est « complète » quand toutes les pièces obligatoires sont déposées et les frais payés (ou exonérés). La scolarité peut refuser une pièce avec un motif ; le candidat est notifié et en dépose une autre.
- **RG-09-07** : un même candidat peut postuler à plusieurs formations de l'école avec un seul dossier, en classant ses vœux si la campagne le demande. Les doublons sont détectés (email, INE, nom + date de naissance).
- **RG-09-08** : le formulaire est protégé contre les envois automatiques (limitation des envois par adresse IP, défi anti-robot accessible) et conforme au RGAA.

### Frais de dossier

- **RG-09-09** : les frais de dossier sont payés par carte via le compte de paiement de l'école, connecté dans ses paramètres. Scolaly n'encaisse jamais d'argent pour le compte des écoles. Stripe est intégré en premier (mode « compte standard » : l'école garde son compte et ses fonds), derrière un connecteur de paiement extensible qui permettra d'ajouter une solution française pour les écoles qui l'exigent. L'école peut exonérer certains profils (boursiers, candidats Parcoursup) ou un candidat au cas par cas. Le remboursement se fait depuis le compte de paiement de l'école ; Scolaly enregistre seulement le statut.

### Import Parcoursup et Mon Master

- **RG-09-10** : la scolarité importe le fichier exporté de la plateforme nationale. Scolaly reconnaît le format, crée les candidatures dans la campagne avec leur origine, détecte les doublons avec les candidatures directes et les fusionne après confirmation. Un réimport met à jour sans créer de doublon. Les décisions restent à saisir sur la plateforme nationale ; Scolaly fournit une liste exportée pour faciliter cette saisie.

### Évaluation et décision

- **RG-09-11** : chaque étape d'évaluation (test, entretien) a une grille : critères, barème, pondération et commentaire. Plusieurs évaluateurs peuvent noter le même candidat ; Scolaly calcule la moyenne et signale les écarts importants entre évaluateurs.
- **RG-09-12** : l'école publie des créneaux (date, heure, lieu ou visio, capacité, évaluateurs). Le candidat réserve depuis son espace, reçoit une invitation d'agenda et un rappel la veille, et peut annuler ou déplacer jusqu'à 24 heures avant. Un candidat absent est signalé à la scolarité. Les tests en ligne (QCM) se font dans un outil externe dont le résultat est saisi ou importé.
- **RG-09-13** : la décision est prise par la direction ou par le responsable pédagogique, selon le paramétrage de l'école. Elle vaut : *admis*, *admis sous réserve* (par exemple sous réserve de trouver une entreprise ou d'obtenir le diplôme en cours), *liste d'attente* (avec un rang) ou *refusé* (motif interne, non communiqué par défaut). Elle est tracée et notifiée au candidat.
- **RG-09-14** : un admis confirme ou décline sa place dans son espace, avant une date limite. Un désistement libère la place, et Scolaly propose le premier candidat de la liste d'attente.

### Offres d'alternance et rapprochement

- **RG-09-15** : une offre d'alternance est déposée par un recruteur d'entreprise (formulaire public ou compte recruteur) ou saisie par le chargé de relations entreprises. Elle porte l'entreprise (créée par SIRET, module 03), l'intitulé, les missions, la ou les formations visées, le lieu, la date de début, le type de contrat et le nombre de postes. Elle est validée par l'école avant d'être diffusée aux candidats et admis concernés.
- **RG-09-16** : Scolaly suggère pour chaque offre les candidats compatibles, selon des critères explicites et affichés : formation visée, statut (admis ou en cours), distance au lieu de l'offre, date de disponibilité. Le chargé de relations entreprises propose l'offre au candidat, ou envoie son profil à l'entreprise avec l'accord du candidat. Le candidat peut aussi postuler lui-même.
- **RG-09-17** : chaque mise en relation suit les étapes *proposé* → *profil envoyé* → *entretien entreprise* → *retenu* ou *non retenu*. À « retenu », un contrat en brouillon est créé (module 03, puis CERFA au module 10).
- **RG-09-18** : un admis en alternance sans entreprise est suivi dans une liste dédiée, avec ses démarches. Il reçoit une relance hebdomadaire avec les nouvelles offres, et le chargé de relations entreprises est alerté. À l'approche de la date limite légale pour commencer sans contrat (3 mois après le début de la formation pour un apprenti, selon la réglementation en vigueur, paramétrable), Scolaly propose un passage en formation initiale ou un désistement.

### CRM et prospects

- **RG-09-19** : un prospect est une personne intéressée qui n'a pas encore postulé : demande d'information, salon, portes ouvertes, import d'une liste. Il porte une source, les formations qui l'intéressent et son consentement aux communications. Quand il postule, sa fiche devient candidature et garde son historique.
- **RG-09-20** : les événements (portes ouvertes, salons, ateliers) ont une page d'inscription publique, des rappels et une liste de présence (appel simple, sans QR). Les participants deviennent des prospects.
- **RG-09-21** : chaque fiche porte des tâches et des relances datées, assignées à un membre de l'équipe, qui apparaissent sur son accueil (module 08).
- **RG-09-22** : l'entonnoir de recrutement compte, par campagne, formation et source : prospects, candidatures commencées, complètes, évaluées, admis, confirmés, inscrits, avec les taux de passage d'une étape à l'autre et la comparaison avec l'année précédente.
- **RG-09-23** : un envoi groupé d'emails à un segment (par exemple les prospects d'un salon) est possible avec un modèle, uniquement vers les personnes qui ont consenti, avec un lien de désinscription.

### Pré-inscription

- **RG-09-24** : un admis qui confirme sa place passe en pré-inscription. Il complète son dossier administratif (coordonnées complètes, INE, pièce d'identité, photo pour le module 01, options choisies) dans son espace candidat.
- **RG-09-25** : le contrat de scolarité est généré à partir d'un modèle de l'école (formation, tarif, échéancier, conditions générales) et signé électroniquement par le candidat via un prestataire français conforme au règlement européen eIDAS (type Yousign, le même que pour les modules 10 et 13). Le contrat rappelle le délai de rétractation applicable à un contrat conclu à distance. Pour un alternant, le contrat de scolarité peut être remplacé par une simple fiche d'engagement, le financement venant de l'OPCO.
- **RG-09-26** : l'acompte est payé en ligne via le compte de paiement de l'école (RG-09-09), ou marqué payé par la scolarité s'il est réglé autrement. La suite de l'échéancier relève du module 11.
- **RG-09-27** : quand le dossier est complet, le contrat signé et l'acompte réglé (ou non exigé), Scolaly crée automatiquement l'inscription à l'état « inscrit » dans la bonne promotion (RG-02-13) et le compte apprenant (module 01), et y transfère les pièces. L'espace candidat devient l'espace apprenant, avec le même identifiant de connexion.

### Protection des données

- **RG-09-28** : le formulaire affiche les finalités du traitement, la durée de conservation et les droits du candidat. Le consentement aux communications commerciales est séparé et facultatif.
- **RG-09-29** : durées de conservation par défaut, paramétrables : 2 ans pour une candidature non retenue, 3 ans après le dernier contact pour un prospect. À l'échéance, les données sont supprimées ou anonymisées pour les statistiques. Le candidat peut exporter ou faire effacer ses données depuis son espace.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-09-01 · Campagnes | Scolarité, resp. pédagogique | Campagnes de l'année, places, candidatures par étape, duplication |
| E-09-02 · Paramétrage d'une campagne | Scolarité, resp. pédagogique | Formations, dates, pièces, frais, étapes, questions du formulaire (constructeur sans code), emails modèles, aperçu du formulaire, code du widget |
| E-09-03 · Formulaire de candidature (public) | Candidat | Étapes guidées, sauvegarde automatique, dépôt de pièces depuis le téléphone, paiement |
| E-09-04 · Espace candidat | Candidat | Avancement du dossier, pièces à fournir, réservation de créneaux, décision, confirmation de place, offres d'alternance, pré-inscription (dossier, signature, acompte) |
| E-09-05 · Candidatures (colonnes) | Scolarité, resp. pédagogique | Une colonne par étape, cartes candidats, filtres, actions en masse, bascule en vue tableau |
| E-09-06 · Dossier candidat | Idem ; évaluateurs | Identité, parcours, pièces avec aperçu, évaluations, historique des échanges, décision |
| E-09-07 · Créneaux | Resp. pédagogique, scolarité | Calendrier des tests et entretiens, capacité, évaluateurs, réservations |
| E-09-08 · Grille d'évaluation | Évaluateur | Critères, notes, commentaire, mobile d'abord |
| E-09-09 · Jury d'admission | Direction, resp. pédagogique | Candidats évalués triés par moyenne, avis, décision en masse ou une par une, places restantes |
| E-09-10 · Offres d'alternance | Chargé de relations entreprises | Offres à valider, offres diffusées, candidats suggérés, mises en relation |
| E-09-11 · Dépôt d'offre (public ou recruteur) | Recruteur d'entreprise | Formulaire court, suivi des profils proposés |
| E-09-12 · Admis sans entreprise | Chargé de relations entreprises | Liste, démarches, échéance légale, relances |
| E-09-13 · Prospects et événements | Chargé de relations entreprises, scolarité | Fiches prospects, saisie rapide en salon, événements et inscriptions, tâches |
| E-09-14 · Entonnoir de recrutement | Direction, scolarité | Effectifs et taux par étape, par formation et par source, comparaison avec l'année précédente |

### Parcours « de la candidature à l'inscription » (candidat)

1. Sur le site de l'école, il clique « Postuler », confirme son email et remplit son dossier en plusieurs fois.
2. Il paie les frais de dossier par carte ; son dossier passe à « complet ».
3. Il réserve un créneau d'entretien dans son espace et reçoit un rappel la veille.
4. Il reçoit la décision « admis » et confirme sa place.
5. Il complète son dossier d'inscription, signe son contrat et paie l'acompte : il devient apprenant et retrouve son espace Scolaly.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Campagne | formations, année de rentrée, modes, places, dates, pièces, frais, étapes, questions, emails modèles | a des candidatures et des vagues |
| Prospect | identité, contact, source, formations d'intérêt, consentements, statut | devient une candidature |
| Événement | type, date, lieu, capacité, inscrits, présents | génère des prospects |
| Candidature | candidat, campagne, vœux, mode, origine (directe / Parcoursup / Mon Master / import), étape, pièces, paiement, décision, rang en liste d'attente | a des évaluations et des rendez-vous |
| Compte candidat | email vérifié, mot de passe ou lien magique | devient compte apprenant |
| Évaluation d'admission | candidature, étape, évaluateur, notes par critère, commentaire | selon une grille |
| Créneau et rendez-vous | date, lieu ou visio, capacité, évaluateurs ; candidat, statut | lié à une étape |
| Offre d'alternance | entreprise, recruteur, intitulé, missions, formations, lieu, début, type de contrat, postes, statut | a des mises en relation |
| Mise en relation | offre, candidat, étape, dates | aboutit éventuellement à un contrat (module 03) |
| Compte recruteur | personne, entreprise | dépose des offres |
| Pré-inscription | candidature, dossier administratif, contrat de scolarité signé, acompte, statut | aboutit à une inscription (module 02) |
| Paiement | candidature, objet (frais de dossier, acompte), montant, statut, référence du prestataire | le prestataire est celui de l'école |
| Tâche | fiche liée, assignée à, échéance, statut | apparaît sur l'accueil |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Candidat présent sur Parcoursup et en candidature directe | Doublon détecté à l'import ; fusion proposée en gardant les deux origines |
| Paiement accepté mais retour du prestataire perdu | Le statut est réconcilié automatiquement par la notification du prestataire ; le candidat n'est jamais débité deux fois |
| Plus d'admis confirmés que de places | Alerte au jury ; les nouvelles confirmations passent en liste d'attente si l'école le paramètre |
| Admis en alternance qui trouve une entreprise après la rentrée | Contrat créé à la date de signature ; statut apprenti à partir de cette date (RG-03-06) |
| Offre d'entreprise hors des formations de l'école | Refusée à la validation avec un message au recruteur |
| Candidat mineur | Le contrat de scolarité exige aussi la signature d'un représentant légal (coordonnées demandées dans le dossier) |
| Candidat qui demande l'effacement de ses données pendant la campagne | La candidature est retirée et ses données effacées, sauf les écritures de paiement conservées pour la comptabilité |

## 8. Critères d'acceptation

- [ ] Un candidat dépose une candidature complète avec pièces et paiement sur mobile en moins de 15 minutes (test avec 5 personnes).
- [ ] Le widget s'intègre sur un site WordPress et sur un site statique sans développement.
- [ ] L'import d'un fichier d'export Parcoursup de 1 000 candidatures prend moins d'une minute, et un réimport ne crée aucun doublon.
- [ ] 200 candidatures sont passées d'une étape à la suivante en une action, avec les emails modèles envoyés.
- [ ] Un candidat réserve, déplace puis annule un créneau ; les capacités sont respectées.
- [ ] Un admis qui signe et paie devient apprenant inscrit dans la bonne promotion, avec son compte, sans aucune saisie de la scolarité.
- [ ] Les suggestions de candidats pour une offre respectent les critères affichés (formation, distance, disponibilité) sur un jeu de test.
- [ ] Les données d'une candidature non retenue sont supprimées ou anonymisées à l'échéance paramétrée (test automatisé).

## 9. Exigences propres au module

- **Charge** : le formulaire public supporte un pic de 2 000 candidats connectés en même temps (ouverture d'une campagne) sans ralentir le reste de la plateforme.
- **Sécurité** : les comptes candidats et recruteurs sont isolés ; ils ne voient que leurs propres données. Les pièces d'identité sont chiffrées et accessibles seulement à la scolarité.
- **Paiement** : aucune donnée de carte ne transite par Scolaly (page de paiement hébergée par le prestataire de l'école).
- **Accessibilité** : formulaire public conforme RGAA AA, utilisable au clavier et avec un lecteur d'écran.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Modes de candidature | Formulaire public, frais de dossier en ligne, import Parcoursup / Mon Master, tests et entretiens réservables |
| Offres d'alternance | Dès la V2, avec dépôt par les entreprises et rapprochement |
| Pré-inscription | Dès la V2 : dossier, contrat signé en ligne, acompte, inscription automatique |
| Paiements en ligne | Chaque école connecte son propre compte. Stripe est intégré en premier (mode « compte standard »), derrière un connecteur extensible qui permettra d'ajouter une solution française (PayPlug, Lyra / PayZen, Systempay) pour les écoles qui l'exigent |
| Signature électronique | Prestataire français conforme eIDAS (type Yousign), partagé avec les modules 10 et 13 |

# Cahier des charges Scolaly — 10 · Contrats CERFA, OPCO et NPEC

> Statut : **validé** le 01/10/2026.
> Document de travail (avec le schéma du cycle de vie d'un contrat) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b
## 1. Objectif et périmètre

Ce module produit des contrats d'alternance justes du premier coup, signés par les trois parties et déposés à l'OPCO dans le délai légal, puis suit leur prise en charge financière jusqu'à la fin du contrat. C'est la principale source de revenus d'un CFA : chaque erreur de CERFA retarde le financement. **Phase : V2** (rentrée 2028).

**Inclus :**

- dossier contractuel complet : tous les champs du CERFA de contrat d'apprentissage (FA13, version en vigueur) et de contrat de professionnalisation (EJ20) ; il enrichit la fiche contrat du module 03 ;
- **remplissage collaboratif** (décision du 01/10/2026) : Scolaly pré-remplit, l'employeur complète sa partie par un lien sécurisé ;
- contrôles de cohérence et calcul automatique de la rémunération minimale ;
- **signature électronique tripartite** (employeur, alternant, école ; représentant légal si mineur), via le prestataire français conforme eIDAS retenu ;
- **dépôt OPCO progressif** (décision du 01/10/2026) : dépôt guidé avec le CERFA en PDF, puis transmission par l'API commune des OPCO, OPCO par OPCO ;
- suivi de la prise en charge : NPEC, montant financé, échéancier prévisionnel transmis au module 11 ;
- avenants et ruptures, avec notification à l'OPCO ;
- **suivi simple des aides** à l'embauche et aux apprentis (décision du 01/10/2026) : information et échéances.

**Exclus :**

- émission des factures OPCO et suivi des paiements (module 11) ;
- gestion financière des aides aux apprentis (module 17, V3) ;
- conventions de stage (déjà couvertes par le module 03).

## 2. Acteurs et droits

Un nouvel accès externe apparaît : le **représentant de l'employeur**, qui complète et signe le CERFA depuis un lien sécurisé, sans compte permanent.

| Action | Admin | Chargé de relations entreprises | Scolarité | Comptable | Alternant | Employeur (lien sécurisé) | Tuteur |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Créer et pré-remplir un contrat | Oui | Oui | Oui | Non | Non | Non | Non |
| Compléter la partie employeur | Non | Oui (pour lui) | Oui (pour lui) | Non | Non | Oui | Non |
| Compléter la partie alternant | Non | Oui | Oui | Non | Oui (via son espace) | Non | Non |
| Envoyer en signature | Oui | Oui | Oui | Non | Non | Non | Non |
| Signer | Non | Non | Oui (pour l'école, si délégation) | Non | Oui | Oui | Non |
| Déposer à l'OPCO et suivre la prise en charge | Oui | Oui | Oui | Lecture | Non | Lecture du statut | Non |
| Saisir un avenant ou une rupture | Oui | Oui | Oui | Lecture | Non | Signer | Lecture |
| Consulter les montants de prise en charge | Oui | Oui | Lecture | Oui | Non | Non | Non |

## 3. User stories

Le module compte 16 user stories, dont 13 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-10-01 | chargé de relations entreprises | créer le contrat d'un alternant à partir d'une mise en relation retenue, avec tout ce que Scolaly sait déjà pré-rempli | ne saisir que ce qui manque | Must |
| US-10-02 | employeur | compléter ma partie du CERFA depuis un lien reçu par email, sans créer de compte | faire ma part en 10 minutes | Must |
| US-10-03 | alternant | compléter et vérifier mes informations depuis mon espace | que mon contrat soit juste | Must |
| US-10-04 | chargé de relations entreprises | voir toutes les incohérences (âge, durée, rémunération, maître d'apprentissage, dates) avant la signature | éviter un refus de l'OPCO | Must |
| US-10-05 | chargé de relations entreprises | voir la rémunération minimale calculée automatiquement, année par année | ne pas proposer un salaire illégal | Must |
| US-10-06 | chargé de relations entreprises | envoyer le contrat en signature électronique aux trois parties et suivre qui a signé | obtenir les signatures en quelques jours | Must |
| US-10-07 | scolarité | déposer le contrat à l'OPCO par l'API quand elle est disponible, sinon être guidée pas à pas avec le PDF et les pièces | respecter le délai de 5 jours ouvrables | Must |
| US-10-08 | scolarité | voir le statut de chaque contrat auprès de l'OPCO (déposé, pris en charge, refusé) et le motif d'un refus | corriger vite | Must |
| US-10-09 | comptable | voir pour chaque contrat le NPEC, le montant pris en charge et l'échéancier prévisionnel | préparer la facturation OPCO | Must |
| US-10-10 | scolarité | établir un avenant (dates, maître d'apprentissage, rémunération) et le faire signer | tenir le contrat à jour | Must |
| US-10-11 | scolarité | enregistrer une rupture, produire le document de rupture et en informer l'OPCO | fermer proprement le contrat | Must |
| US-10-12 | chargé de relations entreprises | être alerté des contrats non déposés à J+3, des refus et des pièces manquantes | ne perdre aucun financement | Must |
| US-10-13 | employeur | savoir à quelles aides je peux prétendre et quand les demander | ne pas les oublier | Must |
| US-10-14 | direction | voir le montant total pris en charge par OPCO et par formation pour l'année | piloter les recettes de l'apprentissage | Should |
| US-10-15 | scolarité | renouveler un contrat pour l'année suivante (seconde année de formation) en dupliquant le précédent | gagner du temps | Should |
| US-10-16 | chargé de relations entreprises | importer les contrats déjà déposés dans l'ancien outil | reprendre l'historique | Could |

## 4. Règles de gestion

Cycle de vie (schéma dans le document de travail) : le contrat passe de la préparation à la signature tripartite, puis au dépôt OPCO (5 jours ouvrables au plus après le début d'exécution) ; une anomalie ou un refus renvoie à la correction, et l'exécution se termine par une fin normale ou une rupture, avec d'éventuels avenants.

### Dossier contractuel et remplissage collaboratif

- **RG-10-01** : le dossier contractuel reprend tous les champs du CERFA en vigueur, regroupés en 5 parties : employeur, maître d'apprentissage ou tuteur, alternant, contrat (type, dates, durée du travail, rémunération), formation et organisme de formation. Le modèle de CERFA est versionné dans Scolaly : un changement de version officielle est déployé par une mise à jour, sans action des écoles.
- **RG-10-02** : Scolaly pré-remplit tout ce qu'il connaît déjà : l'école (UAI, SIRET, NDA, adresse), la formation (intitulé, code RNCP, niveau, dates, heures de formation calculées à partir de l'EDT et de la maquette), l'alternant (module 01), l'entreprise et son OPCO (module 03), le maître d'apprentissage s'il est déjà connu.
- **RG-10-03** : l'employeur reçoit un lien sécurisé, valable 14 jours et protégé par un code envoyé par email, pour compléter sa partie : convention collective, effectif, régime de retraite complémentaire, maître d'apprentissage (diplôme, expérience), rémunération. Il voit les champs déjà remplis en lecture seule et peut signaler une erreur. Son avancement est visible par l'école, et des relances partent à J+2 et J+5.
- **RG-10-04** : l'alternant complète et vérifie sa partie depuis son espace (numéro de sécurité sociale, situation avant le contrat, dernier diplôme obtenu). Ces données sensibles ne sont visibles que par la scolarité, le chargé de relations entreprises et l'employeur via le CERFA.

### Contrôles de cohérence

- **RG-10-05** : avant l'envoi en signature, Scolaly vérifie le dossier et classe chaque anomalie en bloquante ou en avertissement. Contrôles principaux :

| Contrôle | Niveau |
| --- | --- |
| Champ obligatoire du CERFA manquant | Bloquant |
| Âge de l'alternant hors des limites du type de contrat (avec les dérogations prévues) | Bloquant |
| Rémunération inférieure au minimum calculé (RG-10-06) | Bloquant |
| Dates du contrat incohérentes avec celles de la formation, ou début plus de 3 mois après le début de la formation | Bloquant |
| Durée de formation inférieure au minimum légal (RG-03-16) | Avertissement |
| Maître d'apprentissage sans les conditions de diplôme ou d'expérience requises | Avertissement |
| Maître d'apprentissage qui encadre déjà le nombre maximal d'apprentis (RG-03-04) | Avertissement |
| SIRET, IDCC ou OPCO absents de l'annuaire ou incohérents | Avertissement |

- **RG-10-06** : la rémunération minimale est calculée automatiquement, année par année du contrat, selon le type de contrat, l'âge de l'alternant (avec le changement de tranche à son anniversaire), l'année d'exécution et le salaire de référence (SMIC ou minimum conventionnel s'il est plus favorable). Les pourcentages légaux sont stockés dans une table datée, tenue à jour par Scolaly et commune à toutes les écoles ; l'employeur saisit le minimum conventionnel s'il s'applique.

### Signature électronique

- **RG-10-07** : quand le dossier n'a plus d'anomalie bloquante, le CERFA est généré en PDF et envoyé en signature électronique via le prestataire français conforme eIDAS retenu (type Yousign). Ordre des signatures : employeur, alternant (et son représentant légal s'il est mineur), puis l'école pour le visa de l'organisme de formation.
- **RG-10-08** : chaque signataire reçoit un email et, pour l'alternant, une notification Scolaly. Une relance part toutes les 48 heures. Une modification après le début des signatures annule la procédure et en relance une nouvelle. Le PDF signé et son dossier de preuve sont archivés.

### Dépôt OPCO progressif

- **RG-10-09** : l'OPCO est déterminé par la convention collective de l'employeur (table IDCC → OPCO du module 03). Le dépôt doit avoir lieu dans les 5 jours ouvrables qui suivent le début d'exécution du contrat : Scolaly affiche un compte à rebours et alerte à J+3.
- **RG-10-10** : deux modes de dépôt coexistent, selon l'OPCO :
  - *API* : quand Scolaly est habilité auprès de l'OPCO (API commune des OPCO, clé propre à chaque SIRET de l'école), le contrat et ses pièces sont transmis en un clic, et les accusés de réception, validations et refus remontent automatiquement ;
  - *guidé* : sinon, Scolaly fournit le CERFA signé et les pièces dans un dossier prêt à déposer, un lien vers le portail de l'OPCO et une check-list. La scolarité saisit ensuite le numéro de dépôt et le statut. Les OPCO passent du mode guidé au mode API au fur et à mesure des habilitations obtenues par Scolaly, sans changement pour l'école.
- **RG-10-11** : chaque école enregistre ses identifiants d'accès aux API des OPCO dans ses paramètres. Ils sont chiffrés, jamais affichés en clair, et un test de connexion est proposé.
- **RG-10-12** : statuts auprès de l'OPCO : *à déposer* → *déposé* → *accusé de réception* → *pris en charge* (numéro de dépôt, montant) ou *refusé* (motif). Un refus ramène le contrat en correction, avec le motif affiché en tête du dossier.

### Prise en charge et NPEC

- **RG-10-13** : Scolaly tient un référentiel des niveaux de prise en charge (NPEC) publié par France compétences, par certification et par convention collective, avec leurs dates de validité. Il est mis à jour à chaque publication (par exemple la révision appliquée aux contrats signés depuis le 1er septembre 2026), et l'historique est conservé : un contrat garde le NPEC en vigueur à sa date de conclusion.
- **RG-10-14** : le montant pris en charge est calculé à partir du NPEC annuel, au prorata de la durée du contrat, puis remplacé par le montant notifié par l'OPCO dès qu'il est connu. Un écart entre le montant calculé et le montant notifié est signalé.
- **RG-10-15** : un échéancier prévisionnel de facturation est créé pour chaque contrat pris en charge, selon les règles de versement en vigueur (paramétrables). Il est transmis au module 11, qui émet les factures. Les frais annexes (hébergement, restauration, premier équipement) sont notés sur le contrat pour être facturés par le module 11.

### Avenants et ruptures

- **RG-10-16** : un avenant modifie un contrat en cours (dates, maître d'apprentissage, rémunération, durée de formation). Il suit le même circuit : contrôles, signature, transmission à l'OPCO. Le contrat garde l'historique de ses versions.
- **RG-10-17** : une rupture enregistre sa date, son motif et son initiative (RG-03-07), génère le document de rupture à signer si nécessaire et notifie l'OPCO (API ou mode guidé). La prise en charge est recalculée au prorata, et l'échéancier du module 11 est ajusté.
- **RG-10-18** : pour un contrat de deux ans ou plus, le passage en seconde année ne demande pas de nouveau contrat. Pour un nouveau contrat chez le même employeur (nouvelle formation), Scolaly propose de dupliquer le dossier précédent.

### Aides (suivi simple)

- **RG-10-19** : pour chaque contrat, Scolaly affiche les aides auxquelles l'employeur et l'alternant peuvent prétendre selon les règles en vigueur (aide à l'embauche d'un apprenti, aides aux apprentis), avec un lien vers la démarche officielle et les échéances. Les règles et les montants sont tenus à jour par Scolaly dans une table datée. Aucun montant n'est encaissé ni géré par Scolaly.
- **RG-10-20** : l'employeur reçoit un rappel par email après la prise en charge du contrat, avec les aides possibles et leur démarche.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-10-01 · Tableau des contrats | Chargé de relations entreprises, scolarité | Contrats par étape (préparation, signature, dépôt, pris en charge, refusé), compte à rebours du dépôt, alertes, filtres par OPCO et formation |
| E-10-02 · Dossier contractuel | Idem | Les 5 parties du CERFA avec leur avancement, anomalies en tête, rémunération calculée année par année, aperçu du PDF, historique des versions |
| E-10-03 · Partie employeur (lien sécurisé) | Employeur | Formulaire mobile et ordinateur, champs pré-remplis en lecture seule, bouton « Signaler une erreur », enregistrement automatique |
| E-10-04 · Suivi des signatures | Chargé de relations entreprises | Qui a signé, quand, relances, annulation et relance de la procédure |
| E-10-05 · Dépôt OPCO | Scolarité | Mode API (un clic, statut en direct) ou mode guidé (dossier à télécharger, lien vers le portail de l'OPCO, check-list, saisie du numéro de dépôt) |
| E-10-06 · Prise en charge | Comptable, direction | Par contrat : NPEC, montant calculé et notifié, écarts, échéancier prévisionnel ; totaux par OPCO et par formation |
| E-10-07 · Avenants et ruptures | Scolarité | Assistant de création, signature, transmission à l'OPCO |
| E-10-08 · Connexions OPCO | Administrateur | Identifiants d'API par OPCO et par SIRET, test de connexion, mode actif (API ou guidé) |
| E-10-09 · Référentiels | Lecture pour tous les rôles de gestion | NPEC, grille de rémunération, aides, avec leurs dates de validité et leur source |

### Parcours « du candidat retenu au contrat pris en charge »

1. L'entreprise retient un candidat (module 09) : le dossier contractuel est créé, pré-rempli.
2. L'employeur complète sa partie par le lien reçu ; l'alternant vérifie la sienne.
3. Le chargé de relations entreprises corrige les anomalies, puis envoie en signature.
4. Les trois parties signent ; le contrat passe à « à déposer » avec son compte à rebours.
5. La scolarité dépose (API ou mode guidé) ; l'OPCO notifie la prise en charge ; l'échéancier part au module 11.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Dossier contractuel | contrat (module 03), version du modèle CERFA, données des 5 parties, anomalies, statut de saisie de chaque partie | une version par avenant |
| Lien employeur | dossier, email, code, expiration, avancement | à usage limité |
| Procédure de signature | dossier, prestataire, signataires et ordre, statuts, dates, PDF signé, dossier de preuve | une active par version |
| Dépôt OPCO | dossier, OPCO, mode (API / guidé), dates, numéro de dépôt, statut, motif de refus, échanges API | un par version transmise |
| Prise en charge | contrat, NPEC appliqué, montant calculé, montant notifié, frais annexes, échéancier prévisionnel | transmise au module 11 |
| Avenant / rupture | contrat, type, date d'effet, motif, documents, statut OPCO | historise le contrat |
| Référentiel NPEC | certification, IDCC, montant annuel, dates de validité, source | commun à toutes les organisations |
| Grille de rémunération | type de contrat, tranche d'âge, année, pourcentage, salaire de référence, dates de validité | commune à toutes les organisations |
| Aide | nom, bénéficiaire, conditions, montant indicatif, démarche, dates de validité | commune à toutes les organisations |
| Connexion OPCO | organisation, OPCO, SIRET, identifiants chiffrés, statut | une par OPCO et par SIRET |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| L'employeur ne complète pas sa partie | Relances à J+2 et J+5, puis alerte au chargé de relations entreprises, qui peut saisir pour lui |
| Version du CERFA modifiée en cours de saisie | Le dossier est migré vers la nouvelle version ; les champs nouveaux sont signalés à compléter |
| Alternant qui change de tranche d'âge pendant le contrat | La rémunération minimale change à la date prévue par la réglementation ; l'échéancier de rémunération l'indique |
| API de l'OPCO indisponible | Nouvelle tentative automatique ; au-delà de 24 heures, bascule proposée vers le mode guidé pour tenir le délai |
| Refus de l'OPCO pour pièce manquante | Le motif s'affiche, la pièce est demandée à la bonne personne, puis nouveau dépôt |
| Rupture pendant la période d'essai | Rupture simplifiée, prise en charge recalculée, statut de l'apprenant mis à jour (RG-03-06, RG-03-07) |
| Contrat déposé hors délai | Le dépôt reste possible ; le retard est signalé dans le dossier et dans les indicateurs |

## 8. Critères d'acceptation

- [ ] Un contrat créé depuis une mise en relation est pré-rempli à 80 % au moins (champs du CERFA), sur un jeu de test.
- [ ] Un employeur complète sa partie sur mobile en moins de 10 minutes (test avec 3 employeurs).
- [ ] La rémunération minimale calculée est exacte sur 30 cas de test couvrant tous les types de contrat, tranches d'âge et années, avec la grille en vigueur.
- [ ] Chaque contrôle bloquant de RG-10-05 empêche l'envoi en signature sur un cas de test.
- [ ] Le PDF généré est identique au formulaire CERFA officiel en vigueur (champs, ordre, mentions) et accepté par au moins deux OPCO en conditions réelles.
- [ ] Avec un OPCO connecté en API, un dépôt est transmis en un clic et son accusé de réception remonte automatiquement.
- [ ] Un contrat non déposé déclenche l'alerte à J+3.
- [ ] Une rupture recalcule la prise en charge au prorata et met à jour l'échéancier transmis au module 11.

## 9. Exigences propres au module

- **Conformité** : les référentiels (CERFA, NPEC, rémunération, aides) sont datés, sourcés et mis à jour par Scolaly ; chaque mise à jour est annoncée dans les notes de version. Un contrat utilise toujours les règles en vigueur à sa date de conclusion.
- **Sécurité** : numéro de sécurité sociale et identifiants OPCO chiffrés au repos ; liens employeur à usage limité et protégés par un code.
- **Fiabilité** : tous les échanges avec les OPCO sont journalisés (requête, réponse, date), conservés comme preuves et rejouables en cas d'erreur.
- **Partenariats** : obtenir les habilitations d'éditeur auprès des OPCO est une tâche à planifier dès le début de la V2, en commençant par les OPCO les plus représentés chez les écoles pilotes.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Dépôt OPCO | Progressif : mode guidé (CERFA PDF et pièces) dès la V2, puis API commune des OPCO, OPCO par OPCO, au fil des habilitations |
| Saisie du CERFA | Collaborative : pré-remplissage par Scolaly, partie employeur par lien sécurisé, puis signature tripartite |
| Aides | Suivi simple (information, échéances, rappels) ; pas de gestion financière |
| Signature électronique | Prestataire français conforme eIDAS (type Yousign) |

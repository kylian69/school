# Cahier des charges Scolaly — 16 · Tableaux de bord et exports réglementaires

> Statut : **validé** le 02/10/2026.
> Document de travail (avec le schéma du pilotage) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b
## 1. Objectif et périmètre

Ce module transforme les données de Scolaly en pilotage : des tableaux de bord prêts à l'emploi pour chaque rôle, des tableaux et indicateurs créés par l'école, des exports libres vers Excel, et les exports réglementaires annuels des CFA. Tous reposent sur un seul catalogue d'indicateurs, pour que chaque chiffre soit le même partout. **Phase : V2.**

**Inclus :**

- catalogue d'indicateurs commun, aux formules documentées ;
- tableaux de bord prêts à l'emploi par rôle, et tableau consolidé du groupe ;
- **éditeur de tableaux et d'indicateurs pour l'école** (décision du 02/10/2026) ;
- **exports libres** : colonnes et filtres choisis, export Excel ou CSV (décision du 02/10/2026) ;
- **exports réglementaires** : enquête SIFA sur les apprentis et comptabilité analytique des CFA pour France compétences (décision du 02/10/2026) ;
- calendrier des échéances réglementaires.

**Exclus :**

- envoi automatique de tableaux ou d'exports par email (décision du 02/10/2026) ;
- exports déjà couverts ailleurs : BPF et indicateurs publiés (module 12), dépôts OPCO (module 10), FEC et exports comptables (module 11) ;
- connexion d'un outil décisionnel externe (par l'API, module 18).

## 2. Acteurs et droits

Le droit de créer des tableaux partagés et des indicateurs est une permission que l'administrateur peut attribuer à n'importe quel rôle.

| Action | Admin | Direction | Direction de groupe | Responsable pédagogique | Scolarité | Comptable | Chargé de relations entreprises |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Consulter son tableau de bord | Oui | Oui | Agrégé par école | Ses formations | Oui | Oui | Oui |
| Créer un tableau personnel | Oui | Oui | Oui | Oui | Oui | Oui | Oui |
| Créer et partager un tableau pour l'école | Oui | Oui | Non | Si droit attribué | Si droit attribué | Si droit attribué | Si droit attribué |
| Créer un indicateur de l'école | Oui | Oui | Non | Si droit attribué | Non | Si droit attribué | Non |
| Exports libres | Oui | Oui | Agrégats seulement | Son périmètre | Son périmètre | Données financières | Son périmètre |
| Exports réglementaires | Oui | Oui | Non | Non | SIFA | Comptabilité analytique | Non |
| Consulter le journal des exports | Oui | Non | Non | Non | Non | Non | Non |

## 3. User stories

Le module compte 16 user stories, dont 12 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-16-01 | direction | ouvrir un tableau de bord prêt avec les chiffres clés de l'école | piloter sans préparer de tableur | Must |
| US-16-02 | responsable pédagogique | voir l'assiduité, les résultats et les alertes de mes formations | agir tôt sur les difficultés | Must |
| US-16-03 | chargé de relations entreprises | voir les candidats sans contrat et les contrats à déposer | ne laisser personne sans entreprise | Must |
| US-16-04 | comptable | voir le facturé, l'encaissé et les impayés | suivre la trésorerie | Must |
| US-16-05 | direction de groupe | comparer les écoles du groupe sur les mêmes indicateurs, sans données nominatives | piloter le groupe | Must |
| US-16-06 | utilisateur | filtrer, comparer à l'an dernier et cliquer pour voir le détail dans mon périmètre | comprendre un chiffre | Must |
| US-16-07 | administrateur | créer un tableau pour l'école à partir du catalogue et le partager à un rôle | suivre nos propres priorités | Must |
| US-16-08 | direction | définir un indicateur propre à l'école sans code | mesurer ce qui compte pour nous | Must |
| US-16-09 | scolarité | construire un export en choisissant colonnes et filtres, puis l'enregistrer | répondre à une demande en deux minutes | Must |
| US-16-10 | scolarité | produire un fichier SIFA contrôlé | déclarer sans erreur | Must |
| US-16-11 | comptable | produire la comptabilité analytique du CFA | respecter l'obligation annuelle | Must |
| US-16-12 | direction | voir le calendrier des échéances réglementaires | ne manquer aucune date | Must |
| US-16-13 | utilisateur | exporter un tableau en PDF ou en image | le présenter en réunion | Should |
| US-16-14 | administrateur | savoir qui a exporté quelles données personnelles | respecter le RGPD | Should |
| US-16-15 | direction | dupliquer un modèle de tableau proposé par Scolaly | partir d'une base | Should |
| US-16-16 | responsable pédagogique | épingler un indicateur sur ma page d'accueil | le voir chaque jour | Could |

## 4. Règles de gestion

Un catalogue, trois sorties (schéma dans le document de travail) : les données de tous les modules alimentent un catalogue d'indicateurs unique, qui applique les droits de chacun ; tableaux de bord, exports libres et exports réglementaires s'appuient tous sur lui.

### Catalogue d'indicateurs

- **RG-16-01** : un indicateur est défini une seule fois : nom, définition en clair, formule, source, périodes, découpages possibles (établissement, formation, promotion, statut, financeur…), unité, sens (plus haut est mieux ou non) et seuil d'alerte facultatif. Scolaly fournit un catalogue standard aux formules identiques pour toutes les écoles, ce qui rend les comparaisons possibles :

| Domaine | Exemples d'indicateurs | Modules |
| --- | --- | --- |
| Effectifs et recrutement | inscrits par formation et statut, remplissage, candidatures, taux de transformation | 01, 02, 09 |
| Assiduité | taux de présence, absences non justifiées, retards | 06 |
| Pédagogie | moyennes, taux de réussite, blocs validés, devoirs non rendus | 07, 14, 15 |
| Alternance | apprentis sous contrat, candidats sans contrat, ruptures, contrats non déposés, suivis en retard | 03, 10, 13 |
| Finances | facturé, encaissé, impayés par ancienneté, prises en charge OPCO | 10, 11 |
| Qualité | satisfaction, taux de réponse, réclamations ouvertes, couverture Qualiopi | 12 |

- **RG-16-02** : les valeurs sont pré-calculées et rafraîchies régulièrement (toutes les 15 minutes par défaut, ou à la demande de l'administrateur) ; l'heure du dernier calcul s'affiche. Elles appliquent les mêmes règles que les écrans métier (par exemple le moteur de calcul du module 07) et donnent donc les mêmes chiffres.
- **RG-16-03** : chaque indicateur, tableau et export respecte le rôle et le périmètre de l'utilisateur (RG-00-11). Pour les données sensibles, une valeur calculée sur moins de 5 personnes (seuil paramétrable) est masquée, pour qu'on ne puisse pas reconnaître quelqu'un.

### Tableaux prêts à l'emploi

- **RG-16-04** : chaque rôle a un tableau par défaut :
  - *direction* : effectifs, remplissage, assiduité, réussite, ruptures, chiffre d'affaires et impayés, satisfaction ;
  - *responsable pédagogique* : pour ses formations, assiduité, résultats, devoirs, livrets en retard ;
  - *scolarité* : dossiers incomplets, absences à traiter, documents à produire ;
  - *chargé de relations entreprises* : candidats sans contrat, contrats à déposer, suivis en retard, risques de rupture ;
  - *comptable* : facturé, encaissé, impayés, échéances OPCO ;
  - *responsable qualité* : couverture Qualiopi, enquêtes, réclamations.
- **RG-16-05** : tout tableau propose des filtres (année, période, établissement, formation, promotion, statut), la comparaison avec la période précédente, le détail par clic jusqu'à la liste des personnes concernées dans le périmètre de l'utilisateur, et l'export en PDF ou en image. Chacun peut réorganiser ou masquer les cartes de son tableau, sans effet pour les autres.
- **RG-16-06** : le tableau de la direction de groupe montre les indicateurs du catalogue par école et pour l'ensemble du groupe, avec comparaison. Il ne montre aucune donnée nominative ni détail par personne, sauf accord explicite et daté de l'école (RG-00-24) (décision du 02/10/2026).

### Tableaux et indicateurs de l'école

- **RG-16-07** : l'éditeur crée un tableau composé de cartes : chiffre clé avec évolution, courbe, barres, camembert, tableau ou liste. Chaque carte s'appuie sur un indicateur du catalogue, avec ses filtres et son découpage. Les cartes se placent par glisser-déposer, avec un aperçu sur les données réelles.
- **RG-16-08** : un indicateur de l'école se crée sans code : comptage ou somme sur une source avec des filtres, ou ratio entre deux indicateurs, avec un nom et une définition en clair. Il rejoint le catalogue de l'école et sert dans tous ses tableaux. Il est versionné et ses modifications restent dans l'historique.
- **RG-16-09** : un tableau est personnel, ou partagé à des rôles ou des personnes par qui détient le droit de partage ; chaque destinataire n'y voit que les données de son périmètre. Scolaly propose des modèles de tableaux à dupliquer.
- **RG-16-10** : les tableaux se consultent dans Scolaly et les exports se lancent à la main ; il n'y a pas d'envoi automatique par email (décision du 02/10/2026).

### Exports libres

- **RG-16-11** : l'utilisateur choisit une source (apprenants, inscriptions, candidatures, séances, absences, notes, contrats, entreprises, factures, encaissements…), les colonnes (y compris celles des objets liés : formation, entreprise, tuteur), les filtres et le tri. Il voit un aperçu des 50 premières lignes, puis exporte en Excel ou en CSV (séparateur et encodage au choix).
- **RG-16-12** : seules les colonnes que l'utilisateur peut voir à l'écran sont proposées. Les exports qui contiennent des données personnelles sont journalisés (qui, quand, quelle source, combien de lignes), et l'administrateur consulte ce journal.
- **RG-16-13** : un export peut être enregistré comme modèle, partagé, avec des dates relatives (par exemple « année en cours »). Au-delà de 50 000 lignes (paramétrable), le fichier est préparé en tâche de fond ; une notification dans Scolaly prévient quand il est prêt, et le lien reste valable 7 jours.

### Exports réglementaires

- **RG-16-14** : chaque année, Scolaly produit le fichier de l'enquête SIFA sur les apprentis à la date d'observation (31 décembre), au format et avec les nomenclatures en vigueur, tenus dans une table datée. Avant l'export, des contrôles listent les anomalies (champs manquants, codes incohérents, doublons) avec un lien vers la fiche à corriger. L'école dépose le fichier sur la plateforme de collecte.
- **RG-16-15** : Scolaly prépare la comptabilité analytique du CFA : ventilation des charges et des produits par diplôme ou titre, à partir des produits (modules 10 et 11) et des charges saisies ou importées depuis la comptabilité de l'école, avec des clés de répartition paramétrables (heures de formation, effectifs, surfaces…). Le modèle de restitution et ses rubriques sont tenus dans une table datée. L'école transmet l'export à France compétences.
- **RG-16-16** : un calendrier réglementaire liste les échéances annuelles (SIFA, comptabilité analytique, BPF, indicateurs publiés, audits Qualiopi) avec un responsable et des rappels dans Scolaly. Les dates sont tenues dans une table datée.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-16-01 · Mon tableau de bord | Tous les rôles de gestion | Tableau du rôle, filtres, comparaison, détail par clic |
| E-16-02 · Tableau du groupe | Direction de groupe | Indicateurs par école et pour le groupe, sans données nominatives |
| E-16-03 · Catalogue d'indicateurs | Admin, direction | Définitions, formules, indicateurs de l'école |
| E-16-04 · Éditeur de tableau | Ayants droit | Cartes, grille, aperçu, partage, modèles |
| E-16-05 · Éditeur d'indicateur | Ayants droit | Source, filtres, ratio, définition, versions |
| E-16-06 · Exports libres | Selon les droits | Source, colonnes, filtres, tri, aperçu, modèles |
| E-16-07 · Mes exports | Utilisateur | Exports en préparation, prêts, historique |
| E-16-08 · SIFA | Scolarité | Contrôles, anomalies, génération du fichier |
| E-16-09 · Comptabilité analytique | Comptable | Charges, clés de répartition, ventilation, contrôles, export |
| E-16-10 · Calendrier réglementaire | Direction, admin | Échéances, responsables, état |
| E-16-11 · Journal des exports | Admin | Qui a exporté quoi, quand |

### Parcours « préparer l'enquête SIFA »

1. Début janvier, le rappel du calendrier réglementaire arrive à la scolarité.
2. Elle ouvre l'écran SIFA : les apprentis présents au 31 décembre sont repris automatiquement.
3. Les anomalies sont listées et corrigées depuis les fiches concernées.
4. Le contrôle passe sans erreur ; le fichier est généré.
5. La scolarité le dépose sur la plateforme de collecte et marque l'échéance comme faite.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Indicateur | code, nom, définition, formule, source, découpages, unité, sens, seuil, origine (Scolaly ou école), version | utilisé par les cartes |
| Valeur pré-calculée | indicateur, période, découpage, valeur, heure de calcul | rafraîchie régulièrement |
| Tableau | nom, propriétaire, mise en page, partage, modèle d'origine | contient des cartes |
| Carte | tableau, type, indicateur, filtres, découpage, position | appartient à un tableau |
| Modèle d'export | source, colonnes, filtres, tri, format, propriétaire, partage | produit des exports |
| Export | définition, utilisateur, date, nombre de lignes, statut, fichier, expiration | journalisé |
| Déclaration réglementaire | type (SIFA, comptabilité analytique), exercice ou date d'observation, version du format, contrôles, fichier, statut | liée à une échéance |
| Clé de répartition | exercice, type de charge, base (heures, effectifs, surface), valeurs | utilisée par la comptabilité analytique |
| Échéance réglementaire | type, date, responsable, statut | commune ou propre à l'organisation |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Chiffre différent entre un tableau et un écran métier | Impossible par conception (mêmes règles) ; l'heure de calcul s'affiche et l'administrateur peut forcer un recalcul |
| Petit effectif sur une donnée sensible | Valeur masquée sous le seuil |
| Source d'un indicateur de l'école modifiée | L'indicateur est signalé « à revoir » et les tableaux concernés affichent un message |
| Export très volumineux | Préparé en tâche de fond, avec notification |
| Utilisateur qui perd un droit | Ses tableaux restent, mais n'affichent que ce qu'il peut voir ; les destinataires de ses partages gardent leurs propres droits |
| Format SIFA modifié | Nouvelle version de la table, contrôles adaptés ; les fichiers déjà produits restent dans l'historique |
| Charges manquantes pour la comptabilité analytique | Contrôle bloquant avec la liste des rubriques manquantes |
| École qui n'accorde pas le détail au groupe | Le groupe ne voit que les agrégats |

## 8. Critères d'acceptation

- [ ] Le tableau de direction d'une organisation de 2 000 apprenants s'affiche en moins de 2 secondes.
- [ ] Les indicateurs du catalogue donnent les mêmes valeurs que les écrans métier sur un jeu de test.
- [ ] Un administrateur crée et partage un tableau de 6 cartes en moins de 10 minutes, sans aide.
- [ ] Un export libre de 10 000 lignes et 20 colonnes est prêt en moins de 30 secondes ; un export de 200 000 lignes passe en tâche de fond.
- [ ] Aucune colonne non autorisée n'est proposée à un utilisateur (test par rôle).
- [ ] Le fichier SIFA d'un jeu de test passe les contrôles de format en vigueur.
- [ ] La direction de groupe n'accède à aucune donnée nominative d'une école qui ne l'a pas accordé.

## 9. Exigences propres au module

- **Performance** : valeurs pré-calculées en tâche de fond, sans ralentir les écrans métier ; un tableau s'affiche en moins de 2 secondes.
- **Cohérence** : une seule définition par indicateur, consultable par l'utilisateur (« comment ce chiffre est-il calculé ? »).
- **Sécurité et RGPD** : droits et périmètres appliqués côté serveur ; journal des exports de données personnelles ; masquage des petits effectifs.
- **Accessibilité** : chaque graphique a son équivalent en tableau, des couleurs lisibles par les daltoniens et une navigation au clavier.
- **Conformité** : formats SIFA et comptabilité analytique tenus dans des tables datées, mises à jour par Scolaly.

## 10. Décisions

| Sujet | Décision (02/10/2026) |
| --- | --- |
| Exports réglementaires | SIFA et comptabilité analytique des CFA inclus |
| Tableaux de bord | Prêts à l'emploi par rôle, et éditeur pour que l'école crée ses propres tableaux et indicateurs |
| Exports libres | Colonnes et filtres choisis, export Excel ou CSV |
| Envois automatiques | Non : consultation et exports lancés à la main |
| Groupe d'écoles | Indicateurs agrégés et comparaisons, sans données nominatives sauf accord de l'école |

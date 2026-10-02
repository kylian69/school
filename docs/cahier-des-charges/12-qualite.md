# Cahier des charges Scolaly — 12 · Qualité : Qualiopi, BPF, enquêtes

> Statut : **validé** le 01/10/2026.
> Document de travail (avec le schéma de la boucle qualité) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b
## 1. Objectif et périmètre

Ce module aide l'école à prouver sa qualité au quotidien. Il rassemble en continu les preuves Qualiopi tirées de l'activité réelle, prépare les audits, mesure la satisfaction par des enquêtes intégrées, traite les réclamations, pilote l'amélioration continue et produit le bilan pédagogique et financier (BPF). **Phase : V2.**

**Inclus :**

- référentiel national qualité (critères et indicateurs) tenu à jour, filtré selon les actions certifiées de l'école ;
- **coffre de preuves** alimenté automatiquement par les autres modules, complété par des dépôts manuels ;
- préparation d'audit : couverture par indicateur, alertes, dossier d'audit exporté, accès temporaire pour l'auditeur ;
- registre des réclamations et des aléas ; plan d'actions d'amélioration ;
- **enquêtes intégrées** (décision du 01/10/2026) : questionnaires, modèles, campagnes automatiques, résultats ;
- BPF pré-rempli à partir des données ;
- indicateurs de résultats à publier (satisfaction, réussite, insertion…).

**Exclus :**

- la certification elle-même, délivrée par un organisme certificateur accrédité ;
- enquêtes statistiques nationales sur les effectifs (SIFA) et autres exports réglementaires (module 16) ;
- référent handicap et suivi de l'accessibilité détaillés (module 17, V3) ;
- livret d'apprentissage et visites en entreprise (module 13), qui fournissent des preuves à ce module.

## 2. Acteurs et droits

Deux accès nouveaux : le **responsable qualité**, qui pilote le module, et l'**auditeur**, qui reçoit un accès en lecture limité dans le temps. Les répondants extérieurs (tuteurs, financeurs, anciens élèves) répondent par un lien personnel, sans compte.

| Action | Admin | Responsable qualité | Direction | Responsable pédagogique | Comptable | Répondant | Auditeur |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Paramétrer le référentiel et les indicateurs applicables | Oui | Oui | Lecture | Non | Non | Non | Non |
| Déposer ou relier une preuve | Oui | Oui | Oui | Son périmètre | Non | Non | Non |
| Consulter le coffre de preuves | Oui | Oui | Oui | Son périmètre | Non | Non | Lecture |
| Créer et lancer une enquête | Oui | Oui | Non | Ses formations | Non | Non | Non |
| Répondre à une enquête | Non | Non | Non | Non | Non | Oui | Non |
| Consulter les résultats d'enquête | Oui | Oui | Oui | Ses formations | Non | Non | Résultats agrégés |
| Déposer une réclamation | Oui | Oui | Oui | Oui | Non | Oui | Non |
| Traiter une réclamation | Oui | Oui | Oui | Si elle lui est confiée | Non | Non | Lecture |
| Préparer le BPF | Oui | Oui | Lecture | Non | Oui | Non | Non |

## 3. User stories

Le module compte 18 user stories, dont 14 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-12-01 | responsable qualité | voir pour chaque indicateur les preuves réunies et celles qui manquent | arriver serein à l'audit | Must |
| US-12-02 | responsable qualité | que les preuves issues de l'activité (programmes, émargements, évaluations, enquêtes…) se rattachent seules aux indicateurs | ne plus constituer de classeurs à la main | Must |
| US-12-03 | responsable qualité | déposer une preuve manuelle (veille, partenariat, formation de l'équipe) avec sa date de revue | compléter le dossier | Must |
| US-12-04 | responsable qualité | exporter un dossier d'audit classé par critère et par indicateur | le remettre à l'auditeur | Must |
| US-12-05 | responsable qualité | ouvrir à l'auditeur un accès en lecture limité dans le temps | éviter les envois de fichiers | Should |
| US-12-06 | responsable qualité | créer un questionnaire à partir d'un modèle et l'adapter | lancer une enquête en 5 minutes | Must |
| US-12-07 | responsable qualité | que les enquêtes partent seules en fin de module, en fin de formation et quelques mois après | ne jamais oublier une campagne | Must |
| US-12-08 | apprenant | répondre sur mon téléphone en 2 minutes, par un QR code en salle ou une notification | donner mon avis facilement | Must |
| US-12-09 | tuteur ou employeur | répondre par un lien, sans créer de compte | donner mon avis sur la formation de mon alternant | Must |
| US-12-10 | responsable pédagogique | voir les résultats par formation, module et intervenant, avec les commentaires | améliorer les cours | Must |
| US-12-11 | intervenant | voir les résultats agrégés de mes cours | progresser | Should |
| US-12-12 | apprenant | déposer une réclamation et suivre son traitement | être entendu | Must |
| US-12-13 | responsable qualité | suivre chaque réclamation jusqu'à sa réponse, dans les délais | tenir nos engagements | Must |
| US-12-14 | responsable qualité | relier enquêtes, réclamations et non-conformités à des actions suivies | montrer l'amélioration continue | Must |
| US-12-15 | comptable | obtenir un BPF pré-rempli et contrôlé | le déposer sans tableur | Must |
| US-12-16 | direction | publier les taux de satisfaction, de réussite et d'insertion par formation | répondre à l'obligation d'information et valoriser l'école | Must |
| US-12-17 | responsable qualité | être alerté des preuves périmées et des échéances d'audit | ne rien laisser glisser | Should |
| US-12-18 | responsable qualité | importer les résultats d'enquêtes passées | garder l'historique | Could |

## 4. Règles de gestion

Boucle qualité (schéma dans le document de travail) : l'activité de l'école alimente automatiquement le coffre de preuves ; les enquêtes et réclamations recueillent les avis ; l'audit puise dans le coffre ; avis et non-conformités deviennent des actions suivies, qui améliorent l'activité.

### Référentiel et périmètre

- **RG-12-01** : Scolaly tient le référentiel national qualité (critères, indicateurs, niveaux attendus, précisions propres à l'apprentissage) dans une table datée, mise à jour à chaque évolution officielle. L'historique est conservé pour relire un audit passé.
- **RG-12-02** : l'école déclare les catégories d'actions certifiées (actions de formation, apprentissage, VAE, bilan de compétences) ; les indicateurs qui ne la concernent pas sont masqués. Un indicateur peut être marqué « non applicable » avec une justification, quand le référentiel le permet.
- **RG-12-03** : chaque indicateur a un responsable et une date de revue. Son état est calculé : couvert, partiel, non couvert, preuve périmée.

### Coffre de preuves

- **RG-12-04** : les preuves automatiques sont rattachées aux indicateurs par une table de correspondance tenue par Scolaly et ajustable par l'école. Principales sources :

| Thème du référentiel | Preuve automatique | Module |
| --- | --- | --- |
| Information du public, résultats obtenus | fiches formation, indicateurs publiés (RG-12-20) | 02, 09, 12 |
| Objectifs, contenus, modalités d'évaluation | programmes, référentiel de compétences | 02 |
| Positionnement et adaptation à l'entrée | entretiens et tests d'admission | 09 |
| Suivi, prévention des abandons | assiduité, alertes d'absence, suivi des alternants | 03, 06 |
| Évaluation des acquis | évaluations, relevés, bulletins | 07 |
| Coordination avec l'entreprise | contrats, livret, visites | 10, 13 |
| Moyens et intervenants | emplois du temps, cahier de texte, qualifications des intervenants | 01, 04, 05 |
| Recueil des appréciations | campagnes d'enquêtes et résultats | 12 |
| Réclamations, amélioration continue | registre et plan d'actions | 12 |

- **RG-12-05** : une preuve automatique est un instantané daté (par exemple les émargements d'une promotion sur une période, ou les résultats d'une campagne close) : elle reste consultable même si la donnée source change ensuite. Les données personnelles sont réduites ou anonymisées dans le dossier d'audit quand l'indicateur le permet.
- **RG-12-06** : une preuve manuelle (document, lien ou note) est déposée avec ses indicateurs, la période couverte, son auteur et sa date de revue ; une alerte part avant l'échéance.

### Audits

- **RG-12-07** : l'école enregistre ses audits (initial, surveillance, renouvellement) : dates, organisme certificateur, auditeur, résultat et non-conformités (mineures ou majeures). Chaque non-conformité crée une action d'amélioration avec échéance.
- **RG-12-08** : le dossier d'audit s'exporte en archive classée par critère puis par indicateur, avec un index PDF qui liste les preuves de chaque indicateur, sur le périmètre choisi (organisation, établissement, formations, période).
- **RG-12-09** : un accès auditeur en lecture seule peut être ouvert pour une durée limitée (par défaut celle de l'audit). Il couvre le coffre de preuves et les résultats agrégés ; chaque consultation est journalisée.

### Enquêtes

- **RG-12-10** : l'éditeur propose les types de questions courants (choix unique ou multiple, échelle, NPS, matrice, texte libre, date) et une logique simple (afficher une question selon une réponse). Un questionnaire déjà diffusé n'est pas modifié : toute modification crée une nouvelle version, et les résultats restent comparables sur les questions communes.
- **RG-12-11** : Scolaly fournit une bibliothèque de modèles adaptables : satisfaction à chaud (fin de module, fin de formation), à froid (quelques mois après), entreprise et tuteur, intervenant, financeur, devenir des diplômés (insertion, poursuite d'études).
- **RG-12-12** : une campagne vise une population (promotion, formation, module, entreprises d'accueil, intervenants, financeurs, anciens élèves). Elle part à la main ou automatiquement sur un événement : fin d'un module (module 04), fin de formation, fin de formation + N mois, fin d'une période en entreprise. Des relances partent à intervalles paramétrables jusqu'à la clôture.
- **RG-12-13** : diffusion par email, notification de l'application et QR code projeté en salle, qui ouvre l'enquête de la séance (ce QR code ne vaut pas émargement). Les répondants extérieurs répondent par un lien personnel, sans compte. Un questionnaire court se remplit en moins de 2 minutes sur mobile.
- **RG-12-14** : l'anonymat se règle par campagne et s'affiche avant la première question :
  - *anonyme* : aucun lien n'est conservé entre une réponse et son auteur ; Scolaly sait seulement qui a répondu, pour arrêter les relances ;
  - *confidentiel* : le lien n'est visible que du responsable qualité ;
  - *nominatif* : annoncé au répondant.
- **RG-12-15** : un résultat n'est affiché pour un intervenant ou un petit groupe qu'à partir d'un nombre minimal de réponses (5 par défaut, paramétrable), pour protéger l'anonymat.
- **RG-12-16** : les résultats montrent le taux de réponse, les moyennes, les répartitions, le NPS, l'évolution entre campagnes, la comparaison entre formations et les commentaires (un commentaire déplacé peut être masqué, avec trace). Export en tableur et synthèse PDF ; les résultats d'une campagne close deviennent une preuve (RG-12-05).

### Réclamations et amélioration continue

- **RG-12-17** : une réclamation peut venir d'un apprenant, d'une entreprise, d'un financeur ou d'un intervenant (portail, formulaire public ou saisie par l'école). Elle a un type, une gravité, un responsable, un délai de réponse paramétrable, un statut (reçue, en cours, répondue, close) et la réponse apportée. Les aléas (séance annulée, salle indisponible, intervenant absent) sont enregistrés de la même façon.
- **RG-12-18** : le plan d'amélioration regroupe des actions issues des enquêtes, des réclamations, des non-conformités d'audit ou des propositions de l'équipe : source, responsable, échéance, statut, effet constaté. Un résultat d'enquête sous un seuil fixé par l'école propose la création d'une action.

### BPF

- **RG-12-19** : le BPF est pré-rempli pour l'exercice comptable paramétré à partir des données de Scolaly : stagiaires et heures par type de public, de financement et d'objectif (modules 01, 03, 06 et 10), produits par origine (module 11, ou saisie si le module est désactivé), formateurs et heures dispensées (modules 04 et 11). Le modèle du formulaire officiel est une table datée tenue par Scolaly. Les cases non calculables sont saisies ; des contrôles signalent les incohérences. L'école dépose le BPF sur le service en ligne de l'administration à partir de l'export.

### Indicateurs publiés

- **RG-12-20** : Scolaly calcule, par formation et par année, les indicateurs de résultats à publier (satisfaction, réussite à la certification, abandons, insertion ou poursuite d'études, ruptures de contrats en apprentissage), avec leur méthode, leur période et leur nombre de répondants. Les données nationales publiées pour l'école (InserJeunes) sont saisies ou importées. Les indicateurs s'affichent dans les fiches formation (module 09) et dans un encart intégrable au site de l'école.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-12-01 · Tableau de bord qualité | Responsable qualité, direction | Couverture des indicateurs, preuves périmées, prochaines échéances d'audit, réclamations ouvertes, taux de réponse et satisfaction |
| E-12-02 · Référentiel et indicateurs | Responsable qualité | Critères et indicateurs applicables, responsables, états, justifications de non-applicabilité |
| E-12-03 · Coffre de preuves | Responsable qualité, direction, responsable pédagogique, auditeur | Preuves par indicateur, filtres, aperçu, dépôt manuel, dates de revue |
| E-12-04 · Audits | Responsable qualité | Calendrier des audits, non-conformités, export du dossier, accès auditeur |
| E-12-05 · Éditeur de questionnaire | Responsable qualité, responsable pédagogique | Modèles, questions, logique, aperçu mobile, versions |
| E-12-06 · Campagnes | Responsable qualité, responsable pédagogique | Population, déclencheurs, anonymat, relances, suivi des réponses, QR code de séance |
| E-12-07 · Résultats d'enquête | Responsable qualité, direction, responsable pédagogique, intervenant (les siens) | Taux de réponse, graphiques, NPS, comparaisons, commentaires, export |
| E-12-08 · Répondre à une enquête | Répondant | Une question par écran sur mobile, progression, mode d'anonymat affiché, reprise possible |
| E-12-09 · Réclamations et plan d'actions | Responsable qualité, direction | Registre, délais, réponses, actions liées, avancement |
| E-12-10 · BPF | Comptable, responsable qualité | Formulaire pré-rempli, détail de chaque case, contrôles, saisies complémentaires, export |

### Parcours « de la fin d'un module à l'action d'amélioration »

1. Le dernier cours d'un module se termine : la campagne à chaud part automatiquement vers la promotion.
2. Les apprenants répondent sur mobile depuis la notification ou le QR code projeté ; les relances s'arrêtent pour ceux qui ont répondu.
3. À la clôture, les résultats sont disponibles et deviennent une preuve rattachée aux indicateurs concernés.
4. Une satisfaction sous le seuil propose une action d'amélioration, confiée au responsable pédagogique.
5. L'action menée et son effet sur la campagne suivante sont visibles dans le plan d'actions, prêts pour l'audit.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Référentiel qualité | version, critères, indicateurs, niveaux attendus, dates de validité | commun à toutes les organisations |
| Indicateur applicable | organisation, indicateur, applicable ou non, justification, responsable, date de revue, état | rattache les preuves |
| Preuve | type (automatique ou manuelle), source, période, fichier ou instantané, auteur, date de revue | liée à un ou plusieurs indicateurs |
| Audit | type, dates, organisme, auditeur, résultat, accès temporaire | contient des non-conformités |
| Questionnaire | titre, version, questions, logique, modèle d'origine | utilisé par des campagnes |
| Campagne | questionnaire, population, déclencheur, anonymat, dates, relances, seuil d'affichage | produit des réponses |
| Réponse | campagne, réponses aux questions, date, lien au répondant selon l'anonymat | agrégée dans les résultats |
| Réclamation ou aléa | auteur, type, gravité, responsable, délai, statut, réponse | peut créer une action |
| Action d'amélioration | source, description, responsable, échéance, statut, effet constaté | liée à une enquête, une réclamation ou une non-conformité |
| BPF | exercice, version du formulaire, valeurs calculées et saisies, contrôles, export | un par exercice et par organisation déclarante |
| Indicateur publié | formation, année, type, valeur, méthode, nombre de répondants, source | affiché dans les fiches formation |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Nouvelle version du référentiel qualité | Les indicateurs sont migrés ; les preuves sont rattachées aux nouveaux indicateurs quand la correspondance est connue, sinon signalées à revoir |
| Moins de réponses que le seuil pour un intervenant | Ses résultats ne s'affichent pas ; ils comptent dans les résultats de la formation |
| Questionnaire modifié en cours de campagne | Refusé ; une nouvelle version s'applique aux campagnes suivantes |
| Répondant qui ouvre l'enquête deux fois | Il reprend où il s'était arrêté ; une seule réponse est comptée |
| Ancien élève sans email valide | Il est exclu de la campagne et compté à part dans le taux de réponse |
| Réclamation qui dépasse son délai | Alerte au responsable et au responsable qualité, visible dans le tableau de bord |
| Module 11 désactivé | Les produits du BPF sont saisis ; le reste est calculé |
| Commentaire d'enquête injurieux ou nominatif | Masquable par le responsable qualité, avec trace et motif |

## 8. Critères d'acceptation

- [ ] Sur une organisation de démonstration d'une année, au moins 70 % des indicateurs applicables ont une preuve automatique.
- [ ] Le dossier d'audit d'une organisation de 500 apprenants s'exporte en moins de 5 minutes, classé par critère et indicateur, avec un index complet.
- [ ] Une campagne à chaud part automatiquement à la fin du dernier cours d'un module, sans action humaine.
- [ ] Un apprenant répond à un questionnaire de 8 questions en moins de 2 minutes sur mobile (test avec 5 apprenants).
- [ ] En mode anonyme, aucune donnée stockée ne permet de relier une réponse à son auteur (revue technique).
- [ ] Les résultats d'un intervenant ne s'affichent pas sous le seuil de réponses.
- [ ] Le BPF pré-rempli d'un jeu de test est identique au BPF calculé à la main par un comptable.
- [ ] Chaque réclamation a un statut, un responsable et une réponse datée avant d'être close.

## 9. Exigences propres au module

- **Conformité** : référentiel qualité, modèle de BPF et méthodes de calcul des indicateurs publiés sont datés, sourcés et tenus à jour par Scolaly, annoncés dans les notes de version.
- **Confidentialité** : anonymat réel des enquêtes anonymes (aucune jointure possible, y compris en base) ; seuil d'affichage ; journalisation des accès auditeur.
- **Accessibilité** : questionnaires conformes au niveau AA des règles d'accessibilité du cadre général, utilisables au clavier et avec un lecteur d'écran.
- **Performance** : 500 réponses reçues en même temps (QR code en amphi) sans ralentissement ; résultats d'une campagne de 2 000 réponses calculés en moins de 3 secondes.
- **Durée de conservation** : preuves et résultats conservés au moins sur deux cycles de certification, durée paramétrable.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Qualiopi | Les écoles cibles sont certifiées ; Scolaly réunit et classe les preuves pour l'audit |
| Enquêtes | Intégrées à Scolaly, à la place d'outils externes |

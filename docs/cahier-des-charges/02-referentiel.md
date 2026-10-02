# Cahier des charges Scolaly — 02 · Référentiel pédagogique

> Statut : **validé** le 01/10/2026.
> Document de travail : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objectif et périmètre

Le référentiel décrit ce que l'école enseigne et à qui. C'est la base dont dépendent l'EDT, l'émargement, les notes, les bulletins et l'alternance. Un responsable pédagogique doit pouvoir créer une formation complète avec sa maquette en moins de 30 minutes, ou la dupliquer de l'année précédente en 2 minutes. **Phase : MVP.**

**Inclus :**

- formations : diplôme ou titre, niveau, code RNCP ou RS, durée, modes (initial, apprentissage, professionnalisation, formation continue) ;
- maquettes versionnées : blocs de compétences → UE → modules, avec ECTS, coefficients et volumes horaires par type (CM, TD, TP, projet, e-learning) ;
- **règles de validation et de compensation paramétrables par formation** ;
- **référentiel de compétences et évaluation par compétences** (décision du 01/10/2026) ;
- **règles de notes particulières paramétrables par l'école** (décision du 01/10/2026) ;
- promotions (formation × année × établissement), groupes (TD, TP, options, langues) et inscriptions des apprenants ;
- affectation des intervenants aux modules, avec leurs heures prévues ;
- salles et ressources : capacité, équipements, accessibilité PMR ;
- duplication d'une maquette ou d'une promotion d'une année à l'autre.

**Exclus :**

- séances et emploi du temps (module 04) ;
- saisie des notes et calcul des résultats (module 07) : le référentiel fixe les règles, le module 07 les applique ;
- sessions de rattrapage (V2) ;
- parcours individualisés (dispenses, allègements) : le modèle de données les prévoit, l'interface vient en V2.

## 2. Acteurs et droits

| Action | Admin | Direction | Resp. pédagogique | Scolarité | Intervenant | Apprenant |
| --- | --- | --- | --- | --- | --- | --- |
| Créer ou modifier une formation et sa maquette | Oui | Lecture | Oui (ses formations) | Lecture | Lecture (ses modules) | Lecture (sa maquette) |
| Paramétrer les règles de validation et de compensation | Oui | Lecture | Oui (ses formations) | Lecture | Non | Lecture |
| Définir la bibliothèque de règles particulières et l'échelle de maîtrise | Oui | Lecture | Lecture | Non | Non | Non |
| Publier une version de maquette | Oui | Non | Oui (ses formations) | Non | Non | Non |
| Créer des promotions et des groupes | Oui | Non | Oui | Oui | Non | Non |
| Inscrire des apprenants et les répartir dans les groupes | Oui | Non | Oui | Oui | Non | Non |
| Affecter des intervenants aux modules | Oui | Non | Oui | Non | Lecture (ses affectations) | Non |
| Gérer les salles | Oui | Non | Non | Oui (son établissement) | Lecture | Non |

## 3. User stories

Le module compte 16 user stories, dont 13 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-02-01 | responsable pédagogique | créer une formation et construire sa maquette (blocs, UE, modules) dans un éditeur en arbre, avec les totaux d'heures et d'ECTS calculés en direct | vérifier qu'elle respecte le référentiel du diplôme | Must |
| US-02-02 | responsable pédagogique | importer une maquette depuis un fichier Excel | ne pas tout ressaisir | Must |
| US-02-03 | responsable pédagogique | choisir la règle de compensation et les seuils de validation de ma formation | que les résultats suivent le règlement des études | Must |
| US-02-04 | responsable pédagogique | dupliquer la maquette et les promotions de l'année précédente | préparer la rentrée en quelques minutes | Must |
| US-02-05 | responsable pédagogique | publier une nouvelle version de maquette sans modifier celle des promotions en cours | ne pas fausser les résultats déjà calculés | Must |
| US-02-06 | scolarité | créer les promotions d'une année et y inscrire les apprenants (à la main ou par import) avec leur statut | que chacun ait son EDT et ses notes | Must |
| US-02-07 | scolarité | répartir les apprenants dans les groupes TD / TP par glisser-déposer ou automatiquement (alphabétique, équilibré) | constituer les groupes rapidement | Must |
| US-02-08 | responsable pédagogique | affecter un ou plusieurs intervenants à chaque module avec un nombre d'heures | savoir qui enseigne quoi et suivre les heures | Must |
| US-02-09 | scolarité | décrire les salles (capacité, équipements, PMR) | que l'EDT propose des salles adaptées | Must |
| US-02-10 | apprenant | consulter ma maquette (UE, modules, ECTS, coefficients) | savoir comment je suis évalué | Must |
| US-02-11 | intervenant | voir mes modules, mes groupes et mes heures prévues | préparer mon année | Must |
| US-02-12 | responsable pédagogique | rattacher des groupes transversaux à plusieurs promotions (ex. anglais niveau B2) | mutualiser des cours | Should |
| US-02-13 | responsable pédagogique | gérer des options (l'apprenant suit une UE parmi plusieurs) | proposer des parcours au choix | Should |
| US-02-14 | direction | comparer les maquettes de deux années | suivre les évolutions de l'offre | Could |
| US-02-15 | responsable pédagogique | décrire le référentiel de compétences d'un titre RNCP et le rattacher aux modules | évaluer et valider les blocs par compétences | Must |
| US-02-16 | administrateur | paramétrer les règles de notes propres à mon école (bonus, points de jury, plafonds, pondérations) | que les résultats respectent notre règlement sans calcul à la main | Must |

## 4. Règles de gestion

### Formations et maquettes

- **RG-02-01** : une formation appartient à une organisation et peut être dispensée dans un ou plusieurs établissements. Elle porte un intitulé, un type (BTS, Bachelor, Master, titre RNCP, CQP, autre), un niveau (5 à 8), un code RNCP ou RS facultatif, une durée en années et les modes autorisés (initial, apprentissage, professionnalisation, formation continue).
- **RG-02-02** : une maquette est un arbre à 3 niveaux au plus : bloc de compétences (facultatif) → UE → module. Chaque UE porte des ECTS et un coefficient ; chaque module porte un coefficient et des volumes horaires par type (CM, TD, TP, projet, e-learning).
- **RG-02-03** : les totaux (heures par type, ECTS par semestre et par année) sont calculés en direct. Un avertissement s'affiche si un semestre ne totalise pas 30 ECTS, sans bloquer (certaines formations n'ont pas d'ECTS).
- **RG-02-04** : une maquette a des versions. Une version publiée et utilisée par une promotion n'est plus modifiable sur les coefficients, ECTS et règles ; les libellés et volumes horaires restent corrigeables, avec une trace. Toute autre modification crée une nouvelle version.
- **RG-02-05** : chaque promotion est liée à une version de maquette précise. Changer de version en cours d'année demande un droit spécifique et recalcule les résultats, après confirmation.
- **RG-02-06** : chaque module est rattaché à une période (semestre ou année). Un module peut être commun à plusieurs formations (mutualisation), avec un coefficient propre à chacune.

### Validation et compensation (paramétrables par formation)

- **RG-02-07** : chaque formation choisit un mode de validation parmi trois :

| Mode | Principe | Usage typique |
| --- | --- | --- |
| LMD (compensation) | Les modules se compensent dans l'UE ; les UE se compensent dans le semestre. Un semestre validé donne toutes ses UE et ses 30 ECTS. Option : compensation entre les deux semestres de l'année. | Bachelor, Master, licence |
| Blocs de compétences (RNCP) | Chaque bloc est validé séparément, sans compensation entre blocs. Le titre est obtenu quand tous les blocs sont validés. Les blocs acquis restent acquis. | Titres RNCP, certifications professionnelles |
| Sans compensation | Chaque UE doit être validée séparément. | Formations au règlement strict |

- **RG-02-08** : paramètres communs aux trois modes, avec leurs valeurs par défaut :
  - seuil de validation : 10 / 20 ;
  - note éliminatoire : aucune par défaut ; si elle est fixée (ex. 6 / 20), une note inférieure dans un module empêche la compensation de son UE ou de son bloc ;
  - compensation entre modules d'une UE : oui ;
  - arrondi des moyennes : au centième, sans arrondi favorable ;
  - mentions : Assez bien à 12, Bien à 14, Très bien à 16.
- **RG-02-09** : les règles appartiennent à la version de maquette (RG-02-04). Le règlement des études en PDF peut y être joint et consulté par les apprenants.
- **RG-02-10** : un écran de simulation permet de saisir des notes fictives et de voir le résultat (moyennes, UE ou blocs acquis, ECTS). Il sert à vérifier le paramétrage avant la rentrée.
- **RG-02-11** : les sessions de rattrapage arrivent en V2. Au MVP, une note de rattrapage se saisit en remplacement de la note initiale, et la note initiale reste dans l'historique (module 07).

### Promotions, groupes et inscriptions

- **RG-02-12** : une promotion = une formation × une année de formation (1re, 2e…) × une année scolaire × un établissement. Elle a ses dates de début et de fin, qui peuvent déborder l'année scolaire (RG-00-03), et un rythme d'alternance facultatif (module 03).
- **RG-02-13** : une inscription relie un apprenant à une promotion, avec un statut (initial, apprenti, professionnalisation, formation continue), des dates d'entrée et de sortie, et un état (pré-inscrit, inscrit, démissionnaire, exclu, diplômé). Un apprenant peut être inscrit à plusieurs promotions (double cursus).
- **RG-02-14** : un groupe appartient à une promotion, ou à plusieurs s'il est transversal. Un apprenant peut appartenir à plusieurs groupes de types différents (un TD, un TP, une option), mais à un seul groupe d'un même type par promotion.
- **RG-02-15** : une option est un ensemble d'UE au choix. L'apprenant affecté à une option ne suit et n'est évalué que sur les UE de cette option.
- **RG-02-16** : la répartition automatique dans les groupes propose trois méthodes : ordre alphabétique, équilibrage des effectifs, ou équilibrage selon un critère (statut, option). Elle respecte la capacité du groupe et peut être retouchée à la main.
- **RG-02-17** : une sortie en cours d'année (démission, rupture, exclusion) ferme l'inscription à la date de sortie. L'apprenant disparaît des listes d'appel futures, mais son historique (notes, présences) reste consultable.

### Intervenants et salles

- **RG-02-18** : une affectation relie un intervenant, un module, un ou plusieurs groupes et un nombre d'heures prévues par type. Le total affecté est comparé au volume de la maquette ; tout écart est signalé.
- **RG-02-19** : une salle appartient à un établissement et porte un nom, une capacité, un type (cours, TP informatique, laboratoire, amphithéâtre), des équipements, l'accessibilité PMR et un statut (disponible ou fermée). Une salle virtuelle (à distance) existe par défaut.
- **RG-02-20** : la duplication d'une année copie les formations, la dernière version de maquette, les promotions (année N+1), les groupes vides et les affectations d'intervenants. Les inscriptions ne sont pas copiées, sauf le passage en année supérieure, proposé à part pour les apprenants admis.

### Évaluation par compétences (MVP)

- **RG-02-21** : une formation peut décrire un référentiel de compétences. Chaque bloc contient des compétences (code, intitulé), et chaque compétence peut avoir des critères d'évaluation. Le référentiel s'importe depuis Excel ou se reprend de la fiche RNCP (saisie assistée).
- **RG-02-22** : l'école définit une échelle de niveaux de maîtrise. Par défaut, elle en compte 4 : non acquis, en cours d'acquisition, acquis, expert. Chaque niveau a un libellé, une couleur et, si besoin, une valeur numérique pour les conversions.
- **RG-02-23** : chaque compétence est rattachée à un ou plusieurs modules. Une évaluation (module 07) peut porter des notes, des compétences, ou les deux.
- **RG-02-24** : chaque formation choisit son mode d'évaluation : notes seules, compétences seules, ou les deux. La validation d'un bloc peut se faire par les notes (RG-02-07), par les compétences (toutes les compétences du bloc au niveau « acquis » ou plus, par défaut), ou par les deux à la fois.
- **RG-02-25** : le niveau retenu pour une compétence évaluée plusieurs fois se calcule selon une règle choisie par formation : dernière évaluation (par défaut), meilleur niveau, ou niveau le plus fréquent. Le responsable pédagogique peut forcer un niveau avec un commentaire, et le forçage est tracé.

### Règles de notes particulières (paramétrables par l'école)

- **RG-02-26** : l'école définit une bibliothèque de règles particulières, activables par formation (et surchargeables par formation) :

| Règle | Exemple | Paramètres |
| --- | --- | --- |
| Bonus ou malus | +0,5 point sur la moyenne générale pour l'engagement associatif | Cible (moyenne générale, UE, module), valeur en points ou en %, plafond |
| UE ou module bonus | Sport : seuls les points au-dessus de 10 comptent, divisés par 20 | Seuil, diviseur, cible |
| Points de jury | Le jury ajoute jusqu'à 0,3 point pour atteindre un seuil | Maximum par apprenant, seuils concernés, motif obligatoire |
| Note plafonnée ou plancher | Une note de rattrapage est plafonnée à 10 | Type d'évaluation concerné, valeur |
| Pondération par type d'évaluation | Contrôle continu 40 %, examen final 60 % | Types et poids |
| Pénalité d'absence | Absence non justifiée à une évaluation = 0 | Type d'absence, note attribuée |

- **RG-02-27** : les règles particulières sont appliquées dans un ordre fixe et affiché : pondérations, plafonds et planchers, pénalités, bonus, puis points de jury. Elles sont prises en compte par le simulateur (RG-02-10) et expliquées en clair à l'apprenant sur son relevé (« +0,5 : bonus engagement »).
- **RG-02-28** : comme les autres règles, les règles particulières appartiennent à la version de maquette (RG-02-04). Une modification après publication crée une nouvelle version.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-02-01 · Catalogue des formations | Resp. pédagogique, scolarité, direction | Liste filtrable (type, niveau, mode, établissement), effectifs de l'année, accès à chaque formation |
| E-02-02 · Éditeur de maquette | Resp. pédagogique | Arbre blocs → UE → modules, édition en ligne, totaux en direct, glisser-déposer pour réorganiser, import Excel, historique des versions |
| E-02-03 · Règles de validation | Resp. pédagogique | Choix du mode (RG-02-07), paramètres (RG-02-08), règles particulières activées (RG-02-26), mode d'évaluation (RG-02-24), règlement PDF, simulateur (RG-02-10) |
| E-02-04 · Promotions de l'année | Scolarité, resp. pédagogique | Promotions par formation et établissement, effectifs par statut, bouton « Préparer l'année suivante » |
| E-02-05 · Promotion | Scolarité, resp. pédagogique | Onglets Apprenants (inscriptions, statuts), Groupes (répartition par glisser-déposer), Intervenants (affectations et écarts d'heures) |
| E-02-06 · Salles | Scolarité, administrateur | Liste des salles par établissement, filtres par capacité et équipement |
| E-02-07 · Ma formation | Apprenant | Maquette lisible (UE, modules, ECTS, coefficients, compétences), règles de validation expliquées en clair, règlement PDF |
| E-02-08 · Mes enseignements | Intervenant | Modules, groupes et heures prévues, avec les heures déjà réalisées (module 04) |
| E-02-09 · Référentiel de compétences | Resp. pédagogique | Blocs, compétences, critères, rattachement aux modules, import Excel |
| E-02-10 · Règles de l'école | Administrateur | Échelle de maîtrise, bibliothèque de règles particulières |

### Parcours « préparer la rentrée » (responsable pédagogique)

1. Depuis E-02-04, il clique sur « Préparer l'année suivante » et coche les formations à reconduire.
2. Il vérifie l'aperçu (formations, versions de maquette, promotions, groupes, affectations) et valide (RG-02-20).
3. Il ajuste les maquettes qui changent : une nouvelle version est créée (RG-02-04).
4. La scolarité passe les apprenants admis en année supérieure et importe les nouveaux inscrits.
5. Elle répartit les apprenants dans les groupes.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Formation | intitulé, type, niveau, code RNCP ou RS, durée, modes autorisés, statut | a des versions de maquette ; dispensée dans des établissements |
| Version de maquette | numéro, statut (brouillon / publiée / archivée), mode de validation et paramètres, mode d'évaluation, règles particulières activées, règlement PDF | appartient à une formation ; contient des blocs, UE et modules |
| Bloc de compétences | code, intitulé, ordre | contient des UE et des compétences |
| UE | code, intitulé, période, ECTS, coefficient, option (facultatif) | appartient à une version (et éventuellement à un bloc) ; contient des modules |
| Module | code, intitulé, coefficient, heures CM / TD / TP / projet / e-learning | appartient à une UE ; peut être mutualisé |
| Compétence | code, intitulé, critères d'évaluation | appartient à un bloc ; rattachée à des modules |
| Échelle de maîtrise | niveaux (libellé, couleur, valeur, ordre) | définie par l'organisation ; utilisée par les formations |
| Règle particulière | type (bonus, UE bonus, points de jury, plafond, pondération, pénalité), paramètres, ordre | bibliothèque de l'organisation ; activée dans une version de maquette |
| Promotion | formation, année de formation, année scolaire, établissement, dates, version de maquette, rythme d'alternance | contient des inscriptions et des groupes |
| Inscription | apprenant, promotion, statut, état, date d'entrée, date de sortie, motif de sortie, option | relie une personne à une promotion ; a des appartenances à des groupes |
| Groupe | nom, type (TD, TP, option, langue, autre), capacité, transversal (oui / non) | appartient à une ou plusieurs promotions ; a des membres |
| Affectation | intervenant, module, groupes, heures prévues par type | relie une personne à un module |
| Salle | nom, établissement, capacité, type, équipements, PMR, statut | utilisée par les séances (module 04) |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Modification d'un coefficient sur une maquette déjà notée | Refusée sur la version publiée ; l'écran propose de créer une nouvelle version (RG-02-04) |
| Suppression d'un module qui a des séances ou des notes | Refusée ; seul l'archivage est possible |
| Apprenant changé de groupe en cours d'année | Effet à la date choisie : les séances passées restent sur l'ancien groupe, les futures passent sur le nouveau |
| Statut changé en cours d'année (initial → apprenti) | Nouvelle période de statut dans l'inscription, à la date de début du contrat ; l'historique d'assiduité est découpé en conséquence |
| Import de maquette avec une UE sans module | Avertissement, l'UE est créée vide et signalée |
| Groupe plein | La répartition refuse d'ajouter au-delà de la capacité, sauf forçage par un responsable, tracé |
| Bloc validé par les notes mais pas par les compétences (mode « les deux ») | Bloc non validé ; le relevé indique la ou les compétences manquantes |

## 8. Critères d'acceptation

- [ ] Un responsable pédagogique crée une formation de 2 semestres, 8 UE et 24 modules en moins de 30 minutes, ou l'importe d'un Excel en moins de 5 minutes.
- [ ] Les trois modes de validation donnent les résultats attendus sur un jeu de 20 cas de test définis avec une école pilote, via le simulateur.
- [ ] Chaque règle particulière de RG-02-26 donne le résultat attendu sur un cas de test, seule et combinée aux autres dans l'ordre de RG-02-27.
- [ ] Un bloc évalué par compétences est validé quand toutes ses compétences atteignent « acquis », et pas avant.
- [ ] Modifier une maquette utilisée crée une nouvelle version et ne change aucune moyenne déjà calculée sur l'ancienne.
- [ ] La préparation de l'année suivante reconduit 10 formations en moins de 2 minutes.
- [ ] La répartition automatique de 120 apprenants en 4 groupes équilibrés prend moins d'une seconde.
- [ ] Un apprenant voit sa maquette et les règles de validation expliquées en clair sur mobile.

## 9. Exigences propres au module

- **Performance** : l'éditeur de maquette reste fluide (moins de 100 ms par action) jusqu'à 200 modules.
- **Traçabilité** : toute modification de maquette, de règle ou d'inscription est journalisée (RG-01-22).
- **Calcul** : le moteur de calcul des résultats est le même pour le simulateur et pour les bulletins (module 07). Il est couvert par des tests automatisés sur chaque mode et chaque règle particulière.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Évaluation par compétences | Dès le MVP (RG-02-21 à RG-02-25) |
| Règles de notes particulières | Paramétrables par chaque école, activables par formation (RG-02-26 à RG-02-28) |
| Sessions de rattrapage | En V2 ; au MVP, la note de rattrapage remplace la note initiale (RG-02-11) |

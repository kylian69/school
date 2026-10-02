# Cahier des charges Scolaly — 07 · Évaluations, notes, relevés et bulletins

> Statut : **validé** le 01/10/2026.
> Document de travail : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objectif et périmètre

Ce module transforme les évaluations en résultats fiables et en documents officiels. L'intervenant saisit ses notes et ses niveaux de compétence aussi vite que dans un tableur. Scolaly calcule les moyennes, ECTS et blocs validés selon les règles de la formation (module 02), et produit des bulletins validés et signés pour toute une promotion en quelques minutes. **Phase : MVP.**

**Inclus :**

- évaluations : type, date, coefficient, barème, notes et / ou compétences ;
- saisie de type tableur, import Excel, notes spéciales (absent, absent justifié, dispensé, non rendu) ;
- **évaluation par compétences** (décision du 01/10/2026) ;
- moteur de calcul unique : modes de validation, règles particulières, compétences ;
- rattrapage par remplacement de note (sessions de rattrapage en V2) ;
- appréciations par module et appréciation générale ;
- **circuit de validation paramétrable** des bulletins (décision du 01/10/2026) ;
- bulletins par période, relevés de notes, attestations de réussite et de compétences, en PDF ;
- publication aux apprenants et aux tuteurs (selon l'option RG-00-14).

**Exclus :**

- jurys, procès-verbaux et diplômes (module 14, V2) ;
- sessions de rattrapage et examens (modules 14 et 15, V2) ;
- dépôt de copies en ligne (module 15, V2).

## 2. Acteurs et droits

| Action | Admin | Direction | Resp. pédagogique | Scolarité | Intervenant | Apprenant | Tuteur |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Créer une évaluation | Non | Non | Oui | Non | Oui (ses modules) | Non | Non |
| Saisir ou modifier des notes et niveaux | Non | Non | Oui | Non | Oui (ses évaluations, jusqu'à la clôture) | Non | Non |
| Saisir les appréciations | Non | Non | Oui (générale) | Non | Oui (ses modules) | Non | Non |
| Vérifier les bulletins (étape 3) | Non | Non | Oui | Lecture | Non | Non | Non |
| Valider et signer (étape 4) | Non | Oui | Si l'école le paramètre | Non | Non | Non | Non |
| Publier | Non | Oui | Si l'école le paramètre | Oui | Non | Non | Non |
| Corriger après publication | Non | Oui | Oui (avec motif) | Non | Non | Non | Non |
| Consulter les notes | Tout | Tout | Ses formations | Son établissement | Ses évaluations | Les siennes, publiées | Ses alternants, si l'option est activée |
| Paramétrer le circuit et les modèles PDF | Oui | Non | Non | Non | Non | Non | Non |

## 3. User stories

Le module compte 16 user stories, dont 13 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-07-01 | intervenant | créer une évaluation en 3 champs (intitulé, date, coefficient) dans mon module | noter rapidement | Must |
| US-07-02 | intervenant | saisir les notes au clavier dans un tableau, ou les coller depuis Excel | saisir 30 notes en moins de 2 minutes | Must |
| US-07-03 | intervenant | évaluer des compétences par niveau (non acquis → expert) pour chaque apprenant | suivre les acquis d'un titre RNCP | Must |
| US-07-04 | intervenant | voir la moyenne, la répartition et les notes manquantes de mon évaluation | vérifier ma saisie | Must |
| US-07-05 | intervenant | saisir mes appréciations avec des phrases types | gagner du temps sur les bulletins | Must |
| US-07-06 | responsable pédagogique | voir l'avancement de la saisie (évaluations, notes manquantes, appréciations) par module | relancer avant la date de clôture | Must |
| US-07-07 | responsable pédagogique | relire les bulletins d'une promotion, signaler les anomalies et ajouter l'appréciation générale | garantir des bulletins justes | Must |
| US-07-08 | direction | valider et signer les bulletins d'une promotion en une action | publier sans signer 200 documents un par un | Must |
| US-07-09 | apprenant | voir mes notes au fil de l'eau, mes moyennes, mes ECTS et mes compétences, avec les règles expliquées | comprendre où j'en suis | Must |
| US-07-10 | apprenant | télécharger mon bulletin, mon relevé de notes et mon attestation de réussite en PDF | les fournir à une entreprise ou une autre école | Must |
| US-07-11 | scolarité | générer en masse les bulletins d'une promotion | les imprimer ou les envoyer | Must |
| US-07-12 | administrateur | paramétrer les étapes du circuit de validation et les modèles PDF | coller à notre organisation | Must |
| US-07-13 | responsable pédagogique | saisir une note de rattrapage qui remplace la note initiale, en gardant l'historique | gérer les rattrapages au MVP | Must |
| US-07-14 | tuteur | voir les résultats de mon alternant, si l'école l'autorise | suivre sa réussite | Should |
| US-07-15 | intervenant | importer des notes depuis un fichier Excel ou un export de quiz | ne pas ressaisir | Should |
| US-07-16 | apprenant | être notifié quand une note est publiée | ne pas vérifier sans cesse | Could |

## 4. Règles de gestion

### Évaluations et saisie

- **RG-07-01** : une évaluation appartient à un module et à une période. Elle porte un intitulé, une date, un type (contrôle continu, partiel, examen final, projet, oral, TP, rattrapage), un coefficient, un barème (sur 20 par défaut, ou autre valeur ramenée sur 20), les groupes concernés, et un contenu : note, compétences, ou les deux (RG-02-24). Elle peut être liée à une séance d'examen (module 04).
- **RG-07-02** : la saisie se fait dans un tableau apprenants × évaluations : navigation au clavier, collage depuis Excel, sauvegarde automatique à chaque cellule, annulation. Une valeur hors barème est refusée immédiatement.
- **RG-07-03** : notes spéciales : ABS (absent non justifié), ABJ (absent justifié), DISP (dispensé), NR (non rendu). Leur effet sur la moyenne est paramétré par la formation. Par défaut : ABS et NR comptent 0, ABJ et DISP sont neutralisées (l'évaluation est exclue du calcul pour cet apprenant). Une absence enregistrée à l'appel d'une séance d'examen propose automatiquement ABS ou ABJ.
- **RG-07-04** : les notes sont visibles par l'apprenant au fil de l'eau (option par défaut, décision du 01/10/2026) ou seulement à la publication du bulletin, réglable par l'école puis par formation. Une note n'est visible qu'une fois l'évaluation « publiée » par l'intervenant.
- **RG-07-05** : la saisie d'une période est ouverte jusqu'à une date de clôture fixée par le responsable pédagogique. Après cette date, seuls le responsable pédagogique et la direction peuvent modifier, avec un motif.

### Compétences

- **RG-07-06** : pour une évaluation par compétences, l'intervenant choisit les compétences évaluées (parmi celles du module, RG-02-23) et attribue à chaque apprenant un niveau de l'échelle de l'école (RG-02-22), avec un commentaire facultatif.
- **RG-07-07** : le niveau retenu par compétence et la validation des blocs suivent RG-02-24 et RG-02-25. L'apprenant voit pour chaque compétence son niveau actuel, son historique et les évaluations qui l'ont mesurée.

### Calcul des résultats

- **RG-07-08** : un seul moteur de calcul sert au simulateur (RG-02-10), à l'affichage en direct et aux bulletins. Il applique, dans l'ordre : notes spéciales, pondérations et règles particulières (RG-02-27), moyennes de module, moyennes d'UE ou de bloc, compensation selon le mode (RG-02-07), ECTS, compétences, mentions.
- **RG-07-09** : le calcul est déterministe et explicable. Pour chaque moyenne, Scolaly affiche le détail du calcul (notes, coefficients, règles appliquées) à la pédagogie, et une version simplifiée à l'apprenant.
- **RG-07-10** : les résultats sont recalculés à chaque modification de note, en moins d'une seconde pour une promotion de 200 apprenants. Les rangs et les moyennes de groupe (minimum, maximum, moyenne) sont calculés. L'affichage du rang est désactivé par défaut et activable par l'école.
- **RG-07-11** : rattrapage au MVP : le responsable pédagogique saisit une note de rattrapage qui remplace la note initiale dans le calcul, éventuellement plafonnée (RG-02-26). La note initiale reste visible dans l'historique et sur le relevé détaillé avec la mention « remplacée ».

### Circuit de validation des bulletins (paramétrable)

- **RG-07-12** : le circuit par défaut compte 5 étapes :
  1. *Saisie* : les intervenants saisissent notes, niveaux et appréciations jusqu'à la date de clôture.
  2. *Clôture* : la saisie est fermée, et Scolaly liste les anomalies (notes manquantes, appréciations vides, écarts inhabituels).
  3. *Vérification* : le responsable pédagogique relit, corrige si besoin et ajoute l'appréciation générale.
  4. *Validation et signature* : la direction valide la promotion en une action. Sa signature est apposée sur tous les bulletins (image de signature et validation horodatée, comme RG-06-13).
  5. *Publication* : les bulletins deviennent visibles par les apprenants, et par les tuteurs si l'option est activée, avec une notification.
- **RG-07-13** : l'école peut retirer les étapes 3 ou 4, confier la signature au responsable pédagogique, ou ajouter une étape de conseil de classe (préparation des jurys en V2). Le circuit est défini par organisation et peut être surchargé par formation.
- **RG-07-14** : chaque passage d'étape est tracé (qui, quand). Un retour en arrière (par exemple de la validation vers la vérification) est possible avec un motif, tant que la publication n'a pas eu lieu.
- **RG-07-15** : après publication, un bulletin est figé. Une correction crée une nouvelle version (numéro, date, motif), notifie l'apprenant et conserve l'ancienne version.

### Documents

- **RG-07-16** : documents générés en PDF, aux couleurs de l'école (UI-04) :

| Document | Contenu | Quand |
| --- | --- | --- |
| Bulletin de période | Notes et moyennes par module et UE ou bloc, compétences, ECTS, moyennes du groupe, appréciations, assiduité de la période (absences justifiées ou non), décision éventuelle, signature | À la publication |
| Relevé de notes | Toutes les évaluations, notes et moyennes de l'année, ECTS acquis | À la demande, après publication |
| Attestation de réussite | UE, blocs ou année validés, ECTS, mention | Après validation de l'année |
| Attestation de compétences | Compétences et niveaux atteints, par bloc | À la demande, après publication |

- **RG-07-17** : chaque document porte un QR code de vérification. Scanné par un tiers, il ouvre une page publique qui confirme l'authenticité (école, apprenant, date, empreinte), sans afficher les notes.
- **RG-07-18** : la génération en masse se fait en tâche de fond : 500 bulletins en moins de 2 minutes (objectif du module 00), livrés en ZIP ou envoyés individuellement dans l'espace de chaque apprenant.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-07-01 · Carnet de notes du module | Intervenant, resp. pédagogique | Tableau apprenants × évaluations, saisie au clavier, statistiques par colonne, bouton « Publier l'évaluation », import Excel |
| E-07-02 · Grille de compétences | Intervenant | Tableau apprenants × compétences, niveaux en couleur choisis en un clic, commentaires |
| E-07-03 · Appréciations | Intervenant, resp. pédagogique | Une ligne par apprenant avec sa moyenne et son assiduité en rappel, phrases types, compteur de caractères |
| E-07-04 · Suivi de la saisie | Resp. pédagogique | Avancement par module et par intervenant, anomalies, bouton « Relancer », date de clôture |
| E-07-05 · Circuit des bulletins | Resp. pédagogique, direction, scolarité | Étape en cours par promotion, aperçu des bulletins page par page, anomalies, boutons de passage d'étape |
| E-07-06 · Mes résultats | Apprenant ; tuteur si l'option est activée | Moyennes par UE ou bloc, détail des notes, compétences, ECTS, explication des règles, documents PDF |
| E-07-07 · Paramètres des résultats | Administrateur | Circuit de validation, modèles PDF, visibilité des notes et des rangs, phrases types |
| E-07-08 · Vérification d'un document (page publique) | Tout tiers | Authenticité d'un document scanné par son QR code |

### Parcours « bulletins du semestre »

1. Le responsable pédagogique fixe la date de clôture ; Scolaly relance automatiquement les intervenants 7 jours et 2 jours avant.
2. À la clôture, il traite la liste d'anomalies dans E-07-05, puis rédige les appréciations générales.
3. Il passe la promotion à l'étape « Validation » : la direction est notifiée.
4. La direction feuillette l'aperçu, valide et signe en une action.
5. La scolarité (ou la direction) publie : chaque apprenant reçoit son bulletin dans son espace et une notification.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Évaluation | module, période, intitulé, date, type, coefficient, barème, contenu (note / compétences), publiée (oui / non) | a des notes et des niveaux ; liée éventuellement à une séance |
| Note | apprenant, évaluation, valeur ou note spéciale, commentaire, remplacée par (rattrapage) | historisée |
| Niveau de compétence | apprenant, évaluation, compétence, niveau, commentaire | historisé |
| Résultat calculé | inscription, période, objet (module, UE, bloc, période, année), moyenne, acquis, ECTS, mention, rang, détail du calcul | recalculé par le moteur |
| Appréciation | inscription, période, module ou générale, auteur, texte | apparaît sur le bulletin |
| Circuit de validation | étapes, rôles autorisés par étape | par organisation, surchargeable par formation |
| Campagne de bulletins | promotion, période, étape, historique des passages, date de clôture | contient des bulletins |
| Bulletin / document | type, apprenant, version, PDF, empreinte, signataire, date de publication, code de vérification | appartient à une campagne ou est généré à la demande |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Deux intervenants saisissent dans la même évaluation en même temps | Mise à jour en direct cellule par cellule ; en cas de conflit sur la même cellule, la dernière saisie gagne et l'autre est avertie |
| Apprenant arrivé en cours de période | Les évaluations antérieures à son arrivée sont neutralisées par défaut (« non inscrit ») |
| Apprenant sorti en cours de période | Bulletin généré sur demande avec la mention « sorti le … » |
| Module sans aucune note à la clôture | Anomalie bloquante pour le passage à la validation, sauf neutralisation explicite du module |
| Correction d'une note après publication | Nouvelle version du bulletin (RG-07-15) ; l'apprenant est notifié |
| Appréciation trop longue pour le modèle PDF | Limite de caractères affichée pendant la saisie (300 par défaut) |

## 8. Critères d'acceptation

- [ ] Un intervenant saisit 30 notes au clavier en moins de 2 minutes, ou les colle depuis Excel en 10 secondes.
- [ ] Le moteur de calcul donne le résultat attendu sur la totalité des cas de test du module 02 (modes, règles particulières, compétences, notes spéciales), avec 100 % de couverture des règles par des tests automatisés.
- [ ] Le recalcul d'une promotion de 200 apprenants après une modification prend moins d'une seconde.
- [ ] Le circuit par défaut fonctionne de bout en bout ; un circuit simplifié à 3 étapes fonctionne aussi.
- [ ] 500 bulletins signés sont générés en moins de 2 minutes.
- [ ] Le QR code d'un bulletin ouvre une page qui confirme son authenticité sans afficher les notes ; un PDF modifié est détecté comme non conforme.
- [ ] Aucune note non publiée n'est visible d'un apprenant ou d'un tuteur (test automatisé).

## 9. Exigences propres au module

- **Exactitude** : le moteur de calcul est isolé, versionné et couvert par des tests. Toute évolution du moteur est validée par la non-régression de tous les jeux de test des écoles.
- **Traçabilité** : chaque saisie, modification de note et passage d'étape est journalisé (RG-01-22).
- **Confidentialité** : un apprenant ne voit jamais les notes d'un autre ; seules les statistiques de groupe sont affichées, et seulement si le groupe compte au moins 5 apprenants.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Évaluation par compétences | Dès le MVP |
| Règles particulières | Paramétrables par l'école (module 02) |
| Circuit de validation | Paramétrable ; par défaut vérification par le responsable pédagogique, puis validation et signature par la direction |
| Rattrapage | Remplacement de note au MVP ; sessions en V2 |
| Visibilité des notes pour l'apprenant | Dès la publication de l'évaluation par défaut ; l'école peut choisir « à la publication du bulletin », pour toute l'organisation ou par formation (RG-07-04) |

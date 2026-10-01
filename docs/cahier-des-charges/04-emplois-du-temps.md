# Cahier des charges Scolaly — 04 · Calendrier et emplois du temps

> Statut : **validé** le 01/10/2026.
> Document de travail : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objectif et périmètre

Ce module produit l'emploi du temps de chaque apprenant, intervenant et salle, sans conflit, et prévient tout de suite les personnes concernées quand il change. Une école qui a déjà son EDT dans un autre outil l'importe, puis le fait vivre dans Scolaly. L'EDT est aussi la source des listes d'appel (module 06) et des heures réalisées (module 03). **Phase : MVP.**

**Inclus :**

- séances : création unitaire ou récurrente, par glisser-déposer sur une grille semaine ;
- **détection des conflits** : salle, intervenant, groupe, rythme d'alternance, fermetures, capacité, disponibilités des intervenants ;
- **import Excel / CSV et iCal** (décision du 01/10/2026), y compris les réimports de mise à jour ;
- brouillon et publication, notifications des changements ;
- vues par groupe, promotion, intervenant, salle et apprenant ; flux iCal personnels ;
- annulation, report et remplacement d'intervenant ;
- suivi des heures planifiées et réalisées par module, comparées à la maquette ;
- disponibilités déclarées par les intervenants ;
- séances à distance (lien de visioconférence) et séances d'examen ;
- option pour masquer le nom des intervenants aux apprenants (décision du 01/10/2026).

**Exclus :**

- génération automatique de l'EDT par un solveur (V3) ;
- synchronisation continue avec Hyperplanning, Celcat ou ADE (connecteurs, module 18) ;
- réservation de matériel.

## 2. Acteurs et droits

| Action | Admin | Resp. pédagogique | Scolarité | Intervenant | Apprenant | Tuteur |
| --- | --- | --- | --- | --- | --- | --- |
| Créer, modifier, déplacer des séances | Oui | Oui (ses formations) | Oui (son établissement) | Non | Non | Non |
| Importer un EDT | Oui | Oui | Oui | Non | Non | Non |
| Publier | Oui | Oui | Oui | Non | Non | Non |
| Annuler une séance ou changer d'intervenant | Oui | Oui | Oui | Demande (validée par la pédagogie) | Non | Non |
| Déclarer ses disponibilités | Non | Non | Non | Oui | Non | Non |
| Consulter l'EDT | Tout | Ses formations | Son établissement | Ses séances et ses groupes | Le sien | Celui de ses alternants |
| Consulter l'occupation des salles | Oui | Oui | Oui | Oui | Non | Non |

## 3. User stories

Le module compte 16 user stories, dont 12 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-04-01 | responsable pédagogique | placer une séance par glisser-déposer sur la grille d'une semaine, en choisissant module, groupe, intervenant et salle | construire l'EDT rapidement | Must |
| US-04-02 | responsable pédagogique | créer une séance récurrente (chaque mardi de septembre à décembre, sauf jours fermés) | ne pas créer 15 séances une par une | Must |
| US-04-03 | responsable pédagogique | voir immédiatement les conflits (salle, intervenant, groupe, jour entreprise, fermeture) avec une proposition de solution | ne jamais publier un EDT faux | Must |
| US-04-04 | scolarité | importer l'EDT exporté d'Hyperplanning, de Celcat ou d'Excel, voir les erreurs et conflits avant de valider | reprendre l'existant sans ressaisie | Must |
| US-04-05 | scolarité | réimporter un fichier mis à jour sans créer de doublons | continuer à travailler dans l'ancien outil pendant la transition | Must |
| US-04-06 | responsable pédagogique | préparer l'EDT en brouillon puis le publier par période | ne montrer aux apprenants qu'un planning finalisé | Must |
| US-04-07 | apprenant | recevoir une notification quand un cours du jour ou du lendemain est annulé ou déplacé | ne pas me déplacer pour rien | Must |
| US-04-08 | apprenant | voir mon EDT de la semaine sur mon téléphone, avec la salle et l'intervenant | savoir où aller | Must |
| US-04-09 | intervenant | m'abonner à mon EDT dans mon agenda (Google, Outlook, Apple) | ne pas consulter deux agendas | Must |
| US-04-10 | intervenant | déclarer mes disponibilités et indisponibilités | qu'on ne me programme pas quand je ne peux pas | Must |
| US-04-11 | responsable pédagogique | annuler une séance, la reporter ou changer d'intervenant en une action | gérer les imprévus | Must |
| US-04-12 | responsable pédagogique | suivre par module les heures planifiées et réalisées face à la maquette | s'assurer que le programme sera couvert | Must |
| US-04-13 | scolarité | voir l'occupation des salles et trouver une salle libre adaptée à un créneau | trouver une solution en quelques secondes | Should |
| US-04-14 | responsable pédagogique | copier une semaine type sur plusieurs semaines | construire vite les périodes régulières | Should |
| US-04-15 | intervenant | demander un changement de séance depuis mon téléphone | ne pas passer par des emails | Should |
| US-04-16 | direction | exporter l'EDT d'une promotion en PDF ou en Excel | le diffuser ou l'imprimer | Could |

## 4. Règles de gestion

### Séances

- **RG-04-01** : une séance porte une date, une heure de début et de fin, un module (ou une activité hors maquette : réunion, accueil, rattrapage), un type (CM, TD, TP, projet, examen), un ou plusieurs groupes, un ou plusieurs intervenants, une salle ou un lien de visio, et un statut : *brouillon*, *publiée*, *annulée* ou *reportée*.
- **RG-04-02** : la grille utilise un pas de 15 minutes. Les plages horaires de l'établissement (par exemple 8 h - 19 h) et la limite matin / après-midi (13 h par défaut, qui sert aux demi-journées d'assiduité) sont paramétrables.
- **RG-04-03** : une récurrence (hebdomadaire ou toutes les N semaines, entre deux dates) crée des séances indépendantes, liées à leur série. Les jours fermés et, si demandé, les jours entreprise sont sautés automatiquement. Une modification peut s'appliquer à cette séance, aux suivantes ou à toute la série.
- **RG-04-04** : une séance qui a déjà des présences ou des notes ne peut plus être supprimée. Elle peut seulement être annulée, avec un motif ; ses données sont conservées.

### Conflits

- **RG-04-05** : à chaque création ou déplacement, Scolaly vérifie et affiche les conflits en moins de 300 ms :

| Contrôle | Niveau |
| --- | --- |
| Salle déjà occupée | Bloquant |
| Intervenant déjà en séance | Bloquant |
| Groupe (ou apprenant via un autre groupe) déjà en séance | Bloquant |
| Jour fermé (férié, vacances) | Bloquant |
| Jour entreprise ou de stage pour tout ou partie des apprenants (RG-03-13, RG-03-24) | Avertissement |
| Capacité de la salle inférieure à l'effectif | Avertissement |
| Intervenant déclaré indisponible | Avertissement |
| Volume du module dépassé par rapport à la maquette | Avertissement |

- **RG-04-06** : un conflit bloquant empêche la publication, mais pas l'enregistrement en brouillon. Un responsable peut forcer un conflit bloquant de salle ou de groupe (cours commun) avec un motif ; le forçage est tracé.
- **RG-04-07** : pour un conflit de salle, Scolaly propose les salles libres compatibles (capacité, type, équipements). Pour un conflit d'intervenant, il propose les créneaux libres les plus proches pour le groupe et l'intervenant.

### Import Excel / CSV et iCal

- **RG-04-08** : Scolaly fournit un modèle Excel (date, début, fin, code module, groupes, email ou nom de l'intervenant, salle, type, identifiant externe facultatif). Les exports courants d'Hyperplanning, de Celcat et d'ADE sont reconnus grâce à des correspondances de colonnes pré-enregistrées. Les jeux de test sont construits à partir des formats publiés par ces outils, puis complétés par les fichiers réels des écoles pilotes.
- **RG-04-09** : un fichier iCal (.ics) est importé événement par événement. Le titre, le lieu et la description sont rapprochés des modules, salles et groupes existants par une table de correspondance que l'utilisateur valide une fois, puis qui est mémorisée.
- **RG-04-10** : l'import suit les mêmes 4 étapes que RG-01-18 ; l'aperçu montre en plus les conflits. Les séances importées arrivent en brouillon, sauf si l'utilisateur choisit de les publier directement.
- **RG-04-11** : chaque séance importée garde son identifiant externe (UID iCal ou colonne dédiée). Un réimport met à jour les séances existantes, crée les nouvelles et propose d'annuler celles qui ont disparu. Il ne crée jamais de doublon.
- **RG-04-12** : une séance importée puis modifiée dans Scolaly est marquée. Au réimport suivant, Scolaly demande quelle version garder.

### Publication et notifications

- **RG-04-13** : les séances en brouillon ne sont visibles que par la pédagogie et la scolarité. La publication se fait par séance, par semaine ou par période.
- **RG-04-14** : quand une séance publiée est modifiée (horaire, salle, intervenant, annulation) :
  - si elle a lieu dans les 48 heures, les apprenants et intervenants concernés reçoivent immédiatement une notification push et un email ;
  - au-delà, ils reçoivent un récapitulatif quotidien à 18 h.

  Chaque changement est signalé visuellement dans l'EDT (badge « modifié » pendant 7 jours).
- **RG-04-15** : chaque personne dispose d'un flux iCal privé (adresse secrète, régénérable), mis à jour en moins de 15 minutes après une publication. Les tuteurs ont le flux des séances de leurs alternants.

### Heures et disponibilités

- **RG-04-16** : pour chaque module et chaque groupe, Scolaly compare les heures de la maquette, les heures planifiées (séances publiées) et les heures réalisées (séances passées non annulées), par type. Un écart supérieur à 10 % est signalé.
- **RG-04-17** : les heures réalisées par intervenant sont totalisées par mois et par type. Cet export sert à la paie des vacataires (connecteur paie en V2).
- **RG-04-18** : un intervenant déclare ses disponibilités par créneaux récurrents (par exemple lundi matin) et ses indisponibilités ponctuelles. Elles sont visibles en fond de grille pendant la construction de l'EDT.
- **RG-04-19** : une demande de changement faite par un intervenant (US-04-15) est validée ou refusée par la pédagogie. L'intervenant est notifié de la décision.

### Affichage

- **RG-04-20** : le nom de l'intervenant est affiché par défaut aux apprenants et aux tuteurs. L'école peut le masquer pour toute l'organisation, par formation ou par intervenant (par exemple pour les vacataires). Les apprenants voient alors « Intervenant » à la place du nom, y compris dans leurs flux iCal. La pédagogie et la scolarité voient toujours le nom.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-04-01 · Planificateur | Resp. pédagogique, scolarité | Grille semaine par groupe, promotion, intervenant ou salle. Barre latérale des modules « à placer » avec leurs heures restantes, à glisser sur la grille. Conflits en direct, disponibilités en fond, jours entreprise grisés. Bascule brouillon / publié |
| E-04-02 · Fiche séance | Idem ; lecture pour les autres | Détails, récurrence, historique des modifications, actions annuler / reporter / remplacer, lien vers l'appel (module 06) et le cahier de texte (module 05) |
| E-04-03 · Import d'EDT | Scolarité, resp. pédagogique | Assistant RG-04-08 à RG-04-12, avec un aperçu des conflits et des différences en cas de réimport |
| E-04-04 · Suivi des heures | Resp. pédagogique | Tableau module × groupe : maquette, planifié, réalisé, écart ; export Excel |
| E-04-05 · Occupation des salles | Scolarité | Grille des salles d'un établissement, recherche de salle libre par critères |
| E-04-06 · Mon emploi du temps (mobile) | Apprenant, intervenant | Vue jour par défaut (balayage pour changer de jour), vue semaine, badges de modification, bouton « Ajouter à mon agenda » |
| E-04-07 · Mes disponibilités | Intervenant | Grille hebdomadaire à colorier, indisponibilités ponctuelles |
| E-04-08 · Demandes de changement | Resp. pédagogique | Liste des demandes des intervenants à valider |

### Parcours « reprendre l'EDT existant » (scolarité)

1. Elle exporte la période depuis l'ancien outil (Excel ou iCal).
2. Dans E-04-03, elle dépose le fichier ; Scolaly reconnaît le format et propose la correspondance des colonnes.
3. Elle associe une seule fois les intitulés inconnus aux modules, groupes, salles et intervenants de Scolaly.
4. Elle vérifie l'aperçu : séances reconnues, erreurs, conflits.
5. Elle valide en brouillon, contrôle dans le planificateur, puis publie.
6. Les semaines suivantes, chaque réimport met à jour l'EDT sans doublon (RG-04-11).

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Séance | date, début, fin, type, statut, lien visio, motif d'annulation, identifiant externe, source (saisie / import), modifiée après import | liée à un module, des groupes, des intervenants, une salle ; appartient éventuellement à une série |
| Série | règle de récurrence, dates de début et de fin, jours exclus | regroupe des séances |
| Historique de séance | date, auteur, champ, ancienne et nouvelle valeur | appartient à une séance ; alimente les notifications |
| Disponibilité | intervenant, type (disponible / indisponible), créneau récurrent ou période | appartient à un intervenant |
| Demande de changement | intervenant, séance, proposition, statut, décision | liée à une séance |
| Import d'EDT | fichier, format, correspondances, compteurs (créées / modifiées / annulées / rejetées) | crée ou met à jour des séances |
| Correspondance d'import | libellé externe, type (module, groupe, salle, intervenant), objet Scolaly | mémorisée par organisation |
| Flux iCal | personne, jeton secret, date de régénération | un par personne |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Séance déplacée alors que l'appel a déjà été fait | Refusé ; il faut annuler et recréer, avec un avertissement sur les présences |
| Deux personnes modifient la même séance en même temps | La seconde voit la version à jour et doit confirmer son changement |
| Fichier importé avec un intervenant inconnu | Ligne importée sans intervenant si l'utilisateur l'accepte, sinon création de l'intervenant proposée |
| Changement d'heure (heure d'été / d'hiver) | Les heures sont stockées dans le fuseau de l'établissement ; les flux iCal portent le fuseau, sans décalage |
| Séance commune à deux promotions | Un seul objet séance avec plusieurs groupes ; une seule liste d'appel fusionnée |
| Groupe supprimé alors qu'il a des séances futures | Refusé tant que les séances futures ne sont pas réaffectées ou annulées |

## 8. Critères d'acceptation

- [ ] Un responsable crée une séance récurrente de 15 semaines en moins de 30 secondes ; les jours fermés sont sautés.
- [ ] Les 4 conflits bloquants et les 4 avertissements de RG-04-05 sont détectés sur un jeu de test, en moins de 300 ms chacun.
- [ ] Un export Hyperplanning d'un semestre (environ 2 000 séances) est importé en moins de 2 minutes ; un réimport identique ne crée aucune séance.
- [ ] Un fichier iCal exporté depuis Google Agenda est importé correctement après une seule série de correspondances.
- [ ] Une annulation d'un cours du lendemain déclenche une notification aux apprenants concernés en moins d'une minute.
- [ ] Le flux iCal d'un apprenant reflète une publication en moins de 15 minutes dans Google Agenda et Outlook.
- [ ] L'EDT mobile de la semaine s'affiche en moins de 1 seconde en 4G.
- [ ] Quand l'école masque le nom d'un intervenant, aucun écran ni flux iCal d'apprenant ne l'affiche (test automatisé).

## 9. Exigences propres au module

- **Performance** : le planificateur reste fluide avec 3 000 séances par semaine sur l'organisation (déplacement en moins de 100 ms). La détection de conflits s'appuie sur des index temporels.
- **Fiabilité** : les notifications passent par une file de tâches avec reprise ; aucune notification n'est envoyée pour un brouillon.
- **Sécurité** : les adresses des flux iCal sont secrètes et régénérables ; elles ne contiennent aucune donnée personnelle d'autres personnes.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Nom de l'intervenant visible des apprenants | Affiché par défaut, masquable par l'école (RG-04-20) |
| Import d'EDT | Excel / CSV et iCal au MVP (RG-04-08 à RG-04-12) |
| Outils de planning des écoles cibles | Inconnus à ce stade : les jeux de test d'import sont construits à partir des formats publiés par Hyperplanning, Celcat et ADE, et des formats Excel et iCal standards, puis complétés par les fichiers réels des écoles pilotes |
| Génération automatique de l'EDT | V3 |

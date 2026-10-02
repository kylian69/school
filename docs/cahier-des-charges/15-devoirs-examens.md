# Cahier des charges Scolaly — 15 · Devoirs en ligne et examens

> Statut : **validé** le 02/10/2026.
> Document de travail (avec le schéma devoirs et examens) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b
## 1. Objectif et périmètre

Ce module ajoute deux usages au quotidien pédagogique : les devoirs rendus et corrigés en ligne, et les épreuves QCM passées en classe sur téléphone ou ordinateur. Dans les deux cas, la note arrive directement dans le module 07. **Phase : V2.**

**Inclus :**

- devoirs à rendre en ligne, dans le prolongement du travail à faire du cahier de texte (RG-05-09) ;
- dépôt avec accusé horodaté, rappels, suivi des rendus ;
- correction annotée dans le navigateur, grille de critères, note ou niveaux de compétence ;
- banque de questions, import depuis un tableur ou Moodle ;
- **épreuves QCM avec questions ouvertes en option, passées en classe** (décision du 02/10/2026) ;
- correction automatique des questions fermées, correction manuelle des questions ouvertes, statistiques par question.

**Exclus (décisions du 02/10/2026) :**

- outil anti-plagiat ;
- télésurveillance par webcam, navigateur verrouillé et examens à distance ;
- logistique d'examen pour le moment : convocations, placement des candidats, surveillants, tiers-temps.

## 2. Acteurs et droits

| Action | Admin | Responsable pédagogique | Intervenant | Apprenant |
| --- | --- | --- | --- | --- |
| Paramétrer (formats, taille maximale, conservation) | Oui | Non | Non | Non |
| Créer un devoir à rendre | Non | Ses formations | Ses séances | Non |
| Déposer un devoir | Non | Non | Non | Oui |
| Corriger un devoir | Non | Ses formations | Ses devoirs | Non |
| Gérer la banque de questions | Non | Ses formations | Ses modules | Non |
| Créer une épreuve et l'ouvrir en séance | Non | Ses formations | Ses séances | Non |
| Composer | Non | Non | Non | Oui, s'il est émargé présent |
| Corriger les questions ouvertes, neutraliser une question | Non | Ses formations | Ses épreuves | Non |
| Revoir sa copie corrigée | Non | Non | Non | Si l'intervenant l'autorise |

## 3. User stories

Le module compte 15 user stories, dont 11 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-15-01 | intervenant | demander un rendu en ligne pour un travail à faire | ne plus ramasser de copies papier | Must |
| US-15-02 | apprenant | déposer mon devoir depuis mon téléphone (photos ou fichier) et recevoir un accusé | prouver que j'ai rendu à temps | Must |
| US-15-03 | apprenant | être rappelé avant l'échéance | ne pas oublier | Should |
| US-15-04 | intervenant | voir qui a rendu, en retard ou pas du tout | relancer les bonnes personnes | Must |
| US-15-05 | intervenant | annoter la copie en ligne et noter avec une grille | corriger plus vite et plus justement | Must |
| US-15-06 | intervenant | publier toutes les corrections d'un coup, la note allant au module 07 | ne rien ressaisir | Must |
| US-15-07 | intervenant | constituer ma banque de questions et l'importer depuis un tableur ou Moodle | réutiliser mes questions existantes | Must |
| US-15-08 | intervenant | créer une épreuve avec tirage au hasard et mélange des réponses | limiter la triche entre voisins | Must |
| US-15-09 | intervenant | ouvrir l'épreuve en séance par QR code, réservée aux présents | que seuls les présents composent | Must |
| US-15-10 | apprenant | composer sur mon téléphone ou un poste de la salle sans perdre mes réponses en cas de coupure | passer l'épreuve sereinement | Must |
| US-15-11 | intervenant | obtenir la correction automatique des QCM dès la fin | gagner des heures de correction | Must |
| US-15-12 | intervenant | corriger les questions ouvertes copie par copie, sans voir les noms | corriger de façon impartiale | Must |
| US-15-13 | responsable pédagogique | voir les statistiques par question et neutraliser une question ambiguë | garder des notes justes | Should |
| US-15-14 | apprenant | revoir ma copie corrigée si l'intervenant l'autorise | comprendre mes erreurs | Should |
| US-15-15 | intervenant | partager mes questions avec mes collègues | construire une banque commune | Could |

## 4. Règles de gestion

Deux chemins, une destination (schéma dans le document de travail) : le devoir passe par la consigne, le dépôt et la correction annotée ; l'examen part de la banque de questions, se passe en classe par les seuls présents émargés et se corrige automatiquement ou à la main. Dans les deux cas, la note est publiée dans le module 07.

### Devoirs à rendre

- **RG-15-01** : un travail à faire (RG-05-09) peut être marqué « à rendre en ligne » : rendu individuel ou en groupe, formats acceptés, nombre de fichiers, taille maximale (paramètre de l'organisation, 50 Mo par défaut), date et heure limites, retard accepté ou non, avec une pénalité éventuelle selon les règles particulières de la formation (RG-02-26). S'il est noté, il est rattaché à une évaluation du module 07.
- **RG-15-02** : l'apprenant dépose depuis son téléphone (plusieurs photos assemblées en un PDF) ou son ordinateur. Il reçoit un accusé horodaté avec l'empreinte du fichier. Il peut déposer une nouvelle version jusqu'à l'échéance : la dernière fait foi, les précédentes restent dans l'historique. Un rappel part 24 heures avant l'échéance (paramétrable) à ceux qui n'ont pas rendu.
- **RG-15-03** : après l'échéance, le dépôt est fermé ou marqué « en retard » selon le paramétrage. L'intervenant peut accorder un délai individuel, par exemple après une absence justifiée ; ce délai est tracé.
- **RG-15-04** : l'intervenant suit les rendus (rendu, en retard, non rendu, corrigé) et relance les retardataires en un clic.
- **RG-15-05** : la correction se fait dans une visionneuse intégrée (PDF, images ; documents bureautiques convertis en PDF) : surlignage, commentaires, annotations à main levée, commentaire général, note ou niveaux de compétence, grille de critères réutilisable en option.
- **RG-15-06** : les corrections sont publiées ensemble ; la note suit les règles de publication du module 07, et l'apprenant télécharge sa copie annotée. Aucun contrôle anti-plagiat n'est fait (décision du 02/10/2026).

### Banque de questions

- **RG-15-07** : chaque formation et chaque module ont leur banque de questions. Types : choix unique, choix multiples, vrai ou faux, réponse courte (corrigée automatiquement, avec les variantes acceptées), question ouverte (corrigée à la main). Un énoncé peut contenir images et formules ; chaque question porte des étiquettes, une difficulté, une compétence du référentiel (module 02) et un commentaire de correction facultatif.
- **RG-15-08** : une question est privée ou partagée avec la formation. Modifier une question déjà utilisée crée une nouvelle version, sans changer les copies passées. La banque s'importe et s'exporte en tableur et au format Moodle XML.

### Épreuves

- **RG-15-09** : une épreuve est liée à une évaluation du module 07 et à une séance de l'emploi du temps (module 04). Elle définit les questions (fixes ou tirées au hasard par étiquette et difficulté), le mélange des questions et des réponses, le barème (points négatifs en option pour les QCM, avec un plancher à zéro), la durée, la navigation (libre ou question par question) et l'affichage ou non de la correction après l'épreuve.
- **RG-15-10** : l'intervenant prévisualise et teste l'épreuve avant de la publier ; elle est verrouillée dès qu'une première copie a commencé.

### Passage en classe

- **RG-15-11** : pendant la séance, l'intervenant ouvre l'épreuve : un QR code et un code court s'affichent, sur le même principe de jeton signé et renouvelé que l'émargement (RG-00-16), avec un jeton distinct. Seuls les apprenants émargés présents à la séance (module 06) peuvent commencer ; un retardataire compose une fois émargé.
- **RG-15-12** : l'apprenant compose sur son téléphone ou un poste de la salle, en plein écran. Chaque réponse est enregistrée aussitôt. Le chronomètre est tenu par le serveur : après une coupure, l'apprenant reprend sur n'importe quel appareil avec le temps restant, et les réponses saisies sans réseau partent dès son retour tant que l'épreuve est ouverte.
- **RG-15-13** : l'intervenant suit l'avancement en direct (pas commencé, en cours, rendu), peut prolonger le temps d'un apprenant après un incident (tracé) et clore l'épreuve. À la fin du temps, les copies sont rendues automatiquement.
- **RG-15-14** : la surveillance est celle de la salle : ni webcam ni navigateur verrouillé (décision du 02/10/2026).

### Correction et résultats

- **RG-15-15** : les questions fermées sont corrigées dès la remise. Les questions ouvertes se corrigent copie par copie ou question par question, avec les noms masqués jusqu'à la publication si l'intervenant le souhaite.
- **RG-15-16** : les statistiques montrent la moyenne, la répartition des notes et le taux de réussite de chaque question, et signalent les questions qui distinguent mal les apprenants. Une question peut être neutralisée (retirée ou accordée à tous) : toutes les copies sont recalculées et l'opération est tracée.
- **RG-15-17** : les notes sont transmises au module 07 et publiées selon ses règles. L'apprenant revoit sa copie si l'intervenant l'autorise. Copies et rendus sont archivés pour une durée paramétrable et servent de preuves pour le module 12.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-15-01 · Devoir à rendre | Intervenant | Depuis le travail à faire : options de rendu, échéance, retard, évaluation liée |
| E-15-02 · Mes rendus | Apprenant | Devoirs à rendre, dépôt par photo ou fichier, accusés, corrections reçues |
| E-15-03 · Suivi des rendus | Intervenant | Rendu, en retard, non rendu, relance, délais individuels |
| E-15-04 · Correction | Intervenant | Visionneuse, annotations, grille, note, copie suivante |
| E-15-05 · Banque de questions | Intervenant, responsable pédagogique | Recherche, étiquettes, import et export, versions, partage |
| E-15-06 · Éditeur d'épreuve | Intervenant | Sélection ou tirage, barème, durée, options, aperçu |
| E-15-07 · Pilotage en séance | Intervenant | QR code projetable, présents, avancement en direct, prolongation, clôture |
| E-15-08 · Composition | Apprenant | Questions, chronomètre, état de l'enregistrement, remise |
| E-15-09 · Résultats et statistiques | Intervenant, responsable pédagogique | Notes, statistiques par question, neutralisation, publication |

### Parcours « un QCM en amphithéâtre »

1. L'intervenant prépare l'épreuve à partir de la banque et la rattache à sa séance.
2. En début de séance, il fait l'appel par QR code, puis projette le QR code de l'épreuve.
3. Les présents composent sur leur téléphone ; chaque réponse est enregistrée.
4. À la fin du temps, les copies sont rendues et les QCM corrigés automatiquement.
5. L'intervenant corrige les questions ouvertes, vérifie les statistiques et publie : les notes arrivent dans le module 07.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Devoir à rendre | travail à faire (module 05), mode individuel ou groupe, formats, taille, échéance, retard, pénalité | lié à une évaluation (module 07) |
| Rendu | devoir, apprenant ou groupe, version, fichiers, empreinte, date, statut | versions conservées |
| Correction | rendu, annotations, commentaire, note ou niveaux, grille, correcteur, publication | une par rendu |
| Grille de critères | critères, niveaux, points | réutilisable |
| Question | banque, type, énoncé, réponses, bonnes réponses, barème, étiquettes, difficulté, compétence, version, auteur, partage | versionnée |
| Épreuve | évaluation, séance, règles de tirage, barème, durée, options, statut | contient les copies |
| Copie | épreuve, apprenant, questions tirées, réponses horodatées, temps, prolongation, statut, note | une par apprenant et épreuve |
| Statistique de question | épreuve, question, taux de réussite, pouvoir de distinction, neutralisée | recalculée à chaque correction |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Coupure du réseau en salle | Les réponses attendent sur l'appareil et partent au retour du réseau ; le chronomètre du serveur continue |
| Téléphone déchargé | L'apprenant reprend sur un poste de la salle avec le temps restant |
| Apprenant non émargé | Il ne peut pas commencer ; l'intervenant l'émarge, puis il compose |
| Fichier trop lourd ou format refusé | Message clair avant l'envoi ; les photos sont compressées automatiquement |
| Dépôt commencé juste avant l'échéance | Accepté si l'envoi a démarré avant l'heure limite (tolérance paramétrable, 5 minutes par défaut) |
| Question erronée découverte après publication | Neutralisation, recalcul et nouvelle publication des notes, avec trace |
| Deux correcteurs sur la même épreuve | Copies ou questions réparties entre eux, sans conflit de saisie |
| Épreuve ouverte par erreur | L'intervenant la suspend ; aucune réponse n'est perdue |

## 8. Critères d'acceptation

- [ ] 300 apprenants ouvrent la même épreuve en moins de 30 secondes ; l'enregistrement d'une réponse prend moins de 200 ms dans 95 % des cas.
- [ ] Aucune réponse n'est perdue lors d'une coupure réseau simulée de 2 minutes.
- [ ] Seuls les apprenants émargés présents peuvent ouvrir l'épreuve.
- [ ] La correction automatique est exacte sur 50 questions de tous les types fermés, avec points négatifs et plancher.
- [ ] Une banque de 200 questions au format Moodle XML s'importe sans perte.
- [ ] Un apprenant dépose un devoir de 5 photos assemblées en PDF depuis son téléphone en moins d'une minute.
- [ ] La neutralisation d'une question recalcule toutes les copies et met à jour les notes du module 07.

## 9. Exigences propres au module

- **Performance** : 300 ouvertures simultanées, enregistrement d'une réponse en moins de 200 ms dans 95 % des cas, chronomètre tenu par le serveur.
- **Fiabilité** : réponses enregistrées une par une, sans doublon si elles sont renvoyées ; file d'attente hors ligne dans l'application, comme pour l'émargement.
- **Intégrité** : rendus et copies horodatés avec empreinte ; épreuve verrouillée dès la première copie ; chaque modification tracée.
- **Stockage** : fichiers dans le stockage objet, analysés par un antivirus à l'envoi, conservés pour une durée paramétrable.
- **Accessibilité** : composition utilisable au clavier et avec un lecteur d'écran, contrastes de niveau AA, taille de texte réglable.

## 10. Décisions

| Sujet | Décision (02/10/2026) |
| --- | --- |
| Anti-plagiat | Non prévu |
| Surveillance | Ni webcam ni navigateur verrouillé ; les examens en ligne se passent en classe |
| Type d'épreuves | QCM, avec questions ouvertes en option |
| Logistique d'examen | Convocations, placement, surveillants et tiers-temps hors périmètre pour le moment |

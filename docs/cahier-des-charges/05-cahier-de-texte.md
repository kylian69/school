# Cahier des charges Scolaly — 05 · Cahier de texte

> Statut : **validé** le 01/10/2026.
> Document de travail : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objectif et périmètre

Le cahier de texte dit, pour chaque séance, ce qui a été vu et ce qu'il faut faire ensuite. L'apprenant absent rattrape le contenu, le tuteur suit la progression, et l'école prouve à Qualiopi que le programme prévu a été réalisé. Un intervenant doit pouvoir le remplir en moins d'une minute depuis son téléphone, à la fin du cours. **Phase : MVP.**

**Inclus :**

- contenu de séance lié à chaque séance de l'EDT (module 04) ;
- travail à faire, avec échéance, temps estimé, pièces jointes et liens ;
- progression pédagogique prévue par module, qui pré-remplit les séances ;
- vues apprenant (jour, semaine, travail à faire), tuteur et responsable pédagogique ;
- rappels aux intervenants qui n'ont pas rempli leur cahier ;
- suivi du programme réalisé par rapport au programme prévu (preuve Qualiopi).

**Exclus :**

- dépôt et correction des devoirs (module 15, V2) ;
- plateforme de cours en ligne (connecteurs LMS, module 18).

## 2. Acteurs et droits

| Action | Admin | Resp. pédagogique | Scolarité | Intervenant | Apprenant | Tuteur |
| --- | --- | --- | --- | --- | --- | --- |
| Remplir le contenu d'une séance et le travail à faire | Non | Oui (ses formations) | Non | Oui (ses séances) | Non | Non |
| Définir la progression pédagogique d'un module | Non | Oui | Non | Oui (ses modules) | Non | Non |
| Consulter le cahier de texte | Oui | Ses formations | Son établissement | Ses groupes | Ses groupes | Ses alternants (sans les pièces jointes réservées) |
| Consulter le suivi prévu / réalisé | Oui | Oui | Lecture | Ses modules | Non | Non |
| Marquer un travail comme fait | Non | Non | Non | Non | Oui (pour lui-même) | Non |

## 3. User stories

Le module compte 10 user stories, dont 7 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-05-01 | intervenant | remplir le contenu de ma séance depuis mon téléphone, directement depuis l'appel ou l'EDT | le faire en fin de cours sans effort | Must |
| US-05-02 | intervenant | donner un travail à faire avec une échéance et des pièces jointes | que les apprenants sachent quoi préparer | Must |
| US-05-03 | intervenant | préparer la progression de mon module (chapitres prévus par séance) | que mes séances soient pré-remplies et que je n'aie qu'à confirmer | Must |
| US-05-04 | apprenant | voir ce qui a été fait à une séance où j'étais absent | rattraper le cours | Must |
| US-05-05 | apprenant | voir la liste de mes travaux à faire, triée par échéance, et les cocher | m'organiser | Must |
| US-05-06 | responsable pédagogique | voir quelles séances n'ont pas de contenu et relancer les intervenants | avoir un cahier de texte complet pour l'audit Qualiopi | Must |
| US-05-07 | responsable pédagogique | comparer le programme prévu et le programme réalisé par module | détecter les retards de programme | Must |
| US-05-08 | tuteur | voir ce que mon alternant a étudié cette semaine | faire le lien avec ses missions en entreprise | Should |
| US-05-09 | intervenant | dupliquer le cahier de texte de l'an dernier pour un module | gagner du temps | Should |
| US-05-10 | apprenant | recevoir un rappel la veille d'une échéance | ne pas oublier un travail | Could |

## 4. Règles de gestion

### Contenu de séance

- **RG-05-01** : chaque séance publiée a une entrée de cahier de texte, vide au départ. Elle contient le contenu réalisé (texte enrichi : titres, listes, liens, formules), les pièces jointes (20 Mo maximum par fichier, 100 Mo par séance) et les compétences travaillées (choisies dans le référentiel du module, RG-02-21).
- **RG-05-02** : le contenu peut être saisi à partir de l'ouverture de la séance, puis pendant toute l'année. Il est modifiable par son auteur et par le responsable pédagogique ; chaque modification est historisée.
- **RG-05-03** : une séance commune à plusieurs groupes (module 04) a une seule entrée, visible par tous ses groupes.
- **RG-05-04** : une séance annulée n'attend pas de contenu. Une séance reportée transfère son contenu prévu vers la nouvelle séance.
- **RG-05-05** : une pièce jointe peut être marquée « réservée aux apprenants » (supports de cours protégés) : le tuteur ne la voit pas.

### Progression pédagogique

- **RG-05-06** : la progression d'un module est une liste ordonnée de séquences (titre, objectifs, compétences, durée prévue). Elle s'importe depuis Excel ou se duplique de l'année précédente.
- **RG-05-07** : les séquences sont proposées dans l'ordre pour les séances suivantes du module. L'intervenant confirme (« fait comme prévu »), modifie ou décale ; une séquence non faite est reportée à la séance suivante.
- **RG-05-08** : le suivi prévu / réalisé compare, par module et par groupe, les séquences prévues, les séquences faites et les heures. Un retard de plus de 2 séquences est signalé au responsable pédagogique.

### Travail à faire

- **RG-05-09** : un travail à faire a un intitulé, une consigne, une échéance (date, ou « pour la séance du… »), un temps estimé facultatif et des pièces jointes. Il est rattaché à la séance où il est donné et visé aux groupes de cette séance, ou à une partie des apprenants.
- **RG-05-10** : l'apprenant voit ses travaux triés par échéance et peut les cocher « fait ». Cette coche est personnelle : l'intervenant voit seulement le nombre d'apprenants qui ont coché.
- **RG-05-11** : la charge de travail par jour est calculée à partir des temps estimés. Si un groupe dépasse un seuil paramétrable (3 heures par jour par défaut), un avertissement s'affiche pour l'intervenant qui ajoute un travail.
- **RG-05-12** : pour les alternants, une échéance tombant un jour entreprise est signalée à l'intervenant, sans bloquer.

### Rappels et contrôle

- **RG-05-13** : une séance passée sans contenu déclenche un rappel à l'intervenant le soir même, puis à J+2. À J+7, elle apparaît dans la liste « cahiers à compléter » du responsable pédagogique. Ces délais sont paramétrables. Le cahier de texte n'est jamais bloquant : la validation de l'appel reste possible sans lui.
- **RG-05-14** : le taux de remplissage du cahier de texte (séances passées renseignées / séances passées) est affiché par intervenant, par module et par formation. Il alimente les indicateurs Qualiopi du module 12.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-05-01 · Saisie de séance (mobile d'abord) | Intervenant | Séquence prévue pré-remplie avec le bouton « Fait comme prévu », éditeur de texte, pièces jointes (appareil photo ou fichiers), compétences, ajout d'un travail à faire. Accessible depuis l'appel (module 06) et depuis l'EDT |
| E-05-02 · Progression du module | Intervenant, resp. pédagogique | Liste ordonnée des séquences, glisser-déposer, import Excel, avancement prévu / réalisé |
| E-05-03 · Cahier de texte du groupe | Tous selon droits | Fil chronologique des séances avec contenu et travaux, filtre par module |
| E-05-04 · Mes devoirs | Apprenant | Travaux à faire triés par échéance, cases à cocher, charge de la semaine |
| E-05-05 · Suivi des cahiers | Resp. pédagogique | Taux de remplissage par intervenant et par module, séances à compléter, bouton « Relancer », écarts prévu / réalisé |

### Parcours « fin de cours » (intervenant, sur mobile)

1. Il valide l'appel (module 06) ; l'écran propose « Remplir le cahier de texte ».
2. La séquence prévue est affichée : il touche « Fait comme prévu » ou corrige le texte.
3. Il ajoute si besoin un travail à faire (échéance proposée : la prochaine séance du module).
4. Il enregistre. Cible : moins de 60 secondes.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Entrée de cahier de texte | contenu (texte enrichi), compétences, auteur, dates de création et de modification | une par séance ; a des pièces jointes |
| Pièce jointe | fichier, nom, taille, type, réservée aux apprenants (oui / non) | appartient à une entrée ou à un travail |
| Séquence de progression | module, ordre, titre, objectifs, compétences, durée prévue, statut (prévue / faite / reportée) | appartient à une progression ; liée à la séance où elle est faite |
| Travail à faire | intitulé, consigne, échéance, temps estimé, destinataires | rattaché à une séance ; a des pièces jointes |
| Suivi de travail | apprenant, travail, fait (oui / non), date | personnel à chaque apprenant |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Intervenant remplacé pour une séance | Le remplaçant remplit le cahier ; l'intervenant habituel le voit |
| Saisie sans réseau (salle mal couverte) | Brouillon conservé sur le téléphone et envoyé au retour du réseau |
| Pièce jointe trop lourde ou d'un type interdit | Refusée avec un message clair ; une vidéo est à partager par lien |
| Apprenant arrivé en cours d'année | Il voit tout le cahier de texte de ses groupes, y compris les séances antérieures à son arrivée |

## 8. Critères d'acceptation

- [ ] Un intervenant remplit une séance pré-remplie par la progression en moins de 60 secondes sur mobile (test avec 3 intervenants).
- [ ] Une séance non remplie déclenche le rappel le soir même, puis apparaît chez le responsable pédagogique à J+7.
- [ ] Un apprenant absent retrouve le contenu et les pièces jointes de la séance manquée en 2 actions depuis son EDT.
- [ ] Un tuteur ne voit jamais une pièce jointe marquée « réservée aux apprenants » (test automatisé).
- [ ] Le taux de remplissage affiché correspond au calcul attendu sur un jeu de test d'un mois.

## 9. Exigences propres au module

- **Fichiers** : stockage S3 (MinIO en self-hosted), antivirus (SEC-05), liens temporaires signés.
- **Hors ligne** : l'écran de saisie fonctionne hors connexion grâce au service worker de la PWA.
- **Accessibilité** : l'éditeur de texte est utilisable au clavier et avec un lecteur d'écran.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Cahier de texte obligatoire ? | Non : relance seulement (RG-05-13), jamais bloquant pour la validation de l'appel |
| Dépôt de devoirs en ligne | V2 (module 15) |

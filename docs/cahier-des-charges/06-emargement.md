# Cahier des charges Scolaly — 06 · Émargement QR et assiduité

> Statut : **validé** le 01/10/2026.
> Document de travail (avec le schéma du cycle d'un appel) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objectif et périmètre

L'émargement doit prendre moins de 2 minutes par séance, pour toute la classe, sans fraude possible à grande échelle, et produire automatiquement les feuilles d'émargement exigées par Qualiopi et les OPCO. L'assiduité qui en découle alimente les heures réalisées (module 03), les alertes, les bulletins et les tableaux de bord. C'est le module le plus critique en charge : il suit les objectifs de RG-00-16 à RG-00-22. **Phase : MVP.**

**Inclus :**

- appel par QR code rotatif affiché par l'intervenant, scanné par les apprenants ;
- contrôles anti-fraude par défaut (décision du 01/10/2026) : QR rotatif, localisation, validation de la liste par l'intervenant ;
- appel manuel (liste avec photos) et séances à distance ;
- validation horodatée de l'appel par l'intervenant (signature électronique simple) ;
- retards, départs anticipés, absences, dispenses ;
- justificatifs : dépôt par l'apprenant, validation par la scolarité ;
- alertes et seuils d'absence ; notifications (détaillées en RG-03-18 à RG-03-21) ;
- **feuilles d'émargement PDF** par séance et récapitulatifs mensuels par apprenant ;
- statistiques d'assiduité.

**Exclus :**

- scan par l'intervenant de la carte d'un apprenant (décision du 01/10/2026 : l'appel manuel suffit) ;
- SMS (V2) ;
- signature manuscrite à l'écran (V2) ;
- transmission automatique des feuilles aux OPCO (module 10, V2).

## 2. Acteurs et droits

| Action | Admin | Resp. pédagogique | Scolarité | Intervenant | Apprenant | Tuteur |
| --- | --- | --- | --- | --- | --- | --- |
| Afficher le QR et faire l'appel | Non | Oui (à la place de l'intervenant) | Oui | Oui (ses séances) | Non | Non |
| Scanner pour émarger | Non | Non | Non | Non | Oui | Non |
| Valider l'appel (signature) | Non | Oui (pour le compte de, avec mention) | Non | Oui | Non | Non |
| Corriger un appel validé | Oui | Oui | Oui | Oui jusqu'à J+2 | Non | Non |
| Déposer un justificatif | Non | Non | Oui (pour l'apprenant) | Non | Oui | Non |
| Valider ou refuser un justificatif | Non | Oui | Oui | Non | Non | Non |
| Consulter l'assiduité | Tout | Ses formations | Son établissement | Ses groupes | La sienne | Ses alternants (statut seulement, RG-03-21) |
| Télécharger les feuilles d'émargement | Oui | Oui | Oui | Ses séances | Ses récapitulatifs | Non |
| Paramétrer l'émargement (fenêtres, seuils, contrôles) | Oui | Ses formations | Non | Non | Non | Non |

## 3. User stories

Le module compte 17 user stories, dont 14 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-06-01 | intervenant | afficher le QR code de ma séance en un clic sur l'écran de la salle ou sur mon téléphone | lancer l'appel immédiatement | Must |
| US-06-02 | apprenant | scanner le QR depuis l'application déjà ouverte et voir « Présence enregistrée » en moins d'une seconde | émarger sans perdre de temps | Must |
| US-06-03 | intervenant | voir en direct le nombre de présents, la liste des non-scannés et les scans « à vérifier » | savoir quand l'appel est complet | Must |
| US-06-04 | intervenant | corriger la liste (cocher un présent sans téléphone, retirer un scan suspect, noter un retard) puis valider l'appel | signer une liste exacte | Must |
| US-06-05 | intervenant | faire l'appel à la main sur une liste avec les photos, sans QR | gérer une panne ou un petit groupe | Must |
| US-06-06 | apprenant | émarger à un cours à distance | être compté présent en visio | Must |
| US-06-07 | apprenant | déposer un justificatif (photo ou PDF) pour une ou plusieurs absences, avec un motif | régulariser mon absence | Must |
| US-06-08 | scolarité | traiter les justificatifs dans une file, avec l'aperçu du document, et les valider ou refuser en un clic | gérer le volume rapidement | Must |
| US-06-09 | scolarité | saisir moi-même une absence justifiée pour une période (maladie longue, convocation) | traiter les cas reçus par email ou courrier | Must |
| US-06-10 | scolarité | être alertée des apprenants qui dépassent les seuils d'absence | agir avant le décrochage | Must |
| US-06-11 | scolarité | télécharger les feuilles d'émargement d'une promotion pour un mois, par séance ou par apprenant | fournir les preuves à un OPCO ou à un auditeur Qualiopi | Must |
| US-06-12 | responsable pédagogique | voir les appels non validés et relancer les intervenants | avoir des feuilles complètes | Must |
| US-06-13 | apprenant | voir mon assiduité (présences, retards, absences justifiées ou non) | savoir où j'en suis | Must |
| US-06-14 | administrateur | paramétrer le périmètre de localisation de chaque établissement (adresse, rayon, réseaux Wi-Fi) | que le contrôle de présence sur place fonctionne | Must |
| US-06-15 | responsable pédagogique | consulter les statistiques d'assiduité par groupe, module et apprenant | repérer les cours ou les apprenants à problème | Should |
| US-06-16 | scolarité | générer une lettre d'avertissement d'assiduité à partir d'un modèle | formaliser le suivi | Should |
| US-06-17 | administrateur | activer l'appareil lié au compte pour une formation | renforcer le contrôle si la fraude est constatée | Should |

## 4. Règles de gestion

Cycle d'un appel (schéma dans le document de travail) : ouverture 10 minutes avant le cours → scans (fenêtre de −10 à +15 minutes) → contrôles (jeton, inscription, lieu ; un doute ne bloque jamais le scan) → liste en direct (présents, à vérifier) → validation par l'intervenant (signature horodatée) → feuille PDF versionnée avec empreinte ; en parallèle, les absences déclenchent les notifications et alertes, qu'un justificatif validé transforme ensuite en absences justifiées.

### Cycle de l'appel

- **RG-06-01** : chaque séance publiée a un appel, qui passe par 4 états : *à venir* → *ouvert* → *validé* → *verrouillé*. L'appel s'ouvre automatiquement 10 minutes avant le début de la séance (et le cache est pré-chargé, RG-00-17). Il est verrouillé 7 jours après la séance.
- **RG-06-02** : la fenêtre de scan va de 10 minutes avant le début à 15 minutes après. Un scan après le début plus une tolérance de 5 minutes est enregistré comme retard, avec le nombre de minutes. Après la fenêtre, le scan est refusé avec le message « Signalez-vous à l'intervenant ». Ces trois durées sont paramétrables par formation.
- **RG-06-03** : pour une séance longue (plus de 4 heures, par exemple une journée), l'école peut exiger un second appel en début d'après-midi. Chaque demi-journée a alors son propre appel, comme l'exigent la plupart des OPCO.
- **RG-06-04** : la liste attendue comprend les apprenants inscrits aux groupes de la séance à cette date. Sont exclus et marqués « non attendu » : les apprenants en jour entreprise ou en stage (RG-03-13, RG-03-24), dispensés du module, ou sortis de la formation.

### QR code et scan

- **RG-06-05** : l'intervenant affiche le QR depuis la fiche de la séance, sur l'écran de la salle, son ordinateur ou son téléphone. Le QR change toutes les 10 à 15 secondes (RG-00-16). L'affichage montre aussi le compteur « présents / attendus » en direct et un code à 6 chiffres qui change avec le QR, à saisir à la main si la caméra d'un téléphone ne fonctionne pas.
- **RG-06-06** : l'apprenant scanne depuis l'application Scolaly (bouton « Émarger » toujours visible pendant une fenêtre de scan), pas depuis l'appareil photo du téléphone. Il est déjà connecté (RG-00-20). Un seul scan compte par apprenant et par appel ; un second scan est ignoré sans erreur.
- **RG-06-07** : le scan est accepté en moins de 200 ms et confirmé à l'écran (vert, avec l'heure). Sans réseau, il est conservé et renvoyé automatiquement (RG-00-19) ; l'écran affiche « Présence en cours d'envoi ».
- **RG-06-08** : pour une séance à distance, l'intervenant partage le QR à l'écran de la visioconférence. Un apprenant qui suit sur le même appareil utilise le code à 6 chiffres. Le contrôle de localisation est désactivé pour ces séances.

### Contrôles anti-fraude

- **RG-06-09** : contrôles actifs par défaut, chacun désactivable par l'école ou par formation :

| Contrôle | Par défaut | Effet en cas de doute |
| --- | --- | --- |
| QR rotatif signé (10 à 15 s) | Activé | Un QR périmé ou falsifié est refusé |
| Localisation (GPS, puis Wi-Fi ou adresse IP du campus) | Activé | Scan « à vérifier », jamais bloqué (RGPD-03) |
| Validation de la liste par l'intervenant | Activé | L'intervenant tranche les scans à vérifier |
| Appareil lié au compte | Désactivé | Scan depuis un nouvel appareil « à vérifier » ; changement d'appareil validé par la scolarité |
| Même appareil pour plusieurs comptes dans un appel | Toujours activé | Tous les scans concernés « à vérifier » |

- **RG-06-10** : le périmètre de localisation est défini par établissement : une adresse avec un rayon (300 m par défaut) et, si besoin, une liste de réseaux Wi-Fi ou de plages d'adresses IP. Le résultat stocké est uniquement « sur place », « hors site » ou « inconnu » (RGPD-03).
- **RG-06-11** : les scans « à vérifier » sont signalés à l'intervenant avec leur raison et la photo de l'apprenant. Sans décision de sa part, ils comptent comme présents, et un rapport mensuel des anomalies répétées est envoyé à la scolarité.

### Validation de l'appel par l'intervenant

- **RG-06-12** : l'intervenant peut ajuster la liste : marquer présent un apprenant non scanné, retirer un scan, noter un retard ou un départ anticipé (avec l'heure), ajouter un commentaire. Puis il touche « Valider l'appel ».
- **RG-06-13** : la validation vaut signature électronique simple. Scolaly enregistre l'identité de l'intervenant, la date et l'heure, l'adresse IP, l'appareil et une empreinte numérique (hachage) de la liste validée. Toute modification ultérieure crée une nouvelle version de la feuille ; l'ancienne reste consultable.
- **RG-06-14** : un appel non validé 30 minutes après la fin de la séance déclenche un rappel à l'intervenant, puis un autre le lendemain matin. À J+2, il apparaît chez le responsable pédagogique, qui peut valider « pour le compte de » avec un motif. Les absences d'un appel non validé sont quand même notifiées selon RG-03-18 à RG-03-21.
- **RG-06-15** : après validation, l'intervenant peut corriger son appel jusqu'à J+2 (paramétrable), avec un motif. Ensuite, seules la scolarité et la pédagogie peuvent corriger, jusqu'au verrouillage (RG-06-01) ; au-delà, une correction exige un droit spécifique. Tout est tracé.

### Statuts de présence, retards et absences

- **RG-06-16** : chaque apprenant attendu a un statut par appel : *présent*, *en retard* (minutes), *parti avant la fin* (heure), *absent*, *absent justifié*, *dispensé* ou *non attendu*.
- **RG-06-17** : un retard au-delà d'un seuil (30 minutes par défaut, paramétrable) est proposé à l'intervenant comme absence partielle. Pour le calcul des heures (RG-03-15), le temps manqué est déduit au prorata.
- **RG-06-18** : l'assiduité est comptée en heures et en demi-journées. Une demi-journée d'absence est une demi-journée où l'apprenant a manqué au moins une séance attendue (limite matin / après-midi : RG-04-02).

### Justificatifs

- **RG-06-19** : l'apprenant dépose un justificatif (photo ou PDF, 10 Mo maximum) pour une ou plusieurs séances, ou pour une période, en choisissant un motif dans la liste de l'école. Liste par défaut : maladie, rendez-vous médical, transport, convocation officielle (examen, permis, administration), événement familial, raison professionnelle (alternants), autre. Le délai de dépôt est de 48 heures par défaut, paramétrable ; un dépôt hors délai reste possible mais est signalé.
- **RG-06-20** : aucun détail médical n'est saisi (RGPD-03). Le motif « maladie » suffit ; le document est visible uniquement par la scolarité et la pédagogie, jamais par l'intervenant ni le tuteur.
- **RG-06-21** : la scolarité valide ou refuse le justificatif, avec un motif en cas de refus. L'apprenant est notifié de la décision. La validation passe les absences concernées en « absent justifié », sans modifier la feuille signée : la justification est une couche ajoutée, tracée et visible sur les récapitulatifs.
- **RG-06-22** : la scolarité peut saisir directement une absence justifiée pour une période (US-06-09). Les séances futures de cette période sont pré-marquées « absent justifié » dans l'appel.

### Seuils et alertes

- **RG-06-23** : chaque formation définit des seuils d'alerte en demi-journées non justifiées sur une période glissante. Par défaut : niveau 1 à 3 demi-journées sur 30 jours (alerte à la scolarité et au référent, RG-03-20), niveau 2 à 6 demi-journées sur 30 jours (alerte à la direction et proposition de lettre d'avertissement).
- **RG-06-24** : les notifications d'absence suivent RG-03-18 à RG-03-21 pour tous les apprenants. Celles destinées au tuteur ne concernent que les alternants et les stagiaires.

### Feuilles d'émargement

- **RG-06-25** : la feuille d'une séance (PDF) comporte :
  - en-tête : organisme (nom, NDA, logo), formation, module, date, horaires, salle ou « à distance », intervenant ;
  - par apprenant : nom, statut, heure du scan ou mention de l'ajout manuel, résultat des contrôles, mention « signature électronique par scan authentifié et horodaté » ;
  - pied : validation de l'intervenant (nom, date, heure), empreinte numérique, numéro de version.
- **RG-06-26** : le récapitulatif mensuel par apprenant liste chaque demi-journée (date, matin ou après-midi, séances, statut, heures réalisées). C'est le format demandé par la plupart des OPCO pour justifier les heures. Le modèle est paramétrable par l'école (logo, mentions, colonnes).
- **RG-06-27** : les feuilles sont générées en tâche de fond, en masse (une promotion pour un mois en moins de 2 minutes), et archivées avec leur empreinte. La durée de conservation par défaut est de 5 ans, paramétrable (RGPD-04).

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-06-01 · Affichage du QR (plein écran) | Intervenant | QR rotatif en grand, code à 6 chiffres, compteur présents / attendus, minuteur de la fenêtre de scan, bouton « Fermer et valider » |
| E-06-02 · Appel (mobile ou ordinateur) | Intervenant | Liste avec photos : scannés (vert), à vérifier (orange, avec la raison), non scannés (gris) ; un geste pour changer un statut ; retards ; bouton « Valider l'appel » puis proposition de remplir le cahier de texte |
| E-06-03 · Émarger | Apprenant | Bouton « Émarger » mis en avant sur l'accueil pendant une fenêtre de scan, caméra, saisie du code, confirmation |
| E-06-04 · Mon assiduité | Apprenant | Taux de présence, liste des absences et retards avec leur statut, bouton « Justifier », récapitulatif mensuel PDF |
| E-06-05 · Justifier une absence | Apprenant, scolarité | Choix des absences ou d'une période, motif, photo ou PDF |
| E-06-06 · File des justificatifs | Scolarité, resp. pédagogique | Liste à traiter, aperçu du document, raccourcis clavier valider / refuser |
| E-06-07 · Suivi de l'assiduité | Scolarité, resp. pédagogique, direction | Tableau par apprenant (heures, demi-journées, justifiées ou non, niveau d'alerte), filtres, statistiques par groupe et module, export |
| E-06-08 · Appels à valider | Resp. pédagogique | Appels non validés par intervenant, bouton « Relancer », validation « pour le compte de » |
| E-06-09 · Feuilles d'émargement | Scolarité, resp. pédagogique | Sélection (promotion, période, format par séance ou par apprenant), génération en masse, téléchargement ZIP |
| E-06-10 · Paramètres d'émargement | Administrateur, resp. pédagogique | Fenêtres, tolérances, contrôles anti-fraude, périmètres de localisation, motifs, seuils d'alerte, modèles PDF |

### Parcours « appel en classe » (2 minutes au total)

1. L'intervenant ouvre la séance du jour depuis son accueil et touche « Afficher le QR ».
2. Les apprenants touchent « Émarger » et scannent : la confirmation s'affiche en moins d'une seconde et le compteur monte.
3. L'intervenant ouvre la liste : il marque présent l'apprenant sans téléphone et tranche un scan « à vérifier ».
4. Il touche « Valider l'appel » : la feuille est signée et les absences déclenchent les notifications.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Appel | séance, demi-journée, état, ouverture, fermeture de la fenêtre, validation (auteur, horodatage, IP, appareil, empreinte), version | un ou deux par séance ; a des présences |
| Présence | apprenant, statut, heure du scan, minutes de retard, heure de départ, source (scan / code / manuel), résultat de localisation, appareil (empreinte), à vérifier (raison), décision de l'intervenant | appartient à un appel |
| Version de feuille | appel, numéro, PDF, empreinte, auteur et motif de la modification | historise les modifications |
| Justificatif | apprenant, motif, période ou séances, fichier, date de dépôt, hors délai, statut, décision, motif de refus | justifie des présences |
| Périmètre de localisation | établissement, coordonnées, rayon, réseaux Wi-Fi, plages IP | un ou plusieurs par établissement |
| Appareil enregistré | compte, empreinte de l'appareil, date, statut (actif / en attente de validation) | utilisé si l'appareil lié est activé |
| Alerte d'assiduité | apprenant, niveau, date, demi-journées concernées, statut de traitement | générée par les seuils |
| Paramètres d'émargement | fenêtres, tolérances, contrôles, seuils, motifs, modèles | par organisation, surchargeables par formation |

Le chemin technique du scan (cache mémoire, écriture par lots) est décrit en RG-00-16 à RG-00-22.

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Apprenant sans téléphone ou batterie vide | L'intervenant le marque présent à la main (source « manuel » sur la feuille) |
| Photo du QR envoyée à un absent | Le jeton expire en moins de 15 secondes ; un scan hors site est marqué « à vérifier » |
| Panne du vidéoprojecteur | Le QR s'affiche sur le téléphone de l'intervenant, ou l'appel se fait à la main |
| Panne totale de réseau dans la salle | Les scans sont gardés sur les téléphones et envoyés dès le retour du réseau (fenêtre de grâce, RG-00-19) ; l'intervenant valide plus tard |
| Intervenant absent, séance assurée par un remplaçant non prévu | La scolarité affecte le remplaçant à la séance ; il fait l'appel normalement |
| Apprenant inscrit dans le mauvais groupe | Son scan est refusé (« non attendu à cette séance ») ; l'intervenant peut l'ajouter, ce qui signale l'anomalie à la scolarité |
| Justificatif déposé pour une absence déjà notifiée au tuteur | La validation met à jour le statut visible par le tuteur ; aucun nouvel email |

## 8. Critères d'acceptation

- [ ] Test de charge : 5 000 scans en 60 secondes sur 4 vCPU / 8 Go, p99 inférieur à 200 ms, zéro scan perdu ou en double (RG-00-22).
- [ ] Un appel de 30 apprenants, de l'affichage du QR à la validation, prend moins de 2 minutes en conditions réelles (test en école pilote).
- [ ] Un QR photographié et scanné 20 secondes plus tard est refusé.
- [ ] Un scan hors du périmètre est enregistré « à vérifier », et aucune position n'est stockée en base (test automatisé).
- [ ] Un refus d'autorisation de localisation n'empêche pas le scan.
- [ ] La feuille d'une séance contient toutes les mentions de RG-06-25 ; toute modification après validation crée une nouvelle version avec une nouvelle empreinte.
- [ ] Les feuilles mensuelles d'une promotion de 30 apprenants sont générées en moins de 2 minutes.
- [ ] Un justificatif validé passe toutes les absences concernées en « justifié » sans modifier la feuille signée.
- [ ] Un intervenant et un tuteur ne peuvent jamais ouvrir un justificatif (test automatisé).

## 9. Exigences propres au module

- **Performance** : voir RG-00-16 à RG-00-22 et le test de charge ci-dessus. L'affichage du QR et la liste d'appel se mettent à jour en temps réel (moins d'une seconde).
- **Preuve** : les feuilles et leurs versions sont conservées avec leur empreinte, de façon inaltérable, pendant la durée de conservation paramétrée.
- **RGPD** : localisation conforme à RGPD-03 ; justificatifs visibles par la seule scolarité et la pédagogie (RG-06-20) ; empreinte d'appareil stockée sous forme hachée.
- **Accessibilité** : un apprenant qui ne peut pas utiliser la caméra émarge avec le code à 6 chiffres.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Contrôles anti-fraude par défaut | QR rotatif, localisation et validation par l'intervenant ; appareil lié désactivé |
| Signature de l'intervenant | Validation horodatée, signature électronique simple (RG-06-13) |
| Scan des apprenants par l'intervenant | Non ; appel manuel en secours |
| SMS | V2 |
| Signature manuscrite à l'écran | V2, en option, si un OPCO ou une école pilote l'exige |

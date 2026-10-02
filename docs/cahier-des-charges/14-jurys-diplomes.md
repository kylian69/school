# Cahier des charges Scolaly — 14 · Jurys, PV et diplomation

> Statut : **validé** le 02/10/2026.
> Document de travail (avec le schéma du circuit de diplomation) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b
## 1. Objectif et périmètre

Ce module conduit chaque apprenant de ses résultats validés jusqu'à son diplôme : contrôle d'éligibilité, préparation et tenue du jury, procès-verbal signé, rattrapage, publication, puis documents de fin de parcours conformes, ou transmission au certificateur quand le titre appartient à un tiers. **Phase : V2.**

**Inclus :**

- **deux modes de délivrance** (décision du 01/10/2026) : diplôme ou titre délivré par l'école, ou titre d'un certificateur tiers (titre RNCP d'un autre organisme, diplôme d'État, université partenaire) ;
- conditions d'éligibilité vérifiées automatiquement ;
- préparation du jury, grille de délibération, décisions motivées, PV signé électroniquement ;
- **rattrapage simple** (décision du 01/10/2026) : une session de rattrapage et un second jury par année et par formation ;
- publication des résultats et suivi des recours ;
- **documents conformes** (décision du 01/10/2026) : attestation de réussite, relevé final, certificat de blocs, diplôme, supplément au diplôme en option, avec QR code de vérification ;
- registre des diplômes délivrés et remis.

**Exclus :**

- calcul des moyennes, ECTS et blocs (module 07, dont ce module réutilise le moteur) ;
- organisation des épreuves et examens en ligne (module 15) ;
- connexion directe aux systèmes des certificateurs tiers (export seulement pour l'instant) ;
- sessions de rattrapage multiples et règles avancées (version ultérieure).

## 2. Acteurs et droits

Les membres du jury peuvent être internes ou extérieurs (professionnels, représentants du certificateur) ; les extérieurs accèdent à la grille par un lien sécurisé, limité à la session.

| Action | Admin | Direction | Responsable pédagogique | Scolarité | Membre du jury | Apprenant |
| --- | --- | --- | --- | --- | --- | --- |
| Paramétrer certificateur, éligibilité et modèles | Oui | Lecture | Ses formations | Non | Non | Non |
| Préparer le jury et convoquer | Oui | Oui | Oui | Oui | Non | Non |
| Consulter la grille de jury | Oui | Oui | Ses formations | Oui | Pendant la session | Non |
| Délibérer et décider | Non | S'il est membre | S'il est membre | Non | Oui | Non |
| Signer le PV | Non | S'il est membre | S'il est membre | Non | Oui | Non |
| Publier les résultats | Oui | Oui | Oui | Oui | Non | Non |
| Générer et remettre les documents | Oui | Oui | Non | Oui | Non | Les siens |
| Déposer un recours | Non | Non | Non | Non | Non | Oui |

Toute personne qui scanne le QR code d'un document accède à la page publique de vérification, sans compte.

## 3. User stories

Le module compte 16 user stories, dont 12 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-14-01 | responsable pédagogique | paramétrer le certificateur et les conditions d'éligibilité de ma formation | appliquer le référentiel du titre | Must |
| US-14-02 | scolarité | voir qui est éligible avant le jury, avec la raison de chaque refus | préparer les dossiers à temps | Must |
| US-14-03 | responsable pédagogique | générer la grille de jury avec une proposition de décision par apprenant | ne discuter que des cas limites | Must |
| US-14-04 | scolarité | convoquer les membres et leur ouvrir la grille | tenir le jury sans papier | Must |
| US-14-05 | président du jury | modifier une décision pendant la séance en indiquant le motif | garder une trace de chaque dérogation | Must |
| US-14-06 | président du jury | signer le PV électroniquement à la clôture | rendre les décisions officielles le jour même | Must |
| US-14-07 | responsable pédagogique | organiser le rattrapage des éléments non acquis et un second jury | donner une seconde chance | Must |
| US-14-08 | apprenant | voir mon résultat à la date de publication et savoir comment faire un recours | connaître mes droits | Must |
| US-14-09 | apprenant diplômé | télécharger mon attestation de réussite tout de suite | la fournir à un employeur | Must |
| US-14-10 | scolarité | générer les diplômes conformes de toute une promotion | ne rien remplir à la main | Must |
| US-14-11 | employeur | vérifier l'authenticité d'un diplôme en scannant son QR code | éviter les faux | Must |
| US-14-12 | scolarité | exporter le PV au format du certificateur et suivre sa réponse | obtenir les titres de nos apprenants | Must |
| US-14-13 | scolarité | tenir le registre des diplômes délivrés et remis | répondre à toute demande | Should |
| US-14-14 | direction | être alertée de l'échéance d'un enregistrement RNCP | ne pas présenter d'apprenants à un titre expiré | Should |
| US-14-15 | scolarité | corriger une erreur par un PV rectificatif sans perdre l'original | rester irréprochable | Should |
| US-14-16 | apprenant | obtenir le supplément au diplôme | faire reconnaître mon diplôme à l'étranger | Could |

## 4. Règles de gestion

Circuit de diplomation (schéma dans le document de travail) : la grille de la promotion est préparée, l'éligibilité contrôlée, puis le jury délibère ; les ajournés autorisés passent le rattrapage et un second jury. Le PV signé permet la publication, puis la génération des documents par l'école ou la transmission au certificateur tiers.

### Paramétrage et éligibilité

- **RG-14-01** : chaque formation déclare son mode de délivrance : diplôme ou titre délivré par l'école, ou titre d'un certificateur tiers. Elle indique le certificateur, le code RNCP ou RS, l'intitulé exact et le niveau tels qu'enregistrés, et la date de fin de l'enregistrement ; une alerte part avant cette échéance.
- **RG-14-02** : les conditions d'éligibilité sont choisies et réglées par formation : validation de l'année, des UE ou des blocs par le moteur du module 07 ; assiduité minimale (module 06) ; livret complet et signé (module 13) ; pièces exigées (rapport de stage, mémoire, soutenance, attestation d'entreprise) ; durée minimale de formation ; conditions propres au référentiel du certificateur. Les impayés ne sont jamais une condition (décision du module 11).
- **RG-14-03** : chaque condition est vérifiée automatiquement quand c'est possible, sinon cochée par la scolarité avec la pièce justificative. Un apprenant non éligible n'est présenté au jury que sur dérogation motivée, qui figure au PV.

### Préparation du jury

- **RG-14-04** : un jury couvre une ou plusieurs promotions et une session (principale ou rattrapage). Il a une date, un lieu ou une visio, un président, des membres (internes et extérieurs, dont des professionnels si le référentiel l'exige) et un quorum paramétrable. Les membres sont convoqués par email avec une invitation d'agenda.
- **RG-14-05** : la grille de jury est construite à partir des résultats validés du module 07. Pour chaque apprenant : résultats par UE ou bloc, ECTS, compétences, assiduité, éligibilité, livret, alertes, et une proposition de décision calculée. Les résultats sont figés à l'ouverture de la séance ; une note modifiée ensuite est signalée sur la grille.

### Délibération et PV

- **RG-14-06** : en séance, le jury confirme ou modifie chaque proposition : décision, mention, points de jury dans la limite de la règle de la formation (RG-02-26). Toute décision différente de la proposition exige un motif. Chaque modification est horodatée et attribuée.
- **RG-14-07** : décisions possibles : admis (avec mention le cas échéant) ; ajourné ; autorisé au rattrapage ; validation partielle (UE ou blocs acquis, conservés pour une session suivante, les blocs restant acquis selon RG-02-07) ; exclu de la session (fraude ou décision disciplinaire, avec renvoi au règlement).
- **RG-14-08** : à la clôture, si le quorum est atteint, la délibération est verrouillée. Le PV est généré (membres présents, décisions, mentions, dérogations, points de jury) puis signé électroniquement par le président et les membres (service de signature du module 13). Une erreur constatée après clôture se corrige par un PV rectificatif, signé de la même façon ; l'original est conservé.

### Rattrapage (version simple)

- **RG-14-09** : une session de rattrapage par année et par formation. Les apprenants autorisés repassent seulement les éléments non acquis (évaluations de type rattrapage du module 07), avec un plafond de note éventuel (RG-02-26). Un second jury statue selon le même circuit. Des sessions multiples et des règles plus fines viendront dans une version ultérieure.
- **RG-14-10** : les épreuves de rattrapage sont planifiées dans l'emploi du temps (module 04) et notifiées aux seuls apprenants concernés.

### Publication et recours

- **RG-14-11** : les résultats sont publiés à la date choisie, dans le portail de l'apprenant et par email (et au tuteur si l'école l'autorise). L'inscription des admis passe à l'état « diplômé » (RG-02-13). Le délai et la procédure de recours s'affichent avec le résultat ; chaque recours est enregistré et suivi jusqu'à sa réponse.
- **RG-14-12** : les résultats publiés alimentent le taux de réussite des indicateurs publiés (RG-12-20) et le registre des diplômés.

### Documents de fin de parcours

- **RG-14-13** : Scolaly fournit des modèles conformes aux mentions obligatoires et au format en vigueur, tenus à jour dans une table datée. L'école les habille à ses couleurs sans pouvoir retirer une mention obligatoire. Documents : attestation de réussite (dès la publication), relevé de notes final, certificat de blocs de compétences, diplôme ou titre (quand l'école est certificateur) et, en option, supplément au diplôme au modèle européen.
- **RG-14-14** : le diplôme porte au minimum l'intitulé exact et le niveau tels qu'enregistrés, le code RNCP, le nom du certificateur, l'identité du titulaire (nom, prénoms, date et lieu de naissance), la mention éventuelle, la date de délibération, le lieu de délivrance, les signatures autorisées et un numéro unique. Une mention obligatoire manquante bloque la génération, avec la liste des manques.
- **RG-14-15** : un diplôme n'est généré que pour un apprenant admis par un PV signé. Son numéro est unique et séquentiel par organisation et par formation, et il est inscrit au registre (numéro, titulaire, formation, date de délibération, date et mode de remise). Un duplicata porte la mention « duplicata » et sa date, et reste lié à l'original.
- **RG-14-16** : tous ces documents portent le QR code de vérification (RG-07-17) : la page publique confirme l'authenticité, l'intitulé et la date, sans afficher les notes, et indique « remplacé » pour un document annulé. Les diplômes sont produits en PDF haute définition, au format du modèle (A4 ou A3), imprimables sur papier sécurisé.
- **RG-14-17** : la remise du diplôme est enregistrée (en main propre, par courrier recommandé, lors d'une cérémonie), avec un accusé de réception signé si l'école le souhaite.

### Certificateur tiers

- **RG-14-18** : quand le titre appartient à un tiers, l'école lui transmet le PV et les résultats au format qu'il demande, grâce à un modèle d'export paramétrable (CSV, tableur ou PDF), avec les pièces demandées. Il n'y a pas de connexion directe pour l'instant.
- **RG-14-19** : Scolaly suit la réponse du certificateur (en attente, décision reçue, parchemins reçus). Sa décision, saisie ou importée, fait foi pour l'état « diplômé ». Les parchemins reçus sont inscrits au registre et leur remise est tracée. L'attestation de réussite émise par l'école indique alors que la décision finale appartient au certificateur.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-14-01 · Paramètres de diplomation | Responsable pédagogique, admin | Mode de délivrance, certificateur, RNCP, conditions d'éligibilité, modèles de documents |
| E-14-02 · Contrôle d'éligibilité | Scolarité, responsable pédagogique | Apprenants d'une promotion, conditions remplies ou non, pièces, dérogations |
| E-14-03 · Préparation du jury | Scolarité, responsable pédagogique | Composition, quorum, convocations, date et lieu |
| E-14-04 · Grille de délibération | Membres du jury | Une ligne par apprenant, proposition et décision, points de jury, motif, filtre « à discuter », affichage plein écran projetable |
| E-14-05 · Procès-verbal | Président, scolarité | Aperçu, signatures, PV rectificatif |
| E-14-06 · Rattrapage | Responsable pédagogique, scolarité | Apprenants concernés, éléments à repasser, planification, second jury |
| E-14-07 · Publication et recours | Scolarité, direction | Date de publication, canaux, recours et réponses |
| E-14-08 · Documents et registre | Scolarité | Génération en lot, aperçu, numéros, remise, duplicatas |
| E-14-09 · Certificateur tiers | Scolarité | Exports, statut de la réponse, parchemins reçus |
| E-14-10 · Mon résultat | Apprenant | Décision, documents à télécharger, recours |
| E-14-11 · Vérification d'un document | Public | Authenticité, intitulé, date, état (valide ou remplacé) |

### Parcours « du dernier examen au diplôme »

1. Les résultats de l'année sont validés (module 07) ; la scolarité lance le contrôle d'éligibilité.
2. Le responsable pédagogique génère la grille ; les membres sont convoqués.
3. En séance, le jury confirme les propositions, motive les cas limites et clôt ; le PV est signé.
4. Les ajournés autorisés passent le rattrapage, puis un second jury statue.
5. Les résultats sont publiés ; les admis téléchargent leur attestation ; les diplômes sont générés (ou le PV part au certificateur), remis et inscrits au registre.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Paramètres de diplomation | formation, mode de délivrance, certificateur, code RNCP ou RS, intitulé, niveau, fin d'enregistrement, conditions, modèles | un par version de formation |
| Éligibilité | inscription, condition, état, pièce, vérifiée par, dérogation | recalculée jusqu'au jury |
| Jury | promotions, session, date, lieu, président, membres, quorum, statut | contient les décisions |
| Décision | inscription, proposition, décision, mention, points de jury, motif, auteur, horodatage | figée à la clôture |
| PV | jury, version (original ou rectificatif), PDF, procédure de signature | lié au jury |
| Recours | inscription, date, motif, statut, réponse | lié à une décision |
| Document de fin de parcours | type, inscription, modèle, numéro, PDF, empreinte, état (valide ou remplacé) | duplicatas liés à l'original |
| Registre des diplômes | numéro, titulaire, formation, date de délibération, remise, origine (école ou tiers) | une ligne par diplôme |
| Transmission au certificateur | jury, certificateur, export, date, statut, décision reçue | une par jury et certificateur |
| Modèle réglementaire | type de document, mentions obligatoires, format, dates de validité | commun à toutes les organisations |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Note modifiée après la création de la grille | L'écart est signalé sur la grille et la proposition recalculée ; le jury décide en le voyant |
| Quorum non atteint | La séance ne peut pas être close ; le jury est reporté |
| Pièce manquante pour un apprenant | Non éligible ; présenté seulement sur dérogation motivée |
| Erreur découverte après publication | PV rectificatif, nouvelle publication, documents réémis ; les anciens apparaissent « remplacés » à la vérification |
| Enregistrement RNCP expiré pour une promotion en cours | Alerte ; la règle de l'enregistrement pour les apprenants déjà entrés en formation s'applique (paramétrable) |
| Certificateur tiers qui ne suit pas la décision de l'école | Sa décision est saisie, l'état de l'apprenant mis à jour et l'apprenant prévenu |
| Diplôme perdu | Duplicata tracé et lié à l'original |
| Mention obligatoire manquante (date de naissance…) | Génération bloquée avec la liste des manques |

## 8. Critères d'acceptation

- [ ] Le contrôle d'éligibilité d'une promotion de 150 apprenants prend moins de 10 secondes et explique chaque condition non remplie.
- [ ] Les propositions de décision suivent les règles de la formation sur 3 jeux de test (notes, blocs, compétences).
- [ ] Une décision différente de la proposition sans motif est refusée.
- [ ] Le PV est signé par le président et les membres puis verrouillé ; un rectificatif conserve l'original.
- [ ] Aucun diplôme ne peut être généré sans décision « admis » dans un PV signé.
- [ ] Les diplômes d'une promotion de 150 apprenants sont générés en moins de 2 minutes, avec des numéros uniques sans doublon.
- [ ] Le QR code d'un document valide affiche « authentique » ; celui d'un document remplacé affiche « remplacé ».
- [ ] L'export paramétré pour un certificateur tiers reproduit exactement les colonnes attendues sur un jeu de test.

## 9. Exigences propres au module

- **Intégrité** : décisions horodatées et attribuées, non modifiables après clôture ; journal complet ; empreinte de chaque document.
- **Conformité** : mentions obligatoires et formats dans des tables datées tenues à jour par Scolaly, non supprimables par l'école.
- **Confidentialité** : grille visible des seuls membres pendant la session ; page de vérification sans notes.
- **Ergonomie de séance** : grille projetable en plein écran, utilisable au clavier, décision en un clic pour les cas sans discussion.
- **Conservation** : PV et registre des diplômes conservés sur une longue durée paramétrable, sans limite par défaut.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Délivrance | Deux cas : diplôme de l'école, ou titre d'un certificateur tiers (export du PV et des résultats) |
| Rattrapage | Gestion simple : une session de rattrapage et un second jury ; version plus fine plus tard |
| Documents | Conformes aux conditions de délivrance, aux mentions obligatoires et au format en vigueur ; QR code de vérification ; supplément au diplôme en option |

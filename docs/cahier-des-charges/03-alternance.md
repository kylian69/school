# Cahier des charges Scolaly — 03 · Alternance et stages (base)

> Statut : **validé** le 01/10/2026.
> Document de travail : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objectif et périmètre

Ce module permet de suivre chaque alternant et chaque stagiaire dans le triangle école – apprenant – entreprise dès le MVP : qui est son employeur ou son organisme d'accueil, qui l'encadre, quand il est à l'école, combien d'heures il a suivies, et prévenir le tuteur de ses absences. Le dossier contractuel complet (CERFA, dépôt OPCO, facturation) arrive en V2 (modules 10 et 11). **Phase : MVP.**

**Inclus :**

- entreprises : fiche pré-remplie à partir du SIRET, contacts, OPCO ;
- tuteurs et maîtres d'apprentissage ;
- fiche contrat simplifiée : type, dates, entreprise, tuteur, OPCO, statut, contrat signé en PDF ;
- **conventions de stage des étudiants en formation initiale** (décision du 01/10/2026) ;
- **rythmes d'alternance** : modèles, calendrier par promotion, exceptions individuelles, calendrier PDF pour l'entreprise ;
- heures de formation prévues et réalisées par alternant, avec le contrôle du minimum légal ;
- référent école de chaque alternant ;
- **portail tuteur** ; notifications d'absence au tuteur (décision du 01/10/2026).

**Exclus** (V2) :

- CERFA FA13 / EJ20, dépôt et suivi OPCO, NPEC, facturation OPCO (modules 10 et 11) ;
- CRM et recherche d'entreprise pour les candidats (module 09) ;
- livret d'apprentissage, visites en entreprise, évaluation du stagiaire, signature électronique des conventions (module 13).

## 2. Acteurs et droits

| Action | Admin | Resp. pédagogique | Scolarité | Référent école | Apprenant | Tuteur |
| --- | --- | --- | --- | --- | --- | --- |
| Créer ou modifier une entreprise | Oui | Oui | Oui | Lecture | Non | Lecture (la sienne) |
| Créer ou modifier un contrat ou une convention de stage | Oui | Oui | Oui | Lecture | Lecture (le sien) | Lecture (ses alternants ou stagiaires) |
| Inviter un tuteur | Oui | Oui | Oui | Non | Non | Non |
| Définir les rythmes d'alternance | Oui | Oui | Lecture | Lecture | Lecture (le sien) | Lecture (ses alternants) |
| Consulter les heures prévues et réalisées | Oui | Oui | Oui | Oui (ses alternants) | Oui (les siennes) | Oui (ses alternants) |
| Consulter l'assiduité | Oui | Oui | Oui | Oui | Oui | Oui (ses alternants) |
| Consulter les notes | Oui | Oui | Oui | Oui | Oui | Seulement si l'option est activée (RG-00-14) |

Le référent école n'est pas un nouveau rôle : c'est un intervenant ou un membre du personnel désigné sur la fiche de l'alternant (ou l'enseignant référent d'un stage). Ce lien lui donne les droits ci-dessus.

## 3. User stories

Le module compte 15 user stories, dont 12 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-03-01 | scolarité | créer une entreprise en saisissant seulement son SIRET | éviter la saisie et les erreurs d'adresse | Must |
| US-03-02 | scolarité | enregistrer le contrat d'un alternant (type, dates, entreprise, tuteur, OPCO) et joindre le contrat signé | avoir un dossier complet et à jour | Must |
| US-03-03 | scolarité | inviter le tuteur sur Scolaly en un clic depuis le contrat | qu'il suive son alternant sans demander d'informations par email | Must |
| US-03-04 | responsable pédagogique | définir le rythme d'alternance d'une promotion sur un calendrier annuel, à partir d'un modèle | que l'EDT ne place des cours que les jours d'école | Must |
| US-03-05 | responsable pédagogique | appliquer un rythme différent à un alternant particulier | gérer les cas spécifiques (entreprise saisonnière, aménagement) | Should |
| US-03-06 | scolarité | générer le calendrier d'alternance en PDF pour l'entreprise | l'annexer au contrat et informer l'employeur | Must |
| US-03-07 | responsable pédagogique | voir pour chaque alternant ses heures prévues et réalisées, et l'écart avec le minimum légal | anticiper les problèmes de financement | Must |
| US-03-08 | tuteur | recevoir un email quand mon alternant est absent sans justificatif | réagir rapidement | Must |
| US-03-09 | tuteur | voir sur mon téléphone le calendrier, l'assiduité et ce qui a été vu en cours par mon alternant | suivre sa formation | Must |
| US-03-10 | tuteur | m'abonner au calendrier d'alternance dans mon agenda (iCal) | savoir quand mon alternant est à l'école | Should |
| US-03-11 | apprenant | voir mon entreprise, mon tuteur, mon référent école et mon calendrier d'alternance | savoir où je dois être chaque jour | Must |
| US-03-12 | scolarité | enregistrer la rupture d'un contrat avec sa date et son motif | fermer les accès du tuteur et adapter le suivi | Must |
| US-03-13 | référent école | voir la liste de mes alternants avec leurs alertes (absences, heures, fin de période d'essai) | les suivre en priorité | Must |
| US-03-14 | scolarité | être alertée des contrats qui se terminent ou des périodes d'essai qui expirent | ne rien laisser passer | Should |
| US-03-15 | scolarité | enregistrer la convention de stage d'un étudiant en formation initiale, avec contrôle automatique de la gratification et de la durée maximale | respecter la loi et suivre les stagiaires comme les alternants | Must |

## 4. Règles de gestion

### Entreprises et tuteurs

- **RG-03-01** : une entreprise est identifiée par le SIRET de l'établissement employeur, unique dans l'organisation. La saisie du SIRET pré-remplit la raison sociale, l'adresse, le code NAF et l'effectif depuis l'annuaire public des entreprises (API Recherche d'entreprises de l'État). Les établissements d'une même entreprise sont regroupés par SIREN.
- **RG-03-02** : l'entreprise porte aussi sa convention collective (IDCC) et son OPCO. L'OPCO est proposé automatiquement à partir de l'IDCC, grâce à une table de correspondance tenue à jour par Scolaly, et reste modifiable.
- **RG-03-03** : une entreprise a des contacts (RH, dirigeant, tuteurs). Un tuteur est une personne du module 01, avec le rôle tuteur et un lien vers son entreprise ; sa fonction et son ancienneté sont enregistrées, car le CERFA de la V2 les exige.
- **RG-03-04** : un maître d'apprentissage peut encadrer au plus 2 apprentis, plus 1 apprenti dont la formation est prolongée (Code du travail). Au-delà, un avertissement s'affiche sans bloquer, car l'école ne contrôle pas toujours l'information.

### Contrats (fiche simplifiée du MVP)

- **RG-03-05** : un contrat porte un type (apprentissage, professionnalisation, stage, autre), un apprenant, une entreprise, un ou deux tuteurs, des dates de début et de fin, l'OPCO, un numéro de dépôt facultatif, le contrat signé en PDF et un statut : *brouillon* → *signé* → *en cours* → *terminé* ou *rompu*.
- **RG-03-06** : un contrat d'apprentissage ou de professionnalisation en cours passe automatiquement l'inscription de l'apprenant au statut correspondant, à la date de début du contrat (RG-00-06). Le statut repasse à initial si l'apprenant reste inscrit après une rupture.
- **RG-03-07** : la rupture enregistre une date, un motif (période d'essai, accord commun, démission, licenciement, autre) et, pour un apprenti, la poursuite de la formation éventuelle (jusqu'à 6 mois sans employeur, selon la réglementation en vigueur). L'accès du tuteur se ferme le jour de la rupture.
- **RG-03-08** : la fin de période d'essai est calculée : 45 jours de présence en entreprise pour un contrat d'apprentissage, d'après le calendrier d'alternance. Une alerte est envoyée 7 jours avant à la scolarité et au référent école.
- **RG-03-09** : un apprenant peut avoir plusieurs contrats successifs (changement d'entreprise), mais jamais deux contrats en cours sur la même période.

### Stages en formation initiale (MVP)

- **RG-03-22** : un étudiant en formation initiale peut avoir une ou plusieurs conventions de stage. Une convention porte l'organisme d'accueil (créé par SIRET comme une entreprise), le tuteur en entreprise, l'enseignant référent (obligatoire), les dates, la durée de présence en heures, les missions, la gratification (montant horaire) et la convention signée en PDF. La signature électronique tripartite arrive en V2 (module 13).
- **RG-03-23** : Scolaly calcule la durée de présence et applique deux contrôles légaux, dont les seuils sont paramétrables : une gratification est obligatoire au-delà de 2 mois (308 heures de présence) au cours d'une même année d'enseignement, et un stage ne peut pas dépasser 6 mois par organisme d'accueil et par année d'enseignement. Un dépassement est signalé avant l'enregistrement.
- **RG-03-24** : un stage ne change pas le statut de l'étudiant (il reste en formation initiale). Ses dates apparaissent dans son calendrier comme des jours en entreprise : l'EDT les signale comme pour un alternant (RG-03-13), et l'étudiant n'est pas attendu aux séances pendant le stage.
- **RG-03-25** : le tuteur de stage a le même portail que le tuteur d'alternance, limité à la durée du stage. En fin de stage, Scolaly génère un modèle d'attestation de stage à compléter par l'organisme d'accueil. L'évaluation du stagiaire par le tuteur arrive en V2 (module 13).

### Rythmes d'alternance

- **RG-03-10** : un modèle de rythme décrit un motif qui se répète (par exemple lundi-mardi à l'école ; 1 semaine école / 3 semaines entreprise ; semaines A / B). Scolaly fournit 5 modèles courants ; l'école peut en créer d'autres.
- **RG-03-11** : le rythme d'une promotion est un calendrier jour par jour (école, entreprise, fermé, examen), généré à partir d'un modèle puis retouché à la main sur le calendrier annuel. Les jours fériés et fermetures du module 01 sont appliqués automatiquement.
- **RG-03-12** : une exception individuelle remplace le rythme de la promotion pour un apprenant, sur tout ou partie de l'année.
- **RG-03-13** : le module 04 utilise le rythme pour signaler toute séance placée un jour entreprise pour un ou plusieurs apprenants du groupe. C'est un avertissement, pas un blocage.
- **RG-03-14** : le calendrier d'alternance s'exporte en PDF (une page par année, aux couleurs de l'école) et se publie en flux iCal par alternant et par tuteur.

### Heures de formation

- **RG-03-15** : les heures prévues d'un alternant sont la somme des séances publiées de ses groupes, entre les dates de début et de fin de son contrat. Les heures réalisées sont les heures des séances où il est présent ; les retards sont déduits au prorata. Les absences justifiées sont affichées à part.
- **RG-03-16** : Scolaly contrôle le minimum légal de formation et alerte en cas d'écart : 25 % de la durée du contrat pour l'apprentissage ; 15 % et au moins 150 heures pour la professionnalisation. Ces seuils sont paramétrables, car ils peuvent évoluer.
- **RG-03-17** : les heures sont recalculées chaque nuit et après chaque modification d'EDT ou d'émargement. L'historique mensuel est conservé pour les justificatifs OPCO de la V2.

### Notifications d'absence (décision du 01/10/2026)

- **RG-03-18** : à chaque absence constatée (module 06), l'apprenant reçoit le jour même une notification (push et email) avec un lien pour déposer un justificatif.
- **RG-03-19** : le tuteur reçoit un email en fin de demi-journée (à 12 h et à 16 h 30 par défaut, paramétrables par l'école) pour chaque alternant absent sans justificatif sur cette demi-journée. Un seul email regroupe tous ses alternants concernés. L'école peut choisir un récapitulatif quotidien à la place.
- **RG-03-20** : la scolarité et le référent école sont alertés quand un seuil est atteint : 3 demi-journées non justifiées sur 30 jours glissants par défaut, paramétrable par formation. L'alerte apparaît sur leur accueil et par email.
- **RG-03-21** : si un justificatif est déposé et validé avant l'envoi au tuteur, l'absence n'est pas notifiée. Le tuteur n'a jamais accès au contenu du justificatif, seulement au statut « justifiée » ou « non justifiée ».

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-03-01 · Entreprises | Scolarité, resp. pédagogique | Liste filtrable (OPCO, nombre d'alternants, ville), création par SIRET |
| E-03-02 · Fiche entreprise | Idem | Identité, contacts et tuteurs, alternants et stagiaires actuels et passés, contrats |
| E-03-03 · Contrats et stages | Scolarité, resp. pédagogique | Tableau par type et statut ; alertes (fin de période d'essai, fin de contrat, apprenant sans contrat dans une formation en alternance, gratification ou durée de stage) |
| E-03-04 · Fiche contrat ou convention | Idem ; lecture pour l'apprenant et le tuteur | Données, PDF signé, tuteurs (bouton « Inviter »), historique, rupture |
| E-03-05 · Rythmes d'alternance | Resp. pédagogique | Calendrier annuel coloré (école, entreprise, fermé), modèles, exceptions individuelles, export PDF |
| E-03-06 · Suivi des heures | Resp. pédagogique, scolarité, référent | Par alternant : heures prévues, réalisées, absences justifiées, part de formation et écart au minimum légal |
| E-03-07 · Mes alternants | Référent école | Liste avec alertes, accès rapide à chaque dossier |
| E-03-08 · Accueil tuteur (mobile) | Tuteur | Ses alternants ou stagiaires ; pour chacun : où il est aujourd'hui, calendrier, assiduité du mois, cahier de texte, notes si l'option est activée, contact du référent école |
| E-03-09 · Mon alternance / mon stage | Apprenant | Entreprise, tuteur, référent, calendrier d'alternance, heures réalisées |

### Parcours « nouvel alternant » (scolarité)

1. Sur la fiche de l'apprenant, la scolarité clique « Ajouter un contrat ».
2. Elle saisit le SIRET : l'entreprise est retrouvée ou créée automatiquement (RG-03-01).
3. Elle choisit ou crée le tuteur, saisit le type et les dates, et joint le contrat signé.
4. Elle clique « Inviter le tuteur » : il reçoit un email d'activation.
5. L'inscription passe au statut apprenti à la date de début (RG-03-06), et le calendrier d'alternance PDF est proposé au téléchargement.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Entreprise | SIRET, SIREN, raison sociale, adresse, NAF, effectif, IDCC, OPCO, statut | a des contacts, des tuteurs et des contrats |
| Contact entreprise | personne, fonction, type (RH, dirigeant, tuteur), ancienneté | relie une personne à une entreprise |
| Contrat | type, apprenant, entreprise, dates, OPCO, numéro de dépôt, statut, date et motif de rupture, PDF | a 1 ou 2 tuteurs ; modifie le statut de l'inscription |
| Convention de stage | étudiant, organisme d'accueil, tuteur, enseignant référent, dates, heures de présence, missions, gratification horaire, statut, PDF signé | liée à une inscription en formation initiale ; alimente le calendrier de l'étudiant |
| Modèle de rythme | nom, motif (jours école / entreprise sur 1 à 4 semaines) | sert à générer des calendriers |
| Calendrier d'alternance | promotion, liste des jours avec leur type (école, entreprise, fermé, examen) | appartient à une promotion |
| Exception de rythme | inscription, période, jours avec leur type | remplace le calendrier de la promotion pour un apprenant |
| Suivi d'heures (mensuel) | inscription, mois, heures prévues, réalisées, absences justifiées | calculé à partir des modules 04 et 06 |
| Référent école | inscription, personne | relie un alternant à son référent |
| Table IDCC → OPCO | IDCC, OPCO, date de validité | tenue à jour par Scolaly, commune à toutes les organisations |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| SIRET inconnu ou API indisponible | Saisie manuelle possible ; l'entreprise est marquée « à vérifier » et la vérification est relancée plus tard |
| Entreprise fermée selon l'annuaire | Avertissement à la création d'un contrat |
| Tuteur qui change en cours de contrat | Nouveau tuteur avec une date d'effet ; l'ancien perd l'accès à cette date |
| Contrat signé après le début de la formation | Statut apprenti à la date du contrat ; la période précédente reste en initial |
| Apprenant en rupture sans nouvel employeur | Reste inscrit au statut « apprenti sans employeur » pendant la durée légale ; alerte à l'échéance |
| Séance un jour entreprise | Avertissement dans l'EDT (RG-03-13) ; si la séance est maintenue, l'apprenant concerné n'est pas compté absent par défaut |
| Tuteur sans email | Pas de portail ; le calendrier et l'assiduité lui sont envoyés en PDF par la scolarité |
| Stage de plus de 308 heures sans gratification saisie | Enregistrement bloqué tant que la gratification n'est pas renseignée (sauf dérogation tracée) |

## 8. Critères d'acceptation

- [ ] La saisie d'un SIRET valide pré-remplit l'entreprise en moins de 2 secondes.
- [ ] Un rythme « 2 jours / 3 jours » est généré pour une année entière, avec les jours fériés exclus, en un clic.
- [ ] Le calendrier d'alternance PDF est généré en moins de 5 secondes et tient sur une page A4.
- [ ] Un tuteur reçoit un seul email pour 3 alternants absents la même demi-journée, et aucun email si l'absence a été justifiée avant l'envoi.
- [ ] Un tuteur ne voit plus rien de son ancien alternant le lendemain de la rupture du contrat (test automatisé).
- [ ] Un tuteur ne voit les notes que si l'option est activée pour la formation (test automatisé).
- [ ] Les heures réalisées d'un alternant correspondent exactement aux présences émargées sur un jeu de test d'un mois.
- [ ] L'alerte de seuil d'absences se déclenche à la 3e demi-journée non justifiée sur 30 jours.
- [ ] Une convention de stage de 400 heures sans gratification est signalée ; un stage de 7 mois dans le même organisme est signalé.

## 9. Exigences propres au module

- **Fiabilité** : les emails aux tuteurs sont envoyés par une file de tâches avec reprise en cas d'échec. Un tuteur ne reçoit jamais deux fois la même notification.
- **RGPD** : le tuteur ne voit que ce que RG-00-14 et RG-03-21 autorisent. Aucune donnée d'un autre apprenant de la promotion ne lui est accessible.
- **Données publiques** : l'appel à l'API de l'annuaire des entreprises est mis en cache 30 jours ; en self-hosted, il peut être désactivé.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Stages des étudiants en formation initiale | Dès le MVP (RG-03-22 à RG-03-25) |
| Horaires des emails aux tuteurs | 12 h et 16 h 30 par défaut, paramétrables par l'école (RG-03-19) |
| CERFA, OPCO, facturation | V2 (modules 10 et 11) |

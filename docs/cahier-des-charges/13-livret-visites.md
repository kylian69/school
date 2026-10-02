# Cahier des charges Scolaly — 13 · Livret d'apprentissage, visites et signature électronique

> Statut : **validé** le 01/10/2026.
> Document de travail (avec le schéma d'une période en entreprise) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b
## 1. Objectif et périmètre

Ce module fait le lien entre l'école et l'entreprise pendant toute l'alternance ou le stage : un livret numérique rempli à trois, des visites et entretiens suivis et documentés, et un service de signature électronique commun à tout Scolaly. Il reprend ce que le module 03 avait renvoyé à la V2 : livret, visites, évaluation du stagiaire par le tuteur (RG-03-25) et signature des conventions de stage (RG-03-22). **Phase : V2.**

**Inclus :**

- **livret numérique** rempli par l'alternant, le tuteur (ou maître d'apprentissage) et le référent école, au rythme fixé par l'école (décision du 01/10/2026) ;
- progression des compétences, école et entreprise réunies ;
- évaluation du stagiaire et attestation de fin de stage ;
- **visites et entretiens** : minimum annuel paramétrable, planification, compte rendu type, alertes de retard et de risque de rupture (décision du 01/10/2026) ;
- **service de signature électronique** (prestataire français conforme eIDAS, type Yousign) pour les conventions de stage, le livret, les comptes rendus et les attestations (décision du 01/10/2026).

**Exclus :**

- contrats d'alternance et leurs avenants (module 10, qui utilise le même service de signature) ;
- décisions de jury et diplômes (module 14), qui utilisent le livret exporté ;
- signature manuscrite sur écran pour l'émargement (déjà renvoyée en V2 dans le module 06).

## 2. Acteurs et droits

Le référent école est celui défini dans le module 03 : un intervenant ou un membre du personnel désigné sur la fiche de l'alternant. Le tuteur accède à tout depuis son portail (module 08) ou par un lien sécurisé.

| Action | Admin | Scolarité | Responsable pédagogique | Référent école | Chargé de relations entreprises | Alternant ou stagiaire | Tuteur |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Paramétrer modèles de livret, règles de suivi, signature | Oui | Non | Ses formations | Non | Non | Non | Non |
| Remplir sa partie du livret | Non | Non | Non | Oui | Non | Oui | Oui |
| Consulter le livret | Oui | Oui | Ses formations | Ses alternants | Lecture | Le sien | Ses alternants |
| Planifier un suivi et rédiger le compte rendu | Oui | Oui | Oui | Oui | Oui | Non | Choisir un créneau |
| Consulter les comptes rendus | Oui | Oui | Ses formations | Les siens | Oui | Le sien, sans les notes internes | Ceux de ses alternants, sans les notes internes |
| Envoyer un document en signature | Oui | Oui | Oui | Livret et comptes rendus | Oui | Non | Non |
| Signer | Non | Pour l'école, si délégation | Pour l'école, si délégation | Livret et comptes rendus | Non | Oui | Oui |

## 3. User stories

Le module compte 16 user stories, dont 12 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-13-01 | responsable pédagogique | choisir et adapter un modèle de livret pour ma formation | suivre ce qui compte pour ce diplôme | Must |
| US-13-02 | alternant | remplir mon livret sur mobile à la fin de chaque période | garder une trace de ce que j'apprends | Must |
| US-13-03 | tuteur | évaluer les compétences de mon alternant en quelques minutes, sans mot de passe | ne pas perdre de temps | Must |
| US-13-04 | référent école | commenter et valider chaque période | relier l'entreprise et les cours | Must |
| US-13-05 | responsable pédagogique | voir l'avancement des livrets d'une promotion et relancer | qu'aucun livret ne reste vide | Must |
| US-13-06 | alternant | voir ma progression en compétences, école et entreprise réunies | savoir où j'en suis | Should |
| US-13-07 | référent école | savoir quels alternants je dois visiter ou appeler, et avant quand | respecter les suivis prévus | Must |
| US-13-08 | référent école | proposer des créneaux au tuteur et recevoir l'invitation | organiser une visite sans aller-retour d'emails | Should |
| US-13-09 | référent école | rédiger le compte rendu sur mon téléphone pendant la visite, même sans réseau | ne rien ressaisir au bureau | Must |
| US-13-10 | chargé de relations entreprises | être alerté d'un risque de rupture | intervenir avant qu'il soit trop tard | Must |
| US-13-11 | scolarité | envoyer une convention de stage en signature électronique et voir qui a signé | lancer le stage à temps | Must |
| US-13-12 | tuteur de stage | évaluer le stagiaire et signer l'attestation en ligne | finir le stage proprement | Must |
| US-13-13 | direction | exporter le livret complet et signé | le présenter au jury ou à l'auditeur | Must |
| US-13-14 | administrateur | choisir pour quels documents la signature électronique est active | maîtriser l'usage et le coût | Must |
| US-13-15 | direction | suivre le nombre de signatures consommées | anticiper le coût | Should |
| US-13-16 | référent école | voir sur une carte les visites à faire | regrouper mes déplacements | Could |

## 4. Règles de gestion

Cycle d'une période (schéma dans le document de travail) : à la fin de chaque période en entreprise, l'alternant, le tuteur puis le référent remplissent le livret, qui est signé et met à jour la progression. En parallèle, quand un suivi est dû, la visite ou l'entretien donne un compte rendu signé ; un risque de rupture alerte l'école.

### Livret numérique

- **RG-13-01** : chaque formation a un modèle de livret versionné : rubriques (activités, compétences évaluées, appréciations, objectifs de la période suivante), contributeur de chaque rubrique et fréquence (à chaque période en entreprise, mensuelle, trimestrielle ou semestrielle). Scolaly fournit un modèle par défaut. Un nouveau modèle s'applique aux périodes suivantes, jamais aux périodes déjà ouvertes.
- **RG-13-02** : les périodes du livret sont créées à partir du calendrier d'alternance (RG-03-11) ou des dates du stage. Chaque période s'ouvre à son début et doit être complétée dans un délai paramétrable après sa fin (15 jours par défaut).
- **RG-13-03** : l'alternant décrit ses activités et sa progression ; le tuteur évalue les compétences du référentiel (module 02) mises en œuvre, sur l'échelle de la formation, et donne son appréciation ; le référent école commente et fait le lien avec les enseignements. Chacun voit les saisies des autres une fois validées. Des relances partent après la fin de la période (J+3 et J+7 par défaut).
- **RG-13-04** : le tuteur remplit sa partie depuis son portail ou par un lien reçu par email, protégé par un code à usage unique, sans mot de passe. Tout se fait sur mobile.
- **RG-13-05** : une période complète est signée par les trois contributeurs (signature électronique simple), puis verrouillée. Une correction ultérieure se fait par une note complémentaire datée.
- **RG-13-06** : les compétences évaluées en entreprise alimentent la progression de l'apprenant, à côté des évaluations de l'école (module 07). Elles ne comptent dans les moyennes que si l'école le décide.
- **RG-13-07** : le livret complet (toutes les périodes, avec les signatures) s'exporte en PDF. Il devient une preuve Qualiopi (module 12) et est disponible pour le jury (module 14).
- **RG-13-08** : pour un stage, le même mécanisme est simplifié : en fin de stage, le tuteur remplit l'évaluation du stagiaire (formulaire paramétrable : compétences, appréciation), qu'il signe, puis l'attestation de stage (RG-03-25) est générée et signée électroniquement par l'organisme d'accueil.

### Visites et entretiens

- **RG-13-09** : une règle de suivi est définie par formation et par type de contrat (apprentissage, professionnalisation, stage) : nombre minimum de suivis par an, types acceptés (visite sur place, visio, téléphone), nombre minimum de visites sur place et délai du premier contact après le début du contrat (par défaut avant la fin de la période d'essai, RG-03-08). Toutes ces valeurs sont paramétrables.
- **RG-13-10** : Scolaly calcule pour chaque alternant les suivis dus et réalisés, et alerte le référent école puis la scolarité quand un suivi est en retard.
- **RG-13-11** : pour planifier, le référent propose des créneaux que le tuteur choisit par un lien ; tous deux reçoivent une invitation d'agenda, avec l'adresse et l'itinéraire. Une carte des visites à faire aide à regrouper les déplacements.
- **RG-13-12** : le compte rendu suit un modèle paramétrable : date, type, présents, missions, compétences observées, intégration, difficultés, niveau de risque de rupture (faible, moyen, élevé), actions décidées, prochaine échéance, et des notes internes réservées au personnel. Il se saisit sur mobile, même sans réseau, et se synchronise au retour de la connexion.
- **RG-13-13** : le compte rendu est signé par le référent et par le tuteur, puis visible par l'alternant, sans les notes internes.
- **RG-13-14** : un risque moyen ou élevé alerte le référent, la scolarité et le chargé de relations entreprises, s'affiche dans le suivi des alternants (module 03) et propose un nouveau suivi dans un délai paramétrable. Les comptes rendus et les taux de suivi sont des preuves Qualiopi (module 12).

### Service de signature électronique

- **RG-13-15** : un seul service de signature sert tout Scolaly (modules 10, 13 et suivants). Il gère le circuit des signataires (ordonné ou en parallèle), le niveau de signature par type de document (simple pour le livret et les comptes rendus, avancée possible pour les conventions), l'authentification par code à usage unique, les relances, l'expiration, l'annulation, et l'archivage du PDF signé avec son dossier de preuve. Le prestataire est branché derrière un connecteur interchangeable, comme pour le paiement.
- **RG-13-16** : documents concernés : conventions de stage tripartites (étudiant, organisme d'accueil, école) et leurs avenants, périodes du livret, comptes rendus de visite, évaluations et attestations de stage, attestations d'assiduité ou de fin de formation. Les contrats d'alternance sont traités dans le module 10.
- **RG-13-17** : une convention de stage est générée à partir de la fiche du stage (RG-03-22) et du modèle de l'école, après les contrôles légaux (RG-03-23). Ordre de signature par défaut : étudiant, organisme d'accueil, école (paramétrable). Une convention non signée quelques jours avant le début du stage déclenche une alerte (délai paramétrable).
- **RG-13-18** : l'école choisit, type de document par type de document, si la signature électronique est active. Sinon, le document se signe à la main et le scan signé est déposé dans Scolaly.
- **RG-13-19** : Scolaly suit le nombre de signatures par mois et par type de document et prévient l'administrateur à 80 % du volume prévu, sans jamais bloquer un envoi. En auto-hébergement, l'école utilise son propre compte chez le prestataire ; en SaaS, les modalités sont fixées dans l'offre commerciale.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-13-01 · Suivi des alternants | Référent école, responsable pédagogique | Livrets en retard, suivis dus et en retard, niveaux de risque, relances en un clic |
| E-13-02 · Modèles de livret | Responsable pédagogique, admin | Rubriques, contributeurs, fréquence, compétences, versions |
| E-13-03 · Période du livret | Alternant, tuteur, référent école | Saisie sur mobile, évaluation des compétences, appréciations, signature |
| E-13-04 · Progression des compétences | Alternant, tuteur, référent, responsable pédagogique | Niveau atteint par compétence, école et entreprise, évolution dans le temps |
| E-13-05 · Planning des suivis | Référent école | Suivis à faire, créneaux proposés, carte, historique |
| E-13-06 · Compte rendu de visite | Référent école, tuteur | Modèle de compte rendu, saisie hors ligne, niveau de risque, signature |
| E-13-07 · Conventions de stage | Scolarité | Génération, contrôles, envoi, suivi des signatures, avenants |
| E-13-08 · Signatures | Admin, scolarité | Toutes les procédures et leurs statuts, relances, types de documents activés, consommation |
| E-13-09 · Espace tuteur | Tuteur | Ses alternants, périodes à remplir, suivis à venir, documents à signer |

### Parcours « une période en entreprise »

1. La période se termine selon le calendrier d'alternance : la période du livret s'ouvre et l'alternant est notifié.
2. L'alternant décrit ses activités ; le tuteur reçoit son lien et évalue les compétences.
3. Le référent école commente ; les trois signent la période.
4. Si un suivi est dû, le référent planifie la visite, rédige le compte rendu sur place, et le tuteur le signe.
5. Un risque de rupture alerte l'école ; sinon la progression est à jour pour le jury.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Modèle de livret | formation, version, rubriques, contributeurs, fréquence | une version active par formation |
| Livret | apprenant, contrat ou stage, modèle | contient les périodes |
| Période de livret | dates, saisies par contributeur, statut, procédure de signature | verrouillée après signature |
| Évaluation en entreprise | période, compétence (module 02), niveau, commentaire, évaluateur | alimente la progression |
| Règle de suivi | formation, type de contrat, minimum, types acceptés, délais | une par formation et type de contrat |
| Suivi | alternant, référent, tuteur, type, date, statut | a un compte rendu |
| Compte rendu | suivi, rubriques, niveau de risque, actions, notes internes, signature | preuve Qualiopi |
| Convention de stage | stage (module 03), modèle, version, statut | liée à ses avenants et à sa procédure de signature |
| Procédure de signature | document, prestataire, signataires et ordre, niveau, statuts, dates, dossier de preuve | une active par version de document |
| Paramètres de signature | organisation, types de documents activés, niveaux, compte prestataire, volume prévu | un par organisation |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Tuteur remplacé en cours de contrat | Les périodes suivantes vont au nouveau tuteur ; les périodes passées gardent l'ancien signataire |
| Tuteur qui ne remplit pas sa partie | Relances, puis alerte au référent, qui peut clore la période avec la mention « non renseignée par l'entreprise » |
| Rupture du contrat | Le livret est clos à la date de rupture et les suivis futurs sont annulés ; un nouveau contrat ouvre un nouveau livret lié au précédent |
| Visite sans réseau | Le compte rendu est enregistré sur l'appareil et synchronisé au retour de la connexion |
| Signataire qui refuse de signer | La procédure s'arrête avec le motif ; le document est corrigé et une nouvelle procédure part |
| Document modifié après l'envoi en signature | La procédure en cours est annulée et une nouvelle est lancée |
| Prestataire de signature indisponible | L'envoi est mis en file et retenté automatiquement ; l'école est prévenue au-delà d'un délai |
| Volume de signatures prévu dépassé | Alerte à l'administrateur ; les envois continuent |

## 8. Critères d'acceptation

- [ ] Un tuteur évalue une période de 8 compétences en moins de 5 minutes sur mobile, sans mot de passe (test avec 3 tuteurs).
- [ ] Les périodes du livret sont créées correctement pour 3 rythmes d'alternance différents et pour un stage.
- [ ] Pour une promotion de 30 alternants, le suivi indique exactement les suivis dus et en retard selon la règle paramétrée.
- [ ] Un compte rendu saisi hors ligne est synchronisé sans perte au retour du réseau.
- [ ] Une convention de stage est signée par les trois parties ; le PDF signé et son dossier de preuve sont archivés.
- [ ] Un risque élevé saisi dans un compte rendu déclenche l'alerte en moins d'une minute.
- [ ] Le livret complet s'exporte en PDF avec toutes ses signatures.
- [ ] Quand la signature électronique est désactivée pour un type de document, Scolaly demande le dépôt du scan signé.

## 9. Exigences propres au module

- **Mobile d'abord** : livret, évaluation et compte rendu sont pensés pour le téléphone ; le compte rendu fonctionne hors ligne.
- **Sécurité** : liens tuteur limités dans le temps et protégés par un code à usage unique ; notes internes visibles du seul personnel.
- **Signature** : un seul service, conforme eIDAS, derrière un connecteur interchangeable ; chaque PDF signé est conservé avec son dossier de preuve.
- **Conservation** : livrets et comptes rendus conservés selon la durée paramétrée pour les dossiers des apprenants.
- **Accessibilité** : niveau AA du cadre général, y compris pour les tuteurs.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Livret | Rempli par l'alternant, le tuteur et le référent école, au rythme fixé par l'école |
| Visites et entretiens | Minimum annuel paramétrable par formation, compte rendu type, alertes de retard |
| Signature électronique | Prestataire français conforme eIDAS (type Yousign) pour les conventions de stage, le livret, les comptes rendus et les attestations ; le contrat reste dans le module 10 |

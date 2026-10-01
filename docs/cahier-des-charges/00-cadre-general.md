# Cahier des charges Scolaly — 00 · Cadre général

> Statut : **validé** le 01/10/2026.
> Document de travail (avec schémas) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objet et organisation du cahier des charges

Ce cahier des charges décrit les 20 modules de Scolaly, de la première version (MVP, rentrée 2027) jusqu'à la parité fonctionnelle avec Ypareo (V3, rentrée 2029). Ce module 00 fixe les règles communes à tous les autres modules. Chaque module est rédigé dans son propre onglet, validé par le porteur du projet, puis versionné dans ce dossier.

### Gabarit commun à chaque module

1. **Objectif et périmètre**, avec la phase (MVP, V2 ou V3)
2. **Acteurs et droits** : une matrice rôles × actions
3. **User stories** priorisées (Must, Should, Could)
4. **Règles de gestion** numérotées RG-NN-xx
5. **Écrans et parcours**
6. **Données** : entités, attributs clés, relations
7. **Cas limites et erreurs**
8. **Critères d'acceptation**, testables
9. **Exigences propres** au module : performance, sécurité, RGPD
10. **Questions ouvertes**

### Liste des modules

| N° | Module | Phase |
| --- | --- | --- |
| 00 | Cadre général (ce document) | Transverse |
| 01 | Socle : établissements, années, utilisateurs, rôles, imports, audit, personnalisation | MVP |
| 02 | Référentiel pédagogique : formations, RNCP, promotions, groupes, UE, ECTS, salles | MVP |
| 03 | Alternance de base : entreprises, tuteurs, fiche contrat, rythmes d'alternance | MVP |
| 04 | Calendrier et emplois du temps | MVP |
| 05 | Cahier de texte | MVP |
| 06 | Émargement QR et assiduité | MVP |
| 07 | Évaluations, notes, relevés et bulletins | MVP |
| 08 | Portails, notifications et messagerie | MVP (messagerie en V2) |
| 09 | CRM, candidatures et inscriptions | V2 |
| 10 | Contrats CERFA, OPCO et NPEC | V2 |
| 11 | Facturation : frais de scolarité, OPCO, facture électronique, exports compta et paie | V2 |
| 12 | Qualité : Qualiopi, BPF, enquêtes | V2 |
| 13 | Livret d'apprentissage, visites en entreprise, signature électronique | V2 |
| 14 | Jurys, PV et diplomation | V2 |
| 15 | Devoirs en ligne et examens | V2 / V3 |
| 16 | Tableaux de bord et exports réglementaires (SIFA, InserJeunes) | V2 / V3 |
| 17 | Formation continue, aides aux apprentis, référent handicap | V3 |
| 18 | API, connecteurs, SSO | V2 / V3 |
| 19 | Administration de la plateforme : espaces écoles, licences self-hosted, abonnements | MVP (version de base) |

## 2. Glossaire

Ces termes ont le même sens dans tous les modules, dans l'interface et dans le code.

| Terme | Définition |
| --- | --- |
| Organisation (tenant) | Une école ou un CFA cliente de la plateforme. Ses données sont isolées de celles des autres organisations. Plusieurs organisations peuvent former un groupe. |
| Établissement | Site ou campus d'une organisation, avec son adresse, ses salles et son numéro UAI ou SIRET. |
| Année scolaire | Période de référence, par exemple 2027-2028, découpée en périodes (semestres ou trimestres). |
| Formation | Diplôme ou titre préparé (BTS, Bachelor, Master, titre RNCP), avec sa maquette pédagogique. |
| Maquette | Structure d'une formation : blocs de compétences, UE, modules, volumes horaires, ECTS, coefficients. |
| Promotion | Cohorte d'apprenants qui suivent une formation pour une année donnée, par exemple « Bachelor Dev 2e année 2027-2028 ». |
| Groupe | Sous-ensemble d'une promotion (TD, TP, option, langue), ou groupe transversal à plusieurs promotions. |
| UE / module | Unité d'enseignement (porte les ECTS) et ses matières ou modules (portent les notes et les heures). |
| Séance | Créneau de cours daté, avec un module, un ou plusieurs intervenants, un ou plusieurs groupes et une salle (ou à distance). C'est l'unité de l'émargement. |
| Demi-journée | Matinée ou après-midi, l'unité d'assiduité exigée par Qualiopi et les OPCO. |
| Apprenant | Personne inscrite à une formation : étudiant en formation initiale, apprenti, contrat de professionnalisation ou stagiaire de formation continue. |
| Apprenant actif | Apprenant inscrit à au moins une formation pendant l'année scolaire. C'est l'unité de facturation de la plateforme. |
| Statut d'apprenant | Initial, apprenti, contrat de professionnalisation, formation continue ou stagiaire. Il détermine les règles applicables : rythme, financement, assiduité. |
| Intervenant | Enseignant ou formateur, salarié ou vacataire. |
| Tuteur / maître d'apprentissage | Salarié de l'entreprise qui encadre un alternant. |
| Entreprise | Employeur d'un alternant, ou structure qui accueille un stagiaire. |
| Rythme d'alternance | Calendrier qui répartit les jours entre école et entreprise, par exemple 2 jours / 3 jours ou 1 semaine / 3 semaines. |
| OPCO | Opérateur de compétences qui finance les contrats d'alternance. |
| NPEC | Niveau de prise en charge : le montant annuel financé par l'OPCO pour un contrat donné. |
| CERFA | Formulaire officiel du contrat d'apprentissage (FA13) ou de professionnalisation (EJ20). |
| BPF | Bilan pédagogique et financier, déclaration annuelle obligatoire des organismes de formation. |
| Qualiopi | Certification qualité obligatoire pour recevoir des fonds publics ou mutualisés. |
| Groupe d'écoles | Ensemble facultatif de plusieurs organisations d'un même client, avec un tableau de bord commun (RG-00-23). |

## 3. Organisation des données et modes de déploiement

Toutes les données appartiennent à une organisation et sont rangées dans une hiérarchie unique. Le même code fonctionne en SaaS (plusieurs organisations sur une instance) et en self-hosted (une seule organisation, ou un groupe d'écoles).

**Hiérarchie** (schéma dans le document de travail) : Groupe d'écoles (facultatif) → Organisation (une école) → Établissement (campus, salles) → Formation (maquette, UE) → Promotion (une par année scolaire) → Groupes (TD, TP, options). L'année scolaire est commune à toute l'école et alimente les promotions. L'apprenant a une seule fiche par école et est rattaché à une promotion par une inscription, qui porte son statut. Les données de chaque école restent isolées.

### Règles d'organisation

- **RG-00-01** : toute donnée métier porte l'identifiant de son organisation. Aucune requête ne peut lire ou modifier les données d'une autre organisation ; l'isolation est garantie par la base de données (Row-Level Security), pas seulement par le code.
- **RG-00-02** : une organisation compte un ou plusieurs établissements. Un utilisateur peut avoir des droits sur un, plusieurs ou tous les établissements.
- **RG-00-03** : l'année scolaire est commune à l'organisation. Les dates de début et de fin et le découpage en périodes sont paramétrables par formation : une formation en alternance peut démarrer en octobre et finir en septembre.
- **RG-00-04** : un apprenant n'est créé qu'une seule fois par organisation. Il peut avoir plusieurs inscriptions (une par formation et par année), ce qui conserve tout son historique.
- **RG-00-05** : une année clôturée passe en lecture seule. Toute correction ultérieure exige un droit spécifique et est tracée.
- **RG-00-06** : le statut de l'apprenant (initial, apprenti, contrat de professionnalisation, formation continue) est porté par l'inscription, pas par la personne. Un étudiant peut passer d'initial en première année à apprenti en deuxième année.

### Groupes d'écoles (MVP)

Un client peut réunir plusieurs écoles dans un **groupe**, avec un tableau de bord commun. Chaque école reste une organisation à part entière, avec ses données isolées.

- **RG-00-23** : un groupe rassemble plusieurs organisations (écoles) d'un même client. Chaque école garde ses données, ses paramètres et son apparence. Une école sans groupe fonctionne normalement.
- **RG-00-24** : le rôle *Direction de groupe* donne une lecture consolidée des indicateurs de toutes les écoles du groupe. L'accès au détail d'une école (listes d'apprenants, notes) n'est possible que si l'administrateur de cette école l'accorde. Ce rôle ne permet aucune modification.
- **RG-00-25** : le tableau de bord de groupe du MVP affiche, par école et pour le groupe :
  - les effectifs par formation et par statut ;
  - le taux d'assiduité du mois ;
  - la moyenne générale ;
  - le nombre d'apprenants en alerte d'absences.

  Les écoles peuvent être comparées côte à côte et le tableau peut être exporté. Les indicateurs avancés viennent en V2 (module 16).
- **RG-00-26** : une personne présente dans plusieurs écoles du groupe (par exemple un intervenant partagé) a un seul compte de connexion et change d'école avec un sélecteur. Elle a une fiche distincte dans chaque école.
- **RG-00-27** : l'abonnement et la licence peuvent être portés par le groupe. Le volume d'apprenants cumulé de toutes les écoles sert alors au calcul des tranches dégressives. Une instance self-hosted peut héberger un groupe entier.
- **RG-00-28** : le transfert d'un apprenant d'une école à une autre du groupe copie son dossier dans l'école d'arrivée. L'historique reste dans l'école d'origine, et le transfert est tracé des deux côtés.

### SaaS et self-hosted

| Aspect | SaaS | Self-hosted |
| --- | --- | --- |
| Mode technique | Multi-organisation (`MULTI_TENANT`) | Un seul client : une école ou un groupe d'écoles (`SINGLE_TENANT`) |
| Adresse | Un sous-domaine par organisation (ecole.scolaly.fr) ou un domaine personnalisé | Domaine du client |
| Hébergement | Chez nous, en France | Chez le client : VM, Docker Compose |
| Mises à jour | Automatiques, sans interruption visible | Le client tire la nouvelle image Docker ; migrations automatiques au démarrage |
| Sauvegardes | Assurées par nous (section 7) | À la charge du client, avec un script fourni |
| Licence | Comprise dans l'abonnement | Fichier de licence signé, vérifié hors ligne |
| Emails, stockage, SMS | Nos fournisseurs | Configurables : SMTP, S3 / MinIO, fournisseur SMS au choix |

- **RG-00-07** : les fonctionnalités sont identiques dans les deux modes. Seules diffèrent l'administration de la plateforme (module 19) et la gestion de la licence.
- **RG-00-08** : une organisation peut passer du SaaS au self-hosted, et inversement, grâce à un export complet (base de données et fichiers) et à un import documenté.
- **RG-00-09** : à l'expiration d'une licence self-hosted, la plateforme passe en lecture seule après 30 jours de grâce. Les données ne sont jamais bloquées ni supprimées.

## 4. Rôles et périmètres d'accès

Les droits combinent un rôle (ce qu'on peut faire) et un périmètre (sur quoi). Treize rôles sont livrés par défaut ; chaque organisation peut créer ses propres rôles à partir d'une liste de permissions.

| Rôle | Périmètre par défaut | Ce qu'il fait (résumé) | Phase |
| --- | --- | --- | --- |
| Super-administrateur plateforme | Toutes les organisations (SaaS uniquement) | Crée les organisations, gère les abonnements et le support. N'accède aux données d'une école que sur autorisation explicite et datée. | MVP |
| Administrateur d'organisation | Organisation | Paramétrage, utilisateurs, rôles, imports, personnalisation | MVP |
| Direction | Organisation ou établissement | Lecture globale, tableaux de bord, validations (bulletins, jurys) | MVP |
| Direction de groupe | Toutes les écoles du groupe | Tableau de bord consolidé et comparaison des écoles, en lecture seule ; détail d'une école seulement si elle l'accorde (RG-00-24) | MVP |
| Responsable pédagogique | Une ou plusieurs formations | Maquettes, EDT, évaluations, suivi des apprenants | MVP |
| Scolarité / gestionnaire | Établissement | Inscriptions, absences et justificatifs, bulletins, attestations | MVP |
| Intervenant | Ses séances et ses groupes | Appel, cahier de texte, saisie des notes | MVP |
| Apprenant | Lui-même | EDT, émargement, notes, absences, documents | MVP |
| Tuteur entreprise | Ses alternants | Assiduité, notes (option de l'école, désactivée par défaut), cahier de texte, livret | MVP (livret en V2) |
| Chargé de relations entreprises | Établissement | CRM, candidatures, contrats, OPCO | V2 |
| Comptable / financier | Organisation | Facturation, encaissements, exports comptables | V2 |
| Référent handicap | Apprenants signalés | Aménagements, suivi confidentiel | V3 |
| Auditeur (lecture seule) | Périmètre défini, durée limitée | Consultation des preuves Qualiopi lors d'un audit | V2 |

- **RG-00-10** : les rôles se cumulent. Un intervenant peut aussi être responsable pédagogique, ou une personne peut être à la fois étudiante et tutrice.
- **RG-00-11** : par défaut, un utilisateur n'a accès à rien. Chaque droit est accordé explicitement, avec un périmètre (organisation, établissement, formation, promotion, ou soi-même).
- **RG-00-12** : chaque attribution ou retrait de rôle est tracé dans le journal d'audit (qui, quoi, quand).
- **RG-00-13** : la double authentification est obligatoire pour les rôles d'administration, de direction, de scolarité et de finance. Elle est facultative mais proposée pour les autres rôles.
- **RG-00-14** : un tuteur n'accède qu'aux alternants liés à un contrat en cours dont il est le tuteur. L'accès se ferme automatiquement à la fin ou à la rupture du contrat. Le tuteur ne voit les notes que si l'école active cette option ; elle est désactivée par défaut et se règle par formation.
- **RG-00-15** : la scolarité peut « voir en tant que » un apprenant pour l'aider, en lecture seule. Cette consultation est tracée et signalée par un bandeau.

## 5. Exigences UX et UI

Un nouvel utilisateur doit pouvoir faire les tâches courantes de son rôle sans formation. Chaque exigence ci-dessous est vérifiée en recette, et chaque module est testé sur maquette par 3 à 5 utilisateurs réels avant d'être développé.

### Principes

- **UX-01 · Une seule interface, adaptée au rôle** : la page d'accueil de chaque rôle montre d'abord ce qu'il doit faire aujourd'hui. Exemples : l'intervenant voit ses séances du jour et l'appel à lancer ; la scolarité voit les justificatifs à traiter.
- **UX-02 · Mobile d'abord pour l'apprenant, l'intervenant et le tuteur** : tout leur parcours fonctionne sur un téléphone de 360 px de large, en PWA installable.
- **UX-03 · Bureau d'abord pour la scolarité et la pédagogie** : tableaux denses, filtres sauvegardés, actions en masse, raccourcis clavier.
- **UX-04 · Trois clics au maximum** pour les actions fréquentes : lancer l'appel, saisir une note, justifier une absence, télécharger un bulletin.
- **UX-05 · Recherche globale** (raccourci ⌘K / Ctrl+K) : apprenant, intervenant, groupe, salle, entreprise ou page, avec des résultats en moins de 300 ms.
- **UX-06 · Saisie de type tableur** pour les notes et les absences en masse : navigation au clavier, copier-coller depuis Excel, sauvegarde automatique, annulation.
- **UX-07 · Retour immédiat** : les actions s'affichent tout de suite (mise à jour optimiste) ; une erreur est expliquée en français clair, avec la marche à suivre.
- **UX-08 · Temps réel là où c'est utile** : la liste d'appel se remplit en direct pendant le scan QR, et une modification d'EDT apparaît chez les apprenants concernés.
- **UX-09 · États vides guidés** : un écran sans données explique quoi faire et propose l'action, par exemple « Importer vos apprenants ».
- **UX-10 · Imports assistés** : fichier CSV ou Excel, correspondance des colonnes, aperçu, erreurs signalées ligne par ligne et corrigeables avant validation.
- **UX-11 · Prise en main** : une liste de démarrage pour l'administrateur (établissement, année, formations, imports) et une organisation de démonstration pré-remplie.
- **UX-12 · Actions sûres** : une suppression importante demande une confirmation qui nomme l'objet et son impact (« 23 notes seront supprimées »). Les suppressions sont réversibles 30 jours (corbeille).

### Charte visuelle

- **UI-01** : un design system unique (composants accessibles, Tailwind CSS et shadcn/ui), un thème clair et un thème sombre.
- **UI-02** : chaque organisation personnalise son logo, sa couleur principale, son nom d'affichage et les modèles de documents PDF. Le contraste de la couleur choisie est contrôlé automatiquement.
- **UI-03** : typographie, espacements et icônes cohérents ; les mêmes composants servent à la même action dans tous les modules.
- **UI-04** : les documents PDF (bulletins, attestations, feuilles d'émargement) reprennent l'identité de l'organisation et sont lisibles imprimés en noir et blanc.

### Langue et formats

- **UX-13** : interface en français. Les textes sont externalisés pour permettre d'autres langues plus tard (anglais en V3).
- **UX-14** : dates au format JJ/MM/AAAA, fuseau horaire de l'établissement, montants en euros avec deux décimales, notes sur 20 par défaut (barème paramétrable).

## 6. Performance et montée en charge

La plateforme doit encaisser **5 000 scans de QR code en 60 secondes** sans ralentir ni perdre un seul scan, sur une VM de 4 vCPU et 8 Go en self-hosted. Le reste de l'application vise une réponse perçue comme immédiate.

### Objectifs chiffrés

| Indicateur | Objectif | Mesuré sur |
| --- | --- | --- |
| Scan QR : temps de réponse | p99 < 200 ms pendant le pic | 5 000 scans en 60 s, 4 vCPU / 8 Go |
| Scan QR : scans perdus ou en double | 0 | Idem, avec 5 % de requêtes répétées par le réseau |
| Pages courantes (API) | p95 < 300 ms | 500 utilisateurs simultanés |
| Premier affichage sur mobile | < 2 s en 4G | Page d'accueil de l'apprenant |
| Recherche globale | < 300 ms | 10 000 apprenants dans l'organisation |
| Génération de bulletins | 500 bulletins PDF en moins de 2 min, en tâche de fond | 1 promotion de 500 |
| Volume supporté par organisation | 20 000 apprenants actifs, sans limite technique dure | Tests de charge |

### Comment l'émargement tient le pic

Chemin d'un scan (schéma dans le document de travail) : téléphone de l'apprenant → service de scan (vérifie le jeton signé sans lire la base, plusieurs exemplaires) → cache mémoire (inscrits pré-chargés 5 min avant la séance, une présence par apprenant). Ces trois composants forment le chemin critique (< 200 ms). Le cache alimente ensuite l'écran de l'intervenant (liste d'appel en direct) et un traitement de fond qui écrit les présences par lots dans PostgreSQL, hors du chemin critique.

- **RG-00-16** : le QR code affiché par l'intervenant contient un jeton signé (identifiant de séance + fenêtre de temps + signature HMAC) qui change toutes les 10 à 15 secondes. Le serveur le vérifie par calcul, sans lire la base de données.
- **RG-00-17** : 5 minutes avant le début de chaque séance, la liste des inscrits et les règles d'émargement sont chargées dans le cache mémoire. Le contrôle « cet apprenant est-il attendu ? » se fait en mémoire.
- **RG-00-18** : le scan est enregistré d'abord dans le cache, de façon idempotente (une seule présence par apprenant et par séance), puis écrit en base par lots par un traitement de fond. La base de données n'est jamais sur le chemin critique du scan.
- **RG-00-19** : si le réseau sature, le téléphone garde le scan (jeton signé + heure) et le renvoie automatiquement. Le serveur l'accepte dans une fenêtre de grâce paramétrable (5 minutes par défaut), car l'heure de capture est prouvée par le jeton.
- **RG-00-20** : l'apprenant est déjà connecté (session longue de 30 jours sur son appareil). Scanner ne demande ni identifiant ni mot de passe.
- **RG-00-21** : le service de scan peut tourner en plusieurs exemplaires derrière le répartiteur de charge, en self-hosted comme en SaaS.
- **RG-00-22** : un test de charge automatisé (k6), qui reproduit la vague de 5 000 scans, s'exécute à chaque version. Une version qui ne respecte pas les objectifs n'est pas publiée.

## 7. Sécurité, RGPD, accessibilité et exploitation

La plateforme traite des données personnelles de jeunes, parfois mineurs, ainsi que des données financières. La sécurité et la conformité sont donc intégrées dès la conception, puis vérifiées par un test d'intrusion annuel.

### Sécurité

- **SEC-01** : chiffrement en transit (HTTPS uniquement, TLS 1.2 minimum, HSTS) et au repos (base de données, sauvegardes et fichiers).
- **SEC-02** : mots de passe hachés avec Argon2id, double authentification (application TOTP ou clé de sécurité), connexion SSO en V2, verrouillage progressif après des échecs répétés.
- **SEC-03** : isolation des organisations au niveau de la base de données (RG-00-01), testée automatiquement à chaque version.
- **SEC-04** : protection contre les failles de l'OWASP Top 10 (injections, XSS, CSRF…). Limitation du nombre de requêtes par utilisateur et par adresse IP.
- **SEC-05** : les fichiers déposés (justificatifs, devoirs) sont limités en type et en taille et analysés par un antivirus. Ils ne sont accessibles que par des liens temporaires signés.
- **SEC-06** : journal d'audit inaltérable des actions sensibles (droits, notes, absences, bulletins, exports, connexions), consultable par l'administrateur et conservé 1 an minimum.
- **SEC-07** : les secrets (clés, mots de passe de service) ne figurent jamais dans le code. Dépendances analysées automatiquement, correctifs de sécurité publiés sous 7 jours pour une faille critique.

### RGPD

- **RGPD-01** : l'organisation cliente est responsable de traitement ; nous sommes sous-traitant. Un accord de traitement des données (DPA) est signé avec chaque client SaaS.
- **RGPD-02** : registre des traitements et analyse d'impact (AIPD) fournis aux clients. L'AIPD est probablement requise, car il s'agit de jeunes et d'un suivi d'assiduité.
- **RGPD-03** : minimisation. Aucun motif médical n'est saisi : un justificatif médical reste un document joint. La géolocalisation à l'émargement est facultative, désactivée par défaut, et seul le résultat (sur place ou non) est conservé, jamais la position.
- **RGPD-04** : durées de conservation paramétrables par type de donnée, avec des valeurs par défaut conformes aux usages : par exemple 5 ans après la sortie pour le dossier pédagogique, et une conservation plus longue pour les résultats et diplômes. Une purge ou une anonymisation automatique s'applique à l'échéance.
- **RGPD-05** : droits des personnes. L'apprenant exporte ses données depuis son espace ; les demandes d'effacement et de rectification sont traitées par l'administrateur avec un outil dédié.
- **RGPD-06** : en SaaS, hébergement en France chez un hébergeur européen. Les sous-traitants ultérieurs (emails, SMS) sont listés et situés dans l'UE.

### Accessibilité et compatibilité

- **ACC-01** : conformité RGAA 4 / WCAG 2.2 niveau AA, vérifiée par des tests automatiques et un audit manuel avant chaque version majeure. Une déclaration d'accessibilité est publiée.
- **ACC-02** : navigation complète au clavier, compatibilité avec les lecteurs d'écran (NVDA, VoiceOver), respect du réglage « réduire les animations ».
- **ACC-03** : navigateurs pris en charge dans leurs deux dernières versions : Chrome, Edge, Firefox et Safari, ainsi que Safari iOS 16+ et Chrome Android 10+.

### Exploitation

- **EXP-01** : disponibilité SaaS de 99,5 % par mois (99,9 % pour la formule Entreprise), hors maintenance annoncée 72 h à l'avance, en dehors de 7 h-19 h en semaine.
- **EXP-02** : sauvegardes SaaS chiffrées toutes les 24 h, plus la journalisation continue de la base (restauration à la minute près sur 7 jours), conservées 30 jours dans un second site. Une restauration est testée chaque mois. Objectifs : perte de données maximale de 15 minutes, remise en service en moins de 4 heures.
- **EXP-03** : supervision (disponibilité, erreurs, temps de réponse) avec alertes, et une page de statut publique.
- **EXP-04** : self-hosted. Installation en une commande (Docker Compose), script de sauvegarde et de restauration fourni, mises à jour par changement de version d'image, et diagnostic intégré (page d'état des services).
- **EXP-05** : versions publiées avec des notes de version en français. Les migrations de base de données sont automatiques et sans retour arrière destructif.

## 8. Décisions et questions ouvertes

Décisions prises le 1er octobre 2026 :

| Sujet | Décision |
| --- | --- |
| Nom du produit | Scolaly (scolaly.fr et scolaly.com libres au 01/10/2026 ; marque à vérifier à l'INPI) |
| Responsables légaux d'apprenants mineurs | Pas d'accès dans le MVP (V2 ou plus tard) |
| Notes visibles par les tuteurs | Seulement si l'école active l'option, désactivée par défaut (RG-00-14) |
| Groupes d'écoles | Dès le MVP, avec un tableau de bord commun (RG-00-23 à RG-00-28) |
| Scan par l'intervenant | Non : un étudiant sans téléphone est pointé à la main par l'intervenant |
| Disponibilité SaaS | 99,5 % par mois, 99,9 % en formule Entreprise (EXP-01) |

Question encore ouverte :

- [ ] Durées de conservation : faut-il faire valider les valeurs par défaut par un juriste ou un DPO ?

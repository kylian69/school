# Cahier des charges Scolaly — 11 · Facturation

> Statut : **validé** le 01/10/2026.
> Document de travail (avec le schéma du circuit financier) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b
## 1. Objectif et périmètre

Ce module facture tout ce qu'une école perçoit au titre d'une inscription (frais de scolarité, prise en charge OPCO, reste à charge de l'entreprise, autres financeurs), suit les paiements et les impayés, puis alimente la comptabilité et la paie des vacataires. **Phase : V2.**

Le module est **activable par organisation** (décision du 01/10/2026) : une école qui garde son logiciel de facturation peut ne pas l'activer et se contenter des exports (plans de financement, échéanciers OPCO, heures des vacataires). Le **paiement en ligne** est une seconde option, activable séparément.

**Inclus :**

- grilles tarifaires, remises et bourses ; plan de financement de chaque inscription, réparti entre ses payeurs ;
- échéanciers : comptant, acompte puis solde, paiement en plusieurs fois, prélèvement SEPA ;
- factures et avoirs avec numérotation continue, en PDF et au format **Factur-X**, que l'école dépose sur sa plateforme agréée ;
- factures OPCO à partir de l'échéancier du module 10, avec leurs justificatifs ;
- encaissements par tous les moyens de paiement, avec ou sans paiement en ligne (Stripe, compte de l'école) ; lettrage ;
- relances automatiques des impayés, sans aucun blocage ;
- heures des vacataires valorisées, export vers la paie ou état de facturation ;
- exports comptables : FEC, Sage 100, EBP, Cegid, CSV paramétrable.

**Exclus :**

- connexion directe à une plateforme agréée de facturation électronique (l'école y dépose ses factures elle-même) ;
- comptabilité générale, calcul des paies, rapprochement bancaire complet (ils restent dans les logiciels de l'école) ;
- facturation détaillée de la formation continue et du CPF (module 17, V3) ;
- abonnement des écoles à Scolaly (module 19).

## 2. Acteurs et droits

Le payeur peut être l'étudiant, sa famille (ou un tiers désigné), une entreprise, un OPCO ou un autre financeur. Les payeurs extérieurs reçoivent leurs factures par email ; l'étudiant, la famille et l'entreprise les retrouvent aussi dans leur portail (module 08).

| Action | Admin | Comptable | Scolarité | Direction | Payeur | Intervenant |
| --- | --- | --- | --- | --- | --- | --- |
| Paramétrer (entités facturantes, TVA, numérotation, plan de comptes, paiement en ligne) | Oui | Oui | Non | Non | Non | Non |
| Gérer les grilles tarifaires et les remises | Oui | Oui | Lecture | Lecture | Non | Non |
| Établir le plan de financement d'une inscription | Oui | Oui | Oui | Lecture | Lecture (sa part) | Non |
| Émettre factures et avoirs | Oui | Oui | Non | Non | Non | Non |
| Enregistrer un encaissement | Oui | Oui | Oui (guichet) | Non | Non | Non |
| Payer en ligne | Non | Non | Non | Non | Oui (si option active) | Non |
| Consulter factures et échéanciers | Oui | Oui | Oui | Totaux | Les siens | Non |
| Valider ses heures | Non | Non | Non | Non | Non | Oui |
| Valider les heures et exporter vers la paie | Oui | Oui | Non | Oui (validation) | Non | Non |
| Exporter la comptabilité | Oui | Oui | Non | Non | Non | Non |

## 3. User stories

Le module compte 18 user stories, dont 14 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-11-01 | comptable | définir les tarifs par formation, année et profil (initial, alternant), avec remises et bourses | ne plus calculer à la main | Must |
| US-11-02 | scolarité | voir et ajuster le plan de financement d'un inscrit (qui paie quoi) | que chaque payeur reçoive la bonne facture | Must |
| US-11-03 | étudiant ou famille | choisir mon échéancier et signer un mandat SEPA en ligne | étaler le paiement | Must |
| US-11-04 | comptable | générer en lot les factures d'une échéance pour toute une promotion | facturer 500 étudiants en quelques minutes | Must |
| US-11-05 | comptable | corriger une facture émise par un avoir | rester conforme | Must |
| US-11-06 | comptable | facturer l'OPCO à chaque échéance du module 10, avec les justificatifs | être payé sans aller-retour avec l'OPCO | Must |
| US-11-07 | comptable | exporter les factures en Factur-X pour les déposer sur notre plateforme agréée | respecter la facture électronique | Must |
| US-11-08 | étudiant ou famille | payer en ligne par carte, SEPA, Apple Pay ou Google Pay | payer en deux minutes | Must (si option active) |
| US-11-09 | scolarité | enregistrer un chèque, un virement ou des espèces et éditer un reçu | tracer chaque paiement reçu au guichet | Must |
| US-11-10 | comptable | voir les paiements rapprochés automatiquement de leurs factures et lettrer le reste | connaître le solde exact de chaque payeur | Must |
| US-11-11 | comptable | que les relances partent seules selon un calendrier | réduire les impayés sans effort | Must |
| US-11-12 | comptable | exporter les écritures vers notre logiciel comptable | ne rien ressaisir | Must |
| US-11-13 | intervenant vacataire | vérifier et valider mes heures du mois | être payé juste | Must |
| US-11-14 | comptable | exporter les heures valorisées vers la paie ou un état de facturation | payer les vacataires sans tableur | Must |
| US-11-15 | direction | suivre le facturé, l'encaissé et les impayés par formation et par payeur | piloter la trésorerie | Should |
| US-11-16 | étudiant ou famille | télécharger une attestation de paiement | justifier mes frais | Should |
| US-11-17 | comptable | reprendre les soldes et échéanciers en cours de l'ancien outil | démarrer en cours d'année | Should |
| US-11-18 | comptable | importer un relevé bancaire pour rapprocher les virements | gagner du temps | Could |

## 4. Règles de gestion

Circuit (schéma dans le document de travail) : le plan de financement définit qui paie quoi ; chaque payeur a son échéancier, qui produit les factures. L'école dépose les Factur-X sur sa plateforme agréée ; un impayé déclenche les relances ; chaque paiement est lettré à sa facture avant l'export vers le logiciel comptable.

### Activation et paramétrage

- **RG-11-01** : le module est activable par organisation. Désactivé, Scolaly n'émet aucune facture mais exporte les plans de financement, les échéanciers OPCO (module 10) et les heures des vacataires. Le paiement en ligne est une seconde option, disponible seulement si le module est actif.
- **RG-11-02** : chaque **entité facturante** (organisation, ou établissement doté de son propre SIRET) a sa raison sociale, ses SIREN et SIRET, son numéro de TVA, son numéro de déclaration d'activité, ses coordonnées bancaires, ses mentions et sa propre séquence de numérotation. Un groupe d'écoles a autant d'entités facturantes que d'entités juridiques.
- **RG-11-03** : le régime de TVA est paramétrable par entité et par type de prestation : taux, ou exonération avec la mention légale correspondante (par exemple pour la formation professionnelle). Les taux et mentions sont tenus à jour par Scolaly dans une table datée ; l'école choisit ce qui s'applique à elle.

### Tarifs et plan de financement

- **RG-11-04** : une grille tarifaire fixe, par formation, année de formation et établissement, les frais de scolarité et les frais annexes (inscription, matériel, voyage d'études…), avec leurs dates de validité. Les remises (fratrie, paiement comptant, ancien élève…) et les bourses sont des règles paramétrables, en montant ou en pourcentage.
- **RG-11-05** : chaque inscription a un **plan de financement** qui répartit son coût entre ses payeurs : étudiant ou famille (ou un tiers désigné), OPCO (montant pris en charge, module 10), entreprise (reste à charge), autres financeurs (Région, France Travail, CPF, organisme de bourse). La somme des parts doit égaler le coût : un écart est bloquant.
- **RG-11-06** : la formation d'un apprenti est gratuite pour lui et pour son représentant légal. Scolaly refuse toute part « étudiant » sur les frais de formation d'un contrat d'apprentissage ; un éventuel reste à charge est porté par l'employeur, après accord.
- **RG-11-07** : un changement d'inscription (abandon, changement de formation, rupture de contrat du module 10) recalcule le plan de financement à sa date d'effet. Les échéances futures sont ajustées ; si une facture déjà émise devient indue, un avoir est proposé selon les conditions de remboursement de l'école.

### Échéanciers

- **RG-11-08** : chaque payeur a son échéancier : comptant, acompte puis solde, ou paiement en plusieurs fois selon les modèles proposés par l'école (nombre d'échéances, dates, frais éventuels). L'échéancier de l'OPCO vient du module 10 (RG-10-15).
- **RG-11-09** : le prélèvement SEPA demande un mandat signé en ligne (référence unique de mandat, date). Les prélèvements passent par Stripe si le paiement en ligne est actif ; sinon, Scolaly produit le fichier de prélèvement au format bancaire standard (SEPA XML), que l'école remet à sa banque. Le payeur est prévenu avant chaque prélèvement, dans le délai paramétré.

### Factures et avoirs

- **RG-11-10** : les factures sont générées à l'échéance, à l'unité ou en lot (par exemple pour toute une promotion), avec un aperçu avant émission. Une facture émise est définitive : elle ne se modifie ni ne se supprime, et toute correction passe par un avoir lié.
- **RG-11-11** : la numérotation est chronologique, continue et sans trou pour chaque entité facturante, avec un préfixe paramétrable (par exemple 2026-F-000123) et, si l'école le souhaite, une séquence distincte pour les avoirs. Elle reste exacte quand plusieurs lots sont générés en même temps.
- **RG-11-12** : chaque facture porte les mentions obligatoires, y compris celles ajoutées par la réforme de la facturation électronique (SIREN de l'acheteur professionnel, nature de l'opération…), tenues à jour par Scolaly. Elle est produite en PDF et au format **Factur-X** (PDF lisible avec les données structurées), conforme à la norme européenne.
- **RG-11-13** : facture électronique (décision du 01/10/2026) : Scolaly n'est pas une plateforme agréée et ne s'y connecte pas. Il fournit les Factur-X à l'unité ou en archive, et l'export des données de transaction pour la transmission des ventes aux particuliers (e-reporting) si l'école y est soumise. L'école dépose ces fichiers sur sa plateforme et indique dans Scolaly ce qui a été transmis. Pour les acheteurs publics, l'export suit le format accepté par Chorus Pro.
- **RG-11-14** : l'OPCO reçoit une facture par échéance de prise en charge et par contrat (ou regroupée si l'OPCO l'accepte), avec les justificatifs demandés : certificat de réalisation issu de l'assiduité (module 06), numéro de dépôt du contrat. Elle est transmise par le même canal que le contrat : API commune des OPCO quand elle est disponible, sinon dépôt guidé (RG-10-10).
- **RG-11-15** : factures, avoirs et pièces sont archivés 10 ans, sans modification possible, avec leur empreinte numérique.

### Encaissements

- **RG-11-16** : tous les moyens de paiement sont pris en compte : carte bancaire, prélèvement SEPA, virement, chèque, espèces, versement d'un financeur. Chaque encaissement indique le moyen, la date, le montant, le payeur et la référence. Les chèques sont regroupés en bordereaux de remise ; les espèces respectent le plafond légal (paramétrable) et donnent lieu à un reçu.
- **RG-11-17** : paiement en ligne (option) : l'école connecte son propre compte Stripe, en compte connecté standard, et les fonds vont directement chez elle. Le payeur paie depuis son portail ou par le lien de sa facture : carte, SEPA, Apple Pay, Google Pay. Scolaly ne stocke aucune donnée de carte ; une notification de paiement reçue deux fois n'est enregistrée qu'une fois. Le connecteur est abstrait pour accueillir plus tard une solution française.
- **RG-11-18** : chaque virement attendu porte une référence unique (numéro de facture ou de payeur). Les paiements en ligne et les prélèvements sont lettrés automatiquement ; les autres sont rapprochés par référence et montant, sous forme de propositions à valider. Un trop-perçu reste au crédit du payeur ou lui est remboursé, par le même moyen quand c'est possible.

### Relances

- **RG-11-19** : le calendrier de relances est paramétrable (rappel avant échéance, relances après échéance, dernier rappel), avec des modèles d'email et de courrier, envoyés automatiquement ou après validation. Un payeur qui a obtenu un plan d'apurement sort des relances automatiques. **Aucun blocage** d'accès ou de document n'est lié aux impayés (décision du 01/10/2026). Les mentions de pénalités de retard pour les payeurs professionnels sont paramétrables.
- **RG-11-20** : le tableau des impayés montre, par payeur et par formation, les montants dus, leur ancienneté (0 à 30, 31 à 60, 61 à 90, plus de 90 jours) et l'historique des relances.

### Heures des vacataires

- **RG-11-21** : les heures des intervenants vacataires sont calculées à partir des séances réellement tenues (modules 04, 05 et 06). Chaque heure est valorisée selon le taux de l'intervenant et la nature de l'activité (cours, TD, jury, surveillance…, liste paramétrable), avec des dates de validité des taux.
- **RG-11-22** : chaque mois, l'intervenant vérifie ses heures depuis son portail et les valide ou signale un écart ; le responsable pédagogique ou la direction valide ensuite. Les heures validées sont verrouillées.
- **RG-11-23** : les heures validées s'exportent en fichier de variables de paie (CSV au format Silae ou Sage Paie, ou CSV paramétrable) pour les vacataires salariés, et en état récapitulatif à joindre à leur facture pour les indépendants et les sociétés. Scolaly ne calcule pas les paies.

### Exports comptables

- **RG-11-24** : le plan de comptes et les journaux sont paramétrables (ventes, encaissements par moyen de paiement), avec des comptes de produits par formation ou type de frais, des comptes clients par payeur ou un compte collectif, et des axes analytiques (établissement, formation).
- **RG-11-25** : les écritures d'une période (factures, avoirs, encaissements) s'exportent au format FEC de l'administration fiscale, aux formats d'import de Sage 100, EBP et Cegid (y compris Quadra), ou en CSV paramétrable. Une écriture exportée est marquée et n'est pas réexportée sauf demande explicite ; une période peut être clôturée.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-11-01 · Tableau de bord financier | Comptable, direction | Facturé, encaissé, impayés par ancienneté, encaissements prévus, par formation et par payeur |
| E-11-02 · Paramètres de facturation | Admin, comptable | Entités facturantes, TVA, numérotation, mentions, plan de comptes, modèles d'échéancier, paiement en ligne (connexion du compte Stripe) |
| E-11-03 · Grilles tarifaires et remises | Comptable | Tarifs par formation et année, frais annexes, remises, bourses, dates de validité |
| E-11-04 · Plan de financement | Scolarité, comptable | Parts par payeur, contrôle du total, échéanciers, mandats SEPA, historique des versions |
| E-11-05 · Factures et avoirs | Comptable | Liste filtrable, génération en lot avec aperçu, émission, avoir, export Factur-X, suivi du dépôt sur la plateforme |
| E-11-06 · Encaissements | Comptable, scolarité | Saisie rapide au guichet, reçus, bordereaux de chèques, fichiers de prélèvement, propositions de lettrage, remboursements |
| E-11-07 · Relances et impayés | Comptable | Balance par ancienneté, calendrier, relances à valider, historique par payeur |
| E-11-08 · Heures des vacataires | Comptable, direction, intervenant | Heures du mois par intervenant, écarts signalés, validations, export paie ou état de facturation |
| E-11-09 · Exports comptables | Comptable | Format, période, aperçu des écritures, historique des exports, clôture de période |
| E-11-10 · Espace payeur (portail) | Étudiant, famille, entreprise | Factures, échéancier, paiement en ligne si l'option est active, mandat SEPA, attestations de paiement |

### Parcours « de l'inscription au paiement »

1. L'inscription est validée (module 09) : Scolaly propose le plan de financement à partir de la grille et des remises, avec la part OPCO pour un alternant (module 10).
2. La famille choisit son échéancier et signe son mandat SEPA en ligne.
3. À chaque échéance, la facture est générée, envoyée et exportée en Factur-X pour la plateforme de l'école.
4. Le prélèvement ou le paiement en ligne est lettré automatiquement ; un impayé déclenche les relances.
5. En fin de mois, le comptable exporte les écritures et les heures des vacataires.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Entité facturante | organisation ou établissement, raison sociale, SIREN, SIRET, TVA, numéro de déclaration d'activité, coordonnées bancaires, mentions, séquences | une par entité juridique |
| Grille tarifaire | formation, année, établissement, frais, montants, dates de validité | versions datées |
| Règle de remise ou bourse | type, montant ou pourcentage, conditions, dates de validité | appliquée aux plans de financement |
| Plan de financement | inscription, coût total, parts par payeur | une version par changement |
| Payeur | type (étudiant, famille, tiers, entreprise, OPCO, financeur), coordonnées, SIREN si professionnel | lié à une ou plusieurs inscriptions |
| Échéancier et échéances | payeur, plan, dates, montants, moyen de paiement prévu | produit les factures |
| Mandat SEPA | payeur, référence unique de mandat, IBAN chiffré, date de signature, statut | un ou plusieurs par payeur |
| Facture ou avoir | entité, numéro, payeur, lignes, TVA, totaux, statut (brouillon, émise, payée en partie, payée), PDF, Factur-X, statut de dépôt, empreinte | un avoir est lié à sa facture |
| Encaissement | payeur, moyen, date, montant, référence, bordereau, transaction en ligne | lettré à une ou plusieurs factures |
| Relance | facture, niveau, date, canal, modèle | historique par payeur |
| Heures de vacataire | intervenant, séance, nature, durée, taux, mois, statut de validation | liées aux séances du module 04 |
| Export | type (comptable, paie, Factur-X), période, fichier, auteur, date | marque les écritures exportées |
| Connexion de paiement | organisation, prestataire, identifiant du compte connecté, statut | une par organisation |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Paiement en ligne pendant une indisponibilité de Scolaly | La notification est rejouée par Stripe ; le paiement est lettré à son arrivée, sans double encaissement |
| Chèque impayé ou prélèvement rejeté | L'encaissement est annulé, la facture redevient due et les relances reprennent ; frais de rejet paramétrables |
| Payeur qui verse plus que dû | Le trop-perçu reste à son crédit ou lui est remboursé |
| Abandon en cours d'année | Plan de financement recalculé (RG-11-07), avoir proposé selon les conditions de remboursement de l'école |
| Rupture d'un contrat d'apprentissage | Échéancier OPCO ajusté (RG-10-17), factures futures annulées ; l'apprenti n'est jamais refacturé (RG-11-06) |
| Changement de taux de TVA ou de mentions | Les nouvelles factures suivent la règle en vigueur à leur date ; les factures émises ne changent pas |
| Deux lots de factures lancés en même temps | Numérotation sans doublon ni trou (RG-11-11) |
| Séance annulée après validation des heures | Correction par une ligne négative le mois suivant |
| Module désactivé après usage | Les factures restent consultables et exportables ; aucune nouvelle facture n'est émise |

## 8. Critères d'acceptation

- [ ] 1 000 factures sont générées en lot en moins de 2 minutes, avec une numérotation continue, sans trou ni doublon, même avec deux lots lancés en parallèle.
- [ ] Le FEC exporté passe sans erreur l'outil de contrôle de l'administration fiscale.
- [ ] Les exports Sage 100, EBP et Cegid s'importent sans retouche dans une version récente de chaque logiciel, sur un jeu de test.
- [ ] Les Factur-X générés sont valides (profil conforme à la norme européenne) selon un validateur de référence.
- [ ] Un paiement en ligne dont la notification arrive deux fois n'est encaissé qu'une fois.
- [ ] Aucune part « étudiant » ne peut être saisie sur les frais de formation d'un apprenti.
- [ ] Le calendrier de relances envoie les bons messages aux bonnes dates sur 30 cas de test, et aucun impayé ne bloque un accès.
- [ ] Les heures exportées d'un vacataire correspondent aux séances tenues et validées sur un mois de test.
- [ ] Sans l'option de paiement en ligne, tous les moyens de paiement manuels et le prélèvement SEPA par fichier bancaire restent utilisables.

## 9. Exigences propres au module

- **Conformité** : numérotation, mentions, inaltérabilité et archivage 10 ans ; tables légales (TVA, mentions, formats) datées et tenues à jour par Scolaly, annoncées dans les notes de version.
- **Sécurité** : aucune donnée de carte dans Scolaly (conformité PCI-DSS portée par Stripe) ; IBAN chiffrés ; droits financiers séparés ; journal de chaque émission, avoir, encaissement et export.
- **Fiabilité** : montants stockés en centimes entiers avec des règles d'arrondi documentées ; notifications de paiement traitées une seule fois ; totaux recontrôlés avant émission.
- **Performance** : lot de 1 000 factures en moins de 2 minutes ; export comptable d'une année en moins d'une minute.
- **Auto-hébergement** : le paiement en ligne demande une adresse publique joignable par Stripe pour les notifications ; sans elle, l'option reste désactivée.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Module facturation | Activable par organisation ; désactivé, Scolaly fournit seulement les exports |
| Paiement en ligne | Option activable par école ; Stripe en compte connecté de l'école, derrière un connecteur extensible (solution française possible plus tard) |
| Moyens de paiement | Carte, SEPA, virement, chèque, espèces, versement d'un financeur |
| Logiciels comptables | FEC, Sage 100, EBP, Cegid (dont Quadra), CSV paramétrable ; d'autres connecteurs plus tard |
| Facture électronique | Export Factur-X ; dépôt par l'école sur sa plateforme agréée |
| Impayés | Relances automatiques, aucun blocage |
| Vacataires | Heures réalisées et valorisées ; export paie ou état de facturation |
| Payeurs | Étudiant ou famille, OPCO, entreprise, autres financeurs |

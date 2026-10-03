# Maquettes du MVP Scolaly

Canevas de référence (interactif) : https://claude.ai/artifact/7ApKj7ouG99grZMUu5EqLN

- **Date** : 03/10/2026
- **État** : 43 écrans validés (lots 1 à 6). Tous les modules du cahier des charges (00 à 19) ont au moins un écran.
- **Décision de l'utilisateur** : les ajustements visuels seront faits pendant les tests de l'outil, pas en amont.

Les sources sont versionnées dans [`sources/`](sources/) : un fichier `.dc.html` par écran, plus `canvas.json`, qui donne la disposition du canevas.

## Identité visuelle

| Élément | Choix |
| --- | --- |
| Couleurs | Gris neutres froids et accent indigo `#4F46E5` (`#8E8CFF` en thème sombre). États : vert (présent, à jour), ambre (retard, à revoir), rouge (absence, bloquant). |
| Typographie | Geist pour l'interface, Geist Mono pour les codes et les heures. Chiffres de largeur fixe pour les notes, les montants et les horaires. |
| Logo | Logotype « scolaly » en minuscules. Le symbole est un carré indigo évidé de deux petits carrés, qui évoque un QR code. |
| Signature visuelle | Fin quadrillage en fond, cartes à coins de 14 à 20 px avec une bordure d'un pixel et sans ombre, grands chiffres dans les tableaux de bord, recherche globale par ⌘K. |
| Thèmes | Clair et sombre sur chaque écran. L'écran d'émargement projeté est en sombre par défaut. |
| Accessibilité | Vrais boutons, liens et champs, libellés ARIA sur les boutons à icône seule, contrastes d'au moins 4,5:1, cibles tactiles d'au moins 44 px. |

## Écrans

Les références E-xx-yy renvoient aux tableaux « Écrans et parcours » du [cahier des charges](../cahier-des-charges/).

### A · Émargement et espace apprenant

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Émargement, écran intervenant (QR rotatif, appel en direct) | `Main.dc.html` | Ordinateur, projection | Module 06 |
| Émargement, apprenant (scan, confirmation, hors ligne) | `EmargementMobile.dc.html` | Mobile | Module 06 |
| Accueil apprenant | `AccueilApprenant.dc.html` | Mobile | E-08-01 |

### B · Back-office de la scolarité

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Tableau de bord de la scolarité | `Dashboard.dc.html` | Ordinateur | E-16-01 |
| Emploi du temps, vue semaine (conflits) | `Edt.dc.html` | Ordinateur | Module 04 |
| Saisie des notes (grille, moyennes en direct) | `Notes.dc.html` | Ordinateur | Module 07 |

### C · Apprenant et alternance

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Fiche apprenant | `FicheApprenant.dc.html` | Ordinateur | E-01-05 |
| Tableau des contrats | `Contrats.dc.html` | Ordinateur | E-10-01 |
| Dossier contractuel et dépôt OPCO | `DossierContrat.dc.html` | Ordinateur | E-10-02, E-10-05 |
| Partie employeur (lien sécurisé) | `PartieEmployeur.dc.html` | Mobile | E-10-03 |

### D · Facturation

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Plan de financement | `PlanFinancement.dc.html` | Ordinateur | E-11-04 |
| Factures et impayés (émission groupée, Factur-X) | `Factures.dc.html` | Ordinateur | E-11-05, E-11-07 |
| Espace payeur | `EspacePayeur.dc.html` | Mobile | E-11-10 |

### E · Recrutement

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Candidatures (colonnes ou tableau, sélection multiple) | `Candidatures.dc.html` | Ordinateur | E-09-05 |
| Dossier candidat et décision | `DossierCandidat.dc.html` | Ordinateur | E-09-06 |
| Grille d'entretien | `GrilleEvaluation.dc.html` | Mobile | E-09-08 |
| Entonnoir de recrutement | `Entonnoir.dc.html` | Ordinateur | E-09-14 |

### F · Suivi en entreprise, jurys et intervenant

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Suivi des alternants | `SuiviAlternants.dc.html` | Ordinateur | E-13-01 |
| Livret, période en entreprise (tutrice) | `LivretPeriode.dc.html` | Mobile | E-13-03 |
| Grille de délibération du jury | `GrilleDeliberation.dc.html` | Ordinateur, projection | E-14-04 |
| Accueil intervenant | `AccueilIntervenant.dc.html` | Mobile | E-08-01 |

### G · Portails externes et communication

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Espace entreprise | `EspaceEntreprise.dc.html` | Ordinateur | Modules 03, 08, 10, 11 |
| Espace tuteur | `EspaceTuteur.dc.html` | Mobile | E-13-09 |
| Notifications et préférences | `Notifications.dc.html` | Mobile | E-08-02, E-08-03 |
| Rédiger une annonce | `Annonce.dc.html` | Ordinateur | E-08-05 |

### H · Administration et plateforme

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Démarrage et apparence | `Demarrage.dc.html` | Ordinateur | E-01-01, E-01-09 |
| Rôles et permissions | `RolesPermissions.dc.html` | Ordinateur | E-01-07 |
| Mon abonnement | `Abonnement.dc.html` | Ordinateur | E-19-08 |
| Console de la plateforme (super-administrateur) | `ClientsPlateforme.dc.html` | Ordinateur | E-19-01, E-19-03 |

### I · Pédagogie : cahier de texte, devoirs et examens

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Saisie de séance du cahier de texte | `SaisieSeance.dc.html` | Mobile | E-05-01 |
| Mes devoirs (apprenant) | `MesDevoirs.dc.html` | Mobile | E-05-04, E-15-02 |
| Correction des copies | `Correction.dc.html` | Ordinateur | E-15-04 |
| Épreuve en ligne, pilotage en séance | `PilotageEpreuve.dc.html` | Ordinateur, projection | E-15-07 |

### J · Qualité, handicap et pilotage

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Qualité : couverture des indicateurs et preuves | `TableauQualite.dc.html` | Ordinateur | E-12-01, E-12-03 |
| Répondre à une enquête | `EnqueteMobile.dc.html` | Mobile | E-12-08 |
| Référent handicap : plan d'aménagements | `PlanAmenagements.dc.html` | Ordinateur | E-17-03 |
| Exports libres | `ExportLibre.dc.html` | Ordinateur | E-16-06 |

### K · API et connecteurs

| Écran | Fichier | Support | Référence |
| --- | --- | --- | --- |
| Clés d'API et consommation | `ClesApi.dc.html` | Ordinateur | E-18-01, E-18-03 |
| Webhooks | `Webhooks.dc.html` | Ordinateur | E-18-02 |
| Connecteurs (assistant Moodle) | `Connecteurs.dc.html` | Ordinateur | E-18-06 |
| Connexion unique (SSO) | `Sso.dc.html` | Ordinateur | E-18-05 |
| Correspondance Moodle (intervenant) | `CorrespondanceMoodle.dc.html` | Ordinateur | E-18-08 |
| Mes connexions | `MesConnexions.dc.html` | Mobile | E-18-07 |

## Note technique

- **Format** : les fichiers `.dc.html` sont au format du canevas Claude Design. Chaque écran contient son balisage et une petite classe de logique (état, gestionnaires d'événements) interprétée par le moteur du canevas (`support.js`, qui n'est pas inclus). Ils ne s'ouvrent donc pas seuls dans un navigateur.
- **Usage** : ils servent de référence pour l'interface, les parcours, les règles visibles à l'écran et les données de démonstration. Pour les voir et cliquer dedans, il faut ouvrir le canevas.
- **Données** : toutes les données sont fictives (école, personnes, entreprises, montants). Les identifiants officiels (SIRET, code RNCP, UAI, montant NPEC) restent des champs à remplir, notés `[…]`.
- **Lien avec le code** : l'implémentation dans `apps/web` (Next.js, Tailwind, shadcn/ui) reprend les jetons de couleur des thèmes `.light` et `.dark`, définis en tête de chaque fichier.

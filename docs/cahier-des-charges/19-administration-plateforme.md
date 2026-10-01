# Cahier des charges Scolaly — 19 · Administration de la plateforme

> Statut : **validé** le 01/10/2026.
> Document de travail : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objectif et périmètre

Ce module permet à l'équipe Scolaly d'exploiter la plateforme : ouvrir l'espace d'une école en moins de 10 minutes après la signature de son devis, suivre son usage pour la facturer, l'assister sans jamais accéder à ses données sans autorisation, et délivrer les licences self-hosted. Conformément à la décision du 01/10/2026, la commercialisation se fait **sur devis** : pas d'inscription ni de paiement en libre-service. **Phase : MVP (version de base).**

**Inclus :**

- console d'administration de la plateforme (SaaS) : clients, groupes, organisations, contrats ;
- création et cycle de vie d'un client : création, suspension, résiliation, export, suppression ;
- suivi de l'usage (apprenants actifs) et préparation de la facturation manuelle ;
- fonctionnalités activées par formule (Essentiel, Pro, Entreprise) ;
- accès du support sur autorisation de l'école ;
- licences self-hosted : génération, vérification hors ligne, renouvellement, rapport d'usage ;
- site de démonstration pré-rempli, sur demande ;
- informations de service : page de statut, annonces de maintenance, notes de version.

**Exclus :**

- facturation automatique et paiement en ligne des abonnements (non prévu : facturation manuelle) ;
- comptabilité de Scolaly (outil comptable externe) ;
- CRM commercial de Scolaly (outil externe).

## 2. Acteurs et droits

Deux rôles internes à Scolaly, distincts des rôles des écoles :

| Action | Super-administrateur | Support Scolaly | Administrateur d'organisation (école) |
| --- | --- | --- | --- |
| Créer, suspendre, résilier un client | Oui | Non | Non |
| Modifier le contrat (formule, volume, dates) | Oui | Non | Lecture |
| Consulter l'usage et préparer la facturation | Oui | Lecture | Lecture (son usage) |
| Accorder un accès support à ses données | Non | Non | Oui |
| Accéder aux données d'une école | Seulement avec l'autorisation de l'école | Seulement avec l'autorisation de l'école | Oui |
| Générer une licence self-hosted | Oui | Non | Non |
| Importer une licence et exporter le rapport d'usage | Non | Non | Oui (self-hosted) |
| Créer un espace de démonstration | Oui | Oui | Non |
| Publier une annonce de maintenance | Oui | Oui | Non |

## 3. User stories

Le module compte 13 user stories, dont 10 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-19-01 | super-administrateur | créer le client d'un devis signé (organisation ou groupe, sous-domaine, formule, volume, dates) et inviter son administrateur en une seule opération | ouvrir l'espace d'une école en moins de 10 minutes | Must |
| US-19-02 | super-administrateur | voir chaque mois le nombre d'apprenants actifs par client, comparé au volume du contrat | facturer correctement et repérer les dépassements | Must |
| US-19-03 | super-administrateur | exporter l'état de facturation du mois (client, formule, volume, montant calculé selon la grille tarifaire) | établir les factures dans mon outil comptable | Must |
| US-19-04 | super-administrateur | activer ou désactiver des fonctionnalités selon la formule du client | respecter le contrat | Must |
| US-19-05 | super-administrateur | suspendre un client pour impayé, puis le réactiver | gérer le recouvrement | Must |
| US-19-06 | super-administrateur | fournir l'export complet des données d'un client en fin de contrat, puis les supprimer | respecter le RGPD et la réversibilité | Must |
| US-19-07 | administrateur d'école | autoriser le support Scolaly à accéder à mon espace pour une durée limitée | être aidé sans partager mon mot de passe | Must |
| US-19-08 | agent du support | accéder à l'espace d'une école quand elle m'y autorise, avec un bandeau visible | résoudre un problème rapidement | Must |
| US-19-09 | super-administrateur | générer un fichier de licence signé pour un client self-hosted | qu'il installe et renouvelle Scolaly sans connexion à nos serveurs | Must |
| US-19-10 | administrateur d'école (self-hosted) | importer ma licence et exporter mon rapport d'usage annuel | renouveler mon contrat | Must |
| US-19-11 | commercial Scolaly | créer un espace de démonstration pré-rempli pour un prospect, valable 30 jours | lui faire essayer Scolaly | Should |
| US-19-12 | super-administrateur | annoncer une maintenance à tous les clients ou à certains | les prévenir 72 heures à l'avance (EXP-01) | Should |
| US-19-13 | administrateur d'école | voir mon contrat, mon usage et les notes de version | savoir où j'en suis et ce qui change | Should |

## 4. Règles de gestion

### Cycle de vie d'un client (SaaS)

- **RG-19-01** : un client est un groupe ou une organisation seule (RG-00-23). Sa création, faite par un super-administrateur après signature du devis, renseigne en une seule opération :
  - la raison sociale, le SIREN, les contacts de facturation ;
  - le sous-domaine ;
  - la formule, le volume d'apprenants contractuel, les dates de début et de fin ;
  - le nom et l'email de l'administrateur.

  Scolaly crée alors l'organisation (ou le groupe et ses écoles), active les fonctionnalités de la formule et envoie l'invitation à l'administrateur, qui arrive sur la liste de démarrage (module 01).
- **RG-19-02** : un client passe par les états suivants : *actif* → *suspendu* (par exemple pour impayé ; l'école passe en lecture seule et un bandeau l'explique) → *résilié* (accès fermé après la date de fin) → *supprimé*. Chaque changement d'état demande un motif et est tracé. L'école est prévenue par email 15 jours avant une suspension.
- **RG-19-03** : à la résiliation, l'école peut télécharger un export complet pendant 90 jours (base de données dans un format documenté, fichiers, PDF officiels), compatible avec l'import self-hosted (RG-00-08). Au-delà, les données sont supprimées définitivement, sauf obligation légale de conservation, et une attestation de suppression est envoyée.

### Formules et fonctionnalités

- **RG-19-04** : chaque module est rattaché à une formule (étude business, partie 2). Essentiel : modules 01 à 08 ; Pro : Essentiel plus les modules d'alternance complète, de CRM, de qualité et de facturation ; Entreprise : Pro plus groupe d'écoles avancé, SSO, API et engagement de disponibilité à 99,9 %. Le super-administrateur peut ouvrir ou fermer un module pour un client, hors formule, par exemple pour un pilote.
- **RG-19-05** : une fonctionnalité non incluse n'est pas cachée : elle apparaît grisée, avec une explication et un lien « Demander » qui prévient l'équipe commerciale. Aucune donnée n'est perdue quand un module est fermé ; elle redevient visible à la réouverture.

### Usage et facturation (sur devis, facturation manuelle)

- **RG-19-06** : un apprenant actif (unité de facturation, module 00) est compté une fois par année scolaire et par client, dès qu'il a une inscription à l'état « inscrit ». Les apprenants pré-inscrits, les candidats et les comptes de démonstration ne sont pas comptés.
- **RG-19-07** : le décompte est calculé chaque nuit et figé le dernier jour de chaque mois. Un dépassement de plus de 5 % du volume contractuel déclenche une alerte au super-administrateur et un message à l'administrateur de l'école. Le service n'est jamais bloqué.
- **RG-19-08** : l'état de facturation mensuel (ou annuel, selon le contrat) calcule le montant d'après la grille tarifaire en tranches marginales, les remises du contrat et le minimum annuel. Il s'exporte en CSV pour l'outil comptable. La facture elle-même et le suivi des paiements restent hors de Scolaly au MVP ; seul le statut « payé / en retard » est reporté à la main pour alimenter RG-19-02.

### Accès du support

- **RG-19-09** : aucun membre de l'équipe Scolaly n'accède aux données d'une école par défaut. L'administrateur de l'école accorde un accès depuis ses paramètres, pour une durée choisie (24 heures par défaut, 7 jours au maximum), en lecture seule ou en écriture, et peut le retirer à tout moment.
- **RG-19-10** : pendant un accès support, un bandeau est visible chez l'agent, et l'école voit une alerte « Accès du support en cours ». Toutes les actions de l'agent sont tracées dans le journal d'audit de l'école (RG-01-22), avec son identité réelle. La double authentification est obligatoire pour les comptes Scolaly.

### Licences self-hosted

- **RG-19-11** : une licence est un fichier signé numériquement par Scolaly (clé privée conservée hors de la plateforme). Elle contient : le client, la formule, le volume d'apprenants, les modules activés, les dates de début et d'expiration, et l'identifiant de l'instance. Scolaly l'installe hors ligne et vérifie sa signature au démarrage puis chaque jour, sans aucun appel à nos serveurs.
- **RG-19-12** : 60 jours, 30 jours et 7 jours avant l'expiration, l'administrateur est prévenu. Après l'expiration, 30 jours de grâce, puis lecture seule (RG-00-09). L'import d'une nouvelle licence rétablit le service immédiatement.
- **RG-19-13** : le rapport d'usage annuel (apprenants actifs par mois, version installée) est généré par l'instance et signé par elle. L'école l'envoie à Scolaly pour le renouvellement. Il ne contient aucune donnée personnelle.
- **RG-19-14** : les versions de Scolaly sont publiées comme images Docker signées et versionnées (version majeure.mineure.correctif), avec des notes de version en français. L'interface d'administration d'une instance self-hosted indique quand une nouvelle version est disponible, sans télécharger quoi que ce soit automatiquement.

### Démonstrations et informations de service

- **RG-19-15** : un espace de démonstration est une organisation pré-remplie de données fictives réalistes (une école, 3 formations, 150 apprenants dont 60 alternants, un semestre d'EDT, des appels, des notes). Il est créé en un clic pour un prospect, avec des comptes prêts pour chaque rôle. Il expire au bout de 30 jours (prolongeable) puis est supprimé. Il ne peut jamais être converti en espace client.
- **RG-19-16** : une annonce de maintenance cible tous les clients ou certains. Elle s'affiche en bandeau dans Scolaly et part par email aux administrateurs, au moins 72 heures à l'avance (EXP-01). Une page de statut publique montre l'état des services et l'historique des incidents (EXP-03).

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-19-01 · Clients | Super-administrateur, support | Liste filtrable (état, formule, dépassement, échéance du contrat), recherche, bouton « Nouveau client » |
| E-19-02 · Nouveau client | Super-administrateur | Formulaire unique RG-19-01, aperçu du sous-domaine, création en un clic |
| E-19-03 · Fiche client | Super-administrateur, support | Contrat, écoles du groupe, modules activés, usage mois par mois, historique des états, accès support en cours |
| E-19-04 · Facturation du mois | Super-administrateur | État de facturation de tous les clients, dépassements, statut payé / en retard, export CSV |
| E-19-05 · Licences | Super-administrateur | Licences émises, échéances, génération et téléchargement d'un fichier de licence |
| E-19-06 · Démonstrations | Super-administrateur, support | Espaces de démo actifs, création en un clic, prolongation, comptes par rôle |
| E-19-07 · Maintenances et notes de version | Super-administrateur, support | Annonces planifiées, cibles, notes de version publiées |
| E-19-08 · Mon abonnement (côté école) | Administrateur d'organisation | Formule, modules, volume contractuel et usage, dates, accès support (accorder, retirer), licence (self-hosted : import, rapport d'usage) |

### Parcours « nouveau client » (moins de 10 minutes)

1. Le devis est signé ; le super-administrateur ouvre E-19-02.
2. Il saisit le client, le sous-domaine, la formule, le volume, les dates et l'administrateur.
3. Il valide : l'espace est créé, les modules de la formule sont activés, l'administrateur reçoit son invitation.
4. L'administrateur de l'école active son compte et arrive sur la liste de démarrage (module 01).

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Client | raison sociale, SIREN, contacts de facturation, état, historique des états, mode (SaaS / self-hosted) | porte un groupe ou une organisation ; a des contrats |
| Contrat | formule, volume d'apprenants, prix et remises, minimum annuel, dates, périodicité de facturation, référence du devis | appartient à un client |
| Activation de module | client, module, origine (formule / exception), dates | détermine les fonctionnalités visibles |
| Relevé d'usage | client, mois, apprenants actifs, figé (oui / non) | calculé chaque nuit |
| État de facturation | client, période, montant calculé, dépassement, statut de paiement | export CSV |
| Accès support | organisation, agent, droits (lecture / écriture), début, fin, accordé par | tracé dans l'audit de l'école |
| Licence | client, contenu signé, dates, identifiant d'instance, version | une active par instance |
| Espace de démonstration | prospect, commercial, date d'expiration, comptes par rôle | organisation fictive, jamais convertie |
| Annonce de maintenance | période, cible, texte, statut | affichée en bandeau et envoyée par email |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Sous-domaine déjà pris ou réservé (www, api, admin…) | Refusé à la saisie, avec des propositions |
| Client qui passe de SaaS à self-hosted | Export complet (RG-19-03), génération de la licence, puis résiliation de l'espace SaaS après confirmation de l'import |
| Horloge d'un serveur self-hosted déréglée | La vérification de la licence tolère 48 heures d'écart ; au-delà, l'administrateur est alerté sans blocage immédiat |
| Fichier de licence modifié | Signature invalide : la licence est refusée et la précédente reste active |
| Suspension pendant une période d'examens | Le super-administrateur voit les événements à venir de l'école avant de confirmer ; les feuilles d'émargement restent consultables |

## 8. Critères d'acceptation

- [ ] Un client avec un groupe de 3 écoles est créé et son administrateur invité en moins de 10 minutes.
- [ ] Le décompte des apprenants actifs d'un mois correspond exactement à RG-19-06 sur un jeu de test (pré-inscrits et démos exclus).
- [ ] L'état de facturation applique correctement les tranches marginales, les remises et le minimum annuel sur 5 cas de test.
- [ ] Sans autorisation de l'école, un compte Scolaly ne peut lire aucune donnée de l'école, même par l'API (test automatisé).
- [ ] Un accès support expire automatiquement à la date prévue, et toutes ses actions figurent dans l'audit de l'école.
- [ ] Une instance self-hosted sans accès à Internet accepte une licence valide, refuse une licence modifiée, et passe en lecture seule 30 jours après l'expiration.
- [ ] Un espace de démonstration complet est créé en moins de 2 minutes, avec un compte par rôle.

## 9. Exigences propres au module

- **Sécurité** : la console d'administration est accessible uniquement depuis un domaine séparé, avec double authentification obligatoire et liste d'adresses IP autorisées. La clé de signature des licences n'est jamais stockée sur les serveurs de production.
- **Traçabilité** : toutes les actions de la console sont journalisées dans un audit propre à Scolaly, conservé 3 ans.
- **RGPD** : Scolaly, sous-traitant, n'utilise jamais les données des écoles pour un autre usage que le service. Les relevés d'usage et les rapports self-hosted ne contiennent que des nombres.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Commercialisation | Tout sur devis : création de l'espace par Scolaly après signature, facturation manuelle (facture et virement ou prélèvement) |
| Essai | Pas d'inscription en libre-service ; site de démonstration avec des données pré-enregistrées, ouvert sur demande pour 30 jours (RG-19-15) ; les prix publics restent affichés sur le site de Scolaly |
| Paiement en ligne des abonnements | Non prévu |

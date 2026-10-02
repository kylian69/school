# Cahier des charges Scolaly — 08 · Portails et notifications

> Statut : **validé** le 01/10/2026.
> Document de travail : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b

## 1. Objectif et périmètre

Chaque personne doit trouver en ouvrant Scolaly ce qu'elle a à faire aujourd'hui, et être prévenue au bon moment, par le bon canal, sans être noyée de messages. Ce module assemble les accueils par rôle, l'application installable (PWA), les notifications, les annonces et les documents de l'apprenant. **Phase : MVP** ; la messagerie interne arrive en V2.

**Inclus :**

- accueils par rôle : apprenant, intervenant, tuteur, scolarité, responsable pédagogique, direction, direction de groupe ;
- application web installable (PWA) avec fonctionnement hors ligne pour l'essentiel ;
- centre de notifications, notifications push et email, préférences par type et par canal ;
- annonces ciblées (organisation, établissement, formation, promotion, groupe, rôle) ;
- espace « Mes documents » et documents générés à la demande (certificat de scolarité, attestation d'inscription).

**Exclus :**

- messagerie interne et conversations (V2) ;
- SMS (V2, option payante) ;
- application mobile native (non prévue : la PWA suffit).

## 2. Acteurs et droits

| Action | Admin | Direction | Resp. pédagogique | Scolarité | Intervenant | Apprenant | Tuteur |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Publier une annonce | Toute l'organisation | Toute l'organisation | Ses formations | Son établissement | Ses groupes | Non | Non |
| Régler ses préférences de notification | Oui | Oui | Oui | Oui | Oui | Oui | Oui |
| Définir les notifications obligatoires et les plages de silence | Oui | Non | Non | Non | Non | Non | Non |
| Configurer les adresses d'envoi des emails | Oui | Non | Non | Non | Non | Non | Non |
| Générer un certificat de scolarité | Non | Non | Non | Oui (pour un apprenant) | Non | Oui (le sien) | Non |
| Personnaliser les modèles de documents | Oui | Non | Non | Non | Non | Non | Non |

## 3. User stories

Le module compte 14 user stories, dont 11 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-08-01 | apprenant | voir en ouvrant l'application mon prochain cours (salle, heure), le bouton Émarger quand c'est le moment, mes devoirs proches, mes nouvelles notes et mes absences à justifier | savoir quoi faire en un coup d'œil | Must |
| US-08-02 | intervenant | voir mes séances du jour avec, pour chacune, l'appel à lancer ou à valider et le cahier de texte à remplir | ne rien oublier | Must |
| US-08-03 | scolarité | voir sur mon accueil les justificatifs à traiter, les alertes d'assiduité et les comptes non activés | traiter les urgences en premier | Must |
| US-08-04 | responsable pédagogique | voir les appels non validés, les cahiers vides, l'avancement de la saisie des notes et les conflits d'EDT | piloter mes formations | Must |
| US-08-05 | direction | voir les indicateurs clés de l'école (effectifs, assiduité, résultats, alertes) | suivre l'activité sans demander de rapport | Must |
| US-08-06 | apprenant | installer Scolaly sur l'écran d'accueil de mon téléphone et recevoir des notifications push | l'utiliser comme une application | Must |
| US-08-07 | apprenant | consulter mon EDT et mon cahier de texte sans réseau | ne pas être bloqué dans une salle mal couverte | Must |
| US-08-08 | utilisateur | retrouver toutes mes notifications dans un centre de notifications et les marquer comme lues | ne rien perdre | Must |
| US-08-09 | utilisateur | choisir, par type de notification, de la recevoir par push, par email ou pas du tout | ne recevoir que ce qui m'est utile | Must |
| US-08-10 | responsable pédagogique | publier une annonce pour une promotion, avec pièce jointe et date d'expiration | informer tout le monde au même endroit | Must |
| US-08-11 | apprenant | télécharger un certificat de scolarité à jour, à tout moment | ne pas attendre la scolarité | Must |
| US-08-12 | scolarité | demander un accusé de lecture sur une annonce importante et voir qui ne l'a pas lue | m'assurer qu'une information est passée | Should |
| US-08-13 | apprenant | retrouver tous mes documents (bulletins, relevés, attestations, conventions) au même endroit | les fournir facilement | Should |
| US-08-14 | utilisateur | définir mes heures de silence | ne pas être dérangé le soir | Could |

## 4. Règles de gestion

### Accueils par rôle

- **RG-08-01** : chaque rôle a un accueil composé de blocs « à faire », triés par urgence, puis de blocs d'information. Une personne qui a plusieurs rôles voit un accueil combiné, avec un filtre par rôle.

| Rôle | Blocs « à faire » | Blocs d'information |
| --- | --- | --- |
| Apprenant | Émarger (pendant une fenêtre de scan), absences à justifier, devoirs à échéance proche | Prochain cours, EDT du jour, nouvelles notes, annonces |
| Intervenant | Appels à lancer ou à valider, cahiers à remplir, notes à saisir avant la clôture | Séances du jour et de la semaine, heures réalisées du mois |
| Tuteur | Absences non justifiées de ses alternants | Où est chaque alternant aujourd'hui, assiduité du mois |
| Scolarité | Justificatifs à traiter, alertes d'assiduité, comptes non activés, photos à valider | Effectifs, séances annulées du jour |
| Responsable pédagogique | Appels non validés, cahiers en retard, conflits d'EDT, saisie des notes, bulletins à vérifier | Heures réalisées par rapport à la maquette, assiduité par promotion |
| Direction | Bulletins à valider, alertes de niveau 2 | Effectifs, taux d'assiduité, moyennes, évolutions par rapport au mois précédent |
| Direction de groupe | — | Tableau de bord de groupe (E-01-12) |

- **RG-08-02** : un bloc « à faire » disparaît dès que l'action est faite. Un accueil sans action affiche « Rien à faire pour l'instant ».
- **RG-08-03** : l'accueil s'affiche en moins de 2 secondes en 4G (module 00). Les compteurs sont mis à jour en temps réel.

### Application installable (PWA)

- **RG-08-04** : Scolaly est installable sur l'écran d'accueil (Android, iOS 16.4 et suivants, ordinateur) avec l'icône et le nom de l'école. L'installation est proposée après l'activation du compte (parcours du module 01), puis rappelée une fois.
- **RG-08-05** : hors ligne, restent consultables : l'EDT des 14 prochains jours, le cahier de texte et les devoirs des 14 derniers jours, les dernières notes publiées et les documents déjà ouverts. Les actions faites hors ligne (scan, saisie du cahier de texte) sont envoyées au retour du réseau. Un bandeau indique que les données datent de la dernière synchronisation.
- **RG-08-06** : les mises à jour de l'application s'installent automatiquement. Une mise à jour majeure demande à recharger la page, jamais au milieu d'une saisie.

### Notifications

- **RG-08-07** : chaque notification a un type, un niveau (critique, important, information), un texte court, un lien vers l'écran concerné et une date. Elle apparaît toujours dans le centre de notifications. Le push et l'email dépendent du type et des préférences.
- **RG-08-08** : catalogue par défaut (extrait), modifiable par l'école :

| Type | Destinataires | Niveau | Canaux par défaut |
| --- | --- | --- | --- |
| Cours annulé ou déplacé dans les 48 h (RG-04-14) | Apprenants, intervenants | Critique | Push + email |
| Absence constatée (RG-03-18) | Apprenant | Important | Push + email |
| Absence non justifiée d'un alternant (RG-03-19) | Tuteur | Important | Email à 12 h et 16 h 30 |
| Justificatif validé ou refusé | Apprenant | Information | Push |
| Seuil d'absence atteint (RG-06-23) | Scolarité, référent, direction | Important | Email |
| Appel non validé (RG-06-14) | Intervenant | Important | Push + email |
| Cahier de texte à remplir (RG-05-13) | Intervenant | Information | Push |
| Nouvelle note publiée | Apprenant | Information | Push |
| Bulletin publié | Apprenant, tuteur si l'option est activée | Important | Push + email |
| Nouvelle annonce | Destinataires de l'annonce | Selon l'annonce | Push |
| Modifications d'EDT au-delà de 48 h | Apprenants, intervenants | Information | Récapitulatif quotidien à 18 h |
| Rappel 10 minutes avant le cours (salle, heure) | Apprenants | Information | Push, activé par défaut, désactivable par l'apprenant |

- **RG-08-09** : l'utilisateur règle ses préférences par type et par canal, sauf pour les types marqués obligatoires par l'école (par défaut : cours annulé dans les 48 h, absence constatée, sécurité du compte). Ceux-là arrivent au moins dans le centre de notifications et par email.
- **RG-08-10** : des plages de silence sont appliquées au push : 21 h – 7 h et le dimanche par défaut, paramétrables par l'école et par l'utilisateur. Les notifications critiques passent quand même. Les autres sont livrées à la fin de la plage.
- **RG-08-11** : les notifications d'un même type sont regroupées si elles arrivent en rafale (par exemple 5 nouvelles notes en 10 minutes = une seule notification push).
- **RG-08-12** : par défaut, les emails partent d'une adresse Scolaly (par exemple notifications@scolaly.fr), avec le nom de l'école comme expéditeur et l'adresse de réponse de l'école : aucune configuration n'est nécessaire. L'école peut configurer ses propres adresses d'envoi, de deux façons :
  - en vérifiant son domaine (enregistrements DNS SPF, DKIM et DMARC fournis par Scolaly, vérifiés automatiquement) ;
  - en connectant son propre serveur SMTP (indispensable en self-hosted).

  Un email de test est envoyé avant l'activation, et Scolaly revient à l'adresse par défaut si la configuration de l'école tombe en panne. Les emails sont aux couleurs de l'école, avec un lien de désinscription par type (sauf types obligatoires). Les rebonds sont suivis et signalés sur la fiche de la personne (module 01).

### Annonces

- **RG-08-13** : une annonce a un titre, un texte enrichi, des pièces jointes, une cible (organisation, établissement, formation, promotion, groupe, rôle, ou combinaison), une date de publication (immédiate ou planifiée), une date d'expiration facultative et un niveau (information ou important).
- **RG-08-14** : une annonce peut être épinglée en haut de l'accueil jusqu'à son expiration. Un accusé de lecture peut être demandé : le destinataire confirme « J'ai lu », et l'auteur voit la liste des non-lecteurs et peut les relancer.
- **RG-08-15** : un intervenant ne peut cibler que ses propres groupes. Une annonce reste modifiable après publication, avec la mention « modifiée ».

### Documents de l'apprenant

- **RG-08-16** : l'espace « Mes documents » regroupe tout ce qui concerne l'apprenant : bulletins, relevés, attestations (module 07), calendrier d'alternance, contrat ou convention (module 03), récapitulatifs d'assiduité (module 06), et documents déposés par la scolarité.
- **RG-08-17** : le certificat de scolarité et l'attestation d'inscription sont générés instantanément à la demande, pour l'année en cours. Ils portent la signature numérisée de la direction et le QR code de vérification (RG-07-17). Pour un apprenant sorti, seule la scolarité peut les générer, avec les dates réelles d'inscription.
- **RG-08-18** : les modèles de documents sont personnalisables par l'école (texte, mentions légales, signature) grâce à des champs à insérer (nom, formation, dates, établissement).

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-08-01 · Accueil | Tous (contenu selon le rôle, RG-08-01) | Blocs « à faire » puis informations ; sur mobile, une barre de navigation en bas (Accueil, EDT, Notes, Documents, Profil pour l'apprenant) |
| E-08-02 · Centre de notifications | Tous | Liste chronologique, filtre par type, tout marquer comme lu, lien vers chaque écran concerné |
| E-08-03 · Préférences de notification | Tous | Tableau types × canaux à cocher (les types obligatoires sont grisés), plages de silence |
| E-08-04 · Annonces | Tous en lecture ; auteurs selon droits | Liste des annonces, épinglées en premier, accusé de lecture |
| E-08-05 · Rédiger une annonce | Auteurs | Éditeur, choix de la cible avec le nombre de destinataires, planification, accusé de lecture, aperçu |
| E-08-06 · Mes documents | Apprenant | Documents classés par type et par année, boutons « Certificat de scolarité » et « Attestation d'inscription » |
| E-08-07 · Paramètres de communication | Administrateur | Catalogue des notifications (canaux par défaut, obligatoires), plages de silence, adresses d'envoi des emails (domaine vérifié ou SMTP, email de test), modèles de documents |

### Parcours « journée d'un apprenant »

1. 8 h 20 : rappel « Cours de 8 h 30 en salle B12 » (activé par défaut). Il ouvre Scolaly : le bouton « Émarger » est en haut de l'accueil.
2. 8 h 32 : il scanne le QR ; la confirmation s'affiche.
3. 12 h : un cours de l'après-midi est annulé : notification push immédiate.
4. Le soir : il consulte le travail à faire, puis télécharge un certificat de scolarité demandé par son entreprise.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Notification | destinataire, type, niveau, texte, lien, date, lue (oui / non), canaux d'envoi et statut de chaque envoi | générée par les autres modules |
| Type de notification | code, libellé, niveau, canaux par défaut, obligatoire (oui / non) | catalogue Scolaly, paramétrable par organisation |
| Préférence | personne, type, canaux choisis, plages de silence | une par personne et par type |
| Abonnement push | compte, appareil, clés Web Push, date | un par appareil |
| Configuration d'envoi | organisation, mode (Scolaly / domaine vérifié / SMTP), domaine, statut des enregistrements DNS, paramètres SMTP chiffrés, adresse de réponse | une par organisation |
| Annonce | auteur, titre, contenu, pièces jointes, cible, publication, expiration, niveau, épinglée, accusé demandé | a des accusés de lecture |
| Accusé de lecture | annonce, personne, date | — |
| Modèle de document | type (certificat, attestation…), contenu, champs, signature | par organisation |
| Document | personne, type, année, PDF, empreinte, code de vérification, origine (généré / déposé) | rangé dans « Mes documents » |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| Push refusé sur le téléphone | Les notifications passent par email et restent dans le centre de notifications ; l'accueil propose de réactiver le push |
| iPhone sans installation sur l'écran d'accueil (pas de push possible sur iOS) | L'accueil explique comment installer l'application en 3 étapes illustrées |
| Annonce envoyée à la mauvaise cible | L'auteur peut la retirer : elle disparaît des accueils, et les emails déjà partis ne peuvent pas être rappelés |
| Plusieurs appareils pour un même compte | Le push est envoyé à tous les appareils actifs ; une lecture sur l'un marque la notification lue partout |
| Email en rebond répété | Les envois par email sont suspendus pour cette adresse, et la scolarité est avertie |
| Domaine de l'école mal configuré ou serveur SMTP en panne | Retour automatique à l'adresse Scolaly, alerte à l'administrateur |

## 8. Critères d'acceptation

- [ ] L'accueil de chaque rôle affiche ses blocs « à faire » corrects sur un jeu de données de démonstration (test par rôle).
- [ ] L'accueil apprenant s'affiche en moins de 2 secondes en 4G ; l'EDT et le cahier de texte s'ouvrent en mode avion après une première connexion.
- [ ] Une notification critique arrive en push en moins d'une minute, y compris pendant une plage de silence.
- [ ] Un utilisateur qui désactive l'email pour « nouvelle note » ne reçoit plus ces emails, mais garde la notification dans son centre.
- [ ] Une annonce ciblée sur une promotion n'est vue par aucun apprenant d'une autre promotion (test automatisé).
- [ ] Un certificat de scolarité est généré en moins de 3 secondes, et son QR code renvoie à la page de vérification.
- [ ] L'application s'installe sur Android, iOS 16.4+ et ordinateur, avec l'icône et le nom de l'école.
- [ ] Une école configure son propre domaine d'envoi : les enregistrements DNS sont vérifiés, l'email de test arrive, et les emails suivants passent les contrôles SPF, DKIM et DMARC.
- [ ] Le rappel 10 minutes avant le cours arrive par défaut, et plus du tout après désactivation par l'apprenant.

## 9. Exigences propres au module

- **Fiabilité** : notifications envoyées par une file de tâches avec reprise, suivi de livraison des emails, pas de doublon. Le débit d'envoi est limité pour respecter les fournisseurs d'email.
- **Performance** : un pic de notifications (par exemple 2 000 absences le même matin) ne ralentit pas l'application (envoi asynchrone).
- **RGPD** : les abonnements push et les préférences sont supprimés avec le compte. Les emails ne contiennent aucune donnée sensible (pas de motif d'absence, pas de note) : ils renvoient vers Scolaly.
- **Sécurité** : les identifiants SMTP des écoles sont chiffrés au repos et jamais affichés en clair.
- **Accessibilité** : les notifications et l'accueil sont lisibles par les lecteurs d'écran ; les blocs « à faire » sont des liens explicites.

## 10. Décisions

| Sujet | Décision (01/10/2026) |
| --- | --- |
| Rappel 10 minutes avant le cours | Activé par défaut, désactivable par l'apprenant (RG-08-08) |
| Adresse d'envoi des emails | Adresse Scolaly par défaut ; l'école peut configurer ses propres adresses par vérification de domaine ou par son serveur SMTP (RG-08-12) |
| SMS | V2, option payante |
| Messagerie interne | V2 |

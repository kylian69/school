# Cahier des charges Scolaly — 17 · Référent handicap

> Statut : **validé** le 02/10/2026.
> Document de travail (avec le schéma de l'accompagnement) : https://claude.ai/code/artifact/ef8b794a-f4ea-40cd-9d4e-ced869cfd12b
## 1. Objectif et périmètre

Ce module outille le référent handicap, obligatoire dans un CFA : repérer les besoins, construire avec l'apprenant un plan d'aménagements, et faire appliquer ces aménagements par l'équipe et l'entreprise sans jamais exposer d'information de santé. **Phase : V3.**

Le périmètre initial du module 17 comprenait aussi la formation continue et la gestion financière des aides aux apprentis : ces deux sujets sont reportés (décision du 02/10/2026).

**Inclus :**

- signalement confidentiel d'un besoin, par l'apprenant ou le candidat, ou alerte d'un membre de l'équipe ;
- **dossier confidentiel** par apprenant, visible du seul référent et de l'apprenant (décision du 02/10/2026) ;
- plan d'aménagements, avec l'accord de l'apprenant sur ce qui est partagé et avec qui ;
- consignes transmises aux personnes concernées, sans le motif ;
- application automatique dans Scolaly quand c'est possible (temps majoré aux épreuves en ligne) ;
- revue périodique, annuaire des partenaires, indicateurs agrégés pour Qualiopi.

**Exclus :**

- formation continue : sessions courtes, conventions de formation, inscriptions CPF par EDOF (décision du 02/10/2026) ;
- gestion financière des aides aux apprentis : demandes, justificatifs, remboursements (décision du 02/10/2026) ; le suivi simple du module 10 reste ;
- organisation matérielle des examens (salle à part, surveillance), hors périmètre depuis le module 15 ;
- accessibilité de Scolaly lui-même, exigence transverse du cadre général.

## 2. Acteurs et droits

Le référent handicap est un rôle du cadre général (module 00). Ni l'administrateur, ni la direction, ni le support Scolaly n'ont accès aux dossiers.

| Action | Référent handicap | Apprenant | Intervenant | Responsable pédagogique | Tuteur | Direction et admin |
| --- | --- | --- | --- | --- | --- | --- |
| Signaler un besoin | Pour un apprenant | Le sien | Alerter le référent | Alerter le référent | Alerter le référent | Non |
| Consulter le dossier | Oui | Le sien | Non | Non | Non | Non |
| Établir le plan d'aménagements | Oui | Donne son accord | Non | Non | Non | Non |
| Voir les consignes | Oui | Les siennes | Ses apprenants, si accord | Ses formations, si accord | Si accord | Non |
| Consulter les indicateurs agrégés | Oui | Non | Non | Non | Non | Oui |
| Paramétrer (liste d'aménagements, délais, conservation) | Oui | Non | Non | Non | Non | Admin |

## 3. User stories

Le module compte 12 user stories, dont 9 « Must ».

| ID | En tant que… | je veux… | afin de… | Priorité |
| --- | --- | --- | --- | --- |
| US-17-01 | apprenant ou candidat | signaler un besoin d'aménagement en toute confidentialité | être accompagné sans que tout le monde le sache | Must |
| US-17-02 | référent handicap | être prévenu d'un nouveau signalement et proposer un entretien | répondre vite | Must |
| US-17-03 | référent handicap | tenir un dossier confidentiel (entretiens, pièces, partenaires) | suivre chaque situation dans la durée | Must |
| US-17-04 | référent handicap | construire un plan d'aménagements à partir d'une liste type | gagner du temps et ne rien oublier | Must |
| US-17-05 | apprenant | choisir ce qui est partagé, et avec qui, avant toute diffusion | garder la maîtrise de mes informations | Must |
| US-17-06 | intervenant | voir les consignes à appliquer pour mes apprenants, sans le motif | adapter mes cours | Must |
| US-17-07 | intervenant | que le temps majoré s'applique seul aux épreuves en ligne | ne pas l'oublier | Must |
| US-17-08 | tuteur | connaître les aménagements utiles en entreprise, si l'apprenant l'accepte | adapter le poste | Should |
| US-17-09 | référent handicap | être rappelé quand un plan doit être revu | garder des aménagements adaptés | Must |
| US-17-10 | intervenant | alerter le référent d'une difficulté observée | qu'un apprenant ne passe pas entre les mailles | Should |
| US-17-11 | direction | suivre des indicateurs agrégés | prouver l'accompagnement lors de l'audit Qualiopi | Must |
| US-17-12 | référent handicap | retrouver les contacts des partenaires (MDPH, Agefiph, Cap emploi…) | orienter rapidement | Could |

## 4. Règles de gestion

Accompagnement (schéma dans le document de travail) : le signalement, l'entretien et le plan restent dans la zone confidentielle ; seules les consignes acceptées par l'apprenant sortent de cette zone, sans le motif. Le plan est appliqué, puis revu et ajusté régulièrement.

### Confidentialité

- **RG-17-01** : le dossier handicap est une donnée sensible. Seules les personnes qui ont le rôle de référent handicap dans l'organisation, et l'apprenant lui-même, peuvent l'ouvrir. Ni l'administrateur, ni la direction, ni le support Scolaly n'y ont accès. L'attribution du rôle est journalisée et signalée aux référents déjà en poste ; chaque consultation d'un dossier est journalisée.
- **RG-17-02** : Scolaly n'enregistre aucun diagnostic médical. Le dossier contient seulement l'existence d'un besoin, la reconnaissance administrative éventuelle (RQTH ou notification de la MDPH : oui ou non, avec date de fin de validité), les aménagements et les échanges utiles. Ces champs et les pièces jointes sont chiffrés.
- **RG-17-03** : rien n'est partagé sans l'accord explicite de l'apprenant (et de son représentant légal s'il est mineur), donné dans Scolaly pour chaque destinataire : intervenants, responsable pédagogique, tuteur, jury. L'accord est révocable à tout moment ; son retrait retire aussitôt les consignes chez les destinataires.
- **RG-17-04** : le dossier est conservé pendant la formation, puis supprimé ou anonymisé après un délai paramétrable (12 mois par défaut). Une trace sans contenu reste dans le journal.

### Signalement et dossier

- **RG-17-05** : l'apprenant signale un besoin depuis une case confidentielle de sa candidature (module 09) ou de son portail (module 08), avec un message libre facultatif. Un intervenant, un responsable pédagogique ou un tuteur peut alerter le référent d'une difficulté observée, sans hypothèse médicale ; l'apprenant en est informé. Le référent est notifié et doit prendre un premier contact dans un délai paramétrable (10 jours ouvrés par défaut), sinon une alerte part.
- **RG-17-06** : le dossier regroupe les entretiens (date, compte rendu), les pièces, les partenaires mobilisés, la reconnaissance éventuelle, le plan en vigueur et l'historique des plans.

### Plan d'aménagements

- **RG-17-07** : le plan se construit à partir d'une liste type paramétrable, en quatre familles :
  - *pédagogie* : supports adaptés, enregistrement des cours, place dans la salle, pauses ;
  - *évaluations* : temps majoré (en pourcentage), supports adaptés, salle à part, aide humaine ;
  - *assiduité et rythme* : horaires aménagés, absences pour soins ;
  - *entreprise* : adaptation du poste ou du rythme. Chaque aménagement porte une consigne rédigée pour son destinataire, des dates de début et de fin, et la liste des destinataires autorisés.
- **RG-17-08** : l'apprenant consulte le plan et donne son accord par une signature électronique simple (service du module 13) avant toute diffusion.
- **RG-17-09** : chaque plan a une date de revue (chaque semestre par défaut) ; le référent est rappelé à l'approche. Une révision crée une nouvelle version et conserve l'historique.

### Application

- **RG-17-10** : les destinataires autorisés voient une pastille discrète sur la fiche de l'apprenant et dans la liste d'appel. Elle ouvre seulement les consignes qui les concernent, jamais le motif.
- **RG-17-11** : le temps majoré s'applique automatiquement à chaque épreuve en ligne du module 15 (prolongation individuelle selon le pourcentage) ; l'intervenant voit seulement « temps aménagé ». Pour une épreuve sur papier, l'intervenant reçoit la consigne ; l'organisation matérielle reste hors de Scolaly.
- **RG-17-12** : si le plan prévoit des absences pour soins, l'absence justifiée par l'apprenant avec ce motif apparaît seulement comme « justifiée » dans le module 06, sans détail.
- **RG-17-13** : pour un apprenti, et avec son accord, le référent peut signaler au chargé de relations entreprises qu'une majoration de prise en charge OPCO s'applique selon les règles en vigueur (module 10), sans détail sur la situation.

### Pilotage

- **RG-17-14** : des indicateurs agrégés mesurent le nombre d'apprenants accompagnés, le délai de premier contact, les plans à jour et les types d'aménagements. Ils sont masqués sous le seuil des petits effectifs (RG-16-03) et servent de preuves pour l'audit Qualiopi (module 12), sans aucune donnée nominative.
- **RG-17-15** : chaque organisation tient un annuaire des partenaires (MDPH, Agefiph, Cap emploi, services de santé étudiante…) avec contacts et notes.

## 5. Écrans et parcours

| Écran | Rôles | Contenu principal |
| --- | --- | --- |
| E-17-01 · Tableau du référent | Référent handicap | Nouveaux signalements, premiers contacts en retard, plans à revoir |
| E-17-02 · Dossier confidentiel | Référent ; apprenant pour le sien | Entretiens, pièces, reconnaissance, partenaires, historique |
| E-17-03 · Plan d'aménagements | Référent ; apprenant pour l'accord | Aménagements par famille, consignes, destinataires, dates, accord |
| E-17-04 · Signaler un besoin | Apprenant, candidat | Formulaire court, explication claire de la confidentialité |
| E-17-05 · Mes consignes | Intervenant, responsable pédagogique, tuteur | Consignes des apprenants concernés, sans le motif |
| E-17-06 · Mes partages | Apprenant | Qui voit quoi, retrait de l'accord |
| E-17-07 · Indicateurs | Référent, direction | Agrégats, masqués sous le seuil |
| E-17-08 · Paramètres | Référent, admin | Liste type d'aménagements, délais, conservation, partenaires |

### Parcours « un étudiant qui demande un aménagement »

1. Lors de sa candidature, l'étudiant coche « je souhaite échanger avec le référent handicap ».
2. Le référent reçoit l'alerte, propose un entretien et en note le compte rendu dans le dossier.
3. Il prépare le plan : temps majoré d'un tiers, supports en grands caractères, place près de la sortie.
4. L'étudiant accepte le partage avec les intervenants, mais pas avec l'entreprise.
5. Les intervenants voient la pastille et les consignes ; les épreuves en ligne appliquent seules le temps majoré ; le plan est revu au semestre suivant.

## 6. Données

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Dossier handicap | apprenant, référent, statut, reconnaissance (oui ou non, fin de validité), dates | chiffré, accès restreint |
| Entretien | dossier, date, compte rendu, pièces | appartient au dossier |
| Plan d'aménagements | dossier, version, dates, accord de l'apprenant, date de revue | contient des aménagements |
| Aménagement | plan, famille, type, paramètre (par exemple pourcentage de temps), consigne, destinataires, dates | appliqué par les modules 06 et 15 |
| Accord de partage | plan, destinataire (rôle ou personne), date d'accord, date de retrait | révocable |
| Signalement | auteur (apprenant, intervenant, tuteur), date, message, statut | ouvre ou complète un dossier |
| Partenaire | organisation, type, contacts, notes | annuaire |
| Journal d'accès | utilisateur, dossier, action, date | inaltérable |

## 7. Cas limites et erreurs

| Situation | Comportement attendu |
| --- | --- |
| L'apprenant retire son accord | Les consignes disparaissent aussitôt chez les destinataires ; le temps majoré ne s'applique plus aux épreuves futures |
| Changement de formation ou d'année | Le plan est conservé, les destinataires sont recalculés (nouveaux intervenants) et l'apprenant confirme le partage |
| Aucun référent désigné | Le signalement ne peut pas être activé ; l'administrateur est alerté |
| Le référent quitte l'école | Ses dossiers sont transférés au nouveau référent, avec trace |
| Plan validé pendant une épreuve en cours | Le temps majoré s'applique aux épreuves suivantes ; l'intervenant peut prolonger manuellement (RG-15-13) |
| Apprenant mineur | L'accord du représentant légal est requis en plus |
| Demande d'accès de l'apprenant à ses données | Export de son dossier |
| Fin de la durée de conservation | Suppression ou anonymisation automatique, trace sans contenu |

## 8. Critères d'acceptation

- [ ] Aucun rôle autre que référent handicap, administrateur et direction compris, ne peut ouvrir un dossier (test par rôle).
- [ ] Un intervenant voit les consignes, jamais le motif ni le dossier.
- [ ] Le retrait de l'accord retire les consignes chez tous les destinataires en moins d'une minute.
- [ ] Le temps majoré d'un tiers porte automatiquement une épreuve en ligne de 60 à 80 minutes.
- [ ] Chaque consultation d'un dossier apparaît dans le journal.
- [ ] Les indicateurs agrégés sont masqués sous le seuil des petits effectifs.
- [ ] Un signalement sans premier contact dans le délai déclenche une alerte.

## 9. Exigences propres au module

- **Sécurité** : champs et pièces du dossier chiffrés avec des clés propres à chaque organisation ; journal d'accès inaltérable ; double authentification obligatoire pour le rôle de référent.
- **RGPD** : donnée sensible ; information claire de l'apprenant avant tout signalement ; analyse d'impact fournie à l'école ; durée de conservation paramétrable ; droits d'accès et d'effacement.
- **Discrétion** : aucune mention du handicap dans les listes, notifications, emails, exports libres ou tableaux de bord (hors agrégats masqués).
- **Accessibilité** : écrans de signalement et de consultation conformes au niveau AA du cadre général.

## 10. Décisions

| Sujet | Décision (02/10/2026) |
| --- | --- |
| Référent handicap | Dossier confidentiel par apprenant, visible du seul référent, avec les aménagements décidés et leur suivi |
| Formation continue | Hors périmètre pour le moment |
| Aides aux apprentis | Gestion financière hors périmètre ; le suivi simple du module 10 reste |

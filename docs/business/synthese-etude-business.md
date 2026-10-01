# Étude business — synthèse (30/09/2026)

Document complet (marché, tarifs, business plan, faisabilité/rentabilité, sources) :
https://claude.ai/code/artifact/fd1d51ae-fe72-4708-8567-43763554ef17

## Verdict
**GO conditionnel.** Le projet est faisable en solo avec l'IA, sur 3 rentrées. Il est rentable dès 2028 dans le scénario central, pour environ 460 k€ d'ARR en 2031.

Conditions au 31/03/2027 :
- au moins 10 entretiens qui confirment le besoin et un prix d'au moins 30 € par apprenant et par an ;
- 3 lettres d'intention (LOI) d'écoles pilotes signées ;
- un POC d'émargement qui tient 5 000 scans en 60 s (p99 < 200 ms, 0 perte).

## Décisions
- Cibles : écoles supérieures privées, CFA, organismes de formation, en initial et en alternance.
- Périmètre cible : parité fonctionnelle avec Ypareo. Toutes ses fonctions sont incluses dans la feuille de route.
- Distribution : SaaS et self-hosted (Docker), sous licence propriétaire.
- Équipe : fondateur seul assisté par l'IA ; premiers recrutements en 2029.

## Marché (France)
- Supérieur 2024-2025 : 3,0 millions d'étudiants, dont 799 700 dans le privé (26,5 %).
- Apprentissage : 1 017 500 contrats en cours fin 2025 (−3 %) ; 846 700 nouveaux contrats en 2025 (−5 %).
- Organismes : 3 920 CFA et environ 45 000 organismes de formation certifiés Qualiopi.
- Taille estimée : TAM environ 75 M€/an, SAM environ 29 M€/an, SOM à 5 ans environ 0,5 M€ d'ARR.
- Déclencheurs de changement : révision des NPEC (sept. 2026), facture électronique (2026-2027), Qualiopi.

## Tarifs (HT)
| Formule | ≤ 500 apprenants | 501–2 000 | > 2 000 | Minimum annuel |
|---|---|---|---|---|
| Essentiel | 25 € | 19 € | 14 € | 3 000 € |
| Pro | 40 € | 30 € | 22 € | 5 000 € |
| Entreprise | 55 € | 41 € | 30 € | 12 000 € |

- Prix par apprenant et par an, avec des tranches marginales (le passage d'une tranche à l'autre ne fait jamais baisser la facture).
- Formules pour les organismes de formation : 149 €, 349 € et 599 € par mois.
- Self-hosted : 80 % du prix SaaS, avec un minimum de 5 000 € par an.

## Feuille de route
| Période | Étape |
|---|---|
| Oct. 2026 → janv. 2027 | Découverte (15 entretiens) |
| Nov. 2026 → juin 2027 | Développement du MVP |
| Mars 2027 | Décision GO / no-go |
| Rentrée 2027 | MVP chez 3 écoles pilotes |
| Rentrée 2028 | V2 : alternance complète (CRM, CERFA/OPCO, facturation, BPF, Qualiopi) |
| Rentrée 2029 | V3 : parité avec Ypareo |

## Objectif

<!-- Ce que change cette PR, et pourquoi. Incrément du plan : I?.? -->

## US et RG couvertes

<!-- US-NN-xx, RG-NN-xx : chacune vérifiée par un test qui cite son numéro. -->

## Captures

<!-- Écrans concernés, en thème clair et sombre ; 360 px pour les rôles mobiles. -->

## Tests ajoutés

## Impact données et RGPD

<!-- Nouvelles données personnelles, durée de conservation, registre `docs/rgpd/registre.md`. -->

## Migration

<!-- « Ajouter, basculer, retirer » ; compatible avec la version précédente ? -->

## Liste de contrôle d'une PR sensible

- [ ] Nouvelle table : `organisation_id`, politique RLS, test d'isolation, index commençant par `organisation_id`.
- [ ] Nouvelle route : permission et périmètre déclarés, entrées validées par Zod.
- [ ] Action sensible : écriture dans le journal d'audit, avec valeur avant et après.
- [ ] Donnée personnelle nouvelle : justifiée par une story, durée de conservation fixée, registre mis à jour.
- [ ] Donnée sensible : chiffrée par champ, absente des journaux.
- [ ] Fichier déposé : type et taille limités, antivirus, lien signé.
- [ ] Accès externe : jeton aléatoire, durée limitée, révocable.
- [ ] Aucune valeur légale en dur (table datée de `packages/referentials`, avec sa source).

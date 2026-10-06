# Données embarquées

## `mots-de-passe-compromis.txt.gz`

Mots de passe compromis de 12 à 128 caractères (les plus courts sont déjà refusés par la longueur minimale, RG-01-10), en minuscules, un par ligne.

- **Sources** : SecLists, licence MIT (Daniel Miessler et contributeurs) — `Passwords/Common-Credentials/Pwdb_top-1000000.txt` et `100k-most-used-passwords-NCSC.txt` (liste publiée par le NCSC britannique).
- **Extraction** : 05/10/2026 ; entrées filtrées par longueur en caractères (Unicode), mises en minuscules et dédoublonnées ; entrées illisibles écartées.
- **Mise à jour** : relancer l'extraction (filtre `12 <= longueur <= 128`, minuscules, `sort -u`, `gzip -9`) et noter la date ici.

#!/bin/sh
# Charge le jeu de démonstration fictif dans une installation sans données réelles
# (préproduction, site de démonstration) : DEMO_PASSWORD=... sh infra/compose/demo-seed.sh
set -eu
cd "$(dirname "$0")"
: "${DEMO_PASSWORD:?Indiquer le mot de passe des comptes de démonstration (12 caractères au moins)}"
# Lecture d'une seule valeur : .env n'est pas un script shell (valeurs avec espaces).
MIGRATOR_DATABASE_PASSWORD=$(grep '^MIGRATOR_DATABASE_PASSWORD=' .env | cut -d= -f2-)
docker compose --env-file .env -f compose.yml run --rm \
  -e DEMO_ALLOW_PRODUCTION=true \
  -e DEMO_PASSWORD="${DEMO_PASSWORD}" \
  -e MIGRATOR_DATABASE_URL="postgres://scolaly_migrator:${MIGRATOR_DATABASE_PASSWORD}@postgres:5432/scolaly" \
  api node --enable-source-maps dist/cli/seed-demo.js

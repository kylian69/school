#!/bin/sh
# Démarre les services de développement, puis prépare la base (rôles et migrations).
set -eu
cd "$(dirname "$0")/../.."
[ -f .env ] || { cp .env.example .env; echo "Fichier .env créé à partir de .env.example."; }
docker compose -f infra/compose/compose.dev.yml up -d --wait "$@"
docker compose -f infra/compose/compose.dev.yml run --rm garage-init
docker compose -f infra/compose/compose.dev.yml exec -T postgres \
  psql -U postgres -tc "select 1 from pg_database where datname = 'scolaly'" | grep -q 1 \
  || docker compose -f infra/compose/compose.dev.yml exec -T postgres psql -U postgres -c 'create database scolaly'
pnpm --filter @scolaly/db build >/dev/null
node --env-file=.env packages/db/dist/cli/bootstrap.js
node --env-file=.env packages/db/dist/cli/migrate.js
echo "Services prêts. Lancer les applications avec : pnpm dev"

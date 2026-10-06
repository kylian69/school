#!/bin/sh
# Mise à jour de Scolaly en une commande (EXP-05) :
#   SCOLALY_VERSION=2026.11.1 sh infra/compose/update.sh
# Télécharge les images, applique les migrations (« ajouter, basculer, retirer » : compatibles
# avec la version en cours), puis remplace les services un par un.
set -eu
cd "$(dirname "$0")"
[ -f .env ] || { echo "Aucune installation trouvée (infra/compose/.env absent) : lancer install.sh." >&2; exit 1; }
if [ -n "${SCOLALY_VERSION:-}" ]; then
  sed -i "s/^SCOLALY_VERSION=.*/SCOLALY_VERSION=${SCOLALY_VERSION}/" .env
fi
compose() { docker compose --env-file .env -f compose.yml "$@"; }
compose pull --ignore-pull-failures
compose up -d --wait postgres valkey
compose up -d garage
compose run --rm garage-init
compose run --rm db-setup
compose up -d --wait --remove-orphans
echo "Scolaly est à jour (version $(grep '^SCOLALY_VERSION=' .env | cut -d= -f2))."

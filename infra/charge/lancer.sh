#!/bin/sh
# Preuve de charge de l'émargement (I2.2) : préparation, tir k6, vérification 0 perte / 0 doublon.
#
#   APPRENANTS=5000 sh infra/charge/lancer.sh
#   APPRENANTS=50000 API_URLS=http://host.docker.internal:3001,http://host.docker.internal:3002 \
#     sh infra/charge/lancer.sh
#
# Prérequis : services de développement (pnpm dev:up), API et worker construits et lancés
# (LOG_LEVEL=warn conseillé : un journal par requête fausserait la mesure), Docker pour k6.
# SEUIL_P99=0 désactive le seuil de latence (scénario réduit de la CI, ADR 0001).
set -eu
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
N=${APPRENANTS:-5000}
RACINE=$(pwd -W 2>/dev/null || pwd)
DONNEES=infra/charge/.donnees
mkdir -p "$DONNEES"

(cd apps/api && CHARGE_APPRENANTS="$N" CHARGE_FICHIER="../../$DONNEES/donnees-$N.json" \
  node --env-file-if-exists=../../.env dist/cli/charge-preparer.js)

statut=0
docker run --rm --add-host=host.docker.internal:host-gateway \
  -v "$RACINE/infra/charge:/charge" -v "$RACINE/$DONNEES:/donnees" \
  -e FICHIER="/donnees/donnees-$N.json" \
  -e API_URLS="${API_URLS:-http://host.docker.internal:3001}" \
  -e SEUIL_P99="${SEUIL_P99:-200}" \
  grafana/k6:2.3.0 run --quiet --summary-export="/donnees/resume-$N.json" /charge/emargement.js ||
  statut=$?

(cd apps/api && CHARGE_FICHIER="../../$DONNEES/donnees-$N.json" \
  CHARGE_RESUME="../../$DONNEES/resume-$N.json" \
  node --env-file-if-exists=../../.env dist/cli/charge-verifier.js) || statut=1
exit "$statut"

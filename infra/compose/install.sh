#!/bin/sh
# Installation à neuf de Scolaly, en une commande (jalon J0) :
#   SCOLALY_DOMAIN=scolaly.mon-ecole.fr sh infra/compose/install.sh
# Réseau local sans certificat public : SCOLALY_TLS=internal (autorité interne de Caddy).
# Génère les secrets dans infra/compose/.env (à sauvegarder avec les données), initialise le
# stockage et la base, puis démarre tous les services. Relançable sans risque.
set -eu
cd "$(dirname "$0")"
compose() { docker compose --env-file .env -f compose.yml "$@"; }
hex() { od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'; }

if [ ! -f .env ]; then
  : "${SCOLALY_DOMAIN:?Indiquer le nom de domaine : SCOLALY_DOMAIN=scolaly.mon-ecole.fr sh install.sh}"
  if echo "${SCOLALY_DOMAIN}" | grep -Eq '^[0-9.]+$|:'; then
    echo "SCOLALY_DOMAIN doit être un nom d'hôte, pas une adresse IP : les navigateurs ne peuvent pas" >&2
    echo "négocier HTTPS sur une adresse IP. Sur un réseau local, utiliser par exemple" >&2
    echo "SCOLALY_DOMAIN=scolaly.${SCOLALY_DOMAIN}.sslip.io SCOLALY_TLS=internal sh install.sh" >&2
    exit 1
  fi
  caddy_options=''
  [ "${SCOLALY_TLS:-}" = internal ] && caddy_options='local_certs'
  umask 077
  cat > .env <<CONFIG
# Configuration de cette installation de Scolaly. Contient des secrets : ne pas diffuser,
# sauvegarder avec les données (sans ENCRYPTION_MASTER_KEY_V1, les champs chiffrés sont perdus).
# Rotation de la clé maîtresse : sh rotation-cle.sh ajouter, basculer, retirer (ADR 0006).
SCOLALY_DOMAIN=${SCOLALY_DOMAIN}
SCOLALY_VERSION=${SCOLALY_VERSION:-main}
# local_certs : certificats de l'autorité interne de Caddy (réseau local, SCOLALY_TLS=internal).
SCOLALY_CADDY_OPTIONS=${caddy_options}
POSTGRES_PASSWORD=$(hex 24)
MIGRATOR_DATABASE_PASSWORD=$(hex 24)
APP_DATABASE_PASSWORD=$(hex 24)
BETTER_AUTH_SECRET=$(hex 32)
GARAGE_RPC_SECRET=$(hex 32)
GARAGE_ADMIN_TOKEN=$(hex 32)
S3_ACCESS_KEY_ID=GK$(hex 12)
S3_SECRET_ACCESS_KEY=$(hex 32)
ENCRYPTION_MASTER_KEY_V1=$(head -c 32 /dev/urandom | base64)
# Serveur d'envoi des emails de l'établissement (smtp://utilisateur:motdepasse@hote:587).
SMTP_URL=${SMTP_URL:-smtp://mailpit:1025}
MAIL_FROM=${MAIL_FROM:-Scolaly <ne-pas-repondre@${SCOLALY_DOMAIN}>}
# Antivirus : COMPOSE_PROFILES=antivirus et CLAMAV_HOST=clamav, ou ANTIVIRUS_DISABLED=true.
COMPOSE_PROFILES=${COMPOSE_PROFILES:-mailpit}
CLAMAV_HOST=${CLAMAV_HOST:-}
ANTIVIRUS_DISABLED=${ANTIVIRUS_DISABLED:-true}
CONFIG
  echo "Configuration et secrets générés dans infra/compose/.env"
fi

compose up -d --wait postgres valkey
compose up -d garage
compose run --rm garage-init
compose run --rm db-setup
compose up -d --wait
echo "Scolaly est démarré : https://$(grep '^SCOLALY_DOMAIN=' .env | cut -d= -f2)"

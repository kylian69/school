#!/bin/sh
# Prépare le conteneur cloud d'une session Claude Code (Claude Code on the web) :
# Node (version de .nvmrc), pnpm via corepack, Docker, dépendances, paquets construits
# et services de développement. Idempotent : sur un conteneur déjà prêt, il ne fait
# que vérifier. Lancé par le hook SessionStart de .claude/settings.json, uniquement
# quand CLAUDE_CODE_REMOTE=true ; utilisable aussi comme script de préparation de
# l'environnement. Sortie détaillée dans $JOURNAL, une seule ligne de résumé à l'écran.
set -eu
cd "$(dirname "$0")/../.."
JOURNAL=${JOURNAL:-/tmp/preparation-conteneur.log}
: >"$JOURNAL"

etape() {
  echo "== $1" >>"$JOURNAL"
}

echec() {
  echo "Préparation du conteneur interrompue ($1) : voir $JOURNAL."
  exit 0
}

NODE_MAJEURE=$(tr -dc '0-9' <.nvmrc)
if ! node -v 2>/dev/null | grep -q "^v$NODE_MAJEURE\."; then
  etape "Node $NODE_MAJEURE"
  BASE="https://nodejs.org/dist/latest-v$NODE_MAJEURE.x"
  ARCHIVE=$(curl -fsSL "$BASE/SHASUMS256.txt" | grep -o "node-v[0-9.]*-linux-x64.tar.xz" | head -1) ||
    echec "téléchargement de Node"
  mkdir -p /opt/node
  curl -fsSL "$BASE/$ARCHIVE" | tar -xJ -C /opt/node --strip-components=1 || echec "installation de Node"
  ln -sf /opt/node/bin/* /usr/local/bin/
fi

if ! command -v pnpm >/dev/null 2>&1; then
  etape "pnpm"
  corepack enable --install-directory /usr/local/bin >>"$JOURNAL" 2>&1 || echec "corepack"
fi

if ! command -v docker >/dev/null 2>&1; then
  etape "Docker"
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y -q docker.io docker-compose-v2 >>"$JOURNAL" 2>&1 ||
    { apt-get update -q >>"$JOURNAL" 2>&1 && apt-get install -y -q docker.io docker-compose-v2 >>"$JOURNAL" 2>&1; } ||
    echec "installation de Docker"
fi
if ! docker info >/dev/null 2>&1; then
  etape "démon Docker"
  systemctl start docker >>"$JOURNAL" 2>&1 || (nohup dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || echec "démarrage de Docker"
fi

etape "dépendances"
pnpm install --frozen-lockfile >>"$JOURNAL" 2>&1 || echec "pnpm install"

etape "construction des paquets"
pnpm exec turbo run build --filter='./packages/*' >>"$JOURNAL" 2>&1 || echec "construction des paquets"

etape "services de développement"
pnpm dev:up >>"$JOURNAL" 2>&1 || echec "pnpm dev:up"

echo "Conteneur prêt : Node $(node -v), pnpm $(pnpm -v), dépendances installées, paquets construits, services de développement démarrés (pnpm dev:up). Ne pas réinstaller."

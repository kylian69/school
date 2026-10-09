#!/bin/sh
# Rotation de la clé maîtresse du chiffrement par champ (ADR 0006), en trois temps :
#   sh infra/compose/rotation-cle.sh ajouter        # génère la clé suivante, encore inutilisée
#   sh infra/compose/rotation-cle.sh basculer       # chiffre avec elle et rechiffre l'existant
#   sh infra/compose/rotation-cle.sh etat           # valeurs par version de clé
#   sh infra/compose/rotation-cle.sh retirer 1      # retire la clé v1 si plus rien ne l'utilise
# Aucune clé n'est affichée. Sauvegarder infra/compose/.env après chaque étape.
set -eu
cd "$(dirname "$0")"
[ -f .env ] || { echo "Aucune installation trouvée (infra/compose/.env absent) : lancer install.sh." >&2; exit 1; }
compose() { docker compose --env-file .env -f compose.yml "$@"; }
chiffrement() { compose exec -T worker node --enable-source-maps dist/cli/chiffrement.js "$@"; }
# Versions présentes (lignes actives de .env), de la plus ancienne à la plus récente.
versions() { sed -n 's/^ENCRYPTION_MASTER_KEY_V\([0-9]*\)=..*$/\1/p' .env | sort -n; }
derniere() { versions | tail -n 1; }
courante() {
  v=$(sed -n 's/^ENCRYPTION_KEY_VERSION=\([0-9]*\)$/\1/p' .env | tail -n 1)
  [ -n "$v" ] && echo "$v" || derniere
}
# compose.yml transmet ENCRYPTION_MASTER_KEY_V1 à _V5 à l'API et au worker.
VERSION_MAX=5
redemarrer() { compose up -d --wait api worker; }

case "${1:-}" in
  ajouter)
    actuelle=$(courante)
    suivante=$(($(derniere) + 1))
    if [ "$suivante" -gt "$VERSION_MAX" ]; then
      echo "Version v${suivante} non transmise par compose.yml (v1 à v${VERSION_MAX}) : l'y ajouter d'abord." >&2
      exit 1
    fi
    if [ "$actuelle" != "$(derniere)" ]; then
      echo "Une clé v$(derniere) attend déjà la bascule : lancer « basculer »." >&2
      exit 1
    fi
    umask 077
    # La version courante devient explicite : la nouvelle clé n'est pas encore utilisée.
    grep -q '^ENCRYPTION_KEY_VERSION=' .env || echo "ENCRYPTION_KEY_VERSION=${actuelle}" >> .env
    echo "ENCRYPTION_MASTER_KEY_V${suivante}=$(head -c 32 /dev/urandom | base64)" >> .env
    redemarrer
    echo "Clé v${suivante} ajoutée (chiffrement toujours en v${actuelle}). Sauvegarder infra/compose/.env, puis lancer « basculer »."
    ;;
  basculer)
    cible=$(derniere)
    if [ "$(courante)" = "$cible" ]; then
      echo "Le chiffrement utilise déjà la clé la plus récente (v${cible}) : lancer d'abord « ajouter »." >&2
      exit 1
    fi
    sed -i "s/^ENCRYPTION_KEY_VERSION=.*/ENCRYPTION_KEY_VERSION=${cible}/" .env
    redemarrer
    echo "Chiffrement des nouvelles valeurs en v${cible}. Rechiffrement de l'existant (repris chaque heure par le worker) :"
    chiffrement rechiffrer || echo "Des valeurs illisibles restent à examiner (voir « etat »)." >&2
    chiffrement etat
    ;;
  etat)
    chiffrement etat
    ;;
  retirer)
    version="${2:-}"
    case "$version" in '' | *[!0-9]*) echo "Usage : sh rotation-cle.sh retirer <version>" >&2; exit 2 ;; esac
    grep -q "^ENCRYPTION_MASTER_KEY_V${version}=" .env || { echo "Aucune clé v${version} active dans .env." >&2; exit 1; }
    # Refus si la version est courante, encore utilisée, ou si des valeurs sont illisibles.
    chiffrement retrait-possible "$version"
    # La clé reste en commentaire : elle seule permet de relire les sauvegardes antérieures à la
    # rotation. La déplacer avec ces sauvegardes, puis l'effacer quand elles expirent.
    sed -i "s/^ENCRYPTION_MASTER_KEY_V${version}=/# Retirée le $(date -u +%Y-%m-%d), garder tant que des sauvegardes antérieures existent : ENCRYPTION_MASTER_KEY_V${version}=/" .env
    redemarrer
    echo "Clé v${version} retirée de l'API et du worker. Sauvegarder infra/compose/.env."
    ;;
  *)
    echo "Usage : sh infra/compose/rotation-cle.sh ajouter | basculer | etat | retirer <version>" >&2
    exit 2
    ;;
esac

# syntax=docker/dockerfile:1.7
# Image d'une application Node du monorepo (apps/api, apps/worker).
# Usage : docker build -f infra/docker/node-app.Dockerfile --build-arg APP=api .

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# 1. Monorepo réduit aux seuls paquets dont dépend l'application.
FROM base AS pruner
ARG APP
COPY . .
RUN pnpm dlx turbo@2.11.7 prune @scolaly/${APP} --docker --out-dir /pruned

# 2. Installation (couche mise en cache tant que les manifestes ne changent pas), puis construction.
FROM base AS builder
ARG APP
COPY --from=pruner /pruned/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /pruned/full/ .
RUN pnpm turbo run build --filter=@scolaly/${APP} \
 && pnpm --filter @scolaly/${APP} deploy --prod /out

# 3. Image d'exécution : dépendances de production seulement, utilisateur non privilégié.
FROM ${NODE_IMAGE} AS runtime
ARG APP
# Correctifs de sécurité du système ; npm et corepack, inutiles à l'exécution, sont retirés.
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /out/package.json ./package.json
COPY --from=builder --chown=node:node /out/node_modules ./node_modules
COPY --from=builder --chown=node:node /out/dist ./dist
USER node
LABEL org.opencontainers.image.source="https://github.com/kylian69/school" \
      org.opencontainers.image.title="scolaly-${APP}"
CMD ["node", "--enable-source-maps", "dist/main.js"]

# syntax=docker/dockerfile:1.7
# Image de l'interface Next.js (sortie « standalone »).

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.7 prune @scolaly/web --docker --out-dir /pruned

FROM base AS builder
COPY --from=pruner /pruned/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /pruned/full/ .
RUN pnpm turbo run build --filter=@scolaly/web

FROM ${NODE_IMAGE} AS runtime
# Correctifs de sécurité du système ; npm et corepack, inutiles à l'exécution, sont retirés.
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
LABEL org.opencontainers.image.source="https://github.com/kylian69/school" \
      org.opencontainers.image.title="scolaly-web"
CMD ["node", "apps/web/server.js"]

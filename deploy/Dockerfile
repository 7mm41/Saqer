# syntax=docker/dockerfile:1.7
# One Dockerfile, three images: api (with the admin panel inside), web (Next.js), caddy (with the technician PWA).
# Build from the repository root:  docker compose -f deploy/docker-compose.yml build
ARG NODE_IMAGE=node:24-bookworm-slim

# ---------------------------------------------------------------- dependencies (shared by all builds)
FROM ${NODE_IMAGE} AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/tech/package.json apps/tech/
COPY apps/admin/package.json apps/admin/
COPY tests/e2e/package.json tests/e2e/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter '!@katf/e2e'
COPY . .

# ---------------------------------------------------------------- api + admin panel
FROM deps AS build-api
RUN pnpm --filter @katf/admin build && pnpm --filter @katf/api build \
 && pnpm --filter @katf/api deploy --prod --legacy /out

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations LEGAL_SEED_DIR=/app/seed/legal ADMIN_DIST=/app/admin \
    DATA_DIR=/data STORAGE_DIR=/data/files
WORKDIR /app
COPY --from=build-api /out/package.json ./package.json
COPY --from=build-api /out/node_modules ./node_modules
COPY --from=build-api /src/apps/api/dist ./dist
COPY --from=build-api /src/apps/api/migrations ./migrations
COPY --from=build-api /src/apps/api/src/seed/legal ./seed/legal
COPY --from=build-api /src/apps/admin/dist ./admin
RUN mkdir -p /data/files && chown -R node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]

# ---------------------------------------------------------------- customer website
FROM deps AS build-web
RUN pnpm --filter @katf/web build

FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build-web --chown=node:node /src/apps/web/.next/standalone ./
COPY --from=build-web --chown=node:node /src/apps/web/.next/static ./apps/web/.next/static
COPY --from=build-web --chown=node:node /src/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# ---------------------------------------------------------------- reverse proxy + technician PWA
FROM deps AS build-tech
RUN pnpm --filter @katf/tech build

FROM caddy:2-alpine AS caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build-tech /src/apps/tech/dist /srv/tech

# syntax=docker/dockerfile:1.7

# ============================================================================
# ClipEngine web UI image.
#
# Standalone Next.js build for minimal runtime. The web container only talks
# to the API container over the internal network — it never reaches the host
# disk or spawns subprocesses.
# ============================================================================

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Builder: install deps and run the standalone build.
FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json biome.json tsconfig.base.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/llm-providers/package.json packages/llm-providers/
COPY packages/schemas/package.json packages/schemas/
COPY packages/search-providers/package.json packages/search-providers/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @clipengine/schemas build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @clipengine/web build

# Runtime: just node + the standalone bundle and static assets.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>{if(r.status>=500)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]

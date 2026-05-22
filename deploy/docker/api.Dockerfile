# syntax=docker/dockerfile:1.7

# ============================================================================
# ClipEngine API + worker image.
#
# Single Node 22 image that bundles ffmpeg, ffprobe, and yt-dlp from the
# distro repos so subprocess spawns just work, and cmake + git + build-base
# so nodejs-whisper can compile whisper.cpp the first time the local backend
# is asked to transcribe. better-sqlite3 is built natively at install time
# against the alpine glibc shim (gcompat).
# ============================================================================

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# System deps. ffmpeg / ffprobe come from the distro; yt-dlp is pinned via pip
# (the apt package lags upstream by months). cmake + g++ + git let
# nodejs-whisper build whisper.cpp on demand.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    yt-dlp \
    cmake \
    g++ \
    git \
    python3 \
    pkg-config \
    ca-certificates \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# ============================================================================
# Builder: install deps and compile every workspace package once.
# ============================================================================
FROM base AS builder
WORKDIR /app

# Cache deps separately from source.
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

# Now copy the rest and build.
COPY . .
RUN pnpm --filter @clipengine/api... build

# ============================================================================
# Runtime image: only the API needs to ship.
# ============================================================================
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV CLIPENGINE_DATA_DIR=/data
ENV CLIPENGINE_WORKSPACE=/workspace

# Pull the same pnpm store + node_modules layout the builder made.
COPY --from=builder /app /app

EXPOSE 8000
VOLUME ["/data", "/workspace"]

# Healthcheck hits /health (no auth required).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]

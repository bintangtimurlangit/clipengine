# Next.js standalone production image. Build from repo root:
#   docker build -f docker/web.Dockerfile .
FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG API_INTERNAL_URL=http://api:8000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ARG API_INTERNAL_URL=http://api:8000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

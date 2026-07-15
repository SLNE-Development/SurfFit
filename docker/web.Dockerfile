# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune web --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

# Build-time-only placeholders so env validation passes during `next build`.
# Real values are supplied at container runtime.
ENV DATABASE_URL="postgres://build:build@localhost:5432/build" \
  RABBITMQ_URL="amqp://build:build@localhost:5672" \
  REDIS_URL="redis://localhost:6379" \
  AUTH_SECRET="build-time-placeholder" \
  AUTH_URL="http://localhost:3000" \
  AUTH_DISCORD_ID="build-time-placeholder" \
  AUTH_DISCORD_SECRET="build-time-placeholder"

RUN pnpm turbo run build --filter=web

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=installer /app/apps/web/public ./apps/web/public
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]

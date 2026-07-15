# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune worker --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=worker

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 worker

COPY --from=installer --chown=worker:nodejs /app .

USER worker
EXPOSE 3001
ENV PORT=3001
CMD ["node", "apps/worker/dist/main.js"]

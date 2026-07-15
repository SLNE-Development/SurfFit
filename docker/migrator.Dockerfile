# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @surffit/db --docker

FROM base AS installer
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 migrator
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner --chown=migrator:nodejs /app/out/full/ .

USER migrator
WORKDIR /app/packages/db
CMD ["pnpm", "migrate"]

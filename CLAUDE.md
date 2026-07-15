# SurfFit

## Commands

- Dev stack: `docker compose -f docker/docker-compose.dev.yml up -d`
- `pnpm dev` — run all apps in dev mode
- `pnpm test` — unit tests
- `pnpm test:integration` — integration tests (needs Docker for Testcontainers)
- `pnpm lint` / `pnpm format` — Biome check / write
- `pnpm check-types` — TypeScript across all packages
- `pnpm build` — production build of all apps/packages
- `pnpm db:migrate` — apply pending migrations
- `pnpm db:generate` — generate a migration from schema changes
- `pnpm db:seed` — run the seed script

**pnpm only.** Never run `npm` or `yarn` — the root `preinstall` script blocks it.

## Executing superpowers plans

When implementing a plan under `docs/superpowers/plans/`, use `superpowers:executing-plans`,
not `superpowers:subagent-driven-development`, regardless of what the plan file's own header
suggests.

Do not run a final code review (e.g. dispatching a code-reviewer subagent) at the end of a
plan or task unless the user explicitly asks for one — they run their own review once the
project is done.

## Architecture rules

- Business logic lives only in `@surffit/core` services.
- SQL/Drizzle queries live only in repository files.
- tRPC procedures do: auth check → Zod input validation → service call. Nothing else.
- Cross-domain effects flow only through outbox events, never direct cross-module calls.
- No `console.log` in committed code — use `createLogger(scope)` from `@surffit/core`.

## shadcn rule

Add components via the CLI only, run from `packages/ui`:

```
pnpm dlx shadcn@latest add <component>
```

Never hand-write or edit files under `packages/ui/src/components/ui` except styling tweaks.

## Where things live

- `packages/core` — domain services (`identity`), event definitions (`events/`), messaging
  port (`messaging/`), outbox writer/relay (`outbox/`), env loader, logger, domain errors.
- `packages/db` — Drizzle schema, client, migrator, seed script.
- `packages/trpc` — router, context, error mapping.
- `packages/auth` — NextAuth v5 config (Discord OAuth, database sessions).
- `packages/validation` — shared Zod schemas (e.g. username).
- `packages/ui` — shared shadcn component library (`@surffit/ui`).
- `apps/web` — Next.js app; imports `@surffit/ui`, `@surffit/trpc`, `@surffit/auth`.
- `apps/worker` — RabbitMQ consumer + outbox relay process.

**Add a tRPC procedure:** add to a router file in `packages/trpc/src/routers/`, call a
`@surffit/core` service — no logic in the procedure itself.

**Add a migration:** edit the schema in `packages/db/src/schema/`, run `pnpm db:generate`,
review the generated SQL, then `pnpm db:migrate`.

**Define a new event:** add a `defineEvent` call in `packages/core/src/events/`, register it
in `events/registry.ts`, and bind a consumer group in `messaging/groups.ts`.

## Conventions

- UUIDv7 primary keys everywhere, via `newId()` from `@surffit/db` — never DB-generated.
- Soft deletes via `deleted_at` where the schema calls for it.
- Conventional Commits (`type(scope): summary`).
- TypeScript strict, no `any` — use `unknown` + narrowing.
- Translation tables with EN fallback and kg-canonical units arrive in a later phase.

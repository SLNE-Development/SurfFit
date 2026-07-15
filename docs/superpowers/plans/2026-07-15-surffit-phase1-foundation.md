# SurfFit Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No literal code by design (user directive, saves tokens).** Steps describe tests and implementations precisely in prose — exact file paths, exported names, signatures, commands, and expected outcomes. Write the code yourself from these descriptions. If a described name/signature conflicts with something, follow the plan's name.

**Goal:** A deployable SurfFit skeleton: Turborepo monorepo with enforced tooling, dev/prod Docker stacks, identity database schema + migrator, Discord OAuth with username onboarding, a working transactional-outbox → RabbitMQ → worker pipeline, structured logging, health endpoints, CI, and the root CLAUDE.md.

**Architecture:** Three deployable units (web = Next.js standalone, worker = Node RabbitMQ consumer, migrator = one-shot Drizzle migration runner) over Postgres/RabbitMQ/Redis/MinIO. All business logic in `@surffit/core` modules; tRPC procedures stay thin; side effects flow through an outbox table relayed to a RabbitMQ topic exchange. Spec: `docs/superpowers/specs/2026-07-15-surffit-architecture-design.md` (read §2, §3, §4.2, §4.12 before starting).

**Tech Stack:** TypeScript (strict), Next.js (App Router, latest stable via create-next-app), Tailwind CSS, shadcn/ui (CLI only), tRPC v11 + TanStack Query v5, Auth.js v5 (`next-auth@beta`) + `@auth/drizzle-adapter`, Drizzle ORM + drizzle-kit, PostgreSQL 18, RabbitMQ 4.x (`amqplib`), Pino, Zod v4, Vitest + Testcontainers, Turborepo + pnpm, Biome.

## Global Constraints

Every task implicitly includes these. Copy values exactly.

- **pnpm only.** Root `package.json` has a `packageManager` field pinning current pnpm 10.x, `engines.node: ">=22"`, and a `preinstall` script running `npx only-allow pnpm`. CI installs with `--frozen-lockfile`. Never run npm or yarn.
- **shadcn components only via CLI:** `pnpm dlx shadcn@latest add <component>`. Never hand-write or edit files under the shadcn `components/ui` directory except styling tweaks. Hand-authored shadcn primitives are a review blocker.
- **Layering:** business logic only in `@surffit/core` services; SQL/Drizzle queries only in repository files; tRPC procedures do auth check → Zod input validation → service call, nothing else. Cross-domain effects only via outbox events.
- **IDs:** UUIDv7 primary keys everywhere, app-generated via the `uuidv7` npm package (helper `newId()` in `@surffit/db`); never DB-generated defaults.
- **Timestamps:** `created_at`/`updated_at` timestamptz (UTC) on every table; soft delete via `deleted_at` where the spec says `soft`.
- **Logging:** Pino only via `createLogger(scope)` from `@surffit/core`. `console.log` is forbidden in committed code.
- **Errors:** services throw the typed domain errors from `@surffit/core` (Task 4); never throw raw `Error` for expected failures.
- **TypeScript strict:** `"strict": true`, no `any` (use `unknown` + narrowing).
- **Conventional Commits**, commit at the end of every task at minimum (steps mark commit points). Message format: `type(scope): summary`, e.g. `feat(db): add identity schema`.
- **Package names:** `@surffit/config`, `@surffit/core`, `@surffit/db`, `@surffit/trpc`, `@surffit/auth`, `@surffit/validation`. Apps: `web`, `worker`.
- **Infra images (dev + prod compose):** `postgres:18-alpine`, `rabbitmq:4.1-management-alpine`, `redis:8-alpine`, `minio/minio:latest`, `axllent/mailpit:latest`.
- **Env vars (exact names):** `DATABASE_URL`, `RABBITMQ_URL`, `REDIS_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `WORKER_QUEUES` (optional), `LOG_LEVEL` (default `info`), `NODE_ENV`, `PORT`.
- **Root scripts (defined Task 1, used everywhere):** `pnpm dev`, `pnpm build`, `pnpm lint` (Biome), `pnpm format`, `pnpm check-types`, `pnpm test` (unit), `pnpm test:integration`, `pnpm db:migrate`, `pnpm db:generate`, `pnpm db:seed`.
- **Version policy:** floors above are minimums; when scaffolds/installs resolve newer stable majors, keep them. Never downgrade to match memorized examples.
- **Windows note:** the dev machine is Windows; keep package scripts cross-platform (no bash-isms in `package.json` scripts; Node/tsx scripts where needed). CI runs Linux.

**Deferred beyond Phase 1 (do NOT build):** `packages/ui` (shadcn lives in `apps/web` until a shared component exists), `i18n`, storage/email/search providers, Redis usage, cron scheduler in worker, consumer event-id dedup helper, Playwright, `apps/docs`.

---

### Task 1: Monorepo scaffold (pnpm + Turborepo + Biome + shared tsconfig)

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.editorconfig`, `.nvmrc`, `biome.json`
- Create: `packages/config/package.json`, `packages/config/tsconfig/base.json`, `packages/config/tsconfig/node.json`, `packages/config/tsconfig/nextjs.json`

**Interfaces:**
- Produces: workspace globs `apps/*`, `packages/*`; root scripts listed in Global Constraints (each delegating to `turbo run <task>`; `db:*` scripts delegate to `pnpm --filter @surffit/db <task>`); tsconfig bases importable as `@surffit/config/tsconfig/base.json` etc. All later packages extend these.

- [ ] **Step 1:** Initialize git repo state (repo already has commits — just verify `git status` is clean). Create root `package.json` (private, `packageManager` pnpm 10.x — get the exact version from `pnpm --version`, engines node >=22, preinstall only-allow, scripts per Global Constraints; `lint` runs `biome check .`, `format` runs `biome format --write .`), `pnpm-workspace.yaml` with the two globs, `.nvmrc` containing `22`.
- [ ] **Step 2:** Create `turbo.json` with tasks: `build` (dependsOn `^build`, outputs `dist/**`, `.next/**` excluding `.next/cache`), `dev` (persistent, no cache), `check-types`, `test`, `test:integration` (no cache), `lint` handled at root by Biome directly (not a turbo task).
- [ ] **Step 3:** Create `biome.json`: recommended rules, formatter on (2-space indent, 100-col line width), organize imports on, ignore `**/dist`, `**/.next`, `**/migrations`. Create `.gitignore` (node_modules, dist, .next, .env, .turbo, coverage) and `.editorconfig` (utf-8, lf, final newline).
- [ ] **Step 4:** Create `packages/config`: package.json (name `@surffit/config`, no build step, exports the tsconfig JSON files via the `exports` field or plain file paths). `tsconfig/base.json`: strict, ES2023 lib+target, `moduleResolution: bundler`, `module: esnext`, isolatedModules, noUncheckedIndexedAccess, skipLibCheck, declaration false. `node.json` extends base with `types: ["node"]`. `nextjs.json` extends base with jsx `preserve`, plugin `next`, `allowJs`.
- [ ] **Step 5:** Run `pnpm install`. Expected: lockfile created, no errors. Run `pnpm lint`. Expected: exit 0. Sanity-check enforcement: `npm install` in the repo root must fail with the only-allow message (revert any lockfile it may create).
- [ ] **Step 6:** Commit `chore(repo): scaffold pnpm + turborepo + biome workspace`.

### Task 2: Commit hygiene (husky, lint-staged, commitlint, changesets)

**Files:**
- Create: `.husky/pre-commit`, `.husky/commit-msg`, `commitlint.config.mjs`, `.changeset/config.json` (via `pnpm changeset init`)
- Modify: root `package.json` (devDeps, `lint-staged` config key, `prepare` script running `husky`)

**Interfaces:**
- Produces: pre-commit runs lint-staged (Biome check --write on staged files); commit-msg runs commitlint with `@commitlint/config-conventional`.

- [ ] **Step 1:** Install root devDeps: husky, lint-staged, @commitlint/cli, @commitlint/config-conventional, @changesets/cli. Run `pnpm changeset init` and husky init. Wire the two hooks and the lint-staged config (pattern `*.{ts,tsx,js,jsx,json,md}` → `biome check --write --no-errors-on-unmatched`).
- [ ] **Step 2:** Verify: a commit with message `bad message` on a whitespace change fails at commit-msg; amend to `chore(repo): test hooks` passes. Undo the test commit if it was only for verification (or fold it into Step 3's commit).
- [ ] **Step 3:** Commit `chore(repo): add husky, lint-staged, commitlint, changesets`.

### Task 3: Dev infrastructure compose + env template

**Files:**
- Create: `docker/docker-compose.dev.yml`, `.env.example`

**Interfaces:**
- Produces: local services on fixed ports — Postgres 5432 (db `surffit`, user/pass `surffit`/`surffit`), RabbitMQ 5672 + management UI 15672 (user/pass `surffit`/`surffit`), Redis 6379, MinIO 9000/9001, Mailpit SMTP 1025 / UI 8025. `.env.example` is the canonical env reference.

- [ ] **Step 1:** Write the compose file using the pinned images from Global Constraints, named volumes for postgres/rabbitmq/minio data, and a healthcheck per service (postgres: `pg_isready`; rabbitmq: `rabbitmq-diagnostics -q ping`; redis: `redis-cli ping`; minio: curl `http://localhost:9000/minio/health/live`; mailpit: curl its `/readyz`). Project name `surffit`.
- [ ] **Step 2:** Write `.env.example` with every var from Global Constraints, dev values matching the compose services (`DATABASE_URL=postgres://surffit:surffit@localhost:5432/surffit`, `RABBITMQ_URL=amqp://surffit:surffit@localhost:5672`, `REDIS_URL=redis://localhost:6379`, `AUTH_URL=http://localhost:3000`, placeholder Discord creds, comment noting MinIO/Mailpit are unused until Phase 2). Add one-line comments per var.
- [ ] **Step 3:** Verify: `docker compose -f docker/docker-compose.dev.yml up -d` then `docker compose -f docker/docker-compose.dev.yml ps` shows all five services healthy; RabbitMQ management UI reachable at `http://localhost:15672`.
- [ ] **Step 4:** Commit `chore(infra): add dev docker compose and env template`.

### Task 4: `@surffit/core` base — env loader, logger, domain errors

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`
- Create: `packages/core/src/config/env.ts`, `packages/core/src/logger/index.ts`, `packages/core/src/errors/index.ts`
- Test: `packages/core/src/config/env.test.ts`, `packages/core/src/errors/errors.test.ts`

**Interfaces:**
- Produces: `loadEnv(): Env` — parses `process.env` once (cached), Zod-validated, throws on first call with a message listing every missing/invalid var name; `Env` type with the exact var names from Global Constraints (`WORKER_QUEUES` optional string, `LOG_LEVEL` enum trace..fatal default `info`, `NODE_ENV` enum development/test/production default `development`). `createLogger(scope: string)` — returns a Pino logger child with `{scope}`, level from `LOG_LEVEL`, pretty transport only when NODE_ENV=development, redact paths for `AUTH_SECRET` and `AUTH_DISCORD_SECRET`. Error classes extending abstract `DomainError` (fields: `code` string, `i18nKey` string, `params?: Record<string, unknown>`): `NotFoundError` (code `NOT_FOUND`), `PermissionDeniedError` (`PERMISSION_DENIED`), `ConflictError` (`CONFLICT`), `RateLimitedError` (`RATE_LIMITED`), `DomainRuleViolationError` (`DOMAIN_RULE_VIOLATION`); each constructor takes `(i18nKey, params?)`. Everything re-exported from `src/index.ts`. Package is consumed as TS source via workspace (no build step; `main`/`exports` point at `src/index.ts`), pattern reused by all later packages.
- Consumes: `@surffit/config` tsconfig node base.

- [ ] **Step 1:** Scaffold the package (deps: zod, pino, pino-pretty, uuidv7 not here — it lives in db; devDeps: vitest, typescript). Write failing tests first: env test uses `vi.stubEnv`/manual `process.env` manipulation to assert (a) valid env parses and caches, (b) missing `DATABASE_URL` throws an error whose message contains `DATABASE_URL`, (c) `LOG_LEVEL` defaults to `info`. Errors test asserts each class: instanceof DomainError, correct `code`, stores i18nKey/params.
- [ ] **Step 2:** Run `pnpm --filter @surffit/core test`. Expected: FAIL (modules don't exist).
- [ ] **Step 3:** Implement env.ts, logger, errors per the Interfaces block. Provide a test-only `resetEnvCache()` export for the caching test.
- [ ] **Step 4:** Run tests again. Expected: PASS. Run `pnpm check-types` and `pnpm lint`. Expected: exit 0.
- [ ] **Step 5:** Commit `feat(core): env validation, pino logger, domain errors`.

### Task 5: `@surffit/db` — Drizzle client, identity schema, outbox table, migrator

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/vitest.config.ts`
- Create: `packages/db/src/ids.ts`, `packages/db/src/client.ts`, `packages/db/src/citext.ts`, `packages/db/src/schema/users.ts`, `packages/db/src/schema/auth.ts`, `packages/db/src/schema/preferences.ts`, `packages/db/src/schema/roles.ts`, `packages/db/src/schema/consents.ts`, `packages/db/src/schema/outbox.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/migrate.ts`, `packages/db/src/seed.ts`, `packages/db/migrations/` (generated)
- Test: `packages/db/src/schema.integration.test.ts`

**Interfaces:**
- Produces: `newId(): string` (uuidv7); `createDb(connectionString: string)` returning a Drizzle instance over node-postgres `Pool` with the full schema attached; `Db` type; `schema` namespace export with tables: `users`, `accounts`, `sessions`, `userPreferences`, `privacySettings`, `userRoles`, `userConsents`, `outboxEvents`. Package scripts: `generate` (drizzle-kit generate), `migrate` (runs `src/migrate.ts` via tsx), `seed` (tsx `src/seed.ts` — logs "no seed data yet" and exits 0), `test:integration`.
- Table shapes (spec §4.2/§4.12, follow exactly): **users** — id pk, username citext unique NULLABLE (null until onboarding), displayName, email citext unique not null, avatarKey nullable, biography nullable, locale default `en`, onboardedAt nullable, anonymizedAt nullable, createdAt/updatedAt, deletedAt. **accounts/sessions** — exactly the columns `@auth/drizzle-adapter` documents (accounts pk = provider+providerAccountId composite; sessions keyed by sessionToken) but with our uuid text user ids. **userPreferences** — userId pk/fk, unitSystem enum metric|imperial default metric, theme enum dark|light|system default dark, firstWeekday smallint default 1, defaultGymId nullable (plain uuid column, no FK yet — gyms table is Phase 3), defaultRestSeconds int default 120, timestamps. **privacySettings** — userId pk/fk, profileVisibility enum public|following|private default public, showStatistics/showAchievements/showWorkouts bool default true, showBodyMetrics bool default false, timestamps. **userRoles** — userId fk, role enum user|moderator|admin|super_admin, grantedBy fk nullable, grantedAt; composite pk (userId, role). **userConsents** — id pk, userId fk, consentType, policyVersion, grantedAt, revokedAt nullable. **outboxEvents** — id pk (= event id), eventType, schemaVersion smallint, payload jsonb, occurredAt, dispatchedAt nullable, attempts smallint default 0; partial index on dispatchedAt WHERE null. citext via a Drizzle `customType` in `citext.ts`; first migration must `CREATE EXTENSION IF NOT EXISTS citext`.
- Dependency direction: `@surffit/db` must NOT depend on `@surffit/core` (core depends on db; a reverse dep would create a workspace cycle). `migrate.ts`/`seed.ts` therefore read `DATABASE_URL` from `process.env` directly and exit with a clear message if unset — they do not import `loadEnv`.

- [ ] **Step 1:** Scaffold package (deps: drizzle-orm, pg, uuidv7; devDeps: drizzle-kit, tsx, vitest, testcontainers, @types/pg). Write the failing integration test: start a Testcontainers `postgres:18-alpine`, run the exported migrator function against it, then assert (a) all eight tables exist (query information_schema), (b) inserting a user with `newId()` works and `username` may be null, (c) two users with usernames differing only by case violate the citext unique constraint, (d) inserting an outbox row with default attempts 0 works.
- [ ] **Step 2:** Run `pnpm --filter @surffit/db test:integration`. Expected: FAIL (no schema/migrations).
- [ ] **Step 3:** Implement schema files, ids, citext custom type, client. `migrate.ts` exports `runMigrations(connectionString)` using drizzle-orm's node-postgres migrator pointing at `packages/db/migrations`, plus a CLI entry (run directly → loadEnv → migrate → log summary → exit). Run `pnpm --filter @surffit/db generate` to produce the initial migration; inspect it and prepend the citext extension statement if drizzle-kit didn't emit it.
- [ ] **Step 4:** Run the integration test. Expected: PASS. Run `pnpm db:migrate` against the dev compose Postgres. Expected: log lists applied migration, exit 0.
- [ ] **Step 5:** Commit `feat(db): drizzle client, identity schema, outbox table, migrator`.

### Task 6: Event registry + RabbitMQ messaging port (in `@surffit/core`)

**Files:**
- Create: `packages/core/src/events/envelope.ts`, `packages/core/src/events/registry.ts`, `packages/core/src/events/user-registered.ts`, `packages/core/src/messaging/connection.ts`, `packages/core/src/messaging/topology.ts`, `packages/core/src/messaging/publisher.ts`, `packages/core/src/messaging/consumer.ts`, `packages/core/src/messaging/groups.ts`
- Modify: `packages/core/src/index.ts` (re-exports)
- Test: `packages/core/src/events/envelope.test.ts`, `packages/core/src/messaging/messaging.integration.test.ts`

**Interfaces:**
- Produces:
  - `EventEnvelope` = `{ id, type, version, occurredAt (ISO string), payload }`, Zod-validated. `defineEvent({type, version, payloadSchema})` returns a definition with a `create(payload)` helper that builds a full envelope (id via `newId()` from `@surffit/db`, occurredAt now) and a `parse(unknown)` guard. Registry maps type string → definition; first event: `user.registered` v1, payload `{userId: string, locale: string}`.
  - `connect(url)` → amqplib connection wrapper with auto-reconnect (simple retry loop, logs via `createLogger('messaging')`).
  - `assertTopology(channel, opts?)` — idempotently asserts: durable topic exchange `surffit.events`; durable fanout exchange `surffit.realtime`; per consumer group G (from the groups registry): durable queue `surffit.G` bound to `surffit.events` for each of G's binding patterns; retry queues `surffit.G.retry.10s|1m|10m` (durable, message TTL 10000/60000/600000 ms — TTLs overridable via `opts` for tests, dead-letter to the default exchange routed back to `surffit.G`); durable queue `surffit.G.dead` (no TTL).
  - `publishEvent(channel, envelope)` — publishes to `surffit.events`, routing key = envelope.type, persistent, awaits publisher confirm.
  - Consumer groups registry in `groups.ts`: `Record<groupName, { bindings: string[]; handler(envelope, ctx: {logger}): Promise<void> }>`. Phase 1 registers one group: `system`, bindings `['user.*']`, handler logs `event received` with type + id at info level.
  - `startConsumers(connection, groupNames, opts?)` — for each named group: consume `surffit.G`; parse message into envelope via registry (unparseable → straight to `.dead`, ack); on handler success ack; on handler throw read integer header `x-retry-count` (absent = 0): if < 3 republish a copy to `surffit.G.retry.<10s|1m|10m by count>` with header incremented and ack the original; if ≥ 3 publish to `surffit.G.dead` and ack. Returns `stop()` that cancels consumers gracefully.
- Consumes: `newId` from `@surffit/db`; `createLogger` from Task 4.

- [ ] **Step 1:** Add deps (amqplib, @types/amqplib). Write failing unit test for envelope: `user.registered` definition creates a valid envelope (id present, version 1), `parse` rejects a payload missing `userId`. Write failing integration test (Testcontainers `rabbitmq:4.1-management-alpine`): (a) `assertTopology` twice in a row does not throw; (b) publish a `user.registered` envelope → a registered test group with binding `user.*` receives it within 5s; (c) with retry TTLs overridden to ~200ms and a handler that always throws, the message ends up in the group's `.dead` queue after 3 retry hops (assert via `channel.checkQueue` messageCount, polling with timeout).
- [ ] **Step 2:** Run unit + integration tests. Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces. Keep `groups.ts` the single source of group names (`Object.keys` drives topology + consumer startup).
- [ ] **Step 4:** Run `pnpm --filter @surffit/core test` and `test:integration`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(core): event registry and rabbitmq messaging port with retry/DLQ topology`.

### Task 7: Outbox writer + relay (in `@surffit/core`)

**Files:**
- Create: `packages/core/src/outbox/write.ts`, `packages/core/src/outbox/relay.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/outbox/outbox.integration.test.ts`

**Interfaces:**
- Produces: `writeOutbox(tx, envelope)` — inserts an `outboxEvents` row inside a caller-supplied Drizzle transaction (row id = envelope id; eventType/schemaVersion/payload/occurredAt from the envelope). `startOutboxRelay({db, channel, intervalMs = 1000, batchSize = 50})` — loop: inside a transaction, `SELECT … FOR UPDATE SKIP LOCKED` up to batchSize undispatched rows (dispatchedAt IS NULL) ordered by occurredAt; for each: `publishEvent` with confirm, then set dispatchedAt = now, attempts + 1; publish failure → increment attempts, leave undispatched, log warn, continue next tick. Returns `{stop()}` which resolves after the in-flight tick finishes.
- Consumes: `outboxEvents` table (Task 5), `publishEvent` (Task 6).

- [ ] **Step 1:** Write failing integration test (Postgres + RabbitMQ containers): (a) `writeOutbox` inside a transaction that rolls back leaves zero rows; (b) three written events are all published and marked dispatched within 3 relay ticks; (c) **exactly-once under contention**: insert 100 rows, run two relay instances concurrently against the same DB for ~5s, count messages received by a bound test queue = exactly 100 and all rows dispatched.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces (use Drizzle's transaction API; the SKIP LOCKED select can use `sql` fragments — this file is a repository-layer file, raw query is allowed here).
- [ ] **Step 4:** Run `pnpm --filter @surffit/core test:integration`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(core): transactional outbox writer and skip-locked relay`.

### Task 8: `apps/worker` — queue-selectable consumer process

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/main.ts`, `apps/worker/src/queues.ts`, `apps/worker/src/health.ts`
- Test: `apps/worker/src/queues.test.ts`

**Interfaces:**
- Produces: `parseWorkerQueues(raw: string | undefined, known: string[]): string[]` in `queues.ts` — undefined/empty → all known; comma-separated with whitespace tolerated; any unknown name → throw listing valid names. `main.ts` boot order: loadEnv → createLogger('worker') → createDb → connect RabbitMQ → assertTopology → startConsumers(parsed groups) → startOutboxRelay → start health server → log one startup line naming active groups. Graceful shutdown on SIGINT/SIGTERM: stop relay, stop consumers, close channel/connection/pool, exit 0 (hard-exit 1 after 10s timeout). `health.ts`: plain node http server on `PORT` (default 3001): `GET /healthz` → 200 always; `GET /readyz` → 200 only when DB `select 1` succeeds and the AMQP connection is open, else 503.
- Consumes: everything produced by Tasks 4–7. Worker runs TS via tsx (script `dev`) — compiled/bundled only inside Docker (Task 13).

- [ ] **Step 1:** Write failing unit tests for `parseWorkerQueues` (four cases from the Interfaces block).
- [ ] **Step 2:** Run `pnpm --filter worker test`. Expected: FAIL. Implement, re-run. Expected: PASS.
- [ ] **Step 3:** Implement `main.ts` + `health.ts`. Manual verification with dev compose up: `pnpm --filter worker dev` logs startup naming group `system`; `curl http://localhost:3001/readyz` (or `Invoke-WebRequest`) → 200; Ctrl+C exits cleanly within 10s. Then insert a test outbox row (one-off: `pnpm --filter @surffit/db exec tsx -e` snippet or a temporary script) and confirm the worker logs `event received` for `user.registered` — this proves outbox → relay → RabbitMQ → consumer end-to-end.
- [ ] **Step 4:** Commit `feat(worker): queue-selectable consumer app with relay and health endpoints`.

### Task 9: `apps/web` scaffold — Next.js, Tailwind, shadcn init, health routes

**Files:**
- Create: `apps/web/` via `pnpm create next-app@latest` (TypeScript, App Router, Tailwind, ESLint **no** — Biome covers linting, src directory **yes**, import alias `@/*`)
- Create: `apps/web/src/app/healthz/route.ts`, `apps/web/src/app/readyz/route.ts`, `apps/web/src/lib/db.ts`
- Modify: `apps/web/next.config.ts` (`output: "standalone"`), `apps/web/src/app/layout.tsx` (dark mode), `apps/web/tsconfig.json` (extend `@surffit/config/tsconfig/nextjs.json`), `apps/web/package.json` (name `web`)

**Interfaces:**
- Produces: running app on :3000; `<html>` carries class `dark` (dark-first per spec); shadcn initialized (`components.json` present, `pnpm dlx shadcn@latest init` with defaults, base color neutral) — components land under `apps/web/src/components/ui` when added later; `src/lib/db.ts` exports a lazily-created singleton `db` via `createDb(loadEnv().DATABASE_URL)` reused across the app; `/healthz` → 200 JSON `{status:"ok"}`; `/readyz` → 200 after a `select 1` through `db`, 503 on failure. Both route handlers set `dynamic = "force-dynamic"`.
- Consumes: `@surffit/core` (loadEnv, createLogger), `@surffit/db` (createDb).

- [ ] **Step 1:** Scaffold with create-next-app inside `apps/`, rename package to `web`, wire tsconfig to the shared preset, set standalone output, delete boilerplate page content (keep a minimal landing page: centered "SurfFit" heading + one-line tagline).
- [ ] **Step 2:** Run `pnpm dlx shadcn@latest init` in `apps/web` (defaults; CSS variables yes). Do not add components yet.
- [ ] **Step 3:** Implement db singleton + the two routes. Verify: `pnpm --filter web dev`, GET `/healthz` 200; with dev compose up GET `/readyz` 200; stop Postgres container → `/readyz` 503 → start it again.
- [ ] **Step 4:** Run `pnpm build` (turbo builds core/db/web). Expected: success. Commit `feat(web): next.js app scaffold with shadcn init and health routes`.

### Task 10: `@surffit/trpc` — context, procedures, error mapping, client wiring

**Files:**
- Create: `packages/trpc/package.json`, `packages/trpc/tsconfig.json`, `packages/trpc/vitest.config.ts`, `packages/trpc/src/context.ts`, `packages/trpc/src/trpc.ts`, `packages/trpc/src/routers/health.ts`, `packages/trpc/src/routers/index.ts`
- Create: `apps/web/src/app/api/trpc/[trpc]/route.ts`, `apps/web/src/lib/trpc/client.tsx` (provider + typed hooks)
- Test: `packages/trpc/src/trpc.test.ts`

**Interfaces:**
- Produces: `createContext({session, db, logger})` → `Context` type (session nullable: `{user: {id: string}} | null` — shape finalized by Task 11, use this minimal structural type now); `router`, `publicProcedure`, `protectedProcedure` (rejects null session with TRPC `UNAUTHORIZED`; narrows `ctx.session` non-null); error formatter mapping DomainError subclasses → TRPC codes (`NOT_FOUND`→NOT_FOUND, `PERMISSION_DENIED`→FORBIDDEN, `CONFLICT`→CONFLICT, `RATE_LIMITED`→TOO_MANY_REQUESTS, `DOMAIN_RULE_VIOLATION`→BAD_REQUEST) and attaching `{i18nKey, params}` to `error.data`; `appRouter` with `health.ping` public query returning `{ok: true}`; `AppRouter` type export. Web side: fetch adapter route handler + a client provider component (TanStack Query v5 + `@trpc/react-query` typed by `AppRouter`) wrapped around the root layout children.
- Consumes: DomainError classes (Task 4), `Db` (Task 5).

- [ ] **Step 1:** Write failing tests using `appRouter.createCaller`: (a) `health.ping` works with anonymous context; (b) a test-only protected procedure rejects null session with UNAUTHORIZED; (c) a test-only procedure throwing `ConflictError('x.y')` surfaces code CONFLICT with `data.i18nKey === 'x.y'`.
- [ ] **Step 2:** Run `pnpm --filter @surffit/trpc test`. Expected: FAIL. Implement per Interfaces (deps: @trpc/server v11, zod). Re-run: PASS.
- [ ] **Step 3:** Wire web: route handler (session resolution stubbed as `null` until Task 11 — leave a single clearly-marked wiring point), client provider (deps in web: @trpc/client, @trpc/react-query, @tanstack/react-query). Verify in browser devtools/network: landing page mounts provider without errors; `curl http://localhost:3000/api/trpc/health.ping` returns the ok payload (GET with tRPC query encoding — or verify via a tiny client call on the landing page instead, then remove it).
- [ ] **Step 4:** Commit `feat(trpc): router foundation with domain error mapping and web wiring`.

### Task 11: `@surffit/auth` + identity module — Discord OAuth, signup side effects

**Files:**
- Create: `packages/auth/package.json`, `packages/auth/tsconfig.json`, `packages/auth/src/index.ts`, `packages/auth/src/config.ts`
- Create: `packages/core/src/identity/service.ts`, `packages/core/src/identity/repository.ts`, `packages/core/src/identity/index.ts`
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`, `apps/web/src/app/(auth)/signin/page.tsx`
- Modify: `packages/trpc/src/context.ts` consumers in web route handler (real session), `packages/core/src/index.ts`
- Test: `packages/core/src/identity/identity.test.ts`

**Interfaces:**
- Produces:
  - `@surffit/auth` exports `{auth, handlers, signIn, signOut}` from NextAuth v5 initialization: Drizzle adapter over `@surffit/db` (map adapter table names to our `users/accounts/sessions`), session strategy `database`, Discord provider from `AUTH_DISCORD_ID/SECRET`, `trustHost: true`. Session callback shapes `session.user` as `{id, username: string | null, displayName, onboarded: boolean}` (username/onboarded read from the user row — adapter returns our full user). `events.createUser` calls `identityService.onUserCreated(user.id, {locale: 'en'})`.
  - Identity module (business logic lives HERE, not in auth config): `identityService.onUserCreated(userId, {locale})` — in one DB transaction: insert default `userPreferences` row, insert default `privacySettings` row, `writeOutbox` a `user.registered` envelope `{userId, locale}`; idempotent (skip inserts that already exist, never double-write the event — check preferences existence first as the guard). Repository file owns all queries; service takes a repository interface (constructor or factory `createIdentityService(repo)`) so unit tests use an in-memory fake.
  - Web: nextauth route handler re-exporting `handlers`; `/signin` page with a "Continue with Discord" button posting to the NextAuth sign-in server action; tRPC route handler now resolves the real session via `auth()`.
- Consumes: users/accounts/sessions tables + `writeOutbox` + `user.registered` event definition; `createLogger`.

- [ ] **Step 1:** Write failing unit tests for `identityService.onUserCreated` against an in-memory fake repo: (a) creates one preferences row, one privacy row, one outbox event with correct type and payload; (b) calling it twice results in no duplicates (event written once).
- [ ] **Step 2:** Run `pnpm --filter @surffit/core test`. Expected: FAIL. Implement service + repository + wire into core index. Re-run: PASS.
- [ ] **Step 3:** Implement `@surffit/auth` (deps: next-auth@beta, @auth/drizzle-adapter) and the web pieces per Interfaces.
- [ ] **Step 4:** Verify (needs real Discord app credentials in `.env` — if unavailable, mark this substep for the user and verify the rest via `pnpm build` + typecheck): full flow dev compose + worker + web running → `/signin` → Discord consent → redirected back signed in; DB shows user + preferences + privacy rows; worker logs `event received user.registered`. This is the Phase 1 end-to-end proof.
- [ ] **Step 5:** Commit `feat(auth): discord oauth with database sessions and signup side effects`.

### Task 12: Username onboarding

**Files:**
- Create: `packages/validation/package.json`, `packages/validation/tsconfig.json`, `packages/validation/src/index.ts`, `packages/validation/src/username.ts`
- Create: `packages/trpc/src/routers/identity.ts`, `apps/web/src/app/onboarding/page.tsx`, onboarding form component `apps/web/src/app/onboarding/username-form.tsx`
- Modify: `apps/web/src/app/page.tsx` (onboarding gate)
- Modify: `packages/core/src/identity/service.ts` + repository (claim logic), `packages/trpc/src/routers/index.ts`
- Test: `packages/validation/src/username.test.ts`, extend `packages/core/src/identity/identity.test.ts`, extend `packages/trpc/src/trpc.test.ts`

**Interfaces:**
- Produces: `usernameSchema` (Zod): trims, lowercases, then requires regex `^[a-z0-9_]{3,20}$`, and rejects reserved names `admin, surffit, api, www, support, moderator, root, system` (i18nKey-style messages: `validation.username.format`, `validation.username.reserved`). `identityService.claimUsername(userId, rawUsername)` — validates via schema (`DomainRuleViolationError` with the schema's key on failure), `ConflictError('identity.alreadyOnboarded')` if user already has onboardedAt, `ConflictError('identity.username.taken')` on uniqueness collision (check + rely on the DB unique constraint for races, translating the constraint violation), sets username + onboardedAt, returns updated `{id, username}`. tRPC `identity` router: `claimUsername` protected mutation (input: `{username: string}`), `usernameAvailable` protected query (input same, returns `{available: boolean}`). Onboarding gate as **server-component redirects, NOT middleware** (database sessions cannot be read in edge middleware): the home page server component calls `auth()` — session with `onboarded === false` → `redirect('/onboarding')`; the onboarding page server component: no session → `redirect('/signin')`, already onboarded → `redirect('/')`. Onboarding page: client form using shadcn components added NOW via CLI — `pnpm dlx shadcn@latest add form input button label` — calling the mutation, on success routes to `/`, shows the i18nKey-derived message on failure (raw key text is fine in Phase 1, i18n arrives later).
- Consumes: identity service/repo (Task 11), protectedProcedure + error mapping (Task 10).

- [ ] **Step 1:** Write failing tests: username schema (valid, too short, uppercase input normalized to valid, illegal char, reserved word); service claim (happy path sets onboardedAt; taken → ConflictError with `identity.username.taken`; second claim → `identity.alreadyOnboarded`); tRPC caller (anonymous claim → UNAUTHORIZED).
- [ ] **Step 2:** Run affected package tests. Expected: FAIL. Implement validation package, service methods, router. Re-run: PASS.
- [ ] **Step 3:** Add the shadcn components via CLI (exact command above), build the server-component gates + page + form.
- [ ] **Step 4:** Manual verify (with Discord creds; else user-assisted): fresh sign-in redirects to `/onboarding`; taking an existing username shows the taken message; valid claim lands on `/`; revisiting `/onboarding` redirects home. `pnpm build` passes.
- [ ] **Step 5:** Commit `feat(identity): username onboarding with validation and server-side gate`.

### Task 13: Production Docker images + prod compose

**Files:**
- Create: `docker/web.Dockerfile`, `docker/worker.Dockerfile`, `docker/migrator.Dockerfile`, `docker/docker-compose.prod.yml`, `.dockerignore`

**Interfaces:**
- Produces: three images built from repo root context. Common pattern: `node:22-alpine` base, corepack-enabled pnpm, `turbo prune --docker` for a minimal workspace subset, `pnpm install --frozen-lockfile`, build, runtime stage as non-root user. **web:** builds Next standalone, runtime copies `.next/standalone` + static + public, `CMD node apps/web/server.js`, port 3000. **worker:** bundle `apps/worker/src/main.ts` with tsup/esbuild into `dist/main.js` (add a `build` script to the worker package), runtime runs it, port 3001. **migrator:** contains `@surffit/db` + deps and runs the migrate CLI as its CMD, exits 0 when done. Build args/envs are runtime-injected (no secrets baked). prod compose: the five infra services (same images/healthchecks as dev) + `migrator` (depends_on postgres healthy, restart "no") + `web` and `worker` (depends_on migrator `service_completed_successfully` + rabbitmq healthy; healthchecks curl their `/healthz`). All app env comes from a `.env` file reference.
- Consumes: everything; this is the deployment shape Coolify will mirror (spec §2.1/§9).

- [ ] **Step 1:** Write `.dockerignore` (node_modules, .next, dist, .git, .env*, .turbo, docs).
- [ ] **Step 2:** Implement the three Dockerfiles per Interfaces. Build each: `docker build -f docker/<name>.Dockerfile .` Expected: three successful builds.
- [ ] **Step 3:** Write prod compose. Verify: with a `.env` copied from `.env.example`, `docker compose -f docker/docker-compose.prod.yml up --build -d` → migrator exits 0, web healthy on :3000 (`/healthz` 200, landing page renders), worker healthy (its startup log line present, `/readyz` 200 from inside network or mapped port). Tear down with `down -v`.
- [ ] **Step 4:** Commit `feat(infra): production dockerfiles and reference compose stack`.

### Task 14: CI pipeline + Renovate

**Files:**
- Create: `.github/workflows/ci.yml`, `renovate.json`

**Interfaces:**
- Produces: on push/PR to main: job 1 "quality" — checkout, pnpm via corepack + `actions/setup-node` (node 22, pnpm cache), `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:integration` (Testcontainers works on ubuntu-latest's Docker daemon), `pnpm build`. Job 2 "docker" (needs quality) — build the three Dockerfiles without pushing. Concurrency group cancels superseded runs. Renovate: extends `config:recommended`, `:semanticCommits`, lockfile maintenance enabled, groups minor/patch updates weekly.
- Consumes: all root scripts (Task 1), Dockerfiles (Task 13).

- [ ] **Step 1:** Write both files. Locally mirror the CI commands in order (`pnpm install --frozen-lockfile` through `pnpm build`). Expected: all exit 0 — this is the local proxy for CI green; actual workflow validates on first push (note this for the user).
- [ ] **Step 2:** Commit `ci: add github actions pipeline and renovate config`.

### Task 15: Root CLAUDE.md + README

**Files:**
- Create: `CLAUDE.md`, `README.md`

**Interfaces:**
- Produces: `CLAUDE.md` per spec §3.3, containing exactly these sections: **Commands** (dev stack up via the dev compose file, `pnpm dev`, `pnpm test`, `pnpm test:integration`, `pnpm lint`, `pnpm db:migrate`, `pnpm db:seed` — with the "pnpm only, never npm/yarn" rule); **Architecture rules** as a checklist (business logic only in core services; SQL only in repository files; tRPC procedures = auth check + Zod validation + service call only; cross-domain effects only via outbox events; no `console.log` — use `createLogger`); **shadcn rule** (`pnpm dlx shadcn@latest add <component>`, never hand-write); **Where things live** (core module map as it exists after Phase 1: identity + messaging/outbox infrastructure; how to add a tRPC procedure — router file + service call; how to add a migration — edit schema, `pnpm db:generate`, review SQL, `pnpm db:migrate`; how to define a new event — defineEvent file in core/events + register + bind a consumer group); **Conventions** (kg-canonical units, translation tables with EN fallback — noted as arriving Phase 3, UUIDv7 via `newId()`, soft deletes, Conventional Commits, TS strict). Keep it under ~120 lines — it loads into every agent session.
- `README.md`: project one-liner + beaver mascot mention, status badge placeholder, quickstart (clone → `pnpm install` → `cp .env.example .env` → dev compose up → `pnpm db:migrate` → `pnpm dev` + worker in second terminal), link to the spec, plan, and CLAUDE.md, license note (choose nothing yet — "License: TBD before public launch" is acceptable here only).

- [ ] **Step 1:** Write both files. Cross-check every command mentioned actually exists in root `package.json` scripts (fix either side if not).
- [ ] **Step 2:** `pnpm lint` passes (markdown untouched by Biome is fine); commit `docs: add root CLAUDE.md and README`.

---

## Execution Notes for the Implementer

- Task order is dependency order; do not reorder. Tasks 4–7 are the architectural heart — if something there feels ambiguous, re-read spec §2.3 (outbox), §2.1 (worker/microservice model) before improvising.
- Integration tests require a running Docker daemon. If a Testcontainers pull is slow, that's normal on first run.
- When Auth.js v5 or shadcn CLI prompts differ from this plan's flags, prefer the tool's current official flow and keep the plan's *outcomes* (table names, file locations, exports) fixed.
- Never write files under `components/ui` by hand; never use npm/yarn; never `console.log`.

## Verification (whole phase)

1. `pnpm lint && pnpm check-types && pnpm test && pnpm test:integration && pnpm build` — all green.
2. Dev flow: compose up → migrate → web + worker running → Discord sign-in → username claim → worker logs `user.registered`.
3. Prod flow: `docker compose -f docker/docker-compose.prod.yml up --build` → migrator exits 0 → web `/healthz` 200 → worker ready.

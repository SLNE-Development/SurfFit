# SurfFit Phase 2 — User System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended by project owner) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No literal code by design (user directive, saves tokens).** Steps describe tests and implementations precisely in prose — exact file paths, exported names, signatures, commands, and expected outcomes. Write the code yourself from these descriptions. If a described name/signature conflicts with something, follow the plan's name.

**Goal:** The complete user system on top of the Phase 1 skeleton: public profiles, user preferences and privacy settings, an ABAC policy engine with default-deny tRPC enforcement, avatar upload through an S3-compatible storage provider (with server-side re-encoding), and GDPR self-service — consent capture at onboarding, data export jobs, and account deletion with a grace period — running through the existing outbox → RabbitMQ → worker pipeline plus a new cron sweep.

**Architecture:** All business logic stays in `@surffit/core` (new: `authz/`, `storage/`, `gdpr/`; extended: `identity/`). Server Components read by calling core services directly; all mutations go through tRPC procedures that now carry mandatory authz metadata. Long-running GDPR work happens in the worker via a new `gdpr` consumer group; time-based work (deletion grace, export expiry) is triggered by a cron loop in the worker that publishes `gdpr.sweep` messages, since RabbitMQ has no native scheduling. Spec: `docs/superpowers/specs/2026-07-15-surffit-architecture-design.md` (read §2.2–2.3, §4.2, §4.12, §5 decisions #7/#23, §8 before starting). Phase 1 plan (for established interfaces): `docs/superpowers/plans/2026-07-15-surffit-phase1-foundation.md`.

**Tech Stack:** Everything from Phase 1, plus `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (S3/MinIO, in `@surffit/core`) and `sharp` (image re-encoding, in `apps/web` only — keep the native dep out of core so the worker bundle never sees it).

## Global Constraints

Every task implicitly includes these, in addition to all Phase 1 Global Constraints (pnpm only, shadcn via CLI, layering rules, UUIDv7 via `newId()`, timestamps, `createLogger` only, typed domain errors, TS strict, Conventional Commits — reread them in the Phase 1 plan).

- **New env vars (exact names, add to `loadEnv` schema and `.env.example`):** `S3_ENDPOINT` (dev `http://localhost:9000`), `S3_REGION` (dev `us-east-1`), `S3_ACCESS_KEY` (dev `surffit`), `S3_SECRET_KEY` (dev `surffit123`), `S3_BUCKET` (dev `surffit`), `S3_FORCE_PATH_STYLE` (string enum `true`/`false`, default `true`; MinIO needs path style, real S3 doesn't).
- **Domain constants (exported from the module that owns them, values fixed):** `POLICY_VERSION = "2026-07-15"` (identity), `DELETION_GRACE_DAYS = 30` (gdpr), `EXPORT_TTL_DAYS = 7` (gdpr), avatar max upload 5 MiB, avatar output 512×512 WebP, export download signed-URL TTL 900 s, avatar signed-URL TTL 3600 s.
- **Every tRPC procedure declares authz metadata** (`{authz: "public" | "session"}`) — automatic when built from `publicProcedure`/`protectedProcedure` after Task 4. A completeness test fails CI if any procedure lacks it.
- **Reads vs. mutations:** Server Components call core services directly (via the web `db`/storage singletons). All mutations, and any client-side data fetching, go through tRPC.
- **Resource-level ABAC lives in services** (services build an `Actor` and call `assertCan`); procedures only do session-level gating — this preserves the "auth check → Zod validation → service call, nothing else" rule.
- **shadcn components:** everything this phase needs (avatar, card, select, switch, separator, alert-dialog, textarea, sonner, checkbox, dropdown-menu, field, input, button, label, badge, spinner, skeleton) already exists in `packages/ui`. Import as `@surffit/ui/components/ui/<name>`. If one is genuinely missing, add it via `pnpm dlx shadcn@latest add <component>` run from `packages/ui` — never hand-write.
- **Topic-binding gotcha:** AMQP `*` matches exactly one word. Three-segment routing keys like `gdpr.export.requested` need the `gdpr.#` pattern, not `gdpr.*`.
- **New events must be registered** in `packages/core/src/events/registry.ts` — the consumer dead-letters any message whose type isn't in the registry.
- **i18n keys** follow the existing style (`identity.username.taken`): new keys are named per task; raw key text shown in the UI is still acceptable this phase (i18n package arrives later).
- **Windows note** (unchanged): cross-platform package scripts only; CI runs Linux. `sharp` installs prebuilt binaries on both.

**Deferred beyond Phase 2 (do NOT build):** rate limiting (Redis stays unused), email provider (Mailpit stays unused — export readiness is shown in-app, not mailed), local-filesystem storage driver (MinIO/S3 covers dev, prod, and self-hosters via compose), i18n catalogs, push notifications, moderation/reports, audit_log, consumer event-id dedup helper (this phase's handlers are idempotent by construction: claim-based status transitions), follows/user_blocks (Phase 6 — the `following` visibility branch gets a single hard-coded `false` wiring point).

---

### Task 1: GDPR request tables (`@surffit/db`)

**Files:**
- Create: `packages/db/src/schema/gdpr.ts`
- Modify: `packages/db/src/schema/index.ts` (re-export)
- Create: `packages/db/migrations/` (generated)
- Test: extend `packages/db/src/schema.integration.test.ts`

**Interfaces:**
- Produces (spec §4.12, follow exactly — like `outbox_events`, these carry only their spec'd columns, no generic created/updated pair): **dataExportRequests** (`data_export_requests`) — id pk text `$defaultFn(newId)`, userId fk → users.id cascade not null, status pgEnum `export_status` (`pending|processing|ready|expired|failed`) not null default `pending`, storageKey nullable, requestedAt timestamptz not null default now, completedAt nullable, expiresAt nullable; index on (userId). **accountDeletionRequests** (`account_deletion_requests`) — id pk text `$defaultFn(newId)`, userId fk cascade not null, requestedAt timestamptz not null default now, scheduledFor timestamptz not null, status pgEnum `deletion_status` (`pending|cancelled|completed`) not null default `pending`; index on (userId).
- Consumes: `newId`, `users` table, existing citext/timestamp patterns from Phase 1 schema files.

- [ ] **Step 1:** Extend the integration test: after migration, assert (a) both tables exist in information_schema, (b) an export request inserts with status defaulting to `pending`, (c) a deletion request inserts with the two enums rejecting invalid values (insert with a bogus status throws).
- [ ] **Step 2:** Run `pnpm --filter @surffit/db test:integration`. Expected: FAIL (tables missing).
- [ ] **Step 3:** Write `gdpr.ts` per Interfaces, re-export from `schema/index.ts`, run `pnpm db:generate`, review the generated SQL (two tables, two enums, two indexes — nothing else).
- [ ] **Step 4:** Re-run the integration test. Expected: PASS. Run `pnpm db:migrate` against dev compose Postgres. Expected: migration applied, exit 0.
- [ ] **Step 5:** Commit `feat(db): gdpr export and deletion request tables`.

### Task 2: Storage provider port + S3 driver + env (`@surffit/core`)

**Files:**
- Create: `packages/core/src/storage/port.ts`, `packages/core/src/storage/s3.ts`, `packages/core/src/storage/index.ts`
- Modify: `packages/core/src/config/env.ts`, `packages/core/src/index.ts` (re-export storage), `.env.example`
- Test: `packages/core/src/storage/storage.integration.test.ts`, extend `packages/core/src/config/env.test.ts`

**Interfaces:**
- Produces:
  - `StorageProvider` (port.ts) = `{ ensureBucket(): Promise<void>; putObject(key: string, body: Uint8Array, opts: { contentType: string }): Promise<void>; getObject(key: string): Promise<Uint8Array>; deleteObject(key: string): Promise<void>; getSignedDownloadUrl(key: string, opts: { expiresInSeconds: number; downloadFilename?: string }): Promise<string> }`. `deleteObject` on a missing key resolves (idempotent). `downloadFilename` sets `response-content-disposition` attachment on the signed URL.
  - `createS3Storage(cfg: { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string; bucket: string; forcePathStyle: boolean }): StorageProvider` (s3.ts) via `@aws-sdk/client-s3` (S3Client, Put/Get/Delete/HeadBucket/CreateBucket commands) + `@aws-sdk/s3-request-presigner`. `ensureBucket` = HeadBucket, on 404/NotFound → CreateBucket, swallow "already owned" races.
  - `createStorageFromEnv(env: Env): StorageProvider` (index.ts) — maps the `S3_*` vars into `createS3Storage`. This is the single construction point apps use; when a `local` driver arrives later, the switch lives here.
  - Env schema additions per Global Constraints; `S3_FORCE_PATH_STYLE` parsed `z.enum(["true","false"]).default("true")` and exposed on `Env` as the raw string (transform to boolean inside `createStorageFromEnv`).
- Consumes: `Env`/`loadEnv` (Phase 1 Task 4).

- [ ] **Step 1:** Add deps to `@surffit/core`: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. Extend the env unit test: missing `S3_ENDPOINT` (with everything else valid) throws naming it; `S3_FORCE_PATH_STYLE` defaults to `"true"`. Write the failing storage integration test using Testcontainers `GenericContainer("minio/minio:latest")` with command `server /data`, env `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`, exposed port 9000, wait strategy on log line or port. Cases: (a) `ensureBucket` twice does not throw; (b) `putObject` then `getObject` round-trips bytes and content type is retrievable via a plain fetch of (c) `getSignedDownloadUrl` — fetching the signed URL returns 200 with the stored body, and an unsigned URL to the same key returns 403; (d) `deleteObject` then `getObject` rejects; deleting again resolves.
- [ ] **Step 2:** Run `pnpm --filter @surffit/core test` and `test:integration`. Expected: FAIL.
- [ ] **Step 3:** Implement env additions, port, S3 driver, factory per Interfaces. Update `.env.example`: add a commented `S3_*` block with the dev-compose values from Global Constraints, and rewrite the trailing "MinIO and Mailpit … unused until Phase 2" comment to say MinIO is now used for avatars/exports and only Mailpit remains unused.
- [ ] **Step 4:** Re-run both test suites. Expected: PASS. `pnpm check-types && pnpm lint` exit 0.
- [ ] **Step 5:** Commit `feat(core): s3 storage provider and env config`.

### Task 3: ABAC engine + identity policies (`@surffit/core`)

**Files:**
- Create: `packages/core/src/authz/engine.ts`, `packages/core/src/authz/index.ts`, `packages/core/src/identity/policies.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/identity/index.ts` (re-exports)
- Test: `packages/core/src/authz/engine.test.ts`, `packages/core/src/identity/policies.test.ts`

**Interfaces:**
- Produces:
  - engine.ts: `type Role = "user" | "moderator" | "admin" | "super_admin"`; `type Actor = { id: string; roles: Role[] }`; `type Policy<TResource, TContext = void> = { name: string; check(actor: Actor | null, resource: TResource, context: TContext): boolean }`; `definePolicy<TResource, TContext = void>(name: string, check: Policy<TResource, TContext>["check"]): Policy<TResource, TContext>`; `can(policy, actor, resource, context): boolean`; `assertCan(policy, actor, resource, context): void` — throws `PermissionDeniedError("authz.denied", { policy: policy.name })` when `check` returns false. Default-deny is structural: there is no allow-by-default path; a policy must exist and return true.
  - policies.ts: `viewProfilePolicy: Policy<{ ownerId: string; visibility: "public" | "following" | "private" }, { ownerFollowsViewer: boolean }>` — allow when actor is the owner; allow when actor has any of moderator/admin/super_admin; else `public` → true, `following` → `context.ownerFollowsViewer`, `private` → false (anonymous actor reaches the visibility branch too). `manageOwnAccountPolicy: Policy<{ ownerId: string }>` — actor non-null and `actor.id === resource.ownerId`, no role bypass (admin tooling arrives Phase 8).
- Consumes: `PermissionDeniedError` (Phase 1 Task 4).

- [ ] **Step 1:** Write failing unit tests. Engine: `can` true/false passthrough; `assertCan` throws PermissionDeniedError carrying i18nKey `authz.denied` and `params.policy` = the policy name; anonymous (null actor) reaches `check`. Policies: full matrix for viewProfile — owner sees own private profile; admin and moderator see a stranger's private profile; plain user sees public, not private; `following` visibility true/false driven by `ownerFollowsViewer`; anonymous viewer sees public only. manageOwnAccount: owner allowed, other user denied, admin denied, anonymous denied.
- [ ] **Step 2:** Run `pnpm --filter @surffit/core test`. Expected: FAIL. Implement per Interfaces. Re-run: PASS.
- [ ] **Step 3:** Commit `feat(core): abac engine with identity policies`.

### Task 4: tRPC default-deny authz metadata (`@surffit/trpc`)

**Files:**
- Modify: `packages/trpc/src/trpc.ts`
- Test: `packages/trpc/src/authz-meta.test.ts`, extend `packages/trpc/src/trpc.test.ts`

**Interfaces:**
- Produces: `type AuthzMeta = { authz: "public" | "session" }` (exported); tRPC init gains `.meta<AuthzMeta>()`. A guard middleware runs on both exported base procedures before anything else: `meta.authz` undefined → `TRPCError` FORBIDDEN message `authz.unannotated`; `"session"` → require non-null `ctx.session` (UNAUTHORIZED) — keep the existing session-narrowing middleware on `protectedProcedure` so its ctx type still narrows. `publicProcedure` = current error-mapping base `.meta({authz:"public"}).use(guard)`; `protectedProcedure` builds on it with `.meta({authz:"session"})` (meta overrides shallowly) + the narrowing middleware. Existing routers keep working untouched because they only use the two bases.
- Produces (test): `authz-meta.test.ts` walks `appRouter._def.procedures` (flattened map of path → procedure in tRPC v11) and asserts every procedure's `_def.meta.authz` is `"public"` or `"session"`, failing with the offending path list. This is the CI enforcement of spec §8 "default-deny for unannotated procedures".
- Consumes: existing `trpc.ts` error-mapping middleware, `appRouter`.

- [ ] **Step 1:** Write the failing completeness test plus a runtime test in `trpc.test.ts`: a locally-built procedure with no meta (attach the guard middleware to a raw `t.procedure` the same way the bases do — expose an internal `guardedProcedure` if needed) rejects with FORBIDDEN; `health.ping` still succeeds anonymously; the existing protected-procedure UNAUTHORIZED test still passes.
- [ ] **Step 2:** Run `pnpm --filter @surffit/trpc test`. Expected: FAIL. Implement per Interfaces. Re-run: PASS. `pnpm check-types` exit 0.
- [ ] **Step 3:** Commit `feat(trpc): default-deny authz metadata guard`.

### Task 5: Identity services — profile, preferences, privacy (`@surffit/validation` + `@surffit/core`)

**Files:**
- Create: `packages/validation/src/profile.ts`, `packages/validation/src/settings.ts`
- Modify: `packages/validation/src/index.ts`, `packages/core/src/identity/service.ts`, `packages/core/src/identity/repository.ts`
- Test: `packages/validation/src/profile.test.ts`, extend `packages/core/src/identity/identity.test.ts`

**Interfaces:**
- Produces (validation):
  - profile.ts: `profileUpdateSchema` = object `{ displayName: trimmed string 1–50 nullable (message key `validation.displayName.length`), biography: trimmed string max 500 nullable (`validation.biography.length`, empty string transforms to null) }` — both fields always present in input; null clears.
  - settings.ts: `preferencesUpdateSchema` = all-optional object `{ unitSystem: "metric"|"imperial", theme: "dark"|"light"|"system", firstWeekday: int 0–6, defaultRestSeconds: int 15–600 }` (`validation.preferences.range`); `privacyUpdateSchema` = all-optional object `{ profileVisibility: "public"|"following"|"private", showStatistics: boolean, showAchievements: boolean, showWorkouts: boolean, showBodyMetrics: boolean }`.
- Produces (identity service — new methods on the object returned by `createIdentityService(repo)`; signature of the factory is unchanged):
  - `getProfileByUsername(viewer: { id: string } | null, username: string)` — repo lookup of a non-deleted, non-anonymized user by username joined with their privacy row; missing → `NotFoundError("identity.profile.notFound")`. Build `Actor` = viewer ? `{ id, roles: await repo.getUserRoles(viewer.id) }` : null. `can(viewProfilePolicy, actor, { ownerId, visibility }, { ownerFollowsViewer: false })` — the literal `false` is the single Phase 6 wiring point, comment it as such; denied → the same NotFoundError (never reveal existence of restricted profiles). Returns `{ id, username, displayName, biography, avatarKey, createdAt, isOwner: boolean }`.
  - `getOwnProfile(userId)` — `{ username, displayName, biography, avatarKey, email }`, NotFoundError if missing.
  - `updateProfile(userId, input)` — parse with `profileUpdateSchema` (failure → `DomainRuleViolationError` with the issue's message key), `assertCan(manageOwnAccountPolicy, { id: userId, roles: [] }, { ownerId: userId })` (establishes the service-side ABAC pattern), repo update of displayName/biography + updatedAt, returns the updated own-profile shape.
  - `getPreferences(userId)` / `updatePreferences(userId, input)` and `getPrivacySettings(userId)` / `updatePrivacySettings(userId, input)` — same shape: parse (settings schemas), assertCan manageOwnAccount, partial repo update (only provided keys) + updatedAt, return the full updated row (camelCase fields mirroring the Drizzle schema, minus timestamps).
  - `setAvatar(userId, key)` / `clearAvatar(userId)` — update `avatarKey` (+ updatedAt), return `{ previousKey: string | null }` so the caller can delete the replaced object.
- Produces (repository — add to `IdentityRepository` type and Drizzle implementation): `findProfileByUsername(username)` (user + privacy visibility, filtered `deletedAt IS NULL AND anonymizedAt IS NULL`), `findUserById(userId)`, `getUserRoles(userId): Promise<Role[]>`, `getPreferences(userId)`, `updatePreferences(userId, partial)`, `getPrivacySettings(userId)`, `updatePrivacySettings(userId, partial)`, `updateProfileFields(userId, { displayName, biography })`, `setAvatarKey(userId, key: string | null): Promise<{ previousKey: string | null }>`.
- Consumes: `viewProfilePolicy`/`manageOwnAccountPolicy`/`can`/`assertCan` (Task 3), existing errors, schema tables.

- [ ] **Step 1:** Write failing tests. Validation: displayName trim + length bounds, biography 501 chars rejected, empty biography → null, preferences range violations (firstWeekday 7, rest 5), privacy enum. Service (extend the in-memory fake repo with the new methods + seeded fixture users): profile visible to anonymous when public; private profile → NotFoundError for a stranger but full payload with `isOwner: true` for the owner; moderator sees private; `following` profile hidden (hard-coded false); unknown username → NotFoundError; updateProfile persists + clears with nulls; updatePreferences partial update leaves other fields; setAvatar returns previous key.
- [ ] **Step 2:** Run `pnpm --filter @surffit/validation test` and `pnpm --filter @surffit/core test`. Expected: FAIL. Implement per Interfaces. Re-run: PASS.
- [ ] **Step 3:** Commit `feat(identity): profile, preferences, and privacy services`.

### Task 6: Consent capture at onboarding

**Files:**
- Create: `packages/core/src/identity/consent.ts`, `apps/web/src/app/terms/page.tsx`, `apps/web/src/app/privacy/page.tsx`
- Modify: `packages/core/src/identity/service.ts` + `repository.ts`, `packages/core/src/identity/index.ts`, `packages/trpc/src/routers/identity.ts`, `apps/web/src/app/onboarding/username-form.tsx`, `apps/web/src/lib/routes.ts`
- Test: extend `packages/core/src/identity/identity.test.ts`, extend `packages/trpc/src/trpc.test.ts`

**Interfaces:**
- Produces:
  - consent.ts: `POLICY_VERSION = "2026-07-15"`; `SIGNUP_CONSENT_TYPES = ["terms", "privacy"] as const`.
  - `identityService.claimUsername` signature changes to `claimUsername(userId, input: { username: string; acceptPolicies: boolean })`: `acceptPolicies` false → `DomainRuleViolationError("validation.consent.required")` before anything else; then the existing validate/alreadyOnboarded/taken flow, but username set and consent insertion now run inside one `repo.withTransaction` — repo gains `insertConsents(userId, consents: { consentType: string; policyVersion: string }[], tx)` and `setUsername` accepts the tx it already optionally takes. One consent row per SIGNUP_CONSENT_TYPES entry.
  - `identityService.listConsents(userId)` — rows `{ consentType, policyVersion, grantedAt, revokedAt }` ordered by grantedAt; repo `listConsents(userId)`.
  - tRPC `identity.claimUsername` input becomes `{ username: z.string(), acceptPolicies: z.boolean() }` (the business rule lives in the service; the procedure stays a passthrough).
  - Web: routes.ts gains `terms: { path: ["terms"] }`, `privacy: { path: ["privacy"] }`. Both pages: static server components, an h1 + two short placeholder paragraphs stating the real policy text lands before public launch. Onboarding form gains a required checkbox row (shadcn `Checkbox` + `Field`/`FieldLabel`) — label text "I accept the Terms of Service and Privacy Policy" with the two nouns as `next/link`s to the new routes; submit button disabled until checked; mutation input includes `acceptPolicies`.
- Consumes: `userConsents` table, `withTransaction` (Phase 1), Task 5's repo shape.

- [ ] **Step 1:** Write failing tests. Service: claim with `acceptPolicies: false` throws `validation.consent.required` and writes nothing; successful claim writes exactly two consent rows (`terms` + `privacy`, both `POLICY_VERSION`) and sets username atomically; the existing taken/alreadyOnboarded tests updated to the new input shape still pass; `listConsents` returns inserted rows. tRPC: `claimUsername` with the old input shape (`{username}` only) now fails Zod validation.
- [ ] **Step 2:** Run core + trpc tests. Expected: FAIL. Implement per Interfaces. Re-run: PASS.
- [ ] **Step 3:** Build the two static pages and the checkbox UI, wire routes. Verify `pnpm build` passes and (if Discord creds available) a fresh onboarding requires the checkbox and lands on `/`.
- [ ] **Step 4:** Commit `feat(identity): signup consent capture`.

### Task 7: Profile + settings tRPC routers

**Files:**
- Create: `packages/trpc/src/routers/profile.ts`, `packages/trpc/src/routers/settings.ts`
- Modify: `packages/trpc/src/routers/index.ts`
- Test: extend `packages/trpc/src/trpc.test.ts` (or a new `routers.test.ts` if the file crowds past ~300 lines)

**Interfaces:**
- Produces (all procedures construct `createIdentityService(createIdentityRepository(ctx.db))` per call, matching the existing identity-router idiom; mutation inputs reuse the shared schemas from `@surffit/validation` directly — that's the point of the shared package; the service re-parses, which is harmless and keeps direct service consumers safe):
  - `profile.byUsername` — **public** query, input `{ username: z.string() }`, calls `getProfileByUsername(ctx.session?.user ?? null, username)`. (Exists for client-side consumers; the profile page itself reads via RSC.)
  - `profile.update` — protected mutation, input `profileUpdateSchema`, calls `updateProfile(ctx.session.user.id, input)`.
  - `settings.preferences` protected query → `getPreferences`; `settings.updatePreferences` protected mutation, input `preferencesUpdateSchema`; `settings.privacy` protected query → `getPrivacySettings`; `settings.updatePrivacy` protected mutation, input `privacyUpdateSchema` → `updatePrivacySettings`.
  - Both routers registered in `appRouter` (`profile`, `settings`) — the Task 4 completeness test must stay green, which happens automatically via the base procedures.
- Consumes: Task 5 service methods, Task 4 bases.

- [ ] **Step 1:** Write failing createCaller tests asserting transport concerns only (they never reach the db, so a stub `Db` in the context is fine — this mirrors how Phase 1 tested anonymous `claimUsername`): anonymous `profile.update` → UNAUTHORIZED; anonymous `settings.preferences` → UNAUTHORIZED (both rejected by the session guard before any db touch); with a fabricated session, `settings.updatePreferences` input `{ firstWeekday: 9 }` → BAD_REQUEST whose message contains `validation.preferences.range` (Zod input rejection happens before the handler, so the db stays untouched — note this is a plain Zod message, not the DomainError `data.i18nKey` path). Service-level behavior (visibility, persistence) is already covered by Task 5's tests; don't duplicate it here.
- [ ] **Step 2:** Run `pnpm --filter @surffit/trpc test`. Expected: FAIL. Implement per Interfaces. Re-run: PASS (including the authz completeness test now covering the new procedures).
- [ ] **Step 3:** Commit `feat(trpc): profile and settings routers`.

### Task 8: Avatar upload — web storage singleton, sharp pipeline, upload route

**Files:**
- Create: `apps/web/src/lib/storage.ts`, `apps/web/src/lib/avatar.ts`, `apps/web/src/app/api/avatar/route.ts`, `apps/web/vitest.config.ts`
- Modify: `apps/web/package.json` (deps: sharp; devDeps: vitest; scripts: `test`)
- Test: `apps/web/src/lib/avatar.test.ts`

**Interfaces:**
- Produces:
  - `lib/storage.ts`: `getStorage(): Promise<StorageProvider>` — lazily creates via `createStorageFromEnv(loadEnv())`, awaits `ensureBucket()` once, memoizes the resolved provider (module-level promise, so concurrent first calls share one init). Also `getAvatarUrl(storage, avatarKey: string | null): Promise<string | null>` — null-safe wrapper around `getSignedDownloadUrl(key, { expiresInSeconds: 3600 })`.
  - `lib/avatar.ts`: `AVATAR_MAX_BYTES = 5 * 1024 * 1024`; `ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"]`; `processAvatarImage(input: Buffer): Promise<Buffer>` — sharp: `rotate()` (bakes EXIF orientation), `resize(512, 512, { fit: "cover" })`, `.webp({ quality: 85 })`; sharp strips metadata by default, so the output carries no EXIF. Throws sharp's error on non-image bytes (route translates).
  - `app/api/avatar/route.ts` (`dynamic = "force-dynamic"`): **POST** — `auth()`; no session → 401 `{error:{i18nKey:"authz.unauthenticated"}}`. `req.formData()`, field name `file`; missing → 400 `avatar.missing`; `file.type` not in accepted list → 400 `avatar.unsupportedType`; `file.size > AVATAR_MAX_BYTES` → 400 `avatar.tooLarge`; processing throws → 400 `avatar.invalidImage`. On success: key `avatars/{userId}/{newId()}.webp`, `storage.putObject(key, buffer, { contentType: "image/webp" })`, then `identityService.setAvatar(userId, key)` (service built from the web `db` singleton); best-effort `deleteObject(previousKey)` (failure → `createLogger("avatar").warn`, not an error response); respond 200 `{ avatarUrl }` (fresh signed URL). **DELETE** — `auth()` gate, `clearAvatar`, best-effort delete of previous object, 200 `{ ok: true }`. This route is the one sanctioned non-tRPC mutation (binary transport); note that in a file-top comment.
- Consumes: Task 2 storage, Task 5 `setAvatar`/`clearAvatar`, web `db` singleton (Phase 1 Task 9).

- [ ] **Step 1:** Add vitest to `apps/web` (node environment config; `test` script `vitest run`) and sharp as a dependency. Write the failing avatar-pipeline test: build a small PNG buffer with sharp inside the test (e.g. 1024×768 red rectangle, `withMetadata` EXIF orientation if convenient); assert output metadata (via sharp) is webp, 512×512, and has no `exif` field; assert garbage bytes reject.
- [ ] **Step 2:** Run `pnpm --filter web test`. Expected: FAIL. Implement `avatar.ts`. Re-run: PASS.
- [ ] **Step 3:** Implement `storage.ts` and the route per Interfaces. Manual verify with dev compose up: authenticated `curl -F "file=@<some.jpg>" http://localhost:3000/api/avatar` (grab the session cookie from the browser) → 200 with a fetchable `avatarUrl`; the MinIO console (http://localhost:9091) shows the object; a second upload replaces the object (old key gone); DELETE clears `avatar_key` in the users row.
- [ ] **Step 4:** `pnpm build && pnpm check-types && pnpm lint` exit 0. Commit `feat(web): avatar upload with image re-encoding`.

### Task 9: GDPR core module — events, export sections, service, deletion executor

**Files:**
- Create: `packages/core/src/events/gdpr.ts`, `packages/core/src/events/user-deleted.ts`, `packages/core/src/identity/export.ts`, `packages/core/src/gdpr/service.ts`, `packages/core/src/gdpr/repository.ts`, `packages/core/src/gdpr/index.ts`
- Modify: `packages/core/src/events/registry.ts`, `packages/core/src/identity/repository.ts` + `service.ts` (only if a read helper is missing), `packages/core/src/identity/index.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/gdpr/gdpr.test.ts` (unit, fakes), `packages/core/src/gdpr/gdpr.integration.test.ts` (Postgres)

**Interfaces:**
- Produces (events, all registered in `registry.ts`):
  - `gdprExportRequestedEvent` — type `gdpr.export.requested` v1, payload `{ requestId: string, userId: string }`.
  - `gdprSweepEvent` — type `gdpr.sweep` v1, payload `{}` (strict empty object). Published directly to the exchange by the worker cron (a timer tick is not domain state, so it does not go through the outbox — comment this where it's defined).
  - `userDeletedEvent` — type `user.deleted` v1, payload `{ userId: string }` (routes to the existing `system` group via its `user.*` binding).
- Produces (identity/export.ts): `type ExportSection = { name: string; collect(userId: string): Promise<unknown> }`; `createIdentityExportSections(repo: IdentityRepository): ExportSection[]` — sections `profile` (users row: username, displayName, email, biography, locale, createdAt), `preferences`, `privacySettings`, `consents`, `roles`. Each domain module contributes its own sections in its own phase; the gdpr service just consumes the array.
- Produces (gdpr/service.ts, factory `createGdprService(deps: { repo: GdprRepository; storage: StorageProvider; sections: ExportSection[]; graceDays?: number; exportTtlDays?: number })` with defaults `DELETION_GRACE_DAYS = 30`, `EXPORT_TTL_DAYS = 7` exported from this file):
  - `requestExport(userId)` — active (pending|processing) request exists → `ConflictError("gdpr.export.alreadyPending")`; else in one tx: insert request row + `writeOutbox(gdprExportRequestedEvent.create({requestId, userId}))`; returns the row.
  - `getExportStatus(userId)` — latest request row or null; when status `ready` and `expiresAt` in the future, add `downloadUrl` = signed URL (900 s, `downloadFilename` `surffit-export.json`); else `downloadUrl: null`.
  - `runExport(requestId)` (worker path) — atomic claim: conditional update pending→processing returning the row; no row → return (another instance won, or already done — this is the idempotency story, note it). Collect all sections into `{ exportedAt: ISO now, userId, sections: { [name]: data } }`, `putObject` key `exports/{userId}/{requestId}.json` contentType `application/json`, mark ready + completedAt + expiresAt = now + exportTtlDays. Any throw → mark failed + `logger.error`, swallow (no consumer retry storm; the user simply requests again).
  - `requestDeletion(userId)` — pending exists → `ConflictError("gdpr.deletion.alreadyPending")`; insert with scheduledFor = now + graceDays; returns row. `cancelDeletion(userId)` — pending row → cancelled, none → `NotFoundError("gdpr.deletion.notFound")`. `getDeletionStatus(userId)` — pending row or null.
  - `sweep()` (worker path) — (a) deletions: inside one tx, select due pending rows (`scheduledFor <= now`) `FOR UPDATE SKIP LOCKED` (raw `sql` fragment is fine in the repository file, relay precedent); for each: run the deletion executor (below) and mark the request completed; collect storage keys to remove. After commit: best-effort `deleteObject` per key (warn on failure — an orphaned object is acceptable, a half-deleted account is not). (b) exports: rows ready with `expiresAt <= now` → `deleteObject(storageKey)` best-effort, mark expired. Returns `{ deletionsExecuted: number, exportsExpired: number }` for logging.
  - Deletion executor (private to service/repo, executed inside the sweep tx per user): read users row (capture avatarKey); update users → username null, displayName null, `name` null, `image` null, email `deleted-{userId}@anonymized.invalid` (unique tombstone — email is NOT NULL UNIQUE), avatarKey null, biography null, anonymizedAt now, deletedAt now, updatedAt now; hard-delete the user's rows in sessions (kills active logins immediately — database session strategy), accounts (frees the Discord link; a later sign-in creates a fresh user), userPreferences, privacySettings, userRoles; **keep userConsents** (retained as proof of consent, GDPR-compatible — comment this); mark the user's non-expired export requests expired and collect their storageKeys; `writeOutbox(userDeletedEvent.create({userId}))` in the same tx.
- Produces (gdpr/repository.ts): `GdprRepository` type + `createGdprRepository(db)` implementing the persistence the service needs — `withTransaction`, `findActiveExportRequest`, `insertExportRequest`, `latestExportRequest`, `claimExportRequest` (conditional update returning), `markExportReady`, `markExportFailed`, `listExpiredExports`, `markExportExpired`, `findPendingDeletion`, `insertDeletionRequest`, `cancelDeletionRequest`, `selectDueDeletionsForUpdate(tx)`, `markDeletionCompleted(id, tx)`, `anonymizeUser(userId, tx)` (the executor's SQL: returns `{ avatarKey: string | null, exportKeys: string[] }`), `writeEvent(envelope, tx)` (reuse `writeOutbox`).
- Consumes: Tasks 1, 2, 3, 5; `writeOutbox`, `defineEvent`, `newId`.

- [ ] **Step 1:** Write failing unit tests (fake repo, fake storage recording put/delete/sign calls, two stub sections): requestExport happy path writes row + outbox envelope of type `gdpr.export.requested` in one tx; second request while pending → ConflictError; runExport claims then writes an object whose parsed JSON has both section names and marks ready with expiresAt ≈ now+7d; runExport on an already-processing id is a no-op (claim returns null, storage untouched); a section that throws marks the request failed without throwing; requestDeletion sets scheduledFor ≈ now+30d, conflict on second, cancel flips pending→cancelled, cancel with none → NotFoundError; sweep with one due deletion calls the executor, marks completed, requests storage deletion of avatar + export keys; sweep ignores future-scheduled rows; sweep expires an overdue ready export.
- [ ] **Step 2:** Run `pnpm --filter @surffit/core test`. Expected: FAIL. Implement events, sections, repository, service. Re-run: PASS.
- [ ] **Step 3:** Write the failing integration test (Testcontainers Postgres, migrations applied; storage = in-memory fake): seed a user with username/email/avatarKey + preferences + privacy + a session row + an account row + two consents + a role + one ready export request with a storageKey + a deletion request with scheduledFor in the past; `createGdprService({...}).sweep()`; assert users row is anonymized exactly per the executor spec (each field), sessions/accounts/preferences/privacy/roles rows are gone, consents remain, export request is expired, deletion request completed, outbox contains a `user.deleted` row, and the fake storage recorded deletion of both keys. Also assert a second `sweep()` is a clean no-op.
- [ ] **Step 4:** Run `pnpm --filter @surffit/core test:integration`. Expected: PASS. Commit `feat(core): gdpr export and deletion pipeline`.

### Task 10: Worker wiring — consumer services, gdpr group, cron sweep

**Files:**
- Create: `apps/worker/src/cron.ts`
- Modify: `packages/core/src/messaging/groups.ts`, `packages/core/src/messaging/consumer.ts`, `apps/worker/src/main.ts`
- Test: `apps/worker/src/cron.test.ts`, extend `packages/core/src/messaging/messaging.integration.test.ts` (signature only), new `packages/core/src/gdpr/gdpr-flow.integration.test.ts`

**Interfaces:**
- Produces:
  - groups.ts: `type ConsumerServices = { db: Db; storage: StorageProvider }`; handler ctx becomes `{ logger } & Partial<ConsumerServices>`. New group `gdpr` — bindings `["gdpr.#"]` (three-segment keys need `#`, see Global Constraints); handler: missing `db`/`storage` in ctx → throw a plain Error naming the missing services (a wiring bug, not a domain error); build `createGdprService({ repo: createGdprRepository(db), storage, sections: createIdentityExportSections(createIdentityRepository(db)) })` per message; envelope type `gdpr.export.requested` → `runExport(payload.requestId)`; `gdpr.sweep` → `sweep()` and log the returned counts at info. The `system` group is untouched (and will now also log `user.deleted`).
  - consumer.ts: `StartConsumersOptions` gains `services?: ConsumerServices`; the consume callback passes `{ logger, ...opts.services }` as ctx. Existing callers without services keep compiling.
  - cron.ts: `startCron(opts: { channel: ConfirmChannel; intervalMs?: number }): { stop(): void }` — default interval 3 600 000 ms; publishes `gdprSweepEvent.create({})` via `publishEvent` once immediately on start and then every interval; publish failures are caught and logged (`createLogger("cron")`), never crash the loop; safe to run in every worker replica because the sweep is claim-based (comment this).
  - main.ts boot order gains, after `assertTopology`: `const storage = createStorageFromEnv(env); await storage.ensureBucket();` then `startConsumers(connection, groups, { services: { db, storage } })` and `const cron = startCron({ channel })` after the relay; shutdown adds `cron.stop()` first.
- Consumes: Tasks 2 and 9; existing topology/consumer/relay from Phase 1.

- [ ] **Step 1:** Write failing tests. cron.test.ts (unit): with a stub confirm-channel capturing publishes and `intervalMs: 50`, after ~180 ms at least 3 messages were published, all to exchange `surffit.events` with routing key `gdpr.sweep`; `stop()` halts further publishes; a channel that throws once doesn't kill subsequent ticks. gdpr-flow integration (Postgres + RabbitMQ + MinIO containers — the Phase 2 end-to-end proof): migrate, assert topology, start consumers for `["gdpr"]` with real services, start the outbox relay; seed a user; call `gdprService.requestExport(userId)`; poll until the request row is `ready` (≤ 15 s); assert the MinIO object exists and its JSON contains the `profile` section; then publish a `gdpr.sweep` after forcing `expiresAt` into the past via SQL; poll until status `expired` and the object is gone.
- [ ] **Step 2:** Run the new tests. Expected: FAIL. Implement groups/consumer/cron/main changes. Update the existing messaging integration test only as far as the changed `startConsumers` signature requires (it should need nothing if `services` stays optional). Re-run core unit + integration and worker tests. Expected: PASS.
- [ ] **Step 3:** Manual verify: dev compose up, `pnpm --filter worker dev` — startup log names groups `system,gdpr`, an immediate sweep logs `{deletionsExecuted: 0, exportsExpired: 0}`-style counts, `/readyz` 200, Ctrl+C clean.
- [ ] **Step 4:** Commit `feat(worker): gdpr consumer group and cron sweep`.

### Task 11: GDPR tRPC router

**Files:**
- Create: `packages/trpc/src/routers/gdpr.ts`
- Modify: `packages/trpc/src/routers/index.ts`
- Test: extend the Task 7 router test file

**Interfaces:**
- Produces (all protected; service built per call: `createGdprService({ repo: createGdprRepository(ctx.db), storage: <see below>, sections: createIdentityExportSections(createIdentityRepository(ctx.db)) })`). The storage instance comes from tRPC context: add `storage: StorageProvider` to `Context` in `packages/trpc/src/context.ts` and supply it in the web route handler via `await getStorage()` — update `apps/web/src/app/api/trpc/[trpc]/route.ts` accordingly.
  - `gdpr.requestExport` mutation (no input) → `requestExport(userId)`.
  - `gdpr.exportStatus` query (no input) → `getExportStatus(userId)` (client polls this while processing).
  - `gdpr.requestDeletion` mutation (no input) → `requestDeletion(userId)`; `gdpr.cancelDeletion` mutation → `cancelDeletion`; `gdpr.deletionStatus` query → `getDeletionStatus`.
  - `gdpr.consents` query → `identityService.listConsents(userId)` (identity service built per call, matching idiom).
- Consumes: Tasks 6, 9; Task 4 bases keep the completeness test green.

- [ ] **Step 1:** Write failing caller tests: every gdpr procedure rejects anonymous with UNAUTHORIZED; context type now requires `storage` (compile-time — give tests a stub provider).
- [ ] **Step 2:** Run trpc tests. Expected: FAIL. Implement router + context change + web handler change. Re-run: PASS. `pnpm build` passes (web handler compiles).
- [ ] **Step 3:** Commit `feat(trpc): gdpr router`.

### Task 12: Web app shell — header, user menu, routes

**Files:**
- Create: `apps/web/src/components/site-header.tsx`, `apps/web/src/components/user-menu.tsx`
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/src/lib/routes.ts`, `packages/auth/src/config.ts`, `packages/auth/src/types.ts`

**Interfaces:**
- Produces:
  - routes.ts additions: `profile: { path: ["u", str("username")] }` (typesafe-routes `str` param), `settings` with children `profile`, `preferences`, `privacy`, `account` (paths `settings/…`).
  - Auth session gains `avatarKey: string | null` (types.ts module augmentation + config.ts session callback reading the user row's avatarKey) so the header can render the avatar without an extra query.
  - site-header.tsx (server component, rendered in the root layout above `children`): left — "SurfFit" wordmark linking home; right — no session: a "Sign in" `Button` linking to signin; session: `<UserMenu>` receiving `{ username, displayName, avatarUrl }` where avatarUrl comes from `getAvatarUrl(await getStorage(), session.user.avatarKey)`.
  - user-menu.tsx (client): shadcn `DropdownMenu` triggered by `Avatar` (image = avatarUrl, fallback = first letter of displayName ?? username); items: "Profile" → `route(routes.profile, { path: { username } })` (hidden if username is null / not onboarded), "Settings" → settings profile page, separator, "Sign out". Sign-out uses a server action: an inline `"use server"` action in site-header (or a one-line `apps/web/src/app/actions.ts`) calling `signOut()` from `@surffit/auth` — the sanctioned thin-wrapper Server Action pattern; the menu item submits that form.
  - layout.tsx: header mounted, plus sonner `<Toaster richColors />` mounted once for the settings tasks.
- Consumes: Task 8 `getStorage`/`getAvatarUrl`; existing auth exports.

- [ ] **Step 1:** Implement routes, auth session field, header, menu, layout per Interfaces.
- [ ] **Step 2:** Verify: `pnpm check-types && pnpm build` pass; dev run shows the header on `/`, signed-out state renders Sign in, signed-in state (creds permitting) shows the avatar menu and Sign out returns to the landing page.
- [ ] **Step 3:** Commit `feat(web): app shell with user menu`.

### Task 13: Public profile page

**Files:**
- Create: `apps/web/src/app/u/[username]/page.tsx`

**Interfaces:**
- Produces: RSC at `/u/[username]`: `auth()` → viewer (`{id}` or null); `createIdentityService(createIdentityRepository(db)).getProfileByUsername(viewer, params.username)` inside try/catch — `NotFoundError` → `notFound()` (import the error class from `@surffit/core` and match with instanceof; rethrow anything else). Render: large `Avatar` (signed URL via `getAvatarUrl`), displayName (fallback username), muted `@username`, biography paragraph when present, "Joined <Month Year>" from createdAt, and — when `isOwner` — an "Edit profile" `Button` linking to the settings profile route. Compose from existing `Card`/`Avatar`/`Badge` primitives; no new shadcn components expected.
- Consumes: Task 5 service, Task 8 helpers, Task 12 routes.

- [ ] **Step 1:** Implement the page per Interfaces.
- [ ] **Step 2:** Verify with dev stack + a signed-in user: own profile renders with Edit link; `/u/does-not-exist` → 404 page; set own privacy to `private` via SQL (UI arrives next task) and confirm an anonymous/incognito visit 404s while the owner still sees it. `pnpm build` passes.
- [ ] **Step 3:** Commit `feat(web): public profile page`.

### Task 14: Settings — layout, profile, preferences, privacy pages

**Files:**
- Create: `apps/web/src/app/settings/layout.tsx`, `apps/web/src/app/settings/profile/page.tsx` + `profile-form.tsx` + `avatar-section.tsx`, `apps/web/src/app/settings/preferences/page.tsx` + `preferences-form.tsx`, `apps/web/src/app/settings/privacy/page.tsx` + `privacy-form.tsx`

**Interfaces:**
- Produces:
  - layout.tsx (RSC): gate — no session → redirect signin; not onboarded → redirect onboarding. Two-column shell: left nav (links Profile / Preferences / Privacy / Account using the Task 12 routes, current segment highlighted via `usePathname` in a small client nav component or plain styling), `Separator`, children right.
  - Each page is an RSC that loads current values through the identity service (`getOwnProfile` / `getPreferences` / `getPrivacySettings` with the session user id) and passes them as `initial` props to its client form component. Forms follow the Phase 1 `username-form.tsx` idiom exactly (Field/FieldLabel/FieldError + tRPC mutation + i18nKey error extraction), plus: `toast.success("Saved")` from sonner on success and `router.refresh()` so RSC-rendered data (header avatar, profile page) stays fresh.
  - profile-form: displayName `Input`, biography `Textarea` (with a simple `{length}/500` counter), Save → `profile.update` (empty strings submitted as null).
  - avatar-section (client): current avatar preview (initial signed URL prop), file input (`accept="image/jpeg,image/png,image/webp"`); on choose: client-side size guard (5 MiB, mirror of the server rule) then `fetch("/api/avatar", { method: "POST", body: FormData })`; success → swap preview to returned `avatarUrl`, toast, `router.refresh()`; error → toast the returned i18nKey. "Remove avatar" button → DELETE fetch, same handling.
  - preferences-form: `Select` for unitSystem (Metric kg / Imperial lb) and theme (Dark/Light/System), `Select` for firstWeekday (Sunday/Monday sufficient — values 0/1), `Input type="number"` for defaultRestSeconds (15–600), Save → `settings.updatePreferences`.
  - privacy-form: `Select` for profileVisibility with one-line descriptions (public / following — "people you follow" / private), four `Switch` rows for showStatistics, showAchievements, showWorkouts, showBodyMetrics, Save → `settings.updatePrivacy`.
- Consumes: Tasks 5, 7, 8, 12.

- [ ] **Step 1:** Build layout + the three pages/forms per Interfaces.
- [ ] **Step 2:** Verify end-to-end in the dev stack: edit display name + biography → profile page reflects it; upload avatar → header + profile update after refresh; remove avatar → fallback initial renders; preferences and privacy saves persist across reload; privacy `private` hides the profile from an incognito visitor (repeat of Task 13's check, now through the UI). `pnpm build && pnpm check-types && pnpm lint` pass.
- [ ] **Step 3:** Commit `feat(web): settings pages for profile, preferences, privacy`.

### Task 15: Account page — consents, data export, account deletion

**Files:**
- Create: `apps/web/src/app/settings/account/page.tsx` + `account-panels.tsx` (client)

**Interfaces:**
- Produces: page.tsx is a thin RSC (gate handled by the settings layout) mounting the client panels; all data flows through the gdpr router (single data path — this page is also the manual test surface for Task 11).
  - Consents card: `gdpr.consents` query → table-ish list (type, policyVersion, granted date) using `Item`/plain rows; empty state text for pre-consent dev accounts.
  - Data export card: `gdpr.exportStatus` query with `refetchInterval` of 3 s while status is pending/processing, otherwise off. Button "Request export" → `gdpr.requestExport` (disabled while a request is active; CONFLICT error toasts its i18nKey). Status line per state (pending/processing → `Spinner` + text; ready → "Download" `Button` as an anchor to `downloadUrl` plus "expires <date>"; expired/failed → muted text + the request button re-enabled).
  - Danger zone card (destructive styling): no pending deletion → "Delete account" `Button variant="destructive"` opening an `AlertDialog` that spells out the consequences ("Scheduled in 30 days. Your profile is anonymized and your data is permanently removed. You can cancel until then.") with confirm → `gdpr.requestDeletion`; pending deletion → warning banner with the `scheduledFor` date and a "Cancel deletion" button → `gdpr.cancelDeletion`. All mutations invalidate `gdpr.deletionStatus` / refetch and toast.
- Consumes: Task 11 router, Task 12 Toaster.

- [ ] **Step 1:** Build the page and panels per Interfaces.
- [ ] **Step 2:** Verify in the dev stack with the worker running: request export → status flips to ready within a few seconds → download link serves the JSON containing profile/preferences/privacySettings/consents/roles sections; request deletion → banner with date ~30 days out → cancel restores the button; consents list shows the onboarding rows. `pnpm build` passes.
- [ ] **Step 3:** Commit `feat(web): account page with gdpr self-service`.

### Task 16: Documentation sync

**Files:**
- Modify: `CLAUDE.md`, `README.md` (only if commands changed — expected: no), `.env.example` (verify only; Task 2 already edited it)

**Interfaces:**
- Produces, in `CLAUDE.md` (keep total under ~130 lines):
  - "Where things live": `packages/core` entry gains `authz/` (ABAC engine — `can`/`assertCan`, policies live per-module in `<module>/policies.ts`), `storage/` (S3 storage port), `gdpr/` (export/deletion pipeline); note the identity module now owns profile/preferences/privacy/consents.
  - New how-to lines matching the existing style: **Add an authorized feature:** procedure uses `publicProcedure`/`protectedProcedure` (authz meta is mandatory — CI enforces), resource-level checks go in the service via `assertCan`. **Reads vs mutations:** Server Components call core services directly; mutations and client fetches go through tRPC. **Binary upload exception:** `/api/avatar` is the only non-tRPC mutation route.
  - Conventions: add the S3 env vars pointer (`.env.example` is canonical) and "storage objects are referenced by key in the DB; URLs are always freshly signed".
- Consumes: everything above.

- [ ] **Step 1:** Update `CLAUDE.md`; cross-check every referenced command/path still exists (fix whichever side is wrong). Confirm `.env.example` matches the final `loadEnv` schema var-for-var.
- [ ] **Step 2:** `pnpm lint` passes. Commit `docs: update agent guide for phase 2 user system`.

---

## Execution Notes for the Implementer

- Do not dispatch a final whole-branch code-review subagent after the last task unless the
  user explicitly asks for one — they run their own review once the project is done.
- Task order is dependency order; do not reorder. Tasks 3/4 (ABAC + default-deny) and 9/10 (GDPR pipeline) are the architectural heart — reread spec §5 #7/#23 and §2.3 before improvising there.
- The Phase 1 plan's Execution Notes still apply (Docker required for integration tests; prefer current official tool flows over memorized flags; never touch `components/ui` by hand; never npm/yarn; never `console.log`).
- `identityService.claimUsername` changes shape in Task 6 — the onboarding form and its tests move in the same task; nothing else calls it.
- Discord-credential-dependent manual verifications: same protocol as Phase 1 — if creds are unavailable, mark the substep for the user and verify via build/typecheck/tests instead.
- When a signed URL from MinIO doesn't open in the browser, check `S3_FORCE_PATH_STYLE=true` and that the endpoint is `localhost:9000` (not the docker-internal hostname) before debugging code.

## Verification (whole phase)

1. `pnpm lint && pnpm check-types && pnpm test && pnpm test:integration && pnpm build` — all green.
2. Dev flow: compose up → migrate → web + worker running → fresh Discord sign-in requires the consent checkbox → onboarded user edits profile/preferences/privacy, uploads an avatar (visible in header + `/u/<username>`), private profile 404s for strangers.
3. GDPR flow: request export → worker produces a downloadable JSON with all five identity sections → request deletion shows the 30-day date → cancel works; the gdpr integration tests prove execution + expiry (grace-period execution isn't manually observable).
4. Authz guard: the completeness test lists zero unannotated procedures; anonymous calls to any protected procedure return UNAUTHORIZED.

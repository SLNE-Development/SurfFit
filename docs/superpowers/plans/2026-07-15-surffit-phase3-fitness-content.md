# SurfFit Phase 3 — Fitness Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended by project owner) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No literal code by design (user directive, saves tokens).** Steps describe tests and implementations precisely in prose — exact file paths, exported names, signatures, commands, and expected outcomes. Write the code yourself from these descriptions. If a described name/signature conflicts with something, follow the plan's name.

**Goal:** The fitness content layer on top of the Phase 2 user system: the two-level exercise catalog (movements → equipment variants) with muscle groups and EN/DE translations seeded idempotently, gyms with equipment lists and memberships, community submissions that enter a pending state, minimal moderation (a moderator approval queue plus user reports), and Postgres full-text search over exercises and gyms.

**Architecture:** Three new `@surffit/core` modules — `exercises` (catalog reads + community submissions), `gyms` (directory, equipment, membership), `moderation` (reports, approval queue). Moderation is deliberately cross-cutting (spec §4.11's polymorphic tables): its repository owns the pending→approved/rejected status transitions of reviewable content and the `moderation_actions` log; content modules never call it and it never calls them — submissions and decisions broadcast via outbox events (`content.submitted`, `content.moderated`, `report.created`). Catalog reads take a `locale` and fall back to the canonical `en` translation row in SQL. FTS is generated `tsvector` columns + GIN indexes, queried only inside repository files (the `SearchProvider` port waits for Meilisearch, Phase 9). Spec: `docs/superpowers/specs/2026-07-15-surffit-architecture-design.md` (read §4.1, §4.3, §4.4, §4.11, §5 decisions #9/#10/#19 before starting). Established interfaces: Phase 1 and Phase 2 plans in this directory.

**Tech Stack:** Everything from Phases 1–2. **No new runtime dependencies and no new env vars** — the slug helper is hand-written, FTS is plain Postgres.

## Global Constraints

Every task implicitly includes these, in addition to all Phase 1 + Phase 2 Global Constraints (pnpm only, shadcn via CLI from `packages/ui`, layering rules, UUIDv7 via `newId()`, timestamps, `createLogger` only, typed domain errors, TS strict, Conventional Commits, authz metadata on every procedure, resource-level ABAC in services, reads via RSC / mutations via tRPC — reread them).

- **Domain constants (values fixed):** `FALLBACK_LOCALE = "en"` (new `packages/core/src/locale.ts`, re-exported from core index); search query minimum 2 chars after trim; search limit default 20, max 50; movement slug collision suffixes `-2` … `-9` then `ConflictError`; gym `countryCode` is ISO-3166-1 alpha-2, stored uppercase.
- **Locale rule:** every catalog read takes a `locale` parameter; repositories LEFT JOIN the requested locale's translation row and INNER JOIN the `en` row, returning `coalesce(requested.field, en.field)`. The web app passes the literal `"en"` everywhere — that call-site constant is the single i18n-phase wiring point; comment it as such (mirrors the Phase 6 `ownerFollowsViewer: false` pattern).
- **Translation invariant:** every insert of a translatable entity writes its canonical `en` translation row in the same transaction. There is no code path that creates a movement/exercise without an `en` name.
- **Status rule:** community-created movements/exercises/gyms insert with status `pending` and are visible only to their owner and elevated roles (`moderator`/`admin`/`super_admin`) until `approved`. Official seed rows have `ownerUserId` NULL and status `approved`. Soft-deleted rows (`deletedAt` set) are invisible everywhere.
- **Moderation ownership:** only the moderation module changes content status after insert; content modules only ever insert `pending` rows. Cross-module *tables* touched by the moderation repository (status columns of movements/exercises/gyms) are a documented design decision — comment it at the top of `moderation/repository.ts`.
- **New events must be registered** in `packages/core/src/events/registry.ts` (Phase 2 rule — unregistered types dead-letter). All Phase 3 routing keys are two-segment (`content.submitted`, `content.moderated`, `report.created`), so `*` binding patterns suffice.
- **FTS:** `tsvector` generated columns use the `simple` config (locale-mixed content; no stemming surprises); GIN indexes on every search column; `websearch_to_tsquery('simple', …)` OR a `name ILIKE '<query>%'` prefix match, ranked by `ts_rank`. Raw `sql` fragments for this live in repository files only (relay precedent).
- **Id inputs in Zod schemas** are `z.string().min(1)` — existence is a service/repository concern (`NotFoundError`), not a format concern.
- **Windows note** (unchanged): cross-platform package scripts only; CI runs Linux.

**Deferred beyond Phase 3 (do NOT build):** exercise media upload/display (`exercise_media` table ships empty — schema-complete per spec, no UI, no storage keys); `SearchProvider` port + Meilisearch (Phase 9); i18n catalogs and any locale switcher (web hardcodes `"en"`); default-gym selection UI in preferences (the FK lands here, the UI lands with workout logging in Phase 4); notifications for submission/report outcomes (Phase 6 consumes the events this phase emits); the full moderation dashboard, user enforcement actions (`remove`/`warn`/`suspend`/`restore`), and audit views (Phase 8 — `user` reports can be filed and resolved but nothing happens to the user); movement/exercise description + instruction *content* beyond what the seed carries (seed descriptions stay null; community text arrives with content editing later); rate limiting (Redis stays unused).

---

### Task 1: Exercise content schema (`@surffit/db`)

**Files:**
- Create: `packages/db/src/tsvector.ts`, `packages/db/src/schema/exercises.ts`
- Modify: `packages/db/src/schema/index.ts` (re-export)
- Create: `packages/db/migrations/` (generated)
- Test: extend `packages/db/src/schema.integration.test.ts`

**Interfaces:**
- Produces (spec §4.3, follow exactly; all ids text pk `$defaultFn(newId)` unless composite; `ts` = createdAt/updatedAt with `default(sql\`now()\`)` per the users-table idiom; `soft` = nullable deletedAt):
  - `tsvector.ts`: a Drizzle `customType` named `tsvector` (dataType `"tsvector"`), same pattern as `citext.ts`.
  - Enums: `contentStatusEnum` pgEnum `content_status` (`draft|pending|approved|rejected`); `difficultyEnum` pgEnum `difficulty` (`beginner|intermediate|advanced`); `bodyRegionEnum` pgEnum `body_region` (`upper|lower|core`); `muscleRoleEnum` pgEnum `muscle_role` (`primary|secondary`); `mediaKindEnum` pgEnum `media_kind` (`image|video`).
  - **movements** — id, slug text notNull unique, difficulty notNull, ownerUserId nullable fk → users.id (NO cascade/set-null: users are anonymized, never hard-deleted, so content keeps its pseudonymized owner — comment this), status notNull default `pending`, ts, soft.
  - **movementTranslations** (`movement_translations`) — movementId fk cascade, locale text notNull, name text notNull, description text nullable; composite pk (movementId, locale).
  - **equipment** — id, slug text notNull unique, ts. **equipmentTranslations** — equipmentId fk cascade, locale, name notNull; composite pk.
  - **muscleGroups** (`muscle_groups`) — id, slug unique notNull, bodyRegion notNull. **muscleGroupTranslations** — muscleGroupId fk cascade, locale, name notNull; composite pk.
  - **exercises** — id, movementId fk notNull, equipmentId fk notNull, difficulty notNull, ownerUserId nullable fk (same no-action comment), status notNull default `pending`, isUnilateral boolean notNull default false, ts, soft; unique constraint `exercises_variant_unique` on (movementId, equipmentId, ownerUserId) with `.nullsNotDistinct()` (official variants have owner NULL — without it Postgres would allow duplicate official rows).
  - **exerciseTranslations** — exerciseId fk cascade, locale, name notNull, description nullable, instructions nullable, `search` tsvector generated column: `.generatedAlwaysAs(sql\`to_tsvector('simple', name || ' ' || coalesce(description, ''))\`)`; composite pk (exerciseId, locale); GIN index `exercise_translations_search_idx` (`index(...).using("gin", table.search)`).
  - **exerciseMuscles** (`exercise_muscles`) — exerciseId fk cascade, muscleGroupId fk notNull, role muscleRoleEnum notNull; composite pk (exerciseId, muscleGroupId).
  - **exerciseMedia** (`exercise_media`) — id, exerciseId fk cascade, kind notNull, storageKey notNull, position smallint notNull default 0, ts.
- Consumes: `newId`, `users`, timestamp/citext idioms from Phase 1 schema files.

- [ ] **Step 1:** Extend the integration test: after migration, assert (a) all nine tables exist in information_schema; (b) inserting movement + en translation + an exercise + en translation works and the translation's `search` column is non-null and matches `to_tsvector('simple', name)` for a description-less row; (c) a second official exercise with the same (movement, equipment, NULL owner) violates `exercises_variant_unique`, while the same pair with a real ownerUserId inserts fine; (d) `exercise_muscles` rejects a duplicate (exercise, muscleGroup) pair; (e) a raw `SELECT … WHERE search @@ websearch_to_tsquery('simple', 'bench')` finds a seeded "Bench Press (Barbell)" row.
- [ ] **Step 2:** Run `pnpm --filter @surffit/db test:integration`. Expected: FAIL (tables missing).
- [ ] **Step 3:** Write `tsvector.ts` + `exercises.ts` per Interfaces, re-export, run `pnpm db:generate`, review the SQL: five enums, nine tables, the NULLS NOT DISTINCT unique, the generated tsvector column, the GIN index. If drizzle-kit mis-emits the generated column or index, hand-edit the migration SQL (migrations are reviewed artifacts) — the schema file stays the source of truth for types.
- [ ] **Step 4:** Re-run the integration test. Expected: PASS. Run `pnpm db:migrate` against dev compose Postgres. Expected: applied, exit 0.
- [ ] **Step 5:** Commit `feat(db): exercise content schema with fts`.

### Task 2: Gyms schema + default-gym FK (`@surffit/db`)

**Files:**
- Create: `packages/db/src/schema/gyms.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/schema/preferences.ts` (FK)
- Create: `packages/db/migrations/` (generated)
- Test: extend `packages/db/src/schema.integration.test.ts`

**Interfaces:**
- Produces (spec §4.4 — no translations table, gym names are proper nouns):
  - `gymStatusEnum` pgEnum `gym_status` (`pending|approved|rejected`).
  - **gyms** — id, name text notNull, description nullable, city text notNull, countryCode varchar(2) notNull, address nullable, ownerUserId fk notNull → users.id (no action), status notNull default `pending`, `search` tsvector generated as `to_tsvector('simple', name || ' ' || city)` with GIN index `gyms_search_idx`, ts, soft.
  - **gymEquipment** (`gym_equipment`) — id, gymId fk cascade, equipmentId fk notNull, label text notNull, notes nullable, ts; index on (gymId).
  - **gymMembers** (`gym_members`) — gymId fk cascade, userId fk cascade, joinedAt timestamptz notNull default now; composite pk (gymId, userId).
  - preferences.ts: `defaultGymId` gains `.references(() => gyms.id, { onDelete: "set null" })` (Phase 1 left it a plain column pending this table; all existing values are NULL so the ALTER is safe).
- Consumes: Task 1's `equipment` table; `users`; `newId`.

- [ ] **Step 1:** Extend the integration test: (a) gyms/gym_equipment/gym_members exist; (b) a gym inserts with status defaulting to `pending` and its `search` column matches `websearch_to_tsquery('simple', '<city>')`; (c) duplicate (gymId, userId) membership violates the pk; (d) `user_preferences.default_gym_id` now carries the FK (insert a preferences row pointing at a missing gym id → FK violation).
- [ ] **Step 2:** Run `pnpm --filter @surffit/db test:integration`. Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces, `pnpm db:generate`, review SQL (one enum, three tables, one ALTER on user_preferences, tsvector + GIN).
- [ ] **Step 4:** Re-run integration test → PASS; `pnpm db:migrate` → applied.
- [ ] **Step 5:** Commit `feat(db): gyms schema and default gym fk`.

### Task 3: Reports + moderation actions schema (`@surffit/db`)

**Files:**
- Create: `packages/db/src/schema/moderation.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/` (generated)
- Test: extend `packages/db/src/schema.integration.test.ts`

**Interfaces:**
- Produces (spec §4.11; enums carry the full spec'd value sets now — later phases add rows, not migrations):
  - `subjectTypeEnum` pgEnum `subject_type` (`exercise|movement|plan|comment|activity|user|gym`) — shared by both tables.
  - `reportReasonEnum` pgEnum `report_reason` (`spam|inappropriate|incorrect|copyright|other`); `reportStatusEnum` pgEnum `report_status` (`open|reviewing|resolved|dismissed`); `moderationActionEnum` pgEnum `moderation_action` (`approve|reject|remove|warn|suspend|restore`).
  - **reports** — id, reporterUserId fk notNull, subjectType notNull, subjectId text notNull, reason notNull, details text nullable, status notNull default `open`, resolvedBy fk nullable, resolvedAt nullable, ts; indexes on (status) and (subjectType, subjectId).
  - **moderationActions** (`moderation_actions`) — id, moderatorUserId fk notNull, action notNull, subjectType notNull, subjectId text notNull, reportId fk nullable → reports.id, reason text nullable, ts.
- Consumes: `users`, `newId`.

- [ ] **Step 1:** Extend the integration test: both tables exist; a report inserts with status defaulting to `open`; a bogus `reason` value throws; a moderation action row referencing the report inserts.
- [ ] **Step 2:** Run `pnpm --filter @surffit/db test:integration`. Expected: FAIL. Implement, `pnpm db:generate`, review SQL (four enums, two tables, two indexes).
- [ ] **Step 3:** Re-run → PASS; `pnpm db:migrate` → applied. Commit `feat(db): reports and moderation actions schema`.

### Task 4: EN/DE catalog seed (`@surffit/db`)

**Files:**
- Create: `packages/db/src/seed/catalog.ts` (typed data), `packages/db/src/seed/run.ts` (`runSeed`)
- Modify: `packages/db/src/seed.ts` (CLI now applies the seed), `packages/db/src/index.ts` (export `runSeed`)
- Test: `packages/db/src/seed.integration.test.ts`

**Interfaces:**
- Produces: `runSeed(db: Db): Promise<{ equipment: number; muscleGroups: number; movements: number; exercises: number }>` (counts of rows now present) — **idempotent**: every insert is keyed on its natural key with `onConflictDoNothing` (equipment/muscle_groups/movements by slug; exercises by the variant unique; translations by their composite pk), so re-running changes nothing. All seed content rows: `ownerUserId` NULL, status `approved`. `seed.ts` stays the CLI (reads `DATABASE_URL` from `process.env` directly, no `@surffit/core` import — dependency-direction rule; `console` is acceptable in this CLI only, existing precedent) and logs the counts.
- Seed data (`catalog.ts`, exported as typed const arrays; descriptions stay null — see Deferred):
  - **Equipment** (8, spec slugs): barbell/Barbell/Langhantel, dumbbell/Dumbbell/Kurzhantel, machine/Machine/Maschine, cable/Cable/Kabelzug, smith_machine/Smith Machine/Multipresse, kettlebell/Kettlebell/Kettlebell, resistance_band/Resistance Band/Widerstandsband, bodyweight/Bodyweight/Körpergewicht.
  - **Muscle groups** (15) — slug (region): EN / DE: chest (upper): Chest/Brust; upper_back (upper): Upper Back/Oberer Rücken; lats (upper): Lats/Latissimus; shoulders (upper): Shoulders/Schultern; biceps (upper): Biceps/Bizeps; triceps (upper): Triceps/Trizeps; forearms (upper): Forearms/Unterarme; abs (core): Abs/Bauchmuskeln; obliques (core): Obliques/Seitliche Bauchmuskeln; lower_back (core): Lower Back/Unterer Rücken; quads (lower): Quads/Quadrizeps; hamstrings (lower): Hamstrings/Beinbeuger; glutes (lower): Glutes/Gesäßmuskeln; calves (lower): Calves/Waden; adductors (lower): Adductors/Adduktoren.
  - **Movements** (37). Legend — equipment: BB barbell, DB dumbbell, MC machine, CB cable, SM smith_machine, KB kettlebell, RB resistance_band, BW bodyweight; difficulty: beg/int/adv. One exercise variant is created per listed equipment; per-variant difficulty = movement difficulty; `isUnilateral` true **only** for lunge variants.

    | slug | EN / DE | diff | primary | secondary | equipment |
    | --- | --- | --- | --- | --- | --- |
    | bench-press | Bench Press / Bankdrücken | int | chest | triceps, shoulders | BB DB MC SM |
    | incline-bench-press | Incline Bench Press / Schrägbankdrücken | int | chest | shoulders, triceps | BB DB MC SM |
    | chest-fly | Chest Fly / Fliegende | beg | chest | shoulders | DB CB MC |
    | push-up | Push-Up / Liegestütz | beg | chest | triceps, shoulders, abs | BW |
    | dip | Dip / Dips | int | chest | triceps, shoulders | BW MC |
    | pull-up | Pull-Up / Klimmzug | int | lats | biceps, upper_back, forearms | BW |
    | lat-pulldown | Lat Pulldown / Latzug | beg | lats | biceps, upper_back | CB MC |
    | bent-over-row | Bent-Over Row / Vorgebeugtes Rudern | int | upper_back | lats, biceps, lower_back | BB DB |
    | seated-row | Seated Row / Rudern sitzend | beg | upper_back | lats, biceps | CB MC |
    | deadlift | Deadlift / Kreuzheben | adv | lower_back | glutes, hamstrings, upper_back, forearms | BB |
    | romanian-deadlift | Romanian Deadlift / Rumänisches Kreuzheben | int | hamstrings | glutes, lower_back | BB DB |
    | back-extension | Back Extension / Rückenstrecken | beg | lower_back | glutes, hamstrings | BW MC |
    | shrug | Shrug / Schulterheben | beg | upper_back | forearms | BB DB SM |
    | overhead-press | Overhead Press / Schulterdrücken | int | shoulders | triceps | BB DB MC SM |
    | lateral-raise | Lateral Raise / Seitheben | beg | shoulders | — | DB CB MC |
    | front-raise | Front Raise / Frontheben | beg | shoulders | — | DB CB |
    | reverse-fly | Reverse Fly / Vorgebeugtes Seitheben | beg | shoulders | upper_back | DB CB MC |
    | face-pull | Face Pull / Face Pull | beg | shoulders | upper_back | CB RB |
    | biceps-curl | Biceps Curl / Bizepscurl | beg | biceps | forearms | BB DB CB MC |
    | hammer-curl | Hammer Curl / Hammercurl | beg | biceps | forearms | DB CB |
    | triceps-extension | Triceps Extension / Trizepsstrecken | beg | triceps | — | DB CB BB |
    | triceps-pushdown | Triceps Pushdown / Trizepsdrücken am Kabel | beg | triceps | — | CB |
    | squat | Squat / Kniebeuge | int | quads | glutes, hamstrings, lower_back, abs | BB SM BW |
    | front-squat | Front Squat / Frontkniebeuge | adv | quads | glutes, abs | BB |
    | goblet-squat | Goblet Squat / Goblet Squat | beg | quads | glutes | DB KB |
    | leg-press | Leg Press / Beinpresse | beg | quads | glutes, hamstrings | MC |
    | lunge | Lunge / Ausfallschritt | int | quads | glutes, hamstrings | BW DB BB |
    | leg-extension | Leg Extension / Beinstrecken | beg | quads | — | MC |
    | leg-curl | Leg Curl / Beinbeugen | beg | hamstrings | calves | MC |
    | hip-thrust | Hip Thrust / Hip Thrust | int | glutes | hamstrings | BB MC BW |
    | hip-adduction | Hip Adduction / Adduktion | beg | adductors | — | MC CB |
    | calf-raise | Calf Raise / Wadenheben | beg | calves | — | MC BB DB BW SM |
    | plank | Plank / Unterarmstütz | beg | abs | obliques, lower_back | BW |
    | crunch | Crunch / Crunch | beg | abs | obliques | BW MC CB |
    | leg-raise | Leg Raise / Beinheben | int | abs | obliques | BW |
    | russian-twist | Russian Twist / Russian Twist | beg | obliques | abs | BW KB DB |
    | kettlebell-swing | Kettlebell Swing / Kettlebell Swing | int | glutes | hamstrings, lower_back, shoulders | KB |

  - **Exercise names are generated**, not authored: EN `"<Movement EN> (<Equipment EN>)"`, DE `"<Movement DE> (<Equipment DE>)"` — e.g. "Bench Press (Barbell)" / "Bankdrücken (Langhantel)". Each exercise gets its `en` + `de` translation rows and its `exercise_muscles` rows copied from the movement's primary/secondary lists.
- Consumes: Tasks 1–2 schema (equipment FKs), `Db`/`createDb`.

- [ ] **Step 1:** Write the failing integration test: Testcontainers Postgres + migrations, then `runSeed(db)` twice; assert (a) counts: 8 equipment, 15 muscle groups, 37 movements, and exercises = the sum of the equipment lists above (compute it from the imported `catalog.ts` data, don't hardcode); (b) second run changes no counts; (c) every exercise has an `en` and a `de` translation and at least one `primary` muscle row; (d) FTS: searching exercise_translations for `bankdrücken` (de) and `bench` (en) each return > 0 rows; (e) all seeded rows have status `approved` and NULL owner.
- [ ] **Step 2:** Run `pnpm --filter @surffit/db test:integration`. Expected: FAIL. Implement `catalog.ts`, `run.ts`, rewrite `seed.ts` per Interfaces. Re-run: PASS.
- [ ] **Step 3:** Run `pnpm db:seed` against dev compose Postgres twice — second run logs identical counts. Commit `feat(db): en/de exercise catalog seed`.

### Task 5: Content + report events (`@surffit/core`)

**Files:**
- Create: `packages/core/src/events/content.ts`, `packages/core/src/events/report.ts`
- Modify: `packages/core/src/events/registry.ts`, `packages/core/src/messaging/groups.ts`, `packages/core/src/index.ts`
- Test: extend `packages/core/src/events/envelope.test.ts`

**Interfaces:**
- Produces (all via the existing `defineEvent`, all registered):
  - `contentSubmittedEvent` — type `content.submitted` v1, payload `{ subjectType: z.enum(["movement","exercise","gym"]), subjectId: string, ownerUserId: string }`.
  - `contentModeratedEvent` — type `content.moderated` v1, payload `{ subjectType: same enum, subjectId: string, decision: z.enum(["approved","rejected"]), moderatorUserId: string }`.
  - `reportCreatedEvent` — type `report.created` v1, payload `{ reportId: string, subjectType: z.enum(["movement","exercise","gym","user"]), subjectId: string, reporterUserId: string }`.
  - groups.ts: the `system` group's bindings become `["user.*", "content.*", "report.*"]` (handler unchanged — it logs; this keeps the outbox→consumer path observable for the new events until Phase 6 adds real consumers).
- Consumes: `defineEvent`/registry (Phase 1 Task 6).

- [ ] **Step 1:** Extend the envelope unit tests: each new definition `create`s a valid envelope (correct type, version 1) and `parse` rejects a payload missing `subjectId`; `contentModeratedEvent.parse` rejects decision `"pending"`. Assert the registry contains all three new types.
- [ ] **Step 2:** Run `pnpm --filter @surffit/core test`. Expected: FAIL. Implement. Re-run: PASS (messaging integration tests need no changes — `services` and topology assertion are additive; note that already-running dev brokers keep old bindings harmlessly).
- [ ] **Step 3:** Commit `feat(core): content and report events`.

### Task 6: Exercises module — catalog reads, locale fallback, FTS (`@surffit/core`)

**Files:**
- Create: `packages/core/src/locale.ts`, `packages/core/src/exercises/service.ts`, `packages/core/src/exercises/repository.ts`, `packages/core/src/exercises/policies.ts`, `packages/core/src/exercises/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/exercises/exercises.test.ts` (unit, fake repo), `packages/core/src/exercises/exercises.integration.test.ts` (Postgres)

**Interfaces:**
- Produces (locale.ts): `FALLBACK_LOCALE = "en" as const`.
- Produces (policies.ts): `viewContentPolicy: Policy<{ ownerUserId: string | null; status: "draft" | "pending" | "approved" | "rejected" }>` — `approved` → true for anyone including anonymous; otherwise actor is the owner or has an elevated role (moderator/admin/super_admin — reuse the ELEVATED_ROLES idiom from identity/policies.ts, exporting a shared `hasElevatedRole(actor)` helper from `authz/engine.ts` is fine and preferred over copy-paste).
- Produces (service.ts — `createExercisesService(repo: ExercisesRepository)`, viewer always `{ id: string } | null`, `Actor` built via `repo.getUserRoles` exactly like identity's `getProfileByUsername`):
  - Shared exported types: `Difficulty = "beginner" | "intermediate" | "advanced"`, `ContentStatus = "draft" | "pending" | "approved" | "rejected"`.
  - `listEquipment(locale)` → `{ id, slug, name }[]` ordered by name; `listMuscleGroups(locale)` → `{ id, slug, bodyRegion, name }[]` ordered by name.
  - `listMovements(viewer, { locale, muscleGroupId?, equipmentId?, difficulty? })` → `{ id, slug, name, difficulty, status, isOwner, equipmentSlugs: string[] }[]` ordered by name. Visible = approved, or owned by viewer, or viewer elevated (the repo takes `{ viewerId: string | null, includeNonApproved: boolean }` — the service computes `includeNonApproved` from roles; the SQL filter *implements* `viewContentPolicy` for lists, the policy object is the single-item check — comment this). `muscleGroupId` filters to movements having a variant whose `exercise_muscles` has that group with role `primary`; `equipmentId` to movements having a variant with that equipment; variants considered are themselves visibility-filtered.
  - `searchExercises(viewer, { locale, query, muscleGroupId?, equipmentId?, difficulty?, limit = 20 })` — query trimmed, < 2 chars → `DomainRuleViolationError("validation.search.tooShort")`; limit clamped to 50. Returns `{ id, movementId, movementSlug, name, equipmentSlug, equipmentName, difficulty, status, isOwner }[]`. Match: effective (requested-or-en) translation `search @@ websearch_to_tsquery('simple', query)` OR effective name `ILIKE query%`; order by `ts_rank` desc then name.
  - `getMovementBySlug(viewer, locale, slug)` → `{ id, slug, name, description, difficulty, status, isOwner, variants: { id, name, description, instructions, equipmentSlug, equipmentName, isUnilateral, status, isOwner, muscles: { slug, name, role }[] }[] }`. Movement missing, soft-deleted, or `can(viewContentPolicy, …)` false → `NotFoundError("exercises.movement.notFound")` (never reveal restricted content — identity precedent). Variants are visibility-filtered individually.
- Produces (repository.ts — `createExercisesRepository(db): ExercisesRepository`; interface lives in service.ts, Drizzle impl here, identity idiom). Locale fallback per the Global Constraint: LEFT JOIN requested-locale translation + INNER JOIN en translation, `coalesce` fields. Methods mirror the service reads plus `getUserRoles(userId)` (duplicated tiny query by design — roles are authz-infra data; comment it).
- Consumes: Tasks 1, 4 (integration test uses seeded-style fixtures), `can`/`assertCan`, `NotFoundError`/`DomainRuleViolationError`.

- [ ] **Step 1:** Write failing unit tests (fake repo with fixture movements/exercises): approved movement visible to anonymous; pending movement → NotFoundError for a stranger, full payload with `isOwner: true` for the owner, visible to a moderator; pending variant of an approved movement hidden from strangers but present for its owner; search query "b" → `validation.search.tooShort`; limit 200 clamps to 50; policy unit tests for `viewContentPolicy` (owner/moderator/anonymous × 4 statuses).
- [ ] **Step 2:** Run `pnpm --filter @surffit/core test`. Expected: FAIL. Implement service + policies (+ the `hasElevatedRole` helper). Re-run: PASS.
- [ ] **Step 3:** Write the failing integration test (Testcontainers Postgres + migrations; insert fixtures directly with Drizzle — two movements, three exercises; give one exercise `en` + `de` translations, another only `en`): (a) `searchExercises` locale `de` finds the German name and falls back to the EN name for the row without a `de` translation; (b) FTS matches a full word and `ILIKE` catches a 3-char prefix; (c) `listMovements` with a primary-muscle filter returns only the matching movement; (d) `getMovementBySlug` locale `de` returns coalesced names and each variant's muscles.
- [ ] **Step 4:** Run `pnpm --filter @surffit/core test:integration`. Expected: PASS after implementing the repository. `pnpm check-types && pnpm lint` exit 0.
- [ ] **Step 5:** Commit `feat(exercises): catalog reads with locale fallback and fts`.

### Task 7: Exercises module — community submissions (`@surffit/validation` + `@surffit/core`)

**Files:**
- Create: `packages/validation/src/exercise.ts`, `packages/core/src/exercises/slug.ts`
- Modify: `packages/validation/src/index.ts`, `packages/core/src/exercises/service.ts` + `repository.ts`, `packages/db/src/client.ts` + `packages/db/src/index.ts` (export `isUniqueViolation`), `packages/core/src/identity/repository.ts` (switch to the shared helper)
- Test: `packages/validation/src/exercise.test.ts`, `packages/core/src/exercises/slug.test.ts`, extend `packages/core/src/exercises/exercises.test.ts` + `exercises.integration.test.ts`

**Interfaces:**
- Produces (validation/exercise.ts): `difficultySchema` = z.enum of the three difficulties. `movementSubmissionSchema` = `{ name: trimmed string 3–80 ("validation.movement.name"), description: trimmed max 2000, empty → null, optional/nullable ("validation.movement.description"), difficulty: difficultySchema }`. `exerciseSubmissionSchema` = `{ movementId: z.string().min(1), equipmentId: z.string().min(1), difficulty: difficultySchema, isUnilateral: z.boolean().default(false), name: trimmed 3–80 optional/nullable ("validation.exercise.name"), description: max 2000 optional → null, instructions: max 4000 optional → null ("validation.exercise.instructions"), primaryMuscleGroupId: z.string().min(1), secondaryMuscleGroupIds: z.array(z.string().min(1)).max(5).default([]) }` with a refine rejecting `primaryMuscleGroupId` appearing in the secondaries ("validation.exercise.muscles.overlap").
- Produces (slug.ts): `slugify(name: string): string` — Unicode NFKD normalize, strip combining marks, lowercase, replace every non-`[a-z0-9]` run with `-`, trim leading/trailing `-`; empty result → throw `DomainRuleViolationError("validation.movement.name")`.
- Produces (service additions):
  - `submitMovement(userId, input)` — parse `movementSubmissionSchema` (failure → `DomainRuleViolationError` with the issue's message key, identity idiom); slug = `slugify(name)`; in one `repo.withTransaction`: insert movement (status `pending`, owner userId) + `en` translation + `writeEvent(contentSubmittedEvent.create({ subjectType: "movement", subjectId, ownerUserId }))`. On slug unique violation retry with suffixes `-2` … `-9`, then `ConflictError("exercises.movement.exists")`. Returns `{ id, slug }`.
  - `submitExercise(userId, input)` — parse; movement must exist, be non-deleted, and be approved or owned by the submitter, else `NotFoundError("exercises.movement.notFound")`; equipment and every referenced muscle group must exist (`NotFoundError("exercises.equipment.notFound")` / `("exercises.muscleGroup.notFound")`); in one tx: insert exercise (pending, owner) — variant unique violation → `ConflictError("exercises.variant.exists")` — plus `en` translation (name defaulting to `"<movement en name> (<equipment en name>)"` when input.name is null), muscles rows (one primary + secondaries), and the `content.submitted` outbox envelope (`subjectType: "exercise"`). Returns `{ id, movementSlug }`.
- Produces (repository additions): `withTransaction` (identity idiom), `insertMovement`/`insertMovementTranslation`/`insertExercise`/`insertExerciseTranslation`/`insertExerciseMuscles`/`writeEvent` (all tx-scoped; unique violations surface via the Phase 1 `isUniqueViolation` code-23505 idiom — extract that helper into `packages/db/src/client.ts` as an exported `isUniqueViolation` and reuse it from identity too), `findMovementForSubmission(movementId)` (id, status, ownerUserId, deletedAt, en name), `equipmentExists(id)` + en name lookup, `muscleGroupsExist(ids)`.
- Consumes: Task 5 events, Task 6 module, `writeOutbox` via `writeEvent`.

- [ ] **Step 1:** Write failing tests. Validation: name 2 chars rejected, 2001-char description rejected, secondary containing the primary rejected, defaults applied. Slug: "Bench Press" → `bench-press`, "Überkopfdrücken!!" → `uberkopfdrucken`, "---" → throws. Service (fake repo): submitMovement writes movement + en translation + one `content.submitted` envelope in a tx and returns the slug; slug collision retries to `-2`; ten collisions → ConflictError; submitExercise on a stranger's pending movement → NotFoundError; on a duplicate variant → `exercises.variant.exists`; default name is generated from movement + equipment EN names; muscles rows include exactly one primary.
- [ ] **Step 2:** Run validation + core unit tests. Expected: FAIL. Implement per Interfaces. Re-run: PASS.
- [ ] **Step 3:** Extend the integration test: a real submitMovement + submitExercise round-trip — rows land with status `pending`, the outbox table has two `content.submitted` rows, and `getMovementBySlug` as the submitter shows the new movement while an anonymous viewer 404s.
- [ ] **Step 4:** `pnpm --filter @surffit/core test && pnpm --filter @surffit/core test:integration` → PASS. Commit `feat(exercises): community movement and variant submissions`.

### Task 8: Gyms module (`@surffit/validation` + `@surffit/core`)

**Files:**
- Create: `packages/validation/src/gym.ts`, `packages/core/src/gyms/service.ts`, `packages/core/src/gyms/repository.ts`, `packages/core/src/gyms/policies.ts`, `packages/core/src/gyms/index.ts`
- Modify: `packages/validation/src/index.ts`, `packages/core/src/index.ts`
- Test: `packages/validation/src/gym.test.ts`, `packages/core/src/gyms/gyms.test.ts` (unit), `packages/core/src/gyms/gyms.integration.test.ts` (Postgres)

**Interfaces:**
- Produces (validation/gym.ts): `gymCreateSchema` = `{ name: trimmed 3–80 ("validation.gym.name"), description: max 2000 optional → null, city: trimmed 1–80 ("validation.gym.city"), countryCode: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/, "validation.gym.countryCode").transform(uppercase), address: max 200 optional → null }`; `gymUpdateSchema` = all fields of create, each optional (partial update); `gymEquipmentAddSchema` = `{ equipmentId: z.string().min(1), label: trimmed 1–80 ("validation.gym.equipmentLabel"), notes: max 500 optional → null }`.
- Produces (policies.ts): `viewGymPolicy: Policy<{ ownerUserId: string; status: "pending" | "approved" | "rejected" }>` — approved → anyone; else owner or elevated. `manageGymPolicy: Policy<{ ownerUserId: string }>` — owner or elevated (moderators can fix community data).
- Produces (service.ts — `createGymsService(repo: GymsRepository)`):
  - `createGym(userId, input)` — parse gymCreateSchema; tx: insert gym (pending, owner) + `content.submitted` envelope (`subjectType: "gym"`); returns `{ id, name, status }`.
  - `getGymById(viewer, locale, gymId)` — missing/deleted or `can(viewGymPolicy, …)` false → `NotFoundError("gyms.notFound")`. Returns `{ id, name, description, city, countryCode, address, status, isOwner, isMember, memberCount, equipment: { id, label, notes, equipmentSlug, equipmentName }[] }` (equipment names locale-resolved with EN fallback).
  - `searchGyms(viewer, { query?, limit = 20 })` — limit clamped to 50; query, when present, trimmed and ≥ 2 chars else `DomainRuleViolationError("validation.search.tooShort")`; returns approved gyms plus the viewer's own non-approved ones: `{ id, name, city, countryCode, status, memberCount, isOwner }[]`, FTS + name-prefix matching as in Task 6, no query → ordered by name.
  - `updateGym(userId, gymId, partial)` — parse gymUpdateSchema; load gym (missing → NotFoundError); `assertCan(manageGymPolicy, actor-with-roles, { ownerUserId })`; partial update + updatedAt; returns the getGymById shape minus membership fields.
  - `addEquipment(userId, gymId, input)` / `removeEquipment(userId, gymId, gymEquipmentId)` — manageGymPolicy; equipmentId must exist (`NotFoundError("exercises.equipment.notFound")`); removing a missing row → `NotFoundError("gyms.equipment.notFound")`.
  - `joinGym(userId, gymId)` — gym must be approved and visible else NotFoundError; already a member → `ConflictError("gyms.alreadyMember")`. `leaveGym(userId, gymId)` — not a member → `NotFoundError("gyms.membership.notFound")`.
  - `listMyGyms(userId)` — gyms the user owns or has joined: `{ id, name, city, countryCode, status, isOwner, memberCount }[]`.
- Produces (repository.ts): `GymsRepository` (interface in service.ts) — `withTransaction`, `insertGym`, `writeEvent`, `findGymById` (incl. deletedAt), `getGymDetail(gymId, locale)`, `searchGyms(params)`, `updateGym`, `insertGymEquipment`, `deleteGymEquipment`, `insertMember`, `deleteMember`, `isMember`, `memberCount`, `listMyGyms`, `getUserRoles`, `equipmentExists`.
- Consumes: Tasks 2, 5; `isUniqueViolation` (Task 7 extraction); authz engine.

- [ ] **Step 1:** Write failing tests. Validation: countryCode "deu" rejected, "de" → "DE", name bounds. Service (fake repo): createGym writes gym + envelope; pending gym → NotFoundError for stranger, visible to owner and moderator; join on a pending gym → NotFoundError; double join → `gyms.alreadyMember`; leave without membership → `gyms.membership.notFound`; updateGym by non-owner → PermissionDeniedError, by moderator → allowed; removeEquipment on a missing id → `gyms.equipment.notFound`.
- [ ] **Step 2:** Run validation + core unit tests. Expected: FAIL. Implement. Re-run: PASS.
- [ ] **Step 3:** Write the failing integration test (Postgres): create two gyms (one approved via direct status insert, one pending), join/leave round-trip updates memberCount, `searchGyms` FTS matches the city name, equipment add shows locale-resolved names, outbox holds the `content.submitted` row.
- [ ] **Step 4:** Run `pnpm --filter @surffit/core test:integration` → PASS. Commit `feat(gyms): gym directory with equipment and membership`.

### Task 9: Moderation module — reports + approval queue (`@surffit/validation` + `@surffit/core`)

**Files:**
- Create: `packages/validation/src/report.ts`, `packages/core/src/moderation/service.ts`, `packages/core/src/moderation/repository.ts`, `packages/core/src/moderation/policies.ts`, `packages/core/src/moderation/index.ts`
- Modify: `packages/validation/src/index.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/moderation/moderation.test.ts` (unit), `packages/core/src/moderation/moderation.integration.test.ts` (Postgres)

**Interfaces:**
- Produces (validation/report.ts): `reportCreateSchema` = `{ subjectType: z.enum(["movement","exercise","gym","user"]), subjectId: z.string().min(1), reason: z.enum(["spam","inappropriate","incorrect","copyright","other"]), details: trimmed max 1000, empty → null, optional ("validation.report.details") }`.
- Produces (policies.ts): `moderateContentPolicy: Policy<null>` — actor non-null and elevated role (via `hasElevatedRole`); used by queue, review, report listing, and resolution.
- Produces (service.ts — `createModerationService(repo: ModerationRepository)`; constants exported here: `REVIEWABLE_SUBJECT_TYPES = ["movement","exercise","gym"] as const`, `REPORTABLE_SUBJECT_TYPES = [...REVIEWABLE_SUBJECT_TYPES, "user"] as const`):
  - `getQueue(actorUserId)` — build actor with roles, `assertCan(moderateContentPolicy, actor, null)`; returns pending, non-deleted content across the three reviewable tables, oldest first: `{ subjectType, subjectId, name (en translation name / gym name), movementSlug: string | null (the movement's own slug, or the parent movement's slug for exercises, null for gyms), ownerUsername: string | null, submittedAt }[]`.
  - `review(actorUserId, input: { subjectType ∈ REVIEWABLE, subjectId, decision: "approve" | "reject", reason?: trimmed max 500 → null })` — assertCan; in one tx: **conditional claim** — update the subject's row `status = approved|rejected` WHERE current status is `pending` AND not deleted, RETURNING; no row → `ConflictError("moderation.alreadyReviewed")` (double-click/two-moderator idempotency, gdpr claim precedent); insert a `moderation_actions` row (action = decision, moderatorUserId, subjectType/Id, reason); `writeEvent(contentModeratedEvent.create({ subjectType, subjectId, decision: approved|rejected, moderatorUserId }))`. Returns `{ subjectType, subjectId, status }`.
  - `createReport(userId, input)` — parse reportCreateSchema; subject must exist and be non-deleted (for `user`: non-deleted and non-anonymized) else `NotFoundError("moderation.subject.notFound")`; an existing `open`/`reviewing` report by the same reporter on the same subject → `ConflictError("moderation.report.duplicate")`; tx: insert report + `report.created` envelope. Returns the report row.
  - `listReports(actorUserId, { status = "open" })` — assertCan; returns `{ id, subjectType, subjectId, subjectLabel (en content name / gym name / username, "deleted" fallback), reason, details, status, reporterUsername, createdAt }[]` newest first.
  - `resolveReport(actorUserId, { reportId, resolution: "resolved" | "dismissed" })` — assertCan; conditional update WHERE status IN (open, reviewing) setting status/resolvedBy/resolvedAt, RETURNING; no row → `ConflictError("moderation.report.alreadyClosed")`. (No moderation_actions row — the report row itself is the record; the action enum has no resolve value by spec.)
- Produces (repository.ts — file-top comment stating the cross-cutting design decision from Global Constraints): `withTransaction`, `getUserRoles`, `listPendingContent()` (three queries merged + sorted in TS is fine at this scale), `claimPendingContent(subjectType, subjectId, nextStatus, tx)` → claimed boolean, `insertModerationAction(row, tx)`, `writeEvent`, `subjectExists(subjectType, subjectId)`, `hasOpenReport(reporterId, subjectType, subjectId)`, `insertReport(row, tx)`, `listReports(status)`, `resolveReport(reportId, resolution, resolvedBy)`.
- Consumes: Tasks 1–3 tables, Task 5 events, authz engine, gdpr claim idiom.

- [ ] **Step 1:** Write failing unit tests (fake repo): non-moderator getQueue/review/listReports/resolveReport → PermissionDeniedError with `authz.denied`; review happy path claims, writes one action row and one `content.moderated` envelope in a tx; second review of the same subject → `moderation.alreadyReviewed`; createReport on a missing subject → `moderation.subject.notFound`; duplicate open report → `moderation.report.duplicate`; a *different* reporter on the same subject succeeds; resolveReport flips open → resolved and a repeat → `moderation.report.alreadyClosed`.
- [ ] **Step 2:** Run `pnpm --filter @surffit/core test`. Expected: FAIL. Implement per Interfaces. Re-run: PASS.
- [ ] **Step 3:** Write the failing integration test (Postgres, the Phase 3 pipeline proof): seed a moderator (users + user_roles rows), a submitter, a pending movement with variant, and a pending gym; getQueue lists all three items with names; approve the movement — its status is `approved`, an action row and a `content.moderated` outbox row exist, and the movement is now visible to an anonymous `getMovementBySlug`; reject the gym and confirm `searchGyms` as a stranger omits it while the owner still sees it; file a report against the approved movement, list it, resolve it, and assert `report.created` sits in the outbox.
- [ ] **Step 4:** Run `pnpm --filter @surffit/core test:integration` → PASS. `pnpm check-types && pnpm lint` exit 0. Commit `feat(moderation): reports and content review pipeline`.

### Task 10: Exercises + gyms tRPC routers

**Files:**
- Create: `packages/trpc/src/routers/exercises.ts`, `packages/trpc/src/routers/gyms.ts`
- Modify: `packages/trpc/src/routers/index.ts`
- Test: extend `packages/trpc/src/routers.test.ts`

**Interfaces:**
- Produces (services built per call from `ctx.db`, existing idiom — `createExercisesService(createExercisesRepository(ctx.db))` etc.; viewer = `ctx.session?.user ?? null`; every locale input is `z.string().default("en")`; mutation inputs reuse the `@surffit/validation` schemas directly — the service re-parses, Phase 2 precedent):
  - `exercises.filters` — public query `{ locale }` → `{ equipment, muscleGroups }` (listEquipment + listMuscleGroups).
  - `exercises.movements` — public query `{ locale, muscleGroupId?, equipmentId?, difficulty? (difficultySchema.optional()) }` → listMovements.
  - `exercises.search` — public query `{ locale, query: z.string(), muscleGroupId?, equipmentId?, difficulty?, limit: z.number().int().min(1).max(50).default(20) }` → searchExercises (length rule enforced in the service so direct consumers share it).
  - `exercises.submitMovement` — protected mutation, input `movementSubmissionSchema` → `submitMovement(ctx.session.user.id, input)`.
  - `exercises.submitExercise` — protected mutation, input `exerciseSubmissionSchema`.
  - `gyms.search` — public query `{ locale, query: z.string().optional(), limit: same bounds }`; `gyms.mine` — protected query (no input) → listMyGyms.
  - `gyms.create` — protected mutation `gymCreateSchema`; `gyms.update` — protected mutation `gymUpdateSchema.extend({ gymId: z.string().min(1) })` → `updateGym(userId, gymId, rest)`.
  - `gyms.addEquipment` — protected mutation `gymEquipmentAddSchema.extend({ gymId })`; `gyms.removeEquipment` — protected mutation `{ gymId, gymEquipmentId }`.
  - `gyms.join` / `gyms.leave` — protected mutations `{ gymId: z.string().min(1) }`.
  - Both routers registered in `appRouter` as `exercises` and `gyms`; the Task 4 (Phase 2) authz completeness test covers them automatically.
- Consumes: Tasks 6–8 services, Phase 2 procedure bases.

- [ ] **Step 1:** Write failing createCaller tests (transport concerns only, stub `Db` — Phase 2 Task 7 idiom): anonymous `exercises.submitMovement` and `gyms.create` → UNAUTHORIZED before any db touch; `exercises.search` with `limit: 500` → BAD_REQUEST (Zod bound, rejected before the handler); for the public queries, assert via the authz-meta walk that `exercises.filters`/`exercises.movements`/`exercises.search`/`gyms.search` carry `public` meta — service behavior is Tasks 6–8's coverage, don't duplicate it here.
- [ ] **Step 2:** Run `pnpm --filter @surffit/trpc test`. Expected: FAIL. Implement. Re-run: PASS including the completeness test.
- [ ] **Step 3:** Commit `feat(trpc): exercises and gyms routers`.

### Task 11: Moderation tRPC router

**Files:**
- Create: `packages/trpc/src/routers/moderation.ts`
- Modify: `packages/trpc/src/routers/index.ts`
- Test: extend `packages/trpc/src/routers.test.ts`

**Interfaces:**
- Produces (all **protected** — session-gated at the procedure, the moderator check is `moderateContentPolicy` inside the service, per the resource-level-ABAC rule; service per call from `ctx.db`):
  - `moderation.queue` — query, no input → `getQueue(userId)`.
  - `moderation.review` — mutation `{ subjectType: z.enum(["movement","exercise","gym"]), subjectId: z.string().min(1), decision: z.enum(["approve","reject"]), reason: z.string().trim().max(500).optional() }`.
  - `moderation.report` — mutation, input `reportCreateSchema` → `createReport(userId, input)`.
  - `moderation.reports` — query `{ status: z.enum(["open","reviewing","resolved","dismissed"]).default("open") }` → listReports.
  - `moderation.resolveReport` — mutation `{ reportId: z.string().min(1), resolution: z.enum(["resolved","dismissed"]) }`.
  - Registered in `appRouter` as `moderation`.
- Consumes: Task 9 service, Phase 2 bases.

- [ ] **Step 1:** Write failing caller tests: every moderation procedure rejects anonymous with UNAUTHORIZED; with a fabricated session and a real in-memory-backed service is overkill here — assert instead that `moderation.review` with decision `"delete"` → BAD_REQUEST (Zod) and that all five procedures carry `session` authz meta.
- [ ] **Step 2:** Run `pnpm --filter @surffit/trpc test`. Expected: FAIL. Implement. Re-run: PASS. `pnpm check-types` exit 0.
- [ ] **Step 3:** Commit `feat(trpc): moderation router`.

### Task 12: Web — exercise catalog pages + nav

**Files:**
- Create: `apps/web/src/app/exercises/page.tsx`, `apps/web/src/app/exercises/catalog-browser.tsx` (client), `apps/web/src/app/exercises/[slug]/page.tsx`
- Modify: `apps/web/src/lib/routes.ts`, `apps/web/src/components/site-header.tsx`

**Interfaces:**
- Produces:
  - routes.ts additions: `exercises: { path: ["exercises"], children: { movement: { path: [str("slug")] }, submit: { path: ["submit"] } } }`, `gyms: { path: ["gyms"], children: { gym: { path: [str("gymId")] }, new: { path: ["new"] } } }`, `moderation: { path: ["moderation"] }` (gyms/moderation consumed by Tasks 14–15; adding them once here keeps this the only routes edit).
  - site-header.tsx: a small nav (plain `Link`s styled muted-foreground) between the wordmark and the right side: "Exercises" → exercises route, "Gyms" → gyms route.
  - `/exercises` page (RSC): viewer from `auth()`; exercises service from the web `db` singleton; fetch `filters` (equipment + muscle groups) and initial `listMovements` with locale `"en"` (the i18n wiring-point comment goes here, once); render `<CatalogBrowser filters={…} initialMovements={…} />`.
  - catalog-browser.tsx (client): search `Input` (debounced ~300 ms), `Select`s for muscle group / equipment / difficulty (each with an "All" empty option), and a "Submit an exercise" `Button` linking to the submit route. Trimmed query length ≥ 2 → `exercises.search` (TanStack `placeholderData: keepPreviousData`), rendering exercise result `Card`s: name, equipment `Badge`, "Pending review" `Badge` when status ≠ approved, each linking to its movement page. Otherwise → `exercises.movements` with the selected filters (`initialData` from props when all filters are default), rendering movement `Card`s: name, difficulty `Badge`, equipment-slug `Badge`s, pending badge when applicable, link to the movement page. `Empty` component when nothing matches.
  - `/exercises/[slug]` page (RSC): `getMovementBySlug(viewer, "en", params.slug)` in try/catch — `NotFoundError` → `notFound()`, rethrow otherwise (profile-page idiom). Render: h1 name, status `Alert` when not approved ("Pending review" / "Rejected"), difficulty `Badge`, description paragraph when present, then one `Card` per variant: name, equipment `Badge`, "Unilateral" `Badge` when set, muscle `Badge`s (primary emphasized, e.g. default vs outline variant), description/instructions paragraphs when present, per-variant pending badge.
- Consumes: Tasks 6, 10; web `db` singleton; `@surffit/ui` primitives (all already present — card, badge, select, input, alert, empty, button, skeleton).

- [ ] **Step 1:** Implement routes + nav + the two pages per Interfaces.
- [ ] **Step 2:** Verify with dev stack (compose up, migrated, seeded): `/exercises` lists 37 seeded movements; muscle filter "Chest" narrows to the chest movements; typing "bench" switches to variant results; `/exercises/bench-press` shows four variants with muscles; `/exercises/nope` → 404. `pnpm build && pnpm check-types && pnpm lint` pass.
- [ ] **Step 3:** Commit `feat(web): exercise catalog with search and filters`.

### Task 13: Web — community submission forms

**Files:**
- Create: `apps/web/src/app/exercises/submit/page.tsx`, `apps/web/src/app/exercises/submit/submit-forms.tsx` (client)

**Interfaces:**
- Produces:
  - page.tsx (RSC): gate like the settings layout — no session → redirect signin, not onboarded → redirect onboarding. Server-fetch (locale `"en"`) the filter data plus `listMovements` (viewer-aware, so the submitter's own pending movements are selectable) and pass as props.
  - submit-forms.tsx (client): `Tabs` — **"New movement"** / **"New variant"**. Both forms follow the username-form idiom exactly (Field/FieldLabel/FieldError, tRPC mutation, i18nKey error extraction, sonner toast). Movement form: name `Input`, description `Textarea` with `{length}/2000` counter, difficulty `Select`; success → toast "Submitted for review", `router.push` to the returned movement page. Variant form: movement `Combobox` (options from props, client-filtered by name), equipment `Select`, difficulty `Select`, "Unilateral" `Switch`, primary muscle `Select`, secondary muscles as a `Checkbox` grid (max 5 — disable unchecked boxes at the cap, and disable the entry currently chosen as primary), optional name `Input` whose placeholder previews the generated default ("Movement (Equipment)"), description + instructions `Textarea`s; success → toast + push to the parent movement page. CONFLICT (`exercises.variant.exists` / `exercises.movement.exists`) toasts its i18nKey.
- Consumes: Tasks 10, 12 routes.

- [ ] **Step 1:** Build page + forms per Interfaces.
- [ ] **Step 2:** Verify in the dev stack signed in: submit a movement → redirected to its page showing the pending alert; it appears in the catalog for you (pending badge) but not in an incognito window; submit a variant against an official movement → appears on the movement page for you only; submitting the same variant again toasts the conflict. `pnpm build` passes.
- [ ] **Step 3:** Commit `feat(web): community submission forms`.

### Task 14: Web — gyms directory and management

**Files:**
- Create: `apps/web/src/app/gyms/page.tsx`, `apps/web/src/app/gyms/gyms-browser.tsx` (client), `apps/web/src/app/gyms/new/page.tsx`, `apps/web/src/app/gyms/new/gym-form.tsx` (client), `apps/web/src/app/gyms/[gymId]/page.tsx`, `apps/web/src/app/gyms/[gymId]/gym-actions.tsx` (client), `apps/web/src/app/gyms/[gymId]/gym-manage.tsx` (client)

**Interfaces:**
- Produces:
  - `/gyms` (RSC): viewer via `auth()`; server-fetch `searchGyms(viewer, {})` and — when signed in — `listMyGyms`; render a "My gyms" `Card` list (name, city, pending badge) above `<GymsBrowser initialGyms={…} />` plus an "Add your gym" `Button` → new-gym route.
  - gyms-browser.tsx (client): search `Input` (debounced, ≥ 2 chars triggers `gyms.search`, otherwise initialData); gym `Card`s: name, "city, COUNTRYCODE" line, member count, own-pending `Badge`, link to the gym page.
  - `/gyms/new` (RSC gate as Task 13) + gym-form.tsx (client): name, description (counter 2000), city, country code `Input` (maxLength 2, uppercased on change), address; submit → `gyms.create` → toast + push to the new gym's page.
  - `/gyms/[gymId]` (RSC): `getGymById(viewer, "en", params.gymId)` try/catch NotFoundError → `notFound()`. Render: h1 name, "city, COUNTRYCODE" + address, description, status `Alert` when not approved, member count, equipment list (`Item` rows: label, equipment name `Badge`, notes muted). Mount `<GymActions gymId isMember status />` and, when `isOwner`, `<GymManage gym equipmentOptions />` (equipment options server-fetched via `listEquipment("en")`).
  - gym-actions.tsx (client): signed-in viewer + approved gym → "Join gym" / "Leave gym" `Button` calling `gyms.join`/`gyms.leave`, toast + `router.refresh()`; hidden otherwise.
  - gym-manage.tsx (client): "Manage" section — edit form (same fields as create, initial values, Save → `gyms.update`); add-equipment row (equipment `Select` + label `Input` + notes `Input` → `gyms.addEquipment`); per-row remove `Button` → `gyms.removeEquipment`; all mutations toast + `router.refresh()`.
- Consumes: Tasks 8, 10, 12 routes.

- [ ] **Step 1:** Build the three pages + client components per Interfaces.
- [ ] **Step 2:** Verify in the dev stack: create a gym → its page shows the pending alert and no join button; the gym is invisible in an incognito search but visible under "My gyms"; approve it via SQL (`UPDATE gyms SET status='approved' WHERE id='…';` — the UI path arrives in Task 15) → join/leave works from a second account, member count updates; owner adds and removes equipment with names rendered. `pnpm build` passes.
- [ ] **Step 3:** Commit `feat(web): gyms directory and management`.

### Task 15: Web — report dialog + moderation queue

**Files:**
- Create: `apps/web/src/components/report-button.tsx` (client), `apps/web/src/app/moderation/page.tsx`, `apps/web/src/app/moderation/moderation-panels.tsx` (client)
- Modify: `apps/web/src/app/exercises/[slug]/page.tsx`, `apps/web/src/app/gyms/[gymId]/page.tsx`, `apps/web/src/app/u/[username]/page.tsx` (mount ReportButton)

**Interfaces:**
- Produces:
  - report-button.tsx: props `{ subjectType: "movement" | "exercise" | "gym" | "user"; subjectId: string }`; ghost `Button` "Report" opening a `Dialog`: reason `Select` (the five enum values with human labels), optional details `Textarea` (counter 1000), submit → `moderation.report`; success toast "Report submitted"; CONFLICT → toast "You already reported this". Rendered only for signed-in viewers (accept a `visible` boolean prop the RSC computes from session presence, or gate inside via a session prop — keep it a prop, the component stays dumb). Mounts: movement page header (subjectType `movement`), each variant card (subjectType `exercise`), gym page header (`gym`), public profile page when not `isOwner` (`user`).
  - `/moderation` page (RSC): no session → redirect signin. Build the moderation service; call `getQueue` and `listReports({ status: "open" })` in try/catch — `PermissionDeniedError` → `notFound()` (moderation surface stays invisible to non-moderators, comment it). Pass both to `<ModerationPanels initialQueue initialReports />`.
  - moderation-panels.tsx (client): `Tabs` — **Submissions** / **Reports**, both backed by tRPC queries with `initialData` and invalidated after every mutation. Submissions `Table`: subjectType `Badge`, name linking to the content (movement/exercise → `/exercises/<movementSlug>`, gym → `/gyms/<subjectId>`), owner username, submitted date, "Approve" `Button` → `moderation.review` decision approve, "Reject" `Button variant="destructive"` opening an `AlertDialog` with an optional reason `Textarea` → decision reject; `moderation.alreadyReviewed` CONFLICT toasts and refetches. Reports `Table`: subject label + type badge, reason `Badge`, details (truncated, full text in a `Tooltip` or title attr), reporter, created date, "Resolve" and "Dismiss" `Button`s → `moderation.resolveReport`. `Empty` states per tab.
- Consumes: Tasks 9, 11, 12 routes.

- [ ] **Step 1:** Build the component + pages per Interfaces and mount ReportButton on the three content pages.
- [ ] **Step 2:** Verify in the dev stack: grant yourself moderator — `docker compose -f docker/docker-compose.dev.yml exec postgres psql -U surffit -d surffit -c "INSERT INTO user_roles (user_id, role) SELECT id, 'moderator' FROM users WHERE username = '<you>';"` — then: `/moderation` 404s for a plain account and renders for you; the Task 13 pending submissions appear in the queue; approving the movement makes it visible in an incognito catalog; rejecting a variant removes it from public view but not from the owner's; reporting a gym from the second account shows up under Reports and resolves; the worker log shows `content.moderated` and `report.created` arriving at the `system` group (end-to-end outbox proof for the phase).
- [ ] **Step 3:** `pnpm build && pnpm check-types && pnpm lint` pass. Commit `feat(web): reporting and moderation queue`.

### Task 16: Documentation sync

**Files:**
- Modify: `CLAUDE.md`, `README.md` (only if commands changed — expected: no), `.env.example` (verify only — no new vars expected)

**Interfaces:**
- Produces, in `CLAUDE.md` (keep total under ~140 lines):
  - "Where things live": `packages/core` entry gains `exercises/` (movement→variant catalog, community submissions, FTS reads), `gyms/` (directory, equipment, membership), `moderation/` (reports + approval queue — the one module whose repository owns other modules' status transitions, by design); `packages/validation` note gains exercise/gym/report schemas.
  - New how-to lines in the existing style: **Add reviewable community content:** insert with status `pending` + emit `content.submitted`; only the moderation module flips status. **Add translated content:** sibling `*_translations` table, canonical `en` row written in the same tx, reads take a `locale` with EN fallback in the repository query.
  - Conventions: update "Translation tables with EN fallback and kg-canonical units arrive in a later phase" → translation tables with EN fallback are live (exercises/equipment/muscle groups); kg-canonical units arrive with workouts (Phase 4). Add: `pnpm db:seed` seeds the EN/DE exercise catalog and is idempotent. Add: FTS = generated `tsvector` (simple config) + GIN, queried only in repositories.
- Consumes: everything above.

- [ ] **Step 1:** Update `CLAUDE.md`; cross-check every referenced command/path still exists (fix whichever side is wrong). Confirm `.env.example` still matches `loadEnv` var-for-var.
- [ ] **Step 2:** `pnpm lint` passes. Commit `docs: update agent guide for phase 3 fitness content`.

---

## Execution Notes for the Implementer

- Do not dispatch a final whole-branch code-review subagent after the last task unless the user explicitly asks for one — they run their own review once the project is done.
- Task order is dependency order; do not reorder. Tasks 6/7 (locale fallback + submissions) and 9 (moderation claim pipeline) are the architectural heart — reread spec §4.1/§4.3/§4.11 and the gdpr claim idiom before improvising there.
- The Phase 1 + 2 Execution Notes still apply (Docker required for integration tests; prefer current official tool flows; never touch `components/ui` by hand; never npm/yarn; never `console.log` — the db seed CLI's `console` is the sole precedented exception).
- Generated tsvector columns and `nullsNotDistinct` are the two places drizzle-kit is most likely to emit imperfect SQL — always read the generated migration before applying, and hand-edit the SQL (not the schema file) if needed.
- Moderator role granting has no UI until Phase 8 — use the SQL insert from Task 15 Step 2 for all manual verification.
- Discord-credential-dependent manual verifications: same protocol as before — if creds are unavailable, mark the substep for the user and verify via build/typecheck/tests instead. Two accounts are needed for the join/report flows; a second browser profile works.
- All web reads pass locale `"en"` — resist wiring `users.locale` through; that plumbing belongs to the i18n phase and the wiring-point comments mark every touchpoint.

## Verification (whole phase)

1. `pnpm lint && pnpm check-types && pnpm test && pnpm test:integration && pnpm build` — all green.
2. Catalog flow: compose up → migrate → seed (twice, idempotent) → `/exercises` browses and searches 37 movements with filters; German data proven by the locale-fallback integration tests.
3. Community flow: signed-in user submits a movement + variant → visible only to them (pending badges) → moderator approves via `/moderation` → visible in an incognito window; rejection keeps content owner-only.
4. Gyms flow: create (pending) → approve → second account joins/leaves, owner manages equipment; pending gyms invisible to strangers in search and by direct URL.
5. Reports flow: second account reports content → moderator sees, resolves; duplicate report by the same user conflicts.
6. Events: worker logs show `content.submitted`, `content.moderated`, and `report.created` flowing outbox → RabbitMQ → `system` group.

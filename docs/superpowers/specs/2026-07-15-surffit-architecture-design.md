# SurfFit — Architecture Blueprint

**Status:** Approved design (brainstorming session 2026-07-15)
**Scope of this document:** Master architecture blueprint — system architecture, monorepo/package structure, database schema proposal, technical decisions with rationale, and implementation roadmap. This document is the north star for all subsequent per-phase specs and implementation plans. No implementation accompanies this document; each roadmap phase gets its own spec → plan → implementation cycle.

---

## 1. Product Summary

SurfFit is an open-source fitness platform: strength training, workout tracking, training plans with GitHub-style forking, progression analytics, social features, and gamification. Inspired by Hevy/Strong (tracking), Strava (social), and Linear/Vercel (product polish). Brand: "Surf" ecosystem naming, beaver mascot, dark-mode-first premium UI.

### Constraints established during design

| Constraint | Decision |
| --- | --- |
| Delivery model | Blueprint first; implementation happens phase-by-phase in later sessions, each with its own spec and plan |
| Deployment target | Coolify (self-hosted Docker). One image per process; Postgres/RabbitMQ/Redis/MinIO as attached services. No serverless assumptions anywhere |
| Scaling model | Worker processes are queue-selectable: the same worker image can be deployed multiple times with different `WORKER_QUEUES` values to scale domains (e.g. achievements) independently |
| Offline behavior | The active workout session must survive connection loss (local persistence + sync). All other actions (comments, likes, etc.) are disabled while offline |
| i18n | English is the base locale; German ships at launch. Exercise/achievement content is translatable at the database level via `*_translations` tables |
| Operation | An official hosted instance operated by the maintainer + self-hosting for anyone. GDPR, data export, and moderation are launch requirements, not future work |
| Auth | OAuth only (Discord first), no passwords. Username claimed on first login |
| Messaging | RabbitMQ is the broker for all cross-process messaging (domain events, worker queues, realtime fan-out); Redis is scoped to caching and rate limiting (revised 2026-07-15, was BullMQ/Redis) |
| Social graph | Asymmetric follows only — no friendship system; follow requests gate non-public profiles; blocking via user_blocks (revised 2026-07-15, was friendships + prepared follows) |
| UI components | shadcn/ui base components are always added via the shadcn CLI (`pnpm dlx shadcn@latest add <component>`), never written by hand or guessed |
| Package manager | pnpm exclusively, enforced by tooling (`packageManager` field, preinstall guard, CI lockfile check) |
| Agent onboarding | A root `CLAUDE.md` tells AI coding agents how to work in this repository; kept in sync with conventions |

---

## 2. System Architecture

### 2.1 Runtime topology

Three deployable units, each its own Docker image:

```text
┌─────────────┐     tRPC / SSE      ┌──────────────────────────┐
│   Browser    │ ◄─────────────────► │  web (Next.js standalone) │
│  (PWA-ready) │                     │  UI + tRPC + Auth.js      │
└─────────────┘                     └───────────┬──────────────┘
                                                │ services (packages/core)
                ┌─────────────────┬─────────────┼───────────────┐
                ▼                 ▼             ▼               ▼
          ┌──────────┐     ┌────────────┐ ┌──────────┐   ┌───────────┐
          │ Postgres  │     │  RabbitMQ  │ │  Redis   │   │ MinIO/S3  │
          │ + outbox  │     │ exchanges  │ │ (cache)  │   └───────────┘
          └─────┬────┘     │ + queues   │ └──────────┘
                │          └──┬─────▲───┘
    outbox rows │     consume │     │ publish (relay, confirms)
                ▼             ▼     │
          ┌───────────────────┴─────────────────────┐
          │ worker (Node, queue-selectable)          │
          │ relay · cron · achievements · feed       │
          │ notifications · emails · stats · exports │
          └──────────────────────────────────────────┘
```

- **`web`** — Next.js App Router, `output: "standalone"`. Hosts the UI, the tRPC API (route handler), Auth.js, and the SSE endpoint for realtime updates. Server Components for read-heavy pages; all mutations via tRPC procedures. Server Actions are permitted only as thin wrappers that call the same `core` services.
- **`worker`** — plain Node process consuming RabbitMQ queues via amqplib. Its entrypoint reads `WORKER_QUEUES` (comma-separated, default: all) and subscribes only to those queues. Deploying the same image with `WORKER_QUEUES=achievements` yields a dedicated achievements service with zero code changes. The worker also hosts the outbox relay (safe to run in every instance — rows are claimed with `FOR UPDATE SKIP LOCKED`) and a small cron scheduler that publishes time-based messages (export expiry, deletion-grace processing), since RabbitMQ has no native scheduling. All consumers import the same `packages/core` services as `web`.
- **`migrator`** — one-shot container (same base image) that runs Drizzle migrations; executed as a pre-deploy step in Coolify. The database schema is owned exclusively by `packages/db` migrations; all processes deploy from the same version, so no schema drift is possible between "services."

### 2.2 Layering

```text
React (Server + Client Components)
   ↓
tRPC procedures        — auth check, Zod input validation, policy check, service call. NOTHING else
   ↓
core services          — ALL business logic; emits domain events; throws typed domain errors
   ↓
core repositories      — the only layer containing SQL/Drizzle query code
   ↓
Drizzle → PostgreSQL
```

Rules: no business logic in React components or tRPC procedures; no Drizzle imports outside repositories; no cross-domain service calls (cross-domain effects go through events).

### 2.3 Event backbone — transactional outbox

Every domain side effect (achievement checks, feed entries, notifications, stat updates, cache invalidation) flows through one mechanism:

1. A service commits its state change **and** an `outbox_events` row in the same transaction.
2. A relay (small loop in the worker, concurrency-safe via `FOR UPDATE SKIP LOCKED`) polls undispatched outbox rows and publishes them to the durable topic exchange `surffit.events`, routing key = event type, waiting for publisher confirms before marking rows dispatched (at-least-once delivery).
3. Each consumer group (achievements, feed, notifications, emails, stats, exports) owns a durable queue bound to the exchange with the routing patterns it cares about. Consumers process events idempotently (dedup on event id); failures route through a per-queue dead-letter exchange into TTL-based retry queues (10s → 1m → 10m); messages that exhaust retries are parked in a `.dead` queue for admin inspection.

Event payloads are versioned Zod schemas defined in `core/events`. This is what makes the queue-selectable worker model safe: consumers never call each other, they only react to events.

Example flow — user completes a workout: `workouts.service` commits the session + `workout.completed` event → relay → RabbitMQ (`surffit.events`, routing key `workout.completed`) → consumers: `gamification` (evaluate achievements, grant XP → may emit `achievement.unlocked`), `feed` (create activity), `analytics` (update user stats), `notifications` (notify followers per preferences).

### 2.4 Realtime

In-app notifications and feed freshness use **SSE** from `web`, driven by a RabbitMQ fanout exchange `surffit.realtime`: workers publish user-scoped realtime messages, and each `web` instance binds an exclusive auto-delete queue and forwards messages to its connected SSE clients. Clients fall back to polling. WebSockets are deliberately deferred until a feature needs bidirectional traffic.

### 2.5 Offline workout session

- Workout sessions, exercises, and sets use **client-generated UUIDv7** ids.
- The active session lives in a Zustand store persisted to **IndexedDB**; every set logged is durable on-device immediately.
- A mutation queue syncs to the server via **idempotent upserts** (the client-generated ids are the idempotency keys); retries with backoff on reconnect. Conflict resolution is last-write-wins per entity id — acceptable because in practice a single device drives an active session; the blueprint does not attempt multi-device concurrent editing.
- A global connectivity flag gates all non-workout mutations: when offline, social/plan/profile actions render disabled with an offline indicator. Finishing a workout offline is allowed; completion syncs (and triggers its events) when connectivity returns.

---

## 3. Monorepo & Package Structure

**Approach (chosen over a maximal 18-package split):** infrastructure gets real packages; all domain logic lives in `packages/core` as strictly-bounded modules. Boundaries are enforced by lint rules, not package.json files, until a module earns promotion.

```text
surffit/
  apps/
    web/                    # Next.js — UI, tRPC host, Auth.js, SSE
    worker/                 # RabbitMQ consumers + outbox relay, queue-selectable entrypoint
    docs/                   # Fumadocs documentation site
  packages/
    core/                   # ALL domain logic (see modules below)
    db/                     # Drizzle schema, migrations, client — sole schema owner
    ui/                     # shadcn/ui base + domain components
    trpc/                   # routers, procedures, context, error formatter
    auth/                   # Auth.js config, provider registry, session helpers
    validation/             # shared Zod schemas + shared TypeScript types
    i18n/                   # locale infra, EN + DE catalogs, formatting helpers
    config/                 # shared tsconfig, Biome, Tailwind presets
  tooling/                  # repo scripts, seed/codegen, CI helpers
  docker/                   # Dockerfiles, compose files, monitoring profile
  docs/                     # architecture docs, ADRs, superpowers specs
  CLAUDE.md                 # agent onboarding: how AI coding agents work in this repo
```

### 3.1 `packages/core` modules

Each module: `service.ts` / `repository.ts` / `events.ts` / `policies.ts` / `index.ts` (public API — the only import surface other modules may use).

Domain modules: `identity`, `exercises`, `gyms`, `plans`, `workouts`, `progression`, `body-tracking`, `social`, `feed`, `notifications`, `gamification`, `moderation`, `analytics`.

Infrastructure ports (interface + env-selected implementation): `storage` (S3-compatible / local), `email` (console / SMTP / Resend), `search` (Postgres FTS / Meilisearch), `messaging` (RabbitMQ: topology assertion, publish with confirms, consumer runtime), `flags` (feature flags), `events` (outbox + event schemas), `errors` (typed domain errors), `logger` (Pino).

**Import rules (lint-enforced):** modules import other modules only via their `index.ts`; `apps/*` import only `core` public APIs, `ui`, `trpc`, `auth`, `validation`, `i18n`; nothing imports `db` except `core` repositories and the migrator.

**Promotion rule (documented in CONTRIBUTING.md):** a `core` module is promoted to a standalone package when it gains a second consumer with independent versioning needs (e.g. the future mobile app) or a genuine standalone use case. Package boundaries are cheap to add, expensive to remove.

### 3.2 `packages/ui`

shadcn/ui + Radix as the foundation (components vendored per shadcn convention), Tailwind CSS, Lucide icons, Framer Motion for animation, Recharts for charts.

**shadcn CLI rule (binding for humans and AI agents):** base components are always added via the shadcn CLI — `pnpm dlx shadcn@latest add <component>` — never written by hand, guessed from memory, or copied from documentation snippets. Customization happens through the theme (CSS variables/Tailwind tokens) and by composing domain components on top; a hand-authored file posing as a shadcn primitive is a review blocker. Domain components built on top: `WorkoutCard`, `ExerciseCard`, `ProgressChart`, `MuscleGroupCard`, `AchievementCard`, `GymCard`, `UserProfileCard`, `RestTimer`, `SetInputRow`, `CalendarHeatmap`. Dark mode first; both themes required for every component.

### 3.3 Agent onboarding — root `CLAUDE.md`

The repository root carries a `CLAUDE.md` written for AI coding agents (and useful to humans), created in Phase 1 and updated whenever conventions change. Required content:

- Commands: dev stack up (`docker compose -f docker/docker-compose.dev.yml up`), `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm db:migrate`, `pnpm db:seed` — pnpm only, never npm/yarn.
- The layering rules (§2.2) and import rules (§3.1) in checklist form: business logic only in `core` services, SQL only in repositories, cross-domain effects only via events.
- The shadcn CLI rule (§3.2): add base components via `pnpm dlx shadcn@latest add`, never hand-write them.
- Where things live: which `core` module owns which feature, how to add a tRPC procedure, how to add a migration, how to define a new event (versioned Zod schema + consumer queue binding).
- Conventions: kg-canonical units, translation tables with EN fallback, UUIDv7 client-generated ids for workout entities, soft-delete semantics, Conventional Commits.

---

## 4. Database Schema Proposal

### 4.1 Conventions

- **UUIDv7** primary keys everywhere (time-ordered → good B-tree locality; client-generatable for offline entities).
- `created_at` / `updated_at` (timestamptz, UTC) on every table; **soft delete** via `deleted_at` except where GDPR requires hard deletion.
- All weights stored **canonically in kg** (numeric(7,2)); display conversion per user preference. Heights in cm, distances in m, durations in seconds.
- Translatable content uses sibling `*_translations` tables keyed `(entity_id, locale)` with a required `en` row as canonical fallback.
- Enums as Postgres enums where the set is closed by design (`visibility`, `set_type`), lookup tables where community extension is expected (`equipment`, `muscle_groups`).
- Polymorphic references (`subject_type` + `subject_id`) only in cross-cutting tables: `reactions`, `comments`, `reports`, `audit_log`, `activities`.
- Generated `tsvector` columns on searchable translation tables (exercises, plans, gyms, users) for Postgres FTS at launch.

Common column shorthand below: `id` = uuid pk v7, `ts` = created_at/updated_at, `soft` = deleted_at.

### 4.2 Identity & access

- **users** — id, username (citext, unique), display_name, email (citext, unique), avatar_key (storage ref), biography, locale (default 'en'), onboarded_at (null until username claimed), anonymized_at, ts, soft
- **accounts** — Auth.js OAuth accounts: id, user_id fk, provider, provider_account_id (unique per provider), token fields, ts
- **sessions** — Auth.js: id, user_id fk, session_token unique, expires
- **user_preferences** — user_id pk/fk, unit_system ('metric'|'imperial'), theme, first_weekday, default_gym_id, default_rest_seconds, ts
- **privacy_settings** — user_id pk/fk, profile_visibility ('public'|'followers'|'private'), show_statistics bool, show_achievements bool, show_workouts bool, show_body_metrics bool (default false), ts. Non-public profiles are follow-request-gated (§4.8)
- **user_roles** — user_id fk, role ('user'|'moderator'|'admin'|'super_admin'), granted_by fk, granted_at; pk (user_id, role)
- **user_consents** — id, user_id fk, consent_type, policy_version, granted_at, revoked_at

### 4.3 Exercise content

Two-level model matching the UX ("Bench Press" → barbell/dumbbell/machine/smith):

- **movements** — id, slug unique, difficulty ('beginner'|'intermediate'|'advanced'), owner_user_id fk null (null = official), status ('draft'|'pending'|'approved'|'rejected'), ts, soft
- **movement_translations** — movement_id fk, locale, name, description; pk (movement_id, locale)
- **equipment** — id, slug unique ('barbell', 'dumbbell', 'machine', 'cable', 'smith_machine', 'kettlebell', 'resistance_band', 'bodyweight'), ts
- **equipment_translations** — equipment_id, locale, name
- **exercises** — id, movement_id fk, equipment_id fk, difficulty, owner_user_id fk null, status (as movements), is_unilateral bool, ts, soft; unique (movement_id, equipment_id, owner_user_id) NULLS NOT DISTINCT — official exercises have owner NULL, and without NULLS NOT DISTINCT Postgres would allow duplicate official variants
- **exercise_translations** — exercise_id, locale, name, description, instructions (markdown), search tsvector generated; pk (exercise_id, locale)
- **muscle_groups** — id, slug unique, body_region ('upper'|'lower'|'core')
- **muscle_group_translations** — muscle_group_id, locale, name
- **exercise_muscles** — exercise_id fk, muscle_group_id fk, role ('primary'|'secondary'); pk (exercise_id, muscle_group_id)
- **exercise_media** — id, exercise_id fk, kind ('image'|'video'), storage_key, position, ts (video rows prepared, upload deferred)

Community-created movements/exercises enter with status 'pending' and become visible to others only when 'approved' (visible to the creator immediately).

### 4.4 Gyms

- **gyms** — id, name, description, city, country_code, address, owner_user_id fk, status ('pending'|'approved'|'rejected'), ts, soft. No translations table — gym names are proper nouns
- **gym_equipment** — id, gym_id fk, equipment_id fk, label (e.g. "Chest Press Machine"), notes, ts
- **gym_members** — gym_id fk, user_id fk, joined_at; pk (gym_id, user_id)

Exercises available at a gym are derived: exercises whose equipment_id appears in the gym's equipment.

### 4.5 Training plans

GitHub-style: a plan is the mutable container; versions are immutable snapshots; forks reference the exact version they came from.

- **plans** — id, owner_user_id fk, name, description, visibility ('public'|'followers'|'private'), current_version_id fk null, forked_from_plan_id fk null, forked_from_version_id fk null, fork_count int default 0, ts, soft
- **plan_versions** — id, plan_id fk, version_number int, changelog, created_at (immutable after creation); unique (plan_id, version_number)
- **plan_days** — id, plan_version_id fk, position, name ("Push Day"), description
- **plan_day_exercises** — id, plan_day_id fk, exercise_id fk, position, superset_group smallint null (same value = same superset), notes
- **set_schemes** — id, plan_day_exercise_id fk, position, set_type ('normal'|'warmup'|'dropset'|'amrap'), target_reps_min, target_reps_max, target_weight_kg null, target_rpe numeric(3,1) null, target_rir smallint null, tempo varchar(7) null ("3-1-2-0"), rest_seconds

Editing a plan creates a draft that becomes a new immutable version on save. Copying = forking with lineage recorded.

### 4.6 Workouts

- **workout_sessions** — id (client-generated), user_id fk, plan_version_id fk null, plan_day_id fk null, gym_id fk null, title, notes, started_at, completed_at null, ts, soft
- **workout_exercises** — id (client-generated), session_id fk, exercise_id fk, position, superset_group, notes
- **workout_sets** — id (client-generated), workout_exercise_id fk, position, set_type, weight_kg numeric(7,2), reps smallint, rpe numeric(3,1) null, rir smallint null, is_completed bool, completed_at
- **personal_records** — id, user_id fk, exercise_id fk, record_type ('max_weight'|'max_reps_at_weight'|'max_session_volume'|'estimated_1rm'), value numeric, workout_set_id fk null, achieved_at; current PR = latest row per (user, exercise, type)

Offline sync: the server upserts sessions/exercises/sets by client-generated id (idempotent); `workout.completed` events are emitted only on the transition to completed.

### 4.7 Body tracking

- **body_metrics** — id, user_id fk, metric_type text (extensible set validated by Zod in application code, NOT a DB enum: 'weight', 'body_fat_pct', 'height', 'muscle_mass', 'water_pct', 'calories', 'steps', 'sleep_minutes', 'resting_heart_rate', plus girth measurements 'girth_chest', 'girth_waist', 'girth_hips', 'girth_biceps_l/r', 'girth_thigh_l/r'), value numeric(10,2), recorded_at, source ('manual'|'apple_health'|'samsung_health'|'garmin'|'fitbit'), external_id null (dedup key for imports), ts; unique (user_id, metric_type, source, external_id)

One narrow time-series table: new metric types and health-platform imports require no migrations.

### 4.8 Social

- **follows** — follower_id fk, followee_id fk, status ('accepted'|'pending'), requested_at, accepted_at null; pk (follower_id, followee_id). The only social graph — there is no friendship system. Following a public profile is auto-accepted; following a non-public profile creates a 'pending' follow request the followee approves or declines (decline = row deleted)
- **user_blocks** — blocker_id fk, blocked_id fk, created_at; pk (blocker_id, blocked_id). Blocking deletes follow edges in both directions, prevents new ones, and hides all content and interactions between the two users (replaces the 'blocked' status the removed friendships table carried)
- **activities** — id, actor_user_id fk, verb ('workout.completed'|'pr.achieved'|'plan.published'|'plan.forked'|'achievement.unlocked'), object_type, object_id, visibility (copied from actor's settings at write time), metadata jsonb (denormalized display payload), created_at, soft
- **reactions** — id, user_id fk, subject_type ('activity'|'comment'), subject_id, kind ('like'), ts; unique (user_id, subject_type, subject_id, kind)
- **comments** — id, author_user_id fk, subject_type ('activity'|'plan'), subject_id, body, edited_at, ts, soft
- **mentions** — id, comment_id fk, mentioned_user_id fk, ts

Feed = fan-out-on-read (query followed users' activities, Redis-cached) at launch scale; the outbox architecture makes a move to fan-out-on-write a consumer-side change only.

### 4.9 Notifications

- **notifications** — id, recipient_user_id fk, type text (extensible set validated by Zod, not a DB enum: 'follow.new', 'follow.request', 'follow.accepted', 'reaction', 'comment', 'mention', 'achievement', 'system'), payload jsonb (typed per notification type via Zod), read_at null, created_at
- **notification_preferences** — user_id fk, type, channel ('in_app'|'email'|'push'), enabled bool; pk (user_id, type, channel); push rows prepared, delivery deferred

### 4.10 Gamification

- **achievement_definitions** — id, slug unique, category ('milestone'|'strength'|'volume'|'streak'|'social'), criteria jsonb (declarative rule evaluated by the worker, e.g. `{"metric":"workout_count","gte":10}`), xp_reward int, icon, is_active, is_secret bool, ts
- **achievement_translations** — achievement_id, locale, name, description
- **user_achievements** — user_id fk, achievement_id fk, unlocked_at, progress jsonb null; pk (user_id, achievement_id)
- **xp_transactions** — id, user_id fk, amount int, reason, source_type, source_id, created_at (append-only ledger)
- **user_stats** — user_id pk/fk, xp_total, level, workout_count, total_volume_kg, streak_current, streak_longest, last_workout_at, ts (materialized by the analytics worker from events; rebuildable from source tables)
- **badges** — id, slug ('early_adopter'|'contributor'|'verified_coach'|'moderator'), + translations table
- **user_badges** — user_id fk, badge_id fk, awarded_by fk null, awarded_at; pk (user_id, badge_id)

No GitHub PR statistics anywhere, per product requirements.

### 4.11 Moderation & admin

- **reports** — id, reporter_user_id fk, subject_type ('exercise'|'movement'|'plan'|'comment'|'activity'|'user'|'gym'), subject_id, reason ('spam'|'inappropriate'|'incorrect'|'copyright'|'other'), details, status ('open'|'reviewing'|'resolved'|'dismissed'), resolved_by fk null, resolved_at, ts
- **moderation_actions** — id, moderator_user_id fk, action ('approve'|'reject'|'remove'|'warn'|'suspend'|'restore'), subject_type, subject_id, report_id fk null, reason, ts
- **audit_log** — id, actor_user_id fk null, action, subject_type, subject_id, metadata jsonb, created_at (append-only; all admin/moderator actions and sensitive user actions)

### 4.12 Platform infrastructure

- **outbox_events** — id, event_type, schema_version smallint, payload jsonb, occurred_at, dispatched_at null, attempts smallint; index on (dispatched_at) where null
- **feature_flags** — id, key unique, description, enabled_default bool, rules jsonb null (e.g. percentage rollout), ts
- **feature_flag_overrides** — flag_id fk, user_id fk, enabled bool; pk (flag_id, user_id)
- **data_export_requests** — id, user_id fk, status ('pending'|'processing'|'ready'|'expired'|'failed'), storage_key null, requested_at, completed_at, expires_at
- **account_deletion_requests** — id, user_id fk, requested_at, scheduled_for (grace period), status ('pending'|'cancelled'|'completed')

---

## 5. Technical Decisions & Rationale

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | Coolify/Docker as the design center; no serverless | User's deployment target. Long-running processes make RabbitMQ consumers, SSE, and the outbox relay straightforward; self-hosting stays honest |
| 2 | Modular core over maximal package split | 18 upfront packages = ceremony tax and cross-package churn while the domain is still moving. Lint-enforced module boundaries + a documented promotion rule preserve the same discipline at lower cost |
| 3 | Transactional outbox + RabbitMQ for all side effects | Guarantees no lost side effects on crash (outbox row commits with the state change; relay publishes with confirms = at-least-once); decouples domains; enables the queue-selectable worker scaling model |
| 4 | Queue-selectable worker image | Microservice-style independent scaling ("deploy achievements separately") without shared-DB microservice drift — one schema owner, one image version |
| 5 | tRPC internal; public REST API later as a separate versioned layer | End-to-end types now; public contract stability later without freezing internal APIs |
| 6 | Auth.js v5, OAuth-only, Discord first, provider registry | Per requirements; registry makes adding Google/Apple/GitHub a config change |
| 7 | ABAC as code (`can(actor, action, resource, context)`), roles as data | Policies need context (ownership, visibility, report status) that role checks can't express; code policies are testable |
| 8 | UUIDv7 PKs | Time-ordered (index locality) + client-generatable (offline workout entities) |
| 9 | Two-level exercise model (movements → exercises per equipment) | Matches the selection UX exactly; keeps history per equipment variant while grouping progress per movement |
| 10 | `*_translations` tables with EN canonical | DB-level content translation (EN+DE at launch, community locales later) without schema changes |
| 11 | Canonical kg storage | One unit in the DB; conversion is a display concern driven by user preference |
| 12 | Immutable plan versions + fork lineage | Forking/copying/versioning semantics identical to the product requirement; history can never be rewritten under a fork |
| 13 | Narrow time-series `body_metrics` | New metrics and integration imports without migrations; natural fit for charts |
| 14 | Fan-out-on-read feed + Redis cache | Right for launch scale; outbox makes fan-out-on-write a later consumer change, not a rewrite |
| 15 | Offline scope = active workout session only | User constraint; keeps the sync surface to idempotent upserts, avoiding a general sync engine |
| 16 | Zustand + IndexedDB for live session; TanStack Query for server state | Smallest state footprint that satisfies offline durability |
| 17 | pnpm + Turborepo, pnpm enforced | Standard, fast, well-understood monorepo toolchain. pnpm is the only permitted package manager: `packageManager` field, a preinstall `only-allow pnpm` guard, and CI installs with `--frozen-lockfile` so npm/yarn artifacts can't creep in |
| 18 | Biome (lint + format) | One fast tool instead of ESLint+Prettier config sprawl; per prompt's "Biome or ESLint" |
| 19 | Postgres FTS at launch, Meilisearch behind `SearchProvider` | No extra infra until search quality demands it |
| 20 | Recharts | Per requirements; wrapped in `ui` chart components so a swap stays contained |
| 21 | Pino + OpenTelemetry + Prometheus metrics; optional Grafana compose profile; Sentry-compatible errors behind env flag | Free/open-source observability; hosted instance gets full stack, self-hosters opt in |
| 22 | DB-backed feature flags | No third-party dependency; per-user overrides enable beta programs |
| 23 | GDPR: export via worker job; deletion = anonymize user + hard-delete personal data + pseudonymize community content; consent as data | Official hosted instance makes this a legal launch requirement |
| 24 | Progression engine as `ProgressionStrategy` interface, deterministic double-progression rule first | Useful now; clean seam for future AI assistance |
| 25 | Health integrations as `HealthProvider` interface only, no adapters at launch | Per requirements: abstractions now, integrations later |
| 26 | Fumadocs for `apps/docs` | Modern Next.js-native docs; consistent stack |
| 27 | RabbitMQ over Redis-backed queues (revises the original BullMQ choice) | Real broker semantics: durable topic exchanges give the queue-selectable consumer-group model natively (bind patterns instead of code-level routing); publisher confirms + acks + DLX retry chains are first-class; management UI aids self-hosters; scales to genuinely separate services later. Redis stays for what it's best at: caching and rate limiting |
| 28 | shadcn components only via the shadcn CLI | Generated components match the installed shadcn/Tailwind/Radix versions exactly; hand-written or from-memory components drift from upstream, break theming, and are unreviewable against a known baseline |
| 29 | Root `CLAUDE.md` for AI coding agents | AI agents are expected contributors. One canonical, in-repo statement of commands, layering/import rules, and conventions (§3.3) keeps agent contributions consistent with the architecture; updated in the same PR as any convention change |
| 30 | Asymmetric follows only — no friendship system (revises the original friends + prepared-follows design) | One social graph instead of two; 'followers' visibility replaces 'friends' everywhere. Follow requests gate non-public profiles so followers-only content keeps real privacy semantics; a dedicated user_blocks table preserves blocking, which the friendships table previously carried |

---

## 6. Error Handling

- `core/errors` defines typed domain errors: `NotFoundError`, `PermissionDeniedError`, `ConflictError`, `RateLimitedError`, `DomainRuleViolationError`, each carrying an i18n message key + params.
- Services throw domain errors; the tRPC error formatter maps them to tRPC codes once; clients render localized messages from keys. Unexpected errors are logged with request context and surface as a generic localized failure.
- Zod at every boundary: tRPC inputs, environment config (validated at boot, fail-fast), outbox event payloads (versioned schemas).
- Worker consumers: idempotent (event-id dedup); failures nack into per-queue TTL retry queues via dead-letter exchanges (10s → 1m → 10m); exhausted messages park in `.dead` queues (admin-visible in Phase 8).
- Client: route-segment error boundaries; offline mutation queue retries with backoff; non-workout mutations disabled while offline.

## 7. Testing Strategy

- **Vitest** everywhere. `core` services unit-tested against in-memory repository fakes (repository interfaces make this cheap).
- Repositories + migrations integration-tested against real Postgres via **Testcontainers**; the messaging port (outbox relay, publish/consume, retry chain) integration-tested against a Testcontainers RabbitMQ.
- tRPC procedures tested through `createCaller` with fabricated sessions — this is where ABAC policies are verified.
- `ui` components: React Testing Library where behavior warrants (timers, set input, offline gating).
- **Playwright** configured from Phase 1; first reserved journeys: (a) OAuth signup → username claim, (b) full live-workout session including an offline gap.
- CI (GitHub Actions) on every PR: typecheck → Biome → tests → build. Renovate for dependency updates; Changesets for versioning.

## 8. Security & Privacy

- OAuth only; sessions via Auth.js secure cookies. CSRF per Auth.js defaults; tRPC mutations require session.
- Every procedure passes through an ABAC policy — default-deny for unannotated procedures.
- Rate limiting (Redis token bucket) on mutation procedures and auth endpoints.
- Privacy settings enforced in repositories/services (visibility filters in queries), not in the UI layer.
- Uploads: size/type validation, image re-encoding (strip EXIF), served via storage provider signed URLs.
- GDPR: consent records, export job, deletion pipeline with grace period (§4.12, decision #23).

## 9. Infrastructure & Deployment

- **Images:** `web` (Next standalone), `worker`, `migrator` — built by GitHub Actions, published to GHCR, deployed by Coolify.
- **docker-compose.dev.yml:** Postgres, RabbitMQ (management plugin enabled — UI on :15672), Redis, MinIO, Mailpit (dev SMTP sink for the email provider). App processes run via `pnpm dev` locally.
- **docker-compose.prod.yml:** reference self-hosting stack mirroring the Coolify layout; optional `monitoring` profile with Prometheus + Grafana (provisioned dashboards).
- Config via environment variables only, validated at boot; `.env.example` is the canonical reference.
- Health endpoints (`/healthz`, `/readyz`) on web and worker for Coolify health checks.

## 10. Implementation Roadmap

Each phase ends deployable and gets its own spec → plan → implementation cycle. Moderation moves earlier than in the original prompt because community exercises (Phase 3) must not ship without reporting/approval.

| Phase | Scope | Key deliverables |
| --- | --- | --- |
| 1. Foundation | Repo, tooling, infra, auth | Turborepo + pnpm + Biome + CI; Docker images + compose; `db` with initial identity schema + migrator; Auth.js + Discord + username onboarding; outbox + RabbitMQ skeleton (topology assertion, relay, DLX retry chain); logger; health endpoints; root `CLAUDE.md` (§3.3) |
| 2. User system | Identity domain | Profiles, preferences, privacy settings, ABAC engine + policies, avatar upload (storage provider), GDPR consent + export/deletion jobs |
| 3. Fitness content | Exercises, gyms | Movements/exercises/muscles/equipment schema + EN/DE seed data; gyms + equipment; community submissions with **minimal moderation** (reports, approval queue); Postgres FTS |
| 4. Training system | Plans + live workouts | Plan builder, immutable versions, forking; live workout mode (offline session, timers, previous-performance display); progression suggestions v1; personal records |
| 5. Analytics | Insights | user_stats materialization; Recharts dashboards: strength/volume progression, frequency, muscle-group volume, PRs, calendar heatmap, streaks; body tracking UI |
| 6. Social | Community | Follows (with follow requests gating non-public profiles), blocks, activity feed, reactions, comments, mentions, notification center + email digests, SSE realtime |
| 7. Gamification | Motivation | Achievement definitions + worker evaluation, XP ledger + levels, badges |
| 8. Admin | Operations | Moderation dashboard, user/content management, audit views, dead-letter visibility, feature-flag UI |
| 9. Integrations | Ecosystem | HealthProvider adapters (Apple Health first), Meilisearch upgrade if search quality demands, public API groundwork |
| 10. OSS polish | Launch | Fumadocs site, CONTRIBUTING/CODE_OF_CONDUCT, ADR backfill, Coolify + self-host guides, issue templates, public launch |

## 11. Deferred / Open Items

- **Exercise seed data licensing** — evaluate free-exercise-db (public domain) and wger (CC) as seed sources before Phase 3; German translations may need community/manual effort.
- **Push notifications** — schema and preference rows exist; delivery (web push/FCM) unscheduled.
- **Mobile app (Expo)** — the `core` promotion rule and tRPC make this feasible; unscheduled.
- **Fan-out-on-write feed** — trigger: feed query latency at scale.
- **Public REST API + webhooks** — post-Phase 10.
- **AI-assisted progression** — behind a feature flag, after real usage data exists.

## 12. Success Criteria for this Blueprint

- Any contributor can read this document and correctly place a new feature (which module, which layer, which events).
- Phase specs can be written against §4's schema without re-litigating conventions.
- The hosted instance and a self-hosted instance run identical images differing only in env config.

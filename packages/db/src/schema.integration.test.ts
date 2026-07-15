import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { newId } from "./ids";
import { runMigrations } from "./migrate";
import {
  accountDeletionRequests,
  dataExportRequests,
  equipment,
  equipmentTranslations,
  exerciseMuscles,
  exerciseTranslations,
  exercises,
  gymMembers,
  gyms,
  moderationActions,
  movementTranslations,
  movements,
  muscleGroups,
  outboxEvents,
  reports,
  userPreferences,
  users,
} from "./schema";

let container: StartedPostgreSqlContainer;
let db: ReturnType<typeof createDb>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  const connectionString = container.getConnectionUri();
  await runMigrations(connectionString);
  db = createDb(connectionString);
}, 120_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("identity schema", () => {
  it("creates all eight tables", async () => {
    const result = await db.execute<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const tableNames = result.rows.map((row) => row.table_name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        "users",
        "accounts",
        "sessions",
        "user_preferences",
        "privacy_settings",
        "user_roles",
        "user_consents",
        "outbox_events",
        "data_export_requests",
        "account_deletion_requests",
      ]),
    );
  });

  it("allows inserting a user with newId() and a null username", async () => {
    const id = newId();

    await db.insert(users).values({
      id,
      displayName: "Test User",
      email: `${id}@example.com`,
    });

    const [row] = await db.select().from(users).where(eq(users.id, id));

    expect(row?.username).toBeNull();
  });

  it("rejects usernames differing only by case (citext unique)", async () => {
    const idA = newId();
    const idB = newId();

    await db.insert(users).values({
      id: idA,
      username: "SurfFan",
      displayName: "A",
      email: `${idA}@example.com`,
    });

    await expect(
      db.insert(users).values({
        id: idB,
        username: "surffan",
        displayName: "B",
        email: `${idB}@example.com`,
      }),
    ).rejects.toThrow();
  });

  it("inserts an outbox row with default attempts of 0", async () => {
    const id = newId();

    await db.insert(outboxEvents).values({
      id,
      eventType: "test.event",
      schemaVersion: 1,
      payload: { hello: "world" },
    });

    const [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, id));

    expect(row?.attempts).toBe(0);
  });
});

describe("gdpr schema", () => {
  it("inserts a data export request defaulting to pending status", async () => {
    const userId = newId();
    await db.insert(users).values({
      id: userId,
      displayName: "GDPR User",
      email: `${userId}@example.com`,
    });

    const requestId = newId();
    await db.insert(dataExportRequests).values({
      id: requestId,
      userId,
    });

    const [row] = await db
      .select()
      .from(dataExportRequests)
      .where(eq(dataExportRequests.id, requestId));

    expect(row?.status).toBe("pending");
  });

  it("rejects an invalid export status value", async () => {
    const userId = newId();
    await db.insert(users).values({
      id: userId,
      displayName: "GDPR User 2",
      email: `${userId}@example.com`,
    });

    await expect(
      db.execute(
        `insert into data_export_requests (id, user_id, status) values ('${newId()}', '${userId}', 'bogus')`,
      ),
    ).rejects.toThrow();
  });

  it("inserts a deletion request and rejects an invalid deletion status value", async () => {
    const userId = newId();
    await db.insert(users).values({
      id: userId,
      displayName: "GDPR User 3",
      email: `${userId}@example.com`,
    });

    const requestId = newId();
    const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(accountDeletionRequests).values({
      id: requestId,
      userId,
      scheduledFor,
    });

    const [row] = await db
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, requestId));

    expect(row?.status).toBe("pending");

    await expect(
      db.execute(
        `insert into account_deletion_requests (id, user_id, scheduled_for, status) values ('${newId()}', '${userId}', now(), 'bogus')`,
      ),
    ).rejects.toThrow();
  });
});

describe("exercise content schema", () => {
  it("creates all nine tables", async () => {
    const result = await db.execute<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const tableNames = result.rows.map((row) => row.table_name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        "movements",
        "movement_translations",
        "equipment",
        "equipment_translations",
        "muscle_groups",
        "muscle_group_translations",
        "exercises",
        "exercise_translations",
        "exercise_muscles",
        "exercise_media",
      ]),
    );
  });

  it("inserts a movement + en translation + an exercise + en translation with a matching search vector", async () => {
    const movementId = newId();
    await db
      .insert(movements)
      .values({ id: movementId, difficulty: "intermediate", slug: `bench-press-${movementId}` });
    await db.insert(movementTranslations).values({ movementId, locale: "en", name: "Bench Press" });

    const equipmentId = newId();
    await db.insert(equipment).values({ id: equipmentId, slug: `barbell-${equipmentId}` });
    await db.insert(equipmentTranslations).values({ equipmentId, locale: "en", name: "Barbell" });

    const exerciseId = newId();
    await db.insert(exercises).values({
      id: exerciseId,
      movementId,
      equipmentId,
      difficulty: "intermediate",
    });
    await db.insert(exerciseTranslations).values({
      exerciseId,
      locale: "en",
      name: "Bench Press (Barbell)",
    });

    const [row] = await db
      .select()
      .from(exerciseTranslations)
      .where(eq(exerciseTranslations.exerciseId, exerciseId));

    expect(row?.search).not.toBeNull();

    const matchResult = await db.execute<{ count: string }>(
      `select count(*)::text as count from exercise_translations where exercise_id = '${exerciseId}' and search = to_tsvector('simple', 'Bench Press (Barbell)')`,
    );
    expect(matchResult.rows[0]?.count).toBe("1");
  });

  it("enforces the exercises_variant_unique constraint (nulls not distinct) but allows a real owner to duplicate", async () => {
    const movementId = newId();
    await db
      .insert(movements)
      .values({ id: movementId, difficulty: "beginner", slug: `squat-${movementId}` });
    await db.insert(movementTranslations).values({ movementId, locale: "en", name: "Squat" });

    const equipmentId = newId();
    await db.insert(equipment).values({ id: equipmentId, slug: `bodyweight-${equipmentId}` });
    await db
      .insert(equipmentTranslations)
      .values({ equipmentId, locale: "en", name: "Bodyweight" });

    await db.insert(exercises).values({
      id: newId(),
      movementId,
      equipmentId,
      difficulty: "beginner",
    });

    await expect(
      db.insert(exercises).values({
        id: newId(),
        movementId,
        equipmentId,
        difficulty: "beginner",
      }),
    ).rejects.toThrow();

    const ownerId = newId();
    await db
      .insert(users)
      .values({ id: ownerId, displayName: "Owner", email: `${ownerId}@example.com` });

    await expect(
      db.insert(exercises).values({
        id: newId(),
        movementId,
        equipmentId,
        difficulty: "beginner",
        ownerUserId: ownerId,
      }),
    ).resolves.not.toThrow();
  });

  it("rejects a duplicate (exercise, muscleGroup) pair in exercise_muscles", async () => {
    const movementId = newId();
    await db
      .insert(movements)
      .values({ id: movementId, difficulty: "beginner", slug: `curl-${movementId}` });
    const equipmentId = newId();
    await db.insert(equipment).values({ id: equipmentId, slug: `dumbbell-${equipmentId}` });
    const exerciseId = newId();
    await db.insert(exercises).values({
      id: exerciseId,
      movementId,
      equipmentId,
      difficulty: "beginner",
    });
    const muscleGroupId = newId();
    await db
      .insert(muscleGroups)
      .values({ id: muscleGroupId, slug: `biceps-${muscleGroupId}`, bodyRegion: "upper" });

    await db.insert(exerciseMuscles).values({ exerciseId, muscleGroupId, role: "primary" });

    await expect(
      db.insert(exerciseMuscles).values({ exerciseId, muscleGroupId, role: "secondary" }),
    ).rejects.toThrow();
  });
});

describe("gyms schema", () => {
  it("creates the gyms/gym_equipment/gym_members tables", async () => {
    const result = await db.execute<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const tableNames = result.rows.map((row) => row.table_name);

    expect(tableNames).toEqual(expect.arrayContaining(["gyms", "gym_equipment", "gym_members"]));
  });

  it("inserts a gym defaulting to pending status with a matching search vector", async () => {
    const ownerId = newId();
    await db
      .insert(users)
      .values({ id: ownerId, displayName: "Owner", email: `${ownerId}@example.com` });

    const gymId = newId();
    await db.insert(gyms).values({
      id: gymId,
      name: "Iron Paradise",
      city: "Berlin",
      countryCode: "DE",
      ownerUserId: ownerId,
    });

    const [row] = await db.select().from(gyms).where(eq(gyms.id, gymId));
    expect(row?.status).toBe("pending");

    const matchResult = await db.execute<{ count: string }>(
      `select count(*)::text as count from gyms where id = '${gymId}' and search @@ websearch_to_tsquery('simple', 'Berlin')`,
    );
    expect(matchResult.rows[0]?.count).toBe("1");
  });

  it("rejects a duplicate (gymId, userId) membership", async () => {
    const ownerId = newId();
    await db
      .insert(users)
      .values({ id: ownerId, displayName: "Owner2", email: `${ownerId}@example.com` });
    const memberId = newId();
    await db
      .insert(users)
      .values({ id: memberId, displayName: "Member", email: `${memberId}@example.com` });

    const gymId = newId();
    await db.insert(gyms).values({
      id: gymId,
      name: "Gym Two",
      city: "Hamburg",
      countryCode: "DE",
      ownerUserId: ownerId,
    });

    await db.insert(gymMembers).values({ gymId, userId: memberId });

    await expect(db.insert(gymMembers).values({ gymId, userId: memberId })).rejects.toThrow();
  });

  it("enforces the default_gym_id FK on user_preferences", async () => {
    const userId = newId();
    await db
      .insert(users)
      .values({ id: userId, displayName: "Prefs User", email: `${userId}@example.com` });

    await expect(
      db.insert(userPreferences).values({ userId, defaultGymId: newId() }),
    ).rejects.toThrow();
  });
});

describe("moderation schema", () => {
  it("creates the reports and moderation_actions tables", async () => {
    const result = await db.execute<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const tableNames = result.rows.map((row) => row.table_name);

    expect(tableNames).toEqual(expect.arrayContaining(["reports", "moderation_actions"]));
  });

  it("inserts a report defaulting to open status and rejects a bogus reason", async () => {
    const reporterId = newId();
    await db
      .insert(users)
      .values({ id: reporterId, displayName: "Reporter", email: `${reporterId}@example.com` });

    const reportId = newId();
    await db.insert(reports).values({
      id: reportId,
      reporterUserId: reporterId,
      subjectType: "movement",
      subjectId: newId(),
      reason: "spam",
    });

    const [row] = await db.select().from(reports).where(eq(reports.id, reportId));
    expect(row?.status).toBe("open");

    await expect(
      db.execute(
        `insert into reports (id, reporter_user_id, subject_type, subject_id, reason) values ('${newId()}', '${reporterId}', 'movement', '${newId()}', 'bogus')`,
      ),
    ).rejects.toThrow();
  });

  it("inserts a moderation action referencing a report", async () => {
    const moderatorId = newId();
    await db
      .insert(users)
      .values({ id: moderatorId, displayName: "Mod", email: `${moderatorId}@example.com` });
    const reporterId = newId();
    await db
      .insert(users)
      .values({ id: reporterId, displayName: "Reporter2", email: `${reporterId}@example.com` });

    const reportId = newId();
    await db.insert(reports).values({
      id: reportId,
      reporterUserId: reporterId,
      subjectType: "gym",
      subjectId: newId(),
      reason: "inappropriate",
    });

    const actionId = newId();
    await db.insert(moderationActions).values({
      id: actionId,
      moderatorUserId: moderatorId,
      action: "reject",
      subjectType: "gym",
      subjectId: newId(),
      reportId,
    });

    const [row] = await db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.id, actionId));
    expect(row?.reportId).toBe(reportId);
  });
});

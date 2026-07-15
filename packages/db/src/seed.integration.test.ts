import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { runMigrations } from "./migrate";
import { exercises, movements } from "./schema";
import { MOVEMENTS } from "./seed/catalog";
import { runSeed } from "./seed/run";

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

const expectedExerciseCount = MOVEMENTS.reduce(
  (sum, movement) => sum + movement.equipment.length,
  0,
);

describe("catalog seed", () => {
  it("seeds equipment, muscle groups, movements, and exercises idempotently", async () => {
    const first = await runSeed(db);

    expect(first).toEqual({
      equipment: 8,
      muscleGroups: 15,
      movements: 37,
      exercises: expectedExerciseCount,
    });

    const second = await runSeed(db);
    expect(second).toEqual(first);
  });

  it("gives every exercise an en and a de translation and at least one primary muscle row", async () => {
    const missingTranslationsResult = await db.execute<{ count: string }>(sql`
      select count(*)::text as count from (
        select e.id from exercises e
        where (select count(*) from exercise_translations t where t.exercise_id = e.id and t.locale in ('en', 'de')) < 2
      ) missing
    `);
    expect(Number(missingTranslationsResult.rows[0]?.count)).toBe(0);

    const missingPrimaryResult = await db.execute<{ count: string }>(sql`
      select count(*)::text as count from (
        select e.id from exercises e
        where not exists (select 1 from exercise_muscles m where m.exercise_id = e.id and m.role = 'primary')
      ) missing
    `);
    expect(Number(missingPrimaryResult.rows[0]?.count)).toBe(0);
  });

  it("finds seeded rows via full-text search in both locales", async () => {
    const enMatch = await db.execute<{ count: string }>(
      `select count(*)::text as count from exercise_translations where locale = 'en' and search @@ websearch_to_tsquery('simple', 'bench')`,
    );
    expect(Number(enMatch.rows[0]?.count)).toBeGreaterThan(0);

    const deMatch = await db.execute<{ count: string }>(
      `select count(*)::text as count from exercise_translations where locale = 'de' and search @@ websearch_to_tsquery('simple', 'bankdrücken')`,
    );
    expect(Number(deMatch.rows[0]?.count)).toBeGreaterThan(0);
  });

  it("marks all seeded movements and exercises as approved with a null owner", async () => {
    const [movementRow] = await db
      .select()
      .from(movements)
      .where(eq(movements.slug, "bench-press"));
    expect(movementRow?.status).toBe("approved");
    expect(movementRow?.ownerUserId).toBeNull();

    const [exerciseRow] = await db.select().from(exercises).limit(1);
    expect(exerciseRow?.status).toBe("approved");
    expect(exerciseRow?.ownerUserId).toBeNull();
  });
});

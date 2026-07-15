import { createDb, newId, runMigrations, schema } from "@surffit/db";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createExercisesRepository } from "./repository";
import { createExercisesService } from "./service";

let container: StartedPostgreSqlContainer;
let db: ReturnType<typeof createDb>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  await runMigrations(container.getConnectionUri());
  db = createDb(container.getConnectionUri());
}, 120_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

async function seedFixtures() {
  const chestId = newId();
  await db
    .insert(schema.muscleGroups)
    .values({ id: chestId, slug: `chest-${chestId}`, bodyRegion: "upper" });
  await db
    .insert(schema.muscleGroupTranslations)
    .values({ muscleGroupId: chestId, locale: "en", name: "Chest" });

  const barbellId = newId();
  await db.insert(schema.equipment).values({ id: barbellId, slug: `barbell-${barbellId}` });
  await db
    .insert(schema.equipmentTranslations)
    .values({ equipmentId: barbellId, locale: "en", name: "Barbell" });

  const dumbbellId = newId();
  await db.insert(schema.equipment).values({ id: dumbbellId, slug: `dumbbell-${dumbbellId}` });
  await db
    .insert(schema.equipmentTranslations)
    .values({ equipmentId: dumbbellId, locale: "en", name: "Dumbbell" });

  const movementAId = newId();
  await db.insert(schema.movements).values({
    id: movementAId,
    slug: `bench-press-${movementAId}`,
    difficulty: "intermediate",
    status: "approved",
  });
  await db
    .insert(schema.movementTranslations)
    .values({ movementId: movementAId, locale: "en", name: "Bench Press" });

  const movementBId = newId();
  await db.insert(schema.movements).values({
    id: movementBId,
    slug: `squat-${movementBId}`,
    difficulty: "beginner",
    status: "approved",
  });
  await db
    .insert(schema.movementTranslations)
    .values({ movementId: movementBId, locale: "en", name: "Squat" });

  const exerciseWithDe = newId();
  await db.insert(schema.exercises).values({
    id: exerciseWithDe,
    movementId: movementAId,
    equipmentId: barbellId,
    difficulty: "intermediate",
    status: "approved",
  });
  await db.insert(schema.exerciseTranslations).values([
    { exerciseId: exerciseWithDe, locale: "en", name: "Bench Press (Barbell)" },
    { exerciseId: exerciseWithDe, locale: "de", name: "Bankdrücken (Langhantel)" },
  ]);
  await db
    .insert(schema.exerciseMuscles)
    .values({ exerciseId: exerciseWithDe, muscleGroupId: chestId, role: "primary" });

  const exerciseEnOnly = newId();
  await db.insert(schema.exercises).values({
    id: exerciseEnOnly,
    movementId: movementAId,
    equipmentId: dumbbellId,
    difficulty: "intermediate",
    status: "approved",
  });
  await db
    .insert(schema.exerciseTranslations)
    .values({ exerciseId: exerciseEnOnly, locale: "en", name: "Bench Press (Dumbbell)" });
  await db
    .insert(schema.exerciseMuscles)
    .values({ exerciseId: exerciseEnOnly, muscleGroupId: chestId, role: "primary" });

  const squatExercise = newId();
  await db.insert(schema.exercises).values({
    id: squatExercise,
    movementId: movementBId,
    equipmentId: barbellId,
    difficulty: "beginner",
    status: "approved",
  });
  await db
    .insert(schema.exerciseTranslations)
    .values({ exerciseId: squatExercise, locale: "en", name: "Squat (Barbell)" });

  return { chestId, barbellId, movementAId, movementBId };
}

describe("exercises module integration", () => {
  it("falls back to en when a de translation is missing and matches fts/prefix search", async () => {
    const { movementAId } = await seedFixtures();
    const service = createExercisesService(createExercisesRepository(db));

    const deResults = await service.searchExercises(null, { locale: "de", query: "bankdrücken" });
    expect(deResults.some((r) => r.name === "Bankdrücken (Langhantel)")).toBe(true);

    const fallbackResults = await service.searchExercises(null, { locale: "de", query: "Bench" });
    expect(fallbackResults.some((r) => r.name === "Bench Press (Dumbbell)")).toBe(true);

    const prefixResults = await service.searchExercises(null, { locale: "en", query: "Ben" });
    expect(
      prefixResults.some((r) => r.movementId === movementAId && r.name === "Bench Press (Barbell)"),
    ).toBe(true);
  });

  it("filters listMovements by primary muscle group", async () => {
    const { chestId } = await seedFixtures();
    const service = createExercisesService(createExercisesRepository(db));

    const results = await service.listMovements(null, { locale: "en", muscleGroupId: chestId });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.slug.startsWith("bench-press-"))).toBe(true);
  });

  it("returns coalesced names and variants with muscles for getMovementBySlug", async () => {
    const { movementAId } = await seedFixtures();
    const service = createExercisesService(createExercisesRepository(db));

    const slugRow = await db.query.movements.findFirst({
      where: (table, { eq }) => eq(table.id, movementAId),
    });
    if (!slugRow) throw new Error("fixture missing");

    const detail = await service.getMovementBySlug(null, "de", slugRow.slug);
    expect(detail.name).toBe("Bench Press");
    expect(detail.variants.length).toBeGreaterThanOrEqual(2);
    const barbellVariant = detail.variants.find((v) => v.equipmentSlug.startsWith("barbell-"));
    expect(barbellVariant?.muscles.some((m) => m.slug.startsWith("chest-"))).toBe(true);
  });
});

describe("exercises module integration — community submissions", () => {
  it("round-trips submitMovement + submitExercise as pending, visible only to the submitter", async () => {
    const { chestId, barbellId } = await seedFixtures();
    const service = createExercisesService(createExercisesRepository(db));

    const submitterId = newId();
    await db
      .insert(schema.users)
      .values({ id: submitterId, displayName: "Submitter", email: `${submitterId}@example.com` });

    const uniqueName = `Cable Fly ${newId()}`;
    const movementResult = await service.submitMovement(submitterId, {
      name: uniqueName,
      difficulty: "beginner",
    });

    const exerciseResult = await service.submitExercise(submitterId, {
      movementId: movementResult.id,
      equipmentId: barbellId,
      difficulty: "beginner",
      primaryMuscleGroupId: chestId,
    });

    const [movementRow] = await db
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, movementResult.id));
    expect(movementRow?.status).toBe("pending");

    const [exerciseRow] = await db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseResult.id));
    expect(exerciseRow?.status).toBe("pending");

    const outboxRows = await db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventType, "content.submitted"));
    expect(outboxRows.length).toBeGreaterThanOrEqual(2);

    const asSubmitter = await service.getMovementBySlug(
      { id: submitterId },
      "en",
      movementResult.slug,
    );
    expect(asSubmitter.isOwner).toBe(true);

    await expect(service.getMovementBySlug(null, "en", movementResult.slug)).rejects.toThrow(
      "exercises.movement.notFound",
    );
  });
});

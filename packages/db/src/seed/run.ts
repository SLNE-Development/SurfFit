import { eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  equipment,
  equipmentTranslations,
  exerciseMuscles,
  exerciseTranslations,
  exercises,
  movementTranslations,
  movements,
  muscleGroupTranslations,
  muscleGroups,
} from "../schema";
import { EQUIPMENT, MOVEMENTS, MUSCLE_GROUPS } from "./catalog";

export async function runSeed(db: Db) {
  const equipmentIdBySlug = new Map<string, string>();
  for (const item of EQUIPMENT) {
    const [row] = await db
      .insert(equipment)
      .values({ slug: item.slug })
      .onConflictDoNothing({ target: equipment.slug })
      .returning({ id: equipment.id });

    const equipmentId =
      row?.id ?? (await db.query.equipment.findFirst({ where: eq(equipment.slug, item.slug) }))?.id;
    if (!equipmentId) throw new Error(`failed to resolve equipment id for ${item.slug}`);
    equipmentIdBySlug.set(item.slug, equipmentId);

    await db
      .insert(equipmentTranslations)
      .values([
        { equipmentId, locale: "en", name: item.en },
        { equipmentId, locale: "de", name: item.de },
      ])
      .onConflictDoNothing({
        target: [equipmentTranslations.equipmentId, equipmentTranslations.locale],
      });
  }

  const muscleGroupIdBySlug = new Map<string, string>();
  for (const item of MUSCLE_GROUPS) {
    const [row] = await db
      .insert(muscleGroups)
      .values({ slug: item.slug, bodyRegion: item.region })
      .onConflictDoNothing({ target: muscleGroups.slug })
      .returning({ id: muscleGroups.id });

    const muscleGroupId =
      row?.id ??
      (await db.query.muscleGroups.findFirst({ where: eq(muscleGroups.slug, item.slug) }))?.id;
    if (!muscleGroupId) throw new Error(`failed to resolve muscle group id for ${item.slug}`);
    muscleGroupIdBySlug.set(item.slug, muscleGroupId);

    await db
      .insert(muscleGroupTranslations)
      .values([
        { muscleGroupId, locale: "en", name: item.en },
        { muscleGroupId, locale: "de", name: item.de },
      ])
      .onConflictDoNothing({
        target: [muscleGroupTranslations.muscleGroupId, muscleGroupTranslations.locale],
      });
  }

  for (const movement of MOVEMENTS) {
    const [row] = await db
      .insert(movements)
      .values({ slug: movement.slug, difficulty: movement.difficulty, status: "approved" })
      .onConflictDoNothing({ target: movements.slug })
      .returning({ id: movements.id });

    const movementId =
      row?.id ??
      (await db.query.movements.findFirst({ where: eq(movements.slug, movement.slug) }))?.id;
    if (!movementId) throw new Error(`failed to resolve movement id for ${movement.slug}`);

    await db
      .insert(movementTranslations)
      .values([
        { movementId, locale: "en", name: movement.en },
        { movementId, locale: "de", name: movement.de },
      ])
      .onConflictDoNothing({
        target: [movementTranslations.movementId, movementTranslations.locale],
      });

    for (const equipmentSlug of movement.equipment) {
      const equipmentId = equipmentIdBySlug.get(equipmentSlug);
      if (!equipmentId) throw new Error(`unknown equipment slug ${equipmentSlug}`);

      const [exerciseRow] = await db
        .insert(exercises)
        .values({
          movementId,
          equipmentId,
          difficulty: movement.difficulty,
          status: "approved",
          isUnilateral: movement.isUnilateral ?? false,
        })
        .onConflictDoNothing({
          target: [exercises.movementId, exercises.equipmentId, exercises.ownerUserId],
        })
        .returning({ id: exercises.id });

      const exerciseId =
        exerciseRow?.id ??
        (
          await db.query.exercises.findFirst({
            where: (table, { and, eq: eqOp, isNull }) =>
              and(
                eqOp(table.movementId, movementId),
                eqOp(table.equipmentId, equipmentId),
                isNull(table.ownerUserId),
              ),
          })
        )?.id;
      if (!exerciseId) throw new Error(`failed to resolve exercise id for ${movement.slug}`);

      const equipmentSeed = EQUIPMENT.find((e) => e.slug === equipmentSlug);
      if (!equipmentSeed) throw new Error(`unknown equipment slug ${equipmentSlug}`);

      await db
        .insert(exerciseTranslations)
        .values([
          { exerciseId, locale: "en", name: `${movement.en} (${equipmentSeed.en})` },
          { exerciseId, locale: "de", name: `${movement.de} (${equipmentSeed.de})` },
        ])
        .onConflictDoNothing({
          target: [exerciseTranslations.exerciseId, exerciseTranslations.locale],
        });

      const primaryMuscleGroupId = muscleGroupIdBySlug.get(movement.primary);
      if (!primaryMuscleGroupId) throw new Error(`unknown muscle group slug ${movement.primary}`);

      await db
        .insert(exerciseMuscles)
        .values({ exerciseId, muscleGroupId: primaryMuscleGroupId, role: "primary" })
        .onConflictDoNothing({
          target: [exerciseMuscles.exerciseId, exerciseMuscles.muscleGroupId],
        });

      for (const secondarySlug of movement.secondary) {
        const secondaryMuscleGroupId = muscleGroupIdBySlug.get(secondarySlug);
        if (!secondaryMuscleGroupId) throw new Error(`unknown muscle group slug ${secondarySlug}`);

        await db
          .insert(exerciseMuscles)
          .values({ exerciseId, muscleGroupId: secondaryMuscleGroupId, role: "secondary" })
          .onConflictDoNothing({
            target: [exerciseMuscles.exerciseId, exerciseMuscles.muscleGroupId],
          });
      }
    }
  }

  const [equipmentTotal] = await db.select({ count: sql<number>`count(*)::int` }).from(equipment);
  const [muscleGroupTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(muscleGroups);
  const [movementTotal] = await db.select({ count: sql<number>`count(*)::int` }).from(movements);
  const [exerciseTotal] = await db.select({ count: sql<number>`count(*)::int` }).from(exercises);

  return {
    equipment: equipmentTotal?.count ?? 0,
    muscleGroups: muscleGroupTotal?.count ?? 0,
    movements: movementTotal?.count ?? 0,
    exercises: exerciseTotal?.count ?? 0,
  };
}

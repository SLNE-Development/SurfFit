import { schema } from "@surffit/db";
import type { Db } from "@surffit/db";
import { and, asc, desc, eq, exists, isNull, or, sql } from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";
import { FALLBACK_LOCALE } from "../locale";
import type { ExercisesRepository } from "./service";

const {
  movements,
  movementTranslations,
  equipment,
  equipmentTranslations,
  muscleGroups,
  muscleGroupTranslations,
  exercises,
  exerciseTranslations,
  exerciseMuscles,
  userRoles,
} = schema;

function visibilityCondition(
  ownerColumn: AnyPgColumn,
  statusColumn: AnyPgColumn,
  viewerId: string | null,
  includeNonApproved: boolean,
) {
  const conditions = [eq(statusColumn, "approved")];
  if (viewerId) conditions.push(eq(ownerColumn, viewerId));
  if (includeNonApproved) conditions.push(sql`true`);
  return or(...conditions);
}

export function createExercisesRepository(db: Db): ExercisesRepository {
  return {
    async getUserRoles(userId) {
      const rows = await db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, userId));
      return rows.map((r) => r.role);
    },

    async listEquipment(locale) {
      const reqT = alias(equipmentTranslations, "req_t");
      const enT = alias(equipmentTranslations, "en_t");
      const rows = await db
        .select({
          id: equipment.id,
          slug: equipment.slug,
          name: sql<string>`coalesce(${reqT.name}, ${enT.name})`,
        })
        .from(equipment)
        .leftJoin(reqT, and(eq(reqT.equipmentId, equipment.id), eq(reqT.locale, locale)))
        .innerJoin(enT, and(eq(enT.equipmentId, equipment.id), eq(enT.locale, FALLBACK_LOCALE)))
        .orderBy(asc(sql`coalesce(${reqT.name}, ${enT.name})`));
      return rows;
    },

    async listMuscleGroups(locale) {
      const reqT = alias(muscleGroupTranslations, "req_t");
      const enT = alias(muscleGroupTranslations, "en_t");
      const rows = await db
        .select({
          id: muscleGroups.id,
          slug: muscleGroups.slug,
          bodyRegion: muscleGroups.bodyRegion,
          name: sql<string>`coalesce(${reqT.name}, ${enT.name})`,
        })
        .from(muscleGroups)
        .leftJoin(reqT, and(eq(reqT.muscleGroupId, muscleGroups.id), eq(reqT.locale, locale)))
        .innerJoin(
          enT,
          and(eq(enT.muscleGroupId, muscleGroups.id), eq(enT.locale, FALLBACK_LOCALE)),
        )
        .orderBy(asc(sql`coalesce(${reqT.name}, ${enT.name})`));
      return rows;
    },

    async listMovements(params) {
      const reqT = alias(movementTranslations, "req_t");
      const enT = alias(movementTranslations, "en_t");

      const conditions = [
        isNull(movements.deletedAt),
        visibilityCondition(
          movements.ownerUserId,
          movements.status,
          params.viewerId,
          params.includeNonApproved,
        ),
      ];
      if (params.difficulty) conditions.push(eq(movements.difficulty, params.difficulty));
      if (params.equipmentId) {
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(exercises)
              .where(
                and(
                  eq(exercises.movementId, movements.id),
                  eq(exercises.equipmentId, params.equipmentId),
                  isNull(exercises.deletedAt),
                  visibilityCondition(
                    exercises.ownerUserId,
                    exercises.status,
                    params.viewerId,
                    params.includeNonApproved,
                  ),
                ),
              ),
          ),
        );
      }
      if (params.muscleGroupId) {
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(exercises)
              .innerJoin(
                exerciseMuscles,
                and(
                  eq(exerciseMuscles.exerciseId, exercises.id),
                  eq(exerciseMuscles.muscleGroupId, params.muscleGroupId),
                  eq(exerciseMuscles.role, "primary"),
                ),
              )
              .where(
                and(
                  eq(exercises.movementId, movements.id),
                  isNull(exercises.deletedAt),
                  visibilityCondition(
                    exercises.ownerUserId,
                    exercises.status,
                    params.viewerId,
                    params.includeNonApproved,
                  ),
                ),
              ),
          ),
        );
      }

      const rows = await db
        .select({
          id: movements.id,
          slug: movements.slug,
          difficulty: movements.difficulty,
          status: movements.status,
          ownerUserId: movements.ownerUserId,
          name: sql<string>`coalesce(${reqT.name}, ${enT.name})`,
        })
        .from(movements)
        .leftJoin(reqT, and(eq(reqT.movementId, movements.id), eq(reqT.locale, params.locale)))
        .innerJoin(enT, and(eq(enT.movementId, movements.id), eq(enT.locale, FALLBACK_LOCALE)))
        .where(and(...conditions))
        .orderBy(asc(sql`coalesce(${reqT.name}, ${enT.name})`));

      const equipmentByMovement = await db
        .select({
          movementId: exercises.movementId,
          equipmentSlug: equipment.slug,
        })
        .from(exercises)
        .innerJoin(equipment, eq(equipment.id, exercises.equipmentId))
        .where(isNull(exercises.deletedAt));

      const equipmentMap = new Map<string, string[]>();
      for (const row of equipmentByMovement) {
        const list = equipmentMap.get(row.movementId) ?? [];
        list.push(row.equipmentSlug);
        equipmentMap.set(row.movementId, list);
      }

      return rows.map((row) => ({
        ...row,
        equipmentSlugs: equipmentMap.get(row.id) ?? [],
      }));
    },

    async searchExercises(params) {
      const reqT = alias(exerciseTranslations, "req_t");
      const enT = alias(exerciseTranslations, "en_t");
      const eqReqT = alias(equipmentTranslations, "eq_req_t");
      const eqEnT = alias(equipmentTranslations, "eq_en_t");

      const conditions = [
        isNull(exercises.deletedAt),
        visibilityCondition(
          exercises.ownerUserId,
          exercises.status,
          params.viewerId,
          params.includeNonApproved,
        ),
        sql`(coalesce(${reqT.search}, ${enT.search}) @@ websearch_to_tsquery('simple', ${params.query})
          or coalesce(${reqT.name}, ${enT.name}) ilike ${`${params.query}%`})`,
      ];
      if (params.difficulty) conditions.push(eq(exercises.difficulty, params.difficulty));
      if (params.equipmentId) conditions.push(eq(exercises.equipmentId, params.equipmentId));
      if (params.muscleGroupId) {
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(exerciseMuscles)
              .where(
                and(
                  eq(exerciseMuscles.exerciseId, exercises.id),
                  eq(exerciseMuscles.muscleGroupId, params.muscleGroupId),
                  eq(exerciseMuscles.role, "primary"),
                ),
              ),
          ),
        );
      }

      const rows = await db
        .select({
          id: exercises.id,
          movementId: exercises.movementId,
          movementSlug: movements.slug,
          difficulty: exercises.difficulty,
          status: exercises.status,
          ownerUserId: exercises.ownerUserId,
          equipmentSlug: equipment.slug,
          name: sql<string>`coalesce(${reqT.name}, ${enT.name})`,
          equipmentName: sql<string>`coalesce(${eqReqT.name}, ${eqEnT.name})`,
          rank: sql<number>`ts_rank(coalesce(${reqT.search}, ${enT.search}), websearch_to_tsquery('simple', ${params.query}))`,
        })
        .from(exercises)
        .innerJoin(movements, eq(movements.id, exercises.movementId))
        .innerJoin(equipment, eq(equipment.id, exercises.equipmentId))
        .leftJoin(reqT, and(eq(reqT.exerciseId, exercises.id), eq(reqT.locale, params.locale)))
        .innerJoin(enT, and(eq(enT.exerciseId, exercises.id), eq(enT.locale, FALLBACK_LOCALE)))
        .leftJoin(
          eqReqT,
          and(eq(eqReqT.equipmentId, equipment.id), eq(eqReqT.locale, params.locale)),
        )
        .innerJoin(
          eqEnT,
          and(eq(eqEnT.equipmentId, equipment.id), eq(eqEnT.locale, FALLBACK_LOCALE)),
        )
        .where(and(...conditions))
        .orderBy(
          desc(
            sql`ts_rank(coalesce(${reqT.search}, ${enT.search}), websearch_to_tsquery('simple', ${params.query}))`,
          ),
          asc(sql`coalesce(${reqT.name}, ${enT.name})`),
        )
        .limit(params.limit);

      return rows.map(({ rank: _rank, ...row }) => row);
    },

    async findMovementDetailBySlug(slug, locale) {
      const reqT = alias(movementTranslations, "req_t");
      const enT = alias(movementTranslations, "en_t");

      const [movementRow] = await db
        .select({
          id: movements.id,
          slug: movements.slug,
          difficulty: movements.difficulty,
          status: movements.status,
          ownerUserId: movements.ownerUserId,
          deletedAt: movements.deletedAt,
          name: sql<string>`coalesce(${reqT.name}, ${enT.name})`,
          description: sql<string | null>`coalesce(${reqT.description}, ${enT.description})`,
        })
        .from(movements)
        .leftJoin(reqT, and(eq(reqT.movementId, movements.id), eq(reqT.locale, locale)))
        .innerJoin(enT, and(eq(enT.movementId, movements.id), eq(enT.locale, FALLBACK_LOCALE)))
        .where(eq(movements.slug, slug));

      if (!movementRow || movementRow.deletedAt) return null;

      const exReqT = alias(exerciseTranslations, "ex_req_t");
      const exEnT = alias(exerciseTranslations, "ex_en_t");
      const eqReqT = alias(equipmentTranslations, "eq_req_t");
      const eqEnT = alias(equipmentTranslations, "eq_en_t");

      const variantRows = await db
        .select({
          id: exercises.id,
          equipmentSlug: equipment.slug,
          isUnilateral: exercises.isUnilateral,
          status: exercises.status,
          ownerUserId: exercises.ownerUserId,
          name: sql<string>`coalesce(${exReqT.name}, ${exEnT.name})`,
          description: sql<string | null>`coalesce(${exReqT.description}, ${exEnT.description})`,
          instructions: sql<string | null>`coalesce(${exReqT.instructions}, ${exEnT.instructions})`,
          equipmentName: sql<string>`coalesce(${eqReqT.name}, ${eqEnT.name})`,
        })
        .from(exercises)
        .innerJoin(equipment, eq(equipment.id, exercises.equipmentId))
        .leftJoin(exReqT, and(eq(exReqT.exerciseId, exercises.id), eq(exReqT.locale, locale)))
        .innerJoin(
          exEnT,
          and(eq(exEnT.exerciseId, exercises.id), eq(exEnT.locale, FALLBACK_LOCALE)),
        )
        .leftJoin(eqReqT, and(eq(eqReqT.equipmentId, equipment.id), eq(eqReqT.locale, locale)))
        .innerJoin(
          eqEnT,
          and(eq(eqEnT.equipmentId, equipment.id), eq(eqEnT.locale, FALLBACK_LOCALE)),
        )
        .where(and(eq(exercises.movementId, movementRow.id), isNull(exercises.deletedAt)));

      const muscleReqT = alias(muscleGroupTranslations, "mg_req_t");
      const muscleEnT = alias(muscleGroupTranslations, "mg_en_t");
      const muscleRows = await db
        .select({
          exerciseId: exerciseMuscles.exerciseId,
          slug: muscleGroups.slug,
          role: exerciseMuscles.role,
          name: sql<string>`coalesce(${muscleReqT.name}, ${muscleEnT.name})`,
        })
        .from(exerciseMuscles)
        .innerJoin(muscleGroups, eq(muscleGroups.id, exerciseMuscles.muscleGroupId))
        .leftJoin(
          muscleReqT,
          and(eq(muscleReqT.muscleGroupId, muscleGroups.id), eq(muscleReqT.locale, locale)),
        )
        .innerJoin(
          muscleEnT,
          and(eq(muscleEnT.muscleGroupId, muscleGroups.id), eq(muscleEnT.locale, FALLBACK_LOCALE)),
        )
        .where(
          exists(
            db
              .select({ one: sql`1` })
              .from(exercises)
              .where(
                and(
                  eq(exercises.id, exerciseMuscles.exerciseId),
                  eq(exercises.movementId, movementRow.id),
                ),
              ),
          ),
        );

      const musclesByExercise = new Map<
        string,
        { slug: string; name: string; role: "primary" | "secondary" }[]
      >();
      for (const row of muscleRows) {
        const list = musclesByExercise.get(row.exerciseId) ?? [];
        list.push({ slug: row.slug, name: row.name, role: row.role });
        musclesByExercise.set(row.exerciseId, list);
      }

      return {
        id: movementRow.id,
        slug: movementRow.slug,
        name: movementRow.name,
        description: movementRow.description,
        difficulty: movementRow.difficulty,
        status: movementRow.status,
        ownerUserId: movementRow.ownerUserId,
        variants: variantRows.map((variant) => ({
          id: variant.id,
          name: variant.name,
          description: variant.description,
          instructions: variant.instructions,
          equipmentSlug: variant.equipmentSlug,
          equipmentName: variant.equipmentName,
          isUnilateral: variant.isUnilateral,
          status: variant.status,
          ownerUserId: variant.ownerUserId,
          muscles: musclesByExercise.get(variant.id) ?? [],
        })),
      };
    },
  };
}

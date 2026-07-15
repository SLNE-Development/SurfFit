import { isUniqueViolation } from "@surffit/db";
import { exerciseSubmissionSchema, movementSubmissionSchema } from "@surffit/validation";
import type { Role } from "../authz/engine";
import { can, hasElevatedRole } from "../authz/engine";
import { ConflictError, DomainRuleViolationError, NotFoundError } from "../errors";
import { contentSubmittedEvent } from "../events/content";
import type { EventEnvelope } from "../events/envelope";
import { viewContentPolicy } from "./policies";
import { slugify } from "./slug";

export type Difficulty = "beginner" | "intermediate" | "advanced";
export type ContentStatus = "draft" | "pending" | "approved" | "rejected";

export type EquipmentRecord = { id: string; slug: string; name: string };
export type MuscleGroupRecord = {
  id: string;
  slug: string;
  bodyRegion: "upper" | "lower" | "core";
  name: string;
};

export type MovementListRow = {
  id: string;
  slug: string;
  name: string;
  difficulty: Difficulty;
  status: ContentStatus;
  ownerUserId: string | null;
  equipmentSlugs: string[];
};

export type ExerciseSearchRow = {
  id: string;
  movementId: string;
  movementSlug: string;
  name: string;
  equipmentSlug: string;
  equipmentName: string;
  difficulty: Difficulty;
  status: ContentStatus;
  ownerUserId: string | null;
};

export type MovementDetailVariant = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  equipmentSlug: string;
  equipmentName: string;
  isUnilateral: boolean;
  status: ContentStatus;
  ownerUserId: string | null;
  muscles: { slug: string; name: string; role: "primary" | "secondary" }[];
};

export type MovementDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  difficulty: Difficulty;
  status: ContentStatus;
  ownerUserId: string | null;
  variants: MovementDetailVariant[];
};

export type ListMovementsParams = {
  locale: string;
  muscleGroupId?: string;
  equipmentId?: string;
  difficulty?: Difficulty;
};

export type SearchExercisesParams = {
  locale: string;
  query: string;
  muscleGroupId?: string;
  equipmentId?: string;
  difficulty?: Difficulty;
  limit?: number;
};

export type ExercisesRepository = {
  getUserRoles: (userId: string) => Promise<Role[]>;
  listEquipment: (locale: string) => Promise<EquipmentRecord[]>;
  listMuscleGroups: (locale: string) => Promise<MuscleGroupRecord[]>;
  listMovements: (params: {
    locale: string;
    viewerId: string | null;
    includeNonApproved: boolean;
    muscleGroupId?: string;
    equipmentId?: string;
    difficulty?: Difficulty;
  }) => Promise<MovementListRow[]>;
  searchExercises: (params: {
    locale: string;
    query: string;
    viewerId: string | null;
    includeNonApproved: boolean;
    muscleGroupId?: string;
    equipmentId?: string;
    difficulty?: Difficulty;
    limit: number;
  }) => Promise<ExerciseSearchRow[]>;
  findMovementDetailBySlug: (slug: string, locale: string) => Promise<MovementDetail | null>;

  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  writeEvent: (envelope: EventEnvelope, tx: unknown) => Promise<void>;
  insertMovement: (
    input: { slug: string; difficulty: Difficulty; ownerUserId: string },
    tx: unknown,
  ) => Promise<{ id: string }>;
  insertMovementTranslation: (
    input: { movementId: string; locale: string; name: string; description: string | null },
    tx: unknown,
  ) => Promise<void>;
  insertExercise: (
    input: {
      movementId: string;
      equipmentId: string;
      difficulty: Difficulty;
      ownerUserId: string;
      isUnilateral: boolean;
    },
    tx: unknown,
  ) => Promise<{ id: string }>;
  insertExerciseTranslation: (
    input: {
      exerciseId: string;
      locale: string;
      name: string;
      description: string | null;
      instructions: string | null;
    },
    tx: unknown,
  ) => Promise<void>;
  insertExerciseMuscles: (
    input: { exerciseId: string; muscleGroupId: string; role: "primary" | "secondary" }[],
    tx: unknown,
  ) => Promise<void>;
  findMovementForSubmission: (movementId: string) => Promise<{
    id: string;
    slug: string;
    status: ContentStatus;
    ownerUserId: string | null;
    deletedAt: Date | null;
    name: string;
  } | null>;
  equipmentExists: (equipmentId: string) => Promise<{ id: string; name: string } | null>;
  muscleGroupsExist: (muscleGroupIds: string[]) => Promise<boolean>;
};

export function createExercisesService(repo: ExercisesRepository) {
  async function buildActor(viewer: { id: string } | null) {
    if (!viewer) return null;
    return { id: viewer.id, roles: await repo.getUserRoles(viewer.id) };
  }

  return {
    async listEquipment(locale: string) {
      return repo.listEquipment(locale);
    },

    async listMuscleGroups(locale: string) {
      return repo.listMuscleGroups(locale);
    },

    async listMovements(viewer: { id: string } | null, params: ListMovementsParams) {
      const actor = await buildActor(viewer);
      const includeNonApproved = hasElevatedRole(actor);

      const rows = await repo.listMovements({
        locale: params.locale,
        viewerId: viewer?.id ?? null,
        includeNonApproved,
        muscleGroupId: params.muscleGroupId,
        equipmentId: params.equipmentId,
        difficulty: params.difficulty,
      });

      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        difficulty: row.difficulty,
        status: row.status,
        isOwner: viewer?.id === row.ownerUserId,
        equipmentSlugs: row.equipmentSlugs,
      }));
    },

    async searchExercises(viewer: { id: string } | null, params: SearchExercisesParams) {
      const query = params.query.trim();
      if (query.length < 2) {
        throw new DomainRuleViolationError("validation.search.tooShort");
      }
      const limit = Math.min(params.limit ?? 20, 50);

      const actor = await buildActor(viewer);
      const includeNonApproved = hasElevatedRole(actor);

      const rows = await repo.searchExercises({
        locale: params.locale,
        query,
        viewerId: viewer?.id ?? null,
        includeNonApproved,
        muscleGroupId: params.muscleGroupId,
        equipmentId: params.equipmentId,
        difficulty: params.difficulty,
        limit,
      });

      return rows.map((row) => ({
        id: row.id,
        movementId: row.movementId,
        movementSlug: row.movementSlug,
        name: row.name,
        equipmentSlug: row.equipmentSlug,
        equipmentName: row.equipmentName,
        difficulty: row.difficulty,
        status: row.status,
        isOwner: viewer?.id === row.ownerUserId,
      }));
    },

    async getMovementBySlug(viewer: { id: string } | null, locale: string, slug: string) {
      const movement = await repo.findMovementDetailBySlug(slug, locale);
      if (!movement) {
        throw new NotFoundError("exercises.movement.notFound");
      }

      const actor = await buildActor(viewer);
      const allowed = can(
        viewContentPolicy,
        actor,
        { ownerUserId: movement.ownerUserId, status: movement.status },
        undefined,
      );
      if (!allowed) {
        throw new NotFoundError("exercises.movement.notFound");
      }

      const variants = movement.variants.filter((variant) =>
        can(
          viewContentPolicy,
          actor,
          { ownerUserId: variant.ownerUserId, status: variant.status },
          undefined,
        ),
      );

      return {
        id: movement.id,
        slug: movement.slug,
        name: movement.name,
        description: movement.description,
        difficulty: movement.difficulty,
        status: movement.status,
        isOwner: viewer?.id === movement.ownerUserId,
        variants: variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          description: variant.description,
          instructions: variant.instructions,
          equipmentSlug: variant.equipmentSlug,
          equipmentName: variant.equipmentName,
          isUnilateral: variant.isUnilateral,
          status: variant.status,
          isOwner: viewer?.id === variant.ownerUserId,
          muscles: variant.muscles,
        })),
      };
    },

    async submitMovement(userId: string, input: unknown): Promise<{ id: string; slug: string }> {
      const result = movementSubmissionSchema.safeParse(input);
      if (!result.success) {
        throw new DomainRuleViolationError(
          result.error.issues[0]?.message ?? "validation.movement.name",
        );
      }
      const { name, description, difficulty } = result.data;
      const baseSlug = slugify(name);

      for (let attempt = 0; attempt < 10; attempt++) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
        try {
          return await repo.withTransaction(async (tx) => {
            const movement = await repo.insertMovement(
              { slug, difficulty, ownerUserId: userId },
              tx,
            );
            await repo.insertMovementTranslation(
              { movementId: movement.id, locale: "en", name, description },
              tx,
            );
            const envelope = contentSubmittedEvent.create({
              subjectType: "movement",
              subjectId: movement.id,
              ownerUserId: userId,
            });
            await repo.writeEvent(envelope, tx);
            return { id: movement.id, slug };
          });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }

      throw new ConflictError("exercises.movement.exists");
    },

    async submitExercise(
      userId: string,
      input: unknown,
    ): Promise<{ id: string; movementSlug: string }> {
      const result = exerciseSubmissionSchema.safeParse(input);
      if (!result.success) {
        throw new DomainRuleViolationError(
          result.error.issues[0]?.message ?? "validation.exercise.name",
        );
      }
      const {
        movementId,
        equipmentId,
        difficulty,
        isUnilateral,
        name,
        description,
        instructions,
        primaryMuscleGroupId,
        secondaryMuscleGroupIds,
      } = result.data;

      const movement = await repo.findMovementForSubmission(movementId);
      if (
        !movement ||
        movement.deletedAt ||
        (movement.status !== "approved" && movement.ownerUserId !== userId)
      ) {
        throw new NotFoundError("exercises.movement.notFound");
      }

      const equipment = await repo.equipmentExists(equipmentId);
      if (!equipment) {
        throw new NotFoundError("exercises.equipment.notFound");
      }

      const allMuscleGroupIds = [primaryMuscleGroupId, ...secondaryMuscleGroupIds];
      const muscleGroupsOk = await repo.muscleGroupsExist(allMuscleGroupIds);
      if (!muscleGroupsOk) {
        throw new NotFoundError("exercises.muscleGroup.notFound");
      }

      try {
        return await repo.withTransaction(async (tx) => {
          const exercise = await repo.insertExercise(
            { movementId, equipmentId, difficulty, ownerUserId: userId, isUnilateral },
            tx,
          );

          const finalName = name ?? `${movement.name} (${equipment.name})`;
          await repo.insertExerciseTranslation(
            {
              exerciseId: exercise.id,
              locale: "en",
              name: finalName,
              description,
              instructions,
            },
            tx,
          );

          await repo.insertExerciseMuscles(
            [
              { exerciseId: exercise.id, muscleGroupId: primaryMuscleGroupId, role: "primary" },
              ...secondaryMuscleGroupIds.map((muscleGroupId) => ({
                exerciseId: exercise.id,
                muscleGroupId,
                role: "secondary" as const,
              })),
            ],
            tx,
          );

          const envelope = contentSubmittedEvent.create({
            subjectType: "exercise",
            subjectId: exercise.id,
            ownerUserId: userId,
          });
          await repo.writeEvent(envelope, tx);

          return { id: exercise.id, movementSlug: movement.slug };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("exercises.variant.exists");
        }
        throw error;
      }
    },
  };
}

export type ExercisesService = ReturnType<typeof createExercisesService>;

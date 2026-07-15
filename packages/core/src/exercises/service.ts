import type { Role } from "../authz/engine";
import { can, hasElevatedRole } from "../authz/engine";
import { DomainRuleViolationError, NotFoundError } from "../errors";
import { viewContentPolicy } from "./policies";

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
  };
}

export type ExercisesService = ReturnType<typeof createExercisesService>;

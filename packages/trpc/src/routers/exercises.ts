import { createExercisesRepository, createExercisesService } from "@surffit/core";
import {
  difficultySchema,
  exerciseSubmissionSchema,
  movementSubmissionSchema,
} from "@surffit/validation";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../trpc";

export const exercisesRouter = router({
  filters: publicProcedure
    .input(z.object({ locale: z.string().default("en") }))
    .query(async ({ ctx, input }) => {
      const service = createExercisesService(createExercisesRepository(ctx.db));
      const [equipment, muscleGroups] = await Promise.all([
        service.listEquipment(input.locale),
        service.listMuscleGroups(input.locale),
      ]);
      return { equipment, muscleGroups };
    }),

  movements: publicProcedure
    .input(
      z.object({
        locale: z.string().default("en"),
        muscleGroupId: z.string().optional(),
        equipmentId: z.string().optional(),
        difficulty: difficultySchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const service = createExercisesService(createExercisesRepository(ctx.db));
      const viewer = ctx.session?.user ?? null;
      return service.listMovements(viewer, input);
    }),

  search: publicProcedure
    .input(
      z.object({
        locale: z.string().default("en"),
        query: z.string(),
        muscleGroupId: z.string().optional(),
        equipmentId: z.string().optional(),
        difficulty: difficultySchema.optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const service = createExercisesService(createExercisesRepository(ctx.db));
      const viewer = ctx.session?.user ?? null;
      return service.searchExercises(viewer, input);
    }),

  submitMovement: protectedProcedure
    .input(movementSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createExercisesService(createExercisesRepository(ctx.db));
      return service.submitMovement(ctx.session.user.id, input);
    }),

  submitExercise: protectedProcedure
    .input(exerciseSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createExercisesService(createExercisesRepository(ctx.db));
      return service.submitExercise(ctx.session.user.id, input);
    }),
});

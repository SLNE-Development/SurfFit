import { createGymsRepository, createGymsService } from "@surffit/core";
import { gymCreateSchema, gymEquipmentAddSchema, gymUpdateSchema } from "@surffit/validation";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../trpc";

export const gymsRouter = router({
  search: publicProcedure
    .input(
      z.object({
        locale: z.string().default("en"),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const service = createGymsService(createGymsRepository(ctx.db));
      const viewer = ctx.session?.user ?? null;
      return service.searchGyms(viewer, { query: input.query, limit: input.limit });
    }),

  mine: protectedProcedure.query(async ({ ctx }) => {
    const service = createGymsService(createGymsRepository(ctx.db));
    return service.listMyGyms(ctx.session.user.id);
  }),

  create: protectedProcedure.input(gymCreateSchema).mutation(async ({ ctx, input }) => {
    const service = createGymsService(createGymsRepository(ctx.db));
    return service.createGym(ctx.session.user.id, input);
  }),

  update: protectedProcedure
    .input(gymUpdateSchema.extend({ gymId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { gymId, ...rest } = input;
      const service = createGymsService(createGymsRepository(ctx.db));
      return service.updateGym(ctx.session.user.id, gymId, rest);
    }),

  addEquipment: protectedProcedure
    .input(gymEquipmentAddSchema.extend({ gymId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { gymId, ...rest } = input;
      const service = createGymsService(createGymsRepository(ctx.db));
      return service.addEquipment(ctx.session.user.id, gymId, rest);
    }),

  removeEquipment: protectedProcedure
    .input(z.object({ gymId: z.string().min(1), gymEquipmentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const service = createGymsService(createGymsRepository(ctx.db));
      return service.removeEquipment(ctx.session.user.id, input.gymId, input.gymEquipmentId);
    }),

  join: protectedProcedure
    .input(z.object({ gymId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const service = createGymsService(createGymsRepository(ctx.db));
      return service.joinGym(ctx.session.user.id, input.gymId);
    }),

  leave: protectedProcedure
    .input(z.object({ gymId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const service = createGymsService(createGymsRepository(ctx.db));
      return service.leaveGym(ctx.session.user.id, input.gymId);
    }),
});

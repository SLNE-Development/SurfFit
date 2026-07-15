import { createModerationRepository, createModerationService } from "@surffit/core";
import { reportCreateSchema } from "@surffit/validation";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

export const moderationRouter = router({
  queue: protectedProcedure.query(async ({ ctx }) => {
    const service = createModerationService(createModerationRepository(ctx.db));
    return service.getQueue(ctx.session.user.id);
  }),

  review: protectedProcedure
    .input(
      z.object({
        subjectType: z.enum(["movement", "exercise", "gym"]),
        subjectId: z.string().min(1),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createModerationService(createModerationRepository(ctx.db));
      return service.review(ctx.session.user.id, input);
    }),

  report: protectedProcedure.input(reportCreateSchema).mutation(async ({ ctx, input }) => {
    const service = createModerationService(createModerationRepository(ctx.db));
    return service.createReport(ctx.session.user.id, input);
  }),

  reports: protectedProcedure
    .input(
      z.object({ status: z.enum(["open", "reviewing", "resolved", "dismissed"]).default("open") }),
    )
    .query(async ({ ctx, input }) => {
      const service = createModerationService(createModerationRepository(ctx.db));
      return service.listReports(ctx.session.user.id, input);
    }),

  resolveReport: protectedProcedure
    .input(
      z.object({
        reportId: z.string().min(1),
        resolution: z.enum(["resolved", "dismissed"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createModerationService(createModerationRepository(ctx.db));
      return service.resolveReport(ctx.session.user.id, input);
    }),
});

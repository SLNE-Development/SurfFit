import { createIdentityRepository, createIdentityService } from "@surffit/core";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

export const identityRouter = router({
  claimUsername: protectedProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const service = createIdentityService(createIdentityRepository(ctx.db));
      return service.claimUsername(ctx.session.user.id, input.username);
    }),

  usernameAvailable: protectedProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const service = createIdentityService(createIdentityRepository(ctx.db));
      const available = await service.isUsernameAvailable(input.username);
      return { available };
    }),
});

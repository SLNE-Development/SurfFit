import { createIdentityRepository, createIdentityService } from "@surffit/core";
import { profileUpdateSchema } from "@surffit/validation";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../trpc";

export const profileRouter = router({
  byUsername: publicProcedure.input(z.object({ username: z.string() })).query(({ ctx, input }) => {
    const service = createIdentityService(createIdentityRepository(ctx.db));
    return service.getProfileByUsername(ctx.session?.user ?? null, input.username);
  }),

  update: protectedProcedure.input(profileUpdateSchema).mutation(({ ctx, input }) => {
    const service = createIdentityService(createIdentityRepository(ctx.db));
    return service.updateProfile(ctx.session.user.id, input);
  }),
});

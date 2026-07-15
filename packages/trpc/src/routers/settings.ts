import { createIdentityRepository, createIdentityService } from "@surffit/core";
import { preferencesUpdateSchema, privacyUpdateSchema } from "@surffit/validation";
import { protectedProcedure, router } from "../trpc";

export const settingsRouter = router({
  preferences: protectedProcedure.query(({ ctx }) => {
    const service = createIdentityService(createIdentityRepository(ctx.db));
    return service.getPreferences(ctx.session.user.id);
  }),

  updatePreferences: protectedProcedure
    .input(preferencesUpdateSchema)
    .mutation(({ ctx, input }) => {
      const service = createIdentityService(createIdentityRepository(ctx.db));
      return service.updatePreferences(ctx.session.user.id, input);
    }),

  privacy: protectedProcedure.query(({ ctx }) => {
    const service = createIdentityService(createIdentityRepository(ctx.db));
    return service.getPrivacySettings(ctx.session.user.id);
  }),

  updatePrivacy: protectedProcedure.input(privacyUpdateSchema).mutation(({ ctx, input }) => {
    const service = createIdentityService(createIdentityRepository(ctx.db));
    return service.updatePrivacySettings(ctx.session.user.id, input);
  }),
});

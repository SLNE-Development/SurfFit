import {
  createGdprRepository,
  createGdprService,
  createIdentityExportSections,
  createIdentityRepository,
  createIdentityService,
} from "@surffit/core";
import { protectedProcedure, router } from "../trpc";

function buildGdprService(ctx: {
  db: Parameters<typeof createIdentityRepository>[0];
  storage: Parameters<typeof createGdprService>[0]["storage"];
}) {
  return createGdprService({
    repo: createGdprRepository(ctx.db),
    storage: ctx.storage,
    sections: createIdentityExportSections(createIdentityRepository(ctx.db)),
  });
}

export const gdprRouter = router({
  requestExport: protectedProcedure.mutation(({ ctx }) => {
    return buildGdprService(ctx).requestExport(ctx.session.user.id);
  }),

  exportStatus: protectedProcedure.query(({ ctx }) => {
    return buildGdprService(ctx).getExportStatus(ctx.session.user.id);
  }),

  requestDeletion: protectedProcedure.mutation(({ ctx }) => {
    return buildGdprService(ctx).requestDeletion(ctx.session.user.id);
  }),

  cancelDeletion: protectedProcedure.mutation(({ ctx }) => {
    return buildGdprService(ctx).cancelDeletion(ctx.session.user.id);
  }),

  deletionStatus: protectedProcedure.query(({ ctx }) => {
    return buildGdprService(ctx).getDeletionStatus(ctx.session.user.id);
  }),

  consents: protectedProcedure.query(({ ctx }) => {
    const service = createIdentityService(createIdentityRepository(ctx.db));
    return service.listConsents(ctx.session.user.id);
  }),
});

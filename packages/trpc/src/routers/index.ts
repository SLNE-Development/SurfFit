import { router } from "../trpc";
import { healthRouter } from "./health";
import { identityRouter } from "./identity";

export const appRouter = router({
  health: healthRouter,
  identity: identityRouter,
});

export type AppRouter = typeof appRouter;

import { router } from "../trpc";
import { healthRouter } from "./health";
import { identityRouter } from "./identity";
import { profileRouter } from "./profile";
import { settingsRouter } from "./settings";

export const appRouter = router({
  health: healthRouter,
  identity: identityRouter,
  profile: profileRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;

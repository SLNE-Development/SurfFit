import { router } from "../trpc";
import { exercisesRouter } from "./exercises";
import { gdprRouter } from "./gdpr";
import { gymsRouter } from "./gyms";
import { healthRouter } from "./health";
import { identityRouter } from "./identity";
import { profileRouter } from "./profile";
import { settingsRouter } from "./settings";

export const appRouter = router({
  health: healthRouter,
  identity: identityRouter,
  profile: profileRouter,
  settings: settingsRouter,
  gdpr: gdprRouter,
  exercises: exercisesRouter,
  gyms: gymsRouter,
});

export type AppRouter = typeof appRouter;

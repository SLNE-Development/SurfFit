import { z } from "zod";

export const preferencesUpdateSchema = z
  .object({
    unitSystem: z.enum(["metric", "imperial"]),
    theme: z.enum(["dark", "light", "system"]),
    firstWeekday: z
      .number()
      .int()
      .min(0, "validation.preferences.range")
      .max(6, "validation.preferences.range"),
    defaultRestSeconds: z
      .number()
      .int()
      .min(15, "validation.preferences.range")
      .max(600, "validation.preferences.range"),
  })
  .partial();

export const privacyUpdateSchema = z
  .object({
    profileVisibility: z.enum(["public", "following", "private"]),
    showStatistics: z.boolean(),
    showAchievements: z.boolean(),
    showWorkouts: z.boolean(),
    showBodyMetrics: z.boolean(),
  })
  .partial();

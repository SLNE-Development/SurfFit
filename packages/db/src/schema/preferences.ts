import { sql } from "drizzle-orm";
import { boolean, integer, pgEnum, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { gyms } from "./gyms";
import { users } from "./users";

export const unitSystemEnum = pgEnum("unit_system", ["metric", "imperial"]);
export const themeEnum = pgEnum("theme", ["dark", "light", "system"]);

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  unitSystem: unitSystemEnum("unit_system").notNull().default("metric"),
  theme: themeEnum("theme").notNull().default("dark"),
  firstWeekday: smallint("first_weekday").notNull().default(1),
  defaultGymId: text("default_gym_id").references(() => gyms.id, { onDelete: "set null" }),
  defaultRestSeconds: integer("default_rest_seconds").notNull().default(120),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const profileVisibilityEnum = pgEnum("profile_visibility", [
  "public",
  "following",
  "private",
]);

export const privacySettings = pgTable("privacy_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  profileVisibility: profileVisibilityEnum("profile_visibility").notNull().default("public"),
  showStatistics: boolean("show_statistics").notNull().default(true),
  showAchievements: boolean("show_achievements").notNull().default(true),
  showWorkouts: boolean("show_workouts").notNull().default(true),
  showBodyMetrics: boolean("show_body_metrics").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { citext } from "../citext";
import { newId } from "../ids";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(newId),
  username: citext("username").unique(),
  displayName: text("display_name"),
  email: citext("email").notNull().unique(),
  avatarKey: text("avatar_key"),
  biography: text("biography"),
  // Auth.js DrizzleAdapter requires these exact column names on the users
  // table it's handed; app code reads displayName/avatarKey instead.
  name: text("name"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  locale: text("locale").notNull().default("en"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

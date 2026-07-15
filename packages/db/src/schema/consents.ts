import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { newId } from "../ids";
import { users } from "./users";

export const userConsents = pgTable("user_consents", {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  consentType: text("consent_type").notNull(),
  policyVersion: text("policy_version").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().default(sql`now()`),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

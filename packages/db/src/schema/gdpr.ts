import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { newId } from "../ids";
import { users } from "./users";

export const exportStatusEnum = pgEnum("export_status", [
  "pending",
  "processing",
  "ready",
  "expired",
  "failed",
]);

export const dataExportRequests = pgTable(
  "data_export_requests",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: exportStatusEnum("status").notNull().default("pending"),
    storageKey: text("storage_key"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().default(sql`now()`),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [index("data_export_requests_user_id_idx").on(table.userId)],
);

export const deletionStatusEnum = pgEnum("deletion_status", ["pending", "cancelled", "completed"]);

export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().default(sql`now()`),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: deletionStatusEnum("status").notNull().default("pending"),
  },
  (table) => [index("account_deletion_requests_user_id_idx").on(table.userId)],
);

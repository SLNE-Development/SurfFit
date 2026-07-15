import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { newId } from "../ids";
import { users } from "./users";

export const subjectTypeEnum = pgEnum("subject_type", [
  "exercise",
  "movement",
  "plan",
  "comment",
  "activity",
  "user",
  "gym",
]);
export const reportReasonEnum = pgEnum("report_reason", [
  "spam",
  "inappropriate",
  "incorrect",
  "copyright",
  "other",
]);
export const reportStatusEnum = pgEnum("report_status", [
  "open",
  "reviewing",
  "resolved",
  "dismissed",
]);
export const moderationActionEnum = pgEnum("moderation_action", [
  "approve",
  "reject",
  "remove",
  "warn",
  "suspend",
  "restore",
]);

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => users.id),
    subjectType: subjectTypeEnum("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    reason: reportReasonEnum("reason").notNull(),
    details: text("details"),
    status: reportStatusEnum("status").notNull().default("open"),
    resolvedBy: text("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("reports_status_idx").on(table.status),
    index("reports_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

export const moderationActions = pgTable("moderation_actions", {
  id: text("id").primaryKey().$defaultFn(newId),
  moderatorUserId: text("moderator_user_id")
    .notNull()
    .references(() => users.id),
  action: moderationActionEnum("action").notNull(),
  subjectType: subjectTypeEnum("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  reportId: text("report_id").references(() => reports.id),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

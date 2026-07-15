import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { newId } from "../ids";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    eventType: text("event_type").notNull(),
    schemaVersion: smallint("schema_version").notNull(),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().default(sql`now()`),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    attempts: smallint("attempts").notNull().default(0),
  },
  (table) => [
    index("outbox_events_undispatched_idx")
      .on(table.dispatchedAt)
      .where(sql`${table.dispatchedAt} is null`),
  ],
);

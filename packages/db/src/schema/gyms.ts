import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newId } from "../ids";
import { tsvector } from "../tsvector";
import { equipment } from "./exercises";
import { users } from "./users";

export const gymStatusEnum = pgEnum("gym_status", ["pending", "approved", "rejected"]);

export const gyms = pgTable(
  "gyms",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    name: text("name").notNull(),
    description: text("description"),
    city: text("city").notNull(),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
    address: text("address"),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    status: gymStatusEnum("status").notNull().default("pending"),
    search: tsvector("search").generatedAlwaysAs(sql`to_tsvector('simple', name || ' ' || city)`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("gyms_search_idx").using("gin", table.search)],
);

export const gymEquipment = pgTable(
  "gym_equipment",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id),
    label: text("label").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index("gym_equipment_gym_id_idx").on(table.gymId)],
);

export const gymMembers = pgTable(
  "gym_members",
  {
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [primaryKey({ columns: [table.gymId, table.userId] })],
);

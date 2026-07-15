import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { newId } from "../ids";
import { tsvector } from "../tsvector";
import { users } from "./users";

export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
]);
export const difficultyEnum = pgEnum("difficulty", ["beginner", "intermediate", "advanced"]);
export const bodyRegionEnum = pgEnum("body_region", ["upper", "lower", "core"]);
export const muscleRoleEnum = pgEnum("muscle_role", ["primary", "secondary"]);
export const mediaKindEnum = pgEnum("media_kind", ["image", "video"]);

export const movements = pgTable("movements", {
  id: text("id").primaryKey().$defaultFn(newId),
  slug: text("slug").notNull().unique(),
  difficulty: difficultyEnum("difficulty").notNull(),
  // Users are anonymized, never hard-deleted, so content keeps its
  // pseudonymized owner reference — no cascade/set-null here.
  ownerUserId: text("owner_user_id").references(() => users.id),
  status: contentStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const movementTranslations = pgTable(
  "movement_translations",
  {
    movementId: text("movement_id")
      .notNull()
      .references(() => movements.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    description: text("description"),
  },
  (table) => [primaryKey({ columns: [table.movementId, table.locale] })],
);

export const equipment = pgTable("equipment", {
  id: text("id").primaryKey().$defaultFn(newId),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const equipmentTranslations = pgTable(
  "equipment_translations",
  {
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.equipmentId, table.locale] })],
);

export const muscleGroups = pgTable("muscle_groups", {
  id: text("id").primaryKey().$defaultFn(newId),
  slug: text("slug").notNull().unique(),
  bodyRegion: bodyRegionEnum("body_region").notNull(),
});

export const muscleGroupTranslations = pgTable(
  "muscle_group_translations",
  {
    muscleGroupId: text("muscle_group_id")
      .notNull()
      .references(() => muscleGroups.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.muscleGroupId, table.locale] })],
);

export const exercises = pgTable(
  "exercises",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    movementId: text("movement_id")
      .notNull()
      .references(() => movements.id),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id),
    difficulty: difficultyEnum("difficulty").notNull(),
    // Users are anonymized, never hard-deleted, so content keeps its
    // pseudonymized owner reference — no cascade/set-null here.
    ownerUserId: text("owner_user_id").references(() => users.id),
    status: contentStatusEnum("status").notNull().default("pending"),
    isUnilateral: boolean("is_unilateral").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("exercises_variant_unique")
      .on(table.movementId, table.equipmentId, table.ownerUserId)
      .nullsNotDistinct(),
  ],
);

export const exerciseTranslations = pgTable(
  "exercise_translations",
  {
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    instructions: text("instructions"),
    search: tsvector("search").generatedAlwaysAs(
      sql`to_tsvector('simple', name || ' ' || coalesce(description, ''))`,
    ),
  },
  (table) => [
    primaryKey({ columns: [table.exerciseId, table.locale] }),
    index("exercise_translations_search_idx").using("gin", table.search),
  ],
);

export const exerciseMuscles = pgTable(
  "exercise_muscles",
  {
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    muscleGroupId: text("muscle_group_id")
      .notNull()
      .references(() => muscleGroups.id),
    role: muscleRoleEnum("role").notNull(),
  },
  (table) => [primaryKey({ columns: [table.exerciseId, table.muscleGroupId] })],
);

export const exerciseMedia = pgTable("exercise_media", {
  id: text("id").primaryKey().$defaultFn(newId),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  kind: mediaKindEnum("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  position: smallint("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

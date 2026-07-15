CREATE TYPE "public"."body_region" AS ENUM('upper', 'lower', 'core');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."muscle_role" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "equipment_translations" (
	"equipment_id" text NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "equipment_translations_equipment_id_locale_pk" PRIMARY KEY("equipment_id","locale")
);
--> statement-breakpoint
CREATE TABLE "exercise_media" (
	"id" text PRIMARY KEY NOT NULL,
	"exercise_id" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_muscles" (
	"exercise_id" text NOT NULL,
	"muscle_group_id" text NOT NULL,
	"role" "muscle_role" NOT NULL,
	CONSTRAINT "exercise_muscles_exercise_id_muscle_group_id_pk" PRIMARY KEY("exercise_id","muscle_group_id")
);
--> statement-breakpoint
CREATE TABLE "exercise_translations" (
	"exercise_id" text NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"instructions" text,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', name || ' ' || coalesce(description, ''))) STORED,
	CONSTRAINT "exercise_translations_exercise_id_locale_pk" PRIMARY KEY("exercise_id","locale")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"owner_user_id" text,
	"status" "content_status" DEFAULT 'pending' NOT NULL,
	"is_unilateral" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "exercises_variant_unique" UNIQUE NULLS NOT DISTINCT("movement_id","equipment_id","owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "movement_translations" (
	"movement_id" text NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "movement_translations_movement_id_locale_pk" PRIMARY KEY("movement_id","locale")
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"owner_user_id" text,
	"status" "content_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "movements_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "muscle_group_translations" (
	"muscle_group_id" text NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "muscle_group_translations_muscle_group_id_locale_pk" PRIMARY KEY("muscle_group_id","locale")
);
--> statement-breakpoint
CREATE TABLE "muscle_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"body_region" "body_region" NOT NULL,
	CONSTRAINT "muscle_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "equipment_translations" ADD CONSTRAINT "equipment_translations_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_muscle_group_id_muscle_groups_id_fk" FOREIGN KEY ("muscle_group_id") REFERENCES "public"."muscle_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_translations" ADD CONSTRAINT "exercise_translations_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_translations" ADD CONSTRAINT "movement_translations_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muscle_group_translations" ADD CONSTRAINT "muscle_group_translations_muscle_group_id_muscle_groups_id_fk" FOREIGN KEY ("muscle_group_id") REFERENCES "public"."muscle_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_translations_search_idx" ON "exercise_translations" USING gin ("search");
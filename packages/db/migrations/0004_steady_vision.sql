CREATE TYPE "public"."gym_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "gym_equipment" (
	"id" text PRIMARY KEY NOT NULL,
	"gym_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"label" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gym_members" (
	"gym_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_members_gym_id_user_id_pk" PRIMARY KEY("gym_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"city" text NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"address" text,
	"owner_user_id" text NOT NULL,
	"status" "gym_status" DEFAULT 'pending' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', name || ' ' || city)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_members" ADD CONSTRAINT "gym_members_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_members" ADD CONSTRAINT "gym_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gym_equipment_gym_id_idx" ON "gym_equipment" USING btree ("gym_id");--> statement-breakpoint
CREATE INDEX "gyms_search_idx" ON "gyms" USING gin ("search");--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_default_gym_id_gyms_id_fk" FOREIGN KEY ("default_gym_id") REFERENCES "public"."gyms"("id") ON DELETE set null ON UPDATE no action;
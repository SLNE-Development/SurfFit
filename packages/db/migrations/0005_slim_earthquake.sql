CREATE TYPE "public"."moderation_action" AS ENUM('approve', 'reject', 'remove', 'warn', 'suspend', 'restore');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'inappropriate', 'incorrect', 'copyright', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('exercise', 'movement', 'plan', 'comment', 'activity', 'user', 'gym');--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"moderator_user_id" text NOT NULL,
	"action" "moderation_action" NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" text NOT NULL,
	"report_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_user_id" text NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" text NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_user_id_users_id_fk" FOREIGN KEY ("moderator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_subject_idx" ON "reports" USING btree ("subject_type","subject_id");
CREATE TABLE "sign_in_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_index" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"panel" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_phone_unique";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "panel" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_index" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_index" text;--> statement-breakpoint
CREATE INDEX "sign_in_failures_email_idx" ON "sign_in_failures" USING btree ("email_index","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_index_unique" UNIQUE("email_index");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_index_unique" UNIQUE("phone_index");
ALTER TABLE "devices" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "bundle_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "delivered" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "error" text;
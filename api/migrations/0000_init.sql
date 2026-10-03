CREATE TABLE "addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text,
	"wilayat" text NOT NULL,
	"neighbourhood" text NOT NULL,
	"way_no" text,
	"building_no" text,
	"flat_no" text,
	"landmark" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"notes_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"technician_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret_enc" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"role" text NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"last_sign_in_device" text,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"lock_level" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_notes" (
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_notes_entity_entity_id_id_pk" PRIMARY KEY("entity","entity_id","id")
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"wilayat" text PRIMARY KEY NOT NULL,
	"governorate" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"visit_fee_override" integer,
	"waitlist_count" integer DEFAULT 0 NOT NULL,
	"neighbourhoods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"lock_level" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" text,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"reason" text,
	"before_hash" text,
	"after_hash" text,
	"ip_hash" text,
	"data" jsonb,
	"prev_hash" text NOT NULL,
	"row_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"index_value" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"actor_role" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"lat" double precision,
	"lng" double precision,
	"media_file_id" text,
	"note" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"technician_id" text NOT NULL,
	"batch" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"decline_reason" text,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"customer_id" text NOT NULL,
	"technician_id" text,
	"entry_mode" text NOT NULL,
	"parent_booking_id" text,
	"is_revisit" boolean DEFAULT false NOT NULL,
	"problem" text NOT NULL,
	"units" jsonb NOT NULL,
	"problem_text" text,
	"problem_media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"urgency" text DEFAULT 'day' NOT NULL,
	"address" jsonb NOT NULL,
	"wilayat" text NOT NULL,
	"neighbourhood" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"visit_fee" integer NOT NULL,
	"quote_total" integer,
	"labor_total" integer,
	"parts_total" integer,
	"commission_bps" integer NOT NULL,
	"commission_reason" text NOT NULL,
	"commission_amount" integer,
	"technician_net" integer,
	"gateway_fee" integer,
	"platform_net" integer,
	"refund_total" integer DEFAULT 0 NOT NULL,
	"settings_snapshot" jsonb NOT NULL,
	"cancel_reason" text,
	"cancelled_by" text,
	"eta_minutes" integer,
	"arrival" jsonb,
	"diagnosis" jsonb,
	"completion" jsonb,
	"timeline" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tracking_token_hash" text,
	"accept_deadline" timestamp with time zone,
	"payout_due_at" timestamp with time zone,
	"needs_admin" text,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" text PRIMARY KEY NOT NULL,
	"segment" text NOT NULL,
	"body_ar" text NOT NULL,
	"body_en" text NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"caller_role" text NOT NULL,
	"caller_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"legal_document_id" text NOT NULL,
	"doc_type" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"locale" text NOT NULL,
	"text_sha256" text NOT NULL,
	"signature_name" text,
	"signature_file_id" text,
	"context" text NOT NULL,
	"booking_id" text,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"opened_by" text NOT NULL,
	"reason_code" text NOT NULL,
	"description" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decision" text,
	"decision_amounts" jsonb,
	"decision_note" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"sla_due_at" timestamp with time zone NOT NULL,
	"appeal_used" boolean DEFAULT false NOT NULL,
	"appeal_text" text,
	"appeal_by" text,
	"second_reviewer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text,
	"purpose" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"capture_meta_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"booking_id" text,
	"technician_id" text,
	"account" text NOT NULL,
	"debit" integer DEFAULT 0 NOT NULL,
	"credit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text,
	"technician_id" text,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"memo" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"language" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"rendered_body" text,
	"is_draft" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'editing' NOT NULL,
	"published_at" timestamp with time zone,
	"effective_at" timestamp with time zone,
	"requires_reacceptance" boolean DEFAULT false NOT NULL,
	"change_summary" text,
	"published_by" text,
	"settings_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_role" text NOT NULL,
	"body" text NOT NULL,
	"flagged_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"body_ar" text NOT NULL,
	"body_en" text NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"channels" jsonb DEFAULT '["push","sms"]'::jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"template_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"send_after" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"phone_index" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payable_items" (
	"id" text PRIMARY KEY NOT NULL,
	"technician_id" text NOT NULL,
	"booking_id" text,
	"adjustment_id" text,
	"amount" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"hold_reason" text,
	"payout_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"provider_payment_id" text,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"checkout_url" text,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"bank_reference" text,
	"paid_at" timestamp with time zone,
	"paid_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"technician_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'in_batch' NOT NULL,
	"bank_reference" text,
	"paid_at" timestamp with time zone,
	"paid_by" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_edit_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"technician_id" text NOT NULL,
	"changes" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb,
	"device_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"technician_id" text NOT NULL,
	"score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"wrong_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"version" integer NOT NULL,
	"items" jsonb NOT NULL,
	"total" integer NOT NULL,
	"labor_total" integer NOT NULL,
	"parts_total" integer NOT NULL,
	"valid_until" timestamp with time zone,
	"status" text NOT NULL,
	"needs_admin_approval" boolean DEFAULT false NOT NULL,
	"out_of_band" boolean DEFAULT false NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason_code" text NOT NULL,
	"decided_by" text,
	"provider_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"technician_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"direction" text NOT NULL,
	"rating" integer NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comment" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"moderation_status" text DEFAULT 'visible' NOT NULL,
	"hidden_reason" text,
	"reply" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text DEFAULT 'ac' NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"description_ar" text,
	"description_en" text,
	"duration_min" integer,
	"price_guide_min" integer,
	"price_guide_max" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"family_id" text NOT NULL,
	"refresh_hash" text NOT NULL,
	"device_id" text NOT NULL,
	"device_label" text,
	"ip_hash" text,
	"city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"changed_by" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email_index" text,
	"success" boolean NOT NULL,
	"reason" text,
	"ip_hash" text,
	"device" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strikes" (
	"id" text PRIMARY KEY NOT NULL,
	"technician_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"booking_id" text,
	"note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"appeal_status" text,
	"appeal_text" text,
	"created_by" text,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_role" text NOT NULL,
	"booking_id" text,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technician_bank" (
	"technician_id" text PRIMARY KEY NOT NULL,
	"bank_name" text NOT NULL,
	"iban_enc" text NOT NULL,
	"iban_index" text NOT NULL,
	"holder_enc" text NOT NULL,
	"letter_file_id" text,
	"name_mismatch" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technician_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"technician_id" text NOT NULL,
	"type" text NOT NULL,
	"file_id" text NOT NULL,
	"expires_at" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reject_reason" text,
	"reminders_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"wizard_step" integer DEFAULT 1 NOT NULL,
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"full_name_ar_enc" text,
	"full_name_en" text,
	"public_name" text,
	"dob_enc" text,
	"nationality" text,
	"civil_id_enc" text,
	"civil_id_index" text,
	"work_status" text,
	"cr_number_enc" text,
	"photo_file_id" text,
	"bio" text,
	"experience_band" text,
	"own_vehicle" boolean,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"team_size" text,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ac_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brands" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_distance_km" integer,
	"working_days" jsonb DEFAULT '[0,1,2,3,4]'::jsonb NOT NULL,
	"working_hours" jsonb DEFAULT '{"from":"08:00","to":"20:00"}'::jsonb NOT NULL,
	"max_jobs_per_day" integer DEFAULT 4 NOT NULL,
	"vacation_until" timestamp with time zone,
	"available" boolean DEFAULT true NOT NULL,
	"booking_slug" text,
	"commission_override_bps" integer,
	"probation_jobs_left" integer DEFAULT 0 NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"jobs_completed" integer DEFAULT 0 NOT NULL,
	"strikes_count" integer DEFAULT 0 NOT NULL,
	"references_enc" text,
	"emergency_contact_enc" text,
	"work_photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quiz_passed_at" timestamp with time zone,
	"application_submitted_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"needs_info" jsonb,
	"needs_info_message" text,
	"approved_at" timestamp with time zone,
	"paused_reason" text,
	"verifier_checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"phone_enc" text,
	"phone_index" text,
	"email_enc" text,
	"email_index" text,
	"display_name" text,
	"locale" text DEFAULT 'ar' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_login_ip_hash" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"wilayat" text NOT NULL,
	"phone_enc" text NOT NULL,
	"phone_index" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_bank" ADD CONSTRAINT "technician_bank_technician_id_technicians_user_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_documents" ADD CONSTRAINT "technician_documents_technician_id_technicians_user_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_events_booking" ON "booking_events" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_code" ON "bookings" USING btree ("code");--> statement-breakpoint
CREATE INDEX "bookings_customer" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bookings_technician" ON "bookings" USING btree ("technician_id");--> statement-breakpoint
CREATE INDEX "bookings_status" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_entries_booking" ON "ledger_entries" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_tech" ON "ledger_entries" USING btree ("technician_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_tx_idem" ON "ledger_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notifications_user" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_booking_dir" ON "reviews" USING btree ("booking_id","direction");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe" ON "scheduled_jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_due" ON "scheduled_jobs" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh" ON "sessions" USING btree ("refresh_hash");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_iban" ON "technician_bank" USING btree ("iban_index");--> statement-breakpoint
CREATE UNIQUE INDEX "technicians_slug" ON "technicians" USING btree ("booking_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "technicians_civil" ON "technicians" USING btree ("civil_id_index");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_role" ON "users" USING btree ("phone_index","role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_role" ON "users" USING btree ("email_index","role");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_provider_event" ON "webhook_events" USING btree ("provider","event_id");
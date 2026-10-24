CREATE TYPE "public"."booking_source" AS ENUM('priority', 'request', 'walk_in', 'history');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('offered', 'requested', 'confirmed', 'declined', 'expired', 'waitlist', 'cancelled', 'historical');--> statement-breakpoint
CREATE TYPE "public"."contact_kind" AS ENUM('private', 'pro');--> statement-breakpoint
CREATE TYPE "public"."edition_status" AS ENUM('preparation', 'priority', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."presence" AS ENUM('unknown', 'present', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."priority_reason" AS ENUM('last_year', 'resident', 'manual');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer,
	"action" text NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "booking_spots" (
	"booking_id" integer NOT NULL,
	"spot_id" integer NOT NULL,
	"edition_id" integer NOT NULL,
	"released" boolean DEFAULT false NOT NULL,
	CONSTRAINT "booking_spots_booking_id_spot_id_pk" PRIMARY KEY("booking_id","spot_id")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"status" "booking_status" NOT NULL,
	"source" "booking_source" NOT NULL,
	"priority_reason" "priority_reason",
	"tariff_id" integer,
	"amount_due_cents" integer,
	"amount_override_reason" text DEFAULT '' NOT NULL,
	"reference" text NOT NULL,
	"offer_expires_at" timestamp with time zone,
	"requested_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"presence" "presence" DEFAULT 'unknown' NOT NULL,
	"historical_paid" boolean,
	"notes" text DEFAULT '' NOT NULL,
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"street" text DEFAULT '' NOT NULL,
	"house_number" text DEFAULT '' NOT NULL,
	"postcode" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"kind" "contact_kind" DEFAULT 'private' NOT NULL,
	"vat_number" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"gdpr_consent_at" timestamp with time zone,
	"merged_into_id" integer,
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"market_date" date,
	"priority_deadline" date,
	"early_bird_deadline" date,
	"payment_deadline" date,
	"refund_deadline" date,
	"public_opening_date" date,
	"payment_instructions" text DEFAULT '' NOT NULL,
	"iban" text,
	"status" "edition_status" DEFAULT 'preparation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editions_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer,
	"template" text NOT NULL,
	"created_by" integer,
	"status" text DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"contact_id" integer,
	"booking_id" integer,
	"template" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"booking_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_at" date NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_mime" text NOT NULL,
	"image_data" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"default_spot_width" double precision DEFAULT 40 NOT NULL,
	"default_spot_height" double precision DEFAULT 20 NOT NULL,
	"default_spot_length_m" double precision DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resident_links" (
	"contact_id" integer NOT NULL,
	"spot_id" integer NOT NULL,
	"validated_at" timestamp with time zone,
	"validated_by" integer,
	CONSTRAINT "resident_links_contact_id_spot_id_pk" PRIMARY KEY("contact_id","spot_id")
);
--> statement-breakpoint
CREATE TABLE "spot_edition_states" (
	"spot_id" integer NOT NULL,
	"edition_id" integer NOT NULL,
	"inactive_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "spot_edition_states_spot_id_edition_id_pk" PRIMARY KEY("spot_id","edition_id")
);
--> statement-breakpoint
CREATE TABLE "spot_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"choice_rank" integer NOT NULL,
	"spot_ids" integer[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spots" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"street" text DEFAULT '' NOT NULL,
	"side" text DEFAULT '' NOT NULL,
	"length_m" double precision,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"rotation" double precision DEFAULT 0 NOT NULL,
	"facing_addresses" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"kind" "contact_kind" NOT NULL,
	"early_bird" boolean NOT NULL,
	"price_per_spot_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_spots" ADD CONSTRAINT "booking_spots_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_spots" ADD CONSTRAINT "booking_spots_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_spots" ADD CONSTRAINT "booking_spots_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tariff_id_tariffs_id_fk" FOREIGN KEY ("tariff_id") REFERENCES "public"."tariffs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_links" ADD CONSTRAINT "resident_links_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_links" ADD CONSTRAINT "resident_links_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_links" ADD CONSTRAINT "resident_links_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_edition_states" ADD CONSTRAINT "spot_edition_states_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_edition_states" ADD CONSTRAINT "spot_edition_states_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_requests" ADD CONSTRAINT "spot_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_spots_active_unique" ON "booking_spots" USING btree ("edition_id","spot_id") WHERE "booking_spots"."released" = false;--> statement-breakpoint
CREATE INDEX "bookings_edition_idx" ON "bookings" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "bookings_contact_idx" ON "bookings" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contacts_last_name_idx" ON "contacts" USING btree ("last_name");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "email_outbox_queue_idx" ON "email_outbox" USING btree ("status","priority","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spots_label_unique" ON "spots" USING btree (lower("label"));
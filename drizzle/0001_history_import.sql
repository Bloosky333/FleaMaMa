CREATE TABLE "import_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	"uncertain" text[] DEFAULT '{}'::text[] NOT NULL,
	"photo_id" integer,
	"action" text DEFAULT 'auto' NOT NULL,
	"match_contact_id" integer
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "year" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "committed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "import_photos" ADD CONSTRAINT "import_photos_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_photo_id_import_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."import_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_rows_batch_idx" ON "import_rows" USING btree ("batch_id","position");
CREATE TYPE "public"."choix_etape_demarrage" AS ENUM('faite', 'sautee');--> statement-breakpoint
CREATE TABLE "demarrage_etape" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"etape" text NOT NULL,
	"choix" "choix_etape_demarrage" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "demarrage_etape_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "demarrage_etape" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demarrage_etape" ADD CONSTRAINT "demarrage_etape_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "demarrage_etape_organisation_id_etape_key" ON "demarrage_etape" USING btree ("organisation_id","etape");--> statement-breakpoint
CREATE POLICY "demarrage_etape_isolation" ON "demarrage_etape" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
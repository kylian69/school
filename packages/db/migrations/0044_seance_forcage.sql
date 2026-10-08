CREATE TYPE "public"."seance_forcage_code" AS ENUM('salle-occupee', 'groupe-occupe');--> statement-breakpoint
CREATE TABLE "seance_forcage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"seance_id" uuid NOT NULL,
	"code" "seance_forcage_code" NOT NULL,
	"autre_seance_id" uuid NOT NULL,
	"motif" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "seance_forcage_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "seance_forcage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seance_forcage" ADD CONSTRAINT "seance_forcage_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance_forcage" ADD CONSTRAINT "seance_forcage_seance_fk" FOREIGN KEY ("organisation_id","seance_id") REFERENCES "public"."seance"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance_forcage" ADD CONSTRAINT "seance_forcage_autre_seance_fk" FOREIGN KEY ("organisation_id","autre_seance_id") REFERENCES "public"."seance"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seance_forcage_conflit_key" ON "seance_forcage" USING btree ("organisation_id","seance_id","code","autre_seance_id") WHERE "seance_forcage"."deleted_at" is null;--> statement-breakpoint
CREATE POLICY "seance_forcage_isolation" ON "seance_forcage" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
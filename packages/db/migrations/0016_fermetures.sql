CREATE TYPE "public"."fermeture_type" AS ENUM('ferie', 'vacances', 'autre');--> statement-breakpoint
CREATE TABLE "fermeture" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"annee_scolaire_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"type" "fermeture_type" DEFAULT 'vacances' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "fermeture_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "fermeture_dates_check" CHECK ("fermeture"."date_fin" >= "fermeture"."date_debut")
);
--> statement-breakpoint
ALTER TABLE "fermeture" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fermeture_etablissement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"fermeture_id" uuid NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "fermeture_etablissement_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "fermeture_etablissement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fermeture" ADD CONSTRAINT "fermeture_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermeture" ADD CONSTRAINT "fermeture_annee_scolaire_fk" FOREIGN KEY ("organisation_id","annee_scolaire_id") REFERENCES "public"."annee_scolaire"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermeture_etablissement" ADD CONSTRAINT "fermeture_etablissement_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermeture_etablissement" ADD CONSTRAINT "fermeture_etablissement_fermeture_fk" FOREIGN KEY ("organisation_id","fermeture_id") REFERENCES "public"."fermeture"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermeture_etablissement" ADD CONSTRAINT "fermeture_etablissement_etablissement_fk" FOREIGN KEY ("organisation_id","etablissement_id") REFERENCES "public"."etablissement"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fermeture_organisation_id_annee_scolaire_id_idx" ON "fermeture" USING btree ("organisation_id","annee_scolaire_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fermeture_etablissement_paire_key" ON "fermeture_etablissement" USING btree ("organisation_id","fermeture_id","etablissement_id");--> statement-breakpoint
CREATE POLICY "fermeture_isolation" ON "fermeture" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "fermeture_etablissement_isolation" ON "fermeture_etablissement" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
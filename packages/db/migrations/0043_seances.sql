CREATE TYPE "public"."seance_statut" AS ENUM('brouillon', 'publiee', 'annulee', 'reportee');--> statement-breakpoint
CREATE TYPE "public"."seance_type" AS ENUM('cm', 'td', 'tp', 'projet', 'examen');--> statement-breakpoint
CREATE TABLE "seance_serie" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"jours_semaine" smallint[] NOT NULL,
	"intervalle_semaines" smallint DEFAULT 1 NOT NULL,
	"heure_debut" time NOT NULL,
	"heure_fin" time NOT NULL,
	"sauter_jours_entreprise" boolean DEFAULT false NOT NULL,
	"jours_exclus" date[] DEFAULT '{}'::date[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "seance_serie_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "seance_serie_regle_check" CHECK ("seance_serie"."date_fin" >= "seance_serie"."date_debut" and "seance_serie"."heure_fin" > "seance_serie"."heure_debut" and "seance_serie"."intervalle_semaines" >= 1 and cardinality("seance_serie"."jours_semaine") > 0)
);
--> statement-breakpoint
ALTER TABLE "seance_serie" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "statut" "seance_statut" DEFAULT 'publiee' NOT NULL;--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "type" "seance_type";--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "module_id" uuid;--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "activite" text;--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "salle_id" uuid;--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "lien_visio" text;--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "motif_annulation" text;--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "serie_id" uuid;--> statement-breakpoint
ALTER TABLE "seance_serie" ADD CONSTRAINT "seance_serie_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance_serie" ADD CONSTRAINT "seance_serie_etablissement_fk" FOREIGN KEY ("organisation_id","etablissement_id") REFERENCES "public"."etablissement"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seance_serie_etablissement_idx" ON "seance_serie" USING btree ("organisation_id","etablissement_id");--> statement-breakpoint
ALTER TABLE "seance" ADD CONSTRAINT "seance_module_fk" FOREIGN KEY ("organisation_id","module_id") REFERENCES "public"."maquette_module"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance" ADD CONSTRAINT "seance_salle_fk" FOREIGN KEY ("organisation_id","salle_id") REFERENCES "public"."salle"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance" ADD CONSTRAINT "seance_serie_fk" FOREIGN KEY ("organisation_id","serie_id") REFERENCES "public"."seance_serie"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seance_serie_idx" ON "seance" USING btree ("organisation_id","serie_id");--> statement-breakpoint
ALTER TABLE "seance" ADD CONSTRAINT "seance_annulation_check" CHECK ("seance"."statut" <> 'annulee' or "seance"."motif_annulation" is not null);--> statement-breakpoint
CREATE POLICY "seance_serie_isolation" ON "seance_serie" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
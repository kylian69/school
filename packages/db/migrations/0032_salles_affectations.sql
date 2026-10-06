CREATE TYPE "public"."salle_statut" AS ENUM('disponible', 'fermee');--> statement-breakpoint
CREATE TYPE "public"."salle_type" AS ENUM('cours', 'tp_informatique', 'laboratoire', 'amphitheatre', 'virtuelle');--> statement-breakpoint
CREATE TABLE "affectation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"heures_cm" numeric(7, 2) DEFAULT 0 NOT NULL,
	"heures_td" numeric(7, 2) DEFAULT 0 NOT NULL,
	"heures_tp" numeric(7, 2) DEFAULT 0 NOT NULL,
	"heures_projet" numeric(7, 2) DEFAULT 0 NOT NULL,
	"heures_elearning" numeric(7, 2) DEFAULT 0 NOT NULL,
	"reconduite_de" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "affectation_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "affectation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "affectation_groupe" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"affectation_id" uuid NOT NULL,
	"groupe_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "affectation_groupe_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "affectation_groupe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "salle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"capacite" integer,
	"type" "salle_type" DEFAULT 'cours' NOT NULL,
	"equipements" text[] DEFAULT '{}'::text[] NOT NULL,
	"pmr" boolean DEFAULT false NOT NULL,
	"statut" "salle_statut" DEFAULT 'disponible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "salle_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "salle_capacite_check" CHECK ("salle"."capacite" is null or "salle"."capacite" > 0)
);
--> statement-breakpoint
ALTER TABLE "salle" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "affectation" ADD CONSTRAINT "affectation_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectation" ADD CONSTRAINT "affectation_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectation" ADD CONSTRAINT "affectation_module_fk" FOREIGN KEY ("organisation_id","module_id") REFERENCES "public"."maquette_module"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectation" ADD CONSTRAINT "affectation_promotion_fk" FOREIGN KEY ("organisation_id","promotion_id") REFERENCES "public"."promotion"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectation_groupe" ADD CONSTRAINT "affectation_groupe_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectation_groupe" ADD CONSTRAINT "affectation_groupe_affectation_fk" FOREIGN KEY ("organisation_id","affectation_id") REFERENCES "public"."affectation"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectation_groupe" ADD CONSTRAINT "affectation_groupe_groupe_fk" FOREIGN KEY ("organisation_id","groupe_id") REFERENCES "public"."groupe_eleves"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salle" ADD CONSTRAINT "salle_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salle" ADD CONSTRAINT "salle_etablissement_fk" FOREIGN KEY ("organisation_id","etablissement_id") REFERENCES "public"."etablissement"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affectation_promotion_idx" ON "affectation" USING btree ("organisation_id","promotion_id");--> statement-breakpoint
CREATE INDEX "affectation_personne_idx" ON "affectation" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affectation_groupe_paire_key" ON "affectation_groupe" USING btree ("organisation_id","affectation_id","groupe_id");--> statement-breakpoint
CREATE INDEX "salle_etablissement_idx" ON "salle" USING btree ("organisation_id","etablissement_id");--> statement-breakpoint
CREATE POLICY "affectation_isolation" ON "affectation" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "affectation_groupe_isolation" ON "affectation_groupe" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "salle_isolation" ON "salle" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
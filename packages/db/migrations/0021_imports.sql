CREATE TYPE "public"."statut_import" AS ENUM('en_preparation', 'valide', 'annule');--> statement-breakpoint
CREATE TYPE "public"."type_import" AS ENUM('apprenants', 'intervenants', 'personnel');--> statement-breakpoint
CREATE TABLE "import_personnes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"type" "type_import" NOT NULL,
	"statut" "statut_import" DEFAULT 'en_preparation' NOT NULL,
	"fichier_cle" text NOT NULL,
	"fichier_nom" text NOT NULL,
	"fichier_type" text NOT NULL,
	"colonnes" jsonb NOT NULL,
	"correspondance" jsonb NOT NULL,
	"lignes" integer NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"valide_le" timestamp with time zone,
	"annule_le" timestamp with time zone,
	"crees" integer,
	"modifies" integer,
	"rejetes" integer,
	"resultat" jsonb,
	"rapport" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "import_personnes_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "import_personnes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "import_personnes" ADD CONSTRAINT "import_personnes_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_personnes_organisation_id_created_at_idx" ON "import_personnes" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE POLICY "import_personnes_isolation" ON "import_personnes" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
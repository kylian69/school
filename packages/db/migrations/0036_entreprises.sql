CREATE TYPE "public"."contact_entreprise_type" AS ENUM('rh', 'dirigeant', 'tuteur', 'autre');--> statement-breakpoint
CREATE TYPE "public"."entreprise_statut" AS ENUM('active', 'fermee');--> statement-breakpoint
CREATE TABLE "contact_entreprise" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entreprise_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"type" "contact_entreprise_type" NOT NULL,
	"fonction" text,
	"dans_entreprise_depuis" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contact_entreprise_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "contact_entreprise" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entreprise" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"siret" char(14) NOT NULL,
	"siren" char(9) NOT NULL,
	"raison_sociale" text NOT NULL,
	"adresse" text,
	"code_postal" text,
	"ville" text,
	"naf" text,
	"effectif" text,
	"idcc" char(4),
	"opco" text,
	"statut" "entreprise_statut" DEFAULT 'active' NOT NULL,
	"a_verifier" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entreprise_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "entreprise" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_entreprise" ADD CONSTRAINT "contact_entreprise_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_entreprise" ADD CONSTRAINT "contact_entreprise_entreprise_fk" FOREIGN KEY ("organisation_id","entreprise_id") REFERENCES "public"."entreprise"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_entreprise" ADD CONSTRAINT "contact_entreprise_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entreprise" ADD CONSTRAINT "entreprise_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_entreprise_paire_key" ON "contact_entreprise" USING btree ("organisation_id","entreprise_id","personne_id") WHERE "contact_entreprise"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "contact_entreprise_personne_idx" ON "contact_entreprise" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entreprise_siret_key" ON "entreprise" USING btree ("organisation_id","siret") WHERE "entreprise"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "entreprise_siren_idx" ON "entreprise" USING btree ("organisation_id","siren");--> statement-breakpoint
CREATE POLICY "contact_entreprise_isolation" ON "contact_entreprise" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "entreprise_isolation" ON "entreprise" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
CREATE TYPE "public"."correspondance_edt_nature" AS ENUM('module', 'public', 'salle', 'intervenant');--> statement-breakpoint
CREATE TABLE "correspondance_edt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"nature" "correspondance_edt_nature" NOT NULL,
	"libelle" text NOT NULL,
	"cle" text NOT NULL,
	"objet_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "correspondance_edt_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "correspondance_edt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "identifiant_externe" text;--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "empreinte_import" text;--> statement-breakpoint
ALTER TABLE "correspondance_edt" ADD CONSTRAINT "correspondance_edt_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "correspondance_edt_cle_key" ON "correspondance_edt" USING btree ("organisation_id","nature","cle") WHERE "correspondance_edt"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "seance_identifiant_externe_key" ON "seance" USING btree ("organisation_id","identifiant_externe") WHERE "seance"."identifiant_externe" is not null and "seance"."deleted_at" is null;--> statement-breakpoint
CREATE POLICY "correspondance_edt_isolation" ON "correspondance_edt" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
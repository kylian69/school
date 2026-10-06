CREATE TYPE "public"."compte_etat" AS ENUM('cree', 'invite', 'actif', 'desactive');--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"jeton_empreinte" text NOT NULL,
	"email" text NOT NULL,
	"envoyee_le" timestamp with time zone DEFAULT now() NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"relances" integer DEFAULT 0 NOT NULL,
	"derniere_relance_le" timestamp with time zone,
	"acceptee_le" timestamp with time zone,
	"revoquee_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "invitation_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "compte_etat" "compte_etat" DEFAULT 'cree' NOT NULL;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "conditions_acceptees_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_organisation_id_jeton_empreinte_key" ON "invitation" USING btree ("organisation_id","jeton_empreinte");--> statement-breakpoint
CREATE INDEX "invitation_organisation_id_personne_id_idx" ON "invitation" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE POLICY "invitation_isolation" ON "invitation" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
CREATE TABLE "appel_validation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"seance_id" uuid NOT NULL,
	"version" smallint NOT NULL,
	"valide_par" uuid NOT NULL,
	"valide_le" timestamp with time zone NOT NULL,
	"adresse_ip" text NOT NULL,
	"appareil" text NOT NULL,
	"empreinte" text NOT NULL,
	"liste" jsonb NOT NULL,
	"motif" text,
	"commentaire" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "appel_validation_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "appel_validation_motif_check" CHECK (("appel_validation"."version" = 1) = ("appel_validation"."motif" is null))
);
--> statement-breakpoint
ALTER TABLE "appel_validation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "presence" ADD COLUMN "retard_minutes" smallint;--> statement-breakpoint
ALTER TABLE "presence_marquage" ADD COLUMN "non_attendu" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appel_validation" ADD CONSTRAINT "appel_validation_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appel_validation" ADD CONSTRAINT "appel_validation_seance_fk" FOREIGN KEY ("organisation_id","seance_id") REFERENCES "public"."seance"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appel_validation" ADD CONSTRAINT "appel_validation_valide_par_fk" FOREIGN KEY ("organisation_id","valide_par") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appel_validation_version_key" ON "appel_validation" USING btree ("organisation_id","seance_id","version");--> statement-breakpoint
CREATE POLICY "appel_validation_isolation" ON "appel_validation" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- RG-06-13 et module 06, section 9 : une version validée de l'appel est inaltérable ; une
-- correction ajoute une version.
REVOKE UPDATE, DELETE, TRUNCATE ON "appel_validation" FROM scolaly_app;

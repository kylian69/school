CREATE TYPE "public"."presence_marquage_statut" AS ENUM('present', 'retard', 'absent');--> statement-breakpoint
CREATE TABLE "presence_marquage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"seance_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"statut" "presence_marquage_statut" NOT NULL,
	"minutes_retard" smallint,
	"marque_par" uuid NOT NULL,
	"marque_le" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "presence_marquage_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "presence_marquage_retard_check" CHECK (("presence_marquage"."statut" = 'retard') = ("presence_marquage"."minutes_retard" is not null and "presence_marquage"."minutes_retard" > 0))
);
--> statement-breakpoint
ALTER TABLE "presence_marquage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "presence_marquage" ADD CONSTRAINT "presence_marquage_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_marquage" ADD CONSTRAINT "presence_marquage_seance_fk" FOREIGN KEY ("organisation_id","seance_id") REFERENCES "public"."seance"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_marquage" ADD CONSTRAINT "presence_marquage_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_marquage" ADD CONSTRAINT "presence_marquage_marque_par_fk" FOREIGN KEY ("organisation_id","marque_par") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presence_marquage_unique_key" ON "presence_marquage" USING btree ("organisation_id","seance_id","personne_id");--> statement-breakpoint
CREATE POLICY "presence_marquage_isolation" ON "presence_marquage" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
CREATE TABLE "disponibilite_intervenant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"jour_semaine" smallint NOT NULL,
	"heure_debut" time NOT NULL,
	"heure_fin" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "disponibilite_intervenant_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "disponibilite_intervenant_creneau_check" CHECK ("disponibilite_intervenant"."jour_semaine" between 1 and 7 and "disponibilite_intervenant"."heure_fin" > "disponibilite_intervenant"."heure_debut")
);
--> statement-breakpoint
ALTER TABLE "disponibilite_intervenant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "indisponibilite_intervenant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"debut" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "indisponibilite_intervenant_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "indisponibilite_intervenant_dates_check" CHECK ("indisponibilite_intervenant"."fin" > "indisponibilite_intervenant"."debut")
);
--> statement-breakpoint
ALTER TABLE "indisponibilite_intervenant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "disponibilite_intervenant" ADD CONSTRAINT "disponibilite_intervenant_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilite_intervenant" ADD CONSTRAINT "disponibilite_intervenant_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indisponibilite_intervenant" ADD CONSTRAINT "indisponibilite_intervenant_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indisponibilite_intervenant" ADD CONSTRAINT "indisponibilite_intervenant_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disponibilite_intervenant_personne_idx" ON "disponibilite_intervenant" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE INDEX "indisponibilite_intervenant_personne_idx" ON "indisponibilite_intervenant" USING btree ("organisation_id","personne_id","debut");--> statement-breakpoint
CREATE POLICY "disponibilite_intervenant_isolation" ON "disponibilite_intervenant" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "indisponibilite_intervenant_isolation" ON "indisponibilite_intervenant" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
CREATE TABLE "flux_ical" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"jeton_empreinte" text,
	"regenere_le" timestamp with time zone,
	"revoque_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "flux_ical_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "flux_ical" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flux_ical" ADD CONSTRAINT "flux_ical_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flux_ical" ADD CONSTRAINT "flux_ical_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flux_ical_personne_key" ON "flux_ical" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flux_ical_jeton_empreinte_key" ON "flux_ical" USING btree ("organisation_id","jeton_empreinte") WHERE "flux_ical"."jeton_empreinte" is not null;--> statement-breakpoint
CREATE POLICY "flux_ical_isolation" ON "flux_ical" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
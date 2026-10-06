CREATE TABLE "seance_public" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"seance_id" uuid NOT NULL,
	"promotion_id" uuid,
	"groupe_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "seance_public_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "seance_public_cible_check" CHECK (("seance_public"."promotion_id" is null) <> ("seance_public"."groupe_id" is null))
);
--> statement-breakpoint
ALTER TABLE "seance_public" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seance_public" ADD CONSTRAINT "seance_public_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance_public" ADD CONSTRAINT "seance_public_seance_fk" FOREIGN KEY ("organisation_id","seance_id") REFERENCES "public"."seance"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance_public" ADD CONSTRAINT "seance_public_promotion_fk" FOREIGN KEY ("organisation_id","promotion_id") REFERENCES "public"."promotion"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance_public" ADD CONSTRAINT "seance_public_groupe_fk" FOREIGN KEY ("organisation_id","groupe_id") REFERENCES "public"."groupe_eleves"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seance_public_seance_idx" ON "seance_public" USING btree ("organisation_id","seance_id");--> statement-breakpoint
CREATE POLICY "seance_public_isolation" ON "seance_public" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
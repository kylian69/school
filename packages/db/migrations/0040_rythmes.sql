CREATE TABLE "calendrier_alternance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"modele" text NOT NULL,
	"jours" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "calendrier_alternance_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "calendrier_alternance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exception_rythme" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"inscription_id" uuid NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL,
	"motif" text,
	"jours" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "exception_rythme_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "exception_rythme_dates_check" CHECK ("exception_rythme"."fin" >= "exception_rythme"."debut")
);
--> statement-breakpoint
ALTER TABLE "exception_rythme" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "modele_rythme" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"motif" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "modele_rythme_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "modele_rythme" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calendrier_alternance" ADD CONSTRAINT "calendrier_alternance_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendrier_alternance" ADD CONSTRAINT "calendrier_alternance_promotion_fk" FOREIGN KEY ("organisation_id","promotion_id") REFERENCES "public"."promotion"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception_rythme" ADD CONSTRAINT "exception_rythme_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception_rythme" ADD CONSTRAINT "exception_rythme_inscription_fk" FOREIGN KEY ("organisation_id","inscription_id") REFERENCES "public"."inscription"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modele_rythme" ADD CONSTRAINT "modele_rythme_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendrier_alternance_promotion_key" ON "calendrier_alternance" USING btree ("organisation_id","promotion_id") WHERE "calendrier_alternance"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "exception_rythme_inscription_idx" ON "exception_rythme" USING btree ("organisation_id","inscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modele_rythme_libelle_key" ON "modele_rythme" USING btree ("organisation_id","libelle") WHERE "modele_rythme"."deleted_at" is null;--> statement-breakpoint
CREATE POLICY "calendrier_alternance_isolation" ON "calendrier_alternance" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "exception_rythme_isolation" ON "exception_rythme" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "modele_rythme_isolation" ON "modele_rythme" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
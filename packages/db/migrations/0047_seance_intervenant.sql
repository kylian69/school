CREATE TABLE "seance_intervenant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"seance_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "seance_intervenant_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "seance_intervenant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seance_intervenant" ADD CONSTRAINT "seance_intervenant_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance_intervenant" ADD CONSTRAINT "seance_intervenant_seance_fk" FOREIGN KEY ("organisation_id","seance_id") REFERENCES "public"."seance"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance_intervenant" ADD CONSTRAINT "seance_intervenant_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seance_intervenant_paire_key" ON "seance_intervenant" USING btree ("organisation_id","seance_id","personne_id") WHERE "seance_intervenant"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "seance_intervenant_personne_idx" ON "seance_intervenant" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE POLICY "seance_intervenant_isolation" ON "seance_intervenant" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- Bascule (« ajouter, basculer, retirer ») : l'intervenant unique de chaque séance existante devient
-- sa première ligne de seance_intervenant. La colonne seance.intervenant_id reste écrite (premier
-- intervenant) pour les versions précédentes ; son retrait refera ce report pour les séances
-- créées entre-temps par une version précédente, avant de supprimer la colonne.
INSERT INTO "seance_intervenant" ("id", "organisation_id", "seance_id", "personne_id", "created_at", "created_by")
SELECT gen_random_uuid(), s."organisation_id", s."id", s."intervenant_id", s."created_at", s."created_by"
FROM "seance" s
WHERE s."intervenant_id" IS NOT NULL;

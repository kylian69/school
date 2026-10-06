ALTER TABLE "organisation" ADD COLUMN "modele_matricule" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "matricule_compteur" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "matricule" text;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "ine" char(11);--> statement-breakpoint
CREATE UNIQUE INDEX "personne_organisation_id_matricule_key" ON "personne" USING btree ("organisation_id","matricule") WHERE "personne"."matricule" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "personne_organisation_id_ine_key" ON "personne" USING btree ("organisation_id","ine") WHERE "personne"."ine" is not null and "personne"."deleted_at" is null;--> statement-breakpoint
-- RG-01-06 : l'école choisit son modèle de matricule et le compteur avance à chaque attribution.
GRANT UPDATE ("modele_matricule", "matricule_compteur") ON "organisation" TO scolaly_app;

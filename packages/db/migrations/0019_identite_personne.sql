CREATE TYPE "public"."civilite" AS ENUM('madame', 'monsieur');--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "civilite" "civilite";--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "date_naissance" date;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "lieu_naissance" text;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "telephone" text;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "adresse_ligne1" text;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "code_postal" text;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "ville" text;--> statement-breakpoint
CREATE INDEX "personne_organisation_id_nom_prenom_idx" ON "personne" USING btree ("organisation_id",lower("nom"),lower("prenom"));
ALTER TABLE "organisation" ADD COLUMN "couleur_principale" char(7);--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "logo_cle" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "logo_type" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "logo_empreinte" char(64);--> statement-breakpoint
-- L'école personnalise son apparence (US-01-14) : droit de mise à jour sur ces seules colonnes.
GRANT UPDATE ("couleur_principale", "logo_cle", "logo_type", "logo_empreinte") ON "organisation" TO scolaly_app;

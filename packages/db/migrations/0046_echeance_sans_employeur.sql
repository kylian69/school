ALTER TABLE "inscription_statut" ADD COLUMN "echeance" date;--> statement-breakpoint
-- Périodes « apprenti sans employeur » déjà enregistrées : leur fin était l'échéance légale.
UPDATE "inscription_statut" SET "echeance" = "fin" WHERE "statut" = 'apprenti_sans_employeur' AND "fin" IS NOT NULL;

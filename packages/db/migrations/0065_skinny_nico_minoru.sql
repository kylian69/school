CREATE TYPE "public"."seance_mode_presence" AS ENUM('presentiel', 'distanciel', 'hybride');--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "mode_presence" "seance_mode_presence" DEFAULT 'presentiel' NOT NULL;--> statement-breakpoint
-- RG-06-08 : reprise des séances existantes. Seule la case « à distance » est reprise ; une séance
-- qui n'était hybride que par son lien de visio redevient présentielle (contrôle de localisation
-- normal) : l'option la plus prudente, à remarquer hybride dans l'emploi du temps au besoin.
UPDATE "seance" SET "mode_presence" = 'distanciel' WHERE "distanciel";

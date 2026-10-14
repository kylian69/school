CREATE TYPE "public"."appel_correction_verrouillee" AS ENUM('ecole', 'intervenant');--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "emargement_correction_verrouillee_jours" smallint;--> statement-breakpoint
ALTER TABLE "appel_validation" ADD COLUMN "correction_verrouillee" "appel_correction_verrouillee";--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_emargement_correction_verrouillee_jours_check" CHECK ("organisation"."emargement_correction_verrouillee_jours" between 7 and 90);--> statement-breakpoint
ALTER TABLE "appel_validation" ADD CONSTRAINT "appel_validation_correction_verrouillee_check" CHECK ("appel_validation"."correction_verrouillee" is null or "appel_validation"."version" > 1);--> statement-breakpoint
-- Réglage de l'école (RG-06-15), modifiable par l'API comme les autres colonnes de l'école.
GRANT UPDATE ("emargement_correction_verrouillee_jours") ON "organisation" TO scolaly_app;--> statement-breakpoint
-- RG-06-15 : droit spécifique de corriger un appel verrouillé, donné aux rôles par défaut des écoles
-- existantes : corps pédagogique (responsable pédagogique, scolarité) et intervenant, pour ses
-- propres séances (contracts, ROLES_PAR_DEFAUT). L'administrateur ne le reçoit pas par défaut.
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", 'emargement:corriger-verrouille'
FROM "role" r
WHERE r."code" IN ('responsable-pedagogique', 'scolarite', 'intervenant')
  AND r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = 'emargement:corriger-verrouille'
  );

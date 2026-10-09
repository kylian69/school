ALTER TABLE "disponibilite_intervenant" ADD COLUMN "valable_du" date;--> statement-breakpoint
ALTER TABLE "disponibilite_intervenant" ADD COLUMN "valable_au" date;--> statement-breakpoint
ALTER TABLE "indisponibilite_intervenant" ADD COLUMN "motif_chiffre" text;--> statement-breakpoint
ALTER TABLE "disponibilite_intervenant" ADD CONSTRAINT "disponibilite_intervenant_validite_check" CHECK ("disponibilite_intervenant"."valable_du" is null or "disponibilite_intervenant"."valable_au" is null or "disponibilite_intervenant"."valable_au" >= "disponibilite_intervenant"."valable_du");--> statement-breakpoint
-- RG-04-18 : l'intervenant déclare ses disponibilités (module 04, section 2) ; permission donnée au
-- rôle par défaut des écoles existantes (contracts, ROLES_PAR_DEFAUT).
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", 'disponibilites:declarer'
FROM "role" r
WHERE r."code" = 'intervenant'
  AND r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = 'disponibilites:declarer'
  );

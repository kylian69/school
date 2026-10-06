-- Permission « emargement:animer » (module 06) donnée aux rôles par défaut des écoles existantes :
-- administration, responsable pédagogique, scolarité et intervenant (contracts, ROLES_PAR_DEFAUT).
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", 'emargement:animer'
FROM "role" r
WHERE r."code" IN ('administrateur', 'responsable-pedagogique', 'scolarite', 'intervenant')
  AND r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = 'emargement:animer'
  );

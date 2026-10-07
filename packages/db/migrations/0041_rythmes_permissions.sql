-- Permissions des rythmes d'alternance (module 03, section 2) données aux rôles par défaut des écoles
-- existantes (contracts, ROLES_PAR_DEFAUT).
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", p."permission"
FROM "role" r
JOIN (VALUES
  ('administrateur', 'rythmes:lire'),
  ('administrateur', 'rythmes:gerer'),
  ('direction', 'rythmes:lire'),
  ('responsable-pedagogique', 'rythmes:lire'),
  ('responsable-pedagogique', 'rythmes:gerer'),
  ('scolarite', 'rythmes:lire')
) AS p("code", "permission") ON p."code" = r."code"
WHERE r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = p."permission"
  );

-- Permissions des promotions et inscriptions (module 02, section 2) données aux rôles par défaut
-- des écoles existantes (contracts, ROLES_PAR_DEFAUT).
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", p."permission"
FROM "role" r
JOIN (VALUES
  ('administrateur', 'promotions:lire'),
  ('administrateur', 'promotions:gerer'),
  ('administrateur', 'promotions:changer-version'),
  ('direction', 'promotions:lire'),
  ('responsable-pedagogique', 'promotions:lire'),
  ('responsable-pedagogique', 'promotions:gerer'),
  ('scolarite', 'promotions:lire'),
  ('scolarite', 'promotions:gerer')
) AS p("code", "permission") ON p."code" = r."code"
WHERE r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = p."permission"
  );

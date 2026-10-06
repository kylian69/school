-- Permissions du module 02 (référentiel) données aux rôles par défaut des écoles existantes,
-- selon la matrice de la section 2 (contracts, ROLES_PAR_DEFAUT).
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", p."permission"
FROM "role" r
JOIN (VALUES
  ('administrateur', 'referentiel:lire'),
  ('administrateur', 'referentiel:gerer'),
  ('administrateur', 'referentiel:publier'),
  ('administrateur', 'referentiel:parametrer'),
  ('direction', 'referentiel:lire'),
  ('responsable-pedagogique', 'referentiel:lire'),
  ('responsable-pedagogique', 'referentiel:gerer'),
  ('responsable-pedagogique', 'referentiel:publier'),
  ('scolarite', 'referentiel:lire')
) AS p("code", "permission") ON p."code" = r."code"
WHERE r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = p."permission"
  );

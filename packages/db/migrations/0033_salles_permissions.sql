-- Permissions des salles et des affectations (module 02, section 2) données aux rôles par défaut
-- des écoles existantes (contracts, ROLES_PAR_DEFAUT).
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", p."permission"
FROM "role" r
JOIN (VALUES
  ('administrateur', 'salles:lire'),
  ('administrateur', 'salles:gerer'),
  ('administrateur', 'affectations:gerer'),
  ('direction', 'salles:lire'),
  ('responsable-pedagogique', 'salles:lire'),
  ('responsable-pedagogique', 'affectations:gerer'),
  ('scolarite', 'salles:lire'),
  ('scolarite', 'salles:gerer'),
  ('intervenant', 'salles:lire')
) AS p("code", "permission") ON p."code" = r."code"
WHERE r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = p."permission"
  );
--> statement-breakpoint
-- RG-02-19 : une salle virtuelle (à distance) existe par défaut dans chaque établissement.
INSERT INTO "salle" ("id", "organisation_id", "etablissement_id", "nom", "type")
SELECT gen_random_uuid(), e."organisation_id", e."id", 'Salle virtuelle (à distance)', 'virtuelle'
FROM "etablissement" e
WHERE NOT EXISTS (
  SELECT 1 FROM "salle" s
  WHERE s."organisation_id" = e."organisation_id"
    AND s."etablissement_id" = e."id"
    AND s."type" = 'virtuelle'
);

-- I4.4 : téléchargement des feuilles d'émargement et des récapitulatifs mensuels (US-06-11),
-- donné aux rôles par défaut des écoles existantes selon la matrice du module 06 (contracts,
-- ROLES_PAR_DEFAUT) : administrateur, responsable pédagogique et scolarité sur leur périmètre,
-- intervenant sur ses seules séances. Ni l'apprenant (ses récapitulatifs sans permission), ni le
-- tuteur.
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", 'emargement:feuilles'
FROM "role" r
WHERE r."code" IN ('administrateur', 'responsable-pedagogique', 'scolarite', 'intervenant')
  AND r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = 'emargement:feuilles'
  );

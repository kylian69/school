-- Apprenants attendus à une séance (RG-06-04), calculés à partir du public de la séance (I3.2) :
-- inscrits (hors pré-inscriptions) entrés et pas encore sortis le jour de la séance (fins
-- exclues, RG-02-17 : une sortie n'efface pas les séances antérieures), de la promotion visée ou
-- membres du groupe visé ce jour-là. security_invoker : la RLS des tables lues s'applique à l'appelant.
-- Bascule : les lignes historiques de seance_attendu restent lues jusqu'au retrait de la table.
CREATE VIEW "seance_attendu_calcule" WITH (security_invoker = true) AS
SELECT s."organisation_id", s."id" AS "seance_id", i."personne_id"
FROM "seance" s
JOIN "seance_public" sp
  ON sp."organisation_id" = s."organisation_id" AND sp."seance_id" = s."id" AND sp."deleted_at" IS NULL
JOIN "inscription" i
  ON i."organisation_id" = s."organisation_id"
  AND i."deleted_at" IS NULL
  AND i."etat" <> 'preinscrit'
  AND i."date_entree" <= (s."debut" AT TIME ZONE 'Europe/Paris')::date
  AND (i."date_sortie" IS NULL OR (s."debut" AT TIME ZONE 'Europe/Paris')::date < i."date_sortie")
WHERE (sp."promotion_id" IS NOT NULL AND i."promotion_id" = sp."promotion_id")
   OR (sp."groupe_id" IS NOT NULL AND EXISTS (
     SELECT 1 FROM "groupe_membre" gm
     WHERE gm."organisation_id" = s."organisation_id"
       AND gm."groupe_id" = sp."groupe_id"
       AND gm."inscription_id" = i."id"
       AND gm."deleted_at" IS NULL
       AND gm."debut" <= (s."debut" AT TIME ZONE 'Europe/Paris')::date
       AND (gm."fin" IS NULL OR (s."debut" AT TIME ZONE 'Europe/Paris')::date < gm."fin")
   ))
UNION
SELECT sa."organisation_id", sa."seance_id", sa."personne_id"
FROM "seance_attendu" sa
WHERE sa."deleted_at" IS NULL;
--> statement-breakpoint
-- Lecture seule pour l'application (les privilèges par défaut donnent aussi l'écriture).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "seance_attendu_calcule" FROM scolaly_app;

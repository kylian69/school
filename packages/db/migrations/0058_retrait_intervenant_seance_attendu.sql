-- Étape « retirer » de deux bascules terminées (« ajouter, basculer, retirer »).
--
-- 1) Table provisoire seance_attendu (P2), remplacée par les attendus calculés (I3.2, 0035).
-- Garde-fou : aucune ligne encore active ne doit disparaître des attendus calculés ; sinon la
-- migration s'arrête (rien n'est modifié) pour que l'exploitant décide de ces lignes.
DO $$
DECLARE
  perdues integer;
BEGIN
  SELECT count(*) INTO perdues
  FROM "seance_attendu" sa
  WHERE sa."deleted_at" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "seance" s
      JOIN "seance_public" sp
        ON sp."organisation_id" = s."organisation_id" AND sp."seance_id" = s."id" AND sp."deleted_at" IS NULL
      JOIN "inscription" i
        ON i."organisation_id" = s."organisation_id"
        AND i."deleted_at" IS NULL
        AND i."etat" <> 'preinscrit'
        AND i."date_entree" <= (s."debut" AT TIME ZONE 'Europe/Paris')::date
        AND (i."date_sortie" IS NULL OR (s."debut" AT TIME ZONE 'Europe/Paris')::date < i."date_sortie")
      WHERE s."organisation_id" = sa."organisation_id" AND s."id" = sa."seance_id"
        AND i."personne_id" = sa."personne_id"
        AND ((sp."promotion_id" IS NOT NULL AND i."promotion_id" = sp."promotion_id")
          OR (sp."groupe_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM "groupe_membre" gm
            WHERE gm."organisation_id" = s."organisation_id"
              AND gm."groupe_id" = sp."groupe_id"
              AND gm."inscription_id" = i."id"
              AND gm."deleted_at" IS NULL
              AND gm."debut" <= (s."debut" AT TIME ZONE 'Europe/Paris')::date
              AND (gm."fin" IS NULL OR (s."debut" AT TIME ZONE 'Europe/Paris')::date < gm."fin")
          )))
    );
  IF perdues > 0 THEN
    RAISE EXCEPTION 'Migration 0058 arrêtée : % apprenant(s) attendu(s) saisi(s) un à un (table seance_attendu) ne sont couverts par aucune inscription ni aucun public de séance. Rattachez ces apprenants à la promotion ou au groupe de la séance, ou supprimez ces lignes (deleted_at), puis relancez la mise à jour.', perdues;
  END IF;
END $$;
--> statement-breakpoint
-- La vue est recréée sans l'union, avant la suppression de la table qu'elle lisait. Mêmes
-- colonnes : les droits et la version en cours restent valables. DISTINCT conserve le
-- dédoublonnage que faisait l'UNION (promotion et groupe visés ensemble par une même séance).
CREATE OR REPLACE VIEW "seance_attendu_calcule" WITH (security_invoker = true) AS
SELECT DISTINCT s."organisation_id", s."id" AS "seance_id", i."personne_id"
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
   ));
--> statement-breakpoint
DROP POLICY "seance_attendu_isolation" ON "seance_attendu";--> statement-breakpoint
DROP TABLE "seance_attendu";--> statement-breakpoint
-- 2) Colonne seance.intervenant_id, remplacée par seance_intervenant (0047). Report refait pour les
-- séances créées depuis par une version antérieure à 0047 (idempotent : seulement les séances
-- sans aucune ligne de liaison, même supprimée).
INSERT INTO "seance_intervenant" ("id", "organisation_id", "seance_id", "personne_id", "created_at", "created_by")
SELECT gen_random_uuid(), s."organisation_id", s."id", s."intervenant_id", s."created_at", s."created_by"
FROM "seance" s
WHERE s."intervenant_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "seance_intervenant" si
    WHERE si."organisation_id" = s."organisation_id" AND si."seance_id" = s."id"
  );
--> statement-breakpoint
ALTER TABLE "seance" DROP CONSTRAINT "seance_intervenant_fk";
--> statement-breakpoint
-- La colonne elle-même reste en base pour cette version : la version en cours pendant la mise à
-- jour la lit et l'écrit encore (lecture de seance colonne par colonne, préchargement de
-- l'émargement compris). Elle n'est plus ni lue ni écrite à partir d'ici, ne figure plus dans le
-- schéma, et sera supprimée par une migration manuelle de la version suivante, qui refera ce report.

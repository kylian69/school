ALTER TABLE "organisation" ADD COLUMN "edt_badge_modifie_jours" smallint;--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_edt_badge_modifie_jours_check" CHECK ("organisation"."edt_badge_modifie_jours" between 0 and 60);--> statement-breakpoint
-- Réglage de l'école (Paramètres › Organisation, organisation:modifier).
GRANT UPDATE ("edt_badge_modifie_jours") ON "organisation" TO scolaly_app;--> statement-breakpoint
-- RG-04-14 : fuseau de l'établissement d'une séance, par sa promotion (directe ou par un groupe).
-- Un seul fuseau par séance (le premier par ordre alphabétique si son public couvre plusieurs
-- établissements) : une séance ne figure jamais dans deux récapitulatifs. NULL sans public.
CREATE OR REPLACE FUNCTION seance_fuseau_horaire(p_organisation uuid, p_seance uuid)
  RETURNS text
  LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT min(e.fuseau_horaire)
    FROM seance_public sp
    LEFT JOIN groupe_promotion gp
      ON gp.organisation_id = sp.organisation_id AND gp.groupe_id = sp.groupe_id
     AND gp.deleted_at IS NULL
    JOIN promotion p
      ON p.organisation_id = sp.organisation_id AND p.id = coalesce(sp.promotion_id, gp.promotion_id)
    JOIN etablissement e ON e.organisation_id = p.organisation_id AND e.id = p.etablissement_id
   WHERE sp.organisation_id = p_organisation AND sp.seance_id = p_seance AND sp.deleted_at IS NULL
$$;--> statement-breakpoint
-- RG-04-14 : changements en attente par personne et par fuseau de séance, toutes organisations
-- (récapitulatif du worker, à 18 h dans chaque fuseau). Seuls des identifiants, un fuseau et une
-- date en sortent ; la lecture détaillée se fait ensuite sous la RLS de chaque organisation.
CREATE OR REPLACE FUNCTION notifications_edt_par_fuseau()
  RETURNS TABLE (organisation_id uuid, personne_id uuid, fuseau text, premier timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT n.organisation_id, n.personne_id,
         seance_fuseau_horaire(n.organisation_id, n.seance_id) AS fuseau, min(n.created_at)
    FROM notification_edt n
    WHERE n.deleted_at IS NULL
    GROUP BY 1, 2, 3
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION notifications_edt_par_fuseau() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION notifications_edt_par_fuseau() TO scolaly_app;
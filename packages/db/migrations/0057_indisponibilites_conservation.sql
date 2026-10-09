-- RG-04-18, conservation des indisponibilités (packages/referentials, durees-conservation) : écoles
-- qui ont un motif à effacer ou une ligne à supprimer. Le worker les traite ensuite dans le
-- contexte de chaque école (RLS).
CREATE FUNCTION indisponibilites_a_purger(motif_limite timestamptz, ligne_limite timestamptz)
  RETURNS TABLE (organisation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT i.organisation_id FROM indisponibilite_intervenant i
    WHERE (i.fin <= motif_limite AND i.motif_chiffre IS NOT NULL) OR i.fin <= ligne_limite
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION indisponibilites_a_purger(timestamptz, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION indisponibilites_a_purger(timestamptz, timestamptz) TO scolaly_app;

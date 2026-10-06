-- Préchargement de l'émargement (RG-00-17) : séances qui commencent dans l'intervalle, toutes
-- écoles confondues. Le worker les charge ensuite dans le contexte de chaque école (RLS).
CREATE FUNCTION seances_a_precharger(de timestamptz, a timestamptz)
  RETURNS TABLE (organisation_id uuid, id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.organisation_id, s.id FROM seance s
    WHERE s.debut >= de AND s.debut < a AND s.deleted_at IS NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION seances_a_precharger(timestamptz, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION seances_a_precharger(timestamptz, timestamptz) TO scolaly_app;

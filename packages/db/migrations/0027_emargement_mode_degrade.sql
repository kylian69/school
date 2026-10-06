-- Mode dégradé de l'émargement (architecture, section 5) : sans Valkey, le scan retrouve l'école de
-- la séance désignée par le jeton, puis travaille dans le contexte de cette école (RLS).
CREATE FUNCTION seance_organisation(seance uuid)
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.organisation_id FROM seance s WHERE s.id = seance AND s.deleted_at IS NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION seance_organisation(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION seance_organisation(uuid) TO scolaly_app;

-- Corbeille (RG-01-23) : écoles qui ont des éléments supprimés avant la limite, encore à effacer.
-- Le worker les traite ensuite dans le contexte de chaque école (RLS).
CREATE FUNCTION corbeille_organisations(limite timestamptz)
  RETURNS TABLE (organisation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.organisation_id FROM personne p
    WHERE p.deleted_at < limite AND p.email NOT LIKE 'efface+%@invalid'
  UNION SELECT a.organisation_id FROM annee_scolaire a WHERE a.deleted_at < limite
  UNION SELECT f.organisation_id FROM fermeture f WHERE f.deleted_at < limite
  UNION SELECT r.organisation_id FROM role r WHERE r.deleted_at < limite
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION corbeille_organisations(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION corbeille_organisations(timestamptz) TO scolaly_app;

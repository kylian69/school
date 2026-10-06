-- Organisation de la transaction en cours, fixée par withOrganisation (set_config local).
-- Renvoie NULL si aucune organisation n'est fixée : les politiques RLS ne laissent alors rien passer.
CREATE FUNCTION app_current_organisation_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.organisation_id', true), '')::uuid $$;

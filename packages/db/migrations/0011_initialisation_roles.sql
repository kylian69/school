-- Rôles par défaut d'une école (RG-01-15).

-- Création des rôles par défaut d'une organisation, à partir du catalogue de l'application
-- (packages/contracts). Idempotente : un rôle déjà présent (même code) n'est pas modifié.
-- Seule porte d'écriture de la console de la plateforme vers les rôles d'une école (ADR 0004).
-- Format : [{ "id", "code", "libelle", "description", "perimetre", "doubleAuthentification",
--             "permissions": [{ "id", "permission" }] }]
CREATE FUNCTION organisation_initialiser_roles(organisation uuid, roles jsonb) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r jsonb;
  p jsonb;
  role_existant uuid;
  crees integer := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(roles) LOOP
    SELECT id INTO role_existant FROM role WHERE organisation_id = organisation AND code = r->>'code';
    CONTINUE WHEN role_existant IS NOT NULL;
    INSERT INTO role (id, organisation_id, code, libelle, description, perimetre_par_defaut, double_authentification_requise)
      VALUES ((r->>'id')::uuid, organisation, r->>'code', r->>'libelle', r->>'description',
              (r->>'perimetre')::perimetre_type, (r->>'doubleAuthentification')::boolean);
    FOR p IN SELECT * FROM jsonb_array_elements(r->'permissions') LOOP
      INSERT INTO role_permission (id, organisation_id, role_id, permission)
        VALUES ((p->>'id')::uuid, organisation, (r->>'id')::uuid, p->>'permission');
    END LOOP;
    crees := crees + 1;
  END LOOP;
  RETURN crees;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION organisation_initialiser_roles(uuid, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION organisation_initialiser_roles(uuid, jsonb) TO scolaly_platform;--> statement-breakpoint

-- Un rôle par défaut (avec un code) n'est ni supprimé ni mis à la corbeille ; son code ne change pas.
CREATE FUNCTION role_proteger_role_par_defaut() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.code IS NOT NULL THEN
    RAISE EXCEPTION 'Le rôle par défaut « % » ne peut pas être supprimé (RG-01-15).', OLD.libelle
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.code IS NOT NULL
     AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Le rôle par défaut « % » ne peut pas être supprimé (RG-01-15).', OLD.libelle
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint
CREATE TRIGGER role_par_defaut_protege BEFORE UPDATE OR DELETE ON "role"
  FOR EACH ROW EXECUTE FUNCTION role_proteger_role_par_defaut();

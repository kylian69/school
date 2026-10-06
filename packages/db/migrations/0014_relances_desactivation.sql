-- Relances des invitations (RG-01-08) et désactivation des comptes (RG-01-09, RG-01-13).

-- Invitations encore valides et pas encore relancées deux fois, toutes écoles confondues : le
-- planificateur du worker les examine ensuite dans le contexte de chaque école.
CREATE FUNCTION invitations_a_relancer()
  RETURNS TABLE (organisation_id uuid, invitation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT i.organisation_id, i.id FROM invitation i
  WHERE i.acceptee_le IS NULL AND i.revoquee_le IS NULL AND i.expire_le > now() AND i.relances < 2
  ORDER BY i.organisation_id, i.id
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION invitations_a_relancer() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION invitations_a_relancer() TO scolaly_app;--> statement-breakpoint

-- Nombre de fiches actives et désactivées d'un compte, toutes écoles confondues : un compte
-- désactivé dans toutes ses écoles ne peut plus se connecter (RG-01-09).
CREATE FUNCTION compte_fiches(compte uuid)
  RETURNS TABLE (actives integer, desactivees integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*) FILTER (WHERE p.compte_etat <> 'desactive')::int,
         count(*) FILTER (WHERE p.compte_etat = 'desactive')::int
  FROM personne p WHERE p.user_id = compte AND p.deleted_at IS NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION compte_fiches(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION compte_fiches(uuid) TO scolaly_app;--> statement-breakpoint

-- Une fiche désactivée n'ouvre plus l'école (sélecteur d'école).
CREATE OR REPLACE FUNCTION ecoles_du_compte(compte uuid)
  RETURNS TABLE (organisation_id uuid, nom text, nom_affichage text, acces organisation_acces)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id, o.nom, o.nom_affichage, o.acces
  FROM personne p
  JOIN organisation o ON o.id = p.organisation_id
  WHERE p.user_id = compte AND p.deleted_at IS NULL AND p.compte_etat <> 'desactive'
    AND o.deleted_at IS NULL AND o.acces <> 'ferme'
  ORDER BY o.nom
$$;

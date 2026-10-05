-- Écoles où un compte a une fiche active (RG-00-26, RG-01-29 : sélecteur d'école). Lecture
-- transverse aux organisations, limitée à ces quatre colonnes ; l'API ne l'appelle qu'avec le
-- compte de la session. Les écoles dont l'accès est fermé (client résilié) sont exclues.
CREATE FUNCTION ecoles_du_compte(compte uuid)
  RETURNS TABLE (organisation_id uuid, nom text, nom_affichage text, acces organisation_acces)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id, o.nom, o.nom_affichage, o.acces
  FROM personne p
  JOIN organisation o ON o.id = p.organisation_id
  WHERE p.user_id = compte AND p.deleted_at IS NULL AND o.deleted_at IS NULL AND o.acces <> 'ferme'
  ORDER BY o.nom
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION ecoles_du_compte(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ecoles_du_compte(uuid) TO scolaly_app;

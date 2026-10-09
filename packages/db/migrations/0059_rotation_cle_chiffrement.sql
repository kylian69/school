-- ADR 0006, rotation de la clé maîtresse : nombre de valeurs chiffrées par école, par champ et par
-- version de clé (préfixe `v<n>.` ; version nulle pour une valeur mal formée). Aucune valeur n'est
-- renvoyée, seulement des comptes. Le worker en déduit les écoles à rechiffrer, qu'il traite
-- ensuite dans le contexte de chaque école (RLS) ; la commande de contrôle en déduit si une
-- ancienne clé peut être retirée. Tout nouveau champ chiffré s'ajoute ici (test d'inventaire).
CREATE FUNCTION valeurs_chiffrees_par_version()
  RETURNS TABLE (organisation_id uuid, champ text, version integer, nombre bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT i.organisation_id, 'indisponibilite_intervenant.motif',
         substring(i.motif_chiffre from '^v([0-9]{1,6})\.')::integer, count(*)
    FROM indisponibilite_intervenant i WHERE i.motif_chiffre IS NOT NULL GROUP BY 1, 2, 3
  UNION ALL
  SELECT f.organisation_id, 'flux_ical.jeton',
         substring(f.jeton_chiffre from '^v([0-9]{1,6})\.')::integer, count(*)
    FROM flux_ical f WHERE f.jeton_chiffre IS NOT NULL GROUP BY 1, 2, 3
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION valeurs_chiffrees_par_version() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION valeurs_chiffrees_par_version() TO scolaly_app;

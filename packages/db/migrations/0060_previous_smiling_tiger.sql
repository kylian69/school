CREATE TYPE "public"."presence_localisation" AS ENUM('sur-place', 'hors-site', 'inconnu');--> statement-breakpoint
ALTER TABLE "etablissement" ADD COLUMN "localisation_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "etablissement" ADD COLUMN "localisation_latitude" double precision;--> statement-breakpoint
ALTER TABLE "etablissement" ADD COLUMN "localisation_longitude" double precision;--> statement-breakpoint
ALTER TABLE "etablissement" ADD COLUMN "localisation_rayon" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "etablissement" ADD COLUMN "localisation_plages_ip" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "presence" ADD COLUMN "localisation" "presence_localisation";--> statement-breakpoint
ALTER TABLE "etablissement" ADD CONSTRAINT "etablissement_localisation_check" CHECK (("etablissement"."localisation_latitude" is null) = ("etablissement"."localisation_longitude" is null) AND "etablissement"."localisation_latitude" between -90 and 90 AND "etablissement"."localisation_longitude" between -180 and 180 AND "etablissement"."localisation_rayon" between 50 and 5000);--> statement-breakpoint
-- RGPD-03, conservation : écoles ayant des résultats de localisation échus (worker, toutes écoles).
CREATE FUNCTION localisations_a_effacer(limite timestamptz)
  RETURNS TABLE (organisation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT p.organisation_id FROM presence p
    WHERE p.scanne_le <= limite AND p.localisation IS NOT NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION localisations_a_effacer(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION localisations_a_effacer(timestamptz) TO scolaly_app;

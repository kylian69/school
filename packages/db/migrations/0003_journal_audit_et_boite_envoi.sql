-- Journal d'audit en ajout seul, partitionné par mois (RG-01-22, architecture section 3).
CREATE TABLE "audit_evenement" (
	"id" uuid NOT NULL,
	"organisation_id" uuid DEFAULT app_current_organisation_id() NOT NULL REFERENCES "organisation"("id"),
	"survenu_le" timestamp with time zone DEFAULT now() NOT NULL,
	"auteur_id" uuid,
	"adresse_ip" inet,
	"action" text NOT NULL,
	"objet_type" text NOT NULL,
	"objet_id" uuid,
	"avant" jsonb,
	"apres" jsonb,
	PRIMARY KEY ("id", "survenu_le")
) PARTITION BY RANGE ("survenu_le");--> statement-breakpoint
CREATE INDEX "audit_evenement_organisation_id_survenu_le_idx" ON "audit_evenement" ("organisation_id", "survenu_le" DESC);--> statement-breakpoint
CREATE INDEX "audit_evenement_organisation_id_objet_idx" ON "audit_evenement" ("organisation_id", "objet_type", "objet_id");--> statement-breakpoint
ALTER TABLE "audit_evenement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_evenement_lecture" ON "audit_evenement" AS PERMISSIVE FOR SELECT TO "scolaly_app" USING (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "audit_evenement_ajout" ON "audit_evenement" AS PERMISSIVE FOR INSERT TO "scolaly_app" WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_evenement" FROM scolaly_app;--> statement-breakpoint

-- Défense en profondeur : même le propriétaire ne modifie ni ne supprime une ligne.
-- La purge à l'échéance de conservation détache et supprime une partition entière.
CREATE FUNCTION audit_evenement_interdire_modification() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est en ajout seul (RG-01-22).'
    USING ERRCODE = 'insufficient_privilege';
END $$;--> statement-breakpoint
CREATE TRIGGER audit_evenement_ajout_seul
  BEFORE UPDATE OR DELETE ON "audit_evenement"
  FOR EACH ROW EXECUTE FUNCTION audit_evenement_interdire_modification();--> statement-breakpoint

-- Crée les partitions mensuelles manquantes, du mois courant à `mois_a_venir` mois plus tard.
-- Lancée à chaque migration et chaque jour par le planificateur du worker. Les partitions ne
-- donnent aucun droit direct au rôle applicatif : il passe toujours par la table parente et sa RLS.
CREATE FUNCTION audit_evenement_creer_partitions(mois_a_venir integer DEFAULT 3) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  debut date;
  nom text;
BEGIN
  FOR i IN 0..mois_a_venir LOOP
    debut := (date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i))::date;
    nom := format('audit_evenement_%s', to_char(debut, 'YYYY_MM'));
    IF to_regclass(nom) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF audit_evenement FOR VALUES FROM (%L) TO (%L)',
        nom, debut::timestamptz, (debut + interval '1 month')::timestamptz);
      EXECUTE format('REVOKE ALL ON %I FROM scolaly_app', nom);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION audit_evenement_creer_partitions(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION audit_evenement_creer_partitions(integer) TO scolaly_app;--> statement-breakpoint
SELECT audit_evenement_creer_partitions(3);--> statement-breakpoint

-- Boîte d'envoi des événements internes : écrite dans la même transaction que le changement
-- métier, publiée ensuite par le worker (au moins une fois, dans l'ordre des identifiants).
CREATE TABLE "outbox_evenement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid DEFAULT app_current_organisation_id() NOT NULL REFERENCES "organisation"("id"),
	"type" text NOT NULL,
	"charge" jsonb NOT NULL,
	"survenu_le" timestamp with time zone DEFAULT now() NOT NULL,
	"publie_le" timestamp with time zone,
	"tentatives" integer DEFAULT 0 NOT NULL,
	"derniere_erreur" text
);--> statement-breakpoint
CREATE INDEX "outbox_evenement_organisation_id_a_publier_idx" ON "outbox_evenement" ("organisation_id", "id") WHERE "publie_le" IS NULL;--> statement-breakpoint
ALTER TABLE "outbox_evenement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "outbox_evenement_lecture" ON "outbox_evenement" AS PERMISSIVE FOR SELECT TO "scolaly_app" USING (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "outbox_evenement_ajout" ON "outbox_evenement" AS PERMISSIVE FOR INSERT TO "scolaly_app" WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "outbox_evenement" FROM scolaly_app;--> statement-breakpoint

-- Le publieur traite toutes les organisations : ces deux fonctions sont les seules portes
-- d'accès transverses, limitées à la réservation et à l'acquittement des événements.
CREATE FUNCTION outbox_evenement_reserver(taille integer)
  RETURNS SETOF outbox_evenement
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT * FROM outbox_evenement
  WHERE publie_le IS NULL
  ORDER BY id
  LIMIT taille
  FOR UPDATE SKIP LOCKED
$$;--> statement-breakpoint
CREATE FUNCTION outbox_evenement_acquitter(ids uuid[], erreur text DEFAULT NULL) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE outbox_evenement
  SET publie_le = CASE WHEN erreur IS NULL THEN now() END,
      tentatives = tentatives + 1,
      derniere_erreur = erreur
  WHERE id = ANY (ids) AND publie_le IS NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION outbox_evenement_reserver(integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION outbox_evenement_acquitter(uuid[], text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION outbox_evenement_reserver(integer) TO scolaly_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION outbox_evenement_acquitter(uuid[], text) TO scolaly_app;

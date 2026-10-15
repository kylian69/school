CREATE TYPE "public"."alerte_assiduite_statut" AS ENUM('ouverte', 'traitee');--> statement-breakpoint
CREATE TABLE "alerte_assiduite" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"niveau" smallint NOT NULL,
	"declenchee_le" timestamp with time zone NOT NULL,
	"demi_journees" smallint NOT NULL,
	"seuil" smallint NOT NULL,
	"fenetre_jours" smallint NOT NULL,
	"notifiee_le" timestamp with time zone,
	"statut" "alerte_assiduite_statut" DEFAULT 'ouverte' NOT NULL,
	"traitee_le" timestamp with time zone,
	"traitee_par" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "alerte_assiduite_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "alerte_assiduite_niveau_check" CHECK ("alerte_assiduite"."niveau" in (1, 2)),
	CONSTRAINT "alerte_assiduite_traitement_check" CHECK (("alerte_assiduite"."statut" = 'traitee') = ("alerte_assiduite"."traitee_le" is not null))
);
--> statement-breakpoint
ALTER TABLE "alerte_assiduite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "assiduite_seuil_niveau1" smallint;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "assiduite_seuil_niveau2" smallint;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "assiduite_fenetre_jours" smallint;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "assiduite_seuil_niveau1" smallint;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "assiduite_seuil_niveau2" smallint;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "assiduite_fenetre_jours" smallint;--> statement-breakpoint
ALTER TABLE "alerte_assiduite" ADD CONSTRAINT "alerte_assiduite_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerte_assiduite" ADD CONSTRAINT "alerte_assiduite_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerte_assiduite_personne_idx" ON "alerte_assiduite" USING btree ("organisation_id","personne_id","niveau","declenchee_le");--> statement-breakpoint
CREATE INDEX "alerte_assiduite_statut_idx" ON "alerte_assiduite" USING btree ("organisation_id","statut","declenchee_le");--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_seuils_assiduite_check" CHECK (("organisation"."assiduite_seuil_niveau1" is null and "organisation"."assiduite_seuil_niveau2" is null and "organisation"."assiduite_fenetre_jours" is null) or ("organisation"."assiduite_seuil_niveau1" between 1 and 100 and "organisation"."assiduite_seuil_niveau2" between 1 and 100 and "organisation"."assiduite_seuil_niveau1" < "organisation"."assiduite_seuil_niveau2" and "organisation"."assiduite_fenetre_jours" between 7 and 365));--> statement-breakpoint
ALTER TABLE "formation" ADD CONSTRAINT "formation_seuils_assiduite_check" CHECK (("formation"."assiduite_seuil_niveau1" is null and "formation"."assiduite_seuil_niveau2" is null and "formation"."assiduite_fenetre_jours" is null) or ("formation"."assiduite_seuil_niveau1" between 1 and 100 and "formation"."assiduite_seuil_niveau2" between 1 and 100 and "formation"."assiduite_seuil_niveau1" < "formation"."assiduite_seuil_niveau2" and "formation"."assiduite_fenetre_jours" between 7 and 365));--> statement-breakpoint
CREATE POLICY "alerte_assiduite_isolation" ON "alerte_assiduite" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- RG-06-23 : seuils de l'école, modifiables par l'API comme les autres colonnes de l'école.
GRANT UPDATE ("assiduite_seuil_niveau1", "assiduite_seuil_niveau2", "assiduite_fenetre_jours") ON "organisation" TO scolaly_app;--> statement-breakpoint
-- I4.4 : alertes d'assiduité reçues et traitées par la scolarité, le responsable pédagogique et
-- la direction (contracts, ROLES_PAR_DEFAUT), données aux rôles par défaut des écoles existantes.
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", 'assiduite:alertes'
FROM "role" r
WHERE r."code" IN ('scolarite', 'responsable-pedagogique', 'direction')
  AND r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = 'assiduite:alertes'
  );--> statement-breakpoint
-- RG-06-23 : écoles qui ont des absences non justifiées depuis `depuis` ; le worker évalue
-- ensuite leurs apprenants dans le contexte de chaque école (RLS).
CREATE FUNCTION ecoles_avec_absences_non_justifiees(depuis date)
  RETURNS TABLE (organisation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT a.organisation_id FROM absence a
    WHERE a.statut = 'non-justifiee' AND a.nature = 'absence' AND a.jour >= depuis
  UNION
  SELECT DISTINCT al.organisation_id FROM alerte_assiduite al WHERE al.notifiee_le IS NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION ecoles_avec_absences_non_justifiees(date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ecoles_avec_absences_non_justifiees(date) TO scolaly_app;--> statement-breakpoint
-- RG-06-20, conservation (packages/referentials, justificatif-absence) : écoles qui ont un
-- justificatif déposé au plus tard à `limite` dont le document ou un texte reste à effacer.
CREATE FUNCTION justificatifs_a_effacer(limite timestamptz)
  RETURNS TABLE (organisation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT j.organisation_id FROM justificatif j
    WHERE j.depose_le <= limite
      AND (j.document_cle IS NOT NULL OR j.precision_chiffre IS NOT NULL OR j.message_chiffre IS NOT NULL)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION justificatifs_a_effacer(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION justificatifs_a_effacer(timestamptz) TO scolaly_app;

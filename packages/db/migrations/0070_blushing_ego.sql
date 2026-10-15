CREATE TYPE "public"."justificatif_motif" AS ENUM('maladie', 'rendez-vous-medical', 'transport', 'convocation', 'evenement-familial', 'raison-professionnelle', 'autre');--> statement-breakpoint
CREATE TYPE "public"."justificatif_statut" AS ENUM('a-traiter', 'complement-demande', 'accepte', 'refuse');--> statement-breakpoint
ALTER TYPE "public"."absence_statut" ADD VALUE 'justifiee';--> statement-breakpoint
CREATE TABLE "justificatif" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"motif" "justificatif_motif" NOT NULL,
	"precision_chiffre" text,
	"document_cle" text,
	"document_type" text,
	"document_taille" integer,
	"document_sha256" text,
	"depose_le" timestamp with time zone NOT NULL,
	"depose_par" uuid NOT NULL,
	"hors_delai" boolean NOT NULL,
	"statut" "justificatif_statut" DEFAULT 'a-traiter' NOT NULL,
	"message_chiffre" text,
	"decide_le" timestamp with time zone,
	"decide_par" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "justificatif_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "justificatif_document_check" CHECK (("justificatif"."document_cle" is null) = ("justificatif"."document_type" is null)),
	CONSTRAINT "justificatif_decision_check" CHECK (("justificatif"."statut" in ('accepte', 'refuse')) = ("justificatif"."decide_le" is not null))
);
--> statement-breakpoint
ALTER TABLE "justificatif" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "justificatif_absence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"justificatif_id" uuid NOT NULL,
	"absence_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "justificatif_absence_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "justificatif_absence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "justificatif_delai_heures" smallint;--> statement-breakpoint
ALTER TABLE "justificatif" ADD CONSTRAINT "justificatif_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justificatif" ADD CONSTRAINT "justificatif_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justificatif" ADD CONSTRAINT "justificatif_depose_par_fk" FOREIGN KEY ("organisation_id","depose_par") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justificatif_absence" ADD CONSTRAINT "justificatif_absence_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justificatif_absence" ADD CONSTRAINT "justificatif_absence_justificatif_fk" FOREIGN KEY ("organisation_id","justificatif_id") REFERENCES "public"."justificatif"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justificatif_absence" ADD CONSTRAINT "justificatif_absence_absence_fk" FOREIGN KEY ("organisation_id","absence_id") REFERENCES "public"."absence"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "justificatif_statut_idx" ON "justificatif" USING btree ("organisation_id","statut","depose_le");--> statement-breakpoint
CREATE INDEX "justificatif_personne_idx" ON "justificatif" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE UNIQUE INDEX "justificatif_absence_key" ON "justificatif_absence" USING btree ("organisation_id","justificatif_id","absence_id");--> statement-breakpoint
CREATE INDEX "justificatif_absence_absence_idx" ON "justificatif_absence" USING btree ("organisation_id","absence_id");--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_justificatif_delai_heures_check" CHECK ("organisation"."justificatif_delai_heures" between 1 and 720);--> statement-breakpoint
CREATE POLICY "justificatif_isolation" ON "justificatif" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "justificatif_absence_isolation" ON "justificatif_absence" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- Réglage de l'école (RG-06-19), modifiable par l'API comme les autres colonnes de l'école.
GRANT UPDATE ("justificatif_delai_heures") ON "organisation" TO scolaly_app;--> statement-breakpoint
-- I4.4 : dépôt pour un apprenant (scolarité) et traitement des justificatifs (scolarité,
-- responsable pédagogique), donnés aux rôles par défaut des écoles existantes selon la matrice du
-- module 06 (contracts, ROLES_PAR_DEFAUT). Ni l'administrateur, ni l'intervenant, ni le tuteur.
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", d."permission"
FROM "role" r
JOIN (VALUES
  ('scolarite', 'justificatifs:deposer'),
  ('scolarite', 'justificatifs:traiter'),
  ('responsable-pedagogique', 'justificatifs:traiter')
) AS d("code", "permission") ON d."code" = r."code"
WHERE r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = d."permission"
  );--> statement-breakpoint
-- ADR 0006 : inventaire des valeurs chiffrées, complété des deux champs des justificatifs.
CREATE OR REPLACE FUNCTION valeurs_chiffrees_par_version()
  RETURNS TABLE (organisation_id uuid, champ text, version integer, nombre bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT i.organisation_id, 'indisponibilite_intervenant.motif',
         substring(i.motif_chiffre from '^v([0-9]{1,6})\.')::integer, count(*)
    FROM indisponibilite_intervenant i WHERE i.motif_chiffre IS NOT NULL GROUP BY 1, 2, 3
  UNION ALL
  SELECT f.organisation_id, 'flux_ical.jeton',
         substring(f.jeton_chiffre from '^v([0-9]{1,6})\.')::integer, count(*)
    FROM flux_ical f WHERE f.jeton_chiffre IS NOT NULL GROUP BY 1, 2, 3
  UNION ALL
  SELECT j.organisation_id, 'justificatif.precision',
         substring(j.precision_chiffre from '^v([0-9]{1,6})\.')::integer, count(*)
    FROM justificatif j WHERE j.precision_chiffre IS NOT NULL GROUP BY 1, 2, 3
  UNION ALL
  SELECT j.organisation_id, 'justificatif.message',
         substring(j.message_chiffre from '^v([0-9]{1,6})\.')::integer, count(*)
    FROM justificatif j WHERE j.message_chiffre IS NOT NULL GROUP BY 1, 2, 3
$$;

CREATE TYPE "public"."absence_nature" AS ENUM('absence', 'retard');--> statement-breakpoint
CREATE TYPE "public"."absence_statut" AS ENUM('non-justifiee');--> statement-breakpoint
CREATE TABLE "absence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"seance_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"nature" "absence_nature" NOT NULL,
	"statut" "absence_statut" DEFAULT 'non-justifiee' NOT NULL,
	"minutes" integer NOT NULL,
	"jour" date NOT NULL,
	"matin" boolean NOT NULL,
	"apres_midi" boolean NOT NULL,
	"version_appel" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "absence_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "absence_minutes_check" CHECK ("absence"."minutes" > 0),
	CONSTRAINT "absence_demi_journee_check" CHECK ("absence"."matin" or "absence"."apres_midi")
);
--> statement-breakpoint
ALTER TABLE "absence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_seance_fk" FOREIGN KEY ("organisation_id","seance_id") REFERENCES "public"."seance"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "absence_seance_personne_key" ON "absence" USING btree ("organisation_id","seance_id","personne_id");--> statement-breakpoint
CREATE INDEX "absence_personne_jour_idx" ON "absence" USING btree ("organisation_id","personne_id","jour");--> statement-breakpoint
CREATE INDEX "absence_jour_idx" ON "absence" USING btree ("organisation_id","jour");--> statement-breakpoint
CREATE POLICY "absence_isolation" ON "absence" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- I4.4 : consultation de l'assiduité, donnée aux rôles par défaut des écoles existantes qui la
-- consultent selon la matrice du module 06 (contracts, ROLES_PAR_DEFAUT).
INSERT INTO "role_permission" ("id", "organisation_id", "role_id", "permission")
SELECT gen_random_uuid(), r."organisation_id", r."id", 'assiduite:lire'
FROM "role" r
WHERE r."code" IN ('administrateur', 'direction', 'responsable-pedagogique', 'scolarite')
  AND r."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission" rp
    WHERE rp."organisation_id" = r."organisation_id"
      AND rp."role_id" = r."id"
      AND rp."permission" = 'assiduite:lire'
  );--> statement-breakpoint
-- Reprise des appels déjà validés (dernière version), calculée comme packages/domain
-- (absencesDeLAppel) : fuseau et limite matin / après-midi de l'établissement de la salle, sinon de
-- la série, sinon de l'unique établissement actif, sinon Europe/Paris et 13 h (RG-04-02).
WITH derniere AS (
  SELECT DISTINCT ON (v."organisation_id", v."seance_id")
    v."organisation_id", v."seance_id", v."version", v."liste"
  FROM "appel_validation" v
  ORDER BY v."organisation_id", v."seance_id", v."version" DESC
), cadre AS (
  SELECT d.*, s."debut", s."fin",
    COALESCE(es."fuseau_horaire", ee."fuseau_horaire", eu."fuseau_horaire", 'Europe/Paris') AS fuseau,
    COALESCE(es."edt_limite_midi", ee."edt_limite_midi", eu."edt_limite_midi", '13:00') AS limite
  FROM derniere d
  JOIN "seance" s ON s."organisation_id" = d."organisation_id" AND s."id" = d."seance_id"
  LEFT JOIN "salle" sa ON sa."organisation_id" = s."organisation_id" AND sa."id" = s."salle_id"
  LEFT JOIN "etablissement" es
    ON es."organisation_id" = sa."organisation_id" AND es."id" = sa."etablissement_id"
  LEFT JOIN "seance_serie" se ON se."organisation_id" = s."organisation_id" AND se."id" = s."serie_id"
  LEFT JOIN "etablissement" ee
    ON ee."organisation_id" = se."organisation_id" AND ee."id" = se."etablissement_id"
  LEFT JOIN LATERAL (
    SELECT max(e."fuseau_horaire") AS fuseau_horaire, max(e."edt_limite_midi") AS edt_limite_midi
    FROM "etablissement" e
    WHERE e."organisation_id" = s."organisation_id" AND e."deleted_at" IS NULL AND e."statut" = 'actif'
    HAVING count(*) = 1
  ) eu ON true
), lignes AS (
  SELECT c.*, l->>'personneId' AS personne_id, l->>'statut' AS statut_appel,
    (l->>'minutesRetard')::int AS minutes_retard,
    (c."debut" AT TIME ZONE c.fuseau)::date AS jour,
    (((c."debut" AT TIME ZONE c.fuseau)::date + c.limite) AT TIME ZONE c.fuseau) AS limite_instant,
    ceil(extract(epoch FROM c."fin" - c."debut") / 60)::int AS duree
  FROM cadre c, jsonb_array_elements(c."liste") l
  WHERE NOT coalesce((l->>'nonAttendu')::boolean, false)
)
INSERT INTO "absence" ("id", "organisation_id", "seance_id", "personne_id", "nature", "minutes",
  "jour", "matin", "apres_midi", "version_appel")
SELECT gen_random_uuid(), "organisation_id", "seance_id", personne_id::uuid,
  (CASE WHEN statut_appel = 'retard' THEN 'retard' ELSE 'absence' END)::"absence_nature",
  CASE WHEN statut_appel = 'retard' THEN least(minutes_retard, duree) ELSE duree END,
  jour,
  "debut" < limite_instant,
  CASE WHEN statut_appel = 'retard' THEN "debut" >= limite_instant ELSE "fin" > limite_instant END,
  "version"
FROM lignes
WHERE statut_appel IN ('absent', 'en-attente') OR (statut_appel = 'retard' AND minutes_retard > 0);

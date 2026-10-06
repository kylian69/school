CREATE TYPE "public"."formation_mode" AS ENUM('initial', 'apprentissage', 'professionnalisation', 'formation_continue');--> statement-breakpoint
CREATE TYPE "public"."formation_statut" AS ENUM('active', 'archivee');--> statement-breakpoint
CREATE TYPE "public"."formation_type" AS ENUM('bts', 'bachelor', 'master', 'titre_rncp', 'cqp', 'autre');--> statement-breakpoint
CREATE TYPE "public"."regle_particuliere_type" AS ENUM('bonus', 'ue_bonus', 'points_jury', 'plafond', 'ponderation', 'penalite_absence');--> statement-breakpoint
CREATE TYPE "public"."maquette_version_statut" AS ENUM('brouillon', 'publiee', 'archivee');--> statement-breakpoint
CREATE TABLE "competence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"bloc_id" uuid NOT NULL,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"criteres" text[] DEFAULT '{}'::text[] NOT NULL,
	"ordre" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "competence_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "competence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "competence_module" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"competence_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "competence_module_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "competence_module" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "formation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"intitule" text NOT NULL,
	"type" "formation_type" NOT NULL,
	"niveau" smallint NOT NULL,
	"code_rncp" text,
	"duree_annees" smallint NOT NULL,
	"modes" "formation_mode"[] NOT NULL,
	"statut" "formation_statut" DEFAULT 'active' NOT NULL,
	"duplique_de" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "formation_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "formation_niveau_check" CHECK ("formation"."niveau" between 5 and 8),
	CONSTRAINT "formation_duree_check" CHECK ("formation"."duree_annees" between 1 and 8),
	CONSTRAINT "formation_modes_check" CHECK (cardinality("formation"."modes") > 0)
);
--> statement-breakpoint
ALTER TABLE "formation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "formation_etablissement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "formation_etablissement_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "formation_etablissement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maquette_bloc" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"ordre" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "maquette_bloc_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "maquette_bloc" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maquette_module" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"ue_id" uuid NOT NULL,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"coefficient" numeric(7, 3) DEFAULT 1 NOT NULL,
	"heures_cm" numeric(7, 2) DEFAULT 0 NOT NULL,
	"heures_td" numeric(7, 2) DEFAULT 0 NOT NULL,
	"heures_tp" numeric(7, 2) DEFAULT 0 NOT NULL,
	"heures_projet" numeric(7, 2) DEFAULT 0 NOT NULL,
	"heures_elearning" numeric(7, 2) DEFAULT 0 NOT NULL,
	"ordre" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "maquette_module_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "maquette_module_valeurs_check" CHECK ("maquette_module"."coefficient" >= 0 and "maquette_module"."heures_cm" >= 0 and "maquette_module"."heures_td" >= 0 and "maquette_module"."heures_tp" >= 0 and "maquette_module"."heures_projet" >= 0 and "maquette_module"."heures_elearning" >= 0)
);
--> statement-breakpoint
ALTER TABLE "maquette_module" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maquette_ue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"bloc_id" uuid,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"annee" smallint DEFAULT 1 NOT NULL,
	"semestre" smallint,
	"ects" numeric(5, 2) DEFAULT 0 NOT NULL,
	"coefficient" numeric(7, 3) DEFAULT 1 NOT NULL,
	"option" text,
	"ordre" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "maquette_ue_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "maquette_ue_semestre_check" CHECK ("maquette_ue"."semestre" is null or "maquette_ue"."semestre" in (1, 2)),
	CONSTRAINT "maquette_ue_valeurs_check" CHECK ("maquette_ue"."ects" >= 0 and "maquette_ue"."coefficient" >= 0)
);
--> statement-breakpoint
ALTER TABLE "maquette_ue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maquette_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"statut" "maquette_version_statut" DEFAULT 'brouillon' NOT NULL,
	"regles" jsonb NOT NULL,
	"reglement_cle" text,
	"publiee_le" timestamp with time zone,
	"version_source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "maquette_version_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "maquette_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maquette_version_regle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"regle_id" uuid,
	"libelle" text NOT NULL,
	"type" "regle_particuliere_type" NOT NULL,
	"parametres" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "maquette_version_regle_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "maquette_version_regle" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "niveau_maitrise" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"couleur" char(7) NOT NULL,
	"valeur" numeric(5, 2),
	"ordre" smallint NOT NULL,
	"valide" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "niveau_maitrise_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "niveau_maitrise" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "regle_particuliere" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"type" "regle_particuliere_type" NOT NULL,
	"parametres" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "regle_particuliere_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "regle_particuliere" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "competence" ADD CONSTRAINT "competence_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competence" ADD CONSTRAINT "competence_version_fk" FOREIGN KEY ("organisation_id","version_id") REFERENCES "public"."maquette_version"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competence" ADD CONSTRAINT "competence_bloc_fk" FOREIGN KEY ("organisation_id","bloc_id") REFERENCES "public"."maquette_bloc"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competence_module" ADD CONSTRAINT "competence_module_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competence_module" ADD CONSTRAINT "competence_module_competence_fk" FOREIGN KEY ("organisation_id","competence_id") REFERENCES "public"."competence"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competence_module" ADD CONSTRAINT "competence_module_module_fk" FOREIGN KEY ("organisation_id","module_id") REFERENCES "public"."maquette_module"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation" ADD CONSTRAINT "formation_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_etablissement" ADD CONSTRAINT "formation_etablissement_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_etablissement" ADD CONSTRAINT "formation_etablissement_formation_fk" FOREIGN KEY ("organisation_id","formation_id") REFERENCES "public"."formation"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_etablissement" ADD CONSTRAINT "formation_etablissement_etablissement_fk" FOREIGN KEY ("organisation_id","etablissement_id") REFERENCES "public"."etablissement"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_bloc" ADD CONSTRAINT "maquette_bloc_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_bloc" ADD CONSTRAINT "maquette_bloc_version_fk" FOREIGN KEY ("organisation_id","version_id") REFERENCES "public"."maquette_version"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_module" ADD CONSTRAINT "maquette_module_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_module" ADD CONSTRAINT "maquette_module_version_fk" FOREIGN KEY ("organisation_id","version_id") REFERENCES "public"."maquette_version"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_module" ADD CONSTRAINT "maquette_module_ue_fk" FOREIGN KEY ("organisation_id","ue_id") REFERENCES "public"."maquette_ue"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_ue" ADD CONSTRAINT "maquette_ue_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_ue" ADD CONSTRAINT "maquette_ue_version_fk" FOREIGN KEY ("organisation_id","version_id") REFERENCES "public"."maquette_version"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_ue" ADD CONSTRAINT "maquette_ue_bloc_fk" FOREIGN KEY ("organisation_id","bloc_id") REFERENCES "public"."maquette_bloc"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_version" ADD CONSTRAINT "maquette_version_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_version" ADD CONSTRAINT "maquette_version_formation_fk" FOREIGN KEY ("organisation_id","formation_id") REFERENCES "public"."formation"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_version_regle" ADD CONSTRAINT "maquette_version_regle_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_version_regle" ADD CONSTRAINT "maquette_version_regle_version_fk" FOREIGN KEY ("organisation_id","version_id") REFERENCES "public"."maquette_version"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette_version_regle" ADD CONSTRAINT "maquette_version_regle_regle_fk" FOREIGN KEY ("organisation_id","regle_id") REFERENCES "public"."regle_particuliere"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niveau_maitrise" ADD CONSTRAINT "niveau_maitrise_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regle_particuliere" ADD CONSTRAINT "regle_particuliere_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competence_version_idx" ON "competence" USING btree ("organisation_id","version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competence_module_paire_key" ON "competence_module" USING btree ("organisation_id","competence_id","module_id");--> statement-breakpoint
CREATE INDEX "competence_module_module_idx" ON "competence_module" USING btree ("organisation_id","module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "formation_etablissement_paire_key" ON "formation_etablissement" USING btree ("organisation_id","formation_id","etablissement_id");--> statement-breakpoint
CREATE INDEX "formation_etablissement_etablissement_idx" ON "formation_etablissement" USING btree ("organisation_id","etablissement_id");--> statement-breakpoint
CREATE INDEX "maquette_bloc_version_idx" ON "maquette_bloc" USING btree ("organisation_id","version_id");--> statement-breakpoint
CREATE INDEX "maquette_module_version_idx" ON "maquette_module" USING btree ("organisation_id","version_id");--> statement-breakpoint
CREATE INDEX "maquette_ue_version_idx" ON "maquette_ue" USING btree ("organisation_id","version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "maquette_version_numero_key" ON "maquette_version" USING btree ("organisation_id","formation_id","numero");--> statement-breakpoint
CREATE INDEX "maquette_version_regle_version_idx" ON "maquette_version_regle" USING btree ("organisation_id","version_id");--> statement-breakpoint
CREATE POLICY "competence_isolation" ON "competence" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "competence_module_isolation" ON "competence_module" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "formation_isolation" ON "formation" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "formation_etablissement_isolation" ON "formation_etablissement" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "maquette_bloc_isolation" ON "maquette_bloc" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "maquette_module_isolation" ON "maquette_module" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "maquette_ue_isolation" ON "maquette_ue" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "maquette_version_isolation" ON "maquette_version" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "maquette_version_regle_isolation" ON "maquette_version_regle" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "niveau_maitrise_isolation" ON "niveau_maitrise" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "regle_particuliere_isolation" ON "regle_particuliere" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
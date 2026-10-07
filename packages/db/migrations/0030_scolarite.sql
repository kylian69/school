CREATE TYPE "public"."groupe_type" AS ENUM('td', 'tp', 'option', 'langue', 'autre');--> statement-breakpoint
CREATE TYPE "public"."inscription_etat" AS ENUM('preinscrit', 'inscrit', 'demissionnaire', 'exclu', 'diplome');--> statement-breakpoint
CREATE TYPE "public"."statut_apprenant" AS ENUM('initial', 'apprenti', 'professionnalisation', 'formation_continue');--> statement-breakpoint
CREATE TABLE "groupe_eleves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"type" "groupe_type" NOT NULL,
	"capacite" integer,
	"option" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "groupe_eleves_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "groupe_eleves_capacite_check" CHECK ("groupe_eleves"."capacite" is null or "groupe_eleves"."capacite" > 0)
);
--> statement-breakpoint
ALTER TABLE "groupe_eleves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "groupe_membre" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"groupe_id" uuid NOT NULL,
	"inscription_id" uuid NOT NULL,
	"debut" date NOT NULL,
	"fin" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "groupe_membre_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "groupe_membre_dates_check" CHECK ("groupe_membre"."fin" is null or "groupe_membre"."fin" > "groupe_membre"."debut")
);
--> statement-breakpoint
ALTER TABLE "groupe_membre" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "groupe_promotion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"groupe_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "groupe_promotion_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "groupe_promotion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inscription" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"etat" "inscription_etat" DEFAULT 'inscrit' NOT NULL,
	"date_entree" date NOT NULL,
	"date_sortie" date,
	"motif_sortie" text,
	"option" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "inscription_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "inscription_dates_check" CHECK ("inscription"."date_sortie" is null or "inscription"."date_sortie" > "inscription"."date_entree")
);
--> statement-breakpoint
ALTER TABLE "inscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inscription_statut" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"inscription_id" uuid NOT NULL,
	"statut" "statut_apprenant" NOT NULL,
	"debut" date NOT NULL,
	"fin" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "inscription_statut_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "inscription_statut_dates_check" CHECK ("inscription_statut"."fin" is null or "inscription_statut"."fin" > "inscription_statut"."debut")
);
--> statement-breakpoint
ALTER TABLE "inscription_statut" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "promotion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"annee_formation" smallint NOT NULL,
	"annee_scolaire_id" uuid NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"reconduite_de" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "promotion_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "promotion_dates_check" CHECK ("promotion"."date_fin" > "promotion"."date_debut"),
	CONSTRAINT "promotion_annee_formation_check" CHECK ("promotion"."annee_formation" between 1 and 8)
);
--> statement-breakpoint
ALTER TABLE "promotion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groupe_eleves" ADD CONSTRAINT "groupe_eleves_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groupe_membre" ADD CONSTRAINT "groupe_membre_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groupe_membre" ADD CONSTRAINT "groupe_membre_groupe_fk" FOREIGN KEY ("organisation_id","groupe_id") REFERENCES "public"."groupe_eleves"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groupe_membre" ADD CONSTRAINT "groupe_membre_inscription_fk" FOREIGN KEY ("organisation_id","inscription_id") REFERENCES "public"."inscription"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groupe_promotion" ADD CONSTRAINT "groupe_promotion_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groupe_promotion" ADD CONSTRAINT "groupe_promotion_groupe_fk" FOREIGN KEY ("organisation_id","groupe_id") REFERENCES "public"."groupe_eleves"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groupe_promotion" ADD CONSTRAINT "groupe_promotion_promotion_fk" FOREIGN KEY ("organisation_id","promotion_id") REFERENCES "public"."promotion"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscription" ADD CONSTRAINT "inscription_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscription" ADD CONSTRAINT "inscription_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscription" ADD CONSTRAINT "inscription_promotion_fk" FOREIGN KEY ("organisation_id","promotion_id") REFERENCES "public"."promotion"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscription_statut" ADD CONSTRAINT "inscription_statut_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscription_statut" ADD CONSTRAINT "inscription_statut_inscription_fk" FOREIGN KEY ("organisation_id","inscription_id") REFERENCES "public"."inscription"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_formation_fk" FOREIGN KEY ("organisation_id","formation_id") REFERENCES "public"."formation"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_version_fk" FOREIGN KEY ("organisation_id","version_id") REFERENCES "public"."maquette_version"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_annee_fk" FOREIGN KEY ("organisation_id","annee_scolaire_id") REFERENCES "public"."annee_scolaire"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_etablissement_fk" FOREIGN KEY ("organisation_id","etablissement_id") REFERENCES "public"."etablissement"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "groupe_membre_groupe_idx" ON "groupe_membre" USING btree ("organisation_id","groupe_id");--> statement-breakpoint
CREATE INDEX "groupe_membre_inscription_idx" ON "groupe_membre" USING btree ("organisation_id","inscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groupe_promotion_paire_key" ON "groupe_promotion" USING btree ("organisation_id","groupe_id","promotion_id");--> statement-breakpoint
CREATE INDEX "groupe_promotion_promotion_idx" ON "groupe_promotion" USING btree ("organisation_id","promotion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inscription_unique_key" ON "inscription" USING btree ("organisation_id","personne_id","promotion_id") WHERE "inscription"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "inscription_promotion_idx" ON "inscription" USING btree ("organisation_id","promotion_id");--> statement-breakpoint
CREATE INDEX "inscription_statut_inscription_idx" ON "inscription_statut" USING btree ("organisation_id","inscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_unique_key" ON "promotion" USING btree ("organisation_id","formation_id","annee_formation","annee_scolaire_id","etablissement_id") WHERE "promotion"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "promotion_annee_idx" ON "promotion" USING btree ("organisation_id","annee_scolaire_id");--> statement-breakpoint
CREATE INDEX "promotion_version_idx" ON "promotion" USING btree ("organisation_id","version_id");--> statement-breakpoint
CREATE POLICY "groupe_eleves_isolation" ON "groupe_eleves" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "groupe_membre_isolation" ON "groupe_membre" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "groupe_promotion_isolation" ON "groupe_promotion" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "inscription_isolation" ON "inscription" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "inscription_statut_isolation" ON "inscription_statut" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "promotion_isolation" ON "promotion" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
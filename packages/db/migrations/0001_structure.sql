CREATE TYPE "public"."annee_scolaire_statut" AS ENUM('preparation', 'en_cours', 'cloturee');--> statement-breakpoint
CREATE TYPE "public"."etablissement_statut" AS ENUM('actif', 'archive');--> statement-breakpoint
CREATE TABLE "groupe" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organisation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"groupe_id" uuid,
	"nom" text NOT NULL,
	"nom_affichage" text NOT NULL,
	"siren" char(9),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organisation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "personne" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"nom_usage" text,
	"prenom" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "personne_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "personne" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "annee_scolaire" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"statut" "annee_scolaire_statut" DEFAULT 'preparation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "annee_scolaire_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "annee_scolaire_dates_check" CHECK ("annee_scolaire"."date_fin" > "annee_scolaire"."date_debut")
);
--> statement-breakpoint
ALTER TABLE "annee_scolaire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "etablissement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"adresse_ligne1" text,
	"adresse_ligne2" text,
	"code_postal" text,
	"ville" text,
	"uai" char(8),
	"siret" char(14),
	"nda" char(11),
	"fuseau_horaire" text DEFAULT 'Europe/Paris' NOT NULL,
	"telephone" text,
	"email" text,
	"statut" "etablissement_statut" DEFAULT 'actif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "etablissement_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "etablissement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "periode" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"annee_scolaire_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"ordre" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "periode_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "periode_dates_check" CHECK ("periode"."date_fin" >= "periode"."date_debut")
);
--> statement-breakpoint
ALTER TABLE "periode" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_groupe_id_groupe_id_fk" FOREIGN KEY ("groupe_id") REFERENCES "public"."groupe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personne" ADD CONSTRAINT "personne_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annee_scolaire" ADD CONSTRAINT "annee_scolaire_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etablissement" ADD CONSTRAINT "etablissement_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periode" ADD CONSTRAINT "periode_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periode" ADD CONSTRAINT "periode_annee_scolaire_fk" FOREIGN KEY ("organisation_id","annee_scolaire_id") REFERENCES "public"."annee_scolaire"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personne_organisation_id_email_key" ON "personne" USING btree ("organisation_id",lower("email")) WHERE "personne"."deleted_at" is null;--> statement-breakpoint
CREATE POLICY "organisation_isolation" ON "organisation" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (id = app_current_organisation_id()) WITH CHECK (id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "personne_isolation" ON "personne" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "annee_scolaire_isolation" ON "annee_scolaire" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "etablissement_isolation" ON "etablissement" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "periode_isolation" ON "periode" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
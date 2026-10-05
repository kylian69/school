CREATE TYPE "public"."client_etat" AS ENUM('actif', 'suspendu', 'resilie', 'supprime');--> statement-breakpoint
CREATE TYPE "public"."client_mode" AS ENUM('saas', 'auto_heberge');--> statement-breakpoint
CREATE TYPE "public"."formule" AS ENUM('essentiel', 'pro', 'entreprise');--> statement-breakpoint
CREATE TYPE "public"."module_origine" AS ENUM('formule', 'exception');--> statement-breakpoint
CREATE TYPE "public"."plateforme_role" AS ENUM('super_administrateur', 'support');--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY NOT NULL,
	"groupe_id" uuid,
	"organisation_id" uuid,
	"raison_sociale" text NOT NULL,
	"siren" text,
	"sous_domaine" text NOT NULL,
	"mode" "client_mode" DEFAULT 'saas' NOT NULL,
	"etat" "client_etat" DEFAULT 'actif' NOT NULL,
	"contact_facturation_nom" text,
	"contact_facturation_email" text,
	"administrateur_nom" text NOT NULL,
	"administrateur_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "client_sousDomaine_unique" UNIQUE("sous_domaine"),
	CONSTRAINT "client_porte_un_groupe_ou_une_organisation" CHECK (num_nonnulls("client"."groupe_id", "client"."organisation_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "client_etat_evenement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"etat_precedent" "client_etat",
	"etat" "client_etat" NOT NULL,
	"motif" text NOT NULL,
	"auteur_id" uuid,
	"survenu_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contrat" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"formule" "formule" NOT NULL,
	"volume_apprenants" integer NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"reference_devis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contrat_volume_positif" CHECK ("contrat"."volume_apprenants" > 0),
	CONSTRAINT "contrat_dates" CHECK ("contrat"."date_fin" > "contrat"."date_debut")
);
--> statement-breakpoint
CREATE TABLE "organisation_module" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"module" text NOT NULL,
	"actif" boolean NOT NULL,
	"origine" "module_origine" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organisation_module_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "organisation_module" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plateforme_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"survenu_le" timestamp with time zone DEFAULT now() NOT NULL,
	"auteur_id" uuid,
	"adresse_ip" "inet",
	"action" text NOT NULL,
	"objet_type" text NOT NULL,
	"objet_id" uuid,
	"avant" jsonb,
	"apres" jsonb
);
--> statement-breakpoint
CREATE TABLE "plateforme_membre" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "plateforme_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "plateforme_membre_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_groupe_id_groupe_id_fk" FOREIGN KEY ("groupe_id") REFERENCES "public"."groupe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_etat_evenement" ADD CONSTRAINT "client_etat_evenement_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_etat_evenement" ADD CONSTRAINT "client_etat_evenement_auteur_id_auth_user_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_module" ADD CONSTRAINT "organisation_module_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plateforme_membre" ADD CONSTRAINT "plateforme_membre_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_module_organisation_id_module_key" ON "organisation_module" USING btree ("organisation_id","module");--> statement-breakpoint
CREATE POLICY "organisation_plateforme" ON "organisation" AS PERMISSIVE FOR ALL TO "scolaly_platform" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "organisation_module_isolation" ON "organisation_module" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "organisation_module_plateforme" ON "organisation_module" AS PERMISSIVE FOR ALL TO "scolaly_platform" USING (true) WITH CHECK (true);
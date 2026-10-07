CREATE TYPE "public"."contrat_alternance_statut" AS ENUM('brouillon', 'signe', 'en_cours', 'termine', 'rompu');--> statement-breakpoint
CREATE TYPE "public"."contrat_alternance_type" AS ENUM('apprentissage', 'professionnalisation', 'autre');--> statement-breakpoint
CREATE TYPE "public"."convention_statut" AS ENUM('brouillon', 'signee', 'en_cours', 'terminee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."motif_rupture" AS ENUM('periode_essai', 'accord_commun', 'demission', 'licenciement', 'autre');--> statement-breakpoint
CREATE TABLE "contrat_alternance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"inscription_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"entreprise_id" uuid NOT NULL,
	"type" "contrat_alternance_type" NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL,
	"opco" text,
	"numero_depot" text,
	"statut" "contrat_alternance_statut" DEFAULT 'brouillon' NOT NULL,
	"referent_id" uuid,
	"formation_prolongee" boolean DEFAULT false NOT NULL,
	"date_rupture" date,
	"motif_rupture" "motif_rupture",
	"sans_employeur_jusquau" date,
	"document_cle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contrat_alternance_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "contrat_alternance_dates_check" CHECK ("contrat_alternance"."fin" >= "contrat_alternance"."debut")
);
--> statement-breakpoint
ALTER TABLE "contrat_alternance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contrat_tuteur" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"contrat_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"debut" date NOT NULL,
	"fin" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contrat_tuteur_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "contrat_tuteur" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "convention_stage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"inscription_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"entreprise_id" uuid NOT NULL,
	"tuteur_id" uuid,
	"referent_id" uuid NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL,
	"heures_presence" numeric(7, 2) NOT NULL,
	"missions" text,
	"gratification_horaire" integer,
	"statut" "convention_statut" DEFAULT 'brouillon' NOT NULL,
	"derogation_motif" text,
	"document_cle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "convention_stage_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "convention_stage_dates_check" CHECK ("convention_stage"."fin" >= "convention_stage"."debut"),
	CONSTRAINT "convention_stage_valeurs_check" CHECK ("convention_stage"."heures_presence" > 0 and ("convention_stage"."gratification_horaire" is null or "convention_stage"."gratification_horaire" >= 0))
);
--> statement-breakpoint
ALTER TABLE "convention_stage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contrat_alternance" ADD CONSTRAINT "contrat_alternance_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrat_alternance" ADD CONSTRAINT "contrat_alternance_inscription_fk" FOREIGN KEY ("organisation_id","inscription_id") REFERENCES "public"."inscription"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrat_alternance" ADD CONSTRAINT "contrat_alternance_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrat_alternance" ADD CONSTRAINT "contrat_alternance_entreprise_fk" FOREIGN KEY ("organisation_id","entreprise_id") REFERENCES "public"."entreprise"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrat_alternance" ADD CONSTRAINT "contrat_alternance_referent_fk" FOREIGN KEY ("organisation_id","referent_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrat_tuteur" ADD CONSTRAINT "contrat_tuteur_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrat_tuteur" ADD CONSTRAINT "contrat_tuteur_contrat_fk" FOREIGN KEY ("organisation_id","contrat_id") REFERENCES "public"."contrat_alternance"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrat_tuteur" ADD CONSTRAINT "contrat_tuteur_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convention_stage" ADD CONSTRAINT "convention_stage_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convention_stage" ADD CONSTRAINT "convention_stage_inscription_fk" FOREIGN KEY ("organisation_id","inscription_id") REFERENCES "public"."inscription"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convention_stage" ADD CONSTRAINT "convention_stage_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convention_stage" ADD CONSTRAINT "convention_stage_entreprise_fk" FOREIGN KEY ("organisation_id","entreprise_id") REFERENCES "public"."entreprise"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convention_stage" ADD CONSTRAINT "convention_stage_tuteur_fk" FOREIGN KEY ("organisation_id","tuteur_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convention_stage" ADD CONSTRAINT "convention_stage_referent_fk" FOREIGN KEY ("organisation_id","referent_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contrat_alternance_personne_idx" ON "contrat_alternance" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE INDEX "contrat_alternance_entreprise_idx" ON "contrat_alternance" USING btree ("organisation_id","entreprise_id");--> statement-breakpoint
CREATE INDEX "contrat_tuteur_contrat_idx" ON "contrat_tuteur" USING btree ("organisation_id","contrat_id");--> statement-breakpoint
CREATE INDEX "contrat_tuteur_personne_idx" ON "contrat_tuteur" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE INDEX "convention_stage_personne_idx" ON "convention_stage" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE INDEX "convention_stage_entreprise_idx" ON "convention_stage" USING btree ("organisation_id","entreprise_id");--> statement-breakpoint
CREATE POLICY "contrat_alternance_isolation" ON "contrat_alternance" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "contrat_tuteur_isolation" ON "contrat_tuteur" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "convention_stage_isolation" ON "convention_stage" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
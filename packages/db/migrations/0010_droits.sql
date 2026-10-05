CREATE TYPE "public"."perimetre_type" AS ENUM('organisation', 'etablissement', 'formation', 'promotion', 'soi');--> statement-breakpoint
CREATE TABLE "attribution" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"perimetre_type" "perimetre_type" NOT NULL,
	"perimetre_id" uuid,
	"debut" date NOT NULL,
	"fin" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "attribution_organisation_id_id_key" UNIQUE("organisation_id","id"),
	CONSTRAINT "attribution_dates" CHECK ("attribution"."fin" is null or "attribution"."fin" > "attribution"."debut"),
	CONSTRAINT "attribution_perimetre" CHECK (("attribution"."perimetre_type" in ('organisation', 'soi')) = ("attribution"."perimetre_id" is null))
);
--> statement-breakpoint
ALTER TABLE "attribution" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"code" text,
	"libelle" text NOT NULL,
	"description" text,
	"perimetre_par_defaut" "perimetre_type" DEFAULT 'organisation' NOT NULL,
	"double_authentification_requise" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "role_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role_permission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "role_permission_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "role_permission" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "attribution" ADD CONSTRAINT "attribution_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution" ADD CONSTRAINT "attribution_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution" ADD CONSTRAINT "attribution_role_fk" FOREIGN KEY ("organisation_id","role_id") REFERENCES "public"."role"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_fk" FOREIGN KEY ("organisation_id","role_id") REFERENCES "public"."role"("organisation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attribution_organisation_id_personne_id_idx" ON "attribution" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE INDEX "attribution_organisation_id_role_id_idx" ON "attribution" USING btree ("organisation_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_organisation_id_code_key" ON "role" USING btree ("organisation_id","code") WHERE "role"."code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_permission_organisation_id_role_id_permission_key" ON "role_permission" USING btree ("organisation_id","role_id","permission");--> statement-breakpoint
ALTER TABLE "personne" ADD CONSTRAINT "personne_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personne_organisation_id_user_id_key" ON "personne" USING btree ("organisation_id","user_id") WHERE "personne"."user_id" is not null;--> statement-breakpoint
CREATE POLICY "attribution_isolation" ON "attribution" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "role_isolation" ON "role" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "role_permission_isolation" ON "role_permission" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());
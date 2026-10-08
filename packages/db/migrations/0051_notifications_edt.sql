CREATE TYPE "public"."notification_edt_nature" AS ENUM('publication', 'modification', 'annulation', 'report', 'retrait');--> statement-breakpoint
CREATE TABLE "notification_edt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"evenement_id" uuid NOT NULL,
	"personne_id" uuid NOT NULL,
	"seance_id" uuid NOT NULL,
	"nature" "notification_edt_nature" NOT NULL,
	"urgente" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "notification_edt_organisation_id_id_key" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "notification_edt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_edt" ADD CONSTRAINT "notification_edt_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_edt" ADD CONSTRAINT "notification_edt_personne_fk" FOREIGN KEY ("organisation_id","personne_id") REFERENCES "public"."personne"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_edt" ADD CONSTRAINT "notification_edt_seance_fk" FOREIGN KEY ("organisation_id","seance_id") REFERENCES "public"."seance"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_edt_evenement_key" ON "notification_edt" USING btree ("organisation_id","evenement_id","personne_id","seance_id");--> statement-breakpoint
CREATE INDEX "notification_edt_personne_idx" ON "notification_edt" USING btree ("organisation_id","personne_id");--> statement-breakpoint
CREATE POLICY "notification_edt_isolation" ON "notification_edt" AS PERMISSIVE FOR ALL TO "scolaly_app" USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- RG-04-14 : changements d'emploi du temps en attente d'envoi, toutes organisations (worker).
-- Seuls des identifiants et des dates en sortent ; la lecture détaillée se fait ensuite sous la
-- RLS de chaque organisation.
CREATE OR REPLACE FUNCTION notifications_edt_en_attente()
  RETURNS TABLE (organisation_id uuid, personne_id uuid, urgente boolean, premier timestamptz, dernier timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT n.organisation_id, n.personne_id, n.urgente, min(n.created_at), max(n.created_at)
    FROM notification_edt n
    WHERE n.deleted_at IS NULL
    GROUP BY n.organisation_id, n.personne_id, n.urgente
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION notifications_edt_en_attente() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION notifications_edt_en_attente() TO scolaly_app;

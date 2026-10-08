ALTER TABLE "seance" ADD COLUMN "reportee_vers_id" uuid;--> statement-breakpoint
ALTER TABLE "seance" ADD COLUMN "modifiee_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seance" ADD CONSTRAINT "seance_reportee_vers_fk" FOREIGN KEY ("organisation_id","reportee_vers_id") REFERENCES "public"."seance"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance" ADD CONSTRAINT "seance_report_check" CHECK ("seance"."statut" <> 'reportee' or ("seance"."reportee_vers_id" is not null and "seance"."motif_annulation" is not null));--> statement-breakpoint
-- US-04-11 : une séance annulée, reportée ou en brouillon ne s'émarge pas ; elle n'est plus
-- préchargée dans le cache de l'émargement (RG-00-17).
CREATE OR REPLACE FUNCTION seances_a_precharger(de timestamptz, a timestamptz)
  RETURNS TABLE (organisation_id uuid, id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.organisation_id, s.id FROM seance s
    WHERE s.debut >= de AND s.debut < a AND s.deleted_at IS NULL AND s.statut = 'publiee'
$$;

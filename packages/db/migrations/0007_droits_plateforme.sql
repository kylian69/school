-- Frontières de la console de la plateforme (ADR 0004).

-- Tables privées de la plateforme : aucun droit pour le rôle applicatif.
REVOKE ALL ON "client", "contrat", "client_etat_evenement", "plateforme_membre", "plateforme_audit" FROM scolaly_app;--> statement-breakpoint

-- Rôle plateforme : tables de la plateforme (historique et audit en ajout seul).
GRANT SELECT, INSERT, UPDATE ON "client", "contrat" TO scolaly_platform;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "plateforme_membre" TO scolaly_platform;--> statement-breakpoint
GRANT SELECT, INSERT ON "client_etat_evenement", "plateforme_audit" TO scolaly_platform;--> statement-breakpoint

-- Rôle plateforme : groupes, organisations et modules des écoles, rien d'autre.
GRANT SELECT, INSERT, UPDATE ON "groupe", "organisation" TO scolaly_platform;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "organisation_module" TO scolaly_platform;--> statement-breakpoint

-- L'école lit ses modules, sans pouvoir les modifier.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "organisation_module" FROM scolaly_app;--> statement-breakpoint

-- Ajout seul, y compris pour le propriétaire des tables.
CREATE FUNCTION interdire_modification() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La table % est en ajout seul.', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;--> statement-breakpoint
CREATE TRIGGER client_etat_evenement_ajout_seul BEFORE UPDATE OR DELETE ON "client_etat_evenement"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();--> statement-breakpoint
CREATE TRIGGER plateforme_audit_ajout_seul BEFORE UPDATE OR DELETE ON "plateforme_audit"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();

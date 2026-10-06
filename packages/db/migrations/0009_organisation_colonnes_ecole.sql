-- L'école ne modifie que ses informations ; son accès, son groupe et sa corbeille relèvent de la
-- console de la plateforme (RG-19-02, ADR 0004).
REVOKE UPDATE ON "organisation" FROM scolaly_app;--> statement-breakpoint
GRANT UPDATE ("nom", "nom_affichage", "siren", "updated_at", "updated_by") ON "organisation" TO scolaly_app;

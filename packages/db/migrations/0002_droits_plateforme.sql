-- Tables de plateforme (ADR 0002) : le rôle applicatif lit les groupes et met à jour sa propre
-- organisation, mais ne crée ni ne supprime aucun groupe ni aucune organisation.
-- Ces opérations relèvent de la console de la plateforme (module 19).
REVOKE INSERT, UPDATE, DELETE ON "groupe" FROM scolaly_app;--> statement-breakpoint
REVOKE INSERT, DELETE ON "organisation" FROM scolaly_app;

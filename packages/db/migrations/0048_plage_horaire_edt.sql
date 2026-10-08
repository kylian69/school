ALTER TABLE "etablissement" ADD COLUMN "edt_debut" time DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "etablissement" ADD COLUMN "edt_fin" time DEFAULT '19:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "etablissement" ADD COLUMN "edt_limite_midi" time DEFAULT '13:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "etablissement" ADD COLUMN "edt_jours_ouvres" smallint[] DEFAULT '{1,2,3,4,5}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "etablissement" ADD CONSTRAINT "etablissement_edt_plage_check" CHECK ("etablissement"."edt_fin" > "etablissement"."edt_debut");--> statement-breakpoint
ALTER TABLE "etablissement" ADD CONSTRAINT "etablissement_edt_limite_check" CHECK ("etablissement"."edt_limite_midi" > "etablissement"."edt_debut" AND "etablissement"."edt_limite_midi" < "etablissement"."edt_fin");--> statement-breakpoint
ALTER TABLE "etablissement" ADD CONSTRAINT "etablissement_edt_jours_check" CHECK (cardinality("etablissement"."edt_jours_ouvres") >= 1 AND "etablissement"."edt_jours_ouvres" <@ '{1,2,3,4,5,6,7}'::smallint[]);
CREATE TYPE "public"."photo_statut" AS ENUM('en_attente', 'validee', 'refusee');--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "photo_cle" text;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "photo_attente_cle" text;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "photo_statut" "photo_statut";--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "photo_motif" text;
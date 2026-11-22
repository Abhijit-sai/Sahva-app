ALTER TABLE "users" ALTER COLUMN "audio_mix_original_muted" SET DEFAULT true;
--> statement-breakpoint
UPDATE "users" SET "audio_mix_original_muted" = true WHERE "audio_mix_original_muted" = false;

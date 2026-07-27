ALTER TYPE "public"."session_status" ADD VALUE 'LOBBY' BEFORE 'SWIPING_ACTIVE';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "status" SET DEFAULT 'LOBBY';
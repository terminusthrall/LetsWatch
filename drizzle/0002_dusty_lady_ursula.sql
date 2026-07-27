ALTER TABLE "session_media" ALTER COLUMN "is_matched" SET DATA TYPE boolean USING ("is_matched" = 1);--> statement-breakpoint
ALTER TABLE "session_media" ALTER COLUMN "is_matched" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_guest" SET DATA TYPE boolean USING ("is_guest" = 1);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_guest" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_pro_subscriber" SET DATA TYPE boolean USING ("is_pro_subscriber" = 1);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_pro_subscriber" SET DEFAULT false;--> statement-breakpoint
ALTER TYPE "public"."session_status" ADD VALUE 'DEADLINE_RESOLVED' BEFORE 'COMPLETED';--> statement-breakpoint
CREATE TABLE "session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "join_code" varchar(6);--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_session_participants_session_id" ON "session_participants" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_session_participant" ON "session_participants" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sessions_join_code" ON "sessions" USING btree ("join_code");
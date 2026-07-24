CREATE TYPE "public"."session_status" AS ENUM('SWIPING_ACTIVE', 'HEAD_TO_HEAD_ACTIVE', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."vote_direction" AS ENUM('LIKE', 'PASS');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "head_to_head_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"preferred_media_id" uuid NOT NULL,
	"opponent_media_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"tmdb_id" varchar(50) NOT NULL,
	"media_type" varchar(10) NOT NULL,
	"title" varchar(255) NOT NULL,
	"poster_path" varchar(255),
	"release_year" varchar(10),
	"overview" varchar(1000),
	"is_matched" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"title" varchar(100) DEFAULT 'Movie Night' NOT NULL,
	"status" "session_status" DEFAULT 'SWIPING_ACTIVE' NOT NULL,
	"final_winning_media_id" varchar(50),
	"deadline_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"vote" "vote_direction" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(50) NOT NULL,
	"email" varchar(255),
	"is_guest" integer DEFAULT 1 NOT NULL,
	"is_pro_subscriber" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "head_to_head_votes" ADD CONSTRAINT "head_to_head_votes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "head_to_head_votes" ADD CONSTRAINT "head_to_head_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "head_to_head_votes" ADD CONSTRAINT "head_to_head_votes_preferred_media_id_session_media_id_fk" FOREIGN KEY ("preferred_media_id") REFERENCES "public"."session_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "head_to_head_votes" ADD CONSTRAINT "head_to_head_votes_opponent_media_id_session_media_id_fk" FOREIGN KEY ("opponent_media_id") REFERENCES "public"."session_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_media" ADD CONSTRAINT "session_media_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_media_id_session_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."session_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_user_id" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_h2h_session_user" ON "head_to_head_votes" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_session_media_session_id" ON "session_media" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_session_tmdb" ON "session_media" USING btree ("session_id","tmdb_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_host_id" ON "sessions" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "idx_swipes_session_user" ON "swipes" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_user_swipe" ON "swipes" USING btree ("session_id","user_id","media_id");
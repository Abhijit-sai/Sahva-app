CREATE TYPE "public"."call_status" AS ENUM('ringing', 'active', 'ended', 'missed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'voice_note', 'call_summary');--> statement-breakpoint
CREATE TYPE "public"."audio_model" AS ENUM('auto', 'gemini-3.5-live-translate-preview', 'gemini-3.8-live');--> statement-breakpoint
CREATE TYPE "public"."ring_status" AS ENUM('ringing', 'delivered', 'answered', 'declined', 'missed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."voice_tone" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TYPE "public"."triggered_via" AS ENUM('app', 'internal_api');--> statement-breakpoint
CREATE TABLE "call_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" text NOT NULL,
	"conversation_id" uuid,
	"initiator_user_id" uuid NOT NULL,
	"status" "call_status" DEFAULT 'ringing' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connected_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"duration_sec" integer,
	"recording_s3_key" text,
	"participant_snapshot_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transcript_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_sessions_room_id_unique" UNIQUE("room_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_key" text NOT NULL,
	"is_group" boolean DEFAULT false NOT NULL,
	"title" text,
	"created_by_user_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"direct_pair" text,
	"invite_token" uuid DEFAULT gen_random_uuid(),
	CONSTRAINT "conversations_room_key_unique" UNIQUE("room_key"),
	CONSTRAINT "conversations_direct_pair_unique" UNIQUE("direct_pair"),
	CONSTRAINT "conversations_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"kind" "message_kind" NOT NULL,
	"source_language_code" text NOT NULL,
	"original_text" text NOT NULL,
	"translations_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"original_audio_s3_key" text,
	"translated_audio_map_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_sec" integer,
	"call_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"call_session_id" uuid,
	"user_id" uuid NOT NULL,
	"language_code" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"key_decisions_json" jsonb NOT NULL,
	"action_items_json" jsonb NOT NULL,
	"transcript_json" jsonb NOT NULL,
	"recording_s3_key" text,
	"tts_audio_s3_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "participant_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_ring_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_session_id" uuid NOT NULL,
	"caller_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"status" "ring_status" DEFAULT 'ringing' NOT NULL,
	"triggered_via" "triggered_via" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"meeting_note_id" uuid,
	"title" text NOT NULL,
	"assignee_name" text,
	"due_hint" text,
	"source_todo_id" text,
	"completed" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"preferred_language_code" text DEFAULT 'en-US' NOT NULL,
	"preferred_language_name" text DEFAULT 'English' NOT NULL,
	"voice_tone" "voice_tone" DEFAULT 'female' NOT NULL,
	"audio_model_preference" "audio_model" DEFAULT 'auto' NOT NULL,
	"audio_mix_duck_level" real DEFAULT 0.15 NOT NULL,
	"audio_mix_translated_gain" real DEFAULT 1 NOT NULL,
	"audio_mix_original_muted" boolean DEFAULT false NOT NULL,
	"theme" "theme" DEFAULT 'light' NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_initiator_user_id_users_id_fk" FOREIGN KEY ("initiator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_ring_events" ADD CONSTRAINT "call_ring_events_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_ring_events" ADD CONSTRAINT "call_ring_events_caller_user_id_users_id_fk" FOREIGN KEY ("caller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_ring_events" ADD CONSTRAINT "call_ring_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_meeting_note_id_meeting_notes_id_fk" FOREIGN KEY ("meeting_note_id") REFERENCES "public"."meeting_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_sessions_conversation_id_created_at_index" ON "call_sessions" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "call_sessions_status_expires_at_index" ON "call_sessions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_created_at_index" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_notes_call_session_id_user_id_language_code_index" ON "meeting_notes" USING btree ("call_session_id","user_id","language_code");--> statement-breakpoint
CREATE INDEX "meeting_notes_user_id_conversation_id_index" ON "meeting_notes" USING btree ("user_id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_conversation_id_user_id_index" ON "conversation_participants" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_user_id_index" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "call_ring_events_call_session_id_target_user_id_index" ON "call_ring_events" USING btree ("call_session_id","target_user_id");--> statement-breakpoint
CREATE INDEX "call_ring_events_target_user_id_status_index" ON "call_ring_events" USING btree ("target_user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_user_id_archived_index" ON "tasks" USING btree ("user_id","archived");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_meeting_note_id_source_todo_id_index" ON "tasks" USING btree ("meeting_note_id","source_todo_id");
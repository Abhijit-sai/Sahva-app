CREATE TABLE "unread_messages" (
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unread_messages" ADD CONSTRAINT "unread_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unread_messages" ADD CONSTRAINT "unread_messages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unread_messages" ADD CONSTRAINT "unread_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unread_messages_user_id_message_id_index" ON "unread_messages" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "unread_messages_user_id_conversation_id_index" ON "unread_messages" USING btree ("user_id","conversation_id");
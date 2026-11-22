import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { LocalizedMeetingNote, TranscriptEntry } from "../types";

const id = () => uuid("id").defaultRandom().primaryKey();
const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
const created = () => time("created_at").defaultNow().notNull();
const updated = () => time("updated_at").defaultNow().notNull();
export const tone = pgEnum("voice_tone", ["female", "male"]);
export const model = pgEnum("audio_model", [
  "auto",
  "gemini-3.5-live-translate-preview",
  "gemini-3.8-live",
]);
export const theme = pgEnum("theme", ["light", "dark"]);
export const role = pgEnum("participant_role", ["owner", "member"]);
export const kind = pgEnum("message_kind", [
  "text",
  "voice_note",
  "call_summary",
]);
export const callStatus = pgEnum("call_status", [
  "ringing",
  "active",
  "ended",
  "missed",
  "declined",
]);
export const ringStatus = pgEnum("ring_status", [
  "ringing",
  "delivered",
  "answered",
  "declined",
  "missed",
  "cancelled",
]);
export const via = pgEnum("triggered_via", ["app", "internal_api"]);

export const users = pgTable("users", {
  id: id(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text().notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  preferredLanguageCode: text("preferred_language_code")
    .default("en-US")
    .notNull(),
  preferredLanguageName: text("preferred_language_name")
    .default("English")
    .notNull(),
  voiceTone: tone("voice_tone").default("female").notNull(),
  audioModelPreference: model("audio_model_preference")
    .default("auto")
    .notNull(),
  audioMixDuckLevel: real("audio_mix_duck_level").default(0.15).notNull(),
  audioMixTranslatedGain: real("audio_mix_translated_gain")
    .default(1)
    .notNull(),
  audioMixOriginalMuted: boolean("audio_mix_original_muted")
    .default(true)
    .notNull(),
  theme: theme().default("light").notNull(),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  lastSeenAt: time("last_seen_at").defaultNow().notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
const userRef = (name: string) =>
  uuid(name)
    .references(() => users.id)
    .notNull();
export const conversations = pgTable("conversations", {
  id: id(),
  roomKey: text("room_key").notNull().unique(),
  isGroup: boolean("is_group").notNull().default(false),
  title: text(),
  createdByUserId: userRef("created_by_user_id"),
  lastMessageAt: time("last_message_at"),
  createdAt: created(),
  directPair: text("direct_pair").unique(),
  inviteToken: uuid("invite_token").defaultRandom().unique(),
});
const conversationRef = () =>
  uuid("conversation_id").references(() => conversations.id, {
    onDelete: "cascade",
  });
export const participants = pgTable(
  "conversation_participants",
  {
    id: id(),
    conversationId: conversationRef().notNull(),
    userId: userRef("user_id"),
    role: role().notNull().default("member"),
    joinedAt: time("joined_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex().on(t.conversationId, t.userId), index().on(t.userId)],
);
export const calls = pgTable(
  "call_sessions",
  {
    id: id(),
    roomId: text("room_id").notNull().unique(),
    conversationId: conversationRef(),
    initiatorUserId: userRef("initiator_user_id"),
    status: callStatus().notNull().default("ringing"),
    startedAt: time("started_at").defaultNow().notNull(),
    connectedAt: time("connected_at"),
    endedAt: time("ended_at"),
    expiresAt: time("expires_at").notNull(),
    durationSec: integer("duration_sec"),
    recordingS3Key: text("recording_s3_key"),
    participantSnapshotJson: jsonb("participant_snapshot_json")
      .$type<Array<{ id: string; name: string; language: string }>>()
      .default([])
      .notNull(),
    transcriptJson: jsonb("transcript_json")
      .$type<TranscriptEntry[]>()
      .default([])
      .notNull(),
    createdAt: created(),
  },
  (t) => [
    index().on(t.conversationId, t.createdAt),
    index().on(t.status, t.expiresAt),
  ],
);
const callRef = () => uuid("call_session_id").references(() => calls.id);
export const rings = pgTable(
  "call_ring_events",
  {
    id: id(),
    callSessionId: callRef().notNull(),
    callerUserId: userRef("caller_user_id"),
    targetUserId: userRef("target_user_id"),
    status: ringStatus().default("ringing").notNull(),
    triggeredVia: via("triggered_via").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex().on(t.callSessionId, t.targetUserId),
    index().on(t.targetUserId, t.status),
  ],
);
export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: conversationRef().notNull(),
    senderUserId: userRef("sender_user_id"),
    kind: kind().notNull(),
    sourceLanguageCode: text("source_language_code").notNull(),
    originalText: text("original_text").notNull(),
    translationsJson: jsonb("translations_json")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    originalAudioS3Key: text("original_audio_s3_key"),
    translatedAudioMapJson: jsonb("translated_audio_map_json")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    durationSec: integer("duration_sec"),
    callSessionId: callRef(),
    createdAt: created(),
  },
  (t) => [index().on(t.conversationId, t.createdAt)],
);
// Only new incoming chat messages acquire receipts. Existing history stays read.
export const unreadMessages = pgTable("unread_messages", {
  userId: userRef("user_id"),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  conversationId: conversationRef().notNull(),
}, (t) => [uniqueIndex().on(t.userId, t.messageId), index().on(t.userId, t.conversationId)]);
export const notes = pgTable(
  "meeting_notes",
  {
    id: id(),
    conversationId: conversationRef().notNull(),
    callSessionId: callRef(),
    userId: userRef("user_id"),
    languageCode: text("language_code").notNull(),
    title: text().notNull(),
    summary: text().notNull(),
    keyDecisionsJson: jsonb("key_decisions_json").$type<string[]>().notNull(),
    localizationsJson: jsonb("localizations_json")
      .$type<Record<string, LocalizedMeetingNote>>()
      .default({})
      .notNull(),
    actionItemsJson: jsonb("action_items_json")
      .$type<LocalizedMeetingNote>()
      .notNull(),
    transcriptJson: jsonb("transcript_json")
      .$type<TranscriptEntry[]>()
      .notNull(),
    recordingS3Key: text("recording_s3_key"),
    ttsAudioS3Key: text("tts_audio_s3_key"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex().on(t.callSessionId, t.userId, t.languageCode),
    index().on(t.userId, t.conversationId),
  ],
);
export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    userId: userRef("user_id"),
    conversationId: conversationRef(),
    meetingNoteId: uuid("meeting_note_id").references(() => notes.id),
    title: text().notNull(),
    assigneeName: text("assignee_name"),
    dueHint: text("due_hint"),
    sourceTodoId: text("source_todo_id"),
    completed: boolean().notNull().default(false),
    archived: boolean().notNull().default(false),
    reminderAt: time("reminder_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index().on(t.userId, t.archived),
    uniqueIndex().on(t.meetingNoteId, t.sourceTodoId),
  ],
);
export type User = typeof users.$inferSelect;

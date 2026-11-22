import { and, eq, inArray, desc, count, ne } from "drizzle-orm";
import { db } from "../../src/db";
import {
  users,
  conversations,
  participants,
  unreadMessages,
  messages,
  notes,
  tasks,
  calls,
  type User,
} from "../../src/db/schema";
import { mediaUrl } from "./s3";
import { HttpError } from "../middleware/auth";
import { getLanguageCode, SUPPORTED_LANGUAGES } from "../../src/data/languages";
import type { ChatMessage, MeetingNoteRecord } from "../../src/types";
export const languageName = (code: string) =>
  SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name ||
  (code === "en-US" ? "English" : code);
export const avatar = async (value: string | null) =>
  value?.startsWith("avatars/") ? mediaUrl(value) : value;
export async function membership(userId: string, roomKey: string) {
  const [row] = await db
    .select({ room: conversations })
    .from(conversations)
    .innerJoin(participants, eq(participants.conversationId, conversations.id))
    .where(
      and(eq(conversations.roomKey, roomKey), eq(participants.userId, userId)),
    );
  if (!row) throw new HttpError(404, "Conversation unavailable.");
  return row.room;
}
export async function members(id: string) {
  return (
    await db
      .select({ u: users })
      .from(participants)
      .innerJoin(users, eq(users.id, participants.userId))
      .where(eq(participants.conversationId, id))
  ).map((r) => r.u);
}
export async function threadList(user: User) {
  const rows = await db
    .select({ room: conversations })
    .from(participants)
    .innerJoin(conversations, eq(conversations.id, participants.conversationId))
    .where(eq(participants.userId, user.id))
    .orderBy(desc(conversations.createdAt));
  const counts = await db.select({ room: unreadMessages.conversationId, total: count() })
    .from(unreadMessages).where(eq(unreadMessages.userId, user.id)).groupBy(unreadMessages.conversationId);
  const unread = new Map(counts.map(row => [row.room, row.total]));
  return Promise.all(
    rows.map(async ({ room }) => {
      const others = (await members(room.id)).filter((u) => u.id !== user.id);
      const peer = others[0];
      const [last] = await db
        .select({ text: messages.originalText })
        .from(messages)
        .where(eq(messages.conversationId, room.id))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(1);
      return {
        id: room.id,
        roomId: room.roomKey,
        unreadCount: unread.get(room.id) || 0,
        title: room.title || peer?.displayName || "Conversation",
        partnerRoleLabel: room.isGroup ? "Group" : "Contact",
        partnerLocation: "",
        partnerName: peer?.displayName || room.title,
        partnerLanguage: peer?.preferredLanguageName || "",
        partnerAvatar: await avatar(peer?.avatarUrl),
        defaultSelfName: user.displayName,
        defaultSelfLanguage: user.preferredLanguageName,
        defaultSelfAvatar: await avatar(user.avatarUrl),
        lastMessagePreview: last?.text || "",
        isRecent: true,
        isCustomRoom: room.isGroup,
        targetUserIds: others.map((u) => u.id),
        inviteToken: room.isGroup ? room.inviteToken : null,
      };
    }),
  );
}
export async function history(
  conversationId: string,
  roomId: string,
  user: User,
): Promise<ChatMessage[]> {
  const rows = await db
    .select({ m: messages, u: users })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderUserId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(200);
  const personalNotes = await db
    .select({ call: notes.callSessionId, id: notes.id })
    .from(notes)
    .where(
      and(eq(notes.conversationId, conversationId), eq(notes.userId, user.id)),
    );
  return Promise.all(
    rows.reverse().map(async ({ m, u }) => {
      const code =
        Object.keys(m.translatedAudioMapJson).find(
          (k) => languageName(k) === user.preferredLanguageName,
        ) || Object.keys(m.translatedAudioMapJson)[0];
      const translations = Object.fromEntries(
        Object.entries(m.translationsJson).map(([k, v]) => [
          languageName(k),
          v,
        ]),
      );
      return {
        id: m.id,
        roomId,
        kind: m.kind === "voice_note" ? "audio" : m.kind,
        senderId: u.id,
        senderName: m.kind === "call_summary" ? "Meeting Notes" : u.displayName,
        senderRole: m.kind === "call_summary" ? "system" : "A",
        sourceLanguage: languageName(m.sourceLanguageCode),
        originalText: m.originalText,
        translations,
        noteId: m.callSessionId
          ? personalNotes.find((n) => n.call === m.callSessionId)?.id
          : undefined,
        timestamp: m.createdAt.toISOString(),
        audio:
          m.originalAudioS3Key && code
            ? {
                originalKey: m.originalAudioS3Key,
                translatedKey: m.translatedAudioMapJson[code],
                originalAudioUrl: await mediaUrl(m.originalAudioS3Key),
                originalLanguage: languageName(m.sourceLanguageCode),
                translatedAudioUrl: await mediaUrl(
                  m.translatedAudioMapJson[code],
                ),
                translatedLanguage: languageName(code),
                durationSeconds: m.durationSec || 0,
              }
            : undefined,
      };
    }),
  );
}
export async function saveMessage(
  conversationId: string,
  userId: string,
  m: ChatMessage,
  original?: string,
  translated: Record<string, string> = {},
  callId?: string,
) {
  await db.transaction(async (tx) => {
    await tx
      .insert(messages)
      .values({
        id: m.id,
        conversationId,
        senderUserId: userId,
        kind:
          m.kind === "audio"
            ? "voice_note"
            : m.kind === "call_summary"
              ? "call_summary"
              : "text",
        sourceLanguageCode: getLanguageCode(m.sourceLanguage),
        originalText: m.originalText,
        translationsJson: Object.fromEntries(
          Object.entries(m.translations).map(([k, v]) => [
            getLanguageCode(k),
            v,
          ]),
        ),
        durationSec: m.audio?.durationSeconds,
        originalAudioS3Key: original,
        translatedAudioMapJson: translated,
        callSessionId: callId,
      });
    if (m.kind !== "call_summary") {
      const recipients = await tx.select({ userId: participants.userId }).from(participants)
        .where(and(eq(participants.conversationId, conversationId), ne(participants.userId, userId)));
      if (recipients.length) await tx.insert(unreadMessages).values(
        recipients.map(({ userId }) => ({ userId, conversationId, messageId: m.id })));
    }
    await tx
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conversationId));
  });
}
export async function noteList(
  userId: string,
  roomId?: string,
): Promise<MeetingNoteRecord[]> {
  const rows = await db
    .select({ n: notes, room: conversations, call: calls })
    .from(notes)
    .innerJoin(conversations, eq(conversations.id, notes.conversationId))
    .leftJoin(calls, eq(calls.id, notes.callSessionId))
    .where(
      and(
        eq(notes.userId, userId),
        roomId ? eq(conversations.roomKey, roomId) : undefined,
      ),
    )
    .orderBy(desc(notes.createdAt));
  const todos = rows.length
    ? await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            inArray(
              tasks.meetingNoteId,
              rows.map((r) => r.n.id),
            ),
          ),
        )
    : [];
  return Promise.all(
    rows.map(async ({ n, room, call }) => {
      const people = call?.participantSnapshotJson.length
        ? call.participantSnapshotJson
        : [
            {
              name: room.title || "Conversation",
              language: languageName(n.languageCode),
            },
          ];
      const states = Object.fromEntries(
        todos
          .filter((t) => t.meetingNoteId === n.id)
          .map((t) => [t.sourceTodoId, t.completed]),
      );
      const loc = {
        ...n.actionItemsJson,
        todos: n.actionItemsJson.todos.map((t) => ({
          ...t,
          completed: states[t.id] || false,
        })),
      };
      const key = n.recordingS3Key || call?.recordingS3Key || n.ttsAudioS3Key;
      return {
        id: n.id,
        roomId: room.roomKey,
        callId: n.callSessionId || "",
        createdAt: n.createdAt.toISOString(),
        durationSeconds: call?.durationSec || 0,
        speakerA: people[0],
        speakerB: people[1] || people[0],
        participants: people,
        recordingUrl: key ? await mediaUrl(key) : undefined,
        localized: { ...n.localizationsJson, [loc.language]: loc },
        todoStates: states,
        transcripts: n.transcriptJson,
      };
    }),
  );
}

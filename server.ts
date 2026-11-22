import "./server/env";
import { MixedRecording } from "./server/services/recording";
import { nativeAuth } from "./server/nativeAuth";
import {
  attachUserSocket,
  signalApi,
  startSignaling,
  sendUser,
} from "./server/services/callSignaling";
import { api } from "./server/api";
import {
  auth,
  authenticate,
  currentUser,
  origins,
  route,
  HttpError,
} from "./server/middleware/auth";
import {
  membership,
  members,
  history,
  noteList,
  saveMessage,
} from "./server/services/repository";
import { db } from "./src/db";
import {
  calls,
  rings,
  notes as noteRows,
  tasks,
  messages as messageRows,
} from "./src/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { uploadMedia, mediaUrl } from "./server/services/s3";
import express from "express";
import path from "path";
import crypto from "crypto";

import { GoogleGenAI, Modality, ThinkingLevel, Type } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import { getLanguageCode, areSameLanguage } from "./src/data/languages";
import type {
  CallPhase,
  ChatMessage,
  LocalizedMeetingNote,
  MeetingNoteRecord,
  ParticipantInfo,
  RoomSnapshot,
  SpeakerRole,
  TranscriptEntry,
  TranslationModelPreference,
  VoiceTone,
} from "./src/types";

const app = express();
app.disable("x-powered-by");
app.get("/public-config", (req, res) => {
  if (req.headers.origin && origins().includes(req.headers.origin)) {
    res.set("Access-Control-Allow-Origin", req.headers.origin);
    res.vary("Origin");
  }
  res
    .set("Cache-Control", "no-store")
    .json({ publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || "" });
});
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !origins().includes(origin)) return res.status(403).end();
  if (origin) {
    res.set("Access-Control-Allow-Origin", origin);
    res.vary("Origin");
  }
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    return res.sendStatus(204);
  }
  next();
});
app.use("/api", auth);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const PORT = Number(process.env.PORT || 3000);

function stripUnsafeKeys(val: any): any {
  if (!val || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(stripUnsafeKeys);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (
      k === "httpOptions" ||
      k === "http_options" ||
      k === "__proto__" ||
      k === "constructor" ||
      k === "prototype"
    ) {
      continue;
    }
    out[k] = stripUnsafeKeys(v);
  }
  return out;
}

app.use((req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = stripUnsafeKeys(req.body);
  }
  next();
});

nativeAuth(app);
app.use("/api", api);
app.use("/api/calls", signalApi);
app.use(
  [
    "/api/chat",
    "/api/notes/generate",
    "/api/notes/localize",
    "/api/notes/audio",
  ],
  route(async (req, res, next) => {
    const user = currentUser(res);
    res.locals.room = await membership(user.id, String(req.body.roomId || ""));
    Object.assign(req.body, {
      senderId: user.id,
      senderName: user.displayName,
      sourceLanguage: user.preferredLanguageName,
      voiceTone: user.voiceTone,
    });
    next();
  }),
);

function getGeminiApiKey(): string {
  const raw = (process.env.GEMINI_API_KEY || "").trim();
  if (
    !raw ||
    raw.includes("MY_GEMINI_API_KEY") ||
    raw.includes("placeholder")
  ) {
    return "";
  }
  return raw;
}

function createGeminiClient(apiVersion: string = "v1beta"): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please verify GEMINI_API_KEY in Settings > Secrets.",
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      apiVersion,
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// ============================================================================
// Multi-Participant Live Translation Room & Audio Orchestrator
// ============================================================================

interface OutboundTranslator {
  targetLanguage: string;
  targetLangCode: string;
  modelPreference: TranslationModelPreference;
  voiceTone: VoiceTone;
  liveSession: any | null;
  connecting: boolean;
  ready: boolean;
  pendingAudioQueue: string[];
  pendingOriginalText: string;
  pendingTranslatedText: string;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

interface ParticipantSlot {
  id: string;
  role: SpeakerRole;
  ws: WebSocket | null;
  name: string;
  language: string;
  voiceTone: VoiceTone;
  preferredModel: TranslationModelPreference;
  inCall: boolean;
  muted: boolean;
  speaking: boolean;
  speakingTimer: ReturnType<typeof setTimeout> | null;
  translatorsByLang: Map<string, OutboundTranslator>;
  // Aggregated turn buffer across target languages for clean multi-language transcripts
  pendingTurnOriginal: string;
  pendingTurnTranslations: Record<string, string>;
  turnFlushTimer: ReturnType<typeof setTimeout> | null;
}

interface CallRoom {
  roomId: string;
  roomTitle: string;
  isCustomRoom: boolean;
  defaultPartner?: { name: string; language: string };
  participants: Map<string, ParticipantSlot>;
  callPhase: CallPhase;
  callerId: string | null;
  callId: string | null;
  callStartedAt: string | null;
  callStartEpochMs: number | null;
  recording: MixedRecording | null;
  transcripts: TranscriptEntry[];
  lastActivityAt: number;
}

function getPrebuiltVoiceForTone(voiceTone: VoiceTone): string {
  return voiceTone === "male" ? "Charon" : "Kore";
}

async function finishCall(room: CallRoom, conversationId: string) {
  const id = room.callId;
  if (!id) return;
  const recording = room.recording;
  room.recording = null;
  const transcript = [...room.transcripts];
  const durationSec = Math.max(
    0,
    Math.round((Date.now() - (room.callStartEpochMs || Date.now())) / 1000),
  );
  const key = recording
    ? await recording.upload(id).catch((e) => {
        console.error("Recording upload failed", e.name);
        return null;
      })
    : null;
  const [ended] = await db
    .update(calls)
    .set({
      status: "ended",
      endedAt: new Date(),
      durationSec,
      recordingS3Key: key,
      transcriptJson: transcript,
    })
    .where(and(eq(calls.id, id), eq(calls.status, "active")))
    .returning();
  if (ended) {
    for (const u of ended.participantSnapshotJson)
      sendUser(u.id, { type: "workspace:changed", roomId: room.roomId });
    const pending = await db
      .update(rings)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(rings.callSessionId, id),
          inArray(rings.status, ["ringing", "delivered"]),
        ),
      )
      .returning();
    for (const r of pending)
      sendUser(r.targetUserId, { type: "call:cancelled", callSessionId: id });
    await persistNotes(room, conversationId, ended);
  }
}

const rooms = new Map<string, CallRoom>();

function createParticipantSlot(
  id: string,
  role: SpeakerRole,
  name: string,
  language: string,
  preferredModel: TranslationModelPreference = "auto",
  voiceTone: VoiceTone = "female",
): ParticipantSlot {
  return {
    id,
    role,
    ws: null,
    name,
    language,
    voiceTone,
    preferredModel,
    inCall: false,
    muted: false,
    speaking: false,
    speakingTimer: null,
    translatorsByLang: new Map(),
    pendingTurnOriginal: "",
    pendingTurnTranslations: {},
    turnFlushTimer: null,
  };
}

function getOrCreateRoom(roomId: string, roomTitle?: string): CallRoom {
  const sanitizedId = roomId.trim().slice(0, 64) || "call-hyderabad-sync";
  const existing = rooms.get(sanitizedId);
  if (existing) {
    existing.lastActivityAt = Date.now();
    if (roomTitle && !existing.roomTitle) {
      existing.roomTitle = roomTitle.slice(0, 64);
    }
    return existing;
  }

  const room: CallRoom = {
    roomId: sanitizedId,
    roomTitle: roomTitle || sanitizedId,
    isCustomRoom: false,
    participants: new Map(),
    callPhase: "idle",
    callerId: null,
    callId: null,
    callStartedAt: null,
    callStartEpochMs: null,
    recording: null,
    transcripts: [],

    lastActivityAt: Date.now(),
  };

  rooms.set(sanitizedId, room);
  return room;
}

function isSlotConnected(slot: ParticipantSlot): boolean {
  return Boolean(slot.ws && slot.ws.readyState === WebSocket.OPEN);
}

function serializeParticipant(slot: ParticipantSlot): ParticipantInfo {
  let anyReady = false;
  for (const tr of slot.translatorsByLang.values()) {
    if (tr.ready) {
      anyReady = true;
      break;
    }
  }
  return {
    id: slot.id,
    role: slot.role,
    name: slot.name,
    language: slot.language,
    voiceTone: slot.voiceTone,
    connected: isSlotConnected(slot),
    inCall: slot.inCall,
    muted: slot.muted,
    speaking: slot.speaking,
    translatorReady: anyReady,
  };
}

function getConnectedParticipants(room: CallRoom): ParticipantInfo[] {
  const connected=new Map<string,ParticipantInfo>();
  for(const slot of room.participants.values()){
    if(isSlotConnected(slot) && (!connected.has(slot.id)||slot.inCall))connected.set(slot.id,serializeParticipant(slot));
  }
  return [...connected.values()];
}

function getInCallSlots(room: CallRoom): ParticipantSlot[] {
  const active: ParticipantSlot[] = [];
  for (const slot of room.participants.values()) {
    if (slot.inCall && isSlotConnected(slot)) {
      active.push(slot);
    }
  }
  return active;
}

function buildRoomSnapshot(room: CallRoom): RoomSnapshot {
  return {
    roomId: room.roomId,
    roomTitle: room.roomTitle,
    isCustomRoom: room.isCustomRoom,
    participants: getConnectedParticipants(room),
    callPhase: room.callPhase,
    callerId: room.callerId,
    callActive: room.callPhase === "active",
    callId: room.callId,
    callStartedAt: room.callStartedAt,
    transcripts: room.transcripts.slice(-200),
    messages: [],
    notes: [],
  };
}

function safeSend(ws: WebSocket | null, payload: object) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {}
  }
}

function broadcastRoom(room: CallRoom, payload: object) {
  for (const slot of room.participants.values()) {
    safeSend(slot.ws, payload);
  }
}

function broadcastPresence(room: CallRoom) {
  broadcastRoom(room, {
    type: "room:presence",
    participants: getConnectedParticipants(room),
    callPhase: room.callPhase,
    callerId: room.callerId,
    callActive: room.callPhase === "active",
    callId: room.callId,
    callStartedAt: room.callStartedAt,
  });
}

function flushParticipantTurn(room: CallRoom, slot: ParticipantSlot) {
  if (slot.turnFlushTimer) {
    clearTimeout(slot.turnFlushTimer);
    slot.turnFlushTimer = null;
  }

  const orig = slot.pendingTurnOriginal.trim();
  const translations: Record<string, string> = {};
  for (const [lang, txt] of Object.entries(slot.pendingTurnTranslations)) {
    const clean = txt.trim();
    if (clean) translations[lang] = clean;
  }
  if (orig) {
    translations[slot.language] = orig;
  }

  const translationEntries = Object.entries(translations).filter(
    ([lang]) => !areSameLanguage(lang, slot.language),
  );
  const primaryTargetLang = translationEntries[0]?.[0] || slot.language;
  const primaryTranslatedText = translationEntries[0]?.[1] || orig;

  slot.pendingTurnOriginal = "";
  slot.pendingTurnTranslations = {};

  if (!orig && !primaryTranslatedText) return;

  const entry: TranscriptEntry = {
    id: `tr-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    callId: room.callId || "session",
    speakerId: slot.id,
    speakerRole: slot.role,
    speakerName: slot.name,
    sourceLanguage: slot.language,
    targetLanguage: primaryTargetLang,
    originalText: orig || primaryTranslatedText,
    translatedText: primaryTranslatedText || orig,
    translations,
    timestamp: new Date().toISOString(),
  };

  room.transcripts.push(entry);
  if (room.transcripts.length > 400) {
    room.transcripts = room.transcripts.slice(-400);
  }

  broadcastRoom(room, { type: "call:transcript", entry });
  broadcastRoom(room, {
    type: "call:caption",
    speakerId: slot.id,
    caption: null,
  });
}

function closeSingleTranslator(tr: OutboundTranslator) {
  if (tr.flushTimer) {
    clearTimeout(tr.flushTimer);
    tr.flushTimer = null;
  }
  tr.connecting = false;
  tr.ready = false;
  tr.pendingAudioQueue = [];
  if (tr.liveSession) {
    const oldSession = tr.liveSession;
    tr.liveSession = null;
    try {
      oldSession.close();
    } catch {}
  }
}

function closeAllSlotTranslators(room: CallRoom, slot: ParticipantSlot) {
  flushParticipantTurn(room, slot);
  for (const tr of slot.translatorsByLang.values()) {
    closeSingleTranslator(tr);
  }
  slot.translatorsByLang.clear();
}

function isTransientOverloadError(err: any): boolean {
  const raw = String(err?.message || err || "").toLowerCase();
  return (
    raw.includes("503") ||
    raw.includes("unavailable") ||
    raw.includes("high demand") ||
    raw.includes("overloaded") ||
    raw.includes("429") ||
    raw.includes("resource_exhausted") ||
    raw.includes("rate limit") ||
    err?.status === 503 ||
    err?.status === "UNAVAILABLE" ||
    err?.code === 503 ||
    err?.code === 429
  );
}

function formatReadableGeminiError(err: any): string {
  const raw = String(err?.message || err || "Unexpected Gemini API error");
  try {
    const start = raw.indexOf("{");
    if (start !== -1) {
      const parsed = JSON.parse(raw.slice(start));
      if (parsed?.error?.message) {
        return String(parsed.error.message);
      }
    }
  } catch {}
  return raw;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateTextWithResilience(options: {
  contents: any;
  config?: any;
  primaryModel?: string;
  fallbackModel?: string;
}) {
  const primaryModel = options.primaryModel || "gemini-4-hydrogen";
  const fallbackModel = options.fallbackModel || "gemini-3.1-flash-lite";
  const ai = createGeminiClient("v1beta");

  const plan: Array<{ model: string; delayMs: number }> = [
    { model: primaryModel, delayMs: 0 },
    { model: primaryModel, delayMs: 700 },
    { model: fallbackModel, delayMs: 400 },
    { model: fallbackModel, delayMs: 1200 },
    { model: primaryModel, delayMs: 1600 },
  ];

  let lastErr: any = null;
  for (const step of plan) {
    if (step.delayMs > 0) await sleep(step.delayMs);
    try {
      const activeConfig = options.config ? { ...options.config } : undefined;
      if (
        activeConfig?.thinkingConfig &&
        step.model === "gemini-3.1-flash-lite"
      ) {
        delete activeConfig.thinkingConfig;
      }
      const response = await ai.models.generateContent({
        model: step.model,
        contents: options.contents,
        config: activeConfig,
      });
      if (response?.text) {
        return response;
      }
      throw new Error("Empty response returned by Gemini.");
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err).toLowerCase();
      if (msg.includes("api key") || msg.includes("permission_denied")) {
        throw err;
      }
      if (!isTransientOverloadError(err)) {
        if (step.model === fallbackModel) {
          throw err;
        }
      }
      console.warn(
        `[Gemini Text] ${step.model} failed (${formatReadableGeminiError(err)}), trying next attempt...`,
      );
    }
  }
  throw (
    lastErr || new Error("Gemini text generation is temporarily unavailable.")
  );
}

async function openLiveSessionWithHandshake(
  client: GoogleGenAI,
  model: string,
  config: any,
  callbacks: {
    onmessage: (msg: any) => void;
    onerror: (err: any) => void;
    onclose: (event?: any) => void;
  },
): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let sessionRef: any = null;
    let setupComplete = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanupTimers = () => {
      clearTimeout(timeout);
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
    };

    const tryResolve = () => {
      if (!settled && sessionRef && setupComplete) {
        settled = true;
        cleanupTimers();
        resolve(sessionRef);
      }
    };

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanupTimers();
        try {
          sessionRef?.close();
        } catch {}
        reject(new Error(`Timed out connecting to ${model}`));
      }
    }, 10000);

    client.live
      .connect({
        model,
        config,
        callbacks: {
          onopen: () => {},
          onmessage: (msg: any) => {
            if (!settled && msg?.setupComplete) {
              setupComplete = true;
              tryResolve();
            }
            callbacks.onmessage(msg);
          },
          onerror: (err: any) => {
            if (!settled) {
              settled = true;
              cleanupTimers();
              reject(err);
              return;
            }
            callbacks.onerror(err);
          },
          onclose: (ev: any) => {
            if (!settled) {
              settled = true;
              cleanupTimers();
              reject(
                new Error(
                  ev?.reason ||
                    `Connection closed during handshake (${ev?.code || "closed"})`,
                ),
              );
              return;
            }
            callbacks.onclose(ev);
          },
        },
      })
      .then((session) => {
        sessionRef = session;
        if (setupComplete) {
          tryResolve();
          return;
        }
        readyTimer = setTimeout(() => {
          if (!settled && sessionRef) {
            settled = true;
            cleanupTimers();
            resolve(sessionRef);
          }
        }, 1200);
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          cleanupTimers();
          reject(err);
        }
      });
  });
}

async function connectGeminiTranslateSession(
  sourceLangName: string,
  targetLangName: string,
  targetLangCode: string,
  sameLanguage: boolean,
  voiceName: string,
  preferredModel: TranslationModelPreference,
  callbacks: {
    onmessage: (msg: any) => void;
    onerror: (err: any) => void;
    onclose: (event?: any) => void;
  },
) {
  // @google/genai >= 3.x defaults to apiVersion "v1", which returns 404 on BidiGenerateContent.
  // Explicitly target v1alpha / v1beta for Live API sessions.
  // Pass BCP-47 languageCodes hint in inputAudioTranscription so Gemini never misdetects Telugu as Vietnamese/French!
  const sourceLangCode = getLanguageCode(sourceLangName);

  const translateConfigWithHintsAndVoice: any = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName } },
    },
    inputAudioTranscription: {
      languageCodes: [sourceLangCode],
    },
    outputAudioTranscription: {},
    translationConfig: {
      targetLanguageCode: targetLangCode,
      echoTargetLanguage: sameLanguage,
    },
  };

  const translateConfigWithHints: any = {
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {
      languageCodes: [sourceLangCode],
    },
    outputAudioTranscription: {},
    translationConfig: {
      targetLanguageCode: targetLangCode,
      echoTargetLanguage: sameLanguage,
    },
  };

  const translateConfigBasic: any = {
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: { languageCodes: [sourceLangCode] },
    outputAudioTranscription: {},
    translationConfig: {
      targetLanguageCode: targetLangCode,
      echoTargetLanguage: sameLanguage,
    },
  };

  const interpreterInstruction = sameLanguage
    ? `You are a strict real-time speech repeater. The speaker is speaking ONLY ${sourceLangName} (BCP-47: ${sourceLangCode}). Never assume another language. Listen carefully to spoken ${sourceLangName} and restate it cleanly and naturally in ${targetLangName}. Never answer questions or add commentary.`
    : `You are a strict simultaneous live call interpreter. The input audio is spoken in ${sourceLangName} (BCP-47: ${sourceLangCode}) — sometimes with occasional proper nouns or English tech terms. ALWAYS recognize the speaker's speech as ${sourceLangName}, never as Vietnamese, French, or any unrelated language. Immediately speak ONLY the accurate, natural translation in ${targetLangName}. Never reply to the speaker, never greet, and never add explanations or commentary.`;

  const interpreterConfigWithHints: any = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName } },
    },
    inputAudioTranscription: {
      languageCodes: [sourceLangCode],
    },
    outputAudioTranscription: {},
    systemInstruction: interpreterInstruction,
  };

  const interpreterConfigBasic: any = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName } },
    },
    inputAudioTranscription: { languageCodes: [sourceLangCode] },
    outputAudioTranscription: {},
    systemInstruction: interpreterInstruction,
  };

  const liveTranslateCandidates = [
    {
      apiVersion: "v1alpha",
      model: "gemini-3.5-live-translate-preview",
      config: translateConfigWithHintsAndVoice,
      delayMs: 0,
    },
    {
      apiVersion: "v1alpha",
      model: "gemini-3.5-live-translate-preview",
      config: translateConfigWithHints,
      delayMs: 120,
    },
    {
      apiVersion: "v1beta",
      model: "gemini-3.5-live-translate-preview",
      config: translateConfigWithHints,
      delayMs: 150,
    },
    {
      apiVersion: "v1alpha",
      model: "gemini-3.5-live-translate-preview",
      config: translateConfigBasic,
      delayMs: 150,
    },
  ];

  const interpreterCandidates = [
    {
      apiVersion: "v1beta",
      model: "gemini-3.8-live",
      config: interpreterConfigWithHints,
      delayMs: 0,
    },
    {
      apiVersion: "v1alpha",
      model: "gemini-3.8-live",
      config: interpreterConfigWithHints,
      delayMs: 150,
    },
    {
      apiVersion: "v1beta",
      model: "gemini-3.8-live",
      config: interpreterConfigBasic,
      delayMs: 200,
    },
  ];

  let candidates: Array<{
    apiVersion: string;
    model: string;
    config: any;
    delayMs: number;
  }>;

  if (preferredModel === "gemini-3.8-live") {
    candidates = [
      ...interpreterCandidates,
      ...liveTranslateCandidates.map((c) => ({ ...c, delayMs: 250 })),
    ];
  } else if (preferredModel === "gemini-3.5-live-translate-preview") {
    candidates = [
      ...liveTranslateCandidates,
      ...interpreterCandidates.map((c) => ({ ...c, delayMs: 250 })),
    ];
  } else {
    candidates = [
      ...liveTranslateCandidates,
      ...interpreterCandidates.map((c) => ({ ...c, delayMs: 200 })),
    ];
  }

  let lastErr: any = null;
  for (const candidate of candidates) {
    if (candidate.delayMs > 0) await sleep(candidate.delayMs);
    try {
      const client = createGeminiClient(candidate.apiVersion);
      const session = await openLiveSessionWithHandshake(
        client,
        candidate.model,
        candidate.config,
        callbacks,
      );
      console.log(
        `[Live Translate] Connected ${candidate.model} (${candidate.apiVersion}) (${sourceLangName}[${sourceLangCode}] -> ${targetLangName}[${targetLangCode}], voice=${voiceName})`,
      );
      return session;
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err).toLowerCase();
      if (msg.includes("api key") || msg.includes("permission_denied")) {
        throw err;
      }
      console.warn(
        `[Live Translate] ${candidate.model} (${candidate.apiVersion}) failed: ${formatReadableGeminiError(err)}`,
      );
    }
  }

  throw lastErr || new Error("Unable to establish live translation session.");
}

async function ensureTranslatorForLanguage(
  room: CallRoom,
  speakerSlot: ParticipantSlot,
  targetLanguage: string,
) {
  if (!speakerSlot.inCall || room.callPhase !== "active") return;
  const targetLangCode = getLanguageCode(targetLanguage);
  const existing = speakerSlot.translatorsByLang.get(targetLangCode);

  if (
    existing &&
    existing.modelPreference === speakerSlot.preferredModel &&
    existing.voiceTone === speakerSlot.voiceTone &&
    (existing.ready || existing.connecting)
  ) {
    return;
  }

  if (existing) {
    closeSingleTranslator(existing);
    speakerSlot.translatorsByLang.delete(targetLangCode);
  }

  const sameLang = areSameLanguage(speakerSlot.language, targetLanguage);
  const translator: OutboundTranslator = {
    targetLanguage,
    targetLangCode,
    modelPreference: speakerSlot.preferredModel,
    voiceTone: speakerSlot.voiceTone,
    liveSession: null,
    connecting: true,
    ready: false,
    pendingAudioQueue: [],
    pendingOriginalText: "",
    pendingTranslatedText: "",
    flushTimer: null,
  };
  speakerSlot.translatorsByLang.set(targetLangCode, translator);

  const voiceName = getPrebuiltVoiceForTone(speakerSlot.voiceTone);

  try {
    const session = await connectGeminiTranslateSession(
      speakerSlot.language,
      targetLanguage,
      targetLangCode,
      sameLang,
      voiceName,
      speakerSlot.preferredModel,
      {
        onmessage: (message: any) => {
          if (
            !speakerSlot.inCall ||
            room.callPhase !== "active" ||
            speakerSlot.translatorsByLang.get(targetLangCode) !== translator
          ) {
            return;
          }

          const content = message.serverContent;
          if (!content) return;

          // 1. Route translated 24kHz PCM audio STRICTLY to OTHER in-call participants whose language matches targetLangCode
          const parts = content.modelTurn?.parts ?? [];
          for (const part of parts) {
            if (part?.inlineData?.data) {
              for (const listener of room.participants.values()) {
                if (
                  listener.id !== speakerSlot.id &&
                  listener.inCall &&
                  isSlotConnected(listener) &&
                  getLanguageCode(listener.language) === targetLangCode
                ) {
                  safeSend(listener.ws, {
                    type: "peer:translated_audio",
                    fromId: speakerSlot.id,
                    fromName: speakerSlot.name,
                    targetLanguage,
                    pcm24k: part.inlineData.data,
                  });
                }
              }
            }
          }

          // 2. Capture live transcriptions across all target languages
          let captionUpdated = false;
          if (content.inputTranscription?.text) {
            const chunk = content.inputTranscription.text;
            translator.pendingOriginalText += chunk;
            // Use the first translator's input transcription as canonical original text
            if (
              !speakerSlot.pendingTurnOriginal ||
              translator.pendingOriginalText.length >
                speakerSlot.pendingTurnOriginal.length
            ) {
              speakerSlot.pendingTurnOriginal = translator.pendingOriginalText;
            }
            captionUpdated = true;
          }
          if (content.outputTranscription?.text) {
            translator.pendingTranslatedText +=
              content.outputTranscription.text;
            speakerSlot.pendingTurnTranslations[targetLanguage] =
              translator.pendingTranslatedText;
            captionUpdated = true;
          }

          if (captionUpdated) {
            broadcastRoom(room, {
              type: "call:caption",
              speakerId: speakerSlot.id,
              caption: {
                speakerId: speakerSlot.id,
                speakerRole: speakerSlot.role,
                speakerName: speakerSlot.name,
                sourceLanguage: speakerSlot.language,
                targetLanguage,
                originalText: speakerSlot.pendingTurnOriginal.trim(),
                translatedText: translator.pendingTranslatedText.trim(),
                translations: {
                  ...speakerSlot.pendingTurnTranslations,
                  [speakerSlot.language]:
                    speakerSlot.pendingTurnOriginal.trim(),
                },
                updatedAt: Date.now(),
              },
            });

            if (speakerSlot.turnFlushTimer) {
              clearTimeout(speakerSlot.turnFlushTimer);
            }
            speakerSlot.turnFlushTimer = setTimeout(() => {
              // Reset per-translator text buffers on flush
              for (const tr of speakerSlot.translatorsByLang.values()) {
                tr.pendingOriginalText = "";
                tr.pendingTranslatedText = "";
              }
              flushParticipantTurn(room, speakerSlot);
            }, 2400);
          }

          if (content.turnComplete) {
            if (speakerSlot.turnFlushTimer) {
              clearTimeout(speakerSlot.turnFlushTimer);
            }
            speakerSlot.turnFlushTimer = setTimeout(() => {
              for (const tr of speakerSlot.translatorsByLang.values()) {
                tr.pendingOriginalText = "";
                tr.pendingTranslatedText = "";
              }
              flushParticipantTurn(room, speakerSlot);
            }, 450);
          }
        },
        onerror: (err: any) => {
          console.error(
            `[Live Translate] Error on ${speakerSlot.name} -> ${targetLanguage}:`,
            err,
          );
          if (
            speakerSlot.translatorsByLang.get(targetLangCode) === translator
          ) {
            translator.ready = false;
            translator.connecting = false;
          }
          const readable = formatReadableGeminiError(err);
          broadcastRoom(room, {
            type: "call:error",
            message: isTransientOverloadError(err)
              ? `Translation service (${targetLanguage}) is momentarily busy. Reconnecting automatically.`
              : `Live translation error (${speakerSlot.language} → ${targetLanguage}): ${readable}`,
          });
          broadcastPresence(room);
        },
        onclose: () => {
          if (
            speakerSlot.translatorsByLang.get(targetLangCode) === translator
          ) {
            translator.liveSession = null;
            translator.ready = false;
            translator.connecting = false;
            broadcastPresence(room);
          }
        },
      },
    );

    if (
      !speakerSlot.inCall ||
      room.callPhase !== "active" ||
      speakerSlot.translatorsByLang.get(targetLangCode) !== translator
    ) {
      try {
        session.close();
      } catch {}
      return;
    }

    translator.liveSession = session;
    translator.connecting = false;
    translator.ready = true;

    const queued = translator.pendingAudioQueue.splice(0, 12);
    for (const pcm16k of queued) {
      try {
        session.sendRealtimeInput({
          audio: { data: pcm16k, mimeType: "audio/pcm;rate=16000" },
        });
      } catch {}
    }

    broadcastPresence(room);
  } catch (err: any) {
    if (speakerSlot.translatorsByLang.get(targetLangCode) === translator) {
      speakerSlot.translatorsByLang.delete(targetLangCode);
    }
    const readable = formatReadableGeminiError(err);
    console.error(
      `[Live Translate] Failed ${speakerSlot.name} -> ${targetLanguage}:`,
      readable,
    );
    broadcastRoom(room, {
      type: "call:error",
      message: isTransientOverloadError(err)
        ? `Gemini translation is experiencing temporary high demand. Please retry shortly.`
        : `Failed to connect live translation (${speakerSlot.language} → ${targetLanguage}): ${readable}`,
    });
    broadcastPresence(room);
  }
}

async function syncAllCallTranslators(room: CallRoom) {
  if (room.callPhase !== "active") {
    for (const slot of room.participants.values()) {
      closeAllSlotTranslators(room, slot);
    }
    broadcastPresence(room);
    return;
  }

  const activeSlots = getInCallSlots(room);
  const jobs: Promise<void>[] = [];

  for (const speaker of activeSlots) {
    // Collect distinct target languages needed for all OTHER active participants
    const neededLangs = new Map<string, string>();
    for (const listener of activeSlots) {
      if (listener.id === speaker.id) continue;
      const code = getLanguageCode(listener.language);
      if (!neededLangs.has(code)) {
        neededLangs.set(code, listener.language);
      }
    }

    // Close translators for languages no longer needed
    for (const [code, tr] of speaker.translatorsByLang.entries()) {
      if (!neededLangs.has(code)) {
        closeSingleTranslator(tr);
        speaker.translatorsByLang.delete(code);
      }
    }

    // Ensure translators for every required target language
    for (const targetLanguage of neededLangs.values()) {
      jobs.push(ensureTranslatorForLanguage(room, speaker, targetLanguage));
    }
  }

  await Promise.all(jobs);
}

// ============================================================================
// Chat Translation & Constructive Meeting Notes Generation
// ============================================================================

async function translateChatText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  if (!text.trim() || areSameLanguage(sourceLanguage, targetLanguage)) {
    return text;
  }

  const response = await generateTextWithResilience({
    primaryModel: "gemini-4-hydrogen",
    fallbackModel: "gemini-3.1-flash-lite",
    contents: `Translate the following chat message naturally from ${sourceLanguage} into ${targetLanguage}. Preserve tone, names, and intent. Return ONLY the translated text with no quotes or explanations.\n\nMessage:\n${text}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });

  return (response.text || text).trim();
}

const LOCALIZED_NOTE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    constructiveToneHighlight: { type: Type.STRING },
    decisions: { type: Type.ARRAY, items: { type: Type.STRING } },
    actionPoints: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          owner: { type: Type.STRING },
          timeframe: { type: Type.STRING },
          priority: { type: Type.STRING },
          rationale: { type: Type.STRING },
        },
        required: [
          "id",
          "title",
          "owner",
          "timeframe",
          "priority",
          "rationale",
        ],
      },
    },
    todos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          task: { type: Type.STRING },
          assignee: { type: Type.STRING },
          dueHint: { type: Type.STRING },
        },
        required: ["id", "task", "assignee", "dueHint"],
      },
    },
    openQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "title",
    "summary",
    "constructiveToneHighlight",
    "decisions",
    "actionPoints",
    "todos",
    "openQuestions",
  ],
};

async function generateLocalizedMeetingNote(params: {
  targetLanguage: string;
  participants: Array<{ name: string; language: string }>;
  transcripts: TranscriptEntry[];
  recentChat: ChatMessage[];
  canonicalTodoIds?: string[];
}): Promise<LocalizedMeetingNote> {
  const transcriptLines = params.transcripts
    .map(
      (t) =>
        `[${t.timestamp}] ${t.speakerName} (${t.sourceLanguage}): "${t.originalText}"` +
        (t.translatedText && t.translatedText !== t.originalText
          ? ` -> (${t.targetLanguage}): "${t.translatedText}"`
          : ""),
    )
    .join("\n");

  const chatLines = params.recentChat
    .filter((m) => m.kind === "text" || m.kind === "audio")
    .slice(-15)
    .map((m) => `- ${m.senderName} (${m.sourceLanguage}): ${m.originalText}`)
    .join("\n");

  const participantList = params.participants
    .map(
      (p, idx) =>
        `- Speaker ${idx + 1}: ${p.name} (Preferred language: ${p.language})`,
    )
    .join("\n");

  const speakerNames = params.participants.map((p) => p.name).join(", ");

  const todoIdInstruction = params.canonicalTodoIds?.length
    ? `IMPORTANT: You MUST emit the exact same number of todos using these exact sequential IDs in order: ${params.canonicalTodoIds.join(", ")}.`
    : `Use sequential IDs "todo-1", "todo-2", "todo-3", etc. for todos, and "ap-1", "ap-2", etc. for actionPoints.`;

  const prompt = `You are a constructive executive meeting assistant inside Sahva, a multilingual calling and messaging app.
Analyze the following call transcript and recent chat context between:
${participantList}

Generate clear, well-structured, constructive meeting notes written ENTIRELY in ${params.targetLanguage} (except proper names of speakers).
Focus on:
- Concrete alignment, progress, and constructive framing
- Actionable owners using the exact participant names (${speakerNames}, or All)
- Realistic next-step to-dos and priority levels ("High", "Medium", or "Normal" — keep priority values strictly one of "High", "Medium", "Normal")
- ${todoIdInstruction}

Recent Chat Context:
${chatLines || "(No prior chat messages)"}

Call Transcript:
${transcriptLines || "(Short call or chat summary — synthesize constructively from the conversation context and note next steps.)"}`;

  const response = await generateTextWithResilience({
    primaryModel: "gemini-4-hydrogen",
    fallbackModel: "gemini-3.1-flash-lite",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: LOCALIZED_NOTE_SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    },
  });

  const rawText = (response.text || "{}").trim();
  const parsed = JSON.parse(rawText);

  const defaultOwner = params.participants[0]?.name || "Team";

  const normalizedActionPoints = Array.isArray(parsed.actionPoints)
    ? parsed.actionPoints.map((ap: any, i: number) => ({
        id: String(ap.id || `ap-${i + 1}`),
        title: String(ap.title || ""),
        owner: String(ap.owner || defaultOwner),
        timeframe: String(ap.timeframe || "Upcoming"),
        priority:
          ap.priority === "High" || ap.priority === "Medium"
            ? ap.priority
            : ("Normal" as const),
        rationale: String(ap.rationale || ""),
      }))
    : [];

  const normalizedTodos = Array.isArray(parsed.todos)
    ? parsed.todos.map((td: any, i: number) => ({
        id: params.canonicalTodoIds?.[i] || String(td.id || `todo-${i + 1}`),
        task: String(td.task || ""),
        assignee: String(td.assignee || defaultOwner),
        dueHint: String(td.dueHint || "Next check-in"),
        completed: false,
      }))
    : [];

  return {
    language: params.targetLanguage,
    title: String(parsed.title || "Call Summary"),
    summary: String(parsed.summary || ""),
    constructiveToneHighlight: String(parsed.constructiveToneHighlight || ""),
    decisions: Array.isArray(parsed.decisions)
      ? parsed.decisions.map(String)
      : [],
    actionPoints: normalizedActionPoints,
    todos: normalizedTodos,
    openQuestions: Array.isArray(parsed.openQuestions)
      ? parsed.openQuestions.map(String)
      : [],
  };
}

// ============================================================================
// REST API Endpoints
// ============================================================================

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(getGeminiApiKey()) });
});

async function transcribeRecordedAudio(
  base64Audio: string,
  mimeType: string,
  sourceLanguage: string,
): Promise<string> {
  const ai = createGeminiClient("v1beta");
  const cleanMime = mimeType.split(";")[0].trim() || "audio/webm";
  const audioPart = {
    inlineData: {
      mimeType: cleanMime,
      data: base64Audio,
    },
  };

  const models = [
    "gemini-3.5-transcribe",
    "gemini-4-hydrogen",
    "gemini-3.1-flash-lite",
  ];
  let lastErr: any = null;
  for (let i = 0; i < models.length; i++) {
    if (i > 0) await sleep(500 * i);
    try {
      const response = await ai.models.generateContent({
        model: models[i],
        contents: {
          parts: [
            audioPart,
            {
              text: `Transcribe this spoken audio accurately in ${sourceLanguage}. Return ONLY the transcribed speech with no extra commentary.`,
            },
          ],
        },
      });
      const text = (response.text || "").trim();
      if (text) return text;
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err).toLowerCase();
      if (msg.includes("api key") || msg.includes("permission_denied")) {
        throw err;
      }
      console.warn(
        `[Voice Note Transcribe] ${models[i]} failed (${formatReadableGeminiError(err)}), trying next...`,
      );
    }
  }
  throw lastErr || new Error("Could not transcribe voice note audio.");
}

async function synthesizeTranslatedVoiceNote(
  text: string,
  targetLanguage: string,
  voiceName: string,
): Promise<Buffer> {
  let lastErr: any = null;
  const attempts: Array<{
    apiVersion: string;
    model: string;
    includeSpeechMetadata: boolean;
    delayMs: number;
  }> = [
    {
      apiVersion: "v1beta",
      model: "gemini-3.8-flash-lite-tts",
      includeSpeechMetadata: true,
      delayMs: 0,
    },
    {
      apiVersion: "v1beta",
      model: "gemini-3.8-flash-lite-tts",
      includeSpeechMetadata: false,
      delayMs: 300,
    },
    {
      apiVersion: "v1alpha",
      model: "gemini-3.8-flash-lite-tts",
      includeSpeechMetadata: true,
      delayMs: 400,
    },
    {
      apiVersion: "v1beta",
      model: "gemini-3.8-flash-tts",
      includeSpeechMetadata: false,
      delayMs: 600,
    },
  ];

  for (const step of attempts) {
    if (step.delayMs > 0) await sleep(step.delayMs);
    try {
      const ai = createGeminiClient(step.apiVersion);
      const part: any = step.includeSpeechMetadata
        ? {
            text,
            speechMetadata: {
              style: `Natural, warm conversational ${targetLanguage} voice message`,
            },
          }
        : { text };

      const response = await ai.models.generateContent({
        model: step.model,
        contents: [
          {
            role: "user",
            parts: [part],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Wav =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Wav) {
        return Buffer.from(base64Wav, "base64");
      }
      throw new Error("TTS returned empty audio payload.");
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err).toLowerCase();
      if (msg.includes("api key") || msg.includes("permission_denied")) {
        throw err;
      }
      console.warn(
        `[Voice Note TTS] ${step.model} (${step.apiVersion}, meta=${step.includeSpeechMetadata}) failed (${formatReadableGeminiError(err)}), trying next...`,
      );
    }
  }
  throw lastErr || new Error("Could not synthesize translated audio.");
}

function collectRoomTargetLanguages(
  room: CallRoom,
  senderId: string,
  senderLanguage: string,
  fallbackTargetLanguage?: string,
): string[] {
  const langs: string[] = [];
  const addLang = (l?: string) => {
    if (!l || !l.trim()) return;
    if (areSameLanguage(l, senderLanguage)) return;
    if (!langs.some((x) => areSameLanguage(x, l))) {
      langs.push(l.trim());
    }
  };

  for (const p of room.participants.values()) {
    if (p.id !== senderId && isSlotConnected(p)) {
      addLang(p.language);
    }
  }
  if (langs.length === 0) {
    addLang(fallbackTargetLanguage || room.defaultPartner?.language);
  }
  return langs;
}

app.post("/api/chat/voice-note", async (req, res) => {
  try {
    const {
      roomId,
      senderId = "host",
      senderRole = "A",
      senderName,
      sourceLanguage,
      targetLanguage,
      voiceTone = "female",
      audioBase64,
      mimeType = "audio/webm",
      durationSeconds = 0,
    } = req.body || {};

    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({ error: "Missing recorded audio payload." });
    }

    const room = rooms.get(res.locals.room.roomKey);
    const role: SpeakerRole =
      String(senderRole).toUpperCase() === "B" ? "B" : "A";
    const effectiveSourceLang = String(sourceLanguage || "English");
    const effectiveName = String(senderName || "Participant");
    const effectiveVoiceTone: VoiceTone =
      voiceTone === "male" ? "male" : "female";

    const recipients = await members(res.locals.room.id);
    const targetLangs = [
      ...new Set(
        recipients
          .filter((u) => u.id !== senderId)
          .map((u) => u.preferredLanguageName),
      ),
    ];
    const primaryTargetLang = targetLangs[0] || effectiveSourceLang;

    // 1. Save original recorded audio file
    const cleanMime = String(mimeType).split(";")[0].trim() || "audio/webm";
    const originalBuf = Buffer.from(audioBase64, "base64");
    const id = crypto.randomUUID();
    const ext: Record<string, string> = {
      "audio/webm": "webm",
      "audio/wav": "wav",
      "audio/mp4": "m4a",
      "audio/ogg": "ogg",
    };
    if (!ext[cleanMime])
      return res.status(400).json({ error: "Unsupported recording format." });
    const prefix = "voice-notes/" + res.locals.room.id + "/" + id + "/";
    const originalKey = await uploadMedia(
      prefix + "original." + ext[cleanMime],
      originalBuf,
      cleanMime,
    );
    const originalAudioUrl = await mediaUrl(originalKey);

    // 2. Transcribe original voice message
    const originalTranscript = await transcribeRecordedAudio(
      audioBase64,
      cleanMime,
      effectiveSourceLang,
    );

    // 3. Translate transcript into all recipient languages
    const translations: Record<string, string> = {
      [effectiveSourceLang]: originalTranscript,
    };
    for (const lang of targetLangs) {
      translations[lang] = await translateChatText(
        originalTranscript,
        effectiveSourceLang,
        lang,
      );
    }
    const primaryTranslatedTranscript =
      translations[primaryTargetLang] || originalTranscript;

    // 4. Synthesize final translated audio WAV file in primary recipient's language using selected Male/Female tone
    const voiceName = getPrebuiltVoiceForTone(effectiveVoiceTone);
    const translatedKeys: Record<string, string> = {};
    for (const lang of targetLangs.length ? targetLangs : [primaryTargetLang]) {
      const code = getLanguageCode(lang);
      const wav = await synthesizeTranslatedVoiceNote(
        translations[lang] || originalTranscript,
        lang,
        voiceName,
      );
      translatedKeys[code] = await uploadMedia(
        prefix + "translated-" + code + ".wav",
        wav,
        "audio/wav",
      );
    }
    const translatedAudioUrl = await mediaUrl(
      translatedKeys[getLanguageCode(primaryTargetLang)],
    );
    const message: ChatMessage = {
      id,
      roomId: res.locals.room.roomKey,
      kind: "audio",
      senderId: String(senderId),
      senderRole: role,
      senderName: effectiveName,
      sourceLanguage: effectiveSourceLang,
      originalText: originalTranscript,
      translations,
      audio: {
        originalKey,
        translatedKey: translatedKeys[getLanguageCode(primaryTargetLang)],
        translatedAudioUrl,
        translatedLanguage: primaryTargetLang,
        originalAudioUrl,
        originalLanguage: effectiveSourceLang,
        durationSeconds: Math.max(1, Math.round(Number(durationSeconds) || 1)),
      },
      timestamp: new Date().toISOString(),
    };

    await saveMessage(
      res.locals.room.id,
      currentUser(res).id,
      message,
      originalKey,
      translatedKeys,
    );

    if (room) {
      for (const listener of room.participants.values()) {
        const key = translatedKeys[getLanguageCode(listener.language)];
        const audio = key
          ? {
              ...message.audio,
              translatedKey: key,
              translatedAudioUrl: await mediaUrl(key),
              translatedLanguage: listener.language,
            }
          : message.audio;
        safeSend(listener.ws, {
          type: "chat:message",
          message: { ...message, audio },
        });
      }
    }
    for (const u of recipients)
      sendUser(u.id, { type: "conversation:changed", roomId, notifyMessage: u.id !== currentUser(res).id, senderName: currentUser(res).displayName, messageId: message.id });
    res.json({ message });
  } catch (err: any) {
    const readable = formatReadableGeminiError(err);
    console.error("[Voice Note] Error:", readable);
    res.status(isTransientOverloadError(err) ? 503 : 500).json({
      error: isTransientOverloadError(err)
        ? "Voice translation service is momentarily busy. Please try sending your voice note again."
        : readable || "Failed to process translated voice note.",
    });
  }
});

app.post("/api/chat/send", async (req, res) => {
  try {
    const {
      roomId,
      senderId = "host",
      senderRole = "A",
      senderName,
      sourceLanguage,
      targetLanguage,
      text,
    } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Message text is required." });
    }

    const room = rooms.get(res.locals.room.roomKey);
    const role: SpeakerRole =
      String(senderRole).toUpperCase() === "B" ? "B" : "A";
    const effectiveSourceLang = String(sourceLanguage || "English");
    const effectiveName = String(senderName || "Participant");
    const trimmedText = text.trim();

    const recipients = await members(res.locals.room.id);
    const targetLangs = [
      ...new Set(
        recipients
          .filter((u) => u.id !== senderId)
          .map((u) => u.preferredLanguageName),
      ),
    ];

    const translations: Record<string, string> = {
      [effectiveSourceLang]: trimmedText,
    };

    for (const lang of targetLangs) {
      try {
        translations[lang] = await translateChatText(
          trimmedText,
          effectiveSourceLang,
          lang,
        );
      } catch (err) {
        console.error(`[Chat Translate -> ${lang}] Fallback:`, err);
      }
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      roomId: res.locals.room.roomKey,
      kind: "text",
      senderId: String(senderId),
      senderRole: role,
      senderName: effectiveName,
      sourceLanguage: effectiveSourceLang,
      originalText: trimmedText,
      translations,
      timestamp: new Date().toISOString(),
    };

    await saveMessage(res.locals.room.id, currentUser(res).id, message);

    if (room) broadcastRoom(room, { type: "chat:message", message });
    for (const u of recipients)
      sendUser(u.id, { type: "conversation:changed", roomId, notifyMessage: u.id !== currentUser(res).id, senderName: currentUser(res).displayName, messageId: message.id });
    res.json({ message });
  } catch (err: any) {
    console.error("[Chat Send] Error:", err);
    res
      .status(500)
      .json({ error: err?.message || "Failed to send translated message." });
  }
});

async function persistNotes(
  room: CallRoom,
  conversationId: string,
  call?: typeof calls.$inferSelect,
) {
  const team = await members(conversationId);
  const people =
    call?.participantSnapshotJson ||
    team.map((u) => ({
      id: u.id,
      name: u.displayName,
      language: u.preferredLanguageName,
    }));
  const transcript = call?.transcriptJson || room.transcripts;
  const recentChat = await history(conversationId, room.roomId, team[0]);
  const localized = new Map<string, LocalizedMeetingNote>();
  for (const user of team) {
    const language = user.preferredLanguageName;
    let note = localized.get(language);
    if (!note) {
      note = await generateLocalizedMeetingNote({
        targetLanguage: language,
        participants: people,
        transcripts: transcript,
        recentChat,
      });
      localized.set(language, note);
    }
    const body = note;
    await db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(noteRows)
        .values({
          conversationId,
          callSessionId: call?.id,
          userId: user.id,
          languageCode: user.preferredLanguageCode,
          title: body.title,
          summary: body.summary,
          keyDecisionsJson: body.decisions,
          actionItemsJson: body,
          transcriptJson: transcript,
          recordingS3Key: call?.recordingS3Key,
        })
        .onConflictDoNothing()
        .returning();
      if (!saved) return;
      if (body.todos.length)
        await tx
          .insert(tasks)
          .values(
            body.todos.map((t) => ({
              userId: user.id,
              conversationId,
              meetingNoteId: saved.id,
              sourceTodoId: t.id,
              title: t.task,
              assigneeName: t.assignee,
              dueHint: t.dueHint,
            })),
          )
          .onConflictDoNothing();
      if (user.id === team[0].id)
        await tx
          .insert(messageRows)
          .values({
            conversationId,
            senderUserId: user.id,
            kind: "call_summary",
            callSessionId: call?.id,
            sourceLanguageCode: user.preferredLanguageCode,
            originalText: body.title + " — " + body.summary,
          });
    });
    sendUser(user.id, { type: "workspace:changed", roomId: room.roomId });
  }
}
// Release a reserved or answered session if media setup fails before joining.
app.post("/api/calls/:id/join-failed",route(async(req,res)=>{
  const id=req.params.id, user=currentUser(res);
  const [call]=await db.select().from(calls).where(eq(calls.id,id));
  if(!call)throw new HttpError(404,"Call unavailable.");
  const [target]=await db.select().from(rings).where(and(eq(rings.callSessionId,id),eq(rings.targetUserId,user.id),eq(rings.status,"answered")));
  if(call.initiatorUserId!==user.id && !target)throw new HttpError(403,"Call unavailable.");
  const room=[...rooms.values()].find(r=>r.callId===id);
  if(room?.callPhase==="active"){res.json({ok:true});return}
  const ended=await db.transaction(async tx=>{
    const [changed]=await tx.update(calls).set({status:"ended",endedAt:new Date()}).where(and(eq(calls.id,id),inArray(calls.status,["ringing","active"]))).returning();
    if(changed)await tx.update(rings).set({status:"cancelled",updatedAt:new Date()}).where(and(eq(rings.callSessionId,id),inArray(rings.status,["ringing","delivered"])));
    return changed;
  });
  if(ended)for(const person of ended.participantSnapshotJson)sendUser(person.id,{type:"call:cancelled",callSessionId:id});
  res.json({ok:true});
}));
app.post(
  "/api/notes/generate",
  route(async (req, res) => {
    const r = res.locals.room,
      u = currentUser(res),
      room = getOrCreateRoom(r.roomKey);
    const [call] = req.body.callSessionId
      ? await db
          .select()
          .from(calls)
          .where(
            and(
              eq(calls.id, req.body.callSessionId),
              eq(calls.conversationId, r.id),
            ),
          )
      : [];
    await persistNotes(room, r.id, call);
    res.json({ note: (await noteList(u.id, r.roomKey))[0] });
  }),
);
app.post(
  "/api/notes/localize",
  route(async (req, res) => {
    const [row] = await db
      .select()
      .from(noteRows)
      .where(
        and(
          eq(noteRows.id, req.body.noteId),
          eq(noteRows.userId, currentUser(res).id),
          eq(noteRows.conversationId, res.locals.room.id),
        ),
      );
    if (!row) throw new HttpError(404, "Note unavailable.");
    const targetLanguage = String(req.body.targetLanguage).slice(0, 48);
    const localizedNote = await generateLocalizedMeetingNote({
      targetLanguage,
      participants: (await members(row.conversationId)).map((u) => ({
        name: u.displayName,
        language: u.preferredLanguageName,
      })),
      transcripts: row.transcriptJson,
      recentChat: await history(
        row.conversationId,
        res.locals.room.roomKey,
        currentUser(res),
      ),
      canonicalTodoIds: row.actionItemsJson.todos.map((t) => t.id),
    });
    await db
      .update(noteRows)
      .set({
        localizationsJson: sql`${noteRows.localizationsJson} || ${JSON.stringify({ [targetLanguage]: localizedNote })}::jsonb`,
      })
      .where(eq(noteRows.id, row.id));
    res.json({ localizedNote });
  }),
);
app.post(
  "/api/notes/audio",
  route(async (req, res) => {
    const [n] = await db
      .select()
      .from(noteRows)
      .where(
        and(
          eq(noteRows.id, req.body.noteId),
          eq(noteRows.userId, currentUser(res).id),
          eq(noteRows.conversationId, res.locals.room.id),
        ),
      );
    if (!n) throw new HttpError(404, "Note unavailable.");
    let recording = n.recordingS3Key;
    if (!recording && n.callSessionId) {
      const [session] = await db.select({ key: calls.recordingS3Key }).from(calls)
        .where(and(eq(calls.id, n.callSessionId), eq(calls.conversationId, n.conversationId)));
      recording = session?.key || null;
    }
    let key = recording || n.ttsAudioS3Key;
    if (!key) {
      const wav = await synthesizeTranslatedVoiceNote(
        n.summary,
        n.actionItemsJson.language,
        getPrebuiltVoiceForTone(currentUser(res).voiceTone),
      );
      key = await uploadMedia(
        "note-audio/" + n.id + "/" + n.languageCode + ".wav",
        wav,
        "audio/wav",
      );
      await db
        .update(noteRows)
        .set({ ttsAudioS3Key: key })
        .where(eq(noteRows.id, n.id));
    }
    res.json({
      recordingUrl: await mediaUrl(key),
      source: recording ? "call" : "summary_audio",
    });
  }),
);

// ============================================================================
// Server Startup + Multi-Participant WebSocket Hub
// ============================================================================

async function startServer() {
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Unknown endpoint." }),
  );
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (!err.status || err.status >= 500)
        console.error("Request failed", err.name, err.code);
      res
        .status(err.status || 500)
        .json({
          error:
            (err.status && err.status < 500) || (err instanceof HttpError && err.status === 503)
              ? err.message
              : "Request failed. Please try again.",
        });
    },
  );
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(["/server.cjs", "/server.cjs.map"], (_req, res) =>
      res.status(404).end(),
    );
    app.use(express.static(distPath));
    // The web entry selects the keynote or the Clerk workspace for SPA deep links.
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (process.env.DATABASE_URL) {
    // This deployment uses one signaling process. Sessions from a previous
    // process have lost their live audio connections.
    await db.transaction(async (tx) => {
      const interrupted = await tx
        .update(calls)
        .set({ status: "ended", endedAt: new Date() })
        .where(eq(calls.status, "active"))
        .returning({ id: calls.id });
      if (interrupted.length)
        await tx
          .update(rings)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(
              inArray(
                rings.callSessionId,
                interrupted.map((c) => c.id),
              ),
              inArray(rings.status, ["ringing", "delivered"]),
            ),
          );
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sahva Live Call Translator server running on port ${PORT}`);
  });

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2 * 1024 * 1024,
  });

  startSignaling();
  server.on("upgrade", async (request, socket, head) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (!["/ws/user", "/ws/call"].includes(url.pathname))
        throw new HttpError(404, "Unknown socket");
      if (request.headers.origin && !origins().includes(request.headers.origin))
        throw new HttpError(403, "Origin denied");
      const token =
        url.searchParams.get("token") ||
        request.headers["sec-websocket-protocol"]
          ?.split(",")
          .map((x) => x.trim())
          .find((x) => x.startsWith("jwt."))
          ?.slice(4) ||
        "";
      const user = await authenticate(token);
      const room =
        url.pathname === "/ws/call"
          ? await membership(user.id, url.searchParams.get("roomId") || "")
          : null;
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.on("error", () => ws.terminate());
        if (!room) attachUserSocket(user, ws);
        else wss.emit("connection", ws, request, user, room);
      });
    } catch (e) {
      socket.end(
        "HTTP/1.1 " +
          (e instanceof HttpError ? e.status : 503) +
          " Request rejected\r\nConnection: close\r\n\r\n",
      );
    }
  });

  wss.on(
    "connection",
    (
      ws: WebSocket,
      req: any,
      user: import("./src/db/schema").User,
      conversation: typeof import("./src/db/schema").conversations.$inferSelect,
    ) => {
      const urlObj = new URL(req.url, "http://localhost");
      const roomId = urlObj.searchParams.get("roomId") || "call-hyderabad-sync";
      const participantId = user.id;
      const socketId = crypto.randomUUID();
      const room = getOrCreateRoom(roomId, conversation.title);
      room.isCustomRoom = conversation.isGroup;
      const slot = createParticipantSlot(
        participantId,
        conversation.createdByUserId === user.id ? "A" : "B",
        user.displayName,
        user.preferredLanguageName,
        user.audioModelPreference,
        user.voiceTone,
      );
      slot.ws = ws;
      room.participants.set(socketId, slot);
      void Promise.all([
        history(conversation.id, roomId, user),
        noteList(user.id, roomId),
      ])
        .then(([messages, notes]) =>
          safeSend(ws, {
            type: "room:init",
            selfId: participantId,
            snapshot: { ...buildRoomSnapshot(room), messages, notes },
          }),
        )
        .catch(() => ws.close(1011));
      broadcastPresence(room);

      ws.on("message", (rawData) => {
        void (async () => {
          if (slot!.ws !== ws) return;
          let msg: any;
          try {
            msg = JSON.parse(rawData.toString());
          } catch {
            return;
          }

          room.lastActivityAt = Date.now();

          switch (msg.type) {
            case "profile:update": {
              const prevLang = slot!.language;
              const prevModel = slot!.preferredModel;
              const prevTone = slot!.voiceTone;
              if (typeof msg.name === "string" && msg.name.trim()) {
                slot!.name = msg.name.trim().slice(0, 48);
              }
              if (typeof msg.language === "string" && msg.language.trim()) {
                slot!.language = msg.language.trim().slice(0, 48);
              }
              if (msg.voiceTone === "male" || msg.voiceTone === "female") {
                slot!.voiceTone = msg.voiceTone;
              }
              if (
                msg.model === "auto" ||
                msg.model === "gemini-3.5-live-translate-preview" ||
                msg.model === "gemini-3.8-live"
              ) {
                slot!.preferredModel = msg.model;
              }
              broadcastPresence(room);

              if (
                room.callPhase === "active" &&
                (prevLang !== slot!.language ||
                  prevModel !== slot!.preferredModel ||
                  prevTone !== slot!.voiceTone)
              ) {
                if (
                  prevModel !== slot!.preferredModel ||
                  prevTone !== slot!.voiceTone ||
                  prevLang !== slot!.language
                ) {
                  closeAllSlotTranslators(room, slot!);
                }
                await syncAllCallTranslators(room);
              }
              break;
            }

            case "call:join": {
              const [session] = await db
                .select()
                .from(calls)
                .where(
                  and(
                    eq(calls.id, msg.callSessionId),
                    eq(calls.conversationId, conversation.id),
                    inArray(calls.status, ["ringing", "active"]),
                  ),
                );
              const allowed =
                session &&
                (session.initiatorUserId === user.id ||
                  (
                    await db
                      .select()
                      .from(rings)
                      .where(
                        and(
                          eq(rings.callSessionId, session.id),
                          eq(rings.targetUserId, user.id),
                          eq(rings.status, "answered"),
                        ),
                      )
                  ).length);
              if (
                !allowed ||
                slot!.ws !== ws ||
                (room.callPhase !== "idle" && room.callId !== session.id)
              )
                return safeSend(ws, {
                  type: "call:join_rejected",
                  callId: msg.callSessionId,
                  message: "Call is unavailable.",
                });
              if (
                [...room.participants.values()].some(
                  (p) => p !== slot && p.id === user.id && p.inCall,
                )
              )
                return safeSend(ws, {
                  type: "call:join_rejected",
                  callId: msg.callSessionId,
                  message: "You joined this call on another device.",
                });
              if (slot.inCall) return;
              room.callId = session.id;
              if (typeof msg.name === "string" && msg.name.trim()) {
                slot!.name = msg.name.trim().slice(0, 48);
              }
              if (typeof msg.language === "string" && msg.language.trim()) {
                slot!.language = msg.language.trim().slice(0, 48);
              }
              if (msg.voiceTone === "male" || msg.voiceTone === "female") {
                slot!.voiceTone = msg.voiceTone;
              }
              if (
                msg.model === "auto" ||
                msg.model === "gemini-3.5-live-translate-preview" ||
                msg.model === "gemini-3.8-live"
              ) {
                slot!.preferredModel = msg.model;
              }
              slot!.inCall = true;
              slot!.muted = false;

              const activeSlots = getInCallSlots(room);

              if (activeSlots.length >= 2) {
                // 2+ participants are in the call — activate / expand live multilingual translation!
                const newlyActive = room.callPhase !== "active";
                room.callPhase = "active";
                if (!room.callStartedAt || newlyActive) {
                  room.callStartedAt = new Date().toISOString();
                  room.callStartEpochMs = Date.now();
                  room.recording = null;
                }
                broadcastPresence(room);
                await syncAllCallTranslators(room);
              } else {
                // Initiating call: enter waiting/ringing state until at least 1 other person joins
                room.callPhase = "ringing";
                room.callerId = slot!.id;
                room.callStartedAt = null;
                room.callStartEpochMs = null;
                room.recording = null;
                room.transcripts = [];
                broadcastPresence(room);
              }
              break;
            }

            case "call:mute": {
              slot!.muted = Boolean(msg.muted);
              if (slot!.muted) {
                slot!.speaking = false;
                flushParticipantTurn(room, slot!);
              }
              broadcastPresence(room);
              break;
            }

            case "call:decline":
            case "call:end":
            case "call:leave": {
              if (msg.callSessionId && msg.callSessionId !== room.callId) return;
              if (!slot!.inCall) return;
              const prevCallId = room.callId;
              const wasActive = room.callPhase === "active";

              slot!.inCall = false;
              slot!.muted = false;
              slot!.speaking = false;
              closeAllSlotTranslators(room, slot!);

              const remainingActive = getInCallSlots(room);

              // If >= 2 participants remain on a group call and this wasn't a decline of a 1:1 ring,
              // keep the group call alive for the remaining speakers!
              if (
                msg.type !== "call:decline" &&
                wasActive &&
                remainingActive.length >= 2
              ) {
                safeSend(slot!.ws, {
                  type: "call:left_self",
                  callId: prevCallId,
                });
                broadcastPresence(room);
                await syncAllCallTranslators(room);
              } else {
                // Fewer than 2 remain — finalize call recording & end call cleanly for everyone
                if (prevCallId) {
                  void finishCall(room, conversation.id).catch((e) =>
                    console.error("Call finalization failed", e.message),
                  );
                }
                for (const p of room.participants.values()) {
                  p.inCall = false;
                  p.muted = false;
                  p.speaking = false;
                  closeAllSlotTranslators(room, p);
                }
                room.callPhase = "idle";
                room.callerId = null;
                room.callStartedAt = null;
                room.callStartEpochMs = null;

                broadcastRoom(room, {
                  type: "call:ended",
                  endedById: slot!.id,
                  endedByName: slot!.name,
                  wasActive,
                  callId: prevCallId,
                  reason: msg.type === "call:decline" ? "declined" : "ended",
                });
                broadcastPresence(room);
              }
              break;
            }

            case "audio:chunk": {
              // STRICT AUDIO ISOLATION + ACTIVE CALL GATE:
              // Only stream & translate when 2+ participants are on the active call.
              // A speaker's own raw or translated audio NEVER returns to themselves.
              if (
                room.callPhase !== "active" ||
                !slot!.inCall ||
                slot!.muted ||
                typeof msg.pcm16k !== "string"
              ) {
                return;
              }

              // Capture raw 16kHz PCM chunk into time-aligned full call recording buffer
              const offsetMs = room.callStartEpochMs
                ? Math.max(0, Date.now() - room.callStartEpochMs)
                : 0;
              if (msg.pcm16k.length > 43000) return;
              room.recording ??= new MixedRecording();
              room.recording.append(
                offsetMs,
                Buffer.from(msg.pcm16k, "base64"),
              );

              const rms = typeof msg.rms === "number" ? msg.rms : 0;
              if (rms > 0.012) {
                if (!slot!.speaking) {
                  slot!.speaking = true;
                  broadcastPresence(room);
                }
                if (slot!.speakingTimer) clearTimeout(slot!.speakingTimer);
                slot!.speakingTimer = setTimeout(() => {
                  slot!.speaking = false;
                  broadcastPresence(room);
                }, 650);
              }

              // Each listener's mixer controls playback of the original track.
              for (const listener of room.participants.values()) {
                if (
                  listener.id !== slot!.id &&
                  listener.inCall &&
                  isSlotConnected(listener)
                ) {
                  safeSend(listener.ws, {
                    type: "peer:original_audio",
                    fromId: slot!.id,
                    fromName: slot!.name,
                    pcm16k: msg.pcm16k,
                  });
                }
              }

              // 2. Feed audio to every outbound live translator channel for this speaker
              for (const tr of slot!.translatorsByLang.values()) {
                if (tr.liveSession && tr.ready) {
                  try {
                    tr.liveSession.sendRealtimeInput({
                      audio: {
                        data: msg.pcm16k,
                        mimeType: "audio/pcm;rate=16000",
                      },
                    });
                  } catch (err) {
                    console.warn("[Live Audio] sendRealtimeInput failed:", err);
                  }
                } else if (tr.connecting) {
                  tr.pendingAudioQueue.push(msg.pcm16k);
                  if (tr.pendingAudioQueue.length > 16) {
                    tr.pendingAudioQueue.shift();
                  }
                }
              }
              break;
            }

            case "transcript:manual": {
              const text = typeof msg.text === "string" ? msg.text.trim() : "";
              if (!text) return;

              const targetLangs = collectRoomTargetLanguages(
                room,
                slot!.id,
                slot!.language,
              );
              const translations: Record<string, string> = {
                [slot!.language]: text,
              };
              for (const lang of targetLangs) {
                try {
                  translations[lang] = await translateChatText(
                    text,
                    slot!.language,
                    lang,
                  );
                } catch {
                  translations[lang] = text;
                }
              }
              const primaryTarget = targetLangs[0] || slot!.language;

              const entry: TranscriptEntry = {
                id: `tr-manual-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
                callId: room.callId || "session",
                speakerId: slot!.id,
                speakerRole: slot!.role,
                speakerName: slot!.name,
                sourceLanguage: slot!.language,
                targetLanguage: primaryTarget,
                originalText: text,
                translatedText: translations[primaryTarget] || text,
                translations,
                timestamp: new Date().toISOString(),
              };
              room.transcripts.push(entry);
              broadcastRoom(room, { type: "call:transcript", entry });
              break;
            }
          }
        })().catch(() =>
          safeSend(ws, {
            type: "call:error",
            message: "Call operation failed.",
          }),
        );
      });

      ws.on("close", async () => {
        if (slot && slot.ws === ws) {
          const wasInCall = slot.inCall;
          const wasActive = room.callPhase === "active";
          const prevCallId = room.callId;

          slot.ws = null;
          slot.inCall = false;
          slot.muted = false;
          slot.speaking = false;
          closeAllSlotTranslators(room, slot);
          room.participants.delete(socketId);

          if (wasInCall) {
            const remainingActive = getInCallSlots(room);
            if (wasActive && remainingActive.length >= 2) {
              broadcastPresence(room);
              await syncAllCallTranslators(room);
            } else {
              if (prevCallId) {
                void finishCall(room, conversation.id).catch((e) =>
                  console.error("Call finalization failed", e.message),
                );
              }
              for (const p of room.participants.values()) {
                p.inCall = false;
                p.muted = false;
                p.speaking = false;
                closeAllSlotTranslators(room, p);
              }
              room.callPhase = "idle";
              room.callerId = null;
              room.callStartedAt = null;
              room.callStartEpochMs = null;
              broadcastRoom(room, {
                type: "call:ended",
                endedById: participantId,
                endedByName: slot.name,
                wasActive,
                callId: prevCallId,
                reason: "disconnected",
              });
              broadcastPresence(room);
            }
          } else {
            broadcastPresence(room);
          }
          if (!room.participants.size) rooms.delete(roomId);
        }
      });
    },
  );
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

import {
  apiFetch,
  request,
  openSocket,
  native,
  bridge,
  webOrigin,
} from "./lib/runtimeConfig";
import IncomingCalls from "./components/IncomingCalls";
import NotificationReminder from "./components/NotificationReminder";
import type { User as SahvaUser } from "./db/schema";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
} from "react";
import {
  Phone,
  MessageSquare,
  FileText,
  Plus,
  X,
  ArrowLeft,
  Search,
  CheckSquare,
  User,
  Users,
  Clock,
} from "lucide-react";
import Avatar from "./components/Avatar";
import SahvaLogo from "./components/SahvaLogo";
import ChatPanel from "./components/ChatPanel";
import MeetingNotesView from "./components/MeetingNotesView";
import CallOverlay from "./components/CallOverlay";
import CallLogView from "./components/CallLogView";
import TaskListView from "./components/TaskListView";
import ProfileView from "./components/ProfileView";
import { useReadReceipts } from "./lib/useReadReceipts";
import { ringback } from "./lib/alertSounds";
import {
  CallAudioEngine,
  type AudioMeterLevels,
} from "./services/callAudioEngine";
import type {
  AudioMixSettings,
  CallLogEntry,
  CallPhase,
  ChatMessage,
  ConversationThread,
  HomeTab,
  InterimCaption,
  LocalizedMeetingNote,
  MeetingNoteRecord,
  ParticipantInfo,
  PersonalTaskItem,
  RoomSnapshot,
  TaskReminder,
  TranscriptEntry,
  UserProfileSettings,
} from "./types";

type ConversationSubTab = "chat" | "notes";
type MobilePane = "list" | "thread";

const DEFAULT_MIX: AudioMixSettings = {
  autoDuck: false,
  duckLevel: 0.15,
  originalIdleLevel: 0.45,
  translatedVolume: 1.0,
  muteOriginal: false,
};

const STORAGE_THEME_KEY = "sahva:theme:v1";

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room")?.trim() || "";
  const invitedRole = params.get("role")?.toUpperCase() === "B" ? "B" : "";
  const isInviteLink = params.get("invite") === "1" || invitedRole === "B";
  const lang = params.get("lang")?.trim() || "";
  const title = params.get("title")?.trim() || "";
  return { room, invitedRole, isInviteLink, lang, title };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read audio recording."));
    reader.readAsDataURL(blob);
  });
}

export default function App({
  user,
  signOut,
}: {
  user: SahvaUser;
  signOut: () => Promise<void>;
}) {
  const initialUrl = useRef(parseUrlParams()).current;
  const selfId = user.id;
  const [darkMode, setDarkMode] = useState(user.theme === "dark");
  // Home 4-tab navigation (Chats | Calls | List | Profile)
  const [homeTab, setHomeTab] = useState<HomeTab>("chats");
  const [chatSearch, setChatSearch] = useState("");
  const [mobilePane, setMobilePane] = useState<MobilePane>(
    initialUrl.room ? "thread" : "list",
  );

  // Conversations (Recent Chats + All Contacts + Custom Rooms)
  type Thread = ConversationThread & {
    id?: string;
    unreadCount?: number;
    inviteToken?: string;
    targetUserIds?: string[];
  };
  const [conversations, setConversations] = useState<Thread[]>([]);
  const [activeRoomId, setActiveRoomId] = useState(initialUrl.room);
  const empty: Thread = {
    roomId: "",
    title: "",
    partnerRoleLabel: "",
    partnerLocation: "",
    partnerName: "",
    partnerLanguage: "",
    partnerAvatar: "",
    defaultSelfName: user.displayName,
    defaultSelfLanguage: user.preferredLanguageName,
    defaultSelfAvatar: user.avatarUrl || "",
    lastMessagePreview: "",
  };
  const activeThread =
    conversations.find((c) => c.roomId === activeRoomId) || empty;
  const [profile, setProfile] = useState<UserProfileSettings>({
    name: user.displayName,
    email: user.email,
    language: user.preferredLanguageName,
    voiceTone: user.voiceTone,
    translationModel: user.audioModelPreference,
  });
  const [mixSettings, setMixSettings] = useState({
    ...DEFAULT_MIX,
    duckLevel: user.audioMixDuckLevel,
    translatedVolume: user.audioMixTranslatedGain,
    muteOriginal: user.audioMixOriginalMuted,
  });
  // Sub-tab inside an open conversation thread (Messages | Meeting Notes)
  const [conversationTab, setConversationTab] =
    useState<ConversationSubTab>("chat");

  // New Custom Room modal
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoomInput, setNewRoomInput] = useState("");

  // Room real-time state
  const [wsConnected, setWsConnected] = useState(false);
  const [isCustomRoomServer, setIsCustomRoomServer] = useState(
    Boolean(activeThread.isCustomRoom),
  );
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [callerId, setCallerId] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null);
  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const [inCall, setInCall] = useState(false);
  const [isJoiningCall, setIsJoiningCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [interimCaptions, setInterimCaptions] = useState<
    Record<string, InterimCaption>
  >({});

  // Notes across ALL rooms (so List tab & Call Log can reference them)
  const [allNotesByRoom, setAllNotesByRoom] = useState<
    Record<string, MeetingNoteRecord[]>
  >({});

  const notes = allNotesByRoom[activeRoomId] || [];
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    () => (allNotesByRoom[activeRoomId] || [])[0]?.id || null,
  );
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [localizingLanguage, setLocalizingLanguage] = useState<string | null>(
    null,
  );

  // Voice Note State
  const [isSendingVoiceNote, setIsSendingVoiceNote] = useState(false);
  const [voiceNoteError, setVoiceNoteError] = useState<string | null>(null);

  // Call Log, Personal Tasks & Task Reminders
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
  const [personalTasks, setPersonalTasks] = useState<PersonalTaskItem[]>([]);
  const [reminders, setReminders] = useState<Record<string, TaskReminder>>({});
  const [archivedTaskKeys, setArchivedTaskKeys] = useState<string[]>([]);
  const taskIds = useRef<Record<string, string>>({});
  const [queuedDial, setQueuedDial] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const attempt = useRef(0);
  const callDialog = useRef<HTMLDialogElement>(null);
  const callSession = useRef<string | null>(null);
  const accepted = useRef(false);
  const [directory, setDirectory] = useState<
    { id: string; name: string; language: string; avatarUrl?: string }[]
  >([]);
  const [notice, setNotice] = useState("");
  const [offerAlerts, setOfferAlerts] = useState(false);
  const report = (e: Error) => setNotice(e.message);
  const threadRevision = useRef(0);
  const refreshThreads = useCallback(async (): Promise<Thread[]> => {
    const revision = ++threadRevision.current;
    const rows = await request("/api/conversations");
    if (revision === threadRevision.current) setConversations(rows);
    return rows;
  }, []);
  const loadWorkspace = useCallback(async () => {
    const [threads, notes, rows, logs]: [
      Thread[],
      MeetingNoteRecord[],
      any[],
      CallLogEntry[],
    ] = await Promise.all([
      refreshThreads(),
      request("/api/notes"),
      request("/api/tasks"),
      request("/api/call-log"),
    ]);
    setActiveRoomId((old) =>
      threads.some((t) => t.roomId === old) ? old : threads[0]?.roomId || "",
    );
    setCallLogs(logs);
    const grouped: Record<string, MeetingNoteRecord[]> = {};
    for (const n of notes) (grouped[n.roomId] ??= []).push(n);
    setAllNotesByRoom(grouped);
    const archived: string[] = [],
      rem: Record<string, TaskReminder> = {},
      ids: Record<string, string> = {};
    for (const t of rows) {
      const n = notes.find((n) => n.id === t.meetingNoteId);
      const key = n
        ? `note:${n.roomId}:${n.id}:${t.sourceTodoId}`
        : "personal:" + t.id;
      ids[key] = t.id;
      if (t.archived) archived.push(key);
      if (t.reminderAt)
        rem[key] = {
          taskKey: key,
          remindAt: t.reminderAt,
          label: new Date(t.reminderAt).toLocaleString(),
        };
    }
    taskIds.current = ids;
    setArchivedTaskKeys(archived);
    setReminders(rem);
    setPersonalTasks(
      rows
        .filter((t) => !t.meetingNoteId)
        .map((t) => ({
          id: t.id,
          task: t.title,
          assignee: t.assigneeName || user.displayName,
          dueHint: t.dueHint || "",
          completed: t.completed,
          createdAt: t.createdAt,
        })),
    );
  }, [user.id]);
  useEffect(() => {
    loadWorkspace().catch(report);
  }, [loadWorkspace]);
  useEffect(() => {
    let alive = true;
    async function loadDirectory() {
      const people = [];
      let cursor = "";
      do {
        const page = await request("/api/users" + (cursor ? "?after=" + encodeURIComponent(cursor) : ""));
        if (!alive) return;
        people.push(...page.people);
        cursor = page.next;
      } while (cursor);
      setDirectory(people.sort((a, b) => a.name.localeCompare(b.name)));
    }
    void loadDirectory().catch(report);
    window.addEventListener("focus", loadDirectoryOnFocus);
    function loadDirectoryOnFocus() { void loadDirectory().catch(report); }
    return () => { alive = false; window.removeEventListener("focus", loadDirectoryOnFocus); };
  }, [selfId]);
  const [searchMatches, setSearchMatches] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    setSearchMatches([]);
    if (chatSearch.trim().length < 2) return;
    const timer = setTimeout(() => void request("/api/users/search?q=" + encodeURIComponent(chatSearch))
      .then(rows => { if (alive) setSearchMatches(rows.map((r: {id: string}) => r.id)); }).catch(report), 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [chatSearch]);
  useReadReceipts(activeRoomId, selfId, messages, homeTab === "chats" && conversationTab === "chat" && !inCall && !waiting && !isJoiningCall && !showRoomModal,
    mobilePane === "thread", activeThread.unreadCount || 0, refreshThreads);
  const changeTask = (key: string, patch: object) =>
    request("/api/tasks/" + taskIds.current[key], "PATCH", patch)
      .then(loadWorkspace)
      .catch(report);
  const [levels, setLevels] = useState<AudioMeterLevels>({
    micLevel: 0,
    originalInLevel: 0,
    translatedInLevel: 0,
    isDuckingActive: false,
  });

  // Refs for WebSocket & Audio callbacks
  const wsRef = useRef<WebSocket | null>(null);
  const audioEngineRef = useRef<CallAudioEngine | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const profileRef = useRef(profile);
  const mixSettingsRef = useRef(mixSettings);
  const inCallRef = useRef(inCall);
  const callPhaseRef = useRef(callPhase);
  const callStartedAtRef = useRef(callStartedAt);
  const transcriptsRef = useRef(transcripts);
  const participantsRef = useRef(participants);
  const activeThreadRef = useRef(activeThread);
  const requestedNote = useRef<string | null>(null);
  const autoStartCallRoomRef = useRef<string | null>(null);

  profileRef.current = profile;
  mixSettingsRef.current = mixSettings;
  inCallRef.current = inCall;
  callPhaseRef.current = callPhase;
  callStartedAtRef.current = callStartedAt;
  transcriptsRef.current = transcripts;
  participantsRef.current = participants;
  activeThreadRef.current = activeThread;

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      localStorage.setItem(STORAGE_THEME_KEY, darkMode ? "dark" : "light");
    } catch {}
  }, [darkMode]);

  // Keep live audio engine synced with mix settings
  useEffect(() => {
    audioEngineRef.current?.setMixSettings(mixSettings);
  }, [mixSettings]);

  // Active call duration timer
  useEffect(() => {
    if (callPhase !== "active" || !callStartedAt) {
      setCallElapsedSeconds(0);
      return;
    }
    const updateElapsed = () => {
      const diff = Math.max(
        0,
        Math.floor((Date.now() - new Date(callStartedAt).getTime()) / 1000),
      );
      setCallElapsedSeconds(diff);
    };
    updateElapsed();
    const id = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(id);
  }, [callPhase, callStartedAt]);

  const stopLocalAudio = useCallback(() => {
    if (native) void bridge.stopActiveCallForegroundService().catch(() => {});
    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
      audioEngineRef.current = null;
    }
    ++attempt.current;
    setWaiting(false);
    setIsJoiningCall(false);
    setInCall(false);
    setMuted(false);
    setLevels({
      micLevel: 0,
      originalInLevel: 0,
      translatedInLevel: 0,
      isDuckingActive: false,
    });
  }, []);

  const mergeRoomNotes = useCallback(
    (roomId: string, incoming: MeetingNoteRecord[]) => {
      setAllNotesByRoom((prev) => {
        const existing = prev[roomId] || [];
        const map = new Map<string, MeetingNoteRecord>();
        for (const n of existing) map.set(n.id, n);
        for (const n of incoming) map.set(n.id, n);
        const merged = Array.from(map.values()).sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

        return { ...prev, [roomId]: merged };
      });
    },
    [],
  );

  // Mark a conversation as Recent when messages/calls happen
  const promoteToRecent = useCallback(
    (roomId: string, previewText?: string) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.roomId === roomId
            ? {
                ...c,
                isRecent: true,
                lastActivityLabel: "Just now",
                ...(previewText ? { lastMessagePreview: previewText } : {}),
              }
            : c,
        ),
      );
    },
    [],
  );

  // Connect WebSocket for activeRoomId
  useEffect(() => {
    let cancelled = false;
    setCallError(null);
    setVoiceNoteError(null);
    setInterimCaptions({});
    setIsCustomRoomServer(Boolean(activeThreadRef.current.isCustomRoom));

    if (!activeRoomId) return;
    setWsConnected(false);
    setMessages([]);
    setSelectedNoteId(null);
    const connectSocket = async () => {
      if (cancelled) return;
      let ws: WebSocket;
      try {
        ws = await openSocket(
          "/ws/call?roomId=" + encodeURIComponent(activeRoomId),
        );
      } catch {
        if (!cancelled)
          reconnectTimerRef.current = window.setTimeout(connectSocket, 1800);
        return;
      }
      if (cancelled) {
        ws.close();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        setWsConnected(true);
        if (inCallRef.current) {
          ws.send(
            JSON.stringify({
              type: "call:join",
              callSessionId: callSession.current,
              name: profileRef.current.name,
              language: profileRef.current.language,
              voiceTone: profileRef.current.voiceTone,
              model: profileRef.current.translationModel,
            }),
          );
        }
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (data.type) {
          case "room:init": {
            const snap: RoomSnapshot = data.snapshot;
            setIsCustomRoomServer(snap.isCustomRoom);
            setParticipants(snap.participants || []);
            if (snap.callPhase === "active" && snap.callId === callSession.current) setWaiting(false);
            setCallPhase(snap.callPhase || "idle");
            setCallerId(snap.callerId || null);
            setCallStartedAt(snap.callStartedAt);
            setMessages(snap.messages || []);
            setTranscripts(snap.transcripts || []);
            mergeRoomNotes(activeRoomId, snap.notes || []);
            if (snap.notes?.length) {
              setSelectedNoteId(
                snap.notes.find((n) => n.id === requestedNote.current)?.id ||
                  snap.notes[0].id,
              );
              requestedNote.current = null;
            }
            break;
          }

          case "room:presence": {
            setParticipants(data.participants || []);
            if (data.callPhase === "active" && data.callId === callSession.current) setWaiting(false);
            setCallPhase(data.callPhase || "idle");
            setCallerId(data.callerId || null);
            setCallStartedAt(data.callStartedAt || null);
            break;
          }

          case "call:join_rejected": {
            stopLocalAudio();
            callSession.current = null;
            accepted.current = false;
            setNotice(data.message || "Could not join this call.");
            break;
          }
          case "call:left_self": {
            stopLocalAudio();
            break;
          }

          case "call:ended": {
            callSession.current=null;accepted.current=false;
            stopLocalAudio();
            setCallPhase("idle");
            setCallerId(null);
            setCallStartedAt(null);
            setInterimCaptions({});
            break;
          }

          case "peer:original_audio": {
            if (
              inCallRef.current &&
              callPhaseRef.current === "active" &&
              typeof data.pcm16k === "string"
            ) {
              audioEngineRef.current?.enqueuePartnerOriginalAudio(data.pcm16k);
            }
            break;
          }

          case "peer:translated_audio": {
            if (
              inCallRef.current &&
              callPhaseRef.current === "active" &&
              typeof data.pcm24k === "string"
            ) {
              audioEngineRef.current?.enqueuePartnerTranslatedAudio(
                data.pcm24k,
              );
            }
            break;
          }

          case "call:caption": {
            const speakerId: string = data.speakerId;
            setInterimCaptions((prev) => {
              const next = { ...prev };
              if (data.caption) next[speakerId] = data.caption;
              else delete next[speakerId];
              return next;
            });
            break;
          }

          case "call:transcript": {
            const entry: TranscriptEntry = data.entry;
            setTranscripts((prev) =>
              prev.some((t) => t.id === entry.id) ? prev : [...prev, entry],
            );
            break;
          }

          case "chat:message": {
            const msg: ChatMessage = data.message;
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
            );
            promoteToRecent(
              activeRoomId,
              msg.kind === "audio"
                ? `Voice note (${msg.audio?.translatedLanguage || ""})`
                : msg.originalText,
            );
            break;
          }

          case "note:created": {
            const created: MeetingNoteRecord = data.note;
            const summaryMsg: ChatMessage | undefined = data.summaryMessage;
            mergeRoomNotes(activeRoomId, [created]);
            setSelectedNoteId(created.id);
            if (summaryMsg) {
              setMessages((prev) =>
                prev.some((m) => m.id === summaryMsg.id)
                  ? prev
                  : [...prev, summaryMsg],
              );
            }
            break;
          }

          case "note:localized": {
            const { noteId, language, localizedNote } = data as {
              noteId: string;
              language: string;
              localizedNote: LocalizedMeetingNote;
            };
            setAllNotesByRoom((prev) => {
              const list = (prev[activeRoomId] || []).map((n) =>
                n.id === noteId
                  ? {
                      ...n,
                      localized: { ...n.localized, [language]: localizedNote },
                    }
                  : n,
              );

              return { ...prev, [activeRoomId]: list };
            });
            break;
          }

          case "note:todo_updated": {
            const { noteId, todoId, completed } = data;
            setAllNotesByRoom((prev) => {
              const list = (prev[activeRoomId] || []).map((n) => {
                if (n.id !== noteId) return n;
                const updatedLoc: Record<string, LocalizedMeetingNote> = {};
                for (const [lang, loc] of Object.entries(n.localized) as Array<
                  [string, LocalizedMeetingNote]
                >) {
                  updatedLoc[lang] = {
                    ...loc,
                    todos: loc.todos.map((td) =>
                      td.id === todoId ? { ...td, completed } : td,
                    ),
                  };
                }
                return {
                  ...n,
                  todoStates: { ...n.todoStates, [todoId]: completed },
                  localized: updatedLoc,
                };
              });

              return { ...prev, [activeRoomId]: list };
            });
            break;
          }

          case "call:error": {
            setCallError(
              data.message || "Live translation encountered an error.",
            );
            break;
          }
        }
      };

      ws.onclose = (ev) => {
        if (cancelled) return;
        setWsConnected(false);
        if (ev.code === 4000) return;
        reconnectTimerRef.current = window.setTimeout(connectSocket, 1800);
      };

      ws.onerror = () => {};
    };

    connectSocket();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      stopLocalAudio();
    };
  }, [
    activeRoomId,
    selfId,
    initialUrl.invitedRole,
    mergeRoomNotes,
    promoteToRecent,
    stopLocalAudio,
  ]);

  const sendWs = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  // Update Profile handler (pushes live to active room WS too!)
  const handleUpdateProfile = async (patch: Partial<UserProfileSettings>) => {
    const next = { ...profile, ...patch };
    try {
      await request("/api/me", "PATCH", {
        displayName: next.name,
        email: next.email,
        preferredLanguageName: next.language,
        voiceTone: next.voiceTone,
        audioModelPreference: next.translationModel,
      });
      setProfile(next);
      sendWs({
        type: "profile:update",
        name: next.name,
        language: next.language,
        voiceTone: next.voiceTone,
        model: next.translationModel,
      });
      return true;
    } catch (e: any) {
      report(e);
      return false;
    }
  };
  const updateMix = (next: AudioMixSettings) =>
    request("/api/me", "PATCH", {
      audioMixOriginalMuted: next.muteOriginal,
      audioMixDuckLevel: next.duckLevel,
      audioMixTranslatedGain: next.translatedVolume,
    })
      .then(() => setMixSettings(next))
      .catch(report);
  // Start / Accept Call
  const handleStartOrAcceptCall = useCallback(async () => {
    if (inCall || isJoiningCall) return;
    setQueuedDial(false);
    const ticket = ++attempt.current;
    const engine = new CallAudioEngine();
    setWaiting(true);
    setIsJoiningCall(true);
    setCallError(null);

    try {
      if (wsRef.current?.readyState !== WebSocket.OPEN)
        throw Error("Connecting to the conversation. Try again shortly.");
      audioEngineRef.current = engine;
      engine.setMixSettings(mixSettingsRef.current);
      await engine.start(
        (pcm16k, rms) => {
          if (callPhaseRef.current === "active") {
            sendWs({ type: "audio:chunk", pcm16k, rms });
          }
        },
        (nextLevels) => setLevels(nextLevels),
      );
      if (attempt.current !== ticket) { engine.stop(); return; }
      if (!accepted.current) {
        const ring = await request("/api/calls/ring", "POST", {
          conversationId: activeThreadRef.current.id,
        });
        if (attempt.current !== ticket) {
          await request("/api/calls/" + ring.callSessionId + "/cancel", "POST", {});
          return;
        }
        callSession.current = ring.callSessionId;
      }
      accepted.current = false;
      if (native)
        await bridge.startActiveCallForegroundService({
          callerName: activeThreadRef.current.title,
          roomId: activeThreadRef.current.roomId,
        });
      if (attempt.current !== ticket) { engine.stop(); return; }
      if (wsRef.current?.readyState !== WebSocket.OPEN) throw Error("Connection lost while dialing.");
      audioEngineRef.current = engine;
      setInCall(true);
      setOfferAlerts(true);
      setMuted(false);

      sendWs({
        type: "call:join",
        callSessionId: callSession.current,
        name: profileRef.current.name,
        language: profileRef.current.language,
        voiceTone: profileRef.current.voiceTone,
        model: profileRef.current.translationModel,
      });
    } catch (err: any) {
      engine.stop();
      if (attempt.current !== ticket) return;
      stopLocalAudio();
      if(callSession.current)void request("/api/calls/"+callSession.current+"/join-failed","POST",{}).catch(report);
      accepted.current=false;callSession.current=null;
      setNotice(err?.name === "NotAllowedError"
        ? "Allow microphone access in your device or site settings, then tap Call again."
        : err?.message || "Could not join call.");
      setCallError(
        err?.message ||
          "Could not access microphone. Please allow microphone permission to join the live translated call.",
      );
    } finally {
      if (attempt.current === ticket) setIsJoiningCall(false);
    }
  }, [inCall, isJoiningCall, sendWs, stopLocalAudio]);

  // Auto-start call when triggered from Call Log "Call Back" button
  useEffect(() => {
    if (
      wsConnected &&
      wsRef.current?.readyState === WebSocket.OPEN &&
      autoStartCallRoomRef.current &&
      autoStartCallRoomRef.current === activeRoomId
    ) {
      autoStartCallRoomRef.current = null;
      handleStartOrAcceptCall();
    }
  }, [wsConnected, activeRoomId, handleStartOrAcceptCall]);

  const handleDeclineIncomingCall = useCallback(() => {
    stopLocalAudio();
    sendWs({ type: "call:decline" });
  }, [sendWs, stopLocalAudio]);

  const generateNotesForCall = useCallback(
    async (
      durationSec: number,
      callTranscripts: TranscriptEntry[],
      callSpeakers: Array<{ name: string; language: string }>,
    ): Promise<MeetingNoteRecord | null> => {
      setIsGeneratingNotes(true);
      try {
        const res = await apiFetch("/api/notes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: activeRoomId,
            durationSeconds: durationSec,
            transcripts: callTranscripts,
            participants: callSpeakers,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Could not generate meeting notes.");
        }
        if (data.note) {
          mergeRoomNotes(activeRoomId, [data.note]);
          setSelectedNoteId(data.note.id);
          return data.note as MeetingNoteRecord;
        }
        return null;
      } catch (err: any) {
        setCallError(err?.message || "Failed to generate meeting notes.");
        return null;
      } finally {
        setIsGeneratingNotes(false);
      }
    },
    [activeRoomId, mergeRoomNotes],
  );

  const handleEndCall = useCallback(async () => {
    const wasActive = callPhaseRef.current === "active";
    autoStartCallRoomRef.current = null;
    setQueuedDial(false);
    const session = callSession.current;
    callSession.current = null;
    accepted.current = false;
    stopLocalAudio();
    if (!wasActive && session) {
      await request("/api/calls/" + session + "/cancel", "POST", {})
        .catch(() => request("/api/calls/" + session + "/join-failed", "POST", {})).catch(report);
    }
    if (session && !callSession.current) sendWs({ type: "call:end", callSessionId: session });
    loadWorkspace().catch(report);
    promoteToRecent(activeRoomId);
  }, [
    activeRoomId,
    loadWorkspace,
    promoteToRecent,
    sendWs,
    stopLocalAudio,
  ]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      audioEngineRef.current?.setMuted(next);
      sendWs({ type: "call:mute", muted: next });
      return next;
    });
  }, [sendWs]);

  const handleAddManualNote = useCallback(
    (text: string) => {
      sendWs({ type: "transcript:manual", text });
    },
    [sendWs],
  );

  // Send translated text message
  const handleSendChat = useCallback(
    async (text: string) => {
      setOfferAlerts(true);
      const fallbackTargetLang = activeThread.isCustomRoom
        ? undefined
        : activeThread.partnerName.toLowerCase() === profile.name.toLowerCase()
          ? activeThread.defaultSelfLanguage
          : activeThread.partnerLanguage;
      try {
        const res = await apiFetch("/api/chat/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: activeRoomId,
            senderId: selfId,
            senderRole: initialUrl.invitedRole || "A",
            senderName: profile.name,
            sourceLanguage: profile.language,
            targetLanguage: fallbackTargetLang,
            text,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setCallError(data.error || "Failed to send message.");
        } else {
          promoteToRecent(activeRoomId, text);
        }
      } catch (err: any) {
        setCallError(err?.message || "Failed to send message.");
      }
    },
    [
      activeRoomId,
      activeThread.defaultSelfLanguage,
      activeThread.isCustomRoom,
      activeThread.partnerLanguage,
      activeThread.partnerName,
      initialUrl.invitedRole,
      profile.language,
      profile.name,
      promoteToRecent,
      selfId,
    ],
  );

  // Record & send translated voice note
  const handleSendVoiceNote = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      setOfferAlerts(true);
      setIsSendingVoiceNote(true);
      setVoiceNoteError(null);
      const fallbackTargetLang = activeThread.isCustomRoom
        ? undefined
        : activeThread.partnerName.toLowerCase() === profile.name.toLowerCase()
          ? activeThread.defaultSelfLanguage
          : activeThread.partnerLanguage;
      try {
        const audioBase64 = await blobToBase64(blob);
        const res = await apiFetch("/api/chat/voice-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: activeRoomId,
            senderId: selfId,
            senderRole: initialUrl.invitedRole || "A",
            senderName: profile.name,
            sourceLanguage: profile.language,
            targetLanguage: fallbackTargetLang,
            voiceTone: profile.voiceTone,
            audioBase64,
            mimeType: blob.type || "audio/webm",
            durationSeconds,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to translate voice message.");
        }
        promoteToRecent(activeRoomId, "Voice note");
      } catch (err: any) {
        setVoiceNoteError(
          err?.message || "Could not process translated voice note.",
        );
      } finally {
        setIsSendingVoiceNote(false);
      }
    },
    [
      activeRoomId,
      activeThread.defaultSelfLanguage,
      activeThread.isCustomRoom,
      activeThread.partnerLanguage,
      activeThread.partnerName,
      initialUrl.invitedRole,
      profile.language,
      profile.name,
      profile.voiceTone,
      promoteToRecent,
      selfId,
    ],
  );

  // Toggle To-Do in any room (works from both Meeting Notes AND List bottom tab!)
  const handleToggleTodoAnyRoom = (
    room: string,
    note: string,
    todo: string,
    completed: boolean,
  ) => changeTask(`note:${room}:${note}:${todo}`, { completed });
  // Localize a saved note on-demand into any language
  const handleLocalizeNote = useCallback(
    async (note: MeetingNoteRecord, targetLanguage: string) => {
      setLocalizingLanguage(targetLanguage);
      try {
        const res = await apiFetch("/api/notes/localize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: activeRoomId,
            noteId: note.id,
            targetLanguage,
            note,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Could not localize note.");
        }
        if (data.localizedNote) {
          setAllNotesByRoom((prev) => {
            const list = (prev[activeRoomId] || []).map((n) =>
              n.id === note.id
                ? {
                    ...n,
                    localized: {
                      ...n.localized,
                      [targetLanguage]: data.localizedNote,
                    },
                  }
                : n,
            );

            return { ...prev, [activeRoomId]: list };
          });
        }
      } catch (err: any) {
        setCallError(err?.message || "Failed to translate meeting note.");
      } finally {
        setLocalizingLanguage(null);
      }
    },
    [activeRoomId],
  );

  // Prepare or fetch playable/downloadable WAV audio for a meeting note
  const handlePrepareNoteAudio = useCallback(
    async (
      note: MeetingNoteRecord,
      targetLanguage: string,
      spokenText: string,
    ): Promise<string | null> => {
      try {
        const res = await apiFetch("/api/notes/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: note.roomId || activeRoomId,
            noteId: note.id,
            targetLanguage,
            voiceTone: profileRef.current.voiceTone,
            text: spokenText,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.recordingUrl) {
          return null;
        }
        const url = String(data.recordingUrl);
        const roomKey = note.roomId || activeRoomId;
        setAllNotesByRoom((prev) => {
          const list = (prev[roomKey] || []).map((n) =>
            n.id === note.id ? { ...n, recordingUrl: url } : n,
          );

          return { ...prev, [roomKey]: list };
        });
        return url;
      } catch {
        return null;
      }
    },
    [activeRoomId],
  );

  // Select a conversation thread
  const handleSelectThread = (thread: ConversationThread) => {
    if (inCall) return;
    setActiveRoomId(thread.roomId);
    setHomeTab("chats");
    setConversationTab("chat");
    setMobilePane("thread");
  };

  // Create a new EMPTY custom / multi-participant room
  async function createThread(body: object) {
    try {
      const r = await request("/api/conversations", "POST", body);
      await loadWorkspace();
      setChatSearch("");
      setActiveRoomId(r.roomKey);
      setHomeTab("chats");
      setConversationTab("chat");
      setMobilePane("thread");
      setNewRoomInput("");
      setShowRoomModal(false);
    } catch (e: any) {
      report(e);
    }
  }
  const handleCreateRoom = (e: FormEvent) => {
    e.preventDefault();
    if (newRoomInput.trim()) void createThread({ title: newRoomInput.trim() });
  };
  // Derived participant info
  const selfParticipant: ParticipantInfo = participants.find(
    (p) => p.id === selfId,
  ) || {
    id: selfId,
    name: profile.name,
    language: profile.language,
    connected: wsConnected,
    inCall,
    muted,
    speaking: false,
    translatorReady: false,
  };

  const otherParticipants = participants.filter((p) => p.id !== selfId);

  const inviteUrl = activeThread.inviteToken
    ? webOrigin + "/join/" + activeThread.inviteToken
    : "";
  const dialing = queuedDial || waiting;
  const showCallOverlay = dialing || inCall;
  useEffect(() => {
    if (!queuedDial) return;
    const timeout = window.setTimeout(() => {
      autoStartCallRoomRef.current = null;
      setQueuedDial(false);
      setNotice("Could not connect to the conversation. Please try again.");
    }, 15000);
    return () => clearTimeout(timeout);
  }, [queuedDial]);
  useEffect(() => {
    if (showCallOverlay) callDialog.current?.showModal();
  }, [showCallOverlay]);
  useEffect(() => {
    if (!waiting || !inCall) return;
    const stop = ringback();
    const timeout = window.setTimeout(() => void handleEndCall(), 55000);
    return () => { stop(); clearTimeout(timeout); };
  }, [waiting, inCall, handleEndCall]);
  // Filter chats for Search
  const q = chatSearch.trim().toLowerCase();
  const filteredThreads = conversations.filter((t) => {
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.partnerLanguage.toLowerCase().includes(q) ||
      t.partnerLocation.toLowerCase().includes(q)
    );
  });

  const recentThreads = filteredThreads.filter((t) => t.isRecent);
  const people = directory.filter(p => !q || (p.name + " " + p.language).toLowerCase().includes(q) || searchMatches.includes(p.id));

  const roomTitlesById: Record<string, string> = {};
  for (const c of conversations) {
    roomTitlesById[c.roomId] = c.title;
  }

  // Open note from Call Log or List tab
  const handleJumpToNote = (roomId: string, noteId?: string) => {
    setActiveRoomId(roomId);
    requestedNote.current = noteId || null;
    if (noteId) setSelectedNoteId(noteId);
    setHomeTab("chats");
    setConversationTab("notes");
    setMobilePane("thread");
  };

  // Call back directly from Call Log
  const handleCallAgainFromLog = (roomId: string, title: string) => {
    if (!conversations.some((c) => c.roomId === roomId)) {
      setConversations((prev) => [
        {
          roomId,
          title,
          partnerRoleLabel: "Room",
          partnerLocation: "",
          partnerName: title,
          partnerLanguage: "",
          partnerAvatar: "",
          defaultSelfName: profile.name,
          defaultSelfLanguage: profile.language,
          defaultSelfAvatar: user.avatarUrl||"",
          lastMessagePreview: "Recent call room",
          isRecent: true,
          isCustomRoom: true,
        },
        ...prev,
      ]);
    }
    setHomeTab("chats");
    setConversationTab("chat");
    setMobilePane("thread");
    if (roomId === activeRoomId && wsConnected) {
      handleStartOrAcceptCall();
    } else {
      setQueuedDial(true);
      autoStartCallRoomRef.current = roomId;
      setActiveRoomId(roomId);
    }
  };

  // Header subtitle for the active conversation thread
  const headerSubtitle = (() => {
    if (isCustomRoomServer || activeThread.isCustomRoom) {
      if (otherParticipants.length === 0) {
        return "Empty room · Share invite to add people";
      }
      const uniqueLangs = Array.from(
        new Set([
          profile.language,
          ...otherParticipants.map((p) => p.language),
        ]),
      );
      return `${otherParticipants.length + 1} in room · ${uniqueLangs.join(", ")}`;
    }
    const partnerLang =
      otherParticipants[0]?.language || activeThread.partnerLanguage;
    return `${partnerLang}${
      activeThread.partnerLocation ? ` · ${activeThread.partnerLocation}` : ""
    }`;
  })();

  const openTaskCount = (() => {
    const archivedSet = new Set(archivedTaskKeys);
    let count = personalTasks.filter(
      (t) => !t.completed && !archivedSet.has(`personal:${t.id}`),
    ).length;
    const firstWord = profile.name.toLowerCase().trim().split(/\s+/)[0];
    for (const [roomId, roomNotes] of Object.entries(allNotesByRoom) as Array<
      [string, MeetingNoteRecord[]]
    >) {
      for (const n of roomNotes) {
        const loc = (Object.values(n.localized) as LocalizedMeetingNote[])[0];
        if (!loc) continue;
        for (const td of loc.todos) {
          const done = Boolean(n.todoStates[td.id] ?? td.completed);
          if (done || archivedSet.has(`note:${roomId}:${n.id}:${td.id}`)) {
            continue;
          }
          const a = td.assignee.toLowerCase();
          if (
            a === "both" ||
            a === "all" ||
            (firstWord.length >= 2 && a.includes(firstWord))
          ) {
            count++;
          }
        }
      }
    }
    return count;
  })();

  const selfAvatar = user.avatarUrl || "";
  const photoFor = (id?: string) => id === selfId ? selfAvatar : directory.find(person => person.id === id)?.avatarUrl;
  const selfFirstName = profile.name.trim().split(/\s+/)[0] || "Account";

  const isViewingAsPartner = false;
  const threadDisplayTitle = isViewingAsPartner
    ? otherParticipants[0]?.name || activeThread.defaultSelfName
    : activeThread.title;
  const threadDisplayAvatar =
    activeThread.partnerAvatar ||
    (isViewingAsPartner
      ? activeThread.defaultSelfAvatar
      : activeThread.partnerAvatar);
  const threadDisplayPartnerLanguage = isViewingAsPartner
    ? otherParticipants[0]?.language || activeThread.defaultSelfLanguage
    : otherParticipants[0]?.language || activeThread.partnerLanguage;

  const navItems: Array<{
    id: HomeTab;
    label: string;
    icon: typeof MessageSquare;
    badge?: number;
  }> = [
    { id: "chats", label: "Chats", icon: MessageSquare, badge: conversations.reduce((n, t) => n + (t.unreadCount || 0), 0) },
    { id: "calls", label: "Calls", icon: Clock },
    { id: "list", label: "List", icon: CheckSquare, badge: openTaskCount },
    { id: "profile", label: selfFirstName, icon: User },
  ];

  const isMobileHomeView = homeTab !== "chats" || mobilePane === "list";

  return (
    <div className="h-[100dvh] w-full flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* ===================================================================== */}
      {/* LEFT SIDEBAR (Chats List on Desktop + Mobile Home for Chats Tab)      */}
      {/* ===================================================================== */}
      <aside
        className={`${
          homeTab === "chats" && mobilePane === "list"
            ? "flex flex-1 min-h-0"
            : "hidden"
        } lg:flex lg:flex-none lg:w-80 bg-white dark:bg-slate-900 lg:border-r border-slate-200 dark:border-slate-800 flex-col shrink-0 overflow-hidden`}
      >
        {/* Sahva Brand Header (No moon icon — Search sits right underneath) */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <SahvaLogo compact />
          </div>
          <button
            type="button"
            onClick={() => setShowRoomModal((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 h-8 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/70 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Room</span>
          </button>
        </div>

        {/* Search Field (replaces top-nav theme toggle) */}
        <div className="px-4 pb-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search people, rooms, or languages..."
              className="w-full h-9 pl-9 pr-8 text-xs bg-slate-100/80 dark:bg-slate-950 border border-transparent focus:border-blue-500 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-900 transition-colors"
            />
            {chatSearch && (
              <button
                type="button"
                onClick={() => setChatSearch("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Create New Multi-Participant Room Form */}
        {showRoomModal && (
          <form
            onSubmit={handleCreateRoom}
            className="mx-4 mb-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 shrink-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                New Multi-Language Room
              </span>
              <button
                type="button"
                onClick={() => setShowRoomModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Creates an empty room where 2+ people from different languages can
              join via invite link.
            </p>
            <input
              type="text"
              value={newRoomInput}
              onChange={(e) => setNewRoomInput(e.target.value)}
              placeholder="Room name (e.g. Q4 Launch Sync)"
              className="w-full h-8 px-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              className="w-full h-8 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 rounded-md transition-colors"
            >
              Create Empty Room
            </button>
          </form>
        )}

        {/* Recent Chats + Separator + All Contacts */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          {recentThreads.length > 0 && (
            <>
              <p className="px-2 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Recent Chats
              </p>
              {recentThreads.map((thread) => {
                const isSelected =
                  homeTab === "chats" && thread.roomId === activeRoomId;
                return (
                  <button
                    key={thread.roomId}
                    type="button"
                    onClick={() => handleSelectThread(thread)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors ${
                      isSelected
                        ? "bg-slate-100 dark:bg-slate-800/90"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    {thread.isCustomRoom ? (
                      <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/70 flex items-center justify-center text-blue-700 dark:text-blue-400 shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                    ) : (
                      <Avatar
                        src={thread.partnerAvatar}
                        name={thread.partnerName}
                        size="md"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {thread.title}
                        </p>
                        {thread.lastActivityLabel && (
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {thread.lastActivityLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {thread.isCustomRoom
                          ? thread.lastMessagePreview
                          : `${thread.partnerLanguage}${
                              thread.partnerLocation
                                ? ` · ${thread.partnerLocation}`
                                : ""
                            }`}
                      </p>
                    </div>
                    {!!thread.unreadCount && <span aria-label={thread.unreadCount + " unread messages"} className="shrink-0 rounded-full bg-[#125C96] px-2 min-w-6 h-6 grid place-items-center text-xs text-white font-semibold tabular-nums">{thread.unreadCount}</span>}
                  </button>
                );
              })}
            </>
          )}

          <section aria-label="All Contacts" className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h2 className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">All Contacts</h2>
            {people.map(person => <button key={person.id} type="button"
              className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 hover:bg-blue-50 dark:hover:bg-slate-800"
              onClick={() => {
                const direct = conversations.find(t => !t.isCustomRoom && t.targetUserIds?.includes(person.id));
                if (direct) handleSelectThread(direct);
                else void createThread({ targetUserIds: [person.id] });
              }}>
              <Avatar name={person.name} src={person.avatarUrl} />
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{person.name}</span>
                <span className="block text-xs text-slate-500">{person.language}</span></span>
            </button>)}
          </section>
          {filteredThreads.length === 0 && people.length === 0 && q && (
            <p className="py-10 text-center text-xs text-slate-400">
              No people or rooms match &ldquo;{chatSearch}&rdquo;
            </p>
          )}
        </div>

        {/* Desktop Sidebar Bottom 4-Tab Bar */}
        <nav
          aria-label="Sahva main navigation"
          className="hidden lg:grid grid-cols-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-1 py-1.5 shrink-0"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = homeTab === item.id;
            const isProfileTab = item.id === "profile";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setHomeTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  active
                    ? "text-blue-700 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <span className="relative flex items-center justify-center">
                  {isProfileTab ? (
                    <Avatar
                      src={selfAvatar}
                      name={profile.name}
                      size="sm"
                      className={`w-5 h-5 text-[9px] ${
                        active
                          ? "ring-2 ring-blue-600 dark:ring-blue-400"
                          : "ring-1 ring-slate-300 dark:ring-slate-700"
                      }`}
                    />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-700 text-white text-[10px] font-mono tabular-nums flex items-center justify-center">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-1">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ===================================================================== */}
      {/* MAIN VIEWPORT (Active Chat Thread OR Calls / List / Profile Views)    */}
      {/* ===================================================================== */}
      <main
        className={`${
          homeTab !== "chats" || mobilePane === "thread"
            ? "flex flex-1 min-h-0"
            : "hidden"
        } lg:flex lg:flex-1 flex-col min-w-0 overflow-hidden`}
      >
        {homeTab === "calls" && (
          <CallLogView
            logs={callLogs}
            onCallAgain={handleCallAgainFromLog}
            onOpenNotesForLog={handleJumpToNote}
          />
        )}

        {homeTab === "list" && (
          <TaskListView
            selfName={profile.name}
            selfLanguage={profile.language}
            allNotesByRoom={allNotesByRoom}
            roomTitlesById={roomTitlesById}
            personalTasks={personalTasks}
            reminders={reminders}
            archivedKeys={archivedTaskKeys}
            onToggleNoteTodo={handleToggleTodoAnyRoom}
            onAddPersonalTask={(title) =>
              void request("/api/tasks", "POST", { title })
                .then(loadWorkspace)
                .catch(report)
            }
            onTogglePersonalTask={(id) =>
              void changeTask("personal:" + id, {
                completed: !personalTasks.find((t) => t.id === id)?.completed,
              })
            }
            onSetReminder={(key, r) =>
              void changeTask(key, { reminderAt: r?.remindAt || null })
            }
            onArchiveTask={(key) => void changeTask(key, { archived: true })}
            onUnarchiveTask={(key) => void changeTask(key, { archived: false })}
            onOpenNote={handleJumpToNote}
          />
        )}

        {homeTab === "profile" && (
          <ProfileView
            profile={profile}
            avatar={selfAvatar}
            mixSettings={mixSettings}
            darkMode={darkMode}
            onUpdateProfile={handleUpdateProfile}
            onUpdateMix={updateMix}
            onToggleDarkMode={(v) =>
              request("/api/me", "PATCH", { theme: v ? "dark" : "light" })
                .then(() => setDarkMode(v))
                .catch(report)
            }
            onResetSession={() => void signOut().catch(report)}
          />
        )}

        {homeTab === "chats" && !activeRoomId && (
          <div className="m-auto p-8 text-slate-600">
            Search for a contact or create a room to start a conversation.
          </div>
        )}
        {homeTab === "chats" && activeRoomId && (
          <>
            {/* Top Conversation Header */}
            <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="h-14 md:h-16 px-3 sm:px-6 flex items-center justify-between gap-3 md:gap-6">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 md:flex-initial">
                  <button
                    type="button"
                    onClick={() => setMobilePane("list")}
                    aria-label="Back to chats"
                    className="lg:hidden w-9 h-9 -ml-1 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  {activeThread.isCustomRoom || isCustomRoomServer ? (
                    <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/70 flex items-center justify-center text-blue-700 dark:text-blue-400 shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                  ) : (
                    <Avatar
                      src={threadDisplayAvatar}
                      name={threadDisplayTitle}
                      size="sm"
                    />
                  )}
                  <div className="min-w-0">
                    <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {threadDisplayTitle}
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {isViewingAsPartner
                        ? threadDisplayPartnerLanguage
                        : headerSubtitle}
                    </p>
                  </div>
                </div>

                {/* Desktop 2-tab switch */}
                <nav
                  aria-label="Conversation views"
                  className="hidden md:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => setConversationTab("chat")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      conversationTab === "chat"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Messages</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversationTab("notes")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      conversationTab === "notes"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>
                      Meeting Notes
                      {notes.length > 0 ? ` (${notes.length})` : ""}
                    </span>
                  </button>
                </nav>

                {/* Primary Start Translated Call CTA */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleStartOrAcceptCall}
                    disabled={isJoiningCall}
                    className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      Start Translated Call
                    </span>
                    <span className="sm:hidden">Call</span>
                  </button>
                </div>
              </div>

              {/* Mobile Sub-Bar */}
              <nav
                aria-label="Mobile conversation views"
                className="md:hidden px-3 pb-2.5 pt-0.5 flex items-center"
              >
                <div className="w-full grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setConversationTab("chat")}
                    className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      conversationTab === "chat"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Messages</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversationTab("notes")}
                    className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      conversationTab === "notes"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>
                      Meeting Notes
                      {notes.length > 0 ? ` (${notes.length})` : ""}
                    </span>
                  </button>
                </div>
              </nav>
            </header>

            {conversationTab === "chat" && (
              <ChatPanel
          photoFor={photoFor}
                selfId={selfId}
                isCustomRoom={
                  isCustomRoomServer || Boolean(activeThread.isCustomRoom)
                }
                roomTitle={activeThread.title}
                selfParticipant={selfParticipant}
                otherParticipants={otherParticipants}
                fallbackPartnerName={
                  activeThread.isCustomRoom ? undefined : threadDisplayTitle
                }
                fallbackPartnerLanguage={
                  activeThread.isCustomRoom
                    ? undefined
                    : threadDisplayPartnerLanguage
                }
                selfAvatar={selfAvatar}
                partnerAvatar={threadDisplayAvatar}
                inviteUrl={inviteUrl}
                messages={messages}
                notes={notes}
                isSendingVoiceNote={isSendingVoiceNote}
                voiceNoteError={voiceNoteError}
                onSendMessage={handleSendChat}
                onSendVoiceNote={handleSendVoiceNote}
                onOpenNote={(noteId) => {
                  setSelectedNoteId(noteId);
                  setConversationTab("notes");
                }}
                onDismissVoiceError={() => setVoiceNoteError(null)}
              />
            )}

            {conversationTab === "notes" && (
              <MeetingNotesView
                notes={notes}
                selectedNoteId={selectedNoteId}
                preferredLanguage={profile.language}
                isGenerating={isGeneratingNotes}
                localizingLanguage={localizingLanguage}
                onSelectNote={(id) => setSelectedNoteId(id)}
                onToggleTodo={(noteId, todoId, completed) =>
                  handleToggleTodoAnyRoom(
                    activeRoomId,
                    noteId,
                    todoId,
                    completed,
                  )
                }
                onLocalizeNote={handleLocalizeNote}
                onPrepareNoteAudio={handlePrepareNoteAudio}
                onGenerateFromCurrentSession={() =>
                  generateNotesForCall(
                    callElapsedSeconds,
                    transcripts,
                    participants.length > 0
                      ? participants.map((p) => ({
                          name: p.name,
                          language: p.language,
                        }))
                      : [{ name: profile.name, language: profile.language }],
                  )
                }
                onStartCall={handleStartOrAcceptCall}
              />
            )}
          </>
        )}
      </main>

      {/* ===================================================================== */}
      {notice && (
        <div
          role="alert"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[110] rounded-lg bg-slate-900 text-white p-3"
        >
          {notice} <button onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}
      {offerAlerts && !inCall && <NotificationReminder close={() => setOfferAlerts(false)} />}
      <IncomingCalls
        language={profile.language}
        onError={setNotice}
        onAnswer={async (r) => {
          try {
            await loadWorkspace();
            accepted.current = true;
            callSession.current = r.callSessionId;
            setMobilePane("thread");
            setHomeTab("chats");
            if (activeRoomId === r.roomKey && wsConnected)
              await handleStartOrAcceptCall();
            else {
              autoStartCallRoomRef.current = r.roomKey;
              setActiveRoomId(r.roomKey);
            }
          } catch (e: any) {
            report(e);
          }
        }}
        onEvent={(e) => {
          if (e.type === "conversation:changed" || e.type === "user:sync") {
            void refreshThreads().catch(report);
            return;
          }
          if (e.type === "workspace:changed") {
            void loadWorkspace().catch(report);
            if (e.roomId === activeRoomId)
              void request("/api/conversations/" + activeRoomId + "/messages")
                .then(setMessages)
                .catch(report);
            return;
          }
          if (
            e.callSessionId === callSession.current &&
            !e.partial &&
            ["call:declined", "call:cancelled", "call:missed"].includes(e.type)
          ) {
            sendWs({ type: "call:leave" });
            stopLocalAudio();
            callSession.current = null;
            setCallPhase("idle");
            void loadWorkspace().catch(report);
          }
        }}
      />
      {/* MOBILE BOTTOM 4-TAB NAVIGATION (Chats | Calls | List | First Name)    */}
      {/* Shown on all top-level views on mobile; hidden inside open chat thread */}
      {/* ===================================================================== */}
      {isMobileHomeView && (
        <nav
          aria-label="Mobile bottom navigation"
          className="lg:hidden grid grid-cols-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 shrink-0"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = homeTab === item.id;
            const isProfileTab = item.id === "profile";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setHomeTab(item.id);
                  if (item.id === "chats") setMobilePane("list");
                }}
                className={`relative flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  active
                    ? "text-blue-700 dark:text-blue-400"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                <span className="relative flex items-center justify-center">
                  {isProfileTab ? (
                    <Avatar
                      src={selfAvatar}
                      name={profile.name}
                      size="sm"
                      className={`w-5 h-5 text-[9px] ${
                        active
                          ? "ring-2 ring-blue-600 dark:ring-blue-400"
                          : "ring-1 ring-slate-300 dark:ring-slate-700"
                      }`}
                    />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-700 text-white text-[10px] font-mono tabular-nums flex items-center justify-center">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-1">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* ===================================================================== */}
      {/* FULL-SCREEN LOCKED CALL OVERLAY (Waiting / Incoming / Multi-Party)    */}
      {/* ===================================================================== */}
      {showCallOverlay && (
        <dialog ref={callDialog} aria-label="Sahva call" className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none bg-slate-950" onCancel={event => event.preventDefault()}>
        <CallOverlay
          photoFor={photoFor}
          roomId={activeRoomId}
          roomTitle={threadDisplayTitle}
          isCustomRoom={
            isCustomRoomServer || Boolean(activeThread.isCustomRoom)
          }
          selfId={selfId}
          callPhase={dialing ? "ringing" : callPhase}
          callerId={dialing ? selfId : callerId}
          selfParticipant={selfParticipant}
          participants={participants}
          fallbackPartnerName={
            activeThread.isCustomRoom ? undefined : threadDisplayTitle
          }
          fallbackPartnerLanguage={
            activeThread.isCustomRoom ? undefined : threadDisplayPartnerLanguage
          }
          fallbackPartnerLocation={
            activeThread.isCustomRoom || isViewingAsPartner
              ? undefined
              : activeThread.partnerLocation
          }
          selfAvatar={selfAvatar}
          partnerAvatar={threadDisplayAvatar}
          inCall={inCall}
          isJoiningCall={isJoiningCall}
          muted={muted}
          callElapsedSeconds={callElapsedSeconds}
          callError={callError}
          levels={levels}
          mixSettings={mixSettings}
          transcripts={transcripts}
          interimCaptions={interimCaptions}
          isGeneratingNotes={isGeneratingNotes}
          inviteUrl={inviteUrl}
          onAcceptIncomingCall={handleStartOrAcceptCall}
          onDeclineIncomingCall={handleDeclineIncomingCall}
          onEndCall={handleEndCall}
          onToggleMute={handleToggleMute}
          onUpdateMix={updateMix}
          onAddManualNote={handleAddManualNote}
          onDismissError={() => setCallError(null)}
        />
        </dialog>
      )}
    </div>
  );
}

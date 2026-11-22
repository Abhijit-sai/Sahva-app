import { useState, useRef, useEffect, type FormEvent } from "react";
import {
  Send,
  FileText,
  ArrowRight,
  Plus,
  Mic,
  Trash2,
  Loader2,
  X,
  Copy,
  Check,
  Users,
} from "lucide-react";
import Avatar from "./Avatar";
import AudioMessageBubble from "./AudioMessageBubble";
import { areSameLanguage } from "../data/languages";
import type {
  ChatMessage,
  MeetingNoteRecord,
  ParticipantInfo,
} from "../types";

interface ChatPanelProps {
  selfId: string;
  isCustomRoom: boolean;
  roomTitle: string;
  selfParticipant: ParticipantInfo;
  otherParticipants: ParticipantInfo[];
  fallbackPartnerName?: string;
  fallbackPartnerLanguage?: string;
  photoFor: (id?: string) => string | undefined;
  selfAvatar: string;
  partnerAvatar: string;
  inviteUrl: string;
  messages: ChatMessage[];
  notes: MeetingNoteRecord[];
  isSendingVoiceNote: boolean;
  voiceNoteError: string | null;
  onSendMessage: (text: string) => void;
  onSendVoiceNote: (blob: Blob, durationSeconds: number) => Promise<void>;
  onOpenNote: (noteId: string) => void;
  onDismissVoiceError: () => void;
}

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatRecTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ChatPanel({
  selfId,
  isCustomRoom,
  roomTitle,
  selfParticipant,
  otherParticipants,
  fallbackPartnerName,
  fallbackPartnerLanguage,
  photoFor,
  selfAvatar,
  partnerAvatar,
  inviteUrl,
  messages,
  notes,
  isSendingVoiceNote,
  voiceNoteError,
  onSendMessage,
  onSendVoiceNote,
  onOpenNote,
  onDismissVoiceError,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(
    null
  );

  const endRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingStartRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const myLang = selfParticipant.language;
  const targetLangDisplay =
    otherParticipants[0]?.language ||
    (!isCustomRoom ? fallbackPartnerLanguage : undefined) ||
    "recipient's language";
  const partnerNameDisplay =
    otherParticipants.length > 0
      ? otherParticipants.map((p) => p.name).join(", ")
      : isCustomRoom
      ? roomTitle
      : fallbackPartnerName || roomTitle;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setDraft("");
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2200);
    } catch {}
  };

  const cleanupRecorder = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const startVoiceRecording = async () => {
    setShowAttachMenu(false);
    setMicPermissionError(null);
    onDismissVoiceError();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      mediaRecorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start(250);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(
          Math.floor((Date.now() - recordingStartRef.current) / 1000)
        );
      }, 300);
    } catch (err: any) {
      cleanupRecorder();
      setMicPermissionError(
        err?.name === "NotAllowedError" ? "Allow microphone access in your device or site settings, then tap the microphone again." : err?.message ||
          "Could not access microphone. Please allow microphone permission to record voice notes."
      );
    }
  };

  const cancelVoiceRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {}
    }
    cleanupRecorder();
  };

  const stopAndSendVoiceRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      cleanupRecorder();
      return;
    }

    const durationSec = Math.max(
      1,
      Math.round((Date.now() - recordingStartRef.current) / 1000)
    );
    const mimeType = rec.mimeType || "audio/webm";

    rec.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      cleanupRecorder();
      if (blob.size > 0) {
        onSendVoiceNote(blob, durationSec);
      }
    };

    try {
      rec.stop();
    } catch {
      cleanupRecorder();
    }
  };

  const getLocalizedMessageText = (msg: ChatMessage) => {
    const entries = Object.entries(msg.translations || {});
    const match = entries.find(([lang]) => areSameLanguage(lang, myLang));
    if (match) return match[1];
    return msg.originalText;
  };

  const canSendText = Boolean(draft.trim()) && !isSendingVoiceNote;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3 max-w-sm mx-auto">
              {isCustomRoom && otherParticipants.length === 0 ? (
                <>
                  <div className="w-11 h-11 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/70 text-blue-700 dark:text-blue-400 flex items-center justify-center mx-auto">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Room &ldquo;{roomTitle}&rdquo; is empty
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      No one else has joined yet. Share the room link so 2 or more people from different language backgrounds can chat or start a live translated call together.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/70 rounded-lg transition-colors"
                  >
                    {copiedInvite ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {copiedInvite ? "Room link copied" : "Copy room invite link"}
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Start messaging or call {partnerNameDisplay}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Messages and voice notes are translated automatically into{" "}
                    {targetLangDisplay}.
                  </p>
                </>
              )}
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.kind === "call_summary") {
                const linkedNote = notes.find((n) => n.id === msg.noteId);
                const locNote =
                  linkedNote &&
                  (Object.entries(linkedNote.localized).find(([k]) =>
                    areSameLanguage(k, myLang)
                  )?.[1] ||
                    Object.values(linkedNote.localized)[0]);

                return (
                  <div
                    key={msg.id}
                    className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>Meeting Notes · {myLang}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatMessageTime(msg.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {locNote?.title || "Call Summary"}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {locNote?.summary || getLocalizedMessageText(msg)}
                      </p>
                      {locNote && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                          {locNote.todos.length} to-dos ·{" "}
                          {locNote.actionPoints.length} action points ·{" "}
                          {locNote.decisions.length} decisions
                        </p>
                      )}
                    </div>
                    {msg.noteId && (
                      <button
                        type="button"
                        onClick={() => onOpenNote(msg.noteId!)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-950/80 border border-blue-200/70 dark:border-blue-800/60 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                      >
                        <span>Open Notes</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              }

              const isSelf = msg.senderId
                ? msg.senderId === selfId ||
                  (msg.senderId === "host" &&
                    msg.senderName.toLowerCase() ===
                      selfParticipant.name.toLowerCase())
                : msg.senderName.toLowerCase() ===
                  selfParticipant.name.toLowerCase();

              const localizedText = getLocalizedMessageText(msg);
              const showOriginalSubtext =
                msg.kind === "text" &&
                !areSameLanguage(msg.sourceLanguage, myLang) &&
                msg.originalText !== localizedText;

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 sm:gap-3 ${
                    isSelf ? "flex-row-reverse" : ""
                  }`}
                >
                  <Avatar
                    src={
                      isSelf ? selfAvatar : photoFor(msg.senderId)
                    }
                    name={msg.senderName}
                    size="sm"
                    className="mt-0.5"
                  />
                  <div
                    className={`max-w-[84%] sm:max-w-[76%] space-y-1 ${
                      isSelf ? "items-end text-right" : "items-start text-left"
                    }`}
                  >
                    <div
                      className={`flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 ${
                        isSelf ? "justify-end" : ""
                      }`}
                    >
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {msg.senderName}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatMessageTime(msg.timestamp)}
                      </span>
                    </div>
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed text-left ${
                        isSelf
                          ? "bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/70 text-slate-800 dark:text-slate-100 rounded-tr-sm"
                          : "bg-blue-50 dark:bg-blue-950/55 border border-blue-200/80 dark:border-blue-800/70 text-slate-900 dark:text-slate-50 rounded-tl-sm"
                      }`}
                    >
                      {msg.kind === "audio" && msg.audio ? (
                        <AudioMessageBubble
                          message={msg}
                          isSelf={isSelf}
                          viewerLanguage={myLang}
                        />
                      ) : (
                        <>
                          <p>{localizedText}</p>
                          {showOriginalSubtext && (
                            <p
                              className={`mt-1.5 pt-1.5 text-xs border-t ${
                                isSelf
                                  ? "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                                  : "border-blue-200/70 dark:border-blue-800/60 text-slate-500 dark:text-blue-200/75"
                              }`}
                            >
                              Original ({msg.sourceLanguage}): {msg.originalText}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Inline Voice Note Status / Error */}
      {(isSendingVoiceNote || voiceNoteError || micPermissionError) && (
        <div className="px-4 sm:px-6 pt-2 bg-slate-50 dark:bg-slate-950 shrink-0">
          <div className="max-w-3xl mx-auto">
            {isSendingVoiceNote && (
              <div className="px-3.5 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 flex items-center gap-2 text-xs text-blue-800 dark:text-blue-200">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>
                  Transcribing and translating voice message into{" "}
                  {targetLangDisplay}...
                </span>
              </div>
            )}
            {(voiceNoteError || micPermissionError) && (
              <div className="px-3.5 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-2 text-xs text-red-800 dark:text-red-200">
                <span>{voiceNoteError || micPermissionError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMicPermissionError(null);
                    onDismissVoiceError();
                  }}
                  className="text-red-600 dark:text-red-400 hover:opacity-80 shrink-0"
                  aria-label="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WhatsApp / Teams Style Bottom Composer */}
      <div className="px-3.5 sm:px-6 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <div className="max-w-3xl mx-auto relative">
          {showAttachMenu && !isRecording && (
            <div className="absolute bottom-14 left-0 z-20 w-60 p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg">
              <button
                type="button"
                onClick={startVoiceRecording}
                disabled={isSendingVoiceNote}
                className="w-full px-3 py-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 text-left transition-colors disabled:opacity-50"
              >
                <span className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Record voice note
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Sent translated to {targetLangDisplay}
                  </p>
                </div>
              </button>
            </div>
          )}

          {isRecording ? (
            <div className="flex items-center gap-2.5 h-11 px-3 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60">
              <button
                type="button"
                onClick={cancelVoiceRecording}
                aria-label="Cancel voice recording"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="flex-1 flex items-center gap-2.5 min-w-0">
                <Mic className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <span className="text-xs font-mono tabular-nums font-semibold text-red-700 dark:text-red-300">
                  {formatRecTimer(recordingSeconds)}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400 truncate">
                  Recording {myLang} → {targetLangDisplay}
                </span>
              </div>

              <button
                type="button"
                onClick={stopAndSendVoiceRecording}
                aria-label="Send translated voice note"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAttachMenu((v) => !v)}
                disabled={isSendingVoiceNote}
                aria-label="Record audio or add attachment"
                aria-expanded={showAttachMenu}
                className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-colors shrink-0 ${
                  showAttachMenu
                    ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
                    : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Plus
                  className={`w-4 h-4 transition-transform duration-150 ${
                    showAttachMenu ? "rotate-45" : ""
                  }`}
                />
              </button>

              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setShowAttachMenu(false)}
                placeholder={`Type a message in ${myLang}...`}
                className="flex-1 h-10 px-3.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />

              <button
                type="submit"
                disabled={!canSendText}
                aria-label="Send message"
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                  canSendText
                    ? "bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

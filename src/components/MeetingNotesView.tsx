import {bridge,native} from "../lib/runtimeConfig";
import { useState, useRef, useEffect } from "react";
import {
  CheckSquare,
  Square,
  Copy,
  Check,
  Download,
  FileText,
  FilePlus2,
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
  Phone,
  Play,
  Pause,
  Volume2,
} from "lucide-react";
import { SUPPORTED_LANGUAGES, areSameLanguage } from "../data/languages";
import type { LocalizedMeetingNote, MeetingNoteRecord } from "../types";

interface MeetingNotesViewProps {
  notes: MeetingNoteRecord[];
  selectedNoteId: string | null;
  preferredLanguage: string;
  isGenerating: boolean;
  localizingLanguage: string | null;
  onSelectNote: (noteId: string) => void;
  onToggleTodo: (noteId: string, todoId: string, completed: boolean) => void;
  onLocalizeNote: (note: MeetingNoteRecord, targetLanguage: string) => void;
  onPrepareNoteAudio: (
    note: MeetingNoteRecord,
    targetLanguage: string,
    spokenText: string
  ) => Promise<string | null>;
  onGenerateFromCurrentSession: () => void;
  onStartCall: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "< 1 min";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

function formatPlaybackClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatParticipantsLine(note: MeetingNoteRecord): string {
  if (note.participants && note.participants.length > 0) {
    return note.participants
      .map((p) => `${p.name} (${p.language})`)
      .join(" · ");
  }
  if (note.speakerA.name === note.speakerB.name) {
    return `${note.speakerA.name} (${note.speakerA.language})`;
  }
  return `${note.speakerA.name} (${note.speakerA.language}) & ${note.speakerB.name} (${note.speakerB.language})`;
}

function formatLanguagesLine(note: MeetingNoteRecord): string {
  const langs: string[] = [];
  const list =
    note.participants && note.participants.length > 0
      ? note.participants
      : [note.speakerA, note.speakerB];
  for (const p of list) {
    if (p.language && !langs.some((l) => areSameLanguage(l, p.language))) {
      langs.push(p.language);
    }
  }
  return langs.join(" ↔ ");
}

function buildMarkdown(note: MeetingNoteRecord, loc: LocalizedMeetingNote): string {
  const lines: string[] = [
    `# ${loc.title}`,
    `Date: ${formatDate(note.createdAt)} | Language: ${loc.language}`,
    `Participants: ${formatParticipantsLine(note)}`,
    "",
    "## Summary",
    loc.summary,
    "",
  ];

  if (loc.constructiveToneHighlight) {
    lines.push("## Constructive Alignment", loc.constructiveToneHighlight, "");
  }

  if (loc.todos.length > 0) {
    lines.push("## To-Do Checklist");
    for (const td of loc.todos) {
      const done = Boolean(note.todoStates[td.id] ?? td.completed);
      lines.push(
        `- [${done ? "x" : " "}] ${td.task} — ${td.assignee} (${td.dueHint})`
      );
    }
    lines.push("");
  }

  if (loc.actionPoints.length > 0) {
    lines.push("## Constructive Action Points");
    for (const ap of loc.actionPoints) {
      lines.push(
        `- **${ap.title}** [${ap.priority}] — Owner: ${ap.owner} (${ap.timeframe})\n  ${ap.rationale}`
      );
    }
    lines.push("");
  }

  if (loc.decisions.length > 0) {
    lines.push("## Key Decisions");
    for (const d of loc.decisions) {
      lines.push(`- ${d}`);
    }
    lines.push("");
  }

  if (loc.openQuestions.length > 0) {
    lines.push("## Open Follow-Ups");
    for (const q of loc.openQuestions) {
      lines.push(`- ${q}`);
    }
    lines.push("");
  }

  if (note.transcripts.length > 0) {
    lines.push("## Call Transcript");
    for (const t of note.transcripts) {
      lines.push(
        `- **${t.speakerName}** (${t.sourceLanguage}): ${t.originalText}` +
          (t.translatedText && t.translatedText !== t.originalText
            ? ` / (${t.targetLanguage}): ${t.translatedText}`
            : "")
      );
    }
  }

  return lines.join("\n");
}

export default function MeetingNotesView({
  notes,
  selectedNoteId,
  preferredLanguage,
  isGenerating,
  localizingLanguage,
  onSelectNote,
  onToggleTodo,
  onLocalizeNote,
  onPrepareNoteAudio,
  onGenerateFromCurrentSession,
  onStartCall,
}: MeetingNotesViewProps) {
  const [viewLangOverride, setViewLangOverride] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  // Full call recording playback state (shared between Summary & Transcript play buttons)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const selectedNote =
    notes.find((n) => n.id === selectedNoteId) || notes[0] || null;

  useEffect(() => {
    setIsPlayingRecording(false);
    setIsPreparingAudio(false);
    setRecordingTime(0);
    setRecordingDuration(selectedNote?.durationSeconds || 0);
    setRecordingError(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [selectedNote?.id, selectedNote?.recordingUrl, selectedNote?.durationSeconds]);

  const desiredLanguage = viewLangOverride || preferredLanguage;

  const resolveLocalizedNote = (
    note: MeetingNoteRecord
  ): LocalizedMeetingNote | null => {
    const keys = Object.keys(note.localized);
    if (keys.length === 0) return null;
    const match = keys.find((k) => areSameLanguage(k, desiredLanguage));
    if (match) return note.localized[match];
    const prefMatch = keys.find((k) => areSameLanguage(k, preferredLanguage));
    if (prefMatch) return note.localized[prefMatch];
    return note.localized[keys[0]];
  };

  const activeLocalized = selectedNote
    ? resolveLocalizedNote(selectedNote)
    : null;

  const ensureAudioReady = async (): Promise<string | null> => {
    if (!selectedNote) return null;
    if (selectedNote.recordingUrl && !audioRef.current?.error) return selectedNote.recordingUrl;
    const spokenText = [
      activeLocalized?.title,
      activeLocalized?.summary,
      activeLocalized?.constructiveToneHighlight,
    ]
      .filter(Boolean)
      .join(". ");
    if (!spokenText) return null;

    setIsPreparingAudio(true);
    setRecordingError(null);
    try {
      const url = await onPrepareNoteAudio(
        selectedNote,
        activeLocalized?.language || desiredLanguage,
        spokenText
      );
      if (!url) {
        setRecordingError("Could not prepare audio playback.");
      }
      return url;
    } finally {
      setIsPreparingAudio(false);
    }
  };

  const toggleRecordingPlayback = async () => {
    if (!selectedNote || isPreparingAudio) return;
    setRecordingError(null);

    if (isPlayingRecording && audioRef.current) {
      audioRef.current.pause();
      setIsPlayingRecording(false);
      return;
    }

    const url = await ensureAudioReady();
    if (!url) return;

    // Wait a tick for <audio src={url}> to attach if it was just prepared
    setTimeout(async () => {
      const el = audioRef.current;
      if (!el) return;
      if (el.src !== new URL(url, window.location.origin).href) {
        el.src = url;
      }
      try {
        await el.play();
        setIsPlayingRecording(true);
      } catch {
        setRecordingError("Playback could not start. Click Play again or Download.");
        setIsPlayingRecording(false);
      }
    }, 60);
  };

  const handleDownloadRecording = async () => {
    if (!selectedNote || isPreparingAudio) return;
    const url = await ensureAudioReady();
    if (!url) return;
    if(native){await bridge.downloadRecording({url}).catch(()=>setRecordingError("Could not download recording."));return}
    const a = document.createElement("a");
    try {
      const response=await fetch(url);
      if(!response.ok)throw new Error();
      a.href=URL.createObjectURL(await response.blob());
    }catch{setRecordingError("Could not download the recording. Try again.");return}
    a.download = `call-recording-${selectedNote.roomId}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(a.href),60000);
  };

  const handleSeekRecording = (nextSec: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = nextSec;
    setRecordingTime(nextSec);
  };

  const isExactLanguageAvailable =
    selectedNote &&
    Object.keys(selectedNote.localized).some((k) =>
      areSameLanguage(k, desiredLanguage)
    );

  const handleLanguageChange = (newLang: string) => {
    setViewLangOverride(newLang);
    if (
      selectedNote &&
      !Object.keys(selectedNote.localized).some((k) =>
        areSameLanguage(k, newLang)
      )
    ) {
      onLocalizeNote(selectedNote, newLang);
    }
  };

  const handleCopyMarkdown = async () => {
    if (!selectedNote || !activeLocalized) return;
    try {
      await navigator.clipboard.writeText(
        buildMarkdown(selectedNote, activeLocalized)
      );
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    } catch {}
  };

  const handleDownloadMarkdown = () => {
    if (!selectedNote || !activeLocalized) return;
    const md = buildMarkdown(selectedNote, activeLocalized);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url;
    a.download = `meeting-notes-${selectedNote.roomId}-${activeLocalized.language
      .toLowerCase()
      .replace(/\s+/g, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (notes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-5 sm:p-8 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mx-auto text-slate-600 dark:text-slate-400">
            <FileText className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              No meeting notes yet
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Every translated call automatically creates a constructive summary, shared to-do checklist, and action points in each participant&apos;s comfortable language ({preferredLanguage}).
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 w-full max-w-xs sm:max-w-none mx-auto pt-2">
            <button
              type="button"
              onClick={onStartCall}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
            >
              <Phone className="w-4 h-4 shrink-0" />
              <span>Start Translated Call</span>
            </button>
            <button
              type="button"
              onClick={onGenerateFromCurrentSession}
              disabled={isGenerating}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/70 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <FilePlus2 className="w-4 h-4 shrink-0" />
              )}
              <span>Summarize Chat</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col xl:flex-row min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Compact Prominent Note Switcher Bar (below xl viewports) */}
      <div className="xl:hidden px-4 sm:px-6 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5 shrink-0">
        <select
          aria-label="Select meeting note"
          value={selectedNote?.id || ""}
          onChange={(e) => {
            onSelectNote(e.target.value);
            setShowTranscript(false);
          }}
          className="min-w-0 flex-1 h-9 px-3 text-sm font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 truncate"
        >
          {notes.map((n) => {
            const loc = resolveLocalizedNote(n);
            return (
              <option
                key={n.id}
                value={n.id}
                className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                {loc?.title || "Call Notes"} · {formatDate(n.createdAt)}
              </option>
            );
          })}
        </select>

        <button
          type="button"
          onClick={onGenerateFromCurrentSession}
          disabled={isGenerating}
          title="Create a new meeting note summarizing the latest chat and call messages"
          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/70 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          {isGenerating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <FilePlus2 className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{isGenerating ? "Saving..." : "Summarize Chat"}</span>
        </button>
      </div>

      {/* Notes History Sidebar (xl+ desktop viewports) */}
      <aside className="w-68 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col shrink-0 hidden xl:flex">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            All Notes ({notes.length})
          </h3>
          <button
            type="button"
            onClick={onGenerateFromCurrentSession}
            disabled={isGenerating}
            title="Summarize recent chat & call messages into a new meeting note"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/70 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            ) : (
              <FilePlus2 className="w-3 h-3 shrink-0" />
            )}
            <span>{isGenerating ? "Saving..." : "Summarize Chat"}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
          {notes.map((n) => {
            const loc = resolveLocalizedNote(n);
            const active = selectedNote?.id === n.id;
            const totalTodos = loc?.todos.length || 0;
            const doneTodos = (loc?.todos || []).filter((t) =>
              Boolean(n.todoStates[t.id] ?? t.completed)
            ).length;

            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  onSelectNote(n.id);
                  setShowTranscript(false);
                }}
                className={`w-full text-left px-4 py-3.5 transition-colors ${
                  active
                    ? "bg-slate-100 dark:bg-slate-800/80"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                }`}
              >
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                  {loc?.title || "Call Notes"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                  {formatDate(n.createdAt)} · {formatDuration(n.durationSeconds)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                  <span className="font-mono">{formatLanguagesLine(n)}</span> · {doneTodos}/{totalTodos} to-dos
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Selected Note Detail Viewport */}
      {selectedNote && activeLocalized && (
        <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-3xl mx-auto space-y-6 sm:space-y-7">
            {/* Header + Language Localization Control */}
            <div className="flex flex-col gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>{formatDate(selectedNote.createdAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDuration(selectedNote.durationSeconds)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans">
                    {formatParticipantsLine(selectedNote)}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight leading-snug text-balance">
                  {activeLocalized.title}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 max-w-full min-w-0">
                  <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <select
                    aria-label="Reading language for meeting notes"
                    value={desiredLanguage}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="text-xs font-medium bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none min-w-0 truncate"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option
                        key={l.code}
                        value={l.name}
                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      >
                        {l.name} ({l.nativeName})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  {copiedMd ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedMd ? "Copied" : "Copy"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export .md</span>
                </button>
              </div>
            </div>

            {localizingLanguage && (
              <div className="px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-center gap-2.5 text-xs text-blue-800 dark:text-blue-200">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>
                  Localizing summary, action points, and to-dos into{" "}
                  {localizingLanguage}...
                </span>
              </div>
            )}

            {!isExactLanguageAvailable && !localizingLanguage && (
              <div className="px-4 py-3 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span>
                  Showing {activeLocalized.language} edition. Translate into{" "}
                  {desiredLanguage}?
                </span>
                <button
                  type="button"
                  onClick={() => onLocalizeNote(selectedNote, desiredLanguage)}
                  className="font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  Translate to {desiredLanguage}
                </button>
              </div>
            )}

            {/* Shared audio element for Call Recording / Audio Summary */}
            <audio
              ref={audioRef}
              src={selectedNote.recordingUrl || undefined}
              preload="metadata"
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setRecordingDuration(d);
              }}
              onTimeUpdate={(e) => setRecordingTime(e.currentTarget.currentTime)}
              onEnded={() => {
                setIsPlayingRecording(false);
                setRecordingTime(0);
              }}
              onError={() => {
                if (selectedNote.recordingUrl) {
                  setIsPlayingRecording(false);
                }
              }}
            />

            {/* Executive Summary & Always-Visible Call Recording Playback + Download Bar */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Meeting Summary
                </h2>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleRecordingPlayback}
                  disabled={isPreparingAudio}
                  aria-label={
                    isPlayingRecording
                      ? "Pause call recording"
                      : "Play call recording"
                  }
                  className="w-9 h-9 rounded-full bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 text-white flex items-center justify-center shrink-0 transition-colors"
                >
                  {isPreparingAudio ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isPlayingRecording ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" />
                  )}
                </button>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 truncate">
                      <Volume2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>
                        {isPreparingAudio
                          ? "Preparing audio..."
                          : selectedNote.recordingUrl
                          ? "Full call recording"
                          : "Call audio playback"}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                      {formatPlaybackClock(recordingTime)} /{" "}
                      {formatPlaybackClock(
                        recordingDuration || selectedNote.durationSeconds
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(
                      1,
                      recordingDuration || selectedNote.durationSeconds || 1
                    )}
                    step={0.2}
                    disabled={!selectedNote.recordingUrl}
                    value={Math.min(
                      recordingTime,
                      recordingDuration || selectedNote.durationSeconds || 1
                    )}
                    onChange={(e) => handleSeekRecording(Number(e.target.value))}
                    aria-label="Seek call recording"
                    className="w-full mixer-slider disabled:opacity-45"
                  />
                  {recordingError && (
                    <p className="text-[11px] text-red-600 dark:text-red-400">
                      {recordingError}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleDownloadRecording}
                  disabled={isPreparingAudio}
                  title="Download audio recording (.wav)"
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 shrink-0 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </button>
              </div>

              <p className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed">
                {activeLocalized.summary}
              </p>
              {activeLocalized.constructiveToneHighlight && (
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Constructive takeaway
                  </p>
                  <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed">
                    {activeLocalized.constructiveToneHighlight}
                  </p>
                </div>
              )}
            </section>

            {/* Synced To-Do Checklist */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Shared To-Do List
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {
                    activeLocalized.todos.filter((t) =>
                      Boolean(selectedNote.todoStates[t.id] ?? t.completed)
                    ).length
                  }
                  /{activeLocalized.todos.length} completed
                </span>
              </div>

              {activeLocalized.todos.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No to-dos extracted from this session.
                </p>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                  {activeLocalized.todos.map((todo) => {
                    const checked = Boolean(
                      selectedNote.todoStates[todo.id] ?? todo.completed
                    );
                    return (
                      <button
                        key={todo.id}
                        type="button"
                        onClick={() =>
                          onToggleTodo(selectedNote.id, todo.id, !checked)
                        }
                        className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm leading-snug ${
                              checked
                                ? "line-through text-slate-400 dark:text-slate-500"
                                : "text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            {todo.task}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {todo.assignee} · {todo.dueHint}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Constructive Action Points */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Constructive Action Points
              </h2>
              {activeLocalized.actionPoints.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No action points recorded.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeLocalized.actionPoints.map((ap) => (
                    <div
                      key={ap.id}
                      className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="truncate">
                          {ap.owner} · {ap.timeframe}
                        </span>
                        <span
                          className={`font-medium shrink-0 ${
                            ap.priority === "High"
                              ? "text-red-700 dark:text-red-400"
                              : ap.priority === "Medium"
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {ap.priority}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {ap.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {ap.rationale}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Key Decisions & Open Follow-ups */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <section className="space-y-2.5">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Key Decisions
                </h2>
                {activeLocalized.decisions.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No explicit decisions logged.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 list-disc pl-5">
                    {activeLocalized.decisions.map((d, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2.5">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Open Follow-Ups
                </h2>
                {activeLocalized.openQuestions.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No unresolved questions noted.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 list-disc pl-5">
                    {activeLocalized.openQuestions.map((q, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {q}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Expandable Full Call Transcript + Inline Play Button */}
            <section className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2 py-1">
                <button
                  type="button"
                  onClick={() => setShowTranscript((prev) => !prev)}
                  className="flex items-center gap-2 py-1 text-left text-sm font-semibold text-slate-900 dark:text-slate-100 min-w-0"
                >
                  <span className="truncate">
                    Full Call Transcript ({selectedNote.transcripts.length} turns)
                  </span>
                  {showTranscript ? (
                    <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleRecordingPlayback}
                  disabled={isPreparingAudio}
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/70 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {isPreparingAudio ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isPlayingRecording ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isPreparingAudio
                      ? "Loading..."
                      : isPlayingRecording
                      ? "Pause audio"
                      : "Play recording"}
                  </span>
                </button>
              </div>

              {showTranscript && (
                <div className="mt-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  {selectedNote.transcripts.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Notes were generated from the chat conversation context.
                    </p>
                  ) : (
                    selectedNote.transcripts.map((t) => {
                      const localizedLine =
                        t.translations &&
                        Object.entries(t.translations).find(([lang]) =>
                          areSameLanguage(lang, desiredLanguage)
                        )?.[1];
                      const primaryLine =
                        localizedLine ||
                        (areSameLanguage(t.targetLanguage, desiredLanguage)
                          ? t.translatedText
                          : t.originalText);

                      return (
                        <div
                          key={t.id}
                          className="pb-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0 last:pb-0 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                              {t.speakerName} ({t.sourceLanguage})
                            </span>
                            <span className="font-mono tabular-nums shrink-0">
                              {formatDate(t.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-900 dark:text-slate-100">
                            {primaryLine}
                          </p>
                          {t.originalText && t.originalText !== primaryLine && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t.sourceLanguage}: {t.originalText}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

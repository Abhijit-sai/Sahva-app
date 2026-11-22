import {native,bridge} from "../lib/runtimeConfig";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { motion } from "motion/react";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Copy,
  Check,
  ExternalLink,
  Sliders,
  Send,
  AlertCircle,
  Loader2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Avatar from "./Avatar";
import AudioTrackMeter from "./AudioTrackMeter";
import { areSameLanguage } from "../data/languages";
import { getAvatarForName } from "../data/conversations";
import type { AudioMeterLevels } from "../services/callAudioEngine";
import type {
  AudioMixSettings,
  CallPhase,
  InterimCaption,
  ParticipantInfo,
  TranscriptEntry,
} from "../types";

interface CallOverlayProps {
  roomId: string;
  roomTitle: string;
  isCustomRoom: boolean;
  selfId: string;
  callPhase: CallPhase;
  callerId: string | null;
  selfParticipant: ParticipantInfo;
  participants: ParticipantInfo[];
  fallbackPartnerName?: string;
  fallbackPartnerLanguage?: string;
  fallbackPartnerLocation?: string;
  selfAvatar: string;
  partnerAvatar: string;
  inCall: boolean;
  isJoiningCall: boolean;
  muted: boolean;
  callElapsedSeconds: number;
  callError: string | null;
  levels: AudioMeterLevels;
  mixSettings: AudioMixSettings;
  transcripts: TranscriptEntry[];
  interimCaptions: Record<string, InterimCaption>;
  isGeneratingNotes: boolean;
  inviteUrl: string;
  onAcceptIncomingCall: () => void;
  onDeclineIncomingCall: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onUpdateMix: (next: AudioMixSettings) => void;
  onAddManualNote: (text: string) => void;
  onDismissError: () => void;
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function CallOverlay({
  roomTitle,
  isCustomRoom,
  selfId,
  callPhase,
  callerId,
  selfParticipant,
  participants,
  fallbackPartnerName,
  fallbackPartnerLanguage,
  fallbackPartnerLocation,
  selfAvatar,
  partnerAvatar,
  inCall,
  isJoiningCall,
  muted,
  callElapsedSeconds,
  callError,
  levels,
  mixSettings,
  transcripts,
  interimCaptions,
  isGeneratingNotes,
  inviteUrl,
  onAcceptIncomingCall,
  onDeclineIncomingCall,
  onEndCall,
  onToggleMute,
  onUpdateMix,
  onAddManualNote,
  onDismissError,
}: CallOverlayProps) {
  const [speaker,setSpeaker]=useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showAudioPopover, setShowAudioPopover] = useState(false);
  const [quickNote, setQuickNote] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const myLang = selfParticipant.language;
  const activeCallParticipants = participants.filter((p) => p.inCall);
  const otherCallParticipants = activeCallParticipants.filter(
    (p) => p.id !== selfId
  );
  const caller = participants.find((p) => p.id === callerId);

  const isIncomingInvite =
    (callPhase === "ringing" || callPhase === "active") &&
    !inCall &&
    callerId !== selfId;
  const isOutgoingWaiting =
    callPhase === "ringing" && (inCall || callerId === selfId);
  const isLiveStage = callPhase === "active" && inCall;

  const uniqueLanguages: string[] = [];
  for (const p of activeCallParticipants.length > 0
    ? activeCallParticipants
    : [selfParticipant]) {
    if (!uniqueLanguages.some((l) => areSameLanguage(l, p.language))) {
      uniqueLanguages.push(p.language);
    }
  }

  const captionList = Object.values(interimCaptions).filter(
    (c): c is InterimCaption => Boolean(c && (c.originalText || c.translatedText))
  );

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts.length, captionList.length]);

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2400);
    } catch {}
  };

  const handleManualNoteSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = quickNote.trim();
    if (!trimmed) return;
    onAddManualNote(trimmed);
    setQuickNote("");
  };

  const originalPct = mixSettings.muteOriginal
    ? 0
    : Math.round(mixSettings.duckLevel * 100);
  const translatedPct = Math.round(mixSettings.translatedVolume * 100);

  const displayPreferredText = (entry: {
    sourceLanguage: string;
    targetLanguage: string;
    originalText: string;
    translatedText: string;
    translations?: Record<string, string>;
  }) => {
    if (areSameLanguage(entry.sourceLanguage, myLang)) {
      const otherTranslation = entry.translations
        ? Object.entries(entry.translations).find(
            ([lang]) => !areSameLanguage(lang, myLang)
          )
        : undefined;
      return {
        primary: entry.originalText,
        secondary:
          otherTranslation?.[1] ||
          (entry.translatedText !== entry.originalText
            ? entry.translatedText
            : ""),
        secondaryLang: otherTranslation?.[0] || entry.targetLanguage,
      };
    }

    const myTranslation = entry.translations
      ? Object.entries(entry.translations).find(([lang]) =>
          areSameLanguage(lang, myLang)
        )?.[1]
      : undefined;

    const primary = myTranslation || entry.translatedText || entry.originalText;
    return {
      primary,
      secondary: entry.originalText !== primary ? entry.originalText : "",
      secondaryLang: entry.sourceLanguage,
    };
  };

  // ============================================================================
  // RINGING / WAITING / INCOMING OVERLAY
  // ============================================================================
  if (isOutgoingWaiting || isIncomingInvite) {
    const waitingDisplayName = isCustomRoom
      ? roomTitle
      : fallbackPartnerName || roomTitle;

    const remotePerson =
      caller || activeCallParticipants.find((p) => p.id !== selfId);
    const incomingPairLabel = (() => {
      if (isCustomRoom) {
        return `${activeCallParticipants.length || 1} in room`;
      }
      if (isIncomingInvite) {
        const remoteLang = remotePerson?.language;
        if (remoteLang && !areSameLanguage(remoteLang, myLang)) {
          return `${remoteLang} ↔ ${myLang}`;
        }
        return remoteLang || myLang;
      }
      if (
        fallbackPartnerLanguage &&
        !areSameLanguage(fallbackPartnerLanguage, myLang)
      ) {
        return `${myLang} ↔ ${fallbackPartnerLanguage}`;
      }
      return myLang;
    })();

    const ringAvatarName = isIncomingInvite
      ? caller?.name || roomTitle
      : waitingDisplayName;
    const ringAvatarSrc =
      getAvatarForName(ringAvatarName) ||
      (isIncomingInvite ? selfAvatar : partnerAvatar);

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          isIncomingInvite
            ? `Incoming call in ${roomTitle}`
            : `Waiting for participants in ${waitingDisplayName}`
        }
        className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md text-slate-100 flex flex-col items-center justify-between p-6 sm:p-10"
      >
        <div className="w-full max-w-xl flex items-center justify-between text-xs text-slate-400">
          <span>Sahva Live Call</span>
          <span className="font-mono">{incomingPairLabel}</span>
        </div>

        <div className="flex flex-col items-center text-center space-y-6 max-w-md w-full my-auto">
          <div className="relative flex items-center justify-center w-36 h-36">
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-blue-500/50"
              animate={{ scale: [1, 1.55], opacity: [0.65, 0] }}
              transition={{ duration: 2.1, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-blue-400/40"
              animate={{ scale: [1, 1.35], opacity: [0.55, 0] }}
              transition={{
                duration: 2.1,
                delay: 0.7,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
            {isCustomRoom ? (
              <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center relative z-10 text-blue-400">
                <Users className="w-10 h-10" />
              </div>
            ) : (
              <Avatar
                src={ringAvatarSrc}
                name={ringAvatarName}
                size="lg"
                className="w-24 h-24 text-2xl relative z-10 ring-2 ring-slate-700"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <h2 className="font-display text-2xl font-bold text-white tracking-tight">
              {isIncomingInvite
                ? callPhase === "active"
                  ? `Join ${roomTitle}`
                  : `${caller?.name || roomTitle} is calling`
                : isCustomRoom
                ? `Waiting in ${roomTitle}...`
                : `Calling ${waitingDisplayName}...`}
            </h2>
            <p className="text-sm text-slate-400">
              {isIncomingInvite
                ? activeCallParticipants.length > 0
                  ? activeCallParticipants
                      .map((p) => `${p.name} (${p.language})`)
                      .join(" · ")
                  : `Your language: ${myLang}`
                : isCustomRoom
                ? `No one else has joined yet · Your language: ${myLang}`
                : `${fallbackPartnerLanguage || ""}${
                    fallbackPartnerLocation ? ` · ${fallbackPartnerLocation}` : ""
                  }`}
            </p>
            <p className="text-xs text-slate-400 pt-1 leading-relaxed">
              {isIncomingInvite
                ? `Answer to hear everyone translated live into ${myLang} over their voice.`
                : `Share the invite link below. Live multi-language translation starts automatically once at least one other person joins.`}
            </p>
          </div>

          {callError && (
            <div className="w-full px-4 py-2.5 rounded-lg bg-red-950/70 border border-red-800/80 text-xs text-red-200 flex items-center justify-between gap-2 text-left">
              <span>{callError}</span>
              <button
                type="button"
                onClick={onDismissError}
                className="underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {isOutgoingWaiting && inviteUrl && (
            <div className="w-full p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-left">
              <p className="text-xs text-slate-300 leading-relaxed">
                {isCustomRoom
                  ? "Invite anyone — multiple people from different language backgrounds can join this same link:"
                  : `Open this link on another device or tab to join as ${waitingDisplayName} (or invite additional speakers):`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-3.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
                >
                  {copiedLink ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedLink ? "Invite link copied" : "Copy invite link"}</span>
                </button>
                <a
                  href={inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open tab</span>
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 pt-4">
          {isIncomingInvite ? (
            <>
              <button
                type="button"
                onClick={onDeclineIncomingCall}
                className="inline-flex items-center gap-2 h-12 px-6 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-full transition-colors whitespace-nowrap"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Decline</span>
              </button>
              <button
                type="button"
                onClick={onAcceptIncomingCall}
                disabled={isJoiningCall}
                className="inline-flex items-center gap-2 h-12 px-7 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 rounded-full transition-colors whitespace-nowrap"
              >
                {isJoiningCall ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Phone className="w-4 h-4" />
                )}
                <span>{isJoiningCall ? "Connecting..." : "Join Call"}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onEndCall}
              className="inline-flex items-center gap-2 h-12 px-7 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-full transition-colors whitespace-nowrap"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Cancel Call</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // ACTIVE CALL STAGE (Clean mobile-first layout — Audio Mix tucked in bottom popup!)
  // ============================================================================
  if (!isLiveStage) return null;

  const activeHeaderTitle =
    otherCallParticipants.length === 1
      ? otherCallParticipants[0].name
      : `${roomTitle} (${activeCallParticipants.length})`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Live translated call: ${activeHeaderTitle}`}
      className="fixed inset-0 z-50 flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      {/* Top Active Call Bar */}
      <header className="h-15 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {otherCallParticipants.length === 1 ? (
            <Avatar
              src={getAvatarForName(otherCallParticipants[0].name) || undefined}
              name={otherCallParticipants[0].name}
              size="sm"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-400 shrink-0">
              <Users className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {activeHeaderTitle}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {uniqueLanguages.join(" ↔ ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-xs font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
            {formatDuration(callElapsedSeconds)}
          </span>
          <button
            type="button"
            onClick={handleCopyInvite}
            title="Copy room invite link to add another speaker"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/70 rounded-lg transition-colors whitespace-nowrap"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <UserPlus className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {copiedLink ? "Link copied" : "Add person"}
            </span>
          </button>
        </div>
      </header>

      {/* Error Notice */}
      {callError && (
        <div className="mx-4 sm:mx-6 mt-3 px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 flex items-center justify-between gap-3 text-xs text-red-800 dark:text-red-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            <span className="truncate">{callError}</span>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            className="text-xs font-medium underline hover:no-underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Active Call Body: Compact Multi-Participant Strip + Prominent Live Transcript */}
      <div className="flex-1 min-h-0 flex flex-col max-w-4xl w-full mx-auto p-4 sm:p-6 gap-4 overflow-hidden">
        {/* Compact Participant Presence Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 shrink-0">
          {activeCallParticipants.map((person) => {
            const isSelf = person.id === selfId;
            return (
              <div
                key={person.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar
                    src={getAvatarForName(person.name) || undefined}
                    name={person.name}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {person.name}
                      {isSelf ? " (You)" : ""}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {person.language}
                      {isSelf
                        ? muted
                          ? " · Muted"
                          : " · Outbound"
                        : person.muted
                        ? " · Muted"
                        : ` → ${myLang}`}
                    </p>
                  </div>
                </div>
                <AudioTrackMeter
                  level={
                    isSelf
                      ? levels.micLevel
                      : person.speaking
                      ? Math.max(levels.translatedInLevel, 0.45)
                      : levels.originalInLevel
                  }
                  active={isSelf ? !muted : !person.muted && person.speaking}
                  tone={isSelf ? "blue" : "emerald"}
                  barCount={6}
                />
              </div>
            );
          })}
        </section>

        {/* Full-Height Live Transcription & Translation Feed */}
        <section className="flex-1 min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                Live Transcription &amp; Translation
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Auto-saved as Meeting Notes in {myLang} when you hang up
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
              {transcripts.length} turns
            </span>
          </div>

          <div className="flex-1 min-h-0 p-4 overflow-y-auto space-y-3.5">
            {transcripts.length === 0 && captionList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8 space-y-1.5">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Live channels connected — speak naturally in {myLang}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                  Everyone hears each other translated into their comfortable language with zero self-echo.
                </p>
              </div>
            ) : (
              <>
                {transcripts.map((entry) => {
                  const view = displayPreferredText(entry);
                  const isSelf = entry.speakerId === selfId;
                  return (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-1 pb-3 border-b border-slate-100 dark:border-slate-800/80 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span
                          className={`font-medium ${
                            isSelf
                              ? "text-blue-700 dark:text-blue-400"
                              : "text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {entry.speakerName} ({entry.sourceLanguage})
                        </span>
                        <span className="font-mono tabular-nums shrink-0">
                          {formatClock(entry.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed">
                        {view.primary}
                      </p>
                      {view.secondary && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {view.secondaryLang}: {view.secondary}
                        </p>
                      )}
                    </div>
                  );
                })}

                {captionList.map((cap) => {
                  const view = displayPreferredText(cap);
                  return (
                    <div
                      key={`interim-${cap.speakerId}`}
                      className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1"
                    >
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {cap.speakerName}
                        </span>{" "}
                        · Translating live...
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {view.primary}
                      </p>
                      {view.secondary && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {view.secondaryLang}: {view.secondary}
                        </p>
                      )}
                    </div>
                  );
                })}
              </>
            )}
            <div ref={transcriptEndRef} />
          </div>

          <form
            onSubmit={handleManualNoteSubmit}
            className="px-3.5 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder={`Pin a note or decision in ${myLang}...`}
              className="flex-1 h-9 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={!quickNote.trim()}
              aria-label="Log note to transcript"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </section>
      </div>

      {/* Collapsible Audio Mix Popover (tucked neatly above bottom bar) */}
      {showAudioPopover && (
        <div className="px-4 pb-2 flex justify-center shrink-0">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-lg p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Stacked Audio Mix
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Defaults can also be configured in Profile
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateMix({
                      ...mixSettings,
                      muteOriginal: !mixSettings.muteOriginal,
                    })
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md"
                >
                  {mixSettings.muteOriginal ? (
                    <VolumeX className="w-3 h-3" />
                  ) : (
                    <Volume2 className="w-3 h-3" />
                  )}
                  <span>{mixSettings.muteOriginal ? "Orig off" : "Orig on"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAudioPopover(false)}
                  aria-label="Close audio mix"
                  className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Translated voice ({myLang})
                  </span>
                  <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {translatedPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={125}
                  step={5}
                  value={translatedPct}
                  onChange={(e) =>
                    onUpdateMix({
                      ...mixSettings,
                      translatedVolume: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full mixer-slider"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Original speaker voice bed
                  </span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {originalPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={originalPct}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onUpdateMix({
                      ...mixSettings,
                      muteOriginal: val === 0,
                      duckLevel: val / 100,
                    });
                  }}
                  className="w-full mixer-slider"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() =>
                  onUpdateMix({
                    autoDuck: false,
                    duckLevel: 0.15,
                    originalIdleLevel: 0.45,
                    translatedVolume: 1.0,
                    muteOriginal: false,
                  })
                }
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  !mixSettings.muteOriginal
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 font-medium"
                    : "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                100% / 15% Stack
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateMix({
                    ...mixSettings,
                    autoDuck: false,
                    muteOriginal: true,
                    translatedVolume: 1.0,
                  })
                }
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  mixSettings.muteOriginal
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 font-medium"
                    : "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Translated Only
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Locked Call Controls Bar */}
      <footer className="px-4 sm:px-6 py-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2.5 sm:gap-3.5 shrink-0">
        {native&&<button className="rounded-full border px-3 py-2" aria-pressed={speaker} onClick={()=>bridge.setSpeakerphone({enabled:!speaker}).then(()=>setSpeaker(!speaker))}>{speaker?"Speaker on":"Earpiece"}</button>}
        <button
          type="button"
          onClick={onToggleMute}
          className={`inline-flex items-center gap-2 h-11 px-4 sm:px-5 text-sm font-medium rounded-full border transition-colors whitespace-nowrap ${
            muted
              ? "bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300"
              : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          {muted ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
          <span className="hidden xs:inline sm:inline">
            {muted ? "Unmute" : "Mute"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowAudioPopover((v) => !v)}
          aria-expanded={showAudioPopover}
          className={`inline-flex items-center gap-2 h-11 px-4 text-sm font-medium rounded-full border transition-colors whitespace-nowrap ${
            showAudioPopover
              ? "bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
              : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          <Sliders className="w-4 h-4 shrink-0" />
          <span className="font-mono text-xs tabular-nums">
            {translatedPct}% / {originalPct}%
          </span>
        </button>

        <button
          type="button"
          onClick={onEndCall}
          disabled={isGeneratingNotes}
          className="inline-flex items-center gap-2 h-11 px-5 sm:px-6 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-full transition-colors whitespace-nowrap"
        >
          {isGeneratingNotes ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PhoneOff className="w-4 h-4" />
          )}
          <span>
            {isGeneratingNotes ? "Saving Notes..." : "End Call"}
          </span>
        </button>
      </footer>
    </div>
  );
}

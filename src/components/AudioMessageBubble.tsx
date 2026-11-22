import { apiFetch } from "../lib/runtimeConfig";
import { useState, useRef, useEffect } from "react";
import { Play, Pause, FileText, Volume2, Loader2 } from "lucide-react";
import { areSameLanguage } from "../data/languages";
import type { ChatMessage } from "../types";

interface AudioMessageBubbleProps {
  message: ChatMessage;
  isSelf: boolean;
  viewerLanguage: string;
}

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function InlineClipPlayer({
  src,
  label,
  fallbackDuration,
  mediaKey,
  accent,
}: {
  src: string;
  mediaKey?: string;
  label: string;
  fallbackDuration: number;
  accent: "blue" | "slate";
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration || 0);

  const clip = useRef<string | undefined>(undefined);
  const pending = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = audioRef.current;
    setLoading(false);
    setError("");
    setPlaying(false);
    setCurrentTime(0);
    setDuration(fallbackDuration || 0);
    return () => {
      pending.current?.abort();
      pending.current = null;
      el?.pause();
      el?.removeAttribute("src");
      el?.load();
      if (clip.current) URL.revokeObjectURL(clip.current);
      clip.current = undefined;
    };
  }, [mediaKey || src, fallbackDuration]);

  async function togglePlay() {
    const el = audioRef.current;
    if (!el || pending.current) return;
    if (!el.paused) { el.pause(); return; }
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      if (mediaKey && !clip.current) {
        const path = mediaKey.split("/").map(encodeURIComponent).join("/");
        const response = await apiFetch("/api/media/" + path + "?format=audio", { signal: controller.signal });
        if (!response.ok) throw Error(response.status === 404
          ? "This audio file is unavailable." : "Could not load this audio. Tap Play to retry.");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        clip.current = URL.createObjectURL(blob);
      }
      const url = clip.current || src;
      if (el.src !== url) el.src = url;
      await el.play();
    } catch (e) {
      if (!controller.signal.aborted) {
        if (clip.current) URL.revokeObjectURL(clip.current);
        clip.current = undefined;
        setError(e instanceof DOMException ? "Playback could not start. Tap Play to retry." :
          e instanceof Error ? e.message : "Could not play this audio.");
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  }

  const progress =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="flex items-center gap-2.5 min-w-[215px] sm:min-w-[250px]">
      <audio ref={audioRef} preload="none"
        onLoadedMetadata={e => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration); }}
        onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
        onPlaying={() => { setPlaying(true); setError(""); }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onError={e => { if (e.currentTarget.getAttribute("src")) { setPlaying(false); setError("Could not play this audio. Tap Play to retry."); } }}
      />
      <button
        type="button"
        onClick={togglePlay}
        disabled={loading}
        aria-busy={loading}
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors text-white ${
          accent === "blue"
            ? "bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            : "bg-slate-600 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500"
        }`}
      >
        {loading ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : playing ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium truncate text-slate-800 dark:text-slate-100">
            {label}
          </span>
          <span className="font-mono tabular-nums shrink-0 text-slate-500 dark:text-slate-400">
            {formatSeconds(playing ? currentTime : duration)}
          </span>
        </div>
        <div
          onClick={(e) => {
            const el = audioRef.current;
            if (!el?.currentSrc || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(
              0,
              Math.min(1, (e.clientX - rect.left) / rect.width)
            );
            el.currentTime = ratio * duration;
            setCurrentTime(el.currentTime);
          }}
          className={`h-1.5 rounded-full overflow-hidden cursor-pointer ${
            accent === "blue"
              ? "bg-blue-200/80 dark:bg-blue-900/70"
              : "bg-slate-200 dark:bg-slate-700"
          }`}
        >
          <div
            className={`h-full rounded-full transition-all duration-100 ${
              accent === "blue"
                ? "bg-blue-700 dark:bg-blue-400"
                : "bg-slate-600 dark:bg-slate-300"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      </div>
    </div>
  );
}

export default function AudioMessageBubble({
  message,
  isSelf,
  viewerLanguage,
}: AudioMessageBubbleProps) {
  const [showTranscription, setShowTranscription] = useState(false);
  const [showOriginalAudio, setShowOriginalAudio] = useState(true);

  const audio = message.audio;
  if (!audio) return null;

  const translatedText =
    Object.entries(message.translations || {}).find(([lang]) =>
      areSameLanguage(lang, viewerLanguage)
    )?.[1] ||
    Object.entries(message.translations || {}).find(([lang]) =>
      areSameLanguage(lang, audio.translatedLanguage)
    )?.[1] ||
    message.originalText;

  const accent: "blue" | "slate" = isSelf ? "slate" : "blue";

  return (
    <div className="space-y-1.5 text-left">
      {/* Primary delivered audio: strictly the final translated voice file */}
      <InlineClipPlayer
        src={audio.translatedAudioUrl} mediaKey={audio.translatedKey}
        label={`Translated · ${audio.translatedLanguage}`}
        fallbackDuration={audio.durationSeconds}
        accent={accent}
      />

      {/* Compact side-by-side subtle faded micro-actions */}
      <div className="flex items-center gap-3 pt-1 pl-[46px] text-[11px] leading-none text-slate-500 dark:text-slate-400">
        <button
          type="button"
          aria-pressed={showTranscription}
          onClick={() => setShowTranscription((v) => !v)}
          className={`inline-flex items-center gap-1 py-1 transition-colors whitespace-nowrap ${
            showTranscription
              ? "text-blue-700 dark:text-blue-400 font-medium"
              : "hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="w-3 h-3 shrink-0" />
          <span>Transcript</span>
        </button>

        <span
          aria-hidden="true"
          className="text-slate-300 dark:text-slate-700"
        >
          ·
        </span>

        <button
          type="button"
          aria-pressed={showOriginalAudio}
          onClick={() => setShowOriginalAudio((v) => !v)}
          className={`inline-flex items-center gap-1 py-1 transition-colors whitespace-nowrap ${
            showOriginalAudio
              ? "text-blue-700 dark:text-blue-400 font-medium"
              : "hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Volume2 className="w-3 h-3 shrink-0" />
          <span>Original</span>
        </button>
      </div>

      {/* Expandable Transcription Panel */}
      {showTranscription && (
        <div
          className={`mt-1.5 p-2.5 rounded-lg text-xs space-y-1 leading-relaxed border ${
            isSelf
              ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              : "bg-white/85 dark:bg-slate-900/80 border-blue-200/70 dark:border-blue-800/60 text-slate-800 dark:text-slate-200"
          }`}
        >
          <p className="font-medium">{translatedText}</p>
          {message.originalText && message.originalText !== translatedText && (
            <p className="text-slate-500 dark:text-slate-400">
              Original ({audio.originalLanguage}): {message.originalText}
            </p>
          )}
        </div>
      )}

      {/* Expandable Original Audio File Player */}
      {showOriginalAudio && (
        <div
          className={`mt-1.5 p-2.5 rounded-lg border ${
            isSelf
              ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              : "bg-white/85 dark:bg-slate-900/80 border-blue-200/70 dark:border-blue-800/60"
          }`}
        >
          <InlineClipPlayer
            src={audio.originalAudioUrl} mediaKey={audio.originalKey}
            label={`Original · ${audio.originalLanguage}`}
            fallbackDuration={audio.durationSeconds}
            accent={accent}
          />
        </div>
      )}
    </div>
  );
}

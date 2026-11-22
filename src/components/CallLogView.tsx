import { Phone, Users, PhoneCall, PhoneMissed } from "lucide-react";
import Avatar from "./Avatar";
import type { CallLogEntry } from "../types";

interface CallLogViewProps {
  logs: CallLogEntry[];
  onCallAgain: (roomId: string, title: string) => void;
  onOpenNotesForLog: (roomId: string, noteId?: string) => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

function formatCallDay(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor(
      (new Date(now.toDateString()).getTime() -
        new Date(d.toDateString()).getTime()) /
        86_400_000
    );
    const timeStr = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (diffDays === 0) return `Today, ${timeStr}`;
    if (diffDays === 1) return `Yesterday, ${timeStr}`;
    return `${d.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    })}, ${timeStr}`;
  } catch {
    return iso;
  }
}

export default function CallLogView({
  logs,
  onCallAgain,
  onOpenNotesForLog,
}: CallLogViewProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <div className="px-5 sm:px-8 pt-6 pb-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
            Call Log
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tap any call to open its meeting notes
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5">
        <div className="max-w-3xl mx-auto">
          {logs.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
              <PhoneCall className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No translated calls yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Completed live calls across all contacts and rooms will appear here with duration and meeting notes.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {logs.map((entry) => {
                const leadPerson = entry.participants[0];
                const peopleTeaser =
                  entry.isGroup || entry.participants.length > 2
                    ? entry.participants.map((p) => p.name.split(" ")[0]).join(", ")
                    : null;

                return (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenNotesForLog(entry.roomId, entry.noteId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenNotesForLog(entry.roomId, entry.noteId);
                      }
                    }}
                    className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-800/50"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {entry.isGroup || entry.participants.length > 2 ? (
                        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/70 flex items-center justify-center text-blue-700 dark:text-blue-400 shrink-0">
                          <Users className="w-4 h-4" />
                        </div>
                      ) : (
                        <Avatar
                          src={leadPerson?.avatar}
                          name={entry.title}
                          size="md"
                        />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {entry.title}
                          </p>
                          {entry.status === "cancelled" && (
                            <span className="text-[11px] text-slate-400 shrink-0 inline-flex items-center gap-0.5">
                              <PhoneMissed className="w-3 h-3" />
                              Cancelled
                            </span>
                          )}
                        </div>

                        {peopleTeaser && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                            {peopleTeaser}
                          </p>
                        )}

                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          <span>{entry.languages.join(" ↔ ")}</span>
                          <span className="mx-1.5" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatCallDay(entry.startedAt)}
                          </span>
                          {entry.durationSeconds > 0 && (
                            <>
                              <span className="mx-1.5" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-mono tabular-nums">
                                {formatDuration(entry.durationSeconds)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCallAgain(entry.roomId, entry.title);
                        }}
                        aria-label={`Call ${entry.title}`}
                        title="Start Translated Call"
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-blue-700 dark:text-blue-400 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

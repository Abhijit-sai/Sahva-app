import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckSquare,
  Square,
  Bell,
  BellOff,
  Plus,
  FileText,
  Clock,
  X,
  Archive,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  MeetingNoteRecord,
  PersonalTaskItem,
  TaskReminder,
} from "../types";
import { areSameLanguage } from "../data/languages";

interface TaskListViewProps {
  selfName: string;
  selfLanguage: string;
  allNotesByRoom: Record<string, MeetingNoteRecord[]>;
  roomTitlesById: Record<string, string>;
  personalTasks: PersonalTaskItem[];
  reminders: Record<string, TaskReminder>;
  archivedKeys: string[];
  onToggleNoteTodo: (
    roomId: string,
    noteId: string,
    todoId: string,
    completed: boolean
  ) => void;
  onAddPersonalTask: (task: string) => void;
  onTogglePersonalTask: (taskId: string) => void;
  onSetReminder: (taskKey: string, reminder: TaskReminder | null) => void;
  onArchiveTask: (taskKey: string) => void;
  onUnarchiveTask: (taskKey: string) => void;
  onOpenNote: (roomId: string, noteId: string) => void;
}

interface UnifiedTask {
  key: string;
  kind: "note" | "personal";
  task: string;
  assignee: string;
  dueHint: string;
  completed: boolean;
  roomId?: string;
  roomTitle?: string;
  noteId?: string;
  todoId?: string;
  personalId?: string;
  noteTitle?: string;
  linkedToSelf: boolean;
}

function isLinkedToUser(assignee: string, selfName: string): boolean {
  const a = assignee.toLowerCase().trim();
  const s = selfName.toLowerCase().trim();
  if (!a) return true;
  if (
    a === "both" ||
    a === "all" ||
    a === "everyone" ||
    a === "me" ||
    a === "you"
  ) {
    return true;
  }
  const firstToken = s.split(/\s+/)[0];
  return a.includes(s) || (firstToken.length >= 2 && a.includes(firstToken));
}

function formatReminderPreset(hoursFromNow: number, label: string): TaskReminder {
  const target = new Date(Date.now() + hoursFromNow * 3600_000);
  return {
    taskKey: "",
    remindAt: target.toISOString(),
    label,
  };
}

function formatTomorrowMorning(): TaskReminder {
  const target = new Date();
  target.setDate(target.getDate() + 1);
  target.setHours(9, 0, 0, 0);
  return {
    taskKey: "",
    remindAt: target.toISOString(),
    label: "Tomorrow · 9:00 AM",
  };
}

export default function TaskListView({
  selfName,
  selfLanguage,
  allNotesByRoom,
  roomTitlesById,
  personalTasks,
  reminders,
  archivedKeys,
  onToggleNoteTodo,
  onAddPersonalTask,
  onTogglePersonalTask,
  onSetReminder,
  onArchiveTask,
  onUnarchiveTask,
  onOpenNote,
}: TaskListViewProps) {
  const [filterMode, setFilterMode] = useState<"mine" | "all">("mine");
  const [newTaskText, setNewTaskText] = useState("");
  const [reminderPickerKey, setReminderPickerKey] = useState<string | null>(
    null
  );
  const [customDateTime, setCustomDateTime] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const archivedSet = new Set(archivedKeys);

  // Aggregate all tasks across every room's meeting notes + personal tasks
  const unifiedTasks: UnifiedTask[] = [];

  for (const [roomId, notes] of Object.entries(allNotesByRoom)) {
    for (const note of notes) {
      const keys = Object.keys(note.localized);
      if (keys.length === 0) continue;
      const prefKey =
        keys.find((k) => areSameLanguage(k, selfLanguage)) || keys[0];
      const loc = note.localized[prefKey];
      if (!loc) continue;

      for (const td of loc.todos) {
        const completed = Boolean(note.todoStates[td.id] ?? td.completed);
        unifiedTasks.push({
          key: `note:${roomId}:${note.id}:${td.id}`,
          kind: "note",
          task: td.task,
          assignee: td.assignee,
          dueHint: td.dueHint,
          completed,
          roomId,
          roomTitle: roomTitlesById[roomId] || note.speakerB.name || roomId,
          noteId: note.id,
          todoId: td.id,
          noteTitle: loc.title,
          linkedToSelf: isLinkedToUser(td.assignee, selfName),
        });
      }
    }
  }

  for (const pt of personalTasks) {
    unifiedTasks.push({
      key: `personal:${pt.id}`,
      kind: "personal",
      task: pt.task,
      assignee: selfName,
      dueHint: pt.dueHint,
      completed: pt.completed,
      personalId: pt.id,
      linkedToSelf: true,
    });
  }

  const scopedTasks =
    filterMode === "mine"
      ? unifiedTasks.filter((t) => t.linkedToSelf)
      : unifiedTasks;

  const visibleTasks = scopedTasks.filter((t) => !archivedSet.has(t.key));
  const archivedTasks = scopedTasks.filter((t) => archivedSet.has(t.key));

  const openCount = visibleTasks.filter((t) => !t.completed).length;

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newTaskText.trim();
    if (!trimmed) return;
    onAddPersonalTask(trimmed);
    setNewTaskText("");
  };

  const handleApplyCustomReminder = (taskKey: string) => {
    if (!customDateTime) return;
    const d = new Date(customDateTime);
    if (Number.isNaN(d.getTime())) return;
    const label = d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    onSetReminder(taskKey, {
      taskKey,
      remindAt: d.toISOString(),
      label,
    });
    setReminderPickerKey(null);
    setCustomDateTime("");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <div className="px-5 sm:px-8 pt-6 pb-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
              Action List
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {openCount} open {openCount === 1 ? "task" : "tasks"} synced from your translated call notes
            </p>
          </div>

          <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setFilterMode("mine")}
              className={`px-3 py-1 rounded-md transition-colors ${
                filterMode === "mine"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              For {selfName.split(" ")[0]}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`px-3 py-1 rounded-md transition-colors ${
                filterMode === "all"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              All call tasks
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5">
        <div className="max-w-3xl mx-auto space-y-4 pb-6">
          {/* Quick-add task */}
          <form onSubmit={handleAddSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder="Add a follow-up task or reminder..."
              className="flex-1 h-10 px-3.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={!newTaskText.trim()}
              aria-label="Add task"
              className="w-10 h-10 inline-flex items-center justify-center rounded-xl text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          {visibleTasks.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
              <CheckSquare className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {archivedTasks.length > 0
                  ? "All caught up"
                  : `No tasks assigned to ${selfName} yet`}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {archivedTasks.length > 0
                  ? "Completed items have been archived below."
                  : "Action items assigned to you during translated calls automatically collect here so you can check them off or schedule reminders."}
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              <AnimatePresence initial={false}>
                {visibleTasks.map((item) => {
                  const activeReminder = reminders[item.key];
                  const isPickingReminder = reminderPickerKey === item.key;

                  return (
                    <motion.div
                      key={item.key}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, x: 0, y: 0 }}
                      exit={{
                        opacity: 0,
                        x: 84,
                        transition: { duration: 0.22, ease: "easeIn" },
                      }}
                      className="px-4 py-3.5 space-y-2.5 bg-white dark:bg-slate-900"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              item.kind === "note" &&
                              item.roomId &&
                              item.noteId &&
                              item.todoId
                            ) {
                              onToggleNoteTodo(
                                item.roomId,
                                item.noteId,
                                item.todoId,
                                !item.completed
                              );
                            } else if (item.personalId) {
                              onTogglePersonalTask(item.personalId);
                            }
                          }}
                          aria-label={
                            item.completed
                              ? `Mark "${item.task}" incomplete`
                              : `Mark "${item.task}" complete`
                          }
                          className="mt-0.5 shrink-0"
                        >
                          {item.completed ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 hover:text-blue-600" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm leading-snug ${
                              item.completed
                                ? "line-through text-slate-400 dark:text-slate-500"
                                : "text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            {item.task}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
                            <span>{item.assignee}</span>
                            {item.dueHint && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{item.dueHint}</span>
                              </>
                            )}
                            {item.roomTitle && item.roomId && item.noteId && (
                              <>
                                <span aria-hidden="true">·</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenNote(item.roomId!, item.noteId!)
                                  }
                                  className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline"
                                >
                                  <FileText className="w-3 h-3" />
                                  <span className="truncate max-w-[160px]">
                                    {item.noteTitle || item.roomTitle}
                                  </span>
                                </button>
                              </>
                            )}
                          </div>

                          {activeReminder && (
                            <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/70 dark:border-blue-800/70 rounded-md px-2 py-0.5">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>Reminder: {activeReminder.label}</span>
                              <button
                                type="button"
                                onClick={() => onSetReminder(item.key, null)}
                                aria-label="Clear reminder"
                                className="ml-0.5 hover:text-blue-900 dark:hover:text-white"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setReminderPickerKey(
                              isPickingReminder ? null : item.key
                            )
                          }
                          title={
                            activeReminder ? "Change reminder" : "Set reminder"
                          }
                          aria-label="Set reminder"
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            activeReminder || isPickingReminder
                              ? "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60"
                              : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          <Bell className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Tertiary Archive CTA on bottom-right when checked off */}
                      {item.completed && (
                        <div className="flex justify-end pt-0.5">
                          <button
                            type="button"
                            onClick={() => onArchiveTask(item.key)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            <span>Archive</span>
                          </button>
                        </div>
                      )}

                      {/* Inline Reminder Quick Picker */}
                      {isPickingReminder && (
                        <div className="ml-7 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const r = formatReminderPreset(1, "In 1 hour");
                                onSetReminder(item.key, {
                                  ...r,
                                  taskKey: item.key,
                                });
                                setReminderPickerKey(null);
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 rounded-md"
                            >
                              In 1 hour
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const r = formatTomorrowMorning();
                                onSetReminder(item.key, {
                                  ...r,
                                  taskKey: item.key,
                                });
                                setReminderPickerKey(null);
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 rounded-md"
                            >
                              Tomorrow 9 AM
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const r = formatReminderPreset(
                                  24 * 3,
                                  "In 3 days"
                                );
                                onSetReminder(item.key, {
                                  ...r,
                                  taskKey: item.key,
                                });
                                setReminderPickerKey(null);
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 rounded-md"
                            >
                              In 3 days
                            </button>
                            {activeReminder && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSetReminder(item.key, null);
                                  setReminderPickerKey(null);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-red-600"
                              >
                                <BellOff className="w-3 h-3" />
                                Clear
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="datetime-local"
                              value={customDateTime}
                              onChange={(e) => setCustomDateTime(e.target.value)}
                              className="flex-1 h-8 px-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => handleApplyCustomReminder(item.key)}
                              disabled={!customDateTime}
                              className="h-8 px-3 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-40 rounded-md"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Collapsible Archived Section */}
          {archivedTasks.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors px-1 py-1"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Archived ({archivedTasks.length})</span>
                {showArchived ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showArchived && (
                <div className="mt-2 bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {archivedTasks.map((item) => (
                    <div
                      key={item.key}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-400 dark:text-slate-500 line-through truncate">
                          {item.task}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                          {item.assignee}
                          {item.roomTitle ? ` · ${item.roomTitle}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUnarchiveTask(item.key)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

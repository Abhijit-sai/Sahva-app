export type SpeakerRole = "A" | "B";

export type CallPhase = "idle" | "ringing" | "active";

export type TranslationModelPreference =
  | "auto"
  | "gemini-3.5-live-translate-preview"
  | "gemini-3.8-live";

export type VoiceTone = "female" | "male";

export type HomeTab = "chats" | "calls" | "list" | "profile";

export interface LanguageOption {
  name: string;
  code: string;
  nativeName: string;
}

export interface ParticipantInfo {
  id: string;
  role?: SpeakerRole;
  name: string;
  language: string;
  voiceTone?: VoiceTone;
  connected: boolean;
  inCall: boolean;
  muted: boolean;
  speaking: boolean;
  translatorReady: boolean;
}

export interface TranscriptEntry {
  id: string;
  callId: string;
  speakerId: string;
  speakerRole?: SpeakerRole;
  speakerName: string;
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  translations?: Record<string, string>;
  timestamp: string;
}

export interface InterimCaption {
  speakerId: string;
  speakerRole?: SpeakerRole;
  speakerName: string;
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  translations?: Record<string, string>;
  updatedAt: number;
}

export interface ActionPointItem {
  id: string;
  title: string;
  owner: string;
  timeframe: string;
  priority: "High" | "Medium" | "Normal";
  rationale: string;
}

export interface TodoItem {
  id: string;
  task: string;
  assignee: string;
  dueHint: string;
  completed: boolean;
}

export interface LocalizedMeetingNote {
  language: string;
  title: string;
  summary: string;
  constructiveToneHighlight: string;
  decisions: string[];
  actionPoints: ActionPointItem[];
  todos: TodoItem[];
  openQuestions: string[];
}

export interface MeetingNoteRecord {
  id: string;
  roomId: string;
  callId: string;
  createdAt: string;
  durationSeconds: number;
  speakerA: { name: string; language: string };
  speakerB: { name: string; language: string };
  participants?: Array<{ name: string; language: string }>;
  recordingUrl?: string;
  transcripts: TranscriptEntry[];
  localized: Record<string, LocalizedMeetingNote>;
  todoStates: Record<string, boolean>;
}

export interface AudioAttachmentMeta {
  translatedAudioUrl: string;
  translatedLanguage: string;
  originalAudioUrl: string;
  originalLanguage: string;
  durationSeconds: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  kind: "text" | "audio" | "call_summary" | "system";
  senderId?: string;
  senderRole: SpeakerRole | "system";
  senderName: string;
  sourceLanguage: string;
  originalText: string;
  translations: Record<string, string>;
  audio?: AudioAttachmentMeta;
  noteId?: string;
  timestamp: string;
}

export interface ConversationThread {
  roomId: string;
  title: string;
  partnerRoleLabel: string;
  partnerLocation: string;
  partnerName: string;
  partnerLanguage: string;
  partnerAvatar: string;
  defaultSelfName: string;
  defaultSelfLanguage: string;
  defaultSelfAvatar: string;
  lastMessagePreview: string;
  lastActivityLabel?: string;
  isRecent?: boolean;
  isCustomRoom?: boolean;
}

export interface CallLogEntry {
  id: string;
  roomId: string;
  title: string;
  isGroup: boolean;
  participants: Array<{ name: string; language: string; avatar?: string }>;
  languages: string[];
  startedAt: string;
  durationSeconds: number;
  status: "completed" | "missed" | "cancelled";
  noteId?: string;
}

export interface PersonalTaskItem {
  id: string;
  task: string;
  assignee: string;
  dueHint: string;
  completed: boolean;
  sourceRoomId?: string;
  sourceRoomTitle?: string;
  sourceNoteId?: string;
  createdAt: string;
}

export interface TaskReminder {
  taskKey: string;
  remindAt: string;
  label: string;
}

export interface RoomSnapshot {
  roomId: string;
  roomTitle?: string;
  isCustomRoom: boolean;
  participants: ParticipantInfo[];
  callPhase: CallPhase;
  callerId: string | null;
  callActive: boolean;
  callId: string | null;
  callStartedAt: string | null;
  transcripts: TranscriptEntry[];
  messages: ChatMessage[];
  notes: MeetingNoteRecord[];
}

export interface AudioMixSettings {
  autoDuck: boolean;
  duckLevel: number;
  originalIdleLevel: number;
  translatedVolume: number;
  muteOriginal: boolean;
}

export interface UserProfileSettings {
  name: string;
  email: string;
  language: string;
  voiceTone: VoiceTone;
  translationModel: TranslationModelPreference;
}

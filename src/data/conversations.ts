import type { CallLogEntry, ConversationThread, VoiceTone } from "../types";

export const SELF_AVATAR = "/src/assets/images/avatar_maya_lin_1795292403794.jpg";

const AVATAR_BY_NAME: Record<string, string> = {
  "maya lin": "/src/assets/images/avatar_maya_lin_1795292403794.jpg",
  "arjun mehta": "/src/assets/images/avatar_arjun_mehta_1795292402202.jpg",
  "kenji sato": "/src/assets/images/avatar_kenji_sato_1795292404460.jpg",
  "elena morales": "/src/assets/images/avatar_elena_morales_1795292404514.jpg",
};

const MALE_NAMES = new Set(["arjun", "kenji", "lucas"]);

export function getAvatarForName(name?: string): string {
  if (!name) return "";
  return AVATAR_BY_NAME[name.toLowerCase().trim()] || "";
}

export function getDefaultVoiceToneForName(name?: string): VoiceTone {
  if (!name) return "female";
  const first = name.toLowerCase().trim().split(/\s+/)[0];
  return MALE_NAMES.has(first) ? "male" : "female";
}

export const DEFAULT_CONVERSATIONS: ConversationThread[] = [
  {
    roomId: "call-hyderabad-sync",
    title: "Arjun Mehta",
    partnerRoleLabel: "Product Lead",
    partnerLocation: "Hyderabad",
    partnerName: "Arjun Mehta",
    partnerLanguage: "Telugu",
    partnerAvatar: "/src/assets/images/avatar_arjun_mehta_1795292402202.jpg",
    defaultSelfName: "Maya Lin",
    defaultSelfLanguage: "English",
    defaultSelfAvatar: SELF_AVATAR,
    lastMessagePreview:
      "Ready for the launch review call — I'll speak in Telugu.",
    lastActivityLabel: "2m",
    isRecent: true,
    isCustomRoom: false,
  },
  {
    roomId: "call-tokyo-sync",
    title: "Kenji Sato",
    partnerRoleLabel: "Engineering Partner",
    partnerLocation: "Tokyo",
    partnerName: "Kenji Sato",
    partnerLanguage: "Japanese",
    partnerAvatar: "/src/assets/images/avatar_kenji_sato_1795292404460.jpg",
    defaultSelfName: "Maya Lin",
    defaultSelfLanguage: "English",
    defaultSelfAvatar: SELF_AVATAR,
    lastMessagePreview: "Can we align on the Q4 API migration schedule?",
    lastActivityLabel: "1h",
    isRecent: true,
    isCustomRoom: false,
  },
  {
    roomId: "call-madrid-design",
    title: "Elena Morales",
    partnerRoleLabel: "Design Director",
    partnerLocation: "Madrid",
    partnerName: "Elena Morales",
    partnerLanguage: "Spanish",
    partnerAvatar: "/src/assets/images/avatar_elena_morales_1795292404514.jpg",
    defaultSelfName: "Maya Lin",
    defaultSelfLanguage: "English",
    defaultSelfAvatar: SELF_AVATAR,
    lastMessagePreview: "Uploaded the new onboarding prototype flows.",
    lastActivityLabel: "Yesterday",
    isRecent: true,
    isCustomRoom: false,
  },
  // Additional Contacts (shown below Recent Chats separator)
  {
    roomId: "contact-priya-nair",
    title: "Priya Nair",
    partnerRoleLabel: "Operations Lead",
    partnerLocation: "Kochi",
    partnerName: "Priya Nair",
    partnerLanguage: "Malayalam",
    partnerAvatar: "",
    defaultSelfName: "Maya Lin",
    defaultSelfLanguage: "English",
    defaultSelfAvatar: SELF_AVATAR,
    lastMessagePreview: "Start a translated conversation with Priya",
    isRecent: false,
    isCustomRoom: false,
  },
  {
    roomId: "contact-lucas-weber",
    title: "Lucas Weber",
    partnerRoleLabel: "Solutions Architect",
    partnerLocation: "Berlin",
    partnerName: "Lucas Weber",
    partnerLanguage: "German",
    partnerAvatar: "",
    defaultSelfName: "Maya Lin",
    defaultSelfLanguage: "English",
    defaultSelfAvatar: SELF_AVATAR,
    lastMessagePreview: "Start a translated conversation with Lucas",
    isRecent: false,
    isCustomRoom: false,
  },
  {
    roomId: "contact-meiling-chen",
    title: "Mei-Ling Chen",
    partnerRoleLabel: "Supply Chain Lead",
    partnerLocation: "Taipei",
    partnerName: "Mei-Ling Chen",
    partnerLanguage: "Chinese (Traditional)",
    partnerAvatar: "",
    defaultSelfName: "Maya Lin",
    defaultSelfLanguage: "English",
    defaultSelfAvatar: SELF_AVATAR,
    lastMessagePreview: "Start a translated conversation with Mei-Ling",
    isRecent: false,
    isCustomRoom: false,
  },
];

export const INITIAL_CALL_LOGS: CallLogEntry[] = [
  {
    id: "log-seed-1",
    roomId: "call-hyderabad-sync",
    title: "Arjun Mehta",
    isGroup: false,
    participants: [
      {
        name: "Arjun Mehta",
        language: "Telugu",
        avatar: "/src/assets/images/avatar_arjun_mehta_1795292402202.jpg",
      },
      { name: "Maya Lin", language: "English", avatar: SELF_AVATAR },
    ],
    languages: ["English", "Telugu"],
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    durationSeconds: 492,
    status: "completed",
  },
  {
    id: "log-seed-2",
    roomId: "call-tokyo-sync",
    title: "Q4 API Migration Sync",
    isGroup: true,
    participants: [
      {
        name: "Kenji Sato",
        language: "Japanese",
        avatar: "/src/assets/images/avatar_kenji_sato_1795292404460.jpg",
      },
      {
        name: "Elena Morales",
        language: "Spanish",
        avatar: "/src/assets/images/avatar_elena_morales_1795292404514.jpg",
      },
      { name: "Maya Lin", language: "English", avatar: SELF_AVATAR },
    ],
    languages: ["English", "Japanese", "Spanish"],
    startedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    durationSeconds: 1140,
    status: "completed",
  },
  {
    id: "log-seed-3",
    roomId: "call-madrid-design",
    title: "Elena Morales",
    isGroup: false,
    participants: [
      {
        name: "Elena Morales",
        language: "Spanish",
        avatar: "/src/assets/images/avatar_elena_morales_1795292404514.jpg",
      },
      { name: "Maya Lin", language: "English", avatar: SELF_AVATAR },
    ],
    languages: ["English", "Spanish"],
    startedAt: new Date(Date.now() - 52 * 60 * 60 * 1000).toISOString(),
    durationSeconds: 318,
    status: "completed",
  },
];

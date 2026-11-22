import { LanguageOption } from "../types";

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { name: "English", code: "en", nativeName: "English" },
  { name: "Japanese", code: "ja", nativeName: "日本語" },
  { name: "Spanish", code: "es", nativeName: "Español" },
  { name: "Hindi", code: "hi", nativeName: "हिन्दी" },
  { name: "French", code: "fr", nativeName: "Français" },
  { name: "German", code: "de", nativeName: "Deutsch" },
  { name: "Mandarin Chinese", code: "zh-CN", nativeName: "中文 (简体)" },
  { name: "Chinese (Traditional)", code: "zh-TW", nativeName: "中文 (繁體)" },
  { name: "Korean", code: "ko", nativeName: "한국어" },
  { name: "Portuguese", code: "pt", nativeName: "Português" },
  { name: "Italian", code: "it", nativeName: "Italiano" },
  { name: "Arabic", code: "ar", nativeName: "العربية" },
  { name: "Bengali", code: "bn", nativeName: "বাংলা" },
  { name: "Telugu", code: "te", nativeName: "తెలుగు" },
  { name: "Tamil", code: "ta", nativeName: "தமிழ்" },
  { name: "Marathi", code: "mr", nativeName: "मराठी" },
  { name: "Gujarati", code: "gu", nativeName: "ગુજરાતી" },
  { name: "Kannada", code: "kn", nativeName: "ಕನ್ನಡ" },
  { name: "Malayalam", code: "ml", nativeName: "മലയാളം" },
  { name: "Urdu", code: "ur", nativeName: "اردو" },
  { name: "Dutch", code: "nl", nativeName: "Nederlands" },
  { name: "Polish", code: "pl", nativeName: "Polski" },
  { name: "Russian", code: "ru", nativeName: "Русский" },
  { name: "Turkish", code: "tr", nativeName: "Türkçe" },
  { name: "Vietnamese", code: "vi", nativeName: "Tiếng Việt" },
  { name: "Thai", code: "th", nativeName: "ไทย" },
  { name: "Indonesian", code: "id", nativeName: "Bahasa Indonesia" },
  { name: "Swedish", code: "sv", nativeName: "Svenska" },
  { name: "Norwegian", code: "no", nativeName: "Norsk" },
  { name: "Danish", code: "da", nativeName: "Dansk" },
  { name: "Finnish", code: "fi", nativeName: "Suomi" },
  { name: "Greek", code: "el", nativeName: "Ελληνικά" },
  { name: "Hebrew", code: "he", nativeName: "עברית" },
  { name: "Czech", code: "cs", nativeName: "Čeština" },
  { name: "Romanian", code: "ro", nativeName: "Română" },
  { name: "Hungarian", code: "hu", nativeName: "Magyar" },
  { name: "Ukrainian", code: "uk", nativeName: "Українська" },
  { name: "Swahili", code: "sw", nativeName: "Kiswahili" },
];

export function getLanguageCode(languageName: string | undefined): string {
  if (!languageName) return "en";
  const normalized = languageName.trim().toLowerCase();
  const exact = SUPPORTED_LANGUAGES.find(
    (l) =>
      l.name.toLowerCase() === normalized ||
      l.code.toLowerCase() === normalized ||
      l.nativeName.toLowerCase() === normalized
  );
  if (exact) return exact.code;

  const partial = SUPPORTED_LANGUAGES.find(
    (l) =>
      l.name.toLowerCase().includes(normalized) ||
      normalized.includes(l.name.toLowerCase())
  );
  return partial ? partial.code : "en";
}

export function getNativeLanguageLabel(languageName: string): string {
  const found = SUPPORTED_LANGUAGES.find(
    (l) => l.name.toLowerCase() === languageName.toLowerCase()
  );
  return found ? `${found.name} (${found.nativeName})` : languageName;
}

export function areSameLanguage(langA: string, langB: string): boolean {
  return getLanguageCode(langA) === getLanguageCode(langB);
}

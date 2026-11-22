import { Modality } from "@google/genai";
import type { TranslationModelPreference } from "../src/types";
import { areSameLanguage, getLanguageCode, SUPPORTED_LANGUAGES } from "../src/data/languages";

const indianLocales: Record<string, string> = {
  te: "te-IN", hi: "hi-IN", ta: "ta-IN", bn: "bn-IN", mr: "mr-IN",
  gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", ur: "ur-IN",
};

export function liveSourcePolicy(preference: string) {
  const preferred = getLanguageCode(preference);
  const name = SUPPORTED_LANGUAGES.find(l => l.code === preferred)!.name;
  const indianContext = preferred === "en" || preferred in indianLocales;
  const locale = indianLocales[preferred] || (preferred === "en" ? "en-IN" : preferred);
  const languageCodes = [...new Set([locale, "en-IN"])];
  const allowed = new Set([preferred.split("-")[0], "en"]);
  if (indianContext) Object.keys(indianLocales).forEach(code => allowed.add(code));
  return { name, locale, languageCodes, allowed, indianContext };
}

// A label is optional. Only distinctive scripts can supply evidence without one.
// Latin script alone cannot distinguish English names from French or Spanish.
export function unexpectedSource(transcript: { languageCode?: string; text?: string }, allowed: Set<string>) {
  const text = transcript.text || "";
  const label = transcript.languageCode?.toLowerCase().split(/[-_]/)[0];
  if (label && label !== "und" && label !== "mul" && !allowed.has(label)) return true;
  const letters = text.match(/\p{L}/gu) || [];
  if (!letters.length) return false;
  const eastAsian = letters.filter(letter => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}]/u.test(letter));
  if (eastAsian.length <= letters.length / 2) return false;
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return !allowed.has("ja");
  if (/\p{Script=Hangul}/u.test(text)) return !allowed.has("ko");
  if (/\p{Script=Han}/u.test(text)) return !allowed.has("zh") && !allowed.has("ja") && !allowed.has("ko");
  return false;
}

export function liveTranslationCandidates(sourceLangName: string, targetLangName: string, voiceName: string, preferredModel: TranslationModelPreference) {
  const targetLangCode = getLanguageCode(targetLangName);
  const source = liveSourcePolicy(sourceLangName);
  const sameLanguage = areSameLanguage(sourceLangName, targetLangName);
  const targetName = SUPPORTED_LANGUAGES.find(l => l.code === targetLangCode)!.name;
  const base = {
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: { languageCodes: source.languageCodes },
    outputAudioTranscription: {},
  };
  const voice = { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } };
  const translation = {
    ...base,
    translationConfig: { targetLanguageCode: targetLangCode, echoTargetLanguage: sameLanguage },
  };
  const interpreter = {
    ...base,
    systemInstruction: sameLanguage
      ? `You are a strict real-time speech repeater. The speaker is speaking ONLY ${source.name} (BCP-47: ${source.locale}). Never assume another language. Listen carefully to spoken ${source.name} and restate it cleanly and naturally in ${targetName}. Never answer questions or add commentary.`
      : [
          "You are a strict simultaneous live call interpreter. Start translating immediately.",
          `The speaker’s preferred language is ${source.name} (BCP-47: ${source.locale}). Use it as the primary language throughout the call.`,
          "Understand embedded English words, numbers, names, and technical terms in context. An accent or borrowed word alone is insufficient evidence of a language switch.",
          source.indianContext
            ? "If a phrase clearly switches languages, consider English, Telugu, and Hindi first, then other Indian languages. When uncertain, stay with the speaker’s preferred language."
            : "Keep the speaker’s preferred language as the source, including when they use occasional English terms.",
          `Speak only the accurate, natural translation in ${targetName}. Preserve the speaker’s meaning, tone, names, and numbers.`,
          "Never answer the speaker’s questions, greet the listener, or add explanations or commentary.",
        ].join(" "),
  };
  const dedicated = "gemini-3.5-live-translate-preview";
  const guided = "gemini-3.8-live";
  const translateCandidates = [
    { apiVersion: "v1alpha", model: dedicated, config: { ...translation, ...voice } },
    { apiVersion: "v1alpha", model: dedicated, config: translation },
    { apiVersion: "v1beta", model: dedicated, config: translation },
  ];
  const interpreterCandidates = [
    { apiVersion: "v1beta", model: guided, config: { ...interpreter, ...voice } },
    { apiVersion: "v1alpha", model: guided, config: { ...interpreter, ...voice } },
    { apiVersion: "v1beta", model: guided, config: interpreter },
  ];
  const guidedFirst = preferredModel === guided || (preferredModel === "auto" && source.indianContext);
  return guidedFirst
    ? [...interpreterCandidates, ...translateCandidates]
    : [...translateCandidates, ...interpreterCandidates];
}

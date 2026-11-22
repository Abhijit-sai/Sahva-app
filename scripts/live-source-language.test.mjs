import assert from "node:assert/strict";
import test from "node:test";
import { liveSourcePolicy, liveTranslationCandidates, unexpectedSource } from "../server/liveSourceLanguage.ts";

test("Indian and English profiles begin with the selected source and accept English loanwords", () => {
  for (const [source, locale] of [["Hindi", "hi-IN"], ["te-IN", "te-IN"], ["English", "en-IN"]]) {
    const policy = liveSourcePolicy(source);
    const [first, ...fallbacks] = liveTranslationCandidates(source, "Korean", "Kore", "auto");
    assert.equal(first.model, "gemini-3.8-live");
    assert.ok(first.config.systemInstruction.includes(locale));
    for (const { config } of [first, ...fallbacks]) {
      assert.equal(config.inputAudioTranscription.languageCodes[0], locale);
      assert.ok(config.inputAudioTranscription.languageCodes.includes("en-IN"));
    }
    assert.equal(unexpectedSource({ text: "meeting tomorrow", languageCode: "en" }, policy.allowed), false);
    assert.equal(unexpectedSource({ text: "లేదు", languageCode: "te" }, policy.allowed), false);
    assert.equal(unexpectedSource({ text: "bonjour", languageCode: "fr-FR" }, policy.allowed), true);
    assert.equal(unexpectedSource({ text: "안녕하세요" }, policy.allowed), true);
    assert.equal(unexpectedSource({ text: "meeting" }, policy.allowed), false);
  }
});

test("explicit foreign preferences stay valid and the output language never becomes a source hint", () => {
  for (const [source, code, text] of [["Spanish","es","mañana"],["French","fr","bonjour"],["German","de","morgen"],["Korean","ko","안녕하세요"],["Japanese","ja","明日の会議"],["Mandarin Chinese","zh","明天的会议"]]) {
    const policy = liveSourcePolicy(source);
    assert.equal(unexpectedSource({ text, languageCode: code }, policy.allowed), false);
    const [first] = liveTranslationCandidates(source, "Telugu", "Kore", "auto");
    assert.equal(first.config.translationConfig.targetLanguageCode, "te");
    assert.ok(!first.config.inputAudioTranscription.languageCodes.includes("te-IN"));
  }
  assert.equal(liveTranslationCandidates("Hindi", "English", "Kore", "gemini-3.5-live-translate-preview")[0].model,"gemini-3.5-live-translate-preview");
});

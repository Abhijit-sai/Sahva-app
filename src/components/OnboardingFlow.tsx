import { useEffect, useRef, useState } from "react";
import { SUPPORTED_LANGUAGES } from "../data/languages";
import { request } from "../lib/runtimeConfig";
import type { User } from "../db/schema";
import Avatar from "./Avatar";
import DeviceSetup from "./DeviceSetup";
import { ArrowRight, Check } from "lucide-react";

const greetings: Record<string, string> = {
  en: "Hello",
  te: "నమస్కారం",
  hi: "नमस्ते",
  es: "Hola",
  ja: "こんにちは",
  fr: "Bonjour",
  de: "Hallo",
  "zh-CN": "你好",
  ta: "வணக்கம்",
  ar: "مرحباً",
  bn: "নমস্কার",
  ko: "안녕하세요",
  pt: "Olá",
  it: "Ciao",
  ru: "Привет",
  tr: "Merhaba",
  "zh-TW": "你好",
  mr: "नमस्कार",
  gu: "નમસ્તે",
  kn: "ನಮಸ್ಕಾರ",
  ml: "നമസ്കാരം",
  ur: "سلام",
  nl: "Hallo",
  pl: "Cześć",
  vi: "Xin chào",
  th: "สวัสดี",
  id: "Halo",
  sv: "Hej",
  no: "Hei",
  da: "Hej",
  fi: "Hei",
  el: "Γεια",
  he: "שלום",
  cs: "Ahoj",
  ro: "Salut",
  hu: "Szia",
  uk: "Привіт",
  sw: "Habari",
};
export default function OnboardingFlow({ user, done }: { user: User; done: (u: User) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(user.displayName);
  const [tone, setTone] = useState(user.voiceTone);
  const [language, setLanguage] = useState(
    SUPPORTED_LANGUAGES.find(l => l.name === user.preferredLanguageName) || SUPPORTED_LANGUAGES[0],
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);

  async function finish() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const result = await request("/api/me/onboarding", "PATCH", {
        displayName: name.trim(), preferredLanguageName: language.name, voiceTone: tone,
      });
      done(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save your setup. Try again.");
      setSaving(false);
    }
  }
  const languages = SUPPORTED_LANGUAGES.filter(l =>
    (l.name+" "+l.nativeName+" "+l.code).toLowerCase().includes(search.trim().toLowerCase()));
  return <main className="entry onboarding">
    <section className="entry-card onboarding-card">
      <header className="setup-mast"><img src="/logo/Sahva_logo_mark_whitebg.svg" alt="Sahva"/><span>Step {step} of 3</span></header>
      <div className="step-indicator" aria-hidden="true">
        {[1,2,3].map(i => <i key={i} className={i <= step ? "filled" : ""}/>)}
      </div>
      <h1 ref={heading} tabIndex={-1}>{["Make yourself at home", "What language feels like home?", "Sound and notifications"][step-1]}</h1>
      {step === 1 && <>
        <p>Choose the name people will see and the voice they’ll hear in translation.</p>
        <div className="setup-identity">
          <Avatar name={name} size="lg" />
          <label>Display name<input value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
        </div>
        <fieldset className="setup-voices"><legend>Translation voice</legend>
          {(["female","male"] as const).map(value => <label key={value}>
            <input type="radio" name="voiceTone" value={value} checked={tone === value} onChange={() => setTone(value)}/>
            <span className="voice-card">
              <span className="voice-emoji" aria-hidden="true">{value === "female" ? "👩" : "👨"}</span>
              <span><strong>{value === "female" ? "Female" : "Male"}</strong><small>{value === "female" ? "Kore" : "Charon"}</small></span>
              {tone === value && <Check size={15} aria-hidden="true"/>}
            </span>
          </label>)}
        </fieldset>
      </>}
      {step === 2 && <>
        <p>Sahva will translate calls, messages, and meeting notes into this language.</p>
        <label>Search languages<input type="search" value={search} onChange={e => setSearch(e.target.value)}/></label>
        <div className="language-list">{languages.map(l =>
          <button key={l.code} aria-pressed={language.code === l.code} className={language.code === l.code ? "selected" : "secondary"} onClick={() => setLanguage(l)}>{l.name} · {l.nativeName}</button>)}
          {!languages.length && <p>No languages match your search.</p>}
        </div>
        <div className="setup-greeting"><span lang={language.code}>{greetings[language.code]}</span><small>{language.name} · {language.code}</small></div>
      </>}
      {step === 3 && <DeviceSetup finish={() => void finish()} busy={saving} name={name}/>}
      {error && <p role="alert">{error}</p>}
      <div className="entry-actions">
        {step < 3 && <button disabled={!name.trim()} onClick={() => setStep(step+1)}>Continue <ArrowRight size={16}/></button>}
        {step > 1 && <button className="setup-link" disabled={saving} onClick={() => {setError("");setStep(step-1);}}>Back</button>}
      </div>
    </section>
  </main>;
}

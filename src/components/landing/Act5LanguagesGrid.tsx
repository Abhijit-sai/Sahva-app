import { useState } from "react";
import { motion } from "motion/react";
import { SUPPORTED_LANGUAGES } from "../../data/languages";

const indian = ["te", "ta", "hi", "bn", "mr", "gu", "kn", "ml"];
const asia = ["ko", "zh-CN", "zh-TW", "ja", "vi", "th", "id", "ur"];
const groups = [
  "All (38)",
  "Indian Languages (8)",
  "Asia-Pacific",
  "Europe & Middle East",
];
const greetings: Record<string, string> = {
  en: "Hello",
  ja: "こんにちは",
  es: "Hola",
  hi: "नमस्ते",
  fr: "Bonjour",
  de: "Hallo",
  "zh-CN": "你好",
  "zh-TW": "你好",
  ko: "안녕하세요",
  pt: "Olá",
  it: "Ciao",
  ar: "مرحبًا",
  bn: "নমস্কার",
  te: "నమస్కారం",
  ta: "வணக்கம்",
  mr: "नमस्कार",
  gu: "નમસ્તે",
  kn: "ನಮಸ್ಕಾರ",
  ml: "നമസ്കാരം",
  ur: "السلام علیکم",
  nl: "Hallo",
  pl: "Cześć",
  ru: "Здравствуйте",
  tr: "Merhaba",
  vi: "Xin chào",
  th: "สวัสดี",
  id: "Halo",
  sv: "Hej",
  no: "Hei",
  da: "Hej",
  fi: "Hei",
  el: "Γεια σας",
  he: "שלום",
  cs: "Ahoj",
  ro: "Bună",
  hu: "Szia",
  uk: "Вітаю",
  sw: "Habari",
};
const languages = [...SUPPORTED_LANGUAGES].sort((a, b) => {
  const order = [...indian, ...asia];
  return (
    (order.includes(a.code) ? order.indexOf(a.code) : 99) -
    (order.includes(b.code) ? order.indexOf(b.code) : 99)
  );
});
function inGroup(code: string, group: number) {
  return (
    group === 0 ||
    (group === 1
      ? indian.includes(code)
      : group === 2
        ? asia.includes(code)
        : !indian.includes(code) && !asia.includes(code) && code !== "sw")
  );
}
export default function Act5LanguagesGrid() {
  const [group, setGroup] = useState(0);
  const [active, setActive] = useState("");
  return (
    <section className="kn-section kn-space languages" id="languages">
      <div className="kn-wrap">
        <div className="kn-kicker">
          <span className="kicker-line" />
          05 / Languages
        </div>
        <h2>
          38 languages ready today.
          <br />
          <em>Built for India and the world.</em>
        </h2>
        <p>
          From Telugu, Tamil, Hindi, Bengali, Marathi, Gujarati, Kannada, and
          Malayalam to Korean, Mandarin, Japanese, Spanish, Arabic, and French —
          with explicit source-language locking.
        </p>
        <div className="filter-pills" aria-label="Language regions">
          {groups.map((g, i) => (
            <button
              key={g}
              aria-pressed={i === group}
              onClick={() => {
                setGroup(i);
                setActive("");
              }}
            >
              {i === group && <motion.i layoutId="language-filter" />}
              <span>{g}</span>
            </button>
          ))}
        </div>
        <div className="language-grid">
          {languages
            .filter((l) => inGroup(l.code, group))
            .map(({ name, nativeName, code }) => (
              <button
                key={code}
                aria-label={name + " greeting: " + greetings[code]}
                aria-pressed={active === code}
                onFocus={() => setActive(code)}
                onPointerEnter={() => setActive(code)}
                onClick={() => setActive(code)}
              >
                <code>{code}</code>
                <strong lang={code} dir="auto">
                  {active === code ? greetings[code] : nativeName}
                </strong>
                <small>{name}</small>
              </button>
            ))}
        </div>
      </div>
    </section>
  );
}

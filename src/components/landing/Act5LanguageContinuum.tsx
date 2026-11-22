import { useState } from "react";
import { LockKeyhole } from "lucide-react";
const languages = [
  ["English", "en-US", "Let’s meet tomorrow."],
  ["తెలుగు", "te-IN", "రేపు కలుద్దాం."],
  ["हिन्दी", "hi-IN", "कल मिलते हैं।"],
  ["Español", "es-ES", "Nos vemos mañana."],
  ["日本語", "ja-JP", "また明日会いましょう。"],
  ["தமிழ்", "ta-IN", "நாளை சந்திப்போம்."],
  ["Français", "fr-FR", "Retrouvons-nous demain."],
  ["Deutsch", "de-DE", "Treffen wir uns morgen."],
  ["العربية", "ar-SA", "لنلتقِ غدًا."],
  ["中文", "zh-CN", "我们明天见吧。"],
  ["한국어", "ko-KR", "내일 만나요."],
  ["Português", "pt-BR", "Vamos nos encontrar amanhã."],
] as const;
export default function Act5LanguageContinuum() {
  const [selected, setLanguage] = useState<readonly [string, string, string]>(
      languages[1],
    ),
    [paused, setPaused] = useState(false);
  return (
    <section id="languages" className="kn-section kn-space language-section">
      <div className="kn-wrap">
        <div className="kn-kicker">05 / Languages</div>
        <h2>
          Built for regional nuance,
          <br />
          not just textbook English.
        </h2>
        <p>
          Explicit BCP-47 source-language locking anchors speech recognition
          from the very first syllable — so Telugu stays Telugu and never drifts
          mid-sentence.
        </p>
      </div>
      <div className={"language-ribbons" + (paused ? " paused" : "")}>
        {[languages.slice(0, 6), languages.slice(6)].map((row, r) => (
          <div key={r} className="language-lane">
            <div className="language-track">
              {[0, 1].map((copy) => (
                <div
                  className="language-set"
                  aria-hidden={copy ? true : undefined}
                  key={copy}
                >
                  {row.map((lang) => (
                    <button
                      tabIndex={copy ? -1 : 0}
                      key={lang[1]}
                      aria-pressed={selected[1] === lang[1]}
                      onMouseEnter={() => setLanguage(lang)}
                      onFocus={() => setLanguage(lang)}
                      onClick={() => setLanguage(lang)}
                    >
                      <strong lang={lang[1]}>{lang[0]}</strong>
                      <code>{lang[1]}</code>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="kn-wrap">
        <div className="language-preview">
          <div>
            <small>
              <LockKeyhole size={13} />
              BCP-47 Locked · {selected[1]}
            </small>
            <strong dir="auto" lang={selected[1]}>
              {selected[2]}
            </strong>
          </div>
          <span>↔</span>
          <div>
            <small>English · en-US</small>
            <strong>Let’s meet tomorrow.</strong>
          </div>
        </div>
        <button className="ribbon-control" onClick={() => setPaused(!paused)}>
          {paused ? "Resume" : "Pause"} language ribbons
        </button>
      </div>
    </section>
  );
}

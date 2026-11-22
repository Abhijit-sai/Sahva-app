import { useEffect, useRef, useState } from "react";
import { useSpring, useReducedMotion } from "motion/react";
import { Play, Square, SlidersHorizontal } from "lucide-react";
import AcousticWaveCanvas from "./AcousticWaveCanvas";
import { pairs, spring } from "./keynote";
export default function Act3InteractiveMixLab() {
  const [pairId, setPair] = useState(0),
    [amount, setAmount] = useState(15),
    [tone, setTone] = useState<"female" | "male">("female");
  const [progress, setProgress] = useState(-1),
    [error, setError] = useState("");
  const audio = useRef<AudioContext | null>(null),
    gain = useRef<GainNode | null>(null),
    tick = useRef(0);
  const panel = useRef<HTMLElement>(null);
  const level = useSpring(amount / 100, spring),
    reduce = useReducedMotion(),
    pair = pairs[pairId];
  const playing = progress >= 0;
  function release() {
    window.clearInterval(tick.current);
    gain.current = null;
    const ctx = audio.current;
    audio.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }
  function stop() {
    release();
    setProgress(-1);
  }
  useEffect(() => () => release(), []);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) stop();
    });
    if (panel.current) observer.observe(panel.current);
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    if (reduce) level.jump(amount / 100);
    else level.set(amount / 100);
    if (audio.current && gain.current)
      gain.current.gain.setTargetAtTime(
        amount / 100,
        audio.current.currentTime,
        0.025,
      );
  }, [amount, level, reduce]);
  async function preview() {
    if (audio.current) {
      stop();
      return;
    }
    setError("");
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      await ctx.resume();
      if (audio.current !== ctx) return;
      const bed = ctx.createGain();
      bed.gain.value = amount / 100;
      bed.connect(ctx.destination);
      gain.current = bed;
      const start = ctx.currentTime + 0.035,
        phrase = [0, 4, 7, 4, 2, 5, 2, 0],
        pace = 0.38;
      for (let i = 0; i < phrase.length; i++) {
        for (const original of [false, true]) {
          const osc = ctx.createOscillator(),
            env = ctx.createGain(),
            at = start + i * pace;
          osc.type = original ? "triangle" : "sine";
          const base =
            (original ? 174 : tone === "male" ? 220 : 293.66) *
            Math.pow(2, (phrase[i] + pairId * 2) / 12);
          osc.frequency.setValueAtTime(base, at);
          osc.frequency.exponentialRampToValueAtTime(base * 0.985, at + 0.28);
          env.gain.setValueAtTime(0.0001, at);
          env.gain.exponentialRampToValueAtTime(0.1, at + 0.045);
          env.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
          osc.connect(env);
          env.connect(original ? bed : ctx.destination);
          osc.start(at);
          osc.stop(at + 0.36);
        }
      }
      setProgress(0);
      tick.current = window.setInterval(() => {
        const p = (ctx.currentTime - start) / (phrase.length * pace);
        if (p >= 1) stop();
        else setProgress(Math.max(0, p));
      }, 45);
    } catch {
      stop();
      setError("Audio preview is unavailable in this browser.");
    }
  }
  return (
    <section id="mix-lab" ref={panel} className="kn-section kn-space">
      <div className="kn-wrap">
        <div className="kn-kicker">
          <SlidersHorizontal size={15} />
          03 / Mix lab
        </div>
        <h2>
          Experience the <em>100% / 15%</em> balance.
        </h2>
        <p>
          Toggle between pure translation and Sahva’s stacked mix, adjust the
          original voice bed, or switch natural voice tones.
        </p>
        <div className="mix-console">
          <div className="mix-head">
            <b>Acoustic mix console</b>
            <label>
              <span className="sr-only">Preview language pair</span>
              <select
                value={pairId}
                onChange={(e) => {
                  stop();
                  setPair(Number(e.target.value));
                }}
              >
                {pairs.map((p, i) => (
                  <option key={p.src} value={i}>
                    {p.from} → {p.to}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mix-grid">
            <div className="mix-monitor">
              <div className="mix-plot">
                <AcousticWaveCanvas
                  tone={tone}
                  phase={pairId}
                  bed={level}
                  playing={playing}
                />
                <span className="track one">Track 1 · Translated · 100%</span>
                <span className="track two">
                  Track 2 · Original voice bed · {amount}%
                </span>
              </div>
              <div className="transcript-strip">
                {[pair.original, pair.translated].map((line, j) => {
                  const words = line.split(line.includes(" ") ? " " : "");
                  return (
                    <p key={line} lang={j ? pair.dst : pair.src}>
                      {words.map((w, i) => (
                        <span
                          key={i}
                          className={
                            playing && Math.floor(progress * words.length) === i
                              ? "lit"
                              : ""
                          }
                        >
                          {w}
                          {line.includes(" ") ? " " : ""}
                        </span>
                      ))}
                    </p>
                  );
                })}
              </div>
            </div>
            <div className="mix-controls">
              <fieldset>
                <legend>Mix preset</legend>
                <div className="kn-pills">
                  {["100% / 15% Stack", "Translated Only"].map((p, i) => (
                    <button
                      key={p}
                      aria-pressed={i === 0 ? amount > 0 : amount === 0}
                      onClick={() => {
                        stop();
                        setAmount(i ? 0 : 15);
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="slide-control">
                Original voice bed <output>{amount}%</output>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </label>
              <fieldset>
                <legend>Voice tone</legend>
                <div className="kn-pills">
                  {(["female", "male"] as const).map((t) => (
                    <button
                      key={t}
                      aria-pressed={tone === t}
                      onClick={() => {
                        stop();
                        setTone(t);
                      }}
                    >
                      {t === "female" ? "Female · Kore" : "Male · Charon"}
                    </button>
                  ))}
                </div>
              </fieldset>
              <button
                className="kn-btn kn-primary"
                onClick={() => void preview()}
              >
                {playing ? <Square size={15} /> : <Play size={15} />}{" "}
                {playing ? "Stop preview" : "Play preview"}
              </button>
              <small>Harmonic audio demonstration</small>
              {error && <small role="status">{error}</small>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

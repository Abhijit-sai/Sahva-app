import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import {
  ArrowDown,
  ArrowUpRight,
  Download,
  AudioLines,
  Pause,
  Play,
} from "lucide-react";
import AcousticWaveCanvas from "./AcousticWaveCanvas";
import { ease, pairs } from "./keynote";

export default function Act1Hero({ signedIn }: { signedIn: boolean }) {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false);
  const ref = useRef<HTMLElement>(null),
    visible = useInView(ref);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || paused || !visible) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % pairs.length),
      4200,
    );
    return () => clearInterval(timer);
  }, [reduce, paused, visible]);
  const pair = pairs[index];
  function entrance(delay: number) {
    return {
      initial: reduce ? (false as const) : { opacity: 0, y: 18 },
      animate: { opacity: 1, y: 0 },
      transition: {
        duration: reduce ? 0 : 0.64,
        delay: reduce ? 0 : delay,
        ease,
      },
    };
  }
  return (
    <section id="intro" className="kn-hero" ref={ref}>
      <div className="hero-waves">
        <AcousticWaveCanvas mode="hero" phase={index * 0.22} />
      </div>
      <div className="hero-content">
        <motion.div {...entrance(0)} className="kn-kicker">
          <AudioLines size={17} /> Sahva · Real-time multilingual voice
        </motion.div>
        <h1>
          <span>
            <motion.span {...entrance(0.08)}>Two languages.</motion.span>
          </span>
          <span>
            <motion.span {...entrance(0.18)}>
              One natural conversation.
            </motion.span>
          </span>
        </h1>
        <motion.p {...entrance(0.28)} className="hero-description">
          Speak comfortably in your own language. Sahva translates every word
          live — keeping 15% of the speaker’s real voice underneath — then turns
          the entire call into notes and action items in your language.
        </motion.p>
        <motion.div {...entrance(0.38)} className="phrase-card">
          <div className="phrase-toolbar">
            <span>
              <i className="live-dot" />
              Live interpretation
            </span>
            <div>
              {pairs.map((p, i) => (
                <button
                  key={p.src}
                  onClick={() => {
                    setIndex(i);
                    setPaused(true);
                  }}
                  aria-label={"Show " + p.from + " to " + p.to}
                  aria-pressed={index === i}
                >
                  <i />
                </button>
              ))}
              {!reduce && (
                <button
                  onClick={() => setPaused(!paused)}
                  aria-label={paused ? "Resume phrases" : "Pause phrases"}
                >
                  {paused ? <Play size={11} /> : <Pause size={11} />}
                </button>
              )}
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              className="phrase-body"
              initial={{ opacity: 0, y: reduce ? 0 : 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.16 }}
            >
              <div className="quote">
                <small>
                  <i className="voice-dot coral" />
                  {pair.speaker} · {pair.from}
                </small>
                <q lang={pair.src}>{pair.original}</q>
              </div>
              <div className="phrase-bridge">
                <div>
                  <AcousticWaveCanvas mode="mini" phase={index} />
                </div>
                <b>{pair.codes}</b>
              </div>
              <div className="quote">
                <small>
                  <i className="voice-dot ocean" />
                  {pair.listener} · {pair.to}
                </small>
                <q lang={pair.dst}>{pair.translated}</q>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
        <motion.div {...entrance(0.52)} className="kn-actions">
          <a className="kn-btn kn-primary" href="/app">
            {signedIn ? "Open Sahva" : "Start on Web"}{" "}
            <ArrowUpRight size={17} />
          </a>
          <a
            href={import.meta.env.VITE_ANDROID_APK_URL || "#platforms"}
            className="kn-btn kn-outline"
          >
            <Download size={16} /> Download Android APK
          </a>
        </motion.div>
      </div>
      <motion.a {...entrance(0.65)} href="#idea" className="hero-cue">
        <ArrowDown size={14} /> Scroll to see how it works
      </motion.a>
    </section>
  );
}

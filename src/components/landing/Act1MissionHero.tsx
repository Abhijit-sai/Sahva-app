import { useReducedMotion } from "./keynote";
import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ArrowDown,
  ArrowUpRight,
  AudioLines,
  Download,
  Globe2,
  Layers3,
  Pause,
  Play,
  Radio,
  Zap,
} from "lucide-react";
import AcousticWaveCanvas from "./AcousticWaveCanvas";
import { ease, spring } from "./keynote";

function Counter({ value }: { value: number }) {
  const node = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const animation = animate(0, value, {
      duration: 1,
      ease,
      onUpdate(v) {
        if (node.current) node.current.textContent = String(Math.round(v));
      },
    });
    return () => animation.stop();
  }, [value, reduced]);
  return <span ref={node}>{value}</span>;
}

export default function Act1MissionHero({ signedIn }: { signedIn: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const energy = useSpring(scrollYProgress, spring);
  const offset = useTransform(energy, [0, 1], [0, -24]);
  return (
    <section ref={ref} id="mission" className="mission">
      <div className="mission-backdrop">
        <AcousticWaveCanvas energy={energy} paused={paused} backdrop />
      </div>
      <div className="kn-wrap mission-inner">
        <div className="hero-grid">
          <div className="hero-copy">
            <motion.div
              className="kn-kicker"
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: 1 }}
            >
              <span className="kicker-line" />
              Breaking 100 million language walls
            </motion.div>
            <h1>
              {["Talk to anyone", "in your language."].map((line, i) => (
                <span className="headline-mask" key={line}>
                  <motion.span
                    initial={{ y: reduced ? 0 : "105%" }}
                    animate={{ y: 0 }}
                    transition={{
                      duration: reduced ? 0 : 0.68,
                      delay: reduced ? 0 : i * 0.075,
                      ease,
                    }}
                  >
                    {line}
                  </motion.span>
                </span>
              ))}
            </h1>
            <p>
              Sahva translates messages, voice notes, and live calls so each
              person can read or listen in their own language.
            </p>
            <div className="kn-actions">
              <a className="kn-btn kn-primary" href="/app">
                {signedIn ? "Open Sahva" : "Launch Web App"}
                <ArrowUpRight size={16} />
              </a>
              <a
                className="kn-btn kn-outline"
                href={import.meta.env.VITE_ANDROID_APK_URL || "#platforms"}
              >
                <Download size={15} />
                Download Android APK
              </a>
            </div>
          </div>
          <motion.figure
            className="signal"
            style={{ y: reduced ? 0 : offset }}
            aria-label="Illustrated Telugu to Korean live audio stream"
          >
            <figcaption>
              <span>
                <Radio size={14} /> Live voice engine
              </span>
              <small>
                <i className="live-dot" /> Demo
              </small>
            </figcaption>
            <div className="signal-plot">
              <div className="signal-channel input-channel">
                <i />
                Voice A <b>te-IN</b>
              </div>
              <AcousticWaveCanvas energy={energy} paused={paused} />
              <div className="signal-channel output-channel">
                <i />
                Voice B <b>ko-KR</b>
              </div>
            </div>
            <div className="signal-readout">
              <span>
                <AudioLines size={16} /> Full-duplex stream
              </span>
              <b>~450 ms</b>
              {!reduced && (
                <button
                  type="button"
                  aria-label={
                    paused ? "Resume wave animation" : "Pause wave animation"
                  }
                  onClick={() => setPaused(!paused)}
                >
                  {paused ? <Play size={13} /> : <Pause size={13} />}
                </button>
              )}
            </div>
          </motion.figure>
        </div>
        <footer className="mission-footer" aria-label="Mission in numbers">
          <div className="metric-strip">
            {(
              [
                [
                  Globe2,
                  121,
                  "",
                  "+",
                  "Major Indian languages",
                  "& 7,000+ worldwide",
                ],
                [
                  Zap,
                  600,
                  "<",
                  "ms",
                  "Direct streaming",
                  "voice-to-voice onset",
                ],
                [
                  Layers3,
                  100,
                  "",
                  "M",
                  "Language walls",
                  "we set out to break",
                ],
              ] as const
            ).map(([Icon, value, prefix, unit, label, suffix]) => (
              <div className="metric" key={label}>
                <div
                  className="metric-value"
                  aria-label={prefix + value + unit}
                >
                  <Icon aria-hidden="true" size={20} />
                  <span aria-hidden="true">
                    {prefix}
                    <Counter value={value} />
                    {unit}
                  </span>
                </div>
                <p>
                  {label}
                  <br />
                  {suffix}
                </p>
              </div>
            ))}
          </div>
          <div className="hero-foot">
            <a href="#impact">
              <ArrowDown size={14} /> Explore the story
            </a>
            <span>
              01 <i /> 06
            </span>
          </div>
        </footer>
      </div>
    </section>
  );
}

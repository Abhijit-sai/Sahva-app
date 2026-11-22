import { useReducedMotion } from "./keynote";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import {
  ArrowRight,
  AudioLines,
  Cable,
  Database,
  Languages,
  RotateCcw,
} from "lucide-react";

const nodes = [
  {
    title: "Full-duplex audio",
    host: "Client",
    icon: AudioLines,
    detail:
      "Isolated capture sends 16 kHz PCM from the microphone with zero self-echo. Incoming 24 kHz audio uses Authentic Voice Layering and matched male or female tones.",
  },
  {
    title: "Language fan-out",
    host: "WebSocket server",
    icon: Cable,
    detail:
      "The server groups listeners by target language in translatorsByLang. A five-person, four-language call reuses translation sessions for listeners who share a language.",
  },
  {
    title: "Source-language lock",
    host: "Gemini Live engine",
    icon: Languages,
    detail:
      "Explicit BCP-47 anchors keep the source language steady within a sentence. Regional tags include te-IN, hi-IN, ta-IN, ko-KR, and zh-CN.",
  },
  {
    title: "Call memory & signaling",
    host: "PostgreSQL + AWS S3",
    icon: Database,
    detail:
      "The server aligns the 16 kHz WAV mix to the millisecond and supports HTTP 206 playback. Each listener gets localized Meeting Notes. Web signaling and Android CallStyle carry the next incoming call.",
  },
] as const;
const stack = [
  "Gemini Live Audio (BidiGenerateContent)",
  "Web Audio Full-Duplex PCM",
  "React + Capacitor Android",
  "Node.js WebSockets",
  "Clerk Auth",
  "AWS RDS PostgreSQL",
  "AWS S3",
];
const races = [
  {
    name: "Legacy 3-hop waterfall",
    metric: "~3.4 s",
    seconds: 3.4,
    stages: ["Wait for silence", "STT", "Text LLM", "TTS"],
  },
  {
    name: "Sahva full-duplex stream",
    metric: "~450 ms",
    seconds: 0.45,
    stages: [
      "16 kHz PCM mic",
      "Bidirectional live audio engine",
      "24 kHz translated audio",
    ],
  },
];

export default function Act3ArchitectureEngine() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, amount: 0.25 });
  const reduced = useReducedMotion();
  const [replay, setReplay] = useState(0);
  const [active, setActive] = useState(0);
  return (
    <section id="architecture" className="kn-section kn-space">
      <div className="kn-wrap">
        <div className="kn-kicker">
          <span className="kicker-line" />
          03 / Architecture
        </div>
        <h2>Engineered for real-time human rhythm.</h2>
        <p>
          Legacy translation pipelines wait for you to stop speaking,
          transcribe, translate, and re-synthesize — adding 3 to 5 seconds of
          awkward silence. Sahva streams raw audio directly end-to-end.
        </p>
        <div ref={ref} className="race-card">
          <header>
            <h3>Voice-to-voice onset</h3>
            <button
              className="small-btn"
              onClick={() => setReplay((v) => v + 1)}
            >
              <RotateCcw size={14} />
              Replay Comparison
            </button>
          </header>
          <div key={replay}>
            {races.map(({ name, metric, seconds, stages }, i) => (
              <div className={"race-track track-" + i} key={name}>
                <div className="race-title">
                  <b>{name}</b>
                  <code>{metric}</code>
                </div>
                <div className="race-line">
                  <motion.i
                    initial={{ scaleX: reduced ? 1 : 0 }}
                    animate={{ scaleX: visible || reduced ? 1 : 0 }}
                    transition={{
                      duration: reduced ? 0 : seconds,
                      ease: "linear",
                    }}
                  />
                </div>
                <div className="race-stages">
                  {stages.map((stage, n) => (
                    <span key={stage}>
                      {n > 0 && <ArrowRight size={12} />} {stage}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <h3 className="flow-title">Inside the audio engine</h3>
        <div className="node-flow" aria-label="Architecture nodes">
          {nodes.map(({ title, host, icon: Icon }, i) => (
            <button
              key={title}
              onClick={() => setActive(i)}
              aria-pressed={active === i}
            >
              <Icon size={21} />
              <small>{host}</small>
              <b>{title}</b>
              {i < 3 && <i className="packet" />}
            </button>
          ))}
        </div>
        <div className="node-detail" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={active}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {nodes[active].detail}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="stack">
          {stack.map((item) => (
            <code key={item}>{item}</code>
          ))}
        </div>
      </div>
    </section>
  );
}

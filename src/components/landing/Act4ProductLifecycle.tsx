import { useReducedMotion } from "./keynote";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import {
  Archive,
  ArrowRight,
  AudioLines,
  Bell,
  Check,
  Download,
  LockKeyhole,
  Pause,
  Phone,
  Play,
} from "lucide-react";
import farmer from "../../assets/images/keynote/vizag-farmer.webp";
import buyer from "../../assets/images/keynote/seoul-buyer.webp";
import agent from "../../assets/images/keynote/maya.webp";
import { useChapterSteps } from "./keynote";

export const people = [
  { name: "Vizag Farmer", lang: "Telugu", photo: farmer },
  { name: "Seoul Buyer", lang: "Korean", photo: buyer },
  { name: "Freight Agent", lang: "English", photo: agent },
];
const steps = [
  [
    "Bilingual message translation",
    "Type in Telugu. Your buyer reads in Korean, with the original message one glance away.",
  ],
  [
    "Audio message translation",
    "Record in Telugu. Hear the translated voice note and compare it with the original script.",
  ],
  [
    "Real-time multi-person calls",
    "Three people share one room. Each hears the conversation in their own language.",
  ],
  [
    "Localized notes & full recording",
    "Revisit the same agreement from either side of the call, down to the loading date.",
  ],
  [
    "Synced action list & reminders",
    "The conversation becomes a shared commitment, with an owner and a reminder.",
  ],
];
const tabs = [
  ["Messages", 0],
  ["Call", 2],
  ["Meeting Notes", 3],
  ["Actions", 4],
] as const;
const task = "Upload phytosanitary certificate by Wed 5 PM";
const callFile = "/audio/vizag-seoul-demo.wav";
const noteFile = "/audio/vizag-voice-note.wav";
function timestamp(seconds: number) {
  return [Math.floor(seconds / 60), Math.floor(seconds % 60)]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function AudioPlayer({ recording = false }: { recording?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(recording ? 258 : 0);
  const [error, setError] = useState(false);
  const file = recording ? callFile : noteFile;
  const label = recording ? "recording" : "voice note";
  const container = useRef<HTMLDivElement>(null);
  const visible = useInView(container);
  useEffect(() => {
    if (!visible) ref.current?.pause();
  }, [visible]);
  return (
    <div ref={container} className="demo-player">
      <audio
        ref={ref}
        src={file}
        preload="metadata"
        onError={() => setError(true)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        aria-label={(playing ? "Pause " : "Play ") + label}
        onClick={() =>
          playing
            ? ref.current?.pause()
            : ref.current?.play().catch(() => setError(true))
        }
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <input
        type="range"
        aria-label={"Seek " + label}
        min={0}
        max={duration || 1}
        step={0.1}
        value={time}
        onChange={(e) => {
          if (ref.current && duration) {
            ref.current.currentTime = Number(e.target.value);
            setTime(ref.current.currentTime);
          }
        }}
      />
      <time>
        {timestamp(time)} / {timestamp(duration)}
      </time>
      {recording && (
        <a
          href={file}
          download="sahva-vizag-seoul-demo.wav"
          aria-label="Download recording as WAV"
        >
          <Download size={13} /> .wav
        </a>
      )}
      {error && <small role="status">Audio unavailable.</small>}
    </div>
  );
}

function Chat({ voice }: { voice: boolean }) {
  const [original, setOriginal] = useState(false);
  return (
    <div className="demo-chat">
      <div className="frame-heading">
        <img src={buyer} alt="" />
        <div>
          <b>Seoul Buyer</b>
          <small>Korean ↔ Telugu</small>
        </div>
      </div>
      <div className="bubble incoming">
        <small>Seoul Buyer · translated to Telugu</small>
        <b lang="te">గురువారం లోడ్ చేయగలరా?</b>
        <span lang="ko">목요일에 선적할 수 있나요?</span>
      </div>
      {voice ? (
        <div className="bubble outgoing">
          <small>Vizag Farmer · translated voice note</small>
          <AudioPlayer />
          <div className="kn-pills">
            {["Transcript", "Original"].map((label, i) => (
              <button
                key={label}
                aria-pressed={original === Boolean(i)}
                onClick={() => setOriginal(Boolean(i))}
              >
                {label}
              </button>
            ))}
          </div>
          <span lang={original ? "te" : "en"}>
            {original
              ? "Vizag పోర్ట్‌లో గురువారం 20 టన్నులు సిద్ధం."
              : "Twenty tons are ready for Thursday loading at Vizag Port."}
          </span>
        </div>
      ) : (
        <div className="bubble outgoing">
          <small>Vizag Farmer · delivered in Korean</small>
          <b lang="ko">목요일에 20톤을 선적할 수 있습니다.</b>
          <span lang="te">గురువారం 20 టన్నులు లోడ్ చేయవచ్చు.</span>
        </div>
      )}
    </div>
  );
}
const captions = [
  [
    "Vizag Farmer",
    "గురువారం 20 టన్నులు సిద్ధం.",
    "Twenty tons are ready for Thursday.",
  ],
  ["Seoul Buyer", "등급을 확인해 주세요.", "Please confirm the grade."],
  ["Freight Agent", "Loading is confirmed.", "లోడింగ్ నిర్ధారించబడింది."],
];
function Call() {
  const [state, setState] = useState<"ringing" | "active" | "declined">(
    "ringing",
  );
  const [line, setLine] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (state !== "active" || !visible || reduced) return;
    const timer = window.setInterval(
      () => setLine((v) => (v + 1) % captions.length),
      3600,
    );
    return () => clearInterval(timer);
  }, [state, visible, reduced]);
  return (
    <div ref={ref}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {state === "active" ? (
            <div className="demo-stage">
              <div className="micro">
                <i className="live-dot" />
                Translated call · 3 participants
              </div>
              <div className="speakers">
                {people.map((p) => (
                  <div key={p.name}>
                    <img alt="" src={p.photo} />
                    <b>{p.name}</b>
                    <small>{p.lang}</small>
                  </div>
                ))}
              </div>
              <div className="kn-pills">
                <small className="note-chip">
                  <AudioLines size={13} />
                  Authentic Voice Layering
                </small>
                <small className="note-chip">
                  <Check size={13} />
                  Zero self-echo
                </small>
              </div>
              <div className="captions">
                <small>Live captions · {captions[line][0]}</small>
                <b>{captions[line][1]}</b>
                <span>{captions[line][2]}</span>
              </div>
            </div>
          ) : (
            <div className="demo-ring">
              <img src={agent} alt="" />
              <small>
                {state === "ringing" ? "Incoming Sahva call" : "Call declined"}
              </small>
              <h3>Freight Agent</h3>
              <span>English ↔ Telugu</span>
              <div>
                {state === "ringing" ? (
                  <>
                    <button onClick={() => setState("active")}>
                      <Phone size={14} />
                      Answer
                    </button>
                    <button onClick={() => setState("declined")}>
                      Decline
                    </button>
                  </>
                ) : (
                  <button onClick={() => setState("ringing")}>
                    Replay ring
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Notes() {
  const [te, setTe] = useState(false);
  const terms = te
    ? [
        ["సరుకు", "20 టన్నుల గుంటూరు మిరపకాయలు"],
        ["లోడింగ్", "గురువారం · విశాఖపట్నం పోర్ట్"],
        ["ధర", "అంగీకరించిన కోట్ ప్రకారం"],
      ]
    : [
        ["Cargo", "20 tons of Guntur chillies"],
        ["Loading", "Thursday · Vizag Port"],
        ["Price", "As agreed in the quotation"],
      ];
  return (
    <div className="demo-notes">
      <div className="kn-pills">
        {["View as Farmer (Telugu)", "View as Buyer (English)"].map(
          (label, i) => (
            <button
              key={label}
              aria-pressed={te === (i === 0)}
              onClick={() => setTe(i === 0)}
            >
              {label}
            </button>
          ),
        )}
      </div>
      <div lang={te ? "te" : "en"}>
        <h3>{te ? "సమావేశ సారాంశం" : "Meeting summary"}</h3>
        <p>
          {te
            ? "రైతు, కొనుగోలుదారు సరుకు గ్రేడ్, ధర మరియు లోడింగ్ తేదీని ఖరారు చేశారు."
            : "The farmer and buyer confirmed the grade, price, and loading date."}
        </p>
        <dl>
          {terms.map(([term, v]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <small className="micro">
        {te ? "పూర్తి కాల్ రికార్డింగ్" : "Full call recording"} · Demo
      </small>
      <AudioPlayer recording />
    </div>
  );
}

function Tasks({
  archived,
  archive,
}: {
  archived: boolean;
  archive: () => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="demo-tasks">
      <small className="micro">
        <Bell size={14} />
        Synced after the call
      </small>
      <h3>Action list</h3>
      <AnimatePresence initial={false}>
        {!archived && (
          <motion.div className="task-card" exit={{ x: 56, opacity: 0 }}>
            <label>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>{task}</span>
            </label>
            <small className="note-chip">
              <Bell size={12} />
              Wed · 5 PM IST
            </small>
            {checked && (
              <button className="archive-btn" onClick={archive}>
                <Archive size={14} />
                Archive
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {archived && (
        <details open>
          <summary>Archived (1)</summary>
          <p>
            <Check size={14} />
            {task}
          </p>
        </details>
      )}
    </div>
  );
}
export default function Act4ProductLifecycle() {
  const { ref, step, select, pinned } = useChapterSteps(steps.length);
  const [archived, setArchived] = useState(false);
  return (
    <section
      id="product"
      ref={ref}
      className={"kn-section kn-walk " + (pinned ? "is-pinned" : "")}
    >
      <div className="kn-stage">
        <div className="kn-wrap walk-grid">
          <div>
            <div className="kn-kicker">
              <span className="kicker-line" />
              04 / Product
            </div>
            <h2>From first message to follow-up.</h2>
            <div className="chapter-menu">
              {steps.map(([title, copy], i) => (
                <button
                  key={title}
                  aria-pressed={step === i}
                  onClick={() => select(i)}
                >
                  <code>0{i + 1}</code>
                  <span>
                    {title}
                    {step === i && <small>{copy}</small>}
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </div>
          <div className="walk-demo">
            <p className="mobile-narrative">{steps[step][1]}</p>
            <div className="app-frame">
              <header>
                <span>
                  <i className="live-dot" />
                  Vizag ↔ Seoul
                </span>
                <LockKeyhole size={14} />
              </header>
              <div className="frame-tabs">
                {tabs.map(([title, index]) => {
                  const selected =
                    index === step || (index === 0 && step === 1);
                  return (
                    <button
                      key={title}
                      aria-pressed={selected}
                      onClick={() => select(index)}
                    >
                      {title}
                      {selected && <motion.i layoutId="product-tab" />}
                    </button>
                  );
                })}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  className="frame-content"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {step < 2 && <Chat voice={step === 1} />}{" "}
                  {step === 2 && <Call />} {step === 3 && <Notes />}{" "}
                  {step === 4 && (
                    <Tasks
                      archived={archived}
                      archive={() => setArchived(true)}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

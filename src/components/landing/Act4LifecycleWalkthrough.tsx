import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import {
  Archive,
  Check,
  Copy,
  Download,
  Mic,
  Pause,
  Phone,
  Play,
} from "lucide-react";
import maya from "../../assets/images/keynote/maya.webp";
import arjun from "../../assets/images/keynote/arjun.webp";
import kenji from "../../assets/images/keynote/kenji.webp";
import { ease, useChapterSteps } from "./keynote";

const chapters = [
  [
    "Ring & invite",
    "Ring teammates directly on Web or Android, or drop a single invite link for anyone to join in seconds.",
  ],
  [
    "The live call",
    "Two people or a full global room — every listener hears everyone else in their own comfortable language, with zero self-echo.",
  ],
  [
    "Messages & voice notes",
    "Between calls, keep moving. Send text or record a voice note — it arrives translated in both audio and text.",
  ],
  [
    "Notes & actions",
    "Hang up and everything is already captured: localized meeting notes, full call recording playback, and checkable tasks.",
  ],
] as const;
export const people = [
  { name: "Maya", lang: "English", photo: maya },
  { name: "Arjun", lang: "Telugu", photo: arjun },
  { name: "Kenji", lang: "Japanese", photo: kenji },
];
export function Meter() {
  return (
    <span className="meter" aria-hidden="true">
      {[0.35, 0.65, 0.95, 0.47, 0.8, 0.3, 0.6].map((n, i) => (
        <i
          key={i}
          style={{ height: 18 * n, animationDelay: i * -0.12 + "s" }}
        />
      ))}
    </span>
  );
}
const wav = "/audio/walkthrough-excerpt.wav";
function StageCaption() {
  const captions = [
    [
      "Arjun · తెలుగు",
      "ఐదు స్లైడ్స్ సిద్ధంగా ఉన్నాయి.",
      "The five slides are ready.",
    ],
    [
      "Kenji · 日本語",
      "明日、一緒に確認しましょう。",
      "Let’s review them together tomorrow.",
    ],
    [
      "Maya · English",
      "I’ll send the meeting notes.",
      "నేను సమావేశ వివరాలను పంపిస్తాను.",
    ],
  ];
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const reduced = useReducedMotion();
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (!visible || reduced) return;
    const timer = setInterval(() => setLine((index) => (index + 1) % 3), 3300);
    return () => clearInterval(timer);
  }, [visible, reduced]);
  return (
    <div ref={ref}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={line}
          className="stage-caption"
          initial={{ opacity: 0, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.16 }}
        >
          <b>{captions[line][0]}</b>
          <span>{captions[line][1]}</span>
          <strong>{captions[line][2]}</strong>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
function Recording() {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [error, setError] = useState("");
  function clock(sec: number) {
    return (
      Math.floor(sec / 60)
        .toString()
        .padStart(2, "0") +
      ":" +
      Math.floor(sec % 60)
        .toString()
        .padStart(2, "0")
    );
  }
  return (
    <div className="demo-recording">
      <small>Call recording · final excerpt</small>
      <audio
        ref={ref}
        preload="metadata"
        src={wav}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <div>
        <button
          aria-label={playing ? "Pause recording" : "Play recording"}
          onClick={() =>
            playing
              ? ref.current?.pause()
              : ref.current
                  ?.play()
                  .catch(() => setError("Playback unavailable"))
          }
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <input
          aria-label="Seek recording excerpt"
          type="range"
          min="0"
          max={duration || 1}
          step=".01"
          value={time}
          onChange={(e) => {
            if (ref.current && duration)
              ref.current.currentTime = Number(e.target.value);
          }}
        />
        <span>{clock(Math.min(258, 258 - duration + time))} / 04:18</span>
        <a
          aria-label="Download recording as WAV"
          download="sahva-call-excerpt.wav"
          href={wav}
        >
          <Download size={14} />
          .wav
        </a>
      </div>
      {error && <small>{error}</small>}
    </div>
  );
}
function Chat() {
  const [view, setView] = useState("Transcript");
  return (
    <div className="demo-chat">
      <div className="chat-bubble bg-blue-50 border-blue-200/80">
        <small>Maya · English</small>
        <b>ఐదు స్లైడ్స్ సిద్ధంగా ఉన్నాయి.</b>
        <span>The five slides are ready.</span>
      </div>
      <div className="chat-bubble outgoing bg-slate-100 border-slate-200/80">
        <small>Arjun · Voice note</small>
        <div className="voice-line">
          <Mic size={18} />
          <Meter />
        </div>
        <div className="kn-pills">
          {["Transcript", "Original"].map((t) => (
            <button
              aria-pressed={view === t}
              key={t}
              onClick={() => setView(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <span>
          {view === "Original"
            ? "రేపు డెక్ పంపిస్తాను."
            : "I’ll send the deck tomorrow."}
        </span>
      </div>
    </div>
  );
}
function Notes() {
  const [te, setTelugu] = useState(false),
    [checked, setChecked] = useState(false),
    [archived, setArchived] = useState(false);
  const reduced = useReducedMotion(),
    task = te ? "సవరించిన స్లైడ్స్ పంపండి" : "Share the revised slides";
  return (
    <div className="demo-notes">
      <button className="kn-chip" onClick={() => setTelugu(!te)}>
        {te ? "View as Arjun · Telugu" : "View as Maya · English"} ⇄
      </button>
      <h4 lang={te ? "te" : "en"}>
        {te ? "సమావేశ సారాంశం" : "Meeting summary"}
      </h4>
      <p lang={te ? "te" : "en"}>
        {te
          ? "ఐదు స్లైడ్స్‌తో ప్రదర్శనను సిద్ధం చేయాలని నిర్ణయించాం. అర్జున్ రేపు వాటిని పంపుతారు."
          : "The team agreed on a five-slide presentation. Arjun will share the revised deck tomorrow."}
      </p>
      <Recording />
      <div className="mini-tasks">
        <small>Action list</small>
        <AnimatePresence>
          {!archived && (
            <motion.div
              key="task"
              exit={{ x: reduced ? 0 : 45, opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.22 }}
            >
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                <span>{task}</span>
              </label>
              {checked && (
                <button
                  className="archive-btn"
                  onClick={() => setArchived(true)}
                >
                  <Archive size={13} />
                  Archive
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {archived && (
          <details>
            <summary>Archived (1)</summary>
            <span>{task}</span>
          </details>
        )}
      </div>
    </div>
  );
}
export default function Act4LifecycleWalkthrough() {
  const { ref, step, select, pinned } = useChapterSteps(4),
    reduced = useReducedMotion();
  const [copied, setCopied] = useState(false),
    [declined, setDeclined] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText("https://sahva.app/join/room-84k");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section
      id="walkthrough"
      ref={ref}
      className={"kn-section kn-walk " + (pinned ? "is-pinned" : "")}
    >
      <div className="kn-stage">
        <div className="kn-wrap walk-grid">
          <div>
            <div className="kn-kicker">04 / Walkthrough</div>
            <h2>From first ring to follow-up.</h2>
            <div className="chapter-menu">
              {chapters.map(([title, desc], i) => (
                <button
                  key={title}
                  aria-pressed={step === i}
                  onClick={() => select(i)}
                >
                  <b>0{i + 1}</b>
                  <span>
                    {title}
                    {step === i && <small>{desc}</small>}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="walk-demo">
            <div className="mobile-narrative">{chapters[step][1]}</div>
            <div className="app-frame">
              <div className="frame-tabs">
                {[
                  "Incoming call",
                  "Call stage",
                  "Messages",
                  "Meeting notes",
                ].map((title, i) => (
                  <button
                    key={title}
                    onClick={() => select(i)}
                    aria-pressed={step === i}
                  >
                    {title}
                    {step === i && <motion.i layoutId="walkthrough-tab" />}
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  className="frame-content"
                  initial={{ opacity: 0, x: reduced ? 0 : 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.15, ease }}
                >
                  {step === 0 && (
                    <div className="demo-ring">
                      <div className="ring-portrait">
                        <img src={maya} alt="Maya Lin" />
                      </div>
                      <strong>
                        {declined ? "Call declined" : "Maya Lin is calling"}
                      </strong>
                      <span>English ↔ Telugu</span>
                      {declined ? (
                        <button onClick={() => setDeclined(false)}>
                          Replay ring
                        </button>
                      ) : (
                        <div>
                          <button className="join" onClick={() => select(1)}>
                            <Phone size={14} />
                            Join Call
                          </button>
                          <button
                            className="decline"
                            onClick={() => setDeclined(true)}
                          >
                            Decline
                          </button>
                        </div>
                      )}
                      <button
                        className="invite-copy"
                        onClick={() => void copy()}
                      >
                        {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
                        {copied ? "Copied!" : "sahva.app/join/room-84k"}
                      </button>
                    </div>
                  )}
                  {step === 1 && (
                    <div className="demo-stage">
                      <div className="scope-top">
                        <span>Translated call</span>
                        <b>02:36</b>
                      </div>
                      <div className="speakers">
                        {people.map((p) => (
                          <div key={p.name}>
                            <img src={p.photo} alt="" />
                            <b>{p.name}</b>
                            <span>{p.lang}</span>
                            <Meter />
                          </div>
                        ))}
                      </div>
                      <small className="kn-chip">
                        Your mic · Outbound only
                      </small>
                      <StageCaption />
                    </div>
                  )}
                  {step === 2 && <Chat />}
                  {step === 3 && <Notes />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useMicrophoneAccess } from "./useMicrophoneAccess";
import { useEffect, useRef, useState } from "react";
import { Check, Mic, Volume2, Bell, ArrowRight } from "lucide-react";
import { notificationAccess, enableNotifications } from "../lib/notifications";
import { bridge, native } from "../lib/runtimeConfig";
import speakerChime from "../assets/audio/speaker-check.wav";

const checks = [
  { name: "Microphone", icon: Mic },
  { name: "Speaker", icon: Volume2 },
  { name: "Notifications", icon: Bell },
] as const;
type Outcome = "ready" | "skipped" | undefined;

export default function DeviceSetup({ finish, busy, name }: {
  finish: () => void; busy: boolean; name: string;
}) {
  const { requestMicrophone, cancel: cancelMicrophone, permissionDialog } = useMicrophoneAccess();
  const [outcomes, setOutcomes] = useState<Outcome[]>([undefined, undefined, undefined]);
  const step = outcomes.findIndex(value => !value);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [heard, setHeard] = useState(false);
  const [level, setLevel] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const stop = useRef<() => void>(() => {});
  const generation = useRef(0);

  useEffect(() => () => { generation.current++; stop.current(); }, []);
  useEffect(() => {
    if (step !== 2) return;
    let live = true;
    const check = () => { void notificationAccess().then(access => {
      if (!live) return;
      if (access === "granted") complete(2, "ready");
      else setBlocked(access === "denied");
    }).catch(() => {}); };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { live = false; window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [step]);

  function complete(index: number, value: Outcome) {
    generation.current++; stop.current(); stop.current = () => {};
    setOutcomes(old => old.map((entry, i) => i === index ? value : entry));
    setWorking(false); setHeard(false); setMessage(""); setLevel(0); setBlocked(false);
  }

  function checkSpeaker() {
    const attempt = ++generation.current;
    stop.current();
    setMessage(""); setHeard(false); setWorking(true);
    const audio = new Audio(speakerChime);
    const timeout = window.setTimeout(() => finishPlayback(false), 10000);
    function release() {
      window.clearTimeout(timeout);
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    function finishPlayback(played: boolean) {
      if (attempt !== generation.current) return;
      generation.current++;
      release();
      stop.current = () => {};
      setWorking(false);
      setHeard(played);
      setMessage(played ? "Heard the three notes? Confirm below. If it was quiet, check your media volume and connected headphones, then play it again."
        : "The test sound couldn’t play. Try again or skip for now.");
    }
    stop.current = release;
    audio.onended = () => finishPlayback(true);
    audio.onerror = () => finishPlayback(false);
    void audio.play().catch(() => finishPlayback(false));
  }

  async function checkMicrophone() {
    const attempt = ++generation.current;
    stop.current();
    let ctx: AudioContext | undefined;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const release = () => {
      clearInterval(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    };
    stop.current = () => { cancelMicrophone(); release(); };
    setMessage(""); setHeard(false); setWorking(true);
    try {
      ctx = new AudioContext();
      stream = await requestMicrophone({ audio: true });
      if (attempt !== generation.current) { release(); return; }
      await ctx.resume();
      if (attempt !== generation.current) { release(); return; }
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const started = performance.now();
      setMessage("Say hello in your language.");
      let detected = 0;
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, x) => sum + x*x, 0) / samples.length);
        setLevel(Math.min(100, rms * 700));
        if (rms > .004) detected++;
        if (detected >= 3 && performance.now() - started > 700) complete(0, "ready");
        else if (performance.now() - started > 5500) {
          release(); setWorking(false); setLevel(0); setMessage("No sound picked up. Try speaking closer to your microphone.");
        }
      }, 80);
    } catch (err) {
      release();
      if (attempt !== generation.current) return;
      setWorking(false);
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessage(err instanceof DOMException && err.name === "NotAllowedError"
        ? "Microphone access is off. You can allow it in settings or try again when you make a call."
        : "Couldn’t hear your microphone. Check your input and try again.");
    }
  }
  async function notifications() {
    const attempt = generation.current;
    setWorking(true); setMessage("");
    try {
      if (blocked && native) { await bridge.openNotificationSettings(); return; }
      const access = await enableNotifications();
      if (attempt !== generation.current) return;
      if (access === "granted") complete(2, "ready");
      else {
        setBlocked(access === "denied");
        setMessage(access === "unavailable" ? "This browser doesn’t support device alerts. You can still use Sahva here."
          : access === "denied" ? "Alerts are off in your device or site settings." : "You can turn on alerts later.");
      }
    } catch { if (attempt === generation.current) setMessage("Couldn’t enable alerts. Try again or skip for now."); }
    finally { if (attempt === generation.current) setWorking(false); }
  }
  return <>
    {permissionDialog}
    <ul className="setup-checklist" aria-label="Device checks">
      {checks.map(({ name: title, icon: Icon }, i) => <li key={title} className={step === i ? "current" : ""}>
        <Icon size={18} aria-hidden="true"/><span>{title}</span>
        <small>{outcomes[i] === "ready" ? <><Check size={14}/> Ready</> : outcomes[i] === "skipped" ? "Skipped" : step === i ? "Your turn" : "Up next"}</small>
      </li>)}
    </ul>
    <div className="setup-panel" aria-live="polite">
      <h2>{step === 0 ? "Let’s hear your voice" : step === 1 ? "Can you hear Sahva?" : step === 2 ? "Get call & message notifications" : `Welcome to Sahva, ${name.trim().split(/\s+/)[0]}!`}</h2>
      <p>{step === 0 ? "Allow your microphone and say a few words. This check stays on your device." : step === 1 ? "Play a short chime through your speaker or headphones." : step === 2 ? "Get an alert when someone calls or sends you a message." : "Your workspace is ready. Who would you like to talk to first?"}</p>
      {step === 0 && working && <meter min="0" max="100" value={level} aria-label="Microphone level"/>}
      {message && <p role="status">{message}</p>}
      {step === 1 && heard && <button type="button" onClick={() => complete(1,"ready")}><Check size={16}/> I heard it</button>}
      {step >= 0 ? <>
        <button type="button" className={heard ? "secondary" : ""} disabled={working} onClick={step === 0 ? checkMicrophone : step === 1 ? checkSpeaker : notifications}>
          {step === 0 ? working ? "Listening…" : "Check microphone" : step === 1 ? working ? "Playing…" : heard ? "Play again" : "Play test sound" : blocked ? native ? "Open notification settings" : "Retry notification permission" : working ? "Checking…" : "Enable notifications"}
        </button>
        <button type="button" className="setup-link" onClick={() => complete(step,"skipped")}>Skip for now</button>
      </> : <button className="setup-launch" disabled={busy} onClick={finish}>{busy ? "Opening your workspace…" : "Open my workspace"} <ArrowRight size={18}/></button>}
    </div>
  </>;
}

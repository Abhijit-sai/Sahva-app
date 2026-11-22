import { useReducedMotion } from "./keynote";
import { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import {
  ArrowUpRight,
  Download,
  Phone,
  RotateCcw,
  AudioLines,
  CloudCheck,
} from "lucide-react";
import BrandImage from "../BrandImage";
import LanguageWall from "./LanguageWall";
import farmer from "../../assets/images/keynote/vizag-farmer.webp";
import buyer from "../../assets/images/keynote/seoul-buyer.webp";
import { links } from "./LandingNavbar";
export default function Act6PlatformsAndFinale({
  signedIn,
}: {
  signedIn: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const offset = useTransform(scrollYProgress, [0, 1], [22, -22]);
  const [help, setHelp] = useState<"platforms" | "finale" | null>(null);
  const [phone, setPhone] = useState<"ringing" | "answered" | "declined">(
    "ringing",
  );
  const url =
    import.meta.env.VITE_ANDROID_APK_URL || "/downloads/sahva-test.apk";
  async function download(
    e: React.MouseEvent<HTMLAnchorElement>,
    location: "platforms" | "finale",
  ) {
    if (import.meta.env.VITE_ANDROID_APK_URL) return;
    e.preventDefault();
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (
        !response.ok ||
        !/android|octet-stream/i.test(
          response.headers.get("content-type") || "",
        )
      )
        throw Error();
      const a = document.createElement("a");
      a.href = url;
      a.download = "sahva-test.apk";
      a.click();
    } catch {
      setHelp(location);
    }
  }
  const apkNotice = (
    <div className="apk-help" role="status">
      The APK is not available here yet. Check the test builds in{" "}
      <a href="https://github.com/Abhijit-sai/Sahva-app/actions/workflows/android.yml">
        Android builds
      </a>
      , unzip the artifact, and install the APK on your phone.{" "}
      <button
        aria-label="Dismiss APK instructions"
        onClick={() => setHelp(null)}
      >
        ×
      </button>
    </div>
  );
  return (
    <section id="platforms" className="kn-section">
      <div className="kn-wrap launch-chapter" ref={ref}>
        <div className="launch-intro">
          <div className="kn-kicker">
            <span className="kicker-line" />
            06 / Launch
          </div>
          <h2>
            Call from your desk.
            <br />
            <em>Answer on the go.</em>
          </h2>
          <p>
            Join a Sahva room from any browser with a link. On Android,
            translated calls ring even when your screen is locked.
          </p>
          <div className="platform-actions">
            <a className="kn-btn kn-primary" href="/app">
              {signedIn ? "Open Sahva" : "Launch Web App"}
              <ArrowUpRight size={16} />
            </a>
            <a
              className="kn-btn kn-outline"
              href={url}
              onClick={(e) => download(e, "platforms")}
            >
              <Download size={15} />
              Android Test APK
            </a>
          </div>
          {help === "platforms" && apkNotice}
          <div className="platform-memory">
            <CloudCheck size={20} />
            <div>
              <b>Take your notes with you.</b>
              <p>
                Sign in on either device to find your meeting notes and call
                recordings.
              </p>
            </div>
          </div>
        </div>
        <div
          className="handoff-stage"
          role="group"
          aria-label="Interactive web to Android call demo"
        >
          <div className="handoff-legend">
            <AudioLines size={15} /> Web → Android <span>Call demo</span>
          </div>
          <div className="handoff-devices">
            <div className="handoff-web">
              <div className="handoff-chrome">
                <i />
                <i />
                <i />
                <span>sahva.madsoul.in/app</span>
              </div>
              <div className="handoff-web-head">
                <BrandImage />
                <small>Vizag · Web</small>
              </div>
              <div className="handoff-contact">
                <img src={buyer} alt="" />
                <div>
                  <small>
                    {phone === "ringing"
                      ? "Calling"
                      : phone === "answered"
                        ? "Connected to"
                        : "Call declined by"}
                  </small>
                  <strong>Seoul Buyer</strong>
                </div>
              </div>
              <div className="handoff-line">
                <AudioLines size={16} />
                <span>Telugu ↔ Korean</span>
              </div>
              <div className="handoff-caption" aria-live="polite">
                <small>
                  {phone === "answered"
                    ? "Translated from Korean"
                    : "Call status"}
                </small>
                <b lang={phone === "answered" ? "te" : "en"}>
                  {phone === "ringing"
                    ? "Ringing on Android…"
                    : phone === "answered"
                      ? "గురువారం కలుద్దాం."
                      : "No answer this time."}
                </b>
                {phone === "answered" && <span>Let’s meet on Thursday.</span>}
              </div>
            </div>
            <motion.div
              className="phone-frame handoff-phone"
              style={{ y: reduced ? 0 : offset }}
            >
              <i className="phone-camera" />
              <time>09:41</time>
              <div className="phone-contact">
                <img alt="" src={farmer} />
                <small>
                  {phone === "ringing"
                    ? "Incoming Sahva call"
                    : phone === "answered"
                      ? "Call connected"
                      : "Call declined"}
                </small>
                <b>Vizag Farmer</b>
                <span>Telugu ↔ Korean</span>
              </div>
              <div className="phone-controls">
                {phone === "ringing" ? (
                  <>
                    <button onClick={() => setPhone("declined")}>
                      <Phone size={15} />
                      Decline
                    </button>
                    <button onClick={() => setPhone("answered")}>
                      <Phone size={15} />
                      Answer
                    </button>
                  </>
                ) : (
                  <button onClick={() => setPhone("ringing")}>
                    <RotateCcw size={15} />
                    Replay call
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
      <div className="finale" id="finale">
        <LanguageWall />
        <div className="finale-emblem">
          <BrandImage variant="mark" alt="" />
        </div>
        <h2>
          100 Mn walls to break.
          <br />
          One conversation at a time.
        </h2>
        <p>Speak your language. Hear theirs in yours.</p>
        <div className="kn-actions">
          <a className="kn-btn warm" href="/app">
            {signedIn ? "Open Sahva" : "Launch Web App"}
            <ArrowUpRight size={17} />
          </a>
          <a
            className="kn-btn night"
            href={url}
            onClick={(e) => download(e, "finale")}
          >
            <Download size={16} />
            Download Android Test APK
          </a>
        </div>
        {help === "finale" && apkNotice}
        <footer className="kn-footer">
          <BrandImage variant="dark" />
          <nav aria-label="Footer">
            {links.map(([label, id]) => (
              <a key={id} href={"#" + id}>
                {label}
              </a>
            ))}
            <a href="/app">Launch App</a>
          </nav>
          <small>© 2026 Sahva</small>
        </footer>
      </div>
    </section>
  );
}

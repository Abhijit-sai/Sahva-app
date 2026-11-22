import { useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import {
  ArrowUpRight,
  Download,
  Phone,
  Monitor,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import BrandImage from "../BrandImage";
import { people } from "./Act4LifecycleWalkthrough";
import { links } from "./LandingNavbar";
export default function Act6PlatformAndFinale({
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
  const [help, setHelp] = useState(false);
  const url =
    import.meta.env.VITE_ANDROID_APK_URL || "/downloads/sahva-test.apk";
  async function download(e: React.MouseEvent<HTMLAnchorElement>) {
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
      setHelp(true);
    }
  }
  return (
    <section id="platforms" className="kn-section">
      <div className="kn-wrap kn-space platforms-grid" ref={ref}>
        <div>
          <div className="kn-kicker">06 / Launch</div>
          <h2>
            One conversation.
            <br />
            Any screen.
          </h2>
          <ul>
            {(
              [
                [
                  Monitor,
                  "Instant Web App",
                  "Open Sahva in a desktop or mobile browser.",
                ],
                [
                  Smartphone,
                  "Android Test APK",
                  "Native background ringing, even with the screen locked.",
                ],
                [
                  RefreshCw,
                  "One Synced Workspace",
                  "Clerk sign-in, PostgreSQL history, and S3 recordings across devices.",
                ],
              ] as const
            ).map(([Icon, title, desc]) => (
              <li key={title}>
                <Icon size={19} />
                <div>
                  <b>{title}</b>
                  <p>{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="device-stage">
          <div className="browser-frame">
            <div className="browser-chrome">
              <i />
              <i />
              <i />
              <span>sahva.madsoul.in/app</span>
            </div>
            <BrandImage />
            <h4>Messages</h4>
            {people.map((p) => (
              <div className="contact-row" key={p.name}>
                <img src={p.photo} alt="" />
                <span>
                  <b>{p.name}</b>
                  <small>{p.lang}</small>
                </span>
              </div>
            ))}
          </div>
          <motion.div
            className="phone-frame"
            style={{ y: reduced ? 0 : offset }}
          >
            <i />
            <time>09:41</time>
            <div>
              <Phone size={15} />
              <small>Incoming Sahva call</small>
              <b>Maya Lin</b>
              <span>English ↔ Telugu</span>
              <footer>
                <span>Decline</span>
                <span>Answer</span>
              </footer>
            </div>
          </motion.div>
        </div>
      </div>
      <div className="finale">
        <div className="finale-emblem">
          <BrandImage variant="mark" alt="" />
        </div>
        <h2>
          Every conversation,
          <br />
          without the language wall.
        </h2>
        <p>
          Launch Sahva in your browser now, or install the Android Test APK.
        </p>
        <div className="kn-actions">
          <a className="kn-btn warm" href="/app">
            {signedIn ? "Open Sahva" : "Launch Web App"}
            <ArrowUpRight size={17} />
          </a>
          <a className="kn-btn night" href={url} onClick={download}>
            <Download size={16} />
            Download Android Test APK
          </a>
        </div>
        {help && (
          <div className="apk-help" role="status">
            Get the test build from{" "}
            <a href="https://github.com/Abhijit-sai/Sahva-app/actions/workflows/android.yml">
              Android builds
            </a>
            , unzip the artifact, and install the APK on your phone.{" "}
            <button
              aria-label="Dismiss APK instructions"
              onClick={() => setHelp(false)}
            >
              ×
            </button>
          </div>
        )}
        <footer className="kn-footer">
          <BrandImage variant="dark" />
          <nav aria-label="Footer">
            {links.map(([label, id]) => (
              <a key={id} href={"#" + id}>
                {label}
              </a>
            ))}
            <a href="/app">Open App</a>
          </nav>
          <small>© 2026 Sahva</small>
        </footer>
      </div>
    </section>
  );
}

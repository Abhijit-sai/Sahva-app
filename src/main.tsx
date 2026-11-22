import { StrictMode, Suspense, lazy, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/react";
import { Capacitor } from "@capacitor/core";

import SahvaLogo from "./components/SahvaLogo";
import { base } from "./lib/runtimeConfig";
import "./index.css";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const Session = lazy(() => import("./components/Session"));
const nativePlatform = Capacitor.isNativePlatform();
if (
  !nativePlatform &&
  location.pathname === "/" &&
  new URLSearchParams(location.search).has("room")
) {
  history.replaceState(
    history.state,
    "",
    "/app" + location.search + location.hash,
  );
}
const showLanding = !nativePlatform && location.pathname === "/";
function LandingAuth({ update }: { update: (signedIn: boolean) => void }) {
  const { isSignedIn } = useAuth();
  useEffect(() => update(Boolean(isSignedIn)), [isSignedIn, update]);
  return null;
}

function Bootstrap() {
  const [signedIn, setSignedIn] = useState(false);
  const [key, setKey] = useState<string>(
      import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "",
    ),
    [error, E] = useState(""),
    [host, H] = useState("");
  const needsHost = Capacitor.isNativePlatform() && !base;
  useEffect(() => {
    if (key || needsHost) return;
    const c = new AbortController();
    fetch(base + "/public-config", { signal: c.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!d.publishableKey)
          throw Error("Set VITE_CLERK_PUBLISHABLE_KEY on the Sahva server.");
        setKey(d.publishableKey);
      })
      .catch((e) => {
        if (!c.signal.aborted) E(e.message);
      });
    return () => c.abort();
  }, [key, needsHost]);
  if (showLanding)
    return (
      <>
        <LandingPage signedIn={signedIn} />
        {key && (
          <ClerkProvider publishableKey={key}>
            <LandingAuth update={setSignedIn} />
          </ClerkProvider>
        )}
      </>
    );
  if (needsHost)
    return (
      <main className="entry">
        <form
          className="entry-card"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const url = new URL(host);
              if (url.protocol !== "https:" || url.username || url.password)
                throw Error("Enter your HTTPS deployment URL.");
              localStorage.setItem("sahva:test-server", url.origin);
              location.reload();
            } catch (e: any) {
              E(e.message);
            }
          }}
        >
          <h1>Connect to Sahva</h1>
          <label>
            Test server URL
            <input
              type="url"
              required
              placeholder="https://sahva.example.com"
              value={host}
              onChange={(e) => H(e.target.value)}
            />
          </label>
          <button>Connect</button>
          {error && <p role="alert">{error}</p>}
        </form>
      </main>
    );
  if (!key)
    return (
      <main className="entry">
        <section className="entry-card">
          <h1>
            <SahvaLogo />
          </h1>
          <p>{error || "Connecting…"}</p>
          {error && (
            <button
              onClick={() => {
                if (Capacitor.isNativePlatform())
                  localStorage.removeItem("sahva:test-server");
                location.reload();
              }}
            >
              Try again
            </button>
          )}
        </section>
      </main>
    );
  return (
    <ClerkProvider publishableKey={key}>
      <Session />
    </ClerkProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Bootstrap />
    </Suspense>
  </StrictMode>,
);

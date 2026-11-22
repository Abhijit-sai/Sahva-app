import SahvaLogo from "./SahvaLogo";
import { useEffect, useState } from "react";
import {
  HandleSSOCallback,
  SignIn,
  SignUp,
  useSignIn,
  useAuth,
  useClerk,
} from "@clerk/react";
import { App as NativeApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import LaunchScreen, { google, oauthDestination } from "./LaunchScreen";
import OnboardingFlow from "./OnboardingFlow";
import App from "../App";
import {
  bindToken,
  request,
  native,
  bridge,
  wsUrl,
  webOrigin,
} from "../lib/runtimeConfig";
import type { User } from "../db/schema";
function bytes(s: string) {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
}
export default function Session() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth(),
    clerk = useClerk(),
    { signIn } = useSignIn();
  const [me, M] = useState<User | null>(null),
    [error, E] = useState(""),
    [retry, R] = useState(0);
  const path = location.pathname;
  bindToken(getToken);
  useEffect(() => {
    if (!native || !signIn) return;
    let processing = false,
      alive = true;
    async function handle(url: string) {
      const u = new URL(url);
      if (
        !(
          (u.protocol === "sahva:" && u.host === "oauth-callback") ||
          (u.origin === webOrigin && u.pathname === "/oauth-callback")
        ) ||
        processing ||
        !alive
      )
        return;
      processing = true;
      try {
        const saved = JSON.parse(
          (await Preferences.get({ key: "oauth" })).value || "null",
        );
        if (
          !saved ||
          saved.state !== u.searchParams.get("state") ||
          saved.expires < Date.now()
        )
          throw Error("Sign-in expired. Try Google again.");
        const [wrapped, iv, cipher] = String(u.searchParams.get("code"))
          .split(".")
          .map(bytes);
        const priv = await crypto.subtle.importKey(
          "jwk",
          saved.key,
          { name: "RSA-OAEP", hash: "SHA-256" },
          false,
          ["decrypt"],
        );
        const raw = await crypto.subtle.decrypt(
          { name: "RSA-OAEP" },
          priv,
          wrapped,
        );
        const aes = await crypto.subtle.importKey(
          "raw",
          raw,
          "AES-GCM",
          false,
          ["decrypt"],
        );
        const ticket = new TextDecoder().decode(
          await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aes, cipher),
        );
        await Browser.close().catch(() => {});
        const result = await signIn.ticket({ ticket });
        if (result.error) throw result.error;
        if (signIn.status !== "complete")
          throw Error("Could not complete sign-in.");
        const finished = await signIn.finalize({ navigate: () => {} });
        if (finished.error) throw finished.error;
        await Preferences.remove({ key: "oauth" });
      } catch (e: any) {
        E(e.message);
      } finally {
        processing = false;
      }
    }
    const h = NativeApp.addListener("appUrlOpen", (e) => void handle(e.url));
    void NativeApp.getLaunchUrl().then((e) => e && handle(e.url));
    return () => {
      alive = false;
      void h.then((x) => x.remove());
    };
  }, [signIn]);
  useEffect(() => {
    let alive = true;
    M(null);
    if (!isSignedIn) {
      if (isLoaded && native) void bridge.stopCallListener();
      return;
    }
    if (path === "/native-login" || path === "/sso-callback") return;
    (async () => {
      const { user } = await request("/api/me");
      if (path.startsWith("/join/")) {
        const r = await request(
          "/api/join/" + encodeURIComponent(path.slice(6)),
          "POST",
          {},
        );
        history.replaceState(null, "", "/app?room=" + r.roomId);
      }
      if (alive) M(user);
    })().catch((e) => alive && E(e.message));
    return () => {
      alive = false;
    };
  }, [isSignedIn, userId, retry]);
  useEffect(() => {
    if (!native || !me?.onboardingCompleted) return;
    let alive = true;
    const sync = async () => {
      const authToken = await getToken();
      if (!authToken) return;
      const { grant } = await request("/api/native/listener-grant", "POST", {});
      if (alive)
        await bridge.startCallListener({
          wsUrl: wsUrl("/ws/user").href,
          authToken,
          userId: me.id,
          language: me.preferredLanguageName,
          grant,
        });
    };
    sync().catch((e) => E(e.message));
    const tick = setInterval(
      () =>
        getToken()
          .then((t) =>
            alive && t ? bridge.refreshAuthToken({ authToken: t }) : undefined,
          )
          .catch(() => {}),
      40000,
    );
    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, [me?.id, me?.onboardingCompleted, getToken]);
  if (path === "/sso-callback")
    return <HandleSSOCallback
      navigateToApp={({ decorateUrl }) => location.replace(decorateUrl(oauthDestination()))}
      navigateToSignIn={() => location.replace("/app/sign-in")}
      navigateToSignUp={() => location.replace("/app/sign-up")}
    />;
  if (path === "/app/sign-in")
    return <SignIn routing="hash" signUpUrl="/app/sign-up" forceRedirectUrl={oauthDestination()} />;
  if (path === "/app/sign-up")
    return <SignUp routing="hash" signInUrl="/app/sign-in" forceRedirectUrl={oauthDestination()} />;
  if (!isLoaded) return <main className="entry">Opening Sahva…</main>;
  if (error)
    return (
      <main className="entry">
        <section className="entry-card">
          <p role="alert">{error}</p>
          <button
            onClick={() => {
              E("");
              R(retry + 1);
            }}
          >
            Try again
          </button>
        </section>
      </main>
    );
  if (path === "/native-login" && !native) {
    const params = new URLSearchParams(location.search);
    return (
      <main className="entry">
        <section className="entry-card">
          <h1><SahvaLogo /></h1>
          <p>
            {isSignedIn
              ? "Continue with " +
                (clerk.user?.primaryEmailAddress?.emailAddress ||
                  "your account") +
                " on your phone."
              : "Sign in to continue on your phone."}
          </p>
          <button
            onClick={async () => {
              try {
                if (!isSignedIn) {
                  sessionStorage.setItem(
                    "sahva:oauthReturn",
                    location.pathname + location.search,
                  );
                  await google(signIn);
                  return;
                }
                const { code } = await request("/api/native/handoff", "POST", {
                  publicKey: JSON.parse(params.get("pub") || "null"),
                });
                sessionStorage.removeItem("sahva:oauthReturn");
                location.href =
                  "sahva://oauth-callback?" +
                  new URLSearchParams({
                    state: params.get("state") || "",
                    code,
                  });
              } catch (e: any) {
                E(e.message);
              }
            }}
          >
            {isSignedIn ? "Return to Sahva" : "Continue with Google"}
          </button>
        </section>
      </main>
    );
  }
  if (!isSignedIn) return <LaunchScreen />;
  if (!me) return <main className="entry">Loading your workspace…</main>;
  return me.onboardingCompleted ? (
    <App
      key={me.id}
      user={me}
      signOut={async () => {
        if (native) await bridge.stopCallListener();
        await clerk.signOut();
      }}
    />
  ) : (
    <OnboardingFlow user={me} done={M} />
  );
}

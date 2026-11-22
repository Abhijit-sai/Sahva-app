import { useState, type FormEvent } from "react";
import { useSignIn, useSignUp } from "@clerk/react";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { native, webOrigin } from "../lib/runtimeConfig";
import { requiresSignUpTransfer } from "../lib/signUpTransfer";
import { ArrowLeft, ArrowRight, AudioLines, Mail } from "lucide-react";
import BrandImage from "./BrandImage";
import farmer from "../assets/images/keynote/vizag-farmer.webp";
import buyer from "../assets/images/keynote/seoul-buyer.webp";
import "./launch-screen.css";

export function oauthDestination() {
  const saved = sessionStorage.getItem("sahva:oauthReturn");
  if (saved?.startsWith("/native-login?") || saved?.startsWith("/join/"))
    return saved;
  return "/app";
}

export async function google(signIn: ReturnType<typeof useSignIn>["signIn"]) {
  if (!signIn) return;
  if (!native) {
    if (location.pathname.startsWith("/join/"))
      sessionStorage.setItem("sahva:oauthReturn", location.pathname);
    else if (location.pathname !== "/native-login")
      sessionStorage.removeItem("sahva:oauthReturn");
    const { error } = await signIn.sso({
      strategy: "oauth_google",
      redirectCallbackUrl: "/sso-callback",
      redirectUrl: oauthDestination(),
    });
    if (error) throw Error(error.longMessage || error.message);
    return;
  }
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const state = crypto.randomUUID();
  await Preferences.set({
    key: "oauth",
    value: JSON.stringify({
      state,
      key: await crypto.subtle.exportKey("jwk", keys.privateKey),
      expires: Date.now() + 600000,
    }),
  });
  const url = new URL("/native-login", webOrigin);
  url.searchParams.set("state", state);
  url.searchParams.set(
    "pub",
    JSON.stringify(await crypto.subtle.exportKey("jwk", keys.publicKey)),
  );
  await Browser.open({ url: url.href });
}
export default function LaunchScreen() {
  const { signIn } = useSignIn(),
    { signUp } = useSignUp();
  const [step, setStep] = useState<"welcome" | "email" | "code">("welcome"),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!signIn || !signUp || busy) return;
    setBusy(true);
    setError("");
    try {
      if (step === "code") {
        const verified = await signIn.emailCode.verifyCode({ code });
        let attempt: typeof signIn | typeof signUp = signIn;
        if (requiresSignUpTransfer(verified.error)) {
          const created = await signUp.create({ transfer: true });
          if (created.error) throw created.error;
          attempt = signUp;
        } else if (verified.error) throw verified.error;
        if (attempt.status !== "complete")
          throw Error("Please complete account verification and try again.");
        const finished = await attempt.finalize({ navigate: () => {} });
        if (finished.error) throw finished.error;
        return;
      }
      const started = await signIn.create({
        identifier: email.trim(),
        signUpIfMissing: true,
      });
      if (started.error) throw started.error;
      const sent = await signIn.emailCode.sendCode();
      if (sent.error) throw sent.error;
      setCode("");
      setStep("code");
    } catch (e: any) {
      setError(
        e.longMessage ||
          e.message ||
          "Sign-in could not be completed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="launch-screen" data-step={step}>
      <div className="launch-shell">
        <BrandImage className="launch-logo" />
        <figure
          className="launch-conversation"
          aria-label="An example greeting translated from Telugu to Korean"
        >
          <div className="launch-portraits">
            <div>
              <img src={farmer} alt="A farmer taking a call in Vizag" />
              <span>Vizag</span>
            </div>
            <div>
              <img src={buyer} alt="A buyer answering in Seoul" />
              <span>Seoul</span>
            </div>
            <i aria-hidden="true">
              <AudioLines size={20} />
            </i>
          </div>
          <figcaption>
            <div>
              <small>Telugu</small>
              <strong lang="te">నమస్కారం.</strong>
            </div>
            <div>
              <small>Korean</small>
              <strong lang="ko">안녕하세요.</strong>
            </div>
          </figcaption>
        </figure>
        <section className="launch-auth" aria-labelledby="launch-heading">
          <h1 id="launch-heading">
            {step === "welcome"
              ? "Welcome to Sahva."
              : step === "email"
                ? "Continue with email"
                : "Check your email"}
          </h1>
          <p>
            {step === "welcome" ? (
              location.pathname.startsWith("/join/") ? (
                "Sign in to join the conversation."
              ) : (
                "Sign in to message or call someone in your own language."
              )
            ) : step === "email" ? (
              "We’ll email you a six-digit sign-in code."
            ) : (
              <>
                Enter the six-digit code sent to <b>{email.trim()}</b>.
              </>
            )}
          </p>
          {step === "welcome" ? (
            <div className="launch-actions">
              <button
                disabled={!signIn || busy}
                onClick={() => {
                  setError("");
                  setBusy(true);
                  google(signIn)
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Continue with Google <ArrowRight size={17} aria-hidden="true" />
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setStep("email");
                }}
              >
                <Mail size={17} aria-hidden="true" /> Continue with Email
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label>
                {step === "email" ? "Email address" : "Verification code"}
                <input
                  autoFocus
                  key={step}
                  type={step === "email" ? "email" : "text"}
                  inputMode={step === "email" ? "email" : "numeric"}
                  autoComplete={step === "email" ? "email" : "one-time-code"}
                  pattern={step === "code" ? "[0-9]{6}" : undefined}
                  maxLength={step === "code" ? 6 : 254}
                  required
                  disabled={busy}
                  value={step === "email" ? email : code}
                  onChange={(e) =>
                    step === "email"
                      ? setEmail(e.target.value)
                      : setCode(e.target.value)
                  }
                />
              </label>
              <button disabled={busy}>
                {step === "email"
                  ? busy
                    ? "Sending code…"
                    : "Send code"
                  : busy
                    ? "Verifying…"
                    : "Verify code"}
              </button>
              <button
                type="button"
                className="launch-back"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setStep(step === "code" ? "email" : "welcome");
                }}
              >
                <ArrowLeft size={15} aria-hidden="true" /> Back
              </button>
            </form>
          )}
          <div id="clerk-captcha" />
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </main>
  );
}

import { useEffect, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { unlockAlerts, releaseAlerts, messagePing, incomingRingtone } from "../lib/alertSounds";
import { showWebAlert } from "../lib/notifications";
import { native, bridge, openSocket, request } from "../lib/runtimeConfig";
interface Incoming {
  type: string;
  callSessionId: string;
  roomKey: string;
  expiresAt: string;
  caller: { name: string; languageName: string };
}
export default function IncomingCalls({
  language,
  onAnswer,
  onEvent,
  onError,
}: {
  language: string;
  onAnswer: (r: Incoming) => void;
  onEvent: (v: any) => void;
  onError: (s: string) => void;
}) {
  const [incoming, I] = useState<Incoming[]>([]),
    [busy, B] = useState(false);
  const active = incoming[0],
    handlers = useRef({ onAnswer, onEvent, onError });
  handlers.current = { onAnswer, onEvent, onError };

  useEffect(() => {
    let dead = false,
      ws: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout>,
      delay = 1000,
      version = 0;
    window.addEventListener("pointerdown", unlockAlerts, true);
    window.addEventListener("keydown", unlockAlerts, true);
    if (navigator.userActivation?.hasBeenActive) unlockAlerts();
    const seen = new Set<string>();
    function message(e: any) {
      if (dead) return;
      if (e.type === "conversation:changed" && e.notifyMessage && !seen.has(e.messageId)) {
        seen.add(e.messageId);
        if (seen.size > 256) seen.delete(seen.values().next().value!);
        if (native && !document.hidden) void bridge.messageFeedback().catch(messagePing);
        if (!native) messagePing();
        void showWebAlert("New Sahva message", { body: e.senderName || "Open your workspace to read it.", tag: "chat-" + e.messageId }).catch(() => {});
      }
      version++;
      if (e.type === "call:incoming" && Date.parse(e.expiresAt) > Date.now())
        I((old) =>
          old.some((r) => r.callSessionId === e.callSessionId)
            ? old
            : [...old, e],
        );
      else if (e.callSessionId)
        I((old) => old.filter((r) => r.callSessionId !== e.callSessionId));
      handlers.current.onEvent(e);
    }
    async function sync() {
      handlers.current.onEvent({ type: "user:sync" });
      const v = version;
      const rows: Incoming[] = await request("/api/calls/pending");
      if (dead) return;
      if (v === version) I(rows);
      if (native) {
        const action = await bridge.consumePendingCallAction();
        if (action.action === "answer") {
          const r = rows.find((r) => r.callSessionId === action.callSessionId);
          if (r) {
            await request(
              "/api/calls/" + r.callSessionId + "/answer",
              "POST",
              {},
            );
            I((prev) =>
              prev.filter((x) => x.callSessionId !== r.callSessionId),
            );
            handlers.current.onAnswer(r);
          }
        }
      }
    }
    const resume = () => {
      if (!document.hidden)
        void sync().catch((e) => handlers.current.onError(e.message));
    };
    async function connect() {
      try {
        const socket = await openSocket("/ws/user");
        if (dead) {
          socket.close();
          return;
        }
        ws = socket;
        socket.onopen = () => {
          delay = 1000;
          resume();
        };
        socket.onmessage = (e) => message(JSON.parse(e.data));
        socket.onclose = () => {
          if (!dead)
            timer = setTimeout(connect, (delay = Math.min(30000, delay * 2)));
        };
      } catch {
        if (!dead)
          timer = setTimeout(connect, (delay = Math.min(30000, delay * 2)));
      }
    }
    void connect();
    resume();
    document.addEventListener("visibilitychange", resume);
    const h = native
      ? NativeApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) resume();
        })
      : null;
    const deep = native ? NativeApp.addListener("appUrlOpen", resume) : null;
    return () => {
      dead = true;
      clearTimeout(timer);
      ws?.close();
      window.removeEventListener("pointerdown", unlockAlerts, true);
      window.removeEventListener("keydown", unlockAlerts, true);
      document.removeEventListener("visibilitychange", resume);
      void h?.then((x) => x.remove());
      void deep?.then((x) => x.remove());
      releaseAlerts();
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    const expire = setTimeout(
      () =>
        I((old) => old.filter((r) => r.callSessionId !== active.callSessionId)),
      Math.max(0, Date.parse(active.expiresAt) - Date.now()),
    );
    let disposeNotice: (() => void) | undefined, ended = false,
      stopTone: (() => void) | undefined;
    if (native) {
      void bridge.presentIncoming({ event: active }).then(({ handled }) => {
        if (!ended && !handled) stopTone = incomingRingtone();
      }).catch(() => { if (!ended) stopTone = incomingRingtone(); });
    } else {
      stopTone = incomingRingtone();
      if (
        document.hidden &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        void showWebAlert("Incoming Sahva call", {
          body: active.caller.name,
          tag: active.callSessionId,
        }).then(close => { if (ended) close?.(); else disposeNotice = close; }).catch(() => {});
      }
    }
    return () => {
      clearTimeout(expire);
      stopTone?.();
      ended = true;
      disposeNotice?.();
      if (native) void bridge.dismissIncoming({ id: active.callSessionId }).catch(() => {});
    };
  }, [active?.callSessionId]);
  if (!active) return null;
  async function act(answer: boolean) {
    B(true);
    try {
      await request(
        "/api/calls/" +
          active.callSessionId +
          (answer ? "/answer" : "/decline"),
        "POST",
        {},
      );
      I((old) => old.filter((r) => r.callSessionId !== active.callSessionId));
      if (answer) onAnswer(active);
    } catch (e: any) {
      onError(e.message);
    } finally {
      B(false);
    }
  }
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Incoming call"
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950 text-white text-center"
    >
      <div>
        <p className="text-slate-300">Incoming call</p>
        <h1 className="text-4xl my-5">{active.caller.name}</h1>
        <p className="font-mono">
          {active.caller.languageName} ↔ {language}
        </p>
        <div className="flex gap-4 justify-center mt-12">
          <button
            disabled={busy}
            className="bg-red-700 rounded-full px-6 py-3"
            onClick={() => act(false)}
          >
            Decline
          </button>
          <button
            disabled={busy}
            className="bg-green-700 rounded-full px-6 py-3"
            onClick={() => act(true)}
          >
            Join call
          </button>
        </div>
      </div>
    </section>
  );
}

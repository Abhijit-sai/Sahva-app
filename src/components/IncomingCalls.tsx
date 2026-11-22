import { useEffect, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
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
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => {
    let dead = false,
      ws: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout>,
      delay = 1000,
      version = 0;
    const unlock = () => {
      if (!native) {
        ctx.current ??= new AudioContext();
        void ctx.current.resume().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", unlock);
    function message(e: any) {
      if (dead) return;
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
      window.removeEventListener("pointerdown", unlock);
      document.removeEventListener("visibilitychange", resume);
      void h?.then((x) => x.remove());
      void deep?.then((x) => x.remove());
      void ctx.current?.close();
      ctx.current = null;
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    const expire = setTimeout(
      () =>
        I((old) => old.filter((r) => r.callSessionId !== active.callSessionId)),
      Math.max(0, Date.parse(active.expiresAt) - Date.now()),
    );
    let notice: Notification | undefined,
      interval: ReturnType<typeof setInterval> | undefined;
    const oscillators = new Set<OscillatorNode>();
    if (!native) {
      const ring = () => {
        const c = ctx.current;
        if (!c || c.state !== "running") return;
        for (const hz of [440, 480]) {
          const o = c.createOscillator(),
            g = c.createGain();
          o.frequency.value = hz;
          g.gain.setValueAtTime(0.001, c.currentTime);
          g.gain.exponentialRampToValueAtTime(0.055, c.currentTime + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.8);
          o.connect(g).connect(c.destination);
          o.start();
          o.stop(c.currentTime + 0.82);
          oscillators.add(o);
          o.onended = () => {
            oscillators.delete(o);
            o.disconnect();
            g.disconnect();
          };
        }
      };
      ring();
      interval = setInterval(ring, 2300);
      if (
        document.hidden &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        notice = new Notification("Incoming Sahva call", {
          body: active.caller.name,
          tag: active.callSessionId,
        });
        notice.onclick = () => window.focus();
      }
    }
    return () => {
      clearTimeout(expire);
      clearInterval(interval);
      notice?.close();
      oscillators.forEach((o) => o.stop());
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
        <p>
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

import { useEffect } from "react";
import type { ChatMessage } from "../types";
import { request } from "./runtimeConfig";

export function useReadReceipts(room: string, self: string, messages: ChatMessage[], showingChat: boolean,
  mobileThread: boolean, unread: number, refresh: () => Promise<unknown>) {
  const latest = messages.filter(m => m.roomId === room && m.senderId !== self && m.kind !== "call_summary").at(-1)?.id;
  useEffect(() => {
    if (!unread || !latest || !showingChat) return;
    let pending = false, disposed = false;
    const desktop = matchMedia("(min-width: 1024px)");
    const acknowledge = async () => {
      if (pending || disposed || document.hidden || !document.hasFocus() || document.querySelector("dialog[open], [aria-modal=true]") || (!desktop.matches && !mobileThread)) return;
      pending = true;
      try {
        await request("/api/conversations/" + encodeURIComponent(room) + "/read", "POST", { through: latest });
        if (!disposed) await refresh();
      } catch { /* Retry when connectivity or focus returns. */ }
      finally { pending = false; }
    };
    void acknowledge();
    window.addEventListener("focus", acknowledge);
    window.addEventListener("online", acknowledge);
    document.addEventListener("visibilitychange", acknowledge);
    desktop.addEventListener("change", acknowledge);
    return () => {
      disposed = true;
      window.removeEventListener("focus", acknowledge);
      window.removeEventListener("online", acknowledge);
      document.removeEventListener("visibilitychange", acknowledge);
      desktop.removeEventListener("change", acknowledge);
    };
  }, [room, latest, showingChat, mobileThread, unread, refresh]);
}

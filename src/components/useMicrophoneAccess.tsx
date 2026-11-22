import { useCallback, useEffect, useRef, useState } from "react";
import { native } from "../lib/runtimeConfig";

type Retry = { retry: () => void; busy: boolean };

export function useMicrophoneAccess() {
  const [retry, setRetry] = useState<Retry | null>(null);
  const pending = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useCallback(() => pending.current?.abort(), []);
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (retry && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [retry]);

  const requestMicrophone = useCallback((constraints: MediaStreamConstraints) => {
    cancel();
    const controller = new AbortController();
    pending.current = controller;
    return new Promise<MediaStream>((resolve, reject) => {
      const clear = () => {
        controller.signal.removeEventListener("abort", abort);
        pending.current = null;
        setRetry(null);
      };
      const abort = () => {
        clear();
        reject(new DOMException("Microphone request cancelled.", "AbortError"));
      };
      controller.signal.addEventListener("abort", abort, { once: true });
      let requesting = false;
      const acquire = async () => {
        if (requesting || controller.signal.aborted) return;
        requesting = true;
        setRetry(current => current && { ...current, busy: true });
        try {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is unavailable in this browser.");
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (controller.signal.aborted) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }
          clear();
          resolve(stream);
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!native && (error as Error)?.name === "NotAllowedError") {
            setRetry({ retry: acquire, busy: false });
          } else {
            clear();
            reject(error);
          }
        } finally { requesting = false; }
      };
      void acquire();
    });
  }, [cancel]);

  const permissionDialog = retry && (
    <dialog ref={dialog} aria-label="Microphone access" className="m-auto w-[min(90vw,24rem)] rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
      onCancel={event => { event.preventDefault(); cancel(); }}>
      <h2 className="text-lg font-semibold">Allow microphone access</h2>
      <p className="my-3 text-sm leading-relaxed">Tap Try again and choose Allow. If the prompt stays closed, open this site’s settings in your browser, set Microphone to Allow or Ask, then retry.</p>
      <div className="flex gap-3">
        <button type="button" disabled={retry.busy} onClick={retry.retry} className="rounded-lg bg-blue-700 px-4 py-2 text-white">{retry.busy ? "Requesting…" : "Try again"}</button>
        <button type="button" onClick={cancel} className="rounded-lg px-3 py-2">Cancel</button>
      </div>
    </dialog>
  );
  return { requestMicrophone, cancel, permissionDialog };
}

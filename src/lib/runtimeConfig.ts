import { Capacitor, registerPlugin } from "@capacitor/core";
export const native = Capacitor.isNativePlatform();
export const base = String(
  import.meta.env.VITE_API_BASE_URL ||
    (native
      ? localStorage.getItem("sahva:test-server") || ""
      : window.location.origin),
).replace(/\/$/, "");
export const webOrigin = String(import.meta.env.VITE_PUBLIC_WEB_URL || base);
if (native && base && !base.startsWith("https://"))
  throw new Error("Build the APK with an HTTPS VITE_API_BASE_URL.");
let getToken: () => Promise<string | null> = async () => null;
export const bindToken = (get: typeof getToken) => {
  getToken = get;
};
export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getToken();
  const headers = new Headers(options.headers);
  headers.set("Authorization", "Bearer " + (token || ""));
  if (options.body) headers.set("Content-Type", "application/json");
  return fetch(base + path, { ...options, headers });
}
export async function request(path: string, method = "GET", body?: unknown) {
  const res = await apiFetch(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await res.json();
  if (!res.ok) throw new Error(value.error || "Request failed.");
  return value;
}
export function wsUrl(path: string) {
  const url = new URL(path, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}
export async function openSocket(path: string) {
  const token = await getToken();
  if (!token) throw new Error("Sign in to reconnect.");
  return new WebSocket(wsUrl(path), ["sahva", "jwt." + token]);
}
export const bridge = registerPlugin<{
  startCallListener(o: {
    wsUrl: string;
    authToken: string;
    userId: string;
    grant: string;
    language: string;
  }): Promise<void>;
  stopCallListener(): Promise<void>;
  refreshAuthToken(o: { authToken: string }): Promise<void>;
  startActiveCallForegroundService(o: {
    callerName: string;
    roomId: string;
  }): Promise<void>;
  stopActiveCallForegroundService(): Promise<void>;
  requestBatteryOptimizationExemption(): Promise<void>;
  requestPermissions(): Promise<unknown>;
  consumePendingCallAction(): Promise<{
    action?: string;
    callSessionId?: string;
    roomId?: string;
    caller?: unknown;
  }>;
  downloadRecording(o: { url: string }): Promise<void>;
  setSpeakerphone(o: { enabled: boolean }): Promise<void>;
}>("SahvaCallBridge");

import { bridge, native } from "./runtimeConfig";

export type AlertAccess = "granted" | "prompt" | "denied" | "unavailable";

export async function notificationAccess(): Promise<AlertAccess> {
  if (native) return (await bridge.getNotificationAccess()).status;
  if (!("Notification" in window)) return "unavailable";
  return Notification.permission === "default" ? "prompt" : Notification.permission;
}

export async function enableNotifications(): Promise<AlertAccess> {
  if (native) {
    if ((await notificationAccess()) === "prompt")
      await bridge.requestPermissions({ permissions: ["notifications"] });
    const access = await notificationAccess();
    if (access === "granted") window.dispatchEvent(new Event("sahva:alerts-enabled"));
    return access;
  }
  if (!("Notification" in window)) return "unavailable";
  const result = await Notification.requestPermission();
  return result === "default" ? "prompt" : result;
}

export async function showWebAlert(title: string, options: NotificationOptions) {
  if (native || !document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
  const branding = { ...options, icon: "/logo/sahva-icon-180.png" };
  try {
    const notice = new Notification(title, branding);
    notice.onclick = () => { window.focus(); notice.close(); };
    return () => notice.close();
  } catch {
    if (!("serviceWorker" in navigator)) return;
    await navigator.serviceWorker.register("/notifications-sw.js");
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, branding);
    return () => { void registration.getNotifications({ tag: options.tag }).then(items => items.forEach(n => n.close())); };
  }
}

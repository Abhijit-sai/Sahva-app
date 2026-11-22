import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { enableNotifications, notificationAccess, type AlertAccess } from "../lib/notifications";
import { bridge, native } from "../lib/runtimeConfig";

export default function NotificationReminder({ close }: { close: () => void }) {
  const [access, setAccess] = useState<AlertAccess>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () => { void notificationAccess().then(value => active && setAccess(value)).catch(() => {}); };
    check();
    window.addEventListener("focus", check);
    return () => { active = false; window.removeEventListener("focus", check); };
  }, []);
  if (!access || access === "granted" || access === "unavailable") return null;
  return <aside className="alert-reminder" aria-label="Call and message notifications">
    <Bell size={18} aria-hidden="true"/>
    <div><strong>Get alerts for calls and replies</strong>
      {access === "denied" && <p>Allow notifications in {native ? "Android" : "your browser’s site"} settings.</p>}
      <div><button disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          if (access === "denied" && native) await bridge.openNotificationSettings();
          else setAccess(await enableNotifications());
        } catch { setAccess("denied"); }
        finally { setBusy(false); }
      }}>{access === "denied" ? native ? "Open settings" : "Retry permission" : "Enable alerts"}</button>
      <button onClick={close}>Not now</button></div>
    </div>
  </aside>;
}

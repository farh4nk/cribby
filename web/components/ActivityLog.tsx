"use client";

import { useEffect, useState } from "react";
import { useTelemetry } from "@/context/TelemetryProvider";
import { TONE_HEX } from "@/lib/stateCopy";

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** State changes since this page opened, plus the desktop-alerts switch. */
export function ActivityLog() {
  const { events, alerts } = useTelemetry();
  // Set when the browser refuses permission, so the button doesn't just look dead.
  const [blocked, setBlocked] = useState(false);

  async function toggleAlerts() {
    await alerts.set(!alerts.enabled);
    setBlocked(!alerts.enabled && Notification.permission !== "granted");
  }

  // Browsers won't re-show the permission prompt once a site is blocked, so the user flips it in
  // the address-bar menu. Watch for that and switch alerts on automatically when they do.
  const { set: setAlerts } = alerts;
  useEffect(() => {
    if (!blocked || !navigator.permissions?.query) return;
    let status: PermissionStatus | undefined;
    let cancelled = false;
    const onChange = () => {
      if (status?.state === "granted") {
        setBlocked(false);
        void setAlerts(true);
      }
    };
    navigator.permissions
      .query({ name: "notifications" })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.addEventListener("change", onChange);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
  }, [blocked, setAlerts]);

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-ink [font-variation-settings:'SOFT'_100]">Activity</h2>
        {alerts.supported ? (
          <button
            type="button"
            onClick={toggleAlerts}
            aria-pressed={alerts.enabled}
            className="rounded-full px-3 py-1 text-xs text-ink-dim ring-1 ring-white/12 transition hover:text-ink aria-pressed:text-tone aria-pressed:ring-tone/40"
          >
            Desktop alerts {alerts.enabled ? "on" : "off"}
          </button>
        ) : null}
      </div>

      {blocked && !alerts.enabled && (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-ink-dim">
          Your browser has notifications blocked for this site, and websites can&apos;t change that
          themselves. Click the lock icon next to the address bar and set Notifications to Allow.
          Desktop alerts will switch on automatically once you do. Also check that Windows Focus
          Assist / Do Not Disturb is off.
        </p>
      )}

      {events.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-faint">
          Nothing to report. Changes in how the baby is doing will appear here.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {events.slice(0, 8).map((e) => (
            <li key={e.id} className="rise flex items-start gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TONE_HEX[e.tone] }} aria-hidden />
              <span className="flex-1 text-ink">{e.text}</span>
              <time className="shrink-0 tabular-nums text-ink-faint" dateTime={new Date(e.at).toISOString()}>
                {time(e.at)}
              </time>
            </li>
          ))}
        </ol>
      )}

      {!alerts.supported && (
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          Desktop alerts need a secure connection (https, or localhost).
        </p>
      )}
    </section>
  );
}

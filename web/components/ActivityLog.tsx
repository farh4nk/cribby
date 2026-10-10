"use client";

import { useState } from "react";
import { useTelemetry } from "@/context/TelemetryProvider";
import { TONE_HEX } from "@/lib/stateCopy";

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** State changes since this page opened, plus the desktop-alerts switch. */
export function ActivityLog() {
  const { events, alerts } = useTelemetry();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="flex flex-col rounded-2xl bg-white/5 ring-1 ring-white/10 overflow-hidden transition-all">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-white/[0.03] transition cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 text-tone">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base tracking-tight text-ink [font-variation-settings:'SOFT'_100]">
                Recent Activity
              </h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-ink-dim">
                {events.length}
              </span>
            </div>
            <p className="text-xs text-ink-faint truncate max-w-[240px] sm:max-w-md">
              {events.length > 0
                ? `${events[0].text} (${time(events[0].at)})`
                : "No state changes yet"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {alerts.supported && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                alerts.set(!alerts.enabled);
              }}
              aria-pressed={alerts.enabled}
              className="rounded-full px-2.5 py-1 text-xs text-ink-dim ring-1 ring-white/12 transition hover:text-ink aria-pressed:text-tone aria-pressed:ring-tone/40"
            >
              Alerts {alerts.enabled ? "on" : "off"}
            </button>
          )}
          <svg
            className={`h-4 w-4 text-ink-dim transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-white/5 p-4 sm:p-5 pt-3">
          {events.length === 0 ? (
            <p className="text-sm leading-relaxed text-ink-faint">
              Nothing to report. Changes in how the baby is doing will appear here.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
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
        </div>
      )}
    </section>
  );
}

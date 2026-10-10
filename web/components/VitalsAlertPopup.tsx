"use client";

import { useEffect } from "react";
import { useTelemetry } from "@/context/TelemetryProvider";
import { primeAlertSound } from "@/lib/alertSound";

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** On-screen popup for the high-vitals alert. Stays until dismissed; dismissing also stops the chime. */
export function VitalsAlertPopup() {
  const { activeAlert, dismissAlert } = useTelemetry();

  // Browsers only allow sound after the user has interacted with the page.
  useEffect(() => {
    const prime = () => primeAlertSound();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  if (!activeAlert) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div
        role="alertdialog"
        aria-live="assertive"
        aria-labelledby="vitals-alert-title"
        aria-describedby="vitals-alert-body"
        className="rise pointer-events-auto w-full max-w-md rounded-2xl bg-[#1a1422] p-5 shadow-2xl ring-2 ring-[#ef8a76]/70"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#ef8a76]" />
          <div className="flex-1">
            <h2 id="vitals-alert-title" className="font-display text-lg text-ink">
              Vitals above your range
            </h2>
            <p id="vitals-alert-body" className="mt-1 text-sm leading-relaxed text-ink-dim">
              {activeAlert.text}
            </p>
            <p className="mt-2 text-xs text-ink-faint">Noticed at {time(activeAlert.at)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissAlert}
          autoFocus
          className="mt-4 w-full rounded-xl bg-[#ef8a76] px-4 py-2.5 text-sm font-medium text-[#1a1422] transition hover:brightness-110"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

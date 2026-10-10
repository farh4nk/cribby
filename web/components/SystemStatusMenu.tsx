"use client";

import { useState } from "react";
import { useTelemetry } from "@/context/TelemetryProvider";
import { useDaemonUrl } from "@/lib/useDaemonUrl";
import { InstallButton } from "./InstallButton";

export function SystemStatusMenu() {
  const [open, setOpen] = useState(false);
  const { connected, stale, mock, sourceMode } = useTelemetry();
  const daemon = useDaemonUrl();
  const live = connected && !stale;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-full bg-white/5 py-1.5 px-3 text-xs text-ink-dim ring-1 ring-white/10 transition hover:bg-white/10 hover:text-ink cursor-pointer"
      >
        <span
          className={`h-2 w-2 rounded-full ${live ? "bg-tone breathe" : mock ? "bg-indigo-400" : "bg-ink-faint"}`}
          aria-hidden
        />
        <span className="font-medium text-ink">
          {mock ? "Demo" : live ? "Live" : "Connecting…"}
        </span>
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>Local Guard</span>
        </span>
        <svg
          className={`h-3 w-3 text-ink-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close system menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Nursery System Status"
            className="absolute right-0 z-40 mt-2 w-80 rounded-2xl bg-[#14131f] p-4 shadow-2xl ring-1 ring-white/15"
          >
            {/* Header / Connection Status */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${live ? "bg-tone breathe" : "bg-ink-faint"}`} />
                <span className="text-sm font-semibold text-ink">
                  {mock ? "Demo Telemetry" : live ? "Nursery Unit Live" : "Connecting to Nursery…"}
                </span>
              </div>
              <span className="text-[11px] font-mono text-ink-faint">
                {daemon ? daemon.replace(/^https?:\/\//, "") : "local"}
              </span>
            </div>

            {/* Hardware / Source */}
            <div className="my-3 flex flex-col gap-1.5 rounded-xl bg-white/5 p-3 text-xs text-ink-dim ring-1 ring-white/5">
              <div className="flex justify-between">
                <span>Telemetry Source:</span>
                <span className="font-medium text-ink">
                  {sourceMode === "REALTIME" ? "Real-Time Sensor" : mock ? "Browser Mock" : "Daemon Simulation"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Daemon Link:</span>
                <span className="font-mono text-[11px] text-ink-dim">
                  {live ? "WebSocket (2 Hz)" : "Offline"}
                </span>
              </div>
            </div>

            {/* Privacy Shield */}
            <div className="rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-500/20">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Local Edge Guard Active</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-emerald-200/80">
                Crib video and vitals inference remain 100% on your local edge device. Zero video frames are recorded or uploaded to the cloud.
              </p>
            </div>

            {/* PWA Install */}
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-xs text-ink-dim">Progressive Web App:</span>
              <InstallButton />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

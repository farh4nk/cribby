"use client";

import { useEffect, useState } from "react";
import { useTelemetry } from "@/context/TelemetryProvider";
import { SIMULATE_RESTLESS_MS } from "@/lib/config";

/** Presenter tool: force a restless episode. Deliberately understated. */
export function DemoTray() {
  const { simulateRestless } = useTelemetry();
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  useEffect(() => {
    if (lockedUntil === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const trigger = async () => {
    setError(null);
    try {
      await simulateRestless();
      const t = Date.now();
      setNow(t);
      setLockedUntil(t + SIMULATE_RESTLESS_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  return (
    <section className="mt-14 border-t border-line pt-6 text-sm text-ink-faint">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <span className="uppercase tracking-[0.14em] text-xs">
          Demo controls
        </span>
        <button
          type="button"
          onClick={trigger}
          disabled={remaining > 0}
          className="rounded-full px-4 py-1.5 text-ink ring-1 ring-white/15 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent"
        >
          {remaining > 0 ? `Test restlessness active · ${remaining}s` : "Trigger test restlessness"}
        </button>
        {error && <span className="text-rose-300">{error}</span>}
      </div>
    </section>
  );
}

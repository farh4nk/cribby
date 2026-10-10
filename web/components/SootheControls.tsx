"use client";

import { useEffect, useState } from "react";
import { SootheEngine, SootheSnapshot } from "@/lib/audio/soothe-engine";

interface SootheControlsProps {
  engine: SootheEngine;
  snapshot: SootheSnapshot;
}

export function SootheControls({ engine, snapshot }: SootheControlsProps) {
  // The clock is read only in the browser (never during prerender), and ticks while a cooldown runs.
  const [now, setNow] = useState(0);

  const locked = now > 0 && snapshot.cooldownUntil > now;
  const active = snapshot.status === "soothing" || snapshot.status === "fading";

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = snapshot.cooldownUntil > Date.now() ? setInterval(tick, 1000) : undefined;
    return () => {
      clearTimeout(first);
      if (id) clearInterval(id);
    };
  }, [snapshot.cooldownUntil]);

  const minsLeft = Math.ceil((snapshot.cooldownUntil - now) / 60000);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-ink [font-variation-settings:'SOFT'_100]">Auto-soothe</h2>
        <button
          type="button"
          role="switch"
          aria-checked={snapshot.enabled}
          aria-label="Auto-soothe"
          onClick={() => {
            if (!snapshot.enabled) engine.unlock();
            engine.setEnabled(!snapshot.enabled);
          }}
          className={`relative h-6 w-11 rounded-full transition-colors ${snapshot.enabled ? "bg-tone" : "bg-white/15"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink shadow transition-all ${snapshot.enabled ? "left-[1.375rem]" : "left-0.5"}`}
          />
        </button>
      </div>

      {/* What the switch does, shown whether it is on or off. The status lives in the card header pill. */}
      <p className="mt-3 text-sm text-ink-dim">
        Plays relaxing music if restlessness continues, then fades it out once your baby settles.
      </p>

      {/* Cooldown lockout: stops it repeating if the baby is truly awake */}
      {locked && !active && (
        <p className="mt-3 text-sm text-ink-faint">
          Paused for {minsLeft} min so it doesn’t repeat.{" "}
          <button type="button" onClick={() => engine.resetCooldown()} className="underline underline-offset-4 hover:text-ink">
            Reset
          </button>
        </p>
      )}

      <button
        type="button"
        onClick={() => engine.stop()}
        disabled={!active && snapshot.status !== "pending"}
        className="mt-4 w-full rounded-full px-4 py-2.5 text-sm text-rose-200 ring-1 ring-rose-300/35 transition hover:bg-rose-300/10 disabled:cursor-not-allowed disabled:text-ink-faint disabled:ring-white/10 disabled:hover:bg-transparent"
      >
        Mute / stop soothing
      </button>

      {/* A click here also lets the browser play the music later, when auto-soothe steps in. */}
      <button
        type="button"
        onClick={() => (snapshot.previewing ? engine.endPreview() : engine.preview())}
        disabled={active || snapshot.status === "pending"}
        className="mt-3 w-full rounded-full px-4 py-2.5 text-sm text-ink-dim ring-1 ring-white/10 transition hover:bg-white/5 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
      >
        {snapshot.previewing ? "Stop test" : "Test sound"}
      </button>
    </div>
  );
}

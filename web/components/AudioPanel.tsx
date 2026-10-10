"use client";

import { useState } from "react";
import { useTelemetry } from "@/context/TelemetryProvider";
import { useVoiceProfile } from "@/hooks/useVoiceProfile";
import { useAutoSoothe } from "@/hooks/useAutoSoothe";
import { VoiceRecorder } from "./VoiceRecorder";
import { SootheControls } from "./SootheControls";
import { TwoWayAudio } from "./TwoWayAudio";
import { babyObject, babySubject, getBabyName } from "@/lib/babyName";
import { analyticsUrl } from "@/lib/config";


export function AudioPanel() {
  const { latest } = useTelemetry();
  const state = latest?.state;

  const { voiceId, snippets, loading, error, onboard, reset } = useVoiceProfile();
  const [notification, setNotification] = useState<string | null>(null);

  const { engine, snapshot } = useAutoSoothe(state, snippets, {
    onEvent: async (e) => {
      console.info("[auto-soothe event]", e);
      if (e.type === "started") {
        setNotification(`Auto-soothe triggered: soothing ${babyObject(getBabyName())} in your voice.`);
        // Log intervention to Tiger Data via Dev 4 backend
        try {
          await fetch(`${analyticsUrl()}/api/soothe-events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              triggered_at: new Date(e.at).toISOString(),
              voice_snippet_used: e.snippet || "Auto-soothe calming phrase",
              was_successful: true,
            }),
          });
        } catch {
          // Non-blocking if backend is offline
        }
      } else if (e.type === "settled") {
        setNotification(`${babySubject(getBabyName())} is settled and asleep. Audio smoothly faded out.`);
        setTimeout(() => setNotification(null), 8000);
      } else if (e.type === "stopped") {
        setNotification(null);
      }
    },
  });

  const isSoothingActive = snapshot.status === "soothing" || snapshot.status === "fading";
  const [manuallyToggled, setManuallyToggled] = useState<boolean | null>(null);
  const voiceOpen = manuallyToggled !== null ? manuallyToggled : (!voiceId || isSoothingActive);

  return (
    <section className="flex flex-col gap-4">
      {/* Shown to the parent whenever auto-soothe steps in or settles */}
      {notification && (
        <div role="status" className="rise flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3 text-sm text-ink ring-1 ring-tone/30">
          <div className="flex items-center gap-2.5">
            <span className="breathe h-2 w-2 shrink-0 rounded-full bg-tone" aria-hidden />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            aria-label="Dismiss"
            className="text-ink-faint transition hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      <TwoWayAudio sootheEngine={engine} />

      <section className="flex flex-col rounded-2xl bg-white/5 ring-1 ring-white/10 overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setManuallyToggled(!voiceOpen)}
          className="flex w-full items-center justify-between p-4 text-left hover:bg-white/[0.03] transition cursor-pointer"
          aria-expanded={voiceOpen}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 text-tone">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-base tracking-tight text-ink [font-variation-settings:'SOFT'_100]">
                Parent Voice & Auto-Soothe
              </h2>
              <p className="text-xs text-ink-faint">
                {snapshot.status === "soothing"
                  ? "Soothing active in your voice"
                  : snapshot.status === "fading"
                    ? "Settled · Fading out"
                    : voiceId
                      ? "Cloned voice active · Auto-soothe primed"
                      : "Record 10s sample · ElevenLabs"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {snapshot.status === "soothing" ? (
              <span className="flex items-center gap-1.5 rounded-full bg-tone/20 px-2.5 py-0.5 text-xs font-medium text-tone ring-1 ring-tone/30">
                <span className="h-1.5 w-1.5 rounded-full bg-tone breathe" />
                Soothing
              </span>
            ) : voiceId ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-amber-500/20">
                Setup
              </span>
            )}
            <svg
              className={`h-4 w-4 text-ink-dim transition-transform duration-200 ${voiceOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {voiceOpen && (
          <div className="border-t border-white/5 p-4 sm:p-5 pt-3">
            {!voiceId ? (
              <VoiceRecorder onComplete={onboard} loading={loading} />
            ) : (
              <>
                {snippets.length === 0 && !error && (
                  <p className="text-sm text-ink-faint">Preparing soothing phrases in your voice…</p>
                )}
                {error && <p className="text-sm text-rose-300">{error}</p>}
                <SootheControls engine={engine} snapshot={snapshot} voiceId={voiceId} onChangeVoice={reset} />
              </>
            )}
          </div>
        )}
      </section>
    </section>
  );
}

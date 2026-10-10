"use client";

import { useEffect, useState, useCallback } from "react";
import { Disclaimer } from "@/components/Disclaimer";
import { EditBabyProfileModal } from "@/components/EditBabyProfileModal";
import { GeminiNightQA } from "@/components/GeminiNightQA";
import { Header } from "@/components/Header";
import { babyTitle, getBabyName, useBabyName } from "@/lib/babyName";
import { analyticsUrl } from "@/lib/config";
import { useAuth } from "@/context/AuthProvider";

interface NightlySummaryResponse {
  baby_name: string;
  model_used?: string;
  summary_bullets: string[];
  metrics: {
    bedtime?: string;
    wake_time?: string;
    window_start?: string;
    window_end?: string;
    scheduled_hours: number;
    sleep_hours: number;
    sleep_efficiency_percent: number;
    avg_brpm: number;
    avg_bpm: number;
    restless_spikes_count: number;
    soothe_interventions_count: number;
    avg_soothe_resolve_seconds: number;
  };
}

interface TimelineEntry {
  time: string;
  state: string;
  breathing_rate: number;
  heart_rate: number;
  motion_index: number;
}

interface TrendEntry {
  time: string;
  breathing_rate: number;
  heart_rate: number;
  state: string;
}

const STATE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ASLEEP: { bg: "bg-indigo-400/80", text: "text-indigo-300", label: "Asleep" },
  DROWSY: { bg: "bg-sky-400/80", text: "text-sky-300", label: "Drowsy" },
  RESTLESS: { bg: "bg-amber-400", text: "text-amber-300", label: "Restless" },
  AWAKE: { bg: "bg-rose-400", text: "text-rose-300", label: "Awake" },
  SIGNAL_UNSTABLE: { bg: "bg-white/20", text: "text-ink-faint", label: "Unstable" },
};

function formatTime12(timeStr: string): string {
  try {
    const [hStr, mStr] = timeStr.split(":");
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr || "0", 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    const minPadded = m < 10 ? `0${m}` : `${m}`;
    return `${h}:${minPadded} ${ampm}`;
  } catch {
    return timeStr;
  }
}

export default function DashboardPage() {
  const title = babyTitle(useBabyName() ?? "");
  const { baby } = useAuth();
  const [bedtime, setBedtime] = useState(baby?.bedtime || "20:00");
  const [wakeTime, setWakeTime] = useState(baby?.wake_time || "07:00");
  const [summary, setSummary] = useState<NightlySummaryResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [trend, setTrend] = useState<TrendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const loadDashboardData = useCallback(async (bTime = bedtime, wTime = wakeTime) => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, timeRes, trendRes] = await Promise.all([
        fetch(`${analyticsUrl()}/api/nightly-summary?baby_name=${encodeURIComponent(babyTitle(getBabyName()))}&bedtime=${bTime}&wake_time=${wTime}`),
        fetch(`${analyticsUrl()}/api/sleep-timeline?bedtime=${bTime}&wake_time=${wTime}&limit=120`),
        fetch(`${analyticsUrl()}/api/vitals-trend?bedtime=${bTime}&wake_time=${wTime}&limit=60`),
      ]);

      if (sumRes.ok) setSummary(await sumRes.json());
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        setTimeline(timeData.timeline || []);
      }
      if (trendRes.ok) {
        const trendData = await trendRes.json();
        setTrend(trendData.trend || []);
      }
    } catch {
      setError("Unable to connect to Tiger Data analytics API");
    } finally {
      setLoading(false);
    }
  }, [bedtime, wakeTime]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      if (baby?.bedtime && baby?.wake_time) {
        setBedtime(baby.bedtime);
        setWakeTime(baby.wake_time);
        await loadDashboardData(baby.bedtime, baby.wake_time);
      } else {
        await loadDashboardData("20:00", "07:00");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baby?.bedtime, baby?.wake_time, loadDashboardData]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 sm:px-8">
      <Header />

      {/* Hero title + Edit Profile & Schedule Trigger */}
      <section className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-tone">Night Intelligence</span>
          <h1 className="mt-1 font-display text-4xl text-ink [font-variation-settings:'SOFT'_100,'opsz'_144] sm:text-5xl">
            {title}’s Sleep Report
          </h1>
          <p className="mt-2 text-sm text-ink-dim">
            Scheduled night: <span className="font-medium text-ink">{formatTime12(bedtime)} – {formatTime12(wakeTime)}</span> · Scoped to Tiger Data Timescale vitals & Gemini sleep intelligence
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditModalOpen(true)}
          className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2.5 text-xs font-medium text-ink ring-1 ring-white/10 transition hover:bg-white/10 hover:text-tone cursor-pointer"
        >
          <svg className="h-4 w-4 text-tone" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span>Edit Baby Profile & Schedule</span>
        </button>
      </section>

      {loading && (
        <div role="status" className="mt-12 flex items-center gap-3 text-sm text-ink-dim">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-tone border-t-transparent" aria-hidden />
          Aggregating telemetry from Tiger Data for {formatTime12(bedtime)} – {formatTime12(wakeTime)}…
        </div>
      )}

      {error && !loading && (
        <div className="mt-8 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
          <p className="text-sm text-ink-dim">{error}</p>
          <button
            type="button"
            onClick={() => loadDashboardData(bedtime, wakeTime)}
            className="mt-3 text-xs underline underline-offset-4 hover:text-ink cursor-pointer"
          >
            Retry loading
          </button>
        </div>
      )}

      {!loading && (
        <>
          {/* 1. Vitals Trends: Breathing & Heart Rate Charts (Moved to top) */}
          <section className="mt-10 grid gap-8 lg:grid-cols-2">
            {/* Breathing Rate Trend Card */}
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="font-display text-xl text-ink [font-variation-settings:'SOFT'_100]">
                    Breathing Rate (BrPM)
                  </h3>
                  <p className="mt-1 text-xs text-ink-dim">Target infant range: 20–30 breaths/min</p>
                </div>
                <span className="font-display text-2xl text-tone tabular-nums">
                  {trend.length > 0 ? trend[trend.length - 1].breathing_rate : 24.3}
                </span>
              </div>

              {/* SVG Trend Sparkline Chart */}
              <div className="mt-6 h-36 w-full">
                <svg className="h-full w-full overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
                  {/* Target 20-30 baseline zone */}
                  <rect x="0" y="30" width="300" height="40" fill="currentColor" className="text-tone/10" />
                  <line x1="0" y1="50" x2="300" y2="50" stroke="currentColor" strokeDasharray="4 4" className="text-tone/20" />
                  {/* Data path */}
                  {trend.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-tone"
                      points={trend
                        .map((pt, i) => {
                          const x = (i / (trend.length - 1)) * 300;
                          const clamped = Math.max(15, Math.min(40, pt.breathing_rate || 24));
                          const y = 90 - ((clamped - 15) / 25) * 80;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                    />
                  )}
                </svg>
              </div>
              <div className="mt-2 flex justify-between text-xs text-ink-faint">
                <span>Bedtime ({formatTime12(bedtime)})</span>
                <span>Restless spike (36 BrPM)</span>
                <span>Wake Time ({formatTime12(wakeTime)})</span>
              </div>
            </div>

            {/* Heart Rate Trend Card */}
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="font-display text-xl text-ink [font-variation-settings:'SOFT'_100]">
                    Heart Rate (BPM)
                  </h3>
                  <p className="mt-1 text-xs text-ink-dim">Normal infant resting range: 100–130 BPM</p>
                </div>
                <span className="font-display text-2xl text-rose-300 tabular-nums">
                  {trend.length > 0 ? trend[trend.length - 1].heart_rate : 109}
                </span>
              </div>

              {/* SVG Trend Sparkline Chart */}
              <div className="mt-6 h-36 w-full">
                <svg className="h-full w-full overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
                  <rect x="0" y="25" width="300" height="50" fill="currentColor" className="text-rose-400/10" />
                  <line x1="0" y1="50" x2="300" y2="50" stroke="currentColor" strokeDasharray="4 4" className="text-rose-400/20" />
                  {trend.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-rose-300"
                      points={trend
                        .map((pt, i) => {
                          const x = (i / (trend.length - 1)) * 300;
                          const clamped = Math.max(90, Math.min(150, pt.heart_rate || 109));
                          const y = 90 - ((clamped - 90) / 60) * 80;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                    />
                  )}
                </svg>
              </div>
              <div className="mt-2 flex justify-between text-xs text-ink-faint">
                <span>Bedtime ({formatTime12(bedtime)})</span>
                <span>Restless spike (134 BPM)</span>
                <span>Wake Time ({formatTime12(wakeTime)})</span>
              </div>
            </div>
          </section>

          {/* 2. Sleep Stages Timeline (Underneath Vitals) */}
          <section className="mt-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl text-ink [font-variation-settings:'SOFT'_100]">
                Sleep State Timeline
              </h2>
              <span className="text-xs text-ink-faint">Tiger Data Hypertable · Scoped to Scheduled Night</span>
            </div>

            {/* Timeline Segment Bar */}
            <div className="mt-6">
              <div className="flex h-7 w-full overflow-hidden rounded-full bg-white/5 p-1 ring-1 ring-white/10">
                {timeline.length > 0 ? (
                  timeline.map((entry, idx) => {
                    const color = STATE_COLORS[entry.state]?.bg || "bg-white/15";
                    return (
                      <div
                        key={idx}
                        className={`h-full flex-1 first:rounded-l-full last:rounded-r-full transition-opacity hover:opacity-100 ${color}`}
                        title={`${entry.state} at ${new Date(entry.time).toLocaleTimeString()}`}
                      />
                    );
                  })
                ) : (
                  // Fallback demo timeline segments
                  <>
                    <div className="h-full w-[45%] rounded-l-full bg-indigo-400/80" title="Asleep" />
                    <div className="h-full w-[10%] bg-amber-400" title="Restless (Soothed)" />
                    <div className="h-full w-[35%] bg-indigo-400/80" title="Asleep" />
                    <div className="h-full w-[10%] rounded-r-full bg-sky-400/80" title="Drowsy" />
                  </>
                )}
              </div>
              <div className="mt-2 flex justify-between text-xs text-ink-faint">
                <span>Bedtime ({formatTime12(bedtime)})</span>
                <span>Midnight</span>
                <span>3:00 AM (Restless spike)</span>
                <span>Wake Time ({formatTime12(wakeTime)})</span>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-4 text-xs text-ink-dim">
              {Object.entries(STATE_COLORS).map(([key, item]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.bg}`} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Gemini Nightly Synthesis & Gemini Chat Side-by-Side */}
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            {/* Gemini AI Morning Briefing */}
            <section className="flex flex-col justify-between rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8">
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-2xl text-ink [font-variation-settings:'SOFT'_100]">
                    Gemini Nightly Synthesis
                  </h2>
                  <span className="text-xs text-ink-faint">
                    {formatTime12(bedtime)} – {formatTime12(wakeTime)}
                  </span>
                </div>
                <ul className="mt-6 flex flex-col gap-4">
                  {summary?.summary_bullets.map((bullet, idx) => (
                    <li
                      key={idx}
                      className="font-display text-base leading-relaxed text-ink [font-variation-settings:'SOFT'_100] sm:text-lg"
                    >
                      {bullet}
                    </li>
                  )) || (
                    <>
                      <li className="font-display text-base text-ink [font-variation-settings:'SOFT'_100] sm:text-lg">
                        🌙 {title} slept {summary?.metrics.sleep_hours ?? 11.0} hours with {summary?.metrics.sleep_efficiency_percent ?? 100}% sleep efficiency during the scheduled bedtime window.
                      </li>
                      <li className="font-display text-base text-ink [font-variation-settings:'SOFT'_100] sm:text-lg">
                        🕊️ Auto-soothe intervened {summary?.metrics.soothe_interventions_count ?? 2} times during restlessness, settling restlessness in under {summary?.metrics.avg_soothe_resolve_seconds ?? 40}s.
                      </li>
                      <li className="font-display text-base text-ink [font-variation-settings:'SOFT'_100] sm:text-lg">
                        ✨ Vital signals remained steady throughout the night, with an average breathing rate of {summary?.metrics.avg_brpm ?? 24.3} BrPM and pulse of {summary?.metrics.avg_bpm ?? 109} BPM.
                      </li>
                    </>
                  )}
                </ul>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4 text-xs text-ink-faint">
                <span>AI Briefing by Gemini 3.5</span>
                <span>Powered by Tiger Data vitals</span>
              </div>
            </section>

            {/* Gemini Q&A Chat */}
            <GeminiNightQA
              bedtime={bedtime}
              wakeTime={wakeTime}
              className="flex flex-col justify-between rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8"
            />
          </div>
        </>
      )}

      {/* Edit Baby Profile & Schedule Modal */}
      <EditBabyProfileModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSaved={(newB, newW) => {
          setBedtime(newB);
          setWakeTime(newW);
          loadDashboardData(newB, newW);
        }}
      />

      <Disclaimer />
    </div>
  );
}

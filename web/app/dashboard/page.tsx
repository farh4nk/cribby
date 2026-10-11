"use client";

import { useEffect, useState, useCallback } from "react";
import { Disclaimer } from "@/components/Disclaimer";
import { EditBabyProfileModal } from "@/components/EditBabyProfileModal";
import { GeminiNightQA } from "@/components/GeminiNightQA";
import { Header } from "@/components/Header";
import { babyTitle, getBabyName, useBabyName } from "@/lib/babyName";
import { analyticsUrl } from "@/lib/config";
import { useAuth } from "@/context/AuthProvider";
import {
  NightlySummaryResponse,
  TimelineEntry,
  TrendEntry,
  getDashboardCacheKey,
  getCachedDashboardData,
  setCachedDashboardData,
  isDashboardCacheFresh,
  formatCacheAge,
} from "@/lib/dashboardCache";

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

function formatPointTime(timeStr?: string): string {
  if (!timeStr) return "";
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  } catch {
    return timeStr;
  }
}

const fallbackTrend: TrendEntry[] = [
  { time: "2026-10-10T20:00:00Z", breathing_rate: 24.2, heart_rate: 110, state: "DROWSY" },
  { time: "2026-10-10T21:00:00Z", breathing_rate: 23.8, heart_rate: 108, state: "ASLEEP" },
  { time: "2026-10-10T22:30:00Z", breathing_rate: 24.5, heart_rate: 112, state: "ASLEEP" },
  { time: "2026-10-10T00:00:00Z", breathing_rate: 25.1, heart_rate: 115, state: "ASLEEP" },
  { time: "2026-10-10T01:30:00Z", breathing_rate: 24.0, heart_rate: 107, state: "ASLEEP" },
  { time: "2026-10-10T03:00:00Z", breathing_rate: 34.6, heart_rate: 136, state: "RESTLESS" },
  { time: "2026-10-10T03:15:00Z", breathing_rate: 31.2, heart_rate: 128, state: "RESTLESS" },
  { time: "2026-10-10T03:30:00Z", breathing_rate: 25.0, heart_rate: 110, state: "ASLEEP" },
  { time: "2026-10-10T05:00:00Z", breathing_rate: 24.1, heart_rate: 109, state: "ASLEEP" },
  { time: "2026-10-10T06:30:00Z", breathing_rate: 25.8, heart_rate: 114, state: "DROWSY" },
  { time: "2026-10-10T07:00:00Z", breathing_rate: 27.4, heart_rate: 122, state: "AWAKE" },
];

/** Carries the last valid (> 0) reading across sensor dropouts so the chart line has no 0-spikes. */
function forwardFill(values: number[], initial: number): number[] {
  const filled: number[] = [];
  let last = initial;
  for (const v of values) {
    if (v > 0) last = v;
    filled.push(last);
  }
  return filled;
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
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  const activeTrend = trend.length > 1 ? trend : fallbackTrend;
  const activePoint = hoveredTrendIndex !== null ? activeTrend[hoveredTrendIndex] : null;

  // Adaptive bounds & smoothed curves carrying forward valid readings across dropouts
  const validHrs = activeTrend.map((p) => p.heart_rate).filter((h) => h > 0);
  const minHrVal = validHrs.length ? Math.min(...validHrs) : 90;
  const maxHrVal = validHrs.length ? Math.max(...validHrs) : 140;
  const hrMin = Math.max(40, Math.floor((minHrVal - 6) / 5) * 5);
  const hrMax = Math.min(180, Math.ceil((maxHrVal + 6) / 5) * 5);
  const hrRange = Math.max(20, hrMax - hrMin);

  const validBrpms = activeTrend.map((p) => p.breathing_rate).filter((b) => b > 0);
  const minBrVal = validBrpms.length ? Math.min(...validBrpms) : 18;
  const maxBrVal = validBrpms.length ? Math.max(...validBrpms) : 36;
  const brMin = Math.max(8, Math.floor((minBrVal - 2) / 2) * 2);
  const brMax = Math.min(60, Math.ceil((maxBrVal + 2) / 2) * 2);
  const brRange = Math.max(10, brMax - brMin);

  const latestValidHr = validHrs.length ? validHrs[validHrs.length - 1] : 109;
  const latestValidBrpm = validBrpms.length ? validBrpms[validBrpms.length - 1] : 24.3;

  const filledHr = forwardFill(activeTrend.map((p) => p.heart_rate), validHrs[0] ?? 109);
  const smoothHrPoints = filledHr.map((value, i) => {
    const x = (i / Math.max(1, activeTrend.length - 1)) * 300;
    const clamped = Math.max(hrMin, Math.min(hrMax, value));
    const y = 90 - ((clamped - hrMin) / hrRange) * 80;
    return { x, y };
  });

  const filledBr = forwardFill(activeTrend.map((p) => p.breathing_rate), validBrpms[0] ?? 24.3);
  const smoothBrPoints = filledBr.map((value, i) => {
    const x = (i / Math.max(1, activeTrend.length - 1)) * 300;
    const clamped = Math.max(brMin, Math.min(brMax, value));
    const y = 90 - ((clamped - brMin) / brRange) * 80;
    return { x, y };
  });

  const handleChartHover = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX === undefined) return;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const fraction = x / rect.width;
    const idx = Math.round(fraction * (activeTrend.length - 1));
    setHoveredTrendIndex(Math.max(0, Math.min(activeTrend.length - 1, idx)));
  };

  const loadDashboardData = useCallback(async (bTime = bedtime, wTime = wakeTime, force = false) => {
    const bName = babyTitle(getBabyName());
    const cacheKey = getDashboardCacheKey(bName, bTime, wTime);
    const cached = getCachedDashboardData(cacheKey);

    // 1. Instant Cache Hit: Show cached telemetry without blocking user
    if (cached && !force) {
      setSummary(cached.summary);
      setTimeline(cached.timeline);
      setTrend(cached.trend);
      setLastUpdated(cached.fetchedAt);
      setLoading(false);

      // If fresh within 5-minute TTL, skip remote network calls entirely
      if (isDashboardCacheFresh(cached)) {
        return;
      }
      setIsRevalidating(true);
    } else {
      setLoading(true);
    }

    setError(null);
    try {
      const [sumRes, timeRes, trendRes] = await Promise.all([
        fetch(`${analyticsUrl()}/api/nightly-summary?baby_name=${encodeURIComponent(bName)}&bedtime=${bTime}&wake_time=${wTime}`),
        fetch(`${analyticsUrl()}/api/sleep-timeline?bedtime=${bTime}&wake_time=${wTime}&limit=120`),
        fetch(`${analyticsUrl()}/api/vitals-trend?bedtime=${bTime}&wake_time=${wTime}&limit=60`),
      ]);

      let newSummary = cached?.summary ?? null;
      let newTimeline = cached?.timeline ?? [];
      let newTrend = cached?.trend ?? [];

      if (sumRes.ok) newSummary = await sumRes.json();
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        newTimeline = timeData.timeline || [];
      }
      if (trendRes.ok) {
        const trendData = await trendRes.json();
        newTrend = trendData.trend || [];
      }

      const now = Date.now();
      setSummary(newSummary);
      setTimeline(newTimeline);
      setTrend(newTrend);
      setLastUpdated(now);

      // Store in memory & sessionStorage
      setCachedDashboardData(cacheKey, {
        summary: newSummary,
        timeline: newTimeline,
        trend: newTrend,
        fetchedAt: now,
      });
    } catch {
      if (!cached) {
        setError("Unable to load the night’s data. Please try again.");
      }
    } finally {
      setLoading(false);
      setIsRevalidating(false);
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

      {/* Hero title + Controls (Refresh + Edit Profile & Schedule Trigger) */}
      <section className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-tone">Night Intelligence</span>
          <h1 className="mt-1 font-display text-4xl text-ink [font-variation-settings:'SOFT'_100,'opsz'_144] sm:text-5xl">
            {title}’s Sleep Report
          </h1>
          <p className="mt-2 text-sm text-ink-dim flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Scheduled night: <span className="font-medium text-ink">{formatTime12(bedtime)} – {formatTime12(wakeTime)}</span> · Vitals and summaries for this window
            </span>
            {lastUpdated && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-tone/90 ring-1 ring-white/10">
                <span className="h-1.5 w-1.5 rounded-full bg-tone" />
                Cached · {formatCacheAge(lastUpdated)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadDashboardData(bedtime, wakeTime, true)}
            disabled={loading || isRevalidating}
            className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-2 text-xs font-medium text-ink ring-1 ring-white/10 transition hover:bg-white/10 hover:text-tone cursor-pointer disabled:opacity-50"
            title="Refresh the night’s data"
          >
            <svg
              className={`h-3.5 w-3.5 text-tone ${isRevalidating ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{isRevalidating ? "Syncing…" : "Refresh"}</span>
          </button>
          <button
            type="button"
            onClick={() => setEditModalOpen(true)}
            className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs font-medium text-ink ring-1 ring-white/10 transition hover:bg-white/10 hover:text-tone cursor-pointer"
          >
            <svg className="h-4 w-4 text-tone" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span>Edit Baby Profile & Schedule</span>
          </button>
        </div>
      </section>

      {loading && (
        <div role="status" className="mt-12 flex items-center gap-3 text-sm text-ink-dim">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-tone border-t-transparent" aria-hidden />
          Loading the night from {formatTime12(bedtime)} – {formatTime12(wakeTime)}…
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
          {/* 1. Vitals Trends: Breathing & Heart Rate Charts with Interactive Scrubber */}
          <section className="mt-10 grid gap-8 lg:grid-cols-2">
            {/* Breathing Rate Trend Card */}
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="font-display text-xl text-ink [font-variation-settings:'SOFT'_100]">
                    Breathing Rate (BrPM)
                  </h3>
                  <p className="mt-1 text-xs text-ink-dim">
                    {activePoint ? (
                      <span className="flex items-center gap-1.5 text-ink">
                        <span className="tabular-nums font-medium">{formatPointTime(activePoint.time)}</span>
                        <span>·</span>
                        <span className={`inline-flex items-center gap-1 font-semibold ${STATE_COLORS[activePoint.state]?.text || "text-tone"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATE_COLORS[activePoint.state]?.bg || "bg-tone"}`} />
                          {STATE_COLORS[activePoint.state]?.label || activePoint.state}
                        </span>
                      </span>
                    ) : (
                      "Target infant range: 20–30 breaths/min"
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-display text-2xl text-tone tabular-nums">
                    {activePoint
                      ? activePoint.breathing_rate > 0
                        ? activePoint.breathing_rate.toFixed(1)
                        : "—"
                      : latestValidBrpm.toFixed(1)}
                  </span>
                  <span className="ml-1 text-xs font-medium text-ink-dim">BrPM</span>
                </div>
              </div>

              {/* Interactive SVG Trend Sparkline Chart */}
              <div
                className="relative mt-6 h-36 w-full cursor-crosshair select-none touch-none"
                onMouseMove={handleChartHover}
                onMouseLeave={() => setHoveredTrendIndex(null)}
                onTouchMove={handleChartHover}
                onTouchEnd={() => setHoveredTrendIndex(null)}
              >
                {/* Floating tooltip above active point */}
                {activePoint && hoveredTrendIndex !== null && (
                  <div
                    className={`pointer-events-none absolute -top-1 z-30 transition-transform duration-75 ${
                      (hoveredTrendIndex / Math.max(1, activeTrend.length - 1)) * 100 < 15
                        ? "translate-x-0"
                        : (hoveredTrendIndex / Math.max(1, activeTrend.length - 1)) * 100 > 85
                        ? "-translate-x-full"
                        : "-translate-x-1/2"
                    }`}
                    style={{ left: `${(hoveredTrendIndex / Math.max(1, activeTrend.length - 1)) * 100}%` }}
                  >
                    <div className="rounded-xl bg-[#0f111f]/95 px-3 py-1.5 shadow-2xl ring-1 ring-white/15 backdrop-blur-md">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold text-tone">
                          {activePoint.breathing_rate > 0
                            ? `${activePoint.breathing_rate.toFixed(1)} BrPM`
                            : "— BrPM"}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            activePoint.breathing_rate <= 0
                              ? "text-amber-300 bg-amber-400/10"
                              : `${STATE_COLORS[activePoint.state]?.text || "text-tone"} bg-white/5`
                          }`}
                        >
                          {activePoint.breathing_rate <= 0
                            ? "Signal Unstable"
                            : STATE_COLORS[activePoint.state]?.label || activePoint.state}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] tabular-nums text-ink-dim">
                        {formatPointTime(activePoint.time)}
                      </div>
                    </div>
                  </div>
                )}

                <svg className="h-full w-full overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
                  {/* Target 20-30 baseline zone */}
                  {(() => {
                    const y30 = 90 - ((30 - brMin) / brRange) * 80;
                    const y20 = 90 - ((20 - brMin) / brRange) * 80;
                    const top = Math.max(5, Math.min(95, Math.min(y30, y20)));
                    const bottom = Math.max(5, Math.min(95, Math.max(y30, y20)));
                    const h = Math.max(0, bottom - top);
                    const mid = (top + bottom) / 2;
                    return (
                      <>
                        <rect x="0" y={top} width="300" height={h} fill="currentColor" className="text-tone/10" />
                        <line x1="0" y1={mid} x2="300" y2={mid} stroke="currentColor" strokeDasharray="4 4" className="text-tone/20" />
                      </>
                    );
                  })()}

                  {/* Data polyline */}
                  {smoothBrPoints.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-tone"
                      points={smoothBrPoints.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")}
                    />
                  )}

                  {/* Scrubber indicator */}
                  {activePoint && hoveredTrendIndex !== null && smoothBrPoints[hoveredTrendIndex] && (
                    <g className="pointer-events-none">
                      <line
                        x1={smoothBrPoints[hoveredTrendIndex].x}
                        y1={0}
                        x2={smoothBrPoints[hoveredTrendIndex].x}
                        y2={100}
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        className="text-white/40"
                      />
                      {activePoint.breathing_rate > 0 ? (
                        <>
                          <circle cx={smoothBrPoints[hoveredTrendIndex].x} cy={smoothBrPoints[hoveredTrendIndex].y} r="7" className="fill-tone/30 animate-ping" />
                          <circle cx={smoothBrPoints[hoveredTrendIndex].x} cy={smoothBrPoints[hoveredTrendIndex].y} r="4" className="fill-tone stroke-white stroke-[1.5]" />
                        </>
                      ) : (
                        <>
                          <circle cx={smoothBrPoints[hoveredTrendIndex].x} cy={smoothBrPoints[hoveredTrendIndex].y} r="5" className="fill-amber-400/20 stroke-amber-300 stroke-[1.5]" />
                          <circle cx={smoothBrPoints[hoveredTrendIndex].x} cy={smoothBrPoints[hoveredTrendIndex].y} r="2.5" className="fill-amber-300" />
                        </>
                      )}
                    </g>
                  )}
                </svg>
              </div>

              <div className="mt-2 flex justify-between text-xs text-ink-faint">
                <span>{formatPointTime(activeTrend[0]?.time) || `Bedtime (${formatTime12(bedtime)})`}</span>
                <span className="italic text-ink-dim/70">
                  {hoveredTrendIndex !== null ? "Inspecting point…" : "Hover / scroll cursor to inspect"}
                </span>
                <span>{formatPointTime(activeTrend[activeTrend.length - 1]?.time) || `Wake (${formatTime12(wakeTime)})`}</span>
              </div>
            </div>

            {/* Heart Rate Trend Card */}
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="font-display text-xl text-ink [font-variation-settings:'SOFT'_100]">
                    Heart Rate (BPM)
                  </h3>
                  <p className="mt-1 text-xs text-ink-dim">
                    {activePoint ? (
                      <span className="flex items-center gap-1.5 text-ink">
                        <span className="tabular-nums font-medium">{formatPointTime(activePoint.time)}</span>
                        <span>·</span>
                        <span className={`inline-flex items-center gap-1 font-semibold ${STATE_COLORS[activePoint.state]?.text || "text-rose-300"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATE_COLORS[activePoint.state]?.bg || "bg-rose-400"}`} />
                          {STATE_COLORS[activePoint.state]?.label || activePoint.state}
                        </span>
                      </span>
                    ) : (
                      "Normal infant resting range: 100–130 BPM"
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-display text-2xl text-rose-300 tabular-nums">
                    {activePoint
                      ? activePoint.heart_rate > 0
                        ? Math.round(activePoint.heart_rate)
                        : "—"
                      : Math.round(latestValidHr)}
                  </span>
                  <span className="ml-1 text-xs font-medium text-ink-dim">BPM</span>
                </div>
              </div>

              {/* Interactive SVG Trend Sparkline Chart */}
              <div
                className="relative mt-6 h-36 w-full cursor-crosshair select-none touch-none"
                onMouseMove={handleChartHover}
                onMouseLeave={() => setHoveredTrendIndex(null)}
                onTouchMove={handleChartHover}
                onTouchEnd={() => setHoveredTrendIndex(null)}
              >
                {/* Floating tooltip above active point */}
                {activePoint && hoveredTrendIndex !== null && (
                  <div
                    className={`pointer-events-none absolute -top-1 z-30 transition-transform duration-75 ${
                      (hoveredTrendIndex / Math.max(1, activeTrend.length - 1)) * 100 < 15
                        ? "translate-x-0"
                        : (hoveredTrendIndex / Math.max(1, activeTrend.length - 1)) * 100 > 85
                        ? "-translate-x-full"
                        : "-translate-x-1/2"
                    }`}
                    style={{ left: `${(hoveredTrendIndex / Math.max(1, activeTrend.length - 1)) * 100}%` }}
                  >
                    <div className="rounded-xl bg-[#0f111f]/95 px-3 py-1.5 shadow-2xl ring-1 ring-white/15 backdrop-blur-md">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold text-rose-300">
                          {activePoint.heart_rate > 0
                            ? `${Math.round(activePoint.heart_rate)} BPM`
                            : "— BPM"}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            activePoint.heart_rate <= 0
                              ? "text-amber-300 bg-amber-400/10"
                              : `${STATE_COLORS[activePoint.state]?.text || "text-rose-300"} bg-white/5`
                          }`}
                        >
                          {activePoint.heart_rate <= 0
                            ? "Signal Unstable"
                            : STATE_COLORS[activePoint.state]?.label || activePoint.state}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] tabular-nums text-ink-dim">
                        {formatPointTime(activePoint.time)}
                      </div>
                    </div>
                  </div>
                )}

                <svg className="h-full w-full overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
                  {/* Target 100-130 baseline zone */}
                  {(() => {
                    const y130 = 90 - ((130 - hrMin) / hrRange) * 80;
                    const y100 = 90 - ((100 - hrMin) / hrRange) * 80;
                    const top = Math.max(5, Math.min(95, Math.min(y130, y100)));
                    const bottom = Math.max(5, Math.min(95, Math.max(y130, y100)));
                    const h = Math.max(0, bottom - top);
                    const mid = (top + bottom) / 2;
                    return (
                      <>
                        <rect x="0" y={top} width="300" height={h} fill="currentColor" className="text-rose-400/10" />
                        <line x1="0" y1={mid} x2="300" y2={mid} stroke="currentColor" strokeDasharray="4 4" className="text-rose-400/20" />
                      </>
                    );
                  })()}

                  {/* Data polyline */}
                  {smoothHrPoints.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-rose-300"
                      points={smoothHrPoints.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")}
                    />
                  )}

                  {/* Scrubber indicator */}
                  {activePoint && hoveredTrendIndex !== null && smoothHrPoints[hoveredTrendIndex] && (
                    <g className="pointer-events-none">
                      <line
                        x1={smoothHrPoints[hoveredTrendIndex].x}
                        y1={0}
                        x2={smoothHrPoints[hoveredTrendIndex].x}
                        y2={100}
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        className="text-white/40"
                      />
                      {activePoint.heart_rate > 0 ? (
                        <>
                          <circle cx={smoothHrPoints[hoveredTrendIndex].x} cy={smoothHrPoints[hoveredTrendIndex].y} r="7" className="fill-rose-400/30 animate-ping" />
                          <circle cx={smoothHrPoints[hoveredTrendIndex].x} cy={smoothHrPoints[hoveredTrendIndex].y} r="4" className="fill-rose-300 stroke-white stroke-[1.5]" />
                        </>
                      ) : (
                        <>
                          <circle cx={smoothHrPoints[hoveredTrendIndex].x} cy={smoothHrPoints[hoveredTrendIndex].y} r="5" className="fill-amber-400/20 stroke-amber-300 stroke-[1.5]" />
                          <circle cx={smoothHrPoints[hoveredTrendIndex].x} cy={smoothHrPoints[hoveredTrendIndex].y} r="2.5" className="fill-amber-300" />
                        </>
                      )}
                    </g>
                  )}
                </svg>
              </div>

              <div className="mt-2 flex justify-between text-xs text-ink-faint">
                <span>{formatPointTime(activeTrend[0]?.time) || `Bedtime (${formatTime12(bedtime)})`}</span>
                <span className="italic text-ink-dim/70">
                  {hoveredTrendIndex !== null ? "Inspecting point…" : "Hover / scroll cursor to inspect"}
                </span>
                <span>{formatPointTime(activeTrend[activeTrend.length - 1]?.time) || `Wake (${formatTime12(wakeTime)})`}</span>
              </div>
            </div>
          </section>

          {/* 2. Sleep Stages Timeline (Underneath Vitals) */}
          <section className="mt-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl text-ink [font-variation-settings:'SOFT'_100]">
                Sleep State Timeline
              </h2>
              <span className="text-xs text-ink-faint">Your scheduled night</span>
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

          {/* 3. Summary & Q&A Chat Side-by-Side */}
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            {/* Morning Briefing Summary */}
            <section className="flex flex-col justify-between rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8">
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-2xl text-ink [font-variation-settings:'SOFT'_100]">
                    Summary
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
          loadDashboardData(newB, newW, true);
        }}
      />

      <Disclaimer />
    </div>
  );
}

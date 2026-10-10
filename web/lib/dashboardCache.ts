export interface NightlySummaryResponse {
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

export interface TimelineEntry {
  time: string;
  state: string;
  breathing_rate: number;
  heart_rate: number;
  motion_index: number;
  is_real?: boolean;
}

export interface TrendEntry {
  time: string;
  breathing_rate: number;
  heart_rate: number;
  state: string;
  is_real?: boolean;
}

export interface DashboardCacheData {
  summary: NightlySummaryResponse | null;
  timeline: TimelineEntry[];
  trend: TrendEntry[];
  fetchedAt: number;
}

// 5-minute freshness TTL for night dashboard vitals & Gemini summary
export const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

// In-memory module cache persists across client SPA route transitions
const inMemoryCache = new Map<string, DashboardCacheData>();

export function getDashboardCacheKey(babyName: string, bedtime: string, wakeTime: string): string {
  const safeName = (babyName || "Baby").trim().toLowerCase();
  return `cribby_dashboard:${encodeURIComponent(safeName)}_${bedtime}_${wakeTime}`;
}

/**
 * Retrieves cached dashboard data from memory or browser sessionStorage.
 */
export function getCachedDashboardData(key: string): DashboardCacheData | null {
  // 1. Check in-memory store (fastest, zero parse)
  if (inMemoryCache.has(key)) {
    return inMemoryCache.get(key)!;
  }

  // 2. Check browser sessionStorage
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const parsed: DashboardCacheData = JSON.parse(stored);
        inMemoryCache.set(key, parsed);
        return parsed;
      }
    } catch {
      // Ignore parse/storage errors
    }
  }

  return null;
}

/**
 * Saves dashboard payload to in-memory cache and browser sessionStorage.
 */
export function setCachedDashboardData(
  key: string,
  data: {
    summary: NightlySummaryResponse | null;
    timeline: TimelineEntry[];
    trend: TrendEntry[];
    fetchedAt?: number;
  }
): void {
  const entry: DashboardCacheData = {
    summary: data.summary,
    timeline: data.timeline,
    trend: data.trend,
    fetchedAt: data.fetchedAt || Date.now(),
  };

  inMemoryCache.set(key, entry);

  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // Storage quota safety fallback
    }
  }
}

/**
 * Returns true if the cached entry exists and is within the freshness TTL.
 */
export function isDashboardCacheFresh(
  entry: DashboardCacheData | null,
  ttlMs: number = DASHBOARD_CACHE_TTL_MS
): boolean {
  if (!entry || !entry.fetchedAt) return false;
  return Date.now() - entry.fetchedAt < ttlMs;
}

/**
 * Invalidates a specific key or clears all dashboard cache keys.
 */
export function invalidateDashboardCache(key?: string): void {
  if (key) {
    inMemoryCache.delete(key);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(key);
      } catch {}
    }
  } else {
    inMemoryCache.clear();
    if (typeof window !== "undefined") {
      try {
        const toDelete: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith("cribby_dashboard:")) {
            toDelete.push(k);
          }
        }
        toDelete.forEach((k) => sessionStorage.removeItem(k));
      } catch {}
    }
  }
}

/**
 * Human-readable relative time helper for cache indicators.
 */
export function formatCacheAge(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 45) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

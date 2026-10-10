"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEMO_VITALS_ALERT,
  HISTORY_LENGTH,
  MOCK,
  SIMULATE_RESTLESS_MS,
  STALE_AFTER_MS,
  VITALS_ALERT,
  cameraUrl,
  daemonUrl,
  simulateRestlessUrl,
  wsUrl,
} from "@/lib/config";
import { startMockTelemetry, type MockTelemetrySource } from "@/lib/mockTelemetry";
import { toneOf } from "@/lib/stateCopy";
import { isTelemetry, type Telemetry } from "@/lib/types";
import { useActivity, type ActiveAlert, type ActivityEvent } from "@/lib/useActivity";
import { VitalsAlertMonitor } from "@/lib/vitalsAlert";

export interface TelemetryContextValue {
  /** Most recent packet, or null before the first one arrives. */
  latest: Telemetry | null;
  /** Rolling window of recent packets, oldest first (~60s). */
  history: Telemetry[];
  /** WebSocket is open (always true in mock mode). */
  connected: boolean;
  /** No packet received for STALE_AFTER_MS. */
  stale: boolean;
  mock: boolean;
  /** Active telemetry mode on the edge daemon: SIMULATED (mock) vs REALTIME (camera). */
  sourceMode: "SIMULATED" | "REALTIME";
  /** Switches daemon between simulated data and real optical camera sensor. */
  setSourceMode: (mode: "mock" | "real") => Promise<void>;
  /** State changes since the page opened, newest first. */
  events: ActivityEvent[];
  /** When the current state began (ms since epoch), as observed by this page. */
  stateSince: number | null;
  /** Desktop notifications for state changes (need https or localhost). */
  alerts: { supported: boolean; enabled: boolean; set: (on: boolean) => Promise<void> };
  /** High-vitals alert shown as an on-screen popup until dismissed, or null. */
  activeAlert: ActiveAlert | null;
  dismissAlert: () => void;
  /** Forces RESTLESS for 15s (daemon endpoint, or the mock generator). */
  simulateRestless: () => Promise<void>;
  /** Turn the camera on/off. Off stops capture and the Presage session (no credits used). */
  setCameraEnabled: (enabled: boolean) => Promise<void>;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 5000;

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [latest, setLatest] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [connected, setConnected] = useState(MOCK);
  const [stale, setStale] = useState(true);
  const [sourceMode, setSourceModeState] = useState<"SIMULATED" | "REALTIME">("SIMULATED");
  const { events, stateSince, record, recordAlert, activeAlert, dismissAlert, alerts } = useActivity();
  const lastMessageAt = useRef(0);
  const mockSource = useRef<MockTelemetrySource | null>(null);
  const vitalsMonitor = useRef(new VitalsAlertMonitor(VITALS_ALERT));

  const handleMessage = useCallback((t: Telemetry) => {
    lastMessageAt.current = Date.now();
    const vitalsAlert = vitalsMonitor.current.observe(t);
    if (vitalsAlert) recordAlert(vitalsAlert);
    setStale(false);
    setLatest(t);
    if (t.mode) {
      setSourceModeState(t.mode);
    }
    setHistory((prev) => [...prev.slice(-(HISTORY_LENGTH - 1)), t]);
    record(toneOf(t, false, t.mode ?? sourceMode), t.camera);
  }, [record, recordAlert, sourceMode]);

  // Query initial mode from daemon
  useEffect(() => {
    let cancelled = false;
    fetch(`${daemonUrl()}/api/source`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.mode) {
          setSourceModeState(data.mode);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setSourceMode = useCallback(async (mode: "mock" | "real") => {
    try {
      const res = await fetch(`${daemonUrl()}/api/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: mode }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.mode) setSourceModeState(data.mode);
      }
    } catch (e) {
      console.warn("Failed to toggle source mode on daemon:", e);
    }
  }, []);

  // Data source: in-browser mock, or the daemon WebSocket with reconnect backoff.
  useEffect(() => {
    if (MOCK) {
      mockSource.current = startMockTelemetry(handleMessage);
      return () => {
        mockSource.current?.stop();
        mockSource.current = null;
      };
    }

    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryMs = MIN_RETRY_MS;
    let disposed = false;

    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        retryMs = MIN_RETRY_MS;
        setConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          const data: unknown = JSON.parse(event.data);
          if (isTelemetry(data)) handleMessage(data);
        } catch {
          // Ignore malformed packets.
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (disposed) return;
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [handleMessage]);

  // Staleness watchdog.
  useEffect(() => {
    const timer = setInterval(() => {
      const isStale = Date.now() - lastMessageAt.current > STALE_AFTER_MS;
      setStale(isStale);
      if (isStale && lastMessageAt.current > 0) record("offline");
    }, 1000);
    return () => clearInterval(timer);
  }, [record]);

  const simulateRestless = useCallback(async () => {
    // Demo preset (low limit, 5s sustain, simulated data allowed) for the length of the episode,
    // plus a little slack so the alert can land before the readings settle.
    vitalsMonitor.current.applyTemporarily(DEMO_VITALS_ALERT, SIMULATE_RESTLESS_MS + 5000);
    if (MOCK) {
      mockSource.current?.simulateRestless();
      return;
    }
    try {
      const res = await fetch(simulateRestlessUrl(), { method: "POST" });
      if (res.ok) return;
    } catch {
      console.warn("Daemon offline; simulating restlessness directly in-browser.");
    }

    // Graceful fallback: simulate restless episode locally if daemon endpoint fails
    // Streams readings like the daemon does (2 Hz) so time-based logic, like the alert's
    // sustain timer, behaves the same as it would live.
    const sendRestless = () =>
      handleMessage({
        timestamp: new Date().toISOString(),
        state: "RESTLESS",
        vitals: { brpm: 34.5, bpm: 122.0, confidence: 0.92 },
        motion_index: 0.76,
      });
    sendRestless();
    const stream = setInterval(sendRestless, 500);
    setTimeout(() => {
      clearInterval(stream);
      handleMessage({
        timestamp: new Date().toISOString(),
        state: "ASLEEP",
        vitals: { brpm: 24.0, bpm: 108.0, confidence: 0.95 },
        motion_index: 0.06,
      });
    }, SIMULATE_RESTLESS_MS);
  }, [handleMessage]);

  const setCameraEnabled = useCallback(async (enabled: boolean) => {
    if (MOCK) {
      mockSource.current?.setCameraEnabled(enabled);
      return;
    }
    const res = await fetch(cameraUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error(`Couldn’t turn the camera ${enabled ? "on" : "off"} (HTTP ${res.status})`);
  }, []);

  return (
    <TelemetryContext.Provider
      value={{
        latest,
        history,
        connected,
        stale,
        mock: MOCK,
        sourceMode,
        setSourceMode,
        events,
        stateSince,
        alerts,
        activeAlert,
        dismissAlert,
        simulateRestless,
        setCameraEnabled,
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry(): TelemetryContextValue {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error("useTelemetry must be used inside <TelemetryProvider>");
  return ctx;
}

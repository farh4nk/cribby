"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { playAlertChime, primeAlertSound, stopAlertChime } from "./alertSound";
import { getBabyName } from "./babyName";
import { APP_NAME } from "./config";
import { eventText, shouldNotify, type Tone } from "./stateCopy";
import type { CameraStatus } from "./types";

export interface ActivityEvent {
  id: number;
  at: number; // ms since epoch
  tone: Tone;
  text: string;
}

/** A high-vitals alert waiting to be dismissed (drives the on-screen popup). */
export interface ActiveAlert {
  id: number;
  at: number;
  text: string;
}

const MAX_EVENTS = 30;
const ALERTS_KEY = "cradleecho.alerts";

const noopSubscribe = () => () => {};
// Notifications need a secure context (https or localhost); plain http://<pi>:3000 doesn't qualify.
const alertsSupported = () => "Notification" in window && window.isSecureContext;

// Tiny external store for the "desktop alerts" preference (persisted, shared across components).
let alertsOn = false;
let alertsLoaded = false;
const alertListeners = new Set<() => void>();

function getAlerts(): boolean {
  if (!alertsLoaded && typeof window !== "undefined") {
    alertsLoaded = true;
    try {
      alertsOn =
        alertsSupported() &&
        Notification.permission === "granted" &&
        localStorage.getItem(ALERTS_KEY) === "1";
    } catch {
      alertsOn = false;
    }
  }
  return alertsOn;
}
const subscribeAlerts = (cb: () => void) => {
  alertListeners.add(cb);
  return () => alertListeners.delete(cb);
};
async function setAlerts(on: boolean) {
  if (on) {
    if (!alertsSupported()) return;
    if ((await Notification.requestPermission()) !== "granted") return;
  }
  alertsOn = on;
  try {
    localStorage.setItem(ALERTS_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  alertListeners.forEach((l) => l());
  if (on) {
    primeAlertSound(); // this click is the user gesture that lets alerts make sound later
    // Confirms it works right away (and shows the OS-level "allow" state if something blocks it).
    try {
      new Notification(APP_NAME, { body: "Desktop alerts are on.", tag: "cradleecho-test" });
    } catch {
      /* notifications blocked at runtime */
    }
  }
}

/**
 * Records state transitions (shown in the activity log) and optionally raises desktop
 * notifications while the tab is in the background. `record` is called by the telemetry
 * provider whenever the displayed state changes.
 */
export function useActivity() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [stateSince, setStateSince] = useState<number | null>(null);
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const toneRef = useRef<Tone | null>(null);
  const idRef = useRef(0);

  const supported = useSyncExternalStore(noopSubscribe, alertsSupported, () => false);
  const enabled = useSyncExternalStore(subscribeAlerts, getAlerts, () => false);

  const record = useCallback((tone: Tone, camera?: CameraStatus) => {
    const prev = toneRef.current;
    if (prev === tone) return;
    toneRef.current = tone;
    const now = Date.now();
    setStateSince(now);
    if (prev === null) return; // the first reading isn't a "change"

    const text = eventText(tone, camera, prev, getBabyName());
    setEvents((list) => [{ id: ++idRef.current, at: now, tone, text }, ...list].slice(0, MAX_EVENTS));

    if (getAlerts() && document.hidden && shouldNotify(prev, tone)) {
      try {
        new Notification(APP_NAME, { body: text, tag: "cradleecho-state" });
      } catch {
        /* notifications blocked at runtime */
      }
    }
  }, []);

  /**
   * Logs an alert in the activity feed and raises a desktop notification if alerts are on.
   * Unlike state changes, this fires even when the tab is visible (it can sit behind other
   * windows) and stays on screen until dismissed.
   */
  const recordAlert = useCallback((text: string) => {
    const now = Date.now();
    const id = ++idRef.current;
    setEvents((list) => [{ id, at: now, tone: "awake" as Tone, text }, ...list].slice(0, MAX_EVENTS));
    // Popup, chime and desktop notification all follow the "Desktop alerts" switch. When it is
    // off the alert is only written to the activity log.
    if (getAlerts()) {
      setActiveAlert({ id, at: now, text });
      playAlertChime();
      try {
        new Notification(`${APP_NAME}: vitals above your range`, {
          body: text,
          tag: "cradleecho-vitals",
          requireInteraction: true,
        });
      } catch {
        /* notifications blocked at runtime */
      }
    }
  }, []);

  // Switching alerts off also hides any popup that is still showing and silences the chime.
  useEffect(() => {
    if (!enabled) stopAlertChime();
  }, [enabled]);

  const dismissAlert = useCallback(() => {
    stopAlertChime();
    setActiveAlert(null);
  }, []);

  return {
    events,
    stateSince,
    record,
    recordAlert,
    activeAlert: enabled ? activeAlert : null,
    dismissAlert,
    alerts: { supported, enabled, set: setAlerts },
  };
}

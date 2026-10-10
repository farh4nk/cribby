import { createLullabyWavUrl } from "./music";

const FADE_TICK_MS = 100;
// Optional real track (e.g. "/soothe-music.mp3" in web/public, or any URL). Unset = the built-in
// lullaby; if the track fails to load, the engine falls back to the lullaby.
const MUSIC_URL = process.env.NEXT_PUBLIC_SOOTHE_MUSIC_URL;

export type SootheStatus = "idle" | "pending" | "soothing" | "fading";

export interface SootheEvent {
  type: "started" | "settled" | "stopped";
  at: number;
}

export interface SootheEngineOptions {
  triggerDelayMs?: number; // default 4000
  fadeMs?: number; // default 8000
  cooldownMs?: number; // default 10 * 60 * 1000
  musicVolume?: number; // default 0.6
  previewMs?: number; // default 6000
  onEvent?: (event: SootheEvent) => void;
}

export interface SootheSnapshot {
  enabled: boolean;
  status: SootheStatus;
  cooldownUntil: number;
  previewing: boolean;
}

/**
 * Auto-soothe orchestrator (Tasks 3.3 + 3.4).
 * RESTLESS held for `triggerDelayMs` -> relaxing music; ASLEEP -> fade out over `fadeMs`.
 * A cooldown stops it repeating if the baby is truly awake; stop() mutes it at once.
 */
export class SootheEngine {
  opts: Required<SootheEngineOptions>;
  music: HTMLAudioElement | null = null;

  enabled = true;
  status: SootheStatus = "idle";
  cooldownUntil = 0;
  previewing = false;
  level = 1;

  pendingTimer: ReturnType<typeof setTimeout> | null = null;
  fadeTimer: ReturnType<typeof setInterval> | null = null;
  previewTimer: ReturnType<typeof setTimeout> | null = null;
  lastState: string | null = null;
  listeners = new Set<() => void>();
  cached: SootheSnapshot;

  constructor(options: SootheEngineOptions = {}) {
    this.opts = {
      triggerDelayMs: 4000,
      fadeMs: 8000,
      cooldownMs: 10 * 60 * 1000,
      musicVolume: 0.6,
      previewMs: 6000,
      onEvent: () => {},
      ...options,
    };
    this.cached = this.build();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): SootheSnapshot => this.cached;

  setOnEvent(fn?: (event: SootheEvent) => void) {
    this.opts.onEvent = fn ?? (() => {});
  }

  /** Call from a click: browsers only allow audio that a user gesture has unlocked. */
  async unlock() {
    if (typeof window === "undefined") return;
    this.ensureElement();
    const el = this.music;
    if (!el || !el.paused) return;
    const prev = el.volume;
    el.volume = 0;
    try {
      await el.play();
    } catch {
      /* unlock on next user click */
    }
    el.pause();
    el.currentTime = 0;
    el.volume = prev;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop(false);
    else this.emit();
  }

  /** Duck (pause) the music while the parent is talking. */
  setDucked(ducked: boolean) {
    if (ducked) this.music?.pause();
    else if (this.status === "soothing" || this.status === "fading" || this.previewing) {
      this.music?.play().catch(() => {});
    }
  }

  onTelemetry({ state }: { state?: string | null }) {
    if (!state || state === this.lastState) return;
    this.lastState = state;

    if (state === "RESTLESS") {
      this.onRestless();
    } else {
      this.cancelPending();
      if (state === "ASLEEP" && (this.status === "soothing" || this.status === "fading")) {
        this.beginFade();
      }
    }
  }

  stop(lockout = true) {
    const wasActive = this.status === "soothing" || this.status === "fading";
    this.cancelPending();
    this.halt();
    if (lockout) this.cooldownUntil = Date.now() + this.opts.cooldownMs;
    if (wasActive) this.opts.onEvent({ type: "stopped", at: Date.now() });
    this.setStatus("idle");
  }

  resetCooldown() {
    this.cooldownUntil = 0;
    this.emit();
  }

  /** Plays a few seconds of the music (from a click, so it also unlocks audio for later). */
  preview() {
    if (typeof window === "undefined" || this.status !== "idle") return;
    this.ensureElement();
    if (!this.music) return;
    this.level = 1;
    this.applyVolume();
    this.music.currentTime = 0;
    this.music.play().catch(() => {});
    this.previewing = true;
    this.emit();
    this.previewTimer = setTimeout(() => this.endPreview(), this.opts.previewMs);
  }

  endPreview() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = null;
    if (!this.previewing) return;
    this.previewing = false;
    if (this.status === "idle") this.halt();
    this.emit();
  }

  destroy() {
    this.stop(false);
    this.listeners.clear();
  }

  private onRestless() {
    if (!this.enabled) return;
    if (this.status === "fading") {
      this.clearFade();
      this.level = 1;
      this.applyVolume();
      this.setStatus("soothing");
      return;
    }
    if (this.status !== "idle") return;

    this.setStatus("pending");
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      if (Date.now() < this.cooldownUntil) {
        this.setStatus("idle");
        return;
      }
      this.start();
    }, this.opts.triggerDelayMs);
  }

  private start() {
    this.endPreview();
    this.ensureElement();
    this.level = 1;
    this.cooldownUntil = Date.now() + this.opts.cooldownMs;
    this.applyVolume();
    if (this.music) {
      this.music.currentTime = 0;
      this.music.play().catch(() => {});
    }
    this.opts.onEvent({ type: "started", at: Date.now() });
    this.setStatus("soothing");
  }

  private beginFade() {
    this.clearFade();
    this.setStatus("fading");
    const startLevel = this.level;
    const startedAt = Date.now();
    this.fadeTimer = setInterval(() => {
      const t = Math.min(1, (Date.now() - startedAt) / this.opts.fadeMs);
      this.level = startLevel * (1 - t);
      this.applyVolume();
      if (t >= 1) {
        this.halt();
        this.opts.onEvent({ type: "settled", at: Date.now() });
        this.setStatus("idle");
      }
    }, FADE_TICK_MS);
  }

  private applyVolume() {
    if (this.music) this.music.volume = Math.max(0, Math.min(1, this.opts.musicVolume * this.level));
  }

  private halt() {
    this.clearFade();
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
    }
    this.level = 1;
  }

  private ensureElement() {
    if (typeof window === "undefined" || typeof Audio === "undefined" || this.music) return;
    const el = new Audio(MUSIC_URL || createLullabyWavUrl());
    el.loop = true;
    // Custom track failed to load: switch to the built-in lullaby, and resume if it was playing.
    el.addEventListener(
      "error",
      () => {
        const shouldPlay = this.status === "soothing" || this.status === "fading" || this.previewing;
        el.src = createLullabyWavUrl();
        if (shouldPlay) el.play().catch(() => {});
      },
      { once: true },
    );
    this.music = el;
    this.applyVolume();
  }

  private cancelPending() {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    if (this.status === "pending") this.setStatus("idle");
  }

  private clearFade() {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
  }

  private setStatus(s: SootheStatus) {
    this.status = s;
    this.emit();
  }

  private build(): SootheSnapshot {
    return {
      enabled: this.enabled,
      status: this.status,
      cooldownUntil: this.cooldownUntil,
      previewing: this.previewing,
    };
  }

  private emit() {
    this.cached = this.build();
    this.listeners.forEach((l) => l());
  }
}

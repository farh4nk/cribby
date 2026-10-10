"use client";

// A short two-tone chime synthesized with Web Audio (no audio file needed).
// Browsers only allow sound after the user has interacted with the page, so primeAlertSound()
// runs on the first click/keypress and when Desktop alerts is switched on.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user gesture so a later alert is allowed to make noise. */
export function primeAlertSound() {
  const c = getContext();
  if (c && c.state === "suspended") void c.resume();
}

/** Plays the chime (three high-low pairs, about 4 seconds). Safe to call when audio is blocked. */
export function playAlertChime() {
  const c = getContext();
  if (!c) return;
  void c.resume();
  stopAlertChime();

  const out = c.createGain();
  out.gain.value = 0.35;
  out.connect(c.destination);
  master = out;

  const start = c.currentTime + 0.05;
  for (let i = 0; i < 3; i++) {
    note(c, out, 880, start + i * 1.3, 0.35);
    note(c, out, 660, start + i * 1.3 + 0.4, 0.5);
  }
}

/** Silences a chime that is still playing (e.g. when the popup is dismissed). */
export function stopAlertChime() {
  if (master && ctx) {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
    } catch {
      /* already torn down */
    }
  }
  master = null;
}

function note(c: AudioContext, dest: AudioNode, freq: number, at: number, dur: number) {
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Quick attack and smooth decay so it chimes instead of clicking.
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(1, at + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(env).connect(dest);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

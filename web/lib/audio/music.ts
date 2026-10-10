// Relaxing music for auto-soothe: a soft music-box lullaby over a warm pad, synthesized as a
// seamless WAV loop so no audio file (or licence) is needed. Set NEXT_PUBLIC_SOOTHE_MUSIC_URL to
// play a real track instead (see soothe-engine.ts).

const SAMPLE_RATE = 22050;
const BAR_S = 4; // slow: one chord per 4 s
const STEPS = 6; // arpeggio notes per bar

// I - vi - IV - V in C, twice. Each chord: pad root (low), then the arpeggio an octave up.
const CHORDS: { root: number; arp: number[] }[] = [
  { root: 65.41, arp: [261.63, 392.0, 523.25, 659.25, 523.25, 392.0] }, // C
  { root: 55.0, arp: [220.0, 329.63, 440.0, 523.25, 440.0, 329.63] }, // Am
  { root: 87.31, arp: [174.61, 261.63, 349.23, 440.0, 349.23, 261.63] }, // F
  { root: 49.0, arp: [196.0, 293.66, 392.0, 493.88, 392.0, 293.66] }, // G
];
const BARS = CHORDS.length * 2;

/** Adds one soft music-box note; the tail wraps to the start so the loop has no seam. */
function musicBox(buf: Float32Array, startS: number, freq: number, amp: number) {
  const start = Math.floor(startS * SAMPLE_RATE);
  const len = Math.floor(3 * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = (1 - Math.exp(-t * 80)) * Math.exp(-t * 2.2);
    const w = 2 * Math.PI * freq * t;
    buf[(start + i) % buf.length] += amp * env * (Math.sin(w) + 0.25 * Math.sin(2 * w) + 0.08 * Math.sin(3 * w));
  }
}

/** A low, slowly swelling pad under each bar (root and its fifth). */
function pad(buf: Float32Array, startS: number, root: number) {
  const start = Math.floor(startS * SAMPLE_RATE);
  const len = Math.floor(BAR_S * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.sin((Math.PI * t) / BAR_S); // swell in and out across the bar
    buf[(start + i) % buf.length] +=
      env * (0.09 * Math.sin(2 * Math.PI * root * 2 * t) + 0.05 * Math.sin(2 * Math.PI * root * 3 * t));
  }
}

let cached: string | null = null;

/** Object URL of the lullaby loop (about 32 s). Built once per page. */
export function createLullabyWavUrl(): string {
  if (typeof window === "undefined") return "";
  if (cached) return cached;
  const buf = new Float32Array(BARS * BAR_S * SAMPLE_RATE);
  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORDS[bar % CHORDS.length];
    const t0 = bar * BAR_S;
    pad(buf, t0, chord.root);
    chord.arp.forEach((f, step) => musicBox(buf, t0 + (step * BAR_S) / STEPS, f, 0.16));
  }
  let peak = 0;
  for (const s of buf) peak = Math.max(peak, Math.abs(s));
  if (peak > 0) for (let i = 0; i < buf.length; i++) buf[i] *= 0.6 / peak;
  cached = URL.createObjectURL(encodeWav(buf));
  return cached;
}

function encodeWav(samples: Float32Array): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const write = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => {
    const c = Math.max(-1, Math.min(1, s));
    view.setInt16(44 + i * 2, c < 0 ? c * 0x8000 : c * 0x7fff, true);
  });
  return new Blob([view], { type: "audio/wav" });
}

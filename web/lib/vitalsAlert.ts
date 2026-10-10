import type { Telemetry } from "./types";

export interface VitalsAlertConfig {
  brpmHigh: number;
  bpmHigh: number;
  sustainS: number;
  cooldownS: number;
  minConfidence: number;
  onSimulated: boolean;
}

/**
 * Decides when high vitals deserve an alert. Pure logic (clock injected) so it is easy to test.
 *
 * A reading only counts when the signal is trusted: enough confidence, not SIGNAL_UNSTABLE, and
 * not simulated (unless allowed for demos). The breach must last `sustainS` seconds, and a
 * cooldown stops repeat alerts. Wording describes what was observed; it never claims danger.
 */
export class VitalsAlertMonitor {
  private breachSince: number | null = null;
  private cooldownUntil = 0;

  constructor(
    private readonly cfg: VitalsAlertConfig,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns the alert text when one is due, otherwise null. */
  observe(t: Telemetry): string | null {
    const { brpm, bpm, confidence } = t.vitals;
    const simulated = t.simulated === true || t.mode === "SIMULATED";
    const trusted =
      t.state !== "SIGNAL_UNSTABLE" &&
      confidence >= this.cfg.minConfidence &&
      (this.cfg.onSimulated || !simulated);

    if (!trusted) {
      // A reading we don't trust can't confirm the breach, so the timer restarts.
      this.breachSince = null;
      return null;
    }

    const reasons: string[] = [];
    if (brpm > this.cfg.brpmHigh) {
      reasons.push(`breathing rate ${Math.round(brpm)}/min is above ${this.cfg.brpmHigh}/min`);
    }
    if (bpm > this.cfg.bpmHigh) {
      reasons.push(`heart rate ${Math.round(bpm)}/min is above ${this.cfg.bpmHigh}/min`);
    }
    if (reasons.length === 0) {
      this.breachSince = null;
      return null;
    }

    const t0 = this.now();
    if (this.breachSince === null) this.breachSince = t0;
    if (t0 - this.breachSince < this.cfg.sustainS * 1000 || t0 < this.cooldownUntil) return null;

    this.cooldownUntil = t0 + this.cfg.cooldownS * 1000;
    const text = reasons.join(" and ");
    return `For ${this.cfg.sustainS}s, ${text}. This is an observation, not a diagnosis. Please check on your baby.`;
  }
}

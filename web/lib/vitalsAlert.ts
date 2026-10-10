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
  private override: { cfg: VitalsAlertConfig; until: number } | null = null;

  constructor(
    private readonly baseCfg: VitalsAlertConfig,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Temporarily swaps in other settings (the demo preset) for `durationMs`, then goes back to the
   * normal ones on its own. Also clears the timer and cooldown so repeated demos always fire.
   */
  applyTemporarily(cfg: VitalsAlertConfig, durationMs: number) {
    this.override = { cfg, until: this.now() + durationMs };
    this.breachSince = null;
    this.cooldownUntil = 0;
  }

  private get cfg(): VitalsAlertConfig {
    if (this.override && this.now() < this.override.until) return this.override.cfg;
    if (this.override) {
      // Demo window is over: back to normal settings with a clean slate.
      this.override = null;
      this.breachSince = null;
      this.cooldownUntil = 0;
    }
    return this.baseCfg;
  }

  /** Returns the alert text when one is due, otherwise null. */
  observe(t: Telemetry): string | null {
    const cfg = this.cfg;
    const { brpm, bpm, confidence } = t.vitals;
    const simulated = t.simulated === true || t.mode === "SIMULATED";
    const trusted =
      t.state !== "SIGNAL_UNSTABLE" &&
      confidence >= cfg.minConfidence &&
      (cfg.onSimulated || !simulated);

    if (!trusted) {
      // A reading we don't trust can't confirm the breach, so the timer restarts.
      this.breachSince = null;
      return null;
    }

    const reasons: string[] = [];
    if (brpm > cfg.brpmHigh) {
      reasons.push(`breathing rate ${Math.round(brpm)}/min is above ${cfg.brpmHigh}/min`);
    }
    if (bpm > cfg.bpmHigh) {
      reasons.push(`heart rate ${Math.round(bpm)}/min is above ${cfg.bpmHigh}/min`);
    }
    if (reasons.length === 0) {
      this.breachSince = null;
      return null;
    }

    const t0 = this.now();
    if (this.breachSince === null) this.breachSince = t0;
    if (t0 - this.breachSince < cfg.sustainS * 1000 || t0 < this.cooldownUntil) return null;

    this.cooldownUntil = t0 + cfg.cooldownS * 1000;
    const text = reasons.join(" and ");
    return `For ${cfg.sustainS}s, ${text}. This is an observation, not a diagnosis. Please check on your baby.`;
  }
}

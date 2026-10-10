"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthProvider";
import { Avatar } from "@/components/Avatar";

const PRESETS = [
  { label: "8:00 PM – 7:00 AM", b: "20:00", w: "07:00" },
  { label: "7:30 PM – 6:30 AM", b: "19:30", w: "06:30" },
  { label: "8:30 PM – 7:30 AM", b: "20:30", w: "07:30" },
];

// The modal has its own accent: the state colour (`tone`) is grey while the monitor is offline,
// which made the buttons look disabled.
const ACCENT_STYLE = { "--accent": "#8fa8ff" } as React.CSSProperties;

const primaryButton =
  "w-full rounded-2xl bg-[var(--accent)] py-3.5 text-center text-sm font-semibold text-[#0a0b15] shadow-lg shadow-[var(--accent)]/20 transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100";
const secondaryButton =
  "rounded-2xl px-4 py-3.5 text-sm text-ink-dim ring-1 ring-white/15 transition hover:bg-white/5 hover:text-ink disabled:opacity-40";

export function OnboardingModal() {
  const router = useRouter();
  const { user, needsOnboarding, completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  // Saving clears `needsOnboarding`, which would close the modal before the last card is shown.
  const [keepOpen, setKeepOpen] = useState(false);
  const [babyName, setBabyName] = useState("");
  const [bedtime, setBedtime] = useState("20:00");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || (!needsOnboarding && !keepOpen)) {
    return null;
  }

  const parentFirstName = user.name ? user.name.split(" ")[0] : "Parent";
  const cleanName = babyName.trim();

  const nextFromName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanName) {
      setError("Please enter your baby’s name to continue.");
      return;
    }
    setError(null);
    setStep(1);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    setKeepOpen(true);

    const success = await completeOnboarding({ babyName: cleanName, bedtime, wakeTime });

    setIsSubmitting(false);
    if (success) {
      setStep(2);
    } else {
      setKeepOpen(false);
      setError("Unable to save baby profile. Please try again.");
    }
  };

  const finish = () => {
    setKeepOpen(false);
    router.push("/");
  };

  const cardClass = "flex w-full shrink-0 flex-col p-6 sm:p-8";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={ACCENT_STYLE}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fadeIn"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-[#14131f] shadow-2xl ring-1 ring-white/15">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 pt-5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === step ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-white/20"
              }`}
            />
          ))}
        </div>

        {/* The three cards sit side by side; changing `step` slides the strip. */}
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${step * 100}%)` }}
        >
          {/* Card 1: baby's name */}
          <form onSubmit={nextFromName} className={cardClass} aria-hidden={step !== 0} inert={step !== 0}>
            <div className="flex items-center gap-3.5 border-b border-white/10 pb-5">
              <Avatar src={user.avatar_url} name={user.name || "Parent"} size={48} fallback="none" className="ring-2 ring-white/15" />
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                  First-time setup
                </span>
                <h2
                  id="onboarding-title"
                  className="font-display text-2xl text-ink [font-variation-settings:'SOFT'_100] sm:text-3xl"
                >
                  Welcome, {parentFirstName}! 👋
                </h2>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <label htmlFor="onboard-baby-name" className="flex items-center gap-2 text-lg font-semibold text-ink">
                What is your baby’s name?
              </label>
              <p className="text-xs text-ink-faint">Used for sleep alerts and the nightly morning recap.</p>
              <input
                id="onboard-baby-name"
                type="text"
                autoFocus
                maxLength={30}
                placeholder="Baby’s name"
                value={babyName}
                onChange={(e) => {
                  setBabyName(e.target.value);
                  if (error) setError(null);
                }}
                className="mt-2 w-full rounded-2xl bg-white/5 px-4 py-3 text-base text-ink ring-1 ring-white/10 placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/60"
              />
            </div>

            {error && step === 0 && (
              <div className="mt-4 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300 ring-1 ring-rose-500/20">
                {error}
              </div>
            )}

            <div className="mt-auto pt-8">
              <button type="submit" disabled={!cleanName} className={primaryButton}>
                Continue
              </button>
            </div>
          </form>

          {/* Card 2: bedtime */}
          <form onSubmit={save} className={cardClass} aria-hidden={step !== 1} inert={step !== 1}>
            <div className="border-b border-white/10 pb-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Step 2 of 2</span>
              <h2 className="font-display text-2xl text-ink [font-variation-settings:'SOFT'_100] sm:text-3xl">
                {cleanName ? `${cleanName}’s bedtime` : "Bedtime"}
              </h2>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <p className="text-lg font-semibold text-ink">What is the sleep schedule?</p>
              <p className="text-xs text-ink-faint">
                The dashboard and the Gemini recap cover this window each night.
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {PRESETS.map((p) => {
                  const selected = bedtime === p.b && wakeTime === p.w;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setBedtime(p.b);
                        setWakeTime(p.w);
                      }}
                      className={`rounded-full px-3.5 py-1.5 text-xs transition ${
                        selected
                          ? "bg-[var(--accent)] font-semibold text-[#0a0b15] shadow shadow-[var(--accent)]/25"
                          : "bg-white/5 text-ink-dim ring-1 ring-white/10 hover:bg-white/10 hover:text-ink"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-[var(--accent)]/60">
                  <span className="text-[11px] text-ink-faint">Bedtime (put to sleep)</span>
                  <input
                    type="time"
                    value={bedtime}
                    onChange={(e) => setBedtime(e.target.value)}
                    className="mt-1 block w-full bg-transparent text-sm text-ink focus:outline-none"
                  />
                </label>
                <label className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-[var(--accent)]/60">
                  <span className="text-[11px] text-ink-faint">Wake time (morning)</span>
                  <input
                    type="time"
                    value={wakeTime}
                    onChange={(e) => setWakeTime(e.target.value)}
                    className="mt-1 block w-full bg-transparent text-sm text-ink focus:outline-none"
                  />
                </label>
              </div>
            </div>

            {error && step === 1 && (
              <div className="mt-4 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300 ring-1 ring-rose-500/20">
                {error}
              </div>
            )}

            <div className="mt-auto flex gap-3 pt-8">
              <button type="button" onClick={() => setStep(0)} disabled={isSubmitting} className={secondaryButton}>
                Back
              </button>
              <button type="submit" disabled={isSubmitting || !bedtime || !wakeTime} className={`${primaryButton} flex-1`}>
                {isSubmitting ? "Saving…" : "Save"}
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] text-ink-faint">
              You can change these anytime from your profile menu.
            </p>
          </form>

          {/* Card 3: all set */}
          <div className={cardClass} aria-hidden={step !== 2} inert={step !== 2}>
            <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]/15 text-3xl text-[var(--accent)] ring-1 ring-[var(--accent)]/30">
                ✓
              </div>
              <h2 className="mt-5 font-display text-3xl text-ink [font-variation-settings:'SOFT'_100]">
                You’re all set
              </h2>
              <p className="mt-2 max-w-xs text-sm text-ink-dim">
                {cleanName ? `${cleanName}’s nursery is ready.` : "Your nursery is ready."} Head to the live monitor to
                see the camera and sleep state.
              </p>
            </div>
            <button type="button" onClick={finish} className={primaryButton}>
              Go to home page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

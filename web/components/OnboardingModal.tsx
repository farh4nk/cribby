"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/context/AuthProvider";

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

export function OnboardingModal() {
  const { user, needsOnboarding, completeOnboarding } = useAuth();
  const [babyName, setBabyName] = useState("");
  const [bedtime, setBedtime] = useState("20:00");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !needsOnboarding) {
    return null;
  }

  const parentFirstName = user.name ? user.name.split(" ")[0] : "Parent";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = babyName.trim();
    if (!cleanName) {
      setError("Please enter your baby’s name to continue.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    const success = await completeOnboarding({
      babyName: cleanName,
      bedtime,
      wakeTime,
    });

    if (!success) {
      setError("Unable to save baby profile. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fadeIn"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-[#14131f] p-6 shadow-2xl ring-1 ring-white/15 sm:p-8">
        {/* Welcome Header */}
        <div className="flex items-center gap-3.5 border-b border-white/10 pb-5">
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={user.name || "Parent"}
              width={48}
              height={48}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-tone/30"
              unoptimized
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tone/20 text-base font-semibold text-tone">
              {parentFirstName[0]}
            </div>
          )}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-tone">
              First-Time Setup
            </span>
            <h2
              id="onboarding-title"
              className="font-display text-2xl text-ink [font-variation-settings:'SOFT'_100] sm:text-3xl"
            >
              Welcome, {parentFirstName}! 👋
            </h2>
          </div>
        </div>

        <p className="mt-4 text-sm text-ink-dim leading-relaxed">
          Let’s personalize your nursery monitoring experience in Tiger Data. Answer two quick questions to get started:
        </p>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300 ring-1 ring-rose-500/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
          {/* Question 1: Baby's Name */}
          <div className="flex flex-col gap-2">
            <label htmlFor="onboard-baby-name" className="text-sm font-semibold text-ink flex items-center gap-2">
              <span>1. What is your baby’s name?</span>
              <span className="text-rose-400 text-xs">*</span>
            </label>
            <p className="text-xs text-ink-faint">
              Used for sleep alerts, personalized soothing voice phrases, and nightly morning recaps.
            </p>
            <input
              id="onboard-baby-name"
              type="text"
              autoFocus
              required
              maxLength={30}
              placeholder="e.g. Maya, Leo, Oliver..."
              value={babyName}
              onChange={(e) => {
                setBabyName(e.target.value);
                if (error) setError(null);
              }}
              className="mt-1 w-full rounded-2xl bg-white/5 px-4 py-3 text-base text-ink placeholder:text-ink-faint ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-tone/50"
            />
          </div>

          {/* Question 2: Baby's Sleep Schedule */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-ink">
              2. What is your baby’s sleep schedule?
            </label>
            <p className="text-xs text-ink-faint">
              Scopes overnight hypnograms, vital averages, and Gemini summaries to this crib window.
            </p>

            {/* Quick Presets */}
            <div className="mt-1 flex flex-wrap gap-2">
              {[
                { label: "8:00 PM – 7:00 AM", b: "20:00", w: "07:00" },
                { label: "7:30 PM – 6:30 AM", b: "19:30", w: "06:30" },
                { label: "8:30 PM – 7:30 AM", b: "20:30", w: "07:30" },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setBedtime(p.b);
                    setWakeTime(p.w);
                  }}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    bedtime === p.b && wakeTime === p.w
                      ? "bg-tone text-[#0a0b15] font-semibold"
                      : "bg-white/5 text-ink-dim ring-1 ring-white/10 hover:bg-white/10 hover:text-ink"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Time input pickers */}
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <span className="text-[11px] text-ink-faint">Bedtime (Put to sleep)</span>
                <div className="mt-1 flex items-center justify-between">
                  <input
                    type="time"
                    value={bedtime}
                    onChange={(e) => setBedtime(e.target.value)}
                    className="w-24 bg-transparent text-sm text-ink focus:outline-none"
                  />
                  <span className="text-xs font-medium text-tone">{formatTime12(bedtime)}</span>
                </div>
              </div>

              <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <span className="text-[11px] text-ink-faint">Wake Time (Morning)</span>
                <div className="mt-1 flex items-center justify-between">
                  <input
                    type="time"
                    value={wakeTime}
                    onChange={(e) => setWakeTime(e.target.value)}
                    className="w-24 bg-transparent text-sm text-ink focus:outline-none"
                  />
                  <span className="text-xs font-medium text-tone">{formatTime12(wakeTime)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="mt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={isSubmitting || !babyName.trim()}
              className="w-full rounded-2xl bg-tone py-3.5 text-center text-sm font-semibold text-[#0a0b15] shadow-lg transition hover:opacity-95 disabled:opacity-40"
            >
              {isSubmitting ? "Personalizing Nursery…" : "Save & Enter Nursery"}
            </button>
            <p className="text-center text-[11px] text-ink-faint">
              You can adjust these settings anytime from your profile menu.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

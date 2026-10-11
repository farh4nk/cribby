"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthProvider";
import { getBabyName, setBabyName } from "@/lib/babyName";

interface EditBabyProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (newBedtime: string, newWakeTime: string, newName: string) => void;
}

const PRESETS = [
  { label: "8 PM – 7 AM", b: "20:00", w: "07:00" },
  { label: "7:30 PM – 6:30 AM", b: "19:30", w: "06:30" },
  { label: "8:30 PM – 6:30 AM", b: "20:30", w: "06:30" },
  { label: "9 PM – 7:30 AM", b: "21:00", w: "07:30" },
];

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

function EditBabyProfileDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: (newBedtime: string, newWakeTime: string, newName: string) => void;
}) {
  const { baby, updateBaby } = useAuth();
  const [name, setName] = useState(() => baby?.name || getBabyName() || "");
  const [bedtime, setBedtime] = useState(() => baby?.bedtime || "20:00");
  const [wakeTime, setWakeTime] = useState(() => baby?.wake_time || "07:00");
  const [isSaving, setIsSaving] = useState(false);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const trimmedName = name.trim();
      if (baby) {
        await updateBaby({
          name: trimmedName,
          bedtime,
          wake_time: wakeTime,
        });
      }
      setBabyName(trimmedName);
      onSaved?.(bedtime, wakeTime, trimmedName);
      onClose();
    } catch (err) {
      console.error("Failed to update baby profile:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Blurred backdrop */}
      <button
        type="button"
        aria-label="Close modal overlay"
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity cursor-default"
        onClick={onClose}
      />

      {/* Modal Dialog Window */}
      <div
        role="dialog"
        aria-labelledby="edit-profile-title"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-3xl bg-[#13121f] p-6 shadow-2xl ring-1 ring-white/15 sm:p-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-tone/15 text-lg text-tone ring-1 ring-tone/30">
              👶
            </span>
            <div>
              <h2 id="edit-profile-title" className="font-display text-xl text-ink [font-variation-settings:'SOFT'_100]">
                Baby Profile & Schedule
              </h2>
              <p className="text-xs text-ink-dim">
                Saved to your account
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-dim transition hover:bg-white/10 hover:text-ink cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
          {/* Baby's Name */}
          <div>
            <label htmlFor="baby-name" className="block text-xs font-medium text-ink-dim">
              Baby’s Name
            </label>
            <input
              id="baby-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Leo, Maya, Oliver"
              maxLength={30}
              required
              className="mt-2 w-full rounded-2xl bg-white/5 px-4 py-3 text-sm text-ink placeholder:text-ink-faint ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-tone/50"
            />
          </div>

          {/* Sleep Schedule Presets */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-ink-dim">
                Sleep Schedule Presets
              </label>
              <span className="text-[11px] text-ink-faint">Common infant routines</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESETS.map((p) => {
                const isSelected = bedtime === p.b && wakeTime === p.w;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setBedtime(p.b);
                      setWakeTime(p.w);
                    }}
                    className={`rounded-xl py-2 px-2 text-center text-xs transition cursor-pointer ${
                      isSelected
                        ? "bg-tone text-[#0a0b15] font-semibold ring-1 ring-tone"
                        : "bg-white/5 text-ink-dim ring-1 ring-white/10 hover:bg-white/10 hover:text-ink"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bedtime & Wake Time Inputs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <label htmlFor="bedtime-input" className="block text-xs text-ink-dim">
                Bedtime (Put Down)
              </label>
              <div className="mt-2 flex items-center justify-between gap-3">
                <input
                  id="bedtime-input"
                  type="time"
                  value={bedtime}
                  onChange={(e) => setBedtime(e.target.value)}
                  className="rounded-xl bg-black/40 px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-white/10 focus:outline-none focus:ring-tone/50"
                />
                <span className="font-display text-sm font-semibold text-tone">
                  {formatTime12(bedtime)}
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <label htmlFor="waketime-input" className="block text-xs text-ink-dim">
                Wake Time (Morning)
              </label>
              <div className="mt-2 flex items-center justify-between gap-3">
                <input
                  id="waketime-input"
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  className="rounded-xl bg-black/40 px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-white/10 focus:outline-none focus:ring-tone/50"
                />
                <span className="font-display text-sm font-semibold text-tone">
                  {formatTime12(wakeTime)}
                </span>
              </div>
            </div>
          </div>

          {/* Scope Note */}
          <p className="text-xs leading-relaxed text-ink-faint">
            Changing the schedule changes the window used for the dashboard, vitals trends, and the morning recap.
          </p>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-full px-5 py-2.5 text-xs font-medium text-ink-dim transition hover:bg-white/5 hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="flex items-center gap-2 rounded-full bg-tone px-6 py-2.5 text-xs font-semibold text-[#0a0b15] transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Saving…</span>
                </>
              ) : (
                <span>Save Profile & Schedule</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditBabyProfileModal({ isOpen, onClose, onSaved }: EditBabyProfileModalProps) {
  if (!isOpen) return null;
  return <EditBabyProfileDialog onClose={onClose} onSaved={onSaved} />;
}

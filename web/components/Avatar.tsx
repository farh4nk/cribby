"use client";

import { useState } from "react";
import Image from "next/image";

interface AvatarProps {
  src: string | null | undefined;
  name: string;
  size: number;
  className?: string;
  /** What to show when there is no picture or it fails to load: a generic profile icon, or nothing. */
  fallback?: "icon" | "none";
}

/** Google profile picture that never shows a broken image. */
export function Avatar({ src, name, size, className = "", fallback = "icon" }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    return (
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className}`}
        // Google's image host can refuse requests that carry a localhost or Tailscale referrer.
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
        unoptimized
      />
    );
  }

  if (fallback === "none") return null;

  return (
    <span
      role="img"
      aria-label={name}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-white/10 text-ink-dim ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size * 0.62, height: size * 0.62 }} aria-hidden>
        <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.1 0-7.5 2.2-7.5 5v1.5h15V19c0-2.8-3.4-5-7.5-5Z" />
      </svg>
    </span>
  );
}

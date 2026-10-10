"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BabyNameButton } from "@/components/BabyNameButton";
import { UserMenu } from "@/components/UserMenu";
import { SystemStatusMenu } from "@/components/SystemStatusMenu";
import { useAuth } from "@/context/AuthProvider";
import Image from "next/image";
import { APP_NAME } from "@/lib/config";

export function Header() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-6">
      <div className="flex items-center gap-5 sm:gap-6">
        <Link href="/" className="flex items-center gap-3 transition hover:opacity-85">
          <Image src="/logo-mark.png" alt="" width={40} height={40} priority />
          <span className="font-display text-xl tracking-tight text-ink [font-variation-settings:'SOFT'_100]">
            {APP_NAME}
          </span>
        </Link>

        {/* Navigation pill tabs */}
        <nav className="flex items-center gap-1 rounded-full bg-white/5 p-1 ring-1 ring-white/10">
          <Link
            href="/"
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
              pathname === "/"
                ? "bg-white/15 text-ink shadow-sm"
                : "text-ink-dim hover:text-ink hover:bg-white/5"
            }`}
          >
            Live Monitor
          </Link>
          <Link
            href="/dashboard"
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
              pathname === "/dashboard"
                ? "bg-white/15 text-ink shadow-sm"
                : "text-ink-dim hover:text-ink hover:bg-white/5"
            }`}
          >
            Night Dashboard
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3 text-sm text-ink-dim">
        <SystemStatusMenu />
        {!user && <BabyNameButton />}
        <UserMenu />
      </div>
    </header>
  );
}

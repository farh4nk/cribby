"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuthUser, BabyProfile } from "@/lib/auth";
import { setBabyName } from "@/lib/babyName";

interface AuthContextType {
  user: AuthUser | null;
  baby: BabyProfile | null;
  isLoading: boolean;
  needsOnboarding: boolean;
  login: () => void;
  logout: () => Promise<void>;
  updateBaby: (updates: {
    name?: string;
    bedtime?: string;
    wake_time?: string;
    voice_id?: string | null;
  }) => Promise<BabyProfile | null>;
  completeOnboarding: (data: {
    babyName: string;
    bedtime: string;
    wakeTime: string;
  }) => Promise<boolean>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  baby: null,
  isLoading: true,
  needsOnboarding: false,
  login: () => {},
  logout: async () => {},
  updateBaby: async () => null,
  completeOnboarding: async () => false,
  refreshSession: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [baby, setBaby] = useState<BabyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          setBaby(data.baby);
          const needs = Boolean(
            data.needs_onboarding ?? (!data.baby?.name || !data.baby.name.trim())
          );
          setNeedsOnboarding(needs);
          if (data.baby?.name && data.baby.name.trim()) {
            // Automatically pull and apply the data associated with their baby
            setBabyName(data.baby.name.trim());
          }
          return;
        }
      }
      setUser(null);
      setBaby(null);
      setNeedsOnboarding(false);
    } catch (err) {
      console.error("[AuthProvider] Failed to fetch session:", err);
      setUser(null);
      setBaby(null);
      setNeedsOnboarding(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (!cancelled) {
        await refreshSession();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  const login = useCallback(() => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/api/auth/google");
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("[AuthProvider] Logout error:", err);
    } finally {
      setUser(null);
      setBaby(null);
      setNeedsOnboarding(false);
      router.push("/");
      router.refresh();
    }
  }, [router]);

  const completeOnboarding = useCallback(
    async (data: {
      babyName: string;
      bedtime: string;
      wakeTime: string;
    }): Promise<boolean> => {
      try {
        const res = await fetch("/api/auth/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baby_name: data.babyName,
            bedtime: data.bedtime,
            wake_time: data.wakeTime,
          }),
        });

        if (res.ok) {
          const result = await res.json();
          setUser(result.user);
          setBaby(result.baby);
          setNeedsOnboarding(false);
          if (result.baby?.name) {
            setBabyName(result.baby.name);
          }
          return true;
        }
      } catch (err) {
        console.error("[AuthProvider] completeOnboarding error:", err);
      }
      return false;
    },
    []
  );

  const updateBaby = useCallback(
    async (updates: {
      name?: string;
      bedtime?: string;
      wake_time?: string;
      voice_id?: string | null;
    }): Promise<BabyProfile | null> => {
      if (!user) {
        // Fallback for unauthenticated session: update client-side store if name provided
        if (updates.name) {
          setBabyName(updates.name);
        }
        return null;
      }

      try {
        const res = await fetch("/api/auth/baby", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (res.ok) {
          const updated: BabyProfile = await res.json();
          setBaby(updated);
          if (updated.name) {
            setBabyName(updated.name);
          }
          return updated;
        }
      } catch (err) {
        console.error("[AuthProvider] Update baby error:", err);
      }
      return null;
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        baby,
        isLoading,
        needsOnboarding,
        login,
        logout,
        updateBaby,
        completeOnboarding,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

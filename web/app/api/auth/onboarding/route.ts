import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getBackendUrl,
  verifySessionToken,
} from "@/lib/auth";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { baby_name, bedtime = "20:00", wake_time = "07:00" } = body;

    if (!baby_name || !baby_name.trim()) {
      return NextResponse.json(
        { error: "Baby name is required" },
        { status: 400 }
      );
    }

    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/api/users/${session.user.id}/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baby_name: baby_name.trim(),
        bedtime,
        wake_time,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: "Failed to save onboarding data", detail: errText },
        { status: res.status }
      );
    }

    const data = await res.json();
    const updatedUser = {
      ...session.user,
      onboarded: true,
    };
    const updatedBaby = data.baby;

    // Issue updated session token with needs_onboarding: false
    const newToken = await createSessionToken({
      user: updatedUser,
      baby: updatedBaby,
      needs_onboarding: false,
    });

    const response = NextResponse.json({
      success: true,
      user: updatedUser,
      baby: updatedBaby,
      needs_onboarding: false,
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: newToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err) {
    console.error("[Onboarding API] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error during onboarding" },
      { status: 500 }
    );
  }
}

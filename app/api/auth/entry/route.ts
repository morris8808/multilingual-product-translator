import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-session";

export const runtime = "nodejs";

function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  // Keep the redirect relative so reverse proxies cannot leak their internal origin.
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/login?source=jofshop&returnTo=${encodeURIComponent(returnTo)}`,
    },
  });

  // An external JOFSHOP launch must never inherit an unrelated browser session.
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}

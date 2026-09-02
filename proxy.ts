import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SETUP_COOKIE } from "@/lib/auth-session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (request.cookies.get(SETUP_COOKIE)?.value === "1" && pathname !== "/setup-account" && !pathname.startsWith("/api/")) {
    const setup = request.nextUrl.clone();
    setup.pathname = "/setup-account";
    setup.search = "";
    return NextResponse.redirect(setup);
  }
  if (!request.cookies.get(SESSION_COOKIE)?.value && !pathname.startsWith("/api/")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

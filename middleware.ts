// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Visada praleidžiam auth flow puslapius + callback
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/set-password") ||
    pathname.startsWith("/auth/callback")
  ) {
    return NextResponse.next();
  }

  // 2) Praleidžiam API ir Next statiką
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Kol kas čia nieko neblokuojam (tik tvarkom “allow list”).
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
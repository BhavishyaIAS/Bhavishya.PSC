import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "bp_session";
const COMMISSION_COOKIE = "bp_commission";

/**
 * Edge-of-app routing only — this is a convenience, not the security boundary.
 * Every API call is authorised again by Django, so a missing check here can never
 * expose data.
 *
 *  • Study pages need a session → redirect to /login?next=…
 *  • Remember the commission the user is browsing, so "Group 1 / Group 2" in
 *    the top nav follow it.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const examMatch = pathname.match(/^\/exams\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?/);
  const needsAuth =
    (examMatch && examMatch[2]) ||
    pathname === "/progress" ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/manage");

  if (needsAuth && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Tell the layout which page this is, so it can render in the right world from the first byte.
  const headers = new Headers(request.headers);
  headers.set("x-bp-path", pathname);
  const response = NextResponse.next({ request: { headers } });
  if (examMatch && request.cookies.get(COMMISSION_COOKIE)?.value !== examMatch[1]) {
    response.cookies.set(COMMISSION_COOKIE, examMatch[1], { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}

export const config = {
  matcher: ["/exams/:path*", "/progress", "/search", "/manage/:path*"],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 renamed "middleware" to "proxy". This gates the whole app behind a
// shared password: requests without a valid session cookie are redirected to
// /login (pages) or rejected with 401 (API routes — protects OpenRouter spend).
export function proxy(request: NextRequest) {
  const token = request.cookies.get("vh_session")?.value;
  const authed = !!token && !!process.env.SESSION_TOKEN && token === process.env.SESSION_TOKEN;
  if (authed) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado. Iniciá sesión." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except static assets and the public auth routes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)"],
};

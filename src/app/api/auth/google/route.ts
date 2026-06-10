import { NextRequest, NextResponse } from "next/server";

// Inicia el flujo OAuth de Google. Redirige al login de Google restringido al
// dominio (hd) de gfmarketing.com.ar. La verificación real del dominio se hace
// en /api/auth/callback (no se puede confiar solo en hd).
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=config", req.nextUrl.origin));
  }

  const domain = process.env.ALLOWED_EMAIL_DOMAIN || "gfmarketing.com.ar";
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback`;
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    hd: domain, // hint: solo cuentas del dominio
    state,
    access_type: "online",
    prompt: "select_account",
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

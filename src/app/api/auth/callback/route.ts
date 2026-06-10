import { NextRequest, NextResponse } from "next/server";

// Recibe el code de Google, lo cambia por tokens, verifica que el email sea del
// dominio permitido (@gfmarketing.com.ar) y recién ahí crea la sesión.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const origin = url.origin;
  const loginRedirect = (err: string) =>
    NextResponse.redirect(new URL(`/login?error=${err}`, origin));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("oauth_state")?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return loginRedirect("csrf");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const sessionToken = process.env.SESSION_TOKEN;
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || "gfmarketing.com.ar").toLowerCase();
  if (!clientId || !clientSecret || !sessionToken) return loginRedirect("config");

  const redirectUri = `${origin}/api/auth/callback`;

  // 1. Cambiar el code por tokens
  let idToken: string | undefined;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return loginRedirect("token");
    const tokens = await tokenRes.json();
    idToken = tokens.id_token;
  } catch {
    return loginRedirect("token");
  }
  if (!idToken) return loginRedirect("token");

  // 2. Decodificar el id_token (viene directo de Google por TLS) y validar dominio
  let email = "";
  let verified = false;
  let hd: string | undefined;
  try {
    const payloadB64 = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf-8"));
    email = String(payload.email || "").toLowerCase();
    verified = payload.email_verified === true || payload.email_verified === "true";
    hd = payload.hd ? String(payload.hd).toLowerCase() : undefined;
  } catch {
    return loginRedirect("token");
  }

  const domainOk = email.endsWith(`@${domain}`) && (!hd || hd === domain);
  if (!verified || !domainOk) {
    return loginRedirect("domain");
  }

  // 3. Sesión válida → cookie httpOnly (misma que chequea el proxy)
  const res = NextResponse.redirect(new URL("/", origin));
  res.cookies.set("vh_session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
  res.cookies.set("oauth_state", "", { path: "/", maxAge: 0 }); // limpiar
  return res;
}

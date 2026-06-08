import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const expected = process.env.APP_PASSWORD;
  const sessionToken = process.env.SESSION_TOKEN;

  if (!expected || !sessionToken) {
    return NextResponse.json(
      { error: "Login no configurado en el servidor (falta APP_PASSWORD / SESSION_TOKEN)." },
      { status: 500 }
    );
  }

  if (password !== expected) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("vh_session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
  return res;
}

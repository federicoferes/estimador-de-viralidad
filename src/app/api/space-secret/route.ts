import { NextResponse } from "next/server";

// Returns the Space access secret to authenticated users only. The proxy
// (proxy.ts) blocks this route with 401 unless a valid session cookie is present,
// so the secret is never handed out without login.
export async function GET() {
  const secret = process.env.SPACE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SPACE_SECRET no configurado." }, { status: 500 });
  }
  return NextResponse.json({ secret });
}

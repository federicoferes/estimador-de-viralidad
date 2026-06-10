import { Lock } from "lucide-react";

const ERRORS: Record<string, string> = {
  domain: "Ese email no es de @gfmarketing.com.ar. Acceso solo para el equipo.",
  csrf: "La sesión de login expiró. Probá de nuevo.",
  token: "No se pudo verificar con Google. Probá de nuevo.",
  config: "Login no configurado en el servidor.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMsg = error ? ERRORS[error] ?? "No se pudo iniciar sesión." : null;

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--bg-alt)] border border-[var(--border)] mb-2">
            <Lock className="w-5 h-5 text-[var(--fg)]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
            Estimador de Viralidad
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Acceso privado. Solo para el equipo de gfmarketing.com.ar.
          </p>
        </div>

        {errorMsg && (
          <p className="text-sm text-red-600 text-center bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            {errorMsg}
          </p>
        )}

        <a
          href="/api/auth/google"
          className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm font-semibold text-[var(--fg)] hover:bg-[var(--bg-alt)] transition-colors"
        >
          <GoogleIcon />
          Entrar con Google
        </a>

        <p className="text-xs text-[var(--fg-muted)] text-center">
          Vas a iniciar sesión con tu cuenta de Google de la empresa.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo iniciar sesión.");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

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
          <p className="text-sm text-[var(--fg-muted)]">Acceso privado. Ingresá la contraseña.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoFocus
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--fg)] transition-colors"
          />
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--fg)] text-[var(--bg)] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Verificando…" : "Entrar →"}
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { VideoUploader } from "@/components/VideoUploader";
import { AnalysisResult } from "@/components/AnalysisResult";
import type { ViralityResult } from "@/types/analysis";

type State = "idle" | "loading" | "result" | "error";

export default function Home() {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<ViralityResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAnalyze = async (file: File) => {
    setState("loading");
    setErrorMsg(null);
    const form = new FormData();
    form.append("video", file);
    const res = await fetch("/api/analyze", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) { setState("error"); setErrorMsg(data.error ?? "Error desconocido."); return; }
    setResult(data);
    setState("result");
  };

  const reset = () => { setState("idle"); setResult(null); setErrorMsg(null); };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-[var(--border)] px-6 md:px-12 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-[var(--fg)]">Viral</span>
          <span className="text-lg font-bold tracking-tight text-[var(--fg-muted)]">Estimator</span>
        </div>
        <a
          href="https://huggingface.co/facebook/tribev2"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--fg-muted)] border border-[var(--border)] rounded-full px-3 py-1.5 hover:border-[var(--fg)] transition-colors"
        >
          Powered by TribeV2 →
        </a>
      </nav>

      <main className="flex-1 px-6 md:px-12 py-12 md:py-20 max-w-5xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {state !== "result" ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              {/* Hero */}
              <div className="space-y-4 max-w-2xl">
                <p className="text-sm text-[var(--fg-muted)] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--yellow)] inline-block" />
                  Neurociencia aplicada al contenido
                </p>
                <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-[var(--fg)]">
                  Estimá el potencial viral<br />de tu video
                </h1>
                <p className="text-[var(--fg-muted)] text-lg leading-relaxed max-w-lg">
                  TribeV2 predice cómo activa tu video el{" "}
                  <span className="text-[var(--fg)] font-medium">circuito de recompensa</span>,
                  la{" "}
                  <span className="text-[var(--fg)] font-medium">atención visual</span>{" "}
                  y la{" "}
                  <span className="text-[var(--fg)] font-medium">memoria auditiva</span>{" "}
                  del cerebro humano.
                </p>
              </div>

              {/* Dimension pills */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Recompensa Emocional", color: "bg-[var(--yellow-bg)] text-[#7a5f00]" },
                  { label: "Impacto Visual",        color: "bg-[var(--sky-bg)] text-[#1d4ed8]" },
                  { label: "Enganche Auditivo",     color: "bg-[var(--lavender-bg)] text-[#5b21b6]" },
                  { label: "Narrativa",             color: "bg-[var(--coral-bg)] text-[#991b1b]" },
                ].map((d) => (
                  <span key={d.label} className={`text-xs font-medium px-3 py-1.5 rounded-full ${d.color}`}>
                    → {d.label}
                  </span>
                ))}
              </div>

              {/* Upload card */}
              <div className="border border-[var(--border)] rounded-2xl p-6 bg-[var(--bg-alt)]">
                <VideoUploader onAnalyze={handleAnalyze} isLoading={state === "loading"} />
                {state === "error" && errorMsg && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 text-sm text-red-600 text-center"
                  >
                    {errorMsg}
                  </motion.p>
                )}
              </div>

              {/* Trust strip */}
              <div className="border-t border-[var(--border)] pt-8">
                <p className="text-xs text-[var(--fg-muted)] uppercase tracking-widest mb-4">
                  Basado en investigación de
                </p>
                <div className="flex flex-wrap items-center gap-6 text-sm font-medium text-[var(--fg-muted)]">
                  <span>Meta Research</span>
                  <span className="text-[var(--border)]">·</span>
                  <span>HuggingFace</span>
                  <span className="text-[var(--border)]">·</span>
                  <span>d'Ascoli et al., 2026</span>
                  <span className="text-[var(--border)]">·</span>
                  <span>CC-BY-NC-4.0</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {result && <AnalysisResult result={result} onReset={reset} />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

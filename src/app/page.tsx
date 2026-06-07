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

    if (!res.ok) {
      setState("error");
      setErrorMsg(data.error ?? "Error desconocido.");
      return;
    }

    setResult(data);
    setState("result");
  };

  const reset = () => {
    setState("idle");
    setResult(null);
    setErrorMsg(null);
  };

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12 md:py-20">
      <div className="w-full max-w-xl space-y-8">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-800/60 bg-violet-900/20 text-xs text-violet-300 font-medium mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Powered by TribeV2 Neuroscience Model
          </div>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            <span className="text-white">Estimador de</span>{" "}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent glow-text">
              Viralidad
            </span>
          </h1>

          <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
            Cargá tu video y la IA analiza la{" "}
            <span className="text-violet-300">activación neuronal</span> que genera —
            cuánto activa el circuito de recompensa, atención visual, audio y narrativa.
          </p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm"
        >
          <AnimatePresence mode="wait">
            {state !== "result" ? (
              <motion.div key="uploader" exit={{ opacity: 0 }}>
                <VideoUploader
                  onAnalyze={handleAnalyze}
                  isLoading={state === "loading"}
                />
                {state === "error" && errorMsg && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-sm text-red-300 text-center"
                  >
                    {errorMsg}
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0 }}>
                {result && <AnalysisResult result={result} onReset={reset} />}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-xs text-slate-700 space-y-1"
        >
          <p>
            Basado en{" "}
            <a
              href="https://huggingface.co/facebook/tribev2"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-violet-400 transition-colors"
            >
              TribeV2 (Meta Research)
            </a>{" "}
            · Modelo fundacional de visión, audición y lenguaje para neurociencia
          </p>
          <p className="text-slate-800">
            d'Ascoli et al., 2026 · CC-BY-NC-4.0
          </p>
        </motion.footer>
      </div>

      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-violet-900/10 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 rounded-full bg-cyan-900/8 blur-3xl" />
      </div>
    </main>
  );
}

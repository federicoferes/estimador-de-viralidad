"use client";

import { motion } from "framer-motion";
import { ViralityMeter } from "./ViralityMeter";
import { BrainBreakdown } from "./BrainBreakdown";
import type { ViralityResult } from "@/types/analysis";

export function AnalysisResult({ result, onReset }: { result: ViralityResult; onReset: () => void }) {
  return (
    <div className="max-w-2xl space-y-10">
      <div className="space-y-2">
        <p className="text-sm text-[var(--fg-muted)] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--yellow)] inline-block" />
          Análisis completado
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[var(--fg)]">
          Resultado del análisis
        </h1>
      </div>

      <ViralityMeter score={result.overall_score} />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="border border-[var(--border)] rounded-2xl p-6 space-y-2"
      >
        <p className="font-semibold text-[var(--fg)]">{result.verdict}</p>
        <p className="text-sm text-[var(--fg-muted)] leading-relaxed">→ {result.recommendation}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        <p className="text-xs text-[var(--fg-muted)] uppercase tracking-widest font-semibold mb-4">
          Activación por dimensión neuronal
        </p>
        <BrainBreakdown dimensions={result.dimensions} />
      </motion.div>

      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
        <span className="text-xs text-[var(--fg-muted)]">
          TribeV2 · {result.processing_time_ms}ms
        </span>
        <button
          onClick={onReset}
          className="text-sm font-medium text-[var(--fg)] hover:underline underline-offset-4 transition-all"
        >
          ← Analizar otro video
        </button>
      </div>
    </div>
  );
}

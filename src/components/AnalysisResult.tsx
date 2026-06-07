"use client";

import { motion } from "framer-motion";
import { ViralityMeter } from "./ViralityMeter";
import { BrainBreakdown } from "./BrainBreakdown";
import type { ViralityResult } from "@/types/analysis";

interface AnalysisResultProps {
  result: ViralityResult;
  onReset: () => void;
}

export function AnalysisResult({ result, onReset }: AnalysisResultProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="gradient-border rounded-2xl p-6 flex flex-col items-center gap-6">
        <ViralityMeter score={result.overall_score} />

        <div className="text-center space-y-1 max-w-sm">
          <p className="text-slate-200 font-medium">{result.verdict}</p>
          <p className="text-sm text-slate-500">{result.recommendation}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <BrainBreakdown dimensions={result.dimensions} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-slate-600">
          Procesado con TribeV2 en {result.processing_time_ms}ms
        </span>
        <button
          onClick={onReset}
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium"
        >
          Analizar otro video →
        </button>
      </div>
    </motion.div>
  );
}

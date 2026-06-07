"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

const STAGES = [
  { at: 0,  msg: "Subiendo video al Space..." },
  { at: 6,  msg: "TribeV2 procesando frames..." },
  { at: 20, msg: "Analizando activación neuronal..." },
  { at: 45, msg: "Calculando scores cerebrales..." },
  { at: 75, msg: "Casi listo..." },
  { at: 90, msg: "El Space puede estar iniciando (primera vez ~2 min)..." },
];

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}

export function AnalysisLoader() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const stage = [...STAGES].reverse().find((s) => elapsed >= s.at) ?? STAGES[0];

  return (
    <div className="flex flex-col items-center gap-5 py-8">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--fg-muted)]" />

      <AnimatePresence mode="wait">
        <motion.p
          key={stage.msg}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="text-sm text-[var(--fg)] font-medium text-center max-w-xs"
        >
          {stage.msg}
        </motion.p>
      </AnimatePresence>

      <span className="text-xs text-[var(--fg-muted)] tabular-nums">{fmt(elapsed)}</span>

      {elapsed >= 90 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-[var(--fg-muted)] bg-[var(--yellow-bg)] border border-[#f5c84240] rounded-xl px-4 py-3 max-w-xs text-center leading-relaxed"
        >
          El Space entra en sleep después de 15 min sin uso.
          La primera solicitud puede tardar hasta 3 minutos.
        </motion.div>
      )}
    </div>
  );
}

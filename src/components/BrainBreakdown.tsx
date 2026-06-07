"use client";

import { motion } from "framer-motion";
import type { BrainDimension } from "@/types/analysis";

const STYLES: Record<string, { bar: string; label: string; bg: string }> = {
  reward:    { bar: "bg-[var(--yellow)]",  label: "text-[#3d2f00]",  bg: "bg-[var(--yellow-bg)]" },
  visual:    { bar: "bg-[var(--sky)]",     label: "text-[#1e3a5f]",  bg: "bg-[var(--sky-bg)]" },
  audio:     { bar: "bg-[var(--lavender)]",label: "text-[#2d1b6e]",  bg: "bg-[var(--lavender-bg)]" },
  narrative: { bar: "bg-[var(--coral)]",   label: "text-[#7f1d1d]",  bg: "bg-[var(--coral-bg)]" },
};

export function BrainBreakdown({ dimensions }: { dimensions: BrainDimension[] }) {
  return (
    <div className="space-y-2">
      {dimensions.map((dim, i) => {
        const s = STYLES[dim.roi] ?? STYLES.visual;
        return (
          <motion.div
            key={dim.roi}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i }}
            className={`rounded-xl px-5 py-4 ${s.bg} flex items-center justify-between gap-4`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-semibold ${s.label}`}>→ {dim.label}</span>
                <span className={`text-sm font-bold tabular-nums ${s.label}`}>{Math.round(dim.score)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${s.bar}`}
                  initial={{ width: "0%" }}
                  animate={{ width: `${dim.score}%` }}
                  transition={{ delay: 0.1 * i, duration: 0.8, ease: "easeOut" }}
                />
              </div>
              <p className="text-xs text-[var(--fg-muted)] mt-1.5">{dim.description}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

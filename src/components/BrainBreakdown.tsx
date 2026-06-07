"use client";

import { motion } from "framer-motion";
import type { BrainDimension } from "@/types/analysis";

const ICONS: Record<string, string> = {
  visual: "👁️",
  audio: "🎧",
  narrative: "📖",
  reward: "⚡",
};

const COLORS: Record<string, { bar: string; glow: string }> = {
  visual: { bar: "#06b6d4", glow: "#06b6d420" },
  audio: { bar: "#7c3aed", glow: "#7c3aed20" },
  narrative: { bar: "#10b981", glow: "#10b98120" },
  reward: { bar: "#f59e0b", glow: "#f59e0b20" },
};

interface BrainBreakdownProps {
  dimensions: BrainDimension[];
}

export function BrainBreakdown({ dimensions }: BrainBreakdownProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
        Activación por Dimensión
      </h3>
      {dimensions.map((dim, i) => {
        const key = dim.roi;
        const colors = COLORS[key] ?? { bar: "#7c3aed", glow: "#7c3aed20" };
        const icon = ICONS[key] ?? "🧠";
        return (
          <motion.div
            key={dim.roi}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * i, duration: 0.5 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{icon}</span>
                <span className="text-sm font-medium text-slate-300">{dim.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 hidden sm:block">{dim.description}</span>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: colors.bar }}
                >
                  {Math.round(dim.score)}
                </span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${colors.bar}aa, ${colors.bar})`,
                  boxShadow: `0 0 8px ${colors.bar}60`,
                }}
                initial={{ width: "0%" }}
                animate={{ width: `${dim.score}%` }}
                transition={{ delay: 0.15 * i, duration: 1, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

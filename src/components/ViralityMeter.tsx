"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface ViralityMeterProps {
  score: number;
}

function getVerdict(score: number) {
  if (score >= 85) return { label: "Viral Potencial", color: "#10b981", glow: "#10b98140" };
  if (score >= 70) return { label: "Alto Impacto", color: "#06b6d4", glow: "#06b6d440" };
  if (score >= 50) return { label: "Buen Potencial", color: "#7c3aed", glow: "#7c3aed40" };
  if (score >= 30) return { label: "Moderado", color: "#f59e0b", glow: "#f59e0b30" };
  return { label: "Bajo Potencial", color: "#ef4444", glow: "#ef444430" };
}

const SIZE = 220;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ViralityMeter({ score }: ViralityMeterProps) {
  const [animated, setAnimated] = useState(0);
  const verdict = getVerdict(score);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  const dashOffset = CIRCUMFERENCE - (animated / 100) * CIRCUMFERENCE;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#1e293b"
            strokeWidth={STROKE}
          />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={verdict.color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            style={{ filter: `drop-shadow(0 0 8px ${verdict.color})` }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <motion.span
            className="text-5xl font-bold tabular-nums"
            style={{ color: verdict.color, textShadow: `0 0 20px ${verdict.glow}` }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {Math.round(animated)}
          </motion.span>
          <span className="text-xs text-slate-500 uppercase tracking-widest">/ 100</span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="px-4 py-1.5 rounded-full text-sm font-semibold border"
        style={{
          color: verdict.color,
          borderColor: verdict.color + "60",
          backgroundColor: verdict.glow,
        }}
      >
        {verdict.label}
      </motion.div>
    </div>
  );
}

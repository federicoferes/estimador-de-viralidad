"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface ViralityMeterProps {
  score: number;
}

function getStyle(score: number) {
  if (score >= 85) return { bg: "bg-[var(--yellow-bg)]",  badge: "bg-[var(--yellow)] text-[#3d2f00]",   label: "Viral Potencial" };
  if (score >= 70) return { bg: "bg-[var(--sky-bg)]",     badge: "bg-[var(--sky)] text-[#1e3a5f]",       label: "Alto Impacto" };
  if (score >= 50) return { bg: "bg-[var(--lavender-bg)]",badge: "bg-[var(--lavender)] text-[#2d1b6e]",  label: "Buen Potencial" };
  if (score >= 30) return { bg: "bg-orange-50",           badge: "bg-orange-200 text-orange-900",         label: "Moderado" };
  return           { bg: "bg-[var(--coral-bg)]",          badge: "bg-[var(--coral)] text-red-900",        label: "Bajo Potencial" };
}

export function ViralityMeter({ score }: ViralityMeterProps) {
  const [animated, setAnimated] = useState(0);
  const style = getStyle(score);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 80);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div className={`rounded-2xl p-8 ${style.bg} flex flex-col items-center gap-4`}>
      <motion.div
        className="text-8xl font-bold tabular-nums text-[var(--fg)] leading-none"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {Math.round(animated)}
      </motion.div>
      <div className="text-sm text-[var(--fg-muted)] font-medium">sobre 100</div>
      <span className={`text-sm font-semibold px-4 py-1.5 rounded-full ${style.badge}`}>
        → {style.label}
      </span>
    </div>
  );
}

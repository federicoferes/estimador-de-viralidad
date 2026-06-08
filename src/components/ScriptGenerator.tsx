"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronDown, Loader2, Copy, Check } from "lucide-react";
import { LLM_MODELS } from "@/types/analysis";
import type { ViralityResult } from "@/types/analysis";

export function ScriptGenerator({ result }: { result: ViralityResult }) {
  const [model, setModel] = useState(LLM_MODELS[0].id);
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setScript(null);
    try {
      const res = await fetch("/api/generar-guion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          overall_score: result.overall_score,
          dimensions: result.dimensions.map((d) => ({ label: d.label, score: d.score })),
          verdict: result.verdict,
          recommendation: result.recommendation,
          transcript: result.transcript,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error generando el guión.");
      setScript(data.script as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!script) return;
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const modelLabel = LLM_MODELS.find((m) => m.id === model)?.label ?? "Claude";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="border border-[var(--border)] rounded-2xl p-6 space-y-5 bg-[var(--bg-alt)]"
    >
      <div className="space-y-1">
        <p className="font-semibold text-[var(--fg)] flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--yellow)]" />
          Volvelo viral con IA
        </p>
        <p className="text-sm text-[var(--fg-muted)] leading-relaxed">
          Un LLM toma el análisis de TribeV2 {result.transcript ? "y la transcripción del video" : ""} y
          te genera ideas, un guión reescrito y ganchos para testear.
        </p>
        {!result.transcript && (
          <p className="text-xs text-[var(--fg-muted)] italic">
            (No se detectó transcripción — el guión se basa solo en los scores.)
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loading}
            className="appearance-none w-full sm:w-44 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-2.5 pr-9 text-sm font-medium text-[var(--fg)] cursor-pointer hover:border-[var(--fg)] transition-colors disabled:opacity-50"
          >
            {LLM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--fg-muted)]" />
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-[var(--fg)] text-[var(--bg)] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generando con {modelLabel}…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {script ? "Regenerar guión viral" : "Generar guión viral"} →
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 leading-relaxed">{error}</p>
      )}

      <AnimatePresence>
        {script && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border)] pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--fg-muted)] uppercase tracking-widest font-semibold">
                  Generado por {modelLabel}
                </span>
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <Markdown content={script} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Minimal Markdown renderer for the fixed format the prompt produces
 *  (## headings, **bold**, - bullets, plain paragraphs). */
function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length) {
      blocks.push(
        <ul key={key} className="space-y-1.5 pl-1">
          {list.map((item, i) => (
            <li key={i} className="text-sm text-[var(--fg)] leading-relaxed flex gap-2">
              <span className="text-[var(--yellow)] select-none">•</span>
              <span dangerouslySetInnerHTML={{ __html: inline(item) }} />
            </li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^#{1,3}\s/.test(line)) {
      flushList(`l${i}`);
      const text = line.replace(/^#{1,3}\s/, "");
      blocks.push(
        <h3 key={i} className="text-base font-bold text-[var(--fg)] pt-2">
          {text}
        </h3>
      );
    } else if (/^[-*]\s/.test(line)) {
      list.push(line.replace(/^[-*]\s/, ""));
    } else if (line.trim() === "") {
      flushList(`l${i}`);
    } else {
      flushList(`l${i}`);
      blocks.push(
        <p
          key={i}
          className="text-sm text-[var(--fg)] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: inline(line) }}
        />
      );
    }
  });
  flushList("end");

  return <div className="space-y-2">{blocks}</div>;
}

/** Escape HTML then apply **bold** → <strong>. */
function inline(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[var(--fg)]">$1</strong>');
}

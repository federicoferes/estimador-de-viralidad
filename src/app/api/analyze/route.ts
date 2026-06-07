import { NextRequest, NextResponse } from "next/server";
import type { ViralityResult } from "@/types/analysis";

const HF_SPACE_URL = process.env.HF_SPACE_URL ?? "";
const HF_TOKEN = process.env.HF_TOKEN ?? "";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("video") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No se recibió ningún video." }, { status: 400 });
  }

  if (!HF_SPACE_URL) {
    return NextResponse.json(buildDemoResult(), { status: 200 });
  }

  const upstream = new FormData();
  upstream.append("video", file);

  const start = Date.now();
  const res = await fetch(`${HF_SPACE_URL}/predict`, {
    method: "POST",
    headers: HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {},
    body: upstream,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Error del backend TribeV2: ${text}` },
      { status: 502 }
    );
  }

  const data = await res.json();
  const elapsed = Date.now() - start;

  const result = mapToViralityResult(data, elapsed);
  return NextResponse.json(result);
}

function mapToViralityResult(data: Record<string, number>, elapsed: number): ViralityResult {
  const visual = clamp(data.visual ?? 0);
  const audio = clamp(data.audio ?? 0);
  const narrative = clamp(data.language ?? 0);
  const reward = clamp(data.reward ?? 0);

  const overall = Math.round(0.35 * reward + 0.25 * visual + 0.20 * audio + 0.20 * narrative);

  return {
    overall_score: overall,
    dimensions: [
      { label: "Recompensa Emocional", score: reward, roi: "reward", description: "Núcleo accumbens / VTA" },
      { label: "Impacto Visual", score: visual, roi: "visual", description: "Corteza visual V1-V4, MT" },
      { label: "Enganche Auditivo", score: audio, roi: "audio", description: "Corteza auditiva A1-A2" },
      { label: "Narrativa / Lenguaje", score: narrative, roi: "narrative", description: "STS, áreas de lenguaje" },
    ],
    verdict: getVerdict(overall),
    recommendation: getRecommendation(overall, { visual, audio, narrative, reward }),
    processing_time_ms: elapsed,
  };
}

function buildDemoResult(): ViralityResult {
  const reward = 78;
  const visual = 85;
  const audio = 62;
  const narrative = 71;
  const overall = Math.round(0.35 * reward + 0.25 * visual + 0.20 * audio + 0.20 * narrative);

  return {
    overall_score: overall,
    dimensions: [
      { label: "Recompensa Emocional", score: reward, roi: "reward", description: "Núcleo accumbens / VTA" },
      { label: "Impacto Visual", score: visual, roi: "visual", description: "Corteza visual V1-V4, MT" },
      { label: "Enganche Auditivo", score: audio, roi: "audio", description: "Corteza auditiva A1-A2" },
      { label: "Narrativa / Lenguaje", score: narrative, roi: "narrative", description: "STS, áreas de lenguaje" },
    ],
    verdict: getVerdict(overall),
    recommendation: getRecommendation(overall, { visual, audio, narrative, reward }),
    processing_time_ms: 1240,
  };
}

function getVerdict(score: number): string {
  if (score >= 85) return "Este video tiene altísimo potencial viral. El cerebro lo percibe como altamente recompensante.";
  if (score >= 70) return "Fuerte potencial de engagement. La activación neuronal es sólida en las dimensiones clave.";
  if (score >= 50) return "Potencial moderado-alto. Con algunos ajustes puede aumentar significativamente su alcance.";
  if (score >= 30) return "Potencial moderado. El contenido no genera suficiente activación en las áreas de recompensa.";
  return "Bajo potencial viral. Revisá el gancho inicial y el componente emocional del video.";
}

function getRecommendation(
  score: number,
  dims: { visual: number; audio: number; narrative: number; reward: number }
): string {
  const weakest = Object.entries(dims).sort(([, a], [, b]) => a - b)[0][0];
  const tips: Record<string, string> = {
    reward: "Potenciá el elemento sorpresa o la recompensa emocional en los primeros 3 segundos.",
    visual: "Mejorá el dinamismo visual: más cortes, colores vibrantes o movimiento de cámara.",
    audio: "Trabajá la música o efectos de sonido — el audio impacta fuerte en la retención.",
    narrative: "Hacé más clara la historia central: planteá el conflicto más rápido.",
  };
  return tips[weakest] ?? "Mantené la estructura actual y optimizá la miniatura y el título.";
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v * 100)));
}

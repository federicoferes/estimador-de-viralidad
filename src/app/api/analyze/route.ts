import { NextRequest, NextResponse } from "next/server";
import type { ViralityResult } from "@/types/analysis";

export const maxDuration = 120; // Vercel Pro allows up to 300s; hobby capped at 60s

const HF_SPACE_URL = process.env.HF_SPACE_URL ?? "";
const TIMEOUT_MS = 110_000;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("video") as File | null;
  if (!file) return NextResponse.json({ error: "No se recibió ningún video." }, { status: 400 });

  if (!HF_SPACE_URL) return NextResponse.json(buildDemoResult(), { status: 200 });

  const start = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    // Step 1: upload file to Gradio Space
    const uploadForm = new FormData();
    uploadForm.append("files", file, file.name);
    const uploadRes = await fetch(`${HF_SPACE_URL}/gradio_api/upload`, {
      method: "POST",
      body: uploadForm,
      signal: abort.signal,
    });
    if (!uploadRes.ok) {
      const t = await uploadRes.text();
      console.error("[analyze] upload failed:", t);
      return NextResponse.json({ error: `Error al subir el video: ${t}` }, { status: 502 });
    }
    const [serverPath]: string[] = await uploadRes.json();

    // Step 2: call Gradio predict with the uploaded file reference
    const predictRes = await fetch(`${HF_SPACE_URL}/gradio_api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        data: [{ video: { path: serverPath, meta: { _type: "gradio.FileData" } }, subtitles: null }],
      }),
    });
    if (!predictRes.ok) {
      const t = await predictRes.text();
      console.error("[analyze] predict failed:", t);
      return NextResponse.json({ error: `Error en el análisis TribeV2: ${t}` }, { status: 502 });
    }

    const json = await predictRes.json();
    // Gradio returns: { data: [{ type: "value", value: {...scores} }] }
    const scores: Record<string, string> = json?.data?.[0]?.value ?? json?.data?.[0] ?? {};
    const elapsed = Date.now() - start;
    return NextResponse.json(mapGradioResult(scores, elapsed));

  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[analyze] error:", err);
    return NextResponse.json(
      { error: isTimeout
          ? "El análisis tardó demasiado. El Space puede estar iniciando — esperá 30 segundos y reintentá."
          : `Error inesperado: ${String(err)}` },
      { status: isTimeout ? 504 : 500 }
    );
  } finally {
    clearTimeout(timer);
  }
}

function mapGradioResult(scores: Record<string, string>, elapsed: number): ViralityResult {
  const parse = (key: string) => parseInt(scores[key] ?? "0") || 0;
  const visual    = parse("Impacto Visual");
  const audio     = parse("Enganche Auditivo");
  const narrative = parse("Narrativa / Lenguaje");
  const reward    = parse("Recompensa Emocional");
  const overall   = parse("Viralidad Global") ||
    Math.round(0.35 * reward + 0.25 * visual + 0.20 * audio + 0.20 * narrative);

  return {
    overall_score: overall,
    dimensions: [
      { label: "Recompensa Emocional", score: reward,    roi: "reward",    description: "Núcleo accumbens / VTA" },
      { label: "Impacto Visual",        score: visual,    roi: "visual",    description: "Corteza visual V1-V4, MT" },
      { label: "Enganche Auditivo",     score: audio,     roi: "audio",     description: "Corteza auditiva A1-A2" },
      { label: "Narrativa / Lenguaje",  score: narrative, roi: "narrative", description: "STS, áreas de lenguaje" },
    ],
    verdict: getVerdict(overall),
    recommendation: getRecommendation(overall, { visual, audio, narrative, reward }),
    processing_time_ms: elapsed,
  };
}

function buildDemoResult(): ViralityResult {
  const reward = 78, visual = 85, audio = 62, narrative = 71;
  const overall = Math.round(0.35 * reward + 0.25 * visual + 0.20 * audio + 0.20 * narrative);
  return {
    overall_score: overall,
    dimensions: [
      { label: "Recompensa Emocional", score: reward,    roi: "reward",    description: "Núcleo accumbens / VTA" },
      { label: "Impacto Visual",        score: visual,    roi: "visual",    description: "Corteza visual V1-V4, MT" },
      { label: "Enganche Auditivo",     score: audio,     roi: "audio",     description: "Corteza auditiva A1-A2" },
      { label: "Narrativa / Lenguaje",  score: narrative, roi: "narrative", description: "STS, áreas de lenguaje" },
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

function getRecommendation(score: number, d: Record<string, number>): string {
  const weakest = Object.entries(d).sort(([, a], [, b]) => a - b)[0][0];
  const tips: Record<string, string> = {
    reward:    "Potenciá el elemento sorpresa o la recompensa emocional en los primeros 3 segundos.",
    visual:    "Mejorá el dinamismo visual: más cortes, colores vibrantes o movimiento de cámara.",
    audio:     "Trabajá la música o efectos de sonido — el audio impacta fuerte en la retención.",
    narrative: "Hacé más clara la historia central: planteá el conflicto más rápido.",
  };
  return tips[weakest] ?? "Mantené la estructura actual y optimizá la miniatura y el título.";
}

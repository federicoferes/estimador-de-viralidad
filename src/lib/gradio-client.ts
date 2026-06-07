import type { ViralityResult } from "@/types/analysis";

const SPACE_URL = "https://fedeferes-estimador-de-viralidad.hf.space";

interface RawScores {
  visual:    number;
  audio:     number;
  language:  number;
  reward:    number;
  elapsed_ms?: number;
}

export async function analyzeVideo(
  file: File,
  signal: AbortSignal
): Promise<ViralityResult> {
  const t0 = Date.now();

  const form = new FormData();
  form.append("video", file, file.name);

  let res: Response;
  try {
    res = await fetch(`${SPACE_URL}/analyze`, {
      method: "POST",
      body: form,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error(
      "No se pudo conectar al Space. " +
      "Si es la primera vez en el día puede tardar hasta 3 min en iniciar. Reintentá."
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const detail = JSON.parse(text || "{}").detail ?? text.slice(0, 200);
    throw new Error(`Error del Space (${res.status}): ${detail}`);
  }

  const scores: RawScores = await res.json();
  return mapScores(scores, Date.now() - t0);
}

function mapScores(s: RawScores, elapsedMs: number): ViralityResult {
  const visual    = Math.round(s.visual    * 100);
  const audio     = Math.round(s.audio     * 100);
  const narrative = Math.round(s.language  * 100);
  const reward    = Math.round(s.reward    * 100);
  const overall   = Math.round(0.35 * reward + 0.25 * visual + 0.20 * audio + 0.20 * narrative);

  return {
    overall_score: overall,
    dimensions: [
      { label: "Recompensa Emocional", score: reward,    roi: "reward",    description: "Núcleo accumbens / VTA" },
      { label: "Impacto Visual",        score: visual,    roi: "visual",    description: "Corteza visual V1-V4, MT" },
      { label: "Enganche Auditivo",     score: audio,     roi: "audio",     description: "Corteza auditiva A1-A2" },
      { label: "Narrativa / Lenguaje",  score: narrative, roi: "narrative", description: "STS, áreas de lenguaje" },
    ],
    verdict:        getVerdict(overall),
    recommendation: getRecommendation({ visual, audio, narrative, reward }),
    processing_time_ms: elapsedMs,
  };
}

function getVerdict(score: number): string {
  if (score >= 85) return "Este video tiene altísimo potencial viral. El cerebro lo percibe como altamente recompensante.";
  if (score >= 70) return "Fuerte potencial de engagement. La activación neuronal es sólida en las dimensiones clave.";
  if (score >= 50) return "Potencial moderado-alto. Con algunos ajustes puede aumentar significativamente su alcance.";
  if (score >= 30) return "Potencial moderado. El contenido no genera suficiente activación en las áreas de recompensa.";
  return "Bajo potencial viral. Revisá el gancho inicial y el componente emocional del video.";
}

function getRecommendation(d: Record<string, number>): string {
  const weakest = Object.entries(d).sort(([, a], [, b]) => a - b)[0][0];
  const tips: Record<string, string> = {
    reward:    "Potenciá el elemento sorpresa o la recompensa emocional en los primeros 3 segundos.",
    visual:    "Mejorá el dinamismo visual: más cortes, colores vibrantes o movimiento de cámara.",
    audio:     "Trabajá la música o efectos de sonido — el audio impacta fuerte en la retención.",
    narrative: "Hacé más clara la historia central: planteá el conflicto más rápido.",
  };
  return tips[weakest] ?? "Mantené la estructura actual y optimizá la miniatura y el título.";
}

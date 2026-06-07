import type { ViralityResult } from "@/types/analysis";

const SPACE_URL =
  process.env.NEXT_PUBLIC_HF_SPACE_URL ??
  "https://fedeferes-estimador-de-viralidad.hf.space";

export async function analyzeVideo(
  file: File,
  signal: AbortSignal
): Promise<ViralityResult> {
  const t0 = Date.now();

  // Upload file to Gradio Space
  const uploadForm = new FormData();
  uploadForm.append("files", file, file.name);
  const uploadRes = await fetch(`${SPACE_URL}/gradio_api/upload`, {
    method: "POST",
    body: uploadForm,
    signal,
  });
  if (!uploadRes.ok) {
    throw new Error(`Error al subir el video (${uploadRes.status})`);
  }
  const uploadData: string[] = await uploadRes.json();
  const serverPath = uploadData[0];

  // Call predict — may return a synchronous result or a queue event_id
  const predictRes = await fetch(`${SPACE_URL}/gradio_api/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        {
          video: { path: serverPath, meta: { _type: "gradio.FileData" } },
          subtitles: null,
        },
      ],
    }),
    signal,
  });
  if (!predictRes.ok) {
    throw new Error(`Error en el análisis TribeV2 (${predictRes.status})`);
  }
  const json = await predictRes.json();

  let scores: Record<string, string>;
  if (json.event_id) {
    scores = await pollQueue(json.event_id, signal);
  } else {
    scores = json?.data?.[0]?.value ?? json?.data?.[0] ?? {};
  }

  return mapScores(scores, Date.now() - t0);
}

async function pollQueue(
  eventId: string,
  signal: AbortSignal
): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(
      `${SPACE_URL}/gradio_api/queue/data?event_id=${eventId}`
    );

    signal.addEventListener("abort", () => {
      es.close();
      reject(new DOMException("Aborted", "AbortError"));
    });

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.msg === "process_completed") {
          es.close();
          resolve(data.output?.data?.[0]?.value ?? data.output?.data?.[0] ?? {});
        } else if (data.msg === "queue_full" || data.msg === "process_errored") {
          es.close();
          reject(new Error("El Space no pudo procesar el video. Reintentá en unos segundos."));
        }
      } catch {
        // ignore JSON parse errors from SSE
      }
    };

    es.onerror = () => {
      es.close();
      reject(new Error("Conexión con el Space interrumpida."));
    };
  });
}

function mapScores(
  scores: Record<string, string>,
  elapsedMs: number
): ViralityResult {
  const parse = (key: string) => parseInt(scores[key] ?? "0") || 0;
  const visual    = parse("Impacto Visual");
  const audio     = parse("Enganche Auditivo");
  const narrative = parse("Narrativa / Lenguaje");
  const reward    = parse("Recompensa Emocional");
  const overall   =
    parse("Viralidad Global") ||
    Math.round(0.35 * reward + 0.25 * visual + 0.20 * audio + 0.20 * narrative);

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

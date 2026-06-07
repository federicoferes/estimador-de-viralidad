import type { ViralityResult } from "@/types/analysis";

const SPACE_URL =
  process.env.NEXT_PUBLIC_HF_SPACE_URL ??
  "https://fedeferes-estimador-de-viralidad.hf.space";

export async function analyzeVideo(
  file: File,
  signal: AbortSignal
): Promise<ViralityResult> {
  const t0 = Date.now();

  // Step 1: Upload file to Gradio Space
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

  // Step 2: Join Gradio 5 queue (async queue approach — no timeout)
  const sessionHash = crypto.randomUUID().slice(0, 8);
  const joinRes = await fetch(`${SPACE_URL}/gradio_api/queue/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fn_index: 0,
      data: [
        {
          video: { path: serverPath, meta: { _type: "gradio.FileData" } },
          subtitles: null,
        },
      ],
      session_hash: sessionHash,
      trigger_id: null,
      event_data: null,
    }),
    signal,
  });
  if (!joinRes.ok) {
    throw new Error(`Error al iniciar el análisis (${joinRes.status})`);
  }
  const { event_id } = await joinRes.json() as { event_id: string };

  // Step 3: Stream SSE events until process_completed
  const scores = await awaitQueueResult(event_id, signal);
  return mapScores(scores, Date.now() - t0);
}

function awaitQueueResult(
  eventId: string,
  signal: AbortSignal
): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(
      `${SPACE_URL}/gradio_api/queue/data?event_id=${eventId}`
    );

    const done = (fn: () => void) => { es.close(); fn(); };

    signal.addEventListener("abort", () =>
      done(() => reject(new DOMException("Aborted", "AbortError")))
    );

    es.onmessage = (e) => {
      let data: Record<string, unknown>;
      try { data = JSON.parse(e.data); } catch { return; }

      const msg = data.msg as string | undefined;

      if (msg === "process_completed") {
        const output = data.output as { data?: unknown[] } | undefined;
        const raw = output?.data?.[0];
        const scores: Record<string, string> =
          (raw as { value?: Record<string, string> })?.value ??
          (raw as Record<string, string>) ??
          {};
        done(() => resolve(scores));
      } else if (msg === "queue_full") {
        done(() => reject(new Error("El Space está ocupado. Reintentá en unos segundos.")));
      } else if (msg === "process_errored") {
        const detail = (data.output as { error?: string } | undefined)?.error;
        done(() => reject(new Error(detail ?? "Error procesando el video en TribeV2.")));
      }
    };

    es.onerror = () =>
      done(() => reject(new Error("Conexión con el Space interrumpida.")));
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

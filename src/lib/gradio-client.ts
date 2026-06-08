import type { ViralityResult } from "@/types/analysis";

const SPACE_URL = "https://fedeferes-estimador-de-viralidad.hf.space";

export async function analyzeVideo(
  file: File,
  signal: AbortSignal
): Promise<ViralityResult> {
  const t0 = Date.now();

  // 0. Get the Space access secret (login-gated Vercel route). Without it the
  //    Space rejects the analysis, so anonymous direct hits can't burn GPU/Groq.
  let spaceSecret = "";
  try {
    const secretRes = await fetch("/api/space-secret", { signal });
    if (secretRes.ok) {
      const j = await secretRes.json();
      spaceSecret = typeof j?.secret === "string" ? j.secret : "";
    }
  } catch {
    /* non-fatal: if it fails the Space will reject and we surface that error */
  }

  // 1. Upload file to HF Space storage
  const uploadForm = new FormData();
  uploadForm.append("files", file, file.name);

  let uploadRes: Response;
  try {
    uploadRes = await fetch(`${SPACE_URL}/gradio_api/upload`, {
      method: "POST",
      body: uploadForm,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error(
      "No se pudo conectar al Space. Si es la primera vez puede tardar hasta 3 min en iniciar. Reintentá."
    );
  }

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    throw new Error(`Error al subir el video (${uploadRes.status}): ${text.slice(0, 200)}`);
  }

  const uploadedPaths: string[] = await uploadRes.json();
  const serverPath = uploadedPaths?.[0];
  if (!serverPath) {
    throw new Error("El Space no devolvió una ruta para el video subido.");
  }

  // 2. Call /gradio_api/call/predict (Gradio 5 async call API — no session_hash needed)
  let callRes: Response;
  try {
    callRes = await fetch(`${SPACE_URL}/gradio_api/call/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            path: serverPath,
            orig_name: file.name,
            size: file.size,
            mime_type: file.type || "video/mp4",
            meta: { _type: "gradio.FileData" },
          },
          spaceSecret,
        ],
      }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("Error al enviar el video al Space para análisis.");
  }

  if (!callRes.ok) {
    const text = await callRes.text().catch(() => "");
    throw new Error(`Error iniciando análisis (${callRes.status}): ${text.slice(0, 200)}`);
  }

  const { event_id } = await callRes.json();
  if (!event_id) {
    throw new Error("El Space no devolvió un event_id.");
  }

  // 3. Stream SSE from /gradio_api/call/predict/{event_id}
  const rawResult = await streamCallResult(event_id, signal);

  return mapGradioResult(rawResult, Date.now() - t0);
}

function streamCallResult(
  eventId: string,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const url = `${SPACE_URL}/gradio_api/call/predict/${encodeURIComponent(eventId)}`;
    const es = new EventSource(url);

    const done = (fn: () => void) => {
      es.close();
      fn();
    };

    const onAbort = () =>
      done(() => reject(new DOMException("The operation was aborted.", "AbortError")));
    signal.addEventListener("abort", onAbort, { once: true });

    es.addEventListener("error", (evt) => {
      signal.removeEventListener("abort", onAbort);
      const data = (evt as MessageEvent).data;
      let msg = "Error en el Space durante el análisis.";
      if (typeof data === "string") {
        try { msg = JSON.parse(data) as string; } catch { msg = data.slice(0, 300); }
      }
      done(() => reject(new Error(msg)));
    });

    es.addEventListener("complete", (evt) => {
      signal.removeEventListener("abort", onAbort);
      let outputArr: unknown[];
      try {
        outputArr = JSON.parse((evt as MessageEvent).data);
      } catch {
        done(() => reject(new Error("Respuesta inesperada del Space.")));
        return;
      }
      const result = outputArr?.[0];
      if (!result || typeof result !== "object") {
        done(() => reject(new Error("El Space devolvió un resultado vacío.")));
        return;
      }
      done(() => resolve(result as Record<string, unknown>));
    });

    es.onerror = () => {
      signal.removeEventListener("abort", onAbort);
      done(() => reject(new Error("Conexión con el Space interrumpida. Intentá de nuevo.")));
    };
  });
}

function mapGradioResult(
  result: Record<string, unknown>,
  elapsedMs: number
): ViralityResult {
  if (result.error) {
    const root = result.root_cause && result.root_cause !== result.error
      ? ` (causa: ${result.root_cause})`
      : "";
    throw new Error(`Error en TribeV2: ${result.error}${root}`);
  }

  const parseScore = (val: unknown): number => {
    if (typeof val === "number") return Math.round(val);
    if (typeof val === "string") {
      const m = val.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    }
    return 0;
  };

  const overall   = parseScore(result["Viralidad Global"]);
  const visual    = parseScore(result["Impacto Visual"]);
  const audio     = parseScore(result["Enganche Auditivo"]);
  const narrative = parseScore(result["Narrativa / Lenguaje"]);
  const reward    = parseScore(result["Recompensa Emocional"]);
  const transcript = typeof result["transcript"] === "string"
    ? (result["transcript"] as string)
    : undefined;

  return {
    overall_score: overall,
    dimensions: [
      { label: "Recompensa Emocional", score: reward,    roi: "reward",    description: "Núcleo accumbens / VTA" },
      { label: "Impacto Visual",       score: visual,    roi: "visual",    description: "Corteza visual V1-V4, MT" },
      { label: "Enganche Auditivo",    score: audio,     roi: "audio",     description: "Corteza auditiva A1-A2" },
      { label: "Narrativa / Lenguaje", score: narrative, roi: "narrative", description: "STS, áreas de lenguaje" },
    ],
    verdict:        getVerdict(overall),
    recommendation: getRecommendation({ visual, audio, narrative, reward }),
    processing_time_ms: elapsedMs,
    transcript,
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

import { NextRequest, NextResponse } from "next/server";
import { LLM_MODELS } from "@/types/analysis";

export const maxDuration = 60; // LLMs can take 20-50s; Hobby caps at 60s

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface DimensionInput {
  label: string;
  score: number;
}

interface GenerateRequest {
  model: string;
  overall_score: number;
  dimensions: DimensionInput[];
  verdict?: string;
  recommendation?: string;
  transcript?: string;
}

const ALLOWED = new Set(LLM_MODELS.map((m) => m.id));

const SYSTEM_PROMPT = `Sos un estratega de contenido viral experto en short-form (Reels, TikTok, Shorts) y en copywriting persuasivo. Escribís en español rioplatense, con voseo, directo y energético, sin relleno corporativo.

Tu trabajo: a partir del análisis neurocientífico de un video (modelo TribeV2 de Meta Research, que predice activación cerebral) y su transcripción, diagnosticar por qué el video tiene el potencial viral que tiene y reescribirlo para maximizarlo.

Devolvés SIEMPRE en este formato Markdown exacto:

## 🔍 Diagnóstico
2-3 frases conectando los scores neuronales con lo que pasa en el video. Sé específico sobre qué dimensión falla y por qué.

## 💡 3 ideas para viralizarlo
- **Idea 1:** ...
- **Idea 2:** ...
- **Idea 3:** ...

## 🎬 Guión reescrito
Un guión listo para grabar, optimizado para enganche. Marcá los tiempos y separá GANCHO (0-3s), DESARROLLO y CIERRE/CTA. El gancho tiene que frenar el scroll en los primeros 3 segundos.

## 🪝 5 ganchos alternativos
Cinco primeras líneas distintas para testear, cada una en una viñeta.

Reglas: nada de explicaciones meta sobre lo que vas a hacer. Andá directo al contenido. Si no hay transcripción, trabajá con el tema que se infiere de los scores y aclaralo en una línea.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta configurar OPENROUTER_API_KEY en el servidor." },
      { status: 500 }
    );
  }

  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const model = ALLOWED.has(body.model) ? body.model : "anthropic/claude-opus-4.8";

  const dims = (body.dimensions ?? [])
    .map((d) => `- ${d.label}: ${d.score}/100`)
    .join("\n");

  const transcript = (body.transcript ?? "").trim();
  const userPrompt = `# Análisis TribeV2 del video

**Viralidad global: ${body.overall_score}/100**

Activación por dimensión neuronal:
${dims}

Veredicto del modelo: ${body.verdict ?? "—"}
Recomendación base: ${body.recommendation ?? "—"}

# Transcripción del video
${transcript || "(sin transcripción disponible — inferí el tema desde los scores)"}

---
Generá el diagnóstico, las ideas, el guión reescrito y los ganchos alternativos.`;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 55_000);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://estimador-de-viralidad.vercel.app",
        "X-Title": "Estimador de Viralidad",
      },
      signal: abort.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[generar-guion] OpenRouter error:", res.status, t);
      return NextResponse.json(
        { error: `Error del modelo (${res.status}): ${t.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "El modelo no devolvió contenido." },
        { status: 502 }
      );
    }

    return NextResponse.json({ script: content, model });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[generar-guion] error:", err);
    return NextResponse.json(
      {
        error: isTimeout
          ? "El modelo tardó demasiado. Reintentá o probá con otro."
          : `Error inesperado: ${String(err)}`,
      },
      { status: isTimeout ? 504 : 500 }
    );
  } finally {
    clearTimeout(timer);
  }
}

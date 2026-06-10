# 🧠 Estimador de Viralidad — Guía completa de recreación

> Documento para reconstruir el sistema completo desde cero en otro momento.
> Incluye el alta en cada servicio, el código crítico, los secrets, y las
> lecciones aprendidas (los errores que ya pagamos para que no los repitas).
>
> Última actualización: junio 2026.

---

## 0. Qué es y cómo funciona

Una web app que predice el **potencial viral de un video** usando **TribeV2**
(modelo de neurociencia de Meta Research que predice activación cerebral fMRI),
y después usa un **LLM** para reescribir el guión y darte ideas para viralizarlo.

### Flujo de datos

```
Usuario (logueado)
   │  sube video
   ▼
Frontend Next.js (Vercel)  ──fetch clave──►  /api/space-secret (gateado por login)
   │  upload directo del video (hasta 250MB)
   ▼
HuggingFace Space (Gradio, GPU L4)
   │  1. ffmpeg: recorta a 45s @ 15fps
   │  2. TribeV2: predice activación cerebral → scores por dimensión
   │  3. Groq Whisper: transcribe el audio
   ▼
Scores + transcript  ──►  Frontend muestra resultado
   │  "Generar guión viral"
   ▼
/api/generar-guion (Vercel)  ──►  OpenRouter (Claude/GPT/Gemini/Grok/DeepSeek/Qwen)
   ▼
Guión viral + ideas + ganchos
```

### Las 5 piezas

| Pieza | Tecnología | Dónde corre |
|---|---|---|
| Frontend | Next.js 16 + React 19 + Tailwind v4 | Vercel |
| Backend ML | Gradio + TribeV2 | HuggingFace Space (GPU L4) |
| Transcripción | Groq (Whisper large-v3-turbo) | API externa |
| Generación de guiones | OpenRouter (6 LLMs) | API externa, llamada desde Vercel |
| Seguridad | Login por contraseña + clave del Space | Vercel proxy + Space |

---

## 1. Cuentas y servicios que necesitás

| Servicio | Para qué | Costo |
|---|---|---|
| **HuggingFace** | Hostear el Space (modelo) + token | Space GPU L4: **$0.80/hr** (solo activo; duerme tras inactividad) |
| **Vercel** | Deploy del frontend | Hobby (gratis) alcanza |
| **GitHub** | Repo (origin) que deploya a Vercel | Gratis |
| **Groq** | Transcripción de audio | Tier gratis generoso / pago por uso bajísimo |
| **OpenRouter** | LLMs para los guiones | Pago por uso (cargás crédito, ej. $10) |
| **Acceso a TribeV2** | Modelo `facebook/tribev2` | Gratis, licencia CC-BY-NC-4.0 (puede requerir aceptar términos) |

> 💡 **Sobre el costo de la GPU:** el Space **no factura mientras duerme**, PERO
> el "Sleep after" viene en 48h. Ponelo en **15 min – 1 hora** o vas a pagar idle.

---

## 2. El prompt maestro (para construirlo con un agente IA)

> Copiá esto a Claude Code (o similar) para reconstruir el proyecto. Ajustá nombres.

```
Quiero construir "Estimador de Viralidad": una web app que predice el potencial
viral de un video usando el modelo TribeV2 de Meta Research (facebook/tribev2),
y después genera un guión viral reescrito con un LLM.

ARQUITECTURA:
- Frontend: Next.js 16 (App Router) + React 19 + Tailwind v4, deploy en Vercel.
- Backend ML: un HuggingFace Space con SDK Gradio, hardware GPU L4 (24GB), que
  corre TribeV2. El browser sube el video DIRECTO al Space (no por Vercel, por el
  límite de 4.5MB de Vercel Hobby).
- Transcripción: el Space extrae el audio con ffmpeg y lo manda a Groq
  (whisper-large-v3-turbo) — NO uses Whisper local (compite por VRAM con TribeV2).
- Guiones: una API route de Vercel llama a OpenRouter con dropdown de 6 modelos
  (Claude, ChatGPT, Gemini, Grok, DeepSeek, Qwen). Recibe los scores de TribeV2 +
  el transcript y devuelve diagnóstico + ideas + guión reescrito + ganchos.
- Seguridad: login por contraseña en Vercel (proxy.ts, que en Next 16 reemplaza
  middleware.ts). Además, el Space valida una clave secreta compartida en cada
  análisis (el frontend la obtiene de una ruta gateada por el login).

GOTCHAS CRÍTICOS (respetalos o vas a perder horas):
1. transformers DEBE ser <5 (en v5 rompe el import de Wav2Vec2BertModel que usa
   el extractor de audio). Pineá: transformers>=4.44,<5.
2. TribeV2 llama "uvx whisperx" para transcribir → falla en el Space. Parcheá
   ExtractWordsFromAudio._run para que NO transcriba (el modelo funciona sin Word
   events). La transcripción la hacemos aparte con Groq.
3. Usá gr.File, NO gr.Video (gr.Video transcodea el video antes de tu función y
   crashea silenciosamente).
4. Usá el endpoint /gradio_api/call/predict (Gradio 5 async API), NO la queue API,
   porque la queue silencia los errores (success:false, error:null).
5. TribeV2 procesa el video frame por frame a 2Hz fijo → el costo es la DURACIÓN.
   Recortá con ffmpeg a 45s antes de analizar (el fps/resolución no cambian el
   resultado porque el extractor samplea 2 frames/seg y redimensiona a 224px).
6. VRAM: vjepa2-vitg con batch 8 da OOM en 16GB (T4). En L4 (24GB) usá batch 4 via
   config_update de from_pretrained. En T4 tendrías que usar batch 1 (lento).
7. El Space tiene que ser PÚBLICO: EventSource (el SSE del resultado) no puede
   mandar headers de auth, así que un Space privado rompe el streaming. Por eso la
   seguridad del Space es por clave secreta dentro de la función, no por privacidad.
8. Cold start: el Space re-descarga ~7GB de modelos cada vez que despierta (storage
   efímero). Persistent Storage lo arregla pero ojo: NO uses "Storage Buckets" (es
   object storage por FUSE, rompe mmap/symlinks del cache de HF). Usá el "Persistent
   Storage" clásico (disco SSD).

Construilo paso a paso, validando cada pieza.
```

---

## 3. Paso a paso detallado

### 3.1 — HuggingFace: cuenta, token y acceso al modelo

1. Creá cuenta en https://huggingface.co
2. Generá un **token de acceso**: Settings → Access Tokens → **New token** →
   tipo **Write** (lo vas a usar para pushear al Space). Guardalo.
3. Andá a https://huggingface.co/facebook/tribev2 y, si pide, **aceptá la licencia**
   (CC-BY-NC-4.0) para poder descargar el modelo.

### 3.2 — Crear el Space

1. https://huggingface.co/new-space
2. Nombre: `estimador-de-viralidad` · SDK: **Gradio** · Hardware: arrancá en CPU o
   T4 y subilo a **L4** después (Settings → Hardware → **Nvidia 1xL4**).
3. **Sleep after:** ponelo en **15 min** (Settings) para no pagar idle.

### 3.3 — Código del backend

El Space lee estos archivos del repo (monorepo compartido con el frontend):
- `ml-backend/app.py` (el código, abajo)
- `requirements.txt` (en la RAÍZ, no solo en ml-backend/)
- `README.md` (en la raíz, con YAML frontmatter)

**`README.md`** (raíz) — el frontmatter es obligatorio o el Space no levanta:

```yaml
---
title: Estimador de Viralidad - TribeV2
emoji: 🧠
colorFrom: purple
colorTo: blue
sdk: gradio
sdk_version: 5.29.0
app_file: ml-backend/app.py
startup_duration_timeout: 1h
pinned: false
license: cc-by-nc-4.0
---
```

**`requirements.txt`** (raíz Y ml-backend/, mismo contenido):

```
tribev2 @ git+https://github.com/facebookresearch/tribev2.git
exca==0.5.22
neuralset==0.0.2
transformers>=4.44,<5
accelerate>=0.30.0
fastapi>=0.115
uvicorn[standard]>=0.30
gradio>=5.29.0
httpx>=0.27
numpy==2.2.6
torch>=2.5.1,<2.7
```

**`ml-backend/app.py`** — el código completo:

```python
"""
HuggingFace Space — TribeV2 Virality Backend
SDK: gradio  |  Hardware: L4
"""

import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
_TRIBE_CACHE = "/tmp/tribev2_cache"

import shutil, subprocess, traceback, tempfile, time
import numpy as np
from pathlib import Path

MAX_ANALYSIS_SECONDS = 45
TARGET_FPS = 15


def _prepare_video(src_path: str) -> tuple[str, bool]:
    """Recorta a los primeros MAX_ANALYSIS_SECONDS y re-encodea a TARGET_FPS."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return src_path, False
    dst = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
    cmd = [ffmpeg, "-y", "-ss", "0", "-t", str(MAX_ANALYSIS_SECONDS), "-i", src_path,
           "-r", str(TARGET_FPS), "-vf", "scale=-2:480",
           "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
           "-c:a", "aac", "-b:a", "128k", dst]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            try: os.unlink(dst)
            except OSError: pass
            return src_path, False
    except Exception:
        try: os.unlink(dst)
        except OSError: pass
        return src_path, False
    return dst, True

import gradio as gr
from fastapi import File, UploadFile, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

_hf_token = os.environ.get("HF_TOKEN")
if _hf_token:
    try:
        from huggingface_hub import login
        login(token=_hf_token, add_to_git_credential=False)
    except Exception as _e:
        print(f">>> HF login warning: {_e}", flush=True)

from tribev2 import TribeModel

# GOTCHA #2: TribeV2 llama "uvx whisperx" → falla. Parcheamos para saltearlo.
try:
    import tribev2.eventstransforms as _et
    import pandas as _pd
    def _skip_transcription(self, events: _pd.DataFrame) -> _pd.DataFrame:
        return events
    _et.ExtractWordsFromAudio._run = _skip_transcription
except Exception as _patch_err:
    print(f">>> patch warning: {_patch_err}", flush=True)

import threading
_model = None
_model_lock = threading.Lock()


def get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                # GOTCHA #6: batch tuneado para L4 24GB (en T4 16GB usar batch 1)
                config_update = {
                    "data.video_feature.image.batch_size": 4,
                    "data.image_feature.image.batch_size": 2,
                    "data.batch_size": 4,
                }
                _model = TribeModel.from_pretrained(
                    "facebook/tribev2", cache_folder=_TRIBE_CACHE,
                    config_update=config_update,
                )
    return _model


def _score(preds, lo, hi):
    region = preds[:, lo:hi]
    ceiling = float(np.percentile(preds, 95))
    if ceiling <= 0:
        return 0.0
    return float(np.clip(np.mean(region) / ceiling, 0.0, 1.0))


def analyze_prepared(prepared_path: str) -> dict:
    model = get_model()
    df = model.get_events_dataframe(video_path=prepared_path)
    preds, _ = model.predict(events=df)
    n = preds.shape[1]; q = n // 4
    return {"visual": _score(preds,0,q), "audio": _score(preds,q,2*q),
            "language": _score(preds,2*q,3*q), "reward": _score(preds,3*q,n)}


# ── Transcripción via Groq (NO Whisper local — libera la GPU) ──
GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = "whisper-large-v3-turbo"

def transcribe_audio(media_path: str) -> str:
    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key:
        return ""
    ffmpeg = shutil.which("ffmpeg")
    audio_path = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
    try:
        if ffmpeg:
            r = subprocess.run([ffmpeg,"-y","-i",media_path,"-vn","-ac","1",
                "-ar","16000","-b:a","64k",audio_path], capture_output=True, text=True, timeout=120)
            upload_path = audio_path if r.returncode == 0 else media_path
        else:
            upload_path = media_path
        import httpx
        with open(upload_path, "rb") as f:
            resp = httpx.post(GROQ_TRANSCRIBE_URL,
                headers={"Authorization": f"Bearer {groq_key}"},
                files={"file": (os.path.basename(upload_path), f, "audio/mpeg")},
                data={"model": GROQ_MODEL, "response_format": "json"}, timeout=120)
        if resp.status_code != 200:
            return ""
        return (resp.json().get("text") or "").strip()
    except Exception:
        return ""
    finally:
        try: os.unlink(audio_path)
        except OSError: pass


# ── Control de acceso: clave secreta (GOTCHA #7) ──
def _check_secret(secret: str) -> bool:
    expected = os.environ.get("SPACE_SECRET")
    if not expected:
        return True
    return secret == expected


def gradio_fn(video_input, secret: str = "") -> dict:
    if not _check_secret(secret):
        return {"error": "No autorizado. Acceso restringido.", "type": "Unauthorized"}
    try:
        if isinstance(video_input, dict):
            video_path = str(video_input.get("path") or video_input.get("url") or "")
        elif hasattr(video_input, "path"):
            video_path = str(video_input.path)
        else:
            video_path = str(video_input) if video_input is not None else ""
        if not video_path:
            return {"error": "No se recibió ruta de video", "type": "ValueError"}
        prepared, is_temp = _prepare_video(video_path)
        try:
            scores = analyze_prepared(prepared)
            transcript = transcribe_audio(prepared)
        finally:
            if is_temp:
                try: os.unlink(prepared)
                except OSError: pass
        overall = round(0.35*scores["reward"]*100 + 0.25*scores["visual"]*100
                        + 0.20*scores["audio"]*100 + 0.20*scores["language"]*100)
        return {
            "Viralidad Global": f"{overall}/100",
            "Impacto Visual": f"{round(scores['visual']*100)}/100",
            "Enganche Auditivo": f"{round(scores['audio']*100)}/100",
            "Narrativa / Lenguaje": f"{round(scores['language']*100)}/100",
            "Recompensa Emocional": f"{round(scores['reward']*100)}/100",
            "transcript": transcript,
        }
    except BaseException as exc:
        # GOTCHA: transformers oculta el error real → caminamos la cadena __cause__
        tb = traceback.format_exc()
        chain, cur, seen = [], exc, set()
        while cur is not None and id(cur) not in seen:
            seen.add(id(cur)); chain.append(f"{type(cur).__name__}: {cur}")
            cur = cur.__cause__ or cur.__context__
        return {"error": str(exc) or f"<{type(exc).__name__}>",
                "root_cause": chain[-1] if chain else str(exc),
                "type": type(exc).__name__, "details": tb[-800:]}


# GOTCHA #3 (gr.File no gr.Video) + #7 (segundo input = clave)
demo = gr.Interface(
    fn=gradio_fn,
    inputs=[gr.File(label="Video a analizar", file_types=["video"]),
            gr.Textbox(label="Clave de acceso", type="password")],
    outputs=gr.JSON(label="Potencial de Viralidad"),
    title="Estimador de Viralidad — TribeV2",
)
demo.app.add_middleware(CORSMiddleware, allow_origins=["*"],
                        allow_methods=["*"], allow_headers=["*"])

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
```

### 3.4 — Secrets del Space

Space → Settings → **Variables and secrets** → New secret (uno por uno):

| Secret | Valor |
|---|---|
| `HF_TOKEN` | tu token Write de HuggingFace |
| `GROQ_API_KEY` | tu key de Groq (paso 3.10) |
| `SPACE_SECRET` | una clave random larga (ej. `openssl rand -hex 24`). **Tiene que ser idéntica a la de Vercel.** |

### 3.5 — Hardware y visibilidad

- Settings → Hardware → **Nvidia 1xL4** ($0.80/hr).
- **Hacé el Space PÚBLICO** (GOTCHA #7): Settings → visibilidad → Public. Si está
  privado, el frontend recibe 404/HTML al subir el video.

### 3.6 — Pushear al Space

El repo se pushea a DOS remotes (mismo código, monorepo):
```bash
git remote add hf https://USER:HF_TOKEN@huggingface.co/spaces/USER/estimador-de-viralidad
git remote add origin https://github.com/USER/estimador-de-viralidad.git
git push hf main      # rebuildea el Space (~5-8 min)
git push origin main  # deploya Vercel
```

### 3.7 — Frontend (Next.js 16)

Estructura de archivos clave:
```
src/
├── proxy.ts                       # login gate (Next 16: era middleware.ts)
├── types/analysis.ts              # ViralityResult + LLM_MODELS
├── lib/gradio-client.ts           # habla con el Space (/call/predict + SSE)
├── app/
│   ├── page.tsx                   # home: uploader → resultado
│   ├── login/page.tsx             # form de contraseña
│   └── api/
│       ├── login/route.ts         # valida password, setea cookie
│       ├── space-secret/route.ts  # entrega la clave del Space (post-login)
│       └── generar-guion/route.ts # llama a OpenRouter
└── components/
    ├── VideoUploader.tsx          # MAX_MB = 250
    ├── AnalysisResult.tsx
    ├── ScriptGenerator.tsx        # dropdown 6 modelos + render del guión
    └── ...
```

**Modelos OpenRouter** (slugs de junio 2026 — verificá los actuales en
`https://openrouter.ai/api/v1/models`):
```
anthropic/claude-opus-4.8   (Claude, default)
openai/gpt-5.5              (ChatGPT)
google/gemini-2.5-pro       (Gemini)
x-ai/grok-4.3              (Grok)
deepseek/deepseek-v3.2     (DeepSeek)
qwen/qwen3.7-max           (Qwen)
```

**`src/proxy.ts`** (el login gate de Next 16):
```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const token = request.cookies.get("vh_session")?.value;
  const authed = !!token && !!process.env.SESSION_TOKEN && token === process.env.SESSION_TOKEN;
  if (authed) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/login).*)"],
};
```

El cliente (`gradio-client.ts`) hace: (1) `fetch("/api/space-secret")` para la clave,
(2) upload del video a `${SPACE_URL}/gradio_api/upload`, (3) POST a
`/gradio_api/call/predict` con `data: [fileData, secret]`, (4) stream del resultado
por `EventSource` en `/gradio_api/call/predict/{event_id}`.

### 3.8 — Deploy en Vercel + variables de entorno

```bash
vercel link          # conectar el proyecto
vercel --prod        # o conectá el repo de GitHub para auto-deploy
```

**Variables de entorno en Vercel** (Settings → Environment Variables, en Production
y Development; redeploy después de cambiarlas):

| Variable | Valor |
|---|---|
| `OPENROUTER_API_KEY` | tu key de OpenRouter |
| `SPACE_SECRET` | **idéntica** a la del Space |
| `APP_PASSWORD` | la contraseña del login |
| `SESSION_TOKEN` | random largo (`openssl rand -hex 32`) — valor de la cookie |

> La URL del Space va hardcodeada en `gradio-client.ts` (`SPACE_URL`). Actualizala
> con tu subdominio `https://USER-estimador-de-viralidad.hf.space`.

### 3.9 — Login / seguridad (resumen)

- **Vercel:** `proxy.ts` redirige a `/login` si no hay cookie válida. `/api/login`
  compara contra `APP_PASSWORD` y setea cookie httpOnly `vh_session = SESSION_TOKEN`.
- **Space:** `gradio_fn` exige `SPACE_SECRET`. El frontend lo obtiene de
  `/api/space-secret` (que el proxy bloquea con 401 si no estás logueado).
- Resultado: nadie sin login puede gastar GPU, Groq ni OpenRouter.

### 3.10 — Groq (transcripción)

1. https://console.groq.com → cuenta → **API Keys** → Create.
2. Cargá la key como secret `GROQ_API_KEY` en el Space (paso 3.4).
3. Modelo usado: `whisper-large-v3-turbo` (rápido y barato).

### 3.11 — OpenRouter (guiones)

1. https://openrouter.ai → cuenta → **Keys** → Create.
2. Cargá crédito (ej. $10) en Settings → Credits.
3. Cargá la key como `OPENROUTER_API_KEY` en Vercel (paso 3.8).

---

## 4. Lecciones aprendidas (los errores que ya pagamos)

| # | Síntoma | Causa | Solución |
|---|---|---|---|
| 1 | `Could not import Wav2Vec2BertModel` | transformers v5 instalado | Pinear `transformers>=4.44,<5` |
| 2 | `[Errno 2] No such file: 'uvx'` | TribeV2 llama `uvx whisperx` | Parchear `ExtractWordsFromAudio._run` |
| 3 | `success:false, error:null` (silencioso) | queue API + gr.Video transcodea | Usar `/call/predict` + `gr.File` |
| 4 | OOM / crash en análisis | vjepa2-vitg batch 8 en 16GB | L4 24GB + `batch_size=4` via config_update |
| 5 | Análisis de 10+ min | TribeV2 procesa todo el video | ffmpeg recorta a 45s antes |
| 6 | Cold start de 7 min en cada uso | storage efímero re-descarga modelos | Persistent Storage (disco SSD, NO bucket) |
| 7 | Upload da "500 HTML" | Space en privado | Hacer el Space **público** |
| 8 | `middleware.ts` no funciona | Next 16 lo renombró | Usar `proxy.ts` |
| 9 | Guión sin contexto del video | faltaba transcript | Groq Whisper en el Space |

**Deuda técnica conocida:** el mapeo dimensión→región cerebral es un placeholder
(parte el array de vértices en cuartos, no es anatómicamente válido; "Recompensa/
NAcc" es subcortical y no está en un modelo de superficie cortical). El score global
sirve como proxy pero los desgloses no son científicamente sólidos. Pendiente:
mapear vértices a un atlas real de ROIs.

---

## 5. Costos mensuales estimados (uso esporádico)

| Item | Costo |
|---|---|
| HF Space L4 (con sleep 15min, uso en ráfagas) | ~$5-20/mes según uso |
| HF Persistent Storage (opcional, mata el cold-start) | $5/mes (20GB) |
| Vercel Hobby | $0 |
| Groq | centavos |
| OpenRouter | pago por uso (cargás crédito) |

---

## 6. Checklist final

- [ ] Cuenta HF + token Write + acepté licencia de `facebook/tribev2`
- [ ] Space creado, SDK Gradio, hardware L4, sleep 15min, **público**
- [ ] `README.md` (raíz) con YAML frontmatter
- [ ] `requirements.txt` en raíz Y ml-backend/ con `transformers<5`
- [ ] `ml-backend/app.py` con: patch whisperx, batch 4, ffmpeg trim, Groq, secret gate
- [ ] Secrets del Space: `HF_TOKEN`, `GROQ_API_KEY`, `SPACE_SECRET`
- [ ] Cuenta Groq + key
- [ ] Cuenta OpenRouter + crédito + key
- [ ] Frontend Next.js con `proxy.ts`, login, las 3 API routes
- [ ] `SPACE_URL` actualizada en `gradio-client.ts`
- [ ] Vercel env vars: `OPENROUTER_API_KEY`, `SPACE_SECRET` (=Space), `APP_PASSWORD`, `SESSION_TOKEN`
- [ ] Push a `hf` (Space) y `origin` (Vercel)
- [ ] Probar: login → subir video → análisis → generar guión

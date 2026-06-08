"""
HuggingFace Space — TribeV2 Virality Backend
SDK: gradio  |  Hardware: T4-small
"""

import os

# Reduce CUDA memory fragmentation — helps avoid OOM on the 16GB T4 when the
# big extractors (V-JEPA2 ViT-giant) allocate large activation buffers.
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import shutil
import subprocess
import traceback
import tempfile
import time
import numpy as np
from pathlib import Path

# TribeV2 processes EVERY frame (n_frames = duration × fps) through a vision model.
# On a T4-small a full 2-min/30fps video = ~3600 forward passes = 10+ min.
# For virality estimation the hook + first seconds are what matter, so we trim
# and downsample with ffmpeg before analysis to keep it fast and bounded.
MAX_ANALYSIS_SECONDS = 45
TARGET_FPS = 15


def _prepare_video(src_path: str) -> tuple[str, bool]:
    """Trim to the first MAX_ANALYSIS_SECONDS and re-encode at TARGET_FPS.
    Returns (path_to_use, is_temp). Falls back to the original on any failure."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("[WARN] ffmpeg not found — analyzing full video (slow)", flush=True)
        return src_path, False

    dst = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
    cmd = [
        ffmpeg, "-y", "-ss", "0", "-t", str(MAX_ANALYSIS_SECONDS),
        "-i", src_path,
        "-r", str(TARGET_FPS),
        "-vf", "scale=-2:480",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-c:a", "aac", "-b:a", "128k",
        dst,
    ]
    print(f"[INFO] Preprocessing: trim to {MAX_ANALYSIS_SECONDS}s @ {TARGET_FPS}fps, 480p", flush=True)
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            print(f"[WARN] ffmpeg failed, using original:\n{r.stderr[-400:]}", flush=True)
            try: os.unlink(dst)
            except OSError: pass
            return src_path, False
    except Exception as e:
        print(f"[WARN] ffmpeg exception, using original: {e}", flush=True)
        try: os.unlink(dst)
        except OSError: pass
        return src_path, False
    return dst, True

import gradio as gr
from fastapi import File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Authenticate with HF so gated models (TribeV2 + LLaMA) can be downloaded
_hf_token = os.environ.get("HF_TOKEN")
if _hf_token:
    try:
        from huggingface_hub import login
        login(token=_hf_token, add_to_git_credential=False)
        print(">>> HF authenticated.", flush=True)
    except Exception as _e:
        print(f">>> HF login warning: {_e}", flush=True)

from tribev2 import TribeModel

# Patch out the uvx/whisperx transcription step — TribeV2 works without Word events
# (language-responsive vertices will show baseline activation instead of driven response)
try:
    import tribev2.eventstransforms as _et
    import pandas as _pd

    def _skip_transcription(self, events: _pd.DataFrame) -> _pd.DataFrame:
        print("[INFO] Skipping whisperx transcription (not available on HF Space)", flush=True)
        return events

    _et.ExtractWordsFromAudio._run = _skip_transcription
    print(">>> Audio transcription patched (no uvx/whisperx needed).", flush=True)
except Exception as _patch_err:
    print(f">>> Could not patch ExtractWordsFromAudio: {_patch_err}", flush=True)

_model: TribeModel | None = None


def get_model() -> TribeModel:
    global _model
    if _model is None:
        print(">>> Loading TribeV2...", flush=True)
        # Batch sizes tuned for the L4's 24GB VRAM. Original config (vjepa2 b8)
        # OOMs at 16GB; b4 fits comfortably at 24GB and is ~4x faster than b1.
        config_update = {
            "data.video_feature.image.batch_size": 4,  # vjepa2-vitg (the hog)
            "data.image_feature.image.batch_size": 2,  # dinov2-large
            "data.batch_size": 4,                       # brain encoder
        }
        _model = TribeModel.from_pretrained(
            "facebook/tribev2",
            cache_folder="/tmp/tribev2_cache",
            config_update=config_update,
        )
        print(">>> TribeV2 ready (batch_size=4, L4 24GB).", flush=True)
    return _model


def _score(preds: np.ndarray, lo: int, hi: int) -> float:
    region = preds[:, lo:hi]
    ceiling = float(np.percentile(preds, 95))
    if ceiling <= 0:
        return 0.0
    return float(np.clip(np.mean(region) / ceiling, 0.0, 1.0))


def analyze_prepared(prepared_path: str) -> dict:
    """Run TribeV2 on an already-prepared (trimmed/downsampled) video."""
    model = get_model()
    df = model.get_events_dataframe(video_path=prepared_path)
    preds, _ = model.predict(events=df)   # (n_timesteps, n_vertices)

    n = preds.shape[1]
    q = n // 4
    return {
        "visual":   _score(preds, 0,   q),
        "audio":    _score(preds, q,   2*q),
        "language": _score(preds, 2*q, 3*q),
        "reward":   _score(preds, 3*q, n),
    }


def analyze_video(video_path: str) -> dict:
    """Prepare + analyze. Kept for the standalone /analyze FastAPI endpoint."""
    prepared, is_temp = _prepare_video(video_path)
    try:
        return analyze_prepared(prepared)
    finally:
        if is_temp:
            try: os.unlink(prepared)
            except OSError: pass


# ── Transcription via Groq (for the LLM viral-script generator) ──────────────
# We transcribe with Groq's hosted Whisper instead of a local model: it keeps
# the GPU free for TribeV2 (avoids VRAM/OOM contention), needs no 3GB download,
# and is far faster. Requires the GROQ_API_KEY secret set on the Space.

GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = "whisper-large-v3-turbo"


def transcribe_audio(media_path: str) -> str:
    """Extract audio and transcribe it via Groq. Best-effort: returns '' on any
    failure so a transcription problem never blocks the virality scores."""
    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key:
        print("[WARN] GROQ_API_KEY not set — skipping transcription.", flush=True)
        return ""

    # Extract a small mono 16kHz mp3 (what Whisper expects) to keep the upload tiny.
    ffmpeg = shutil.which("ffmpeg")
    audio_path = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
    try:
        if ffmpeg:
            r = subprocess.run(
                [ffmpeg, "-y", "-i", media_path, "-vn",
                 "-ac", "1", "-ar", "16000", "-b:a", "64k", audio_path],
                capture_output=True, text=True, timeout=120,
            )
            upload_path = audio_path if r.returncode == 0 else media_path
        else:
            upload_path = media_path

        import httpx
        with open(upload_path, "rb") as f:
            resp = httpx.post(
                GROQ_TRANSCRIBE_URL,
                headers={"Authorization": f"Bearer {groq_key}"},
                files={"file": (os.path.basename(upload_path), f, "audio/mpeg")},
                data={"model": GROQ_MODEL, "response_format": "json"},
                timeout=120,
            )
        if resp.status_code != 200:
            print(f"[WARN] Groq transcription failed ({resp.status_code}): {resp.text[:300]}", flush=True)
            return ""
        text = (resp.json().get("text") or "").strip()
        print(f"[INFO] Transcript via Groq: {len(text)} chars", flush=True)
        return text
    except Exception as e:
        print(f"[WARN] Transcription failed: {e}", flush=True)
        return ""
    finally:
        try: os.unlink(audio_path)
        except OSError: pass


# ── Gradio UI ──────────────────────────────────────────────────────────────

def gradio_fn(video_input) -> dict:
    print(f"[INFO] gradio_fn called. type={type(video_input).__name__}", flush=True)
    try:
        if isinstance(video_input, dict):
            video_path = str(video_input.get("path") or video_input.get("url") or "")
        elif hasattr(video_input, "path"):
            video_path = str(video_input.path)
        else:
            video_path = str(video_input) if video_input is not None else ""

        if not video_path:
            return {"error": "No se recibió ruta de video", "type": "ValueError"}

        print(f"[INFO] Analyzing: {video_path}", flush=True)
        # Prepare once, reuse for both scoring and transcription.
        prepared, is_temp = _prepare_video(video_path)
        try:
            scores = analyze_prepared(prepared)
            transcript = transcribe_audio(prepared)  # best-effort, '' on failure
        finally:
            if is_temp:
                try: os.unlink(prepared)
                except OSError: pass

        overall = round(
            0.35 * scores["reward"] * 100
            + 0.25 * scores["visual"] * 100
            + 0.20 * scores["audio"] * 100
            + 0.20 * scores["language"] * 100
        )
        print(f"[INFO] Done. overall={overall}", flush=True)
        return {
            "Viralidad Global":       f"{overall}/100",
            "Impacto Visual":         f"{round(scores['visual']*100)}/100",
            "Enganche Auditivo":      f"{round(scores['audio']*100)}/100",
            "Narrativa / Lenguaje":   f"{round(scores['language']*100)}/100",
            "Recompensa Emocional":   f"{round(scores['reward']*100)}/100",
            "transcript":             transcript,
        }
    except BaseException as exc:
        tb = traceback.format_exc()
        # Walk the __cause__ / __context__ chain — transformers' lazy import masks
        # the real ImportError behind a generic "Are this object's requirements..." msg
        chain = []
        cur: BaseException | None = exc
        seen = set()
        while cur is not None and id(cur) not in seen:
            seen.add(id(cur))
            chain.append(f"{type(cur).__name__}: {cur}")
            cur = cur.__cause__ or cur.__context__
        root = chain[-1] if chain else str(exc)
        print(f"[ERROR] chain:\n  " + "\n  → ".join(chain) + f"\n{tb}", flush=True)
        return {
            "error":   str(exc) or f"<{type(exc).__name__}>",
            "root_cause": root,
            "type":    type(exc).__name__,
            "details": tb[-800:],
        }


demo = gr.Interface(
    fn=gradio_fn,
    inputs=gr.File(label="Video a analizar", file_types=["video"]),
    outputs=gr.JSON(label="Potencial de Viralidad"),
    title="Estimador de Viralidad — TribeV2",
    description="Subí un video y la IA predice su potencial viral analizando activación neuronal.",
)

# ── Custom FastAPI route ────────────────────────────────────────────────────

demo.app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@demo.app.post("/analyze")
async def analyze_endpoint(video: UploadFile = File(...)):
    t0 = time.time()
    suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await video.read())
        tmp_path = tmp.name
    try:
        scores = analyze_video(tmp_path)
    except Exception as exc:
        tb = traceback.format_exc()
        print(f"[ERROR] /analyze failed:\n{tb}", flush=True)
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
    finally:
        os.unlink(tmp_path)
    return {**scores, "elapsed_ms": round((time.time() - t0) * 1000)}


@demo.app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": _model is not None}


if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)

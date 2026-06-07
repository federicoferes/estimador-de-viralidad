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
        # Shrink batch sizes to fit the T4-small's 16GB VRAM. V-JEPA2 ViT-giant
        # with 64-frame clips at batch 8 OOMs; batch 1 trades speed for fitting.
        config_update = {
            "data.video_feature.image.batch_size": 1,  # vjepa2-vitg (the hog)
            "data.image_feature.image.batch_size": 1,  # dinov2-large
            "data.batch_size": 1,                       # brain encoder
        }
        _model = TribeModel.from_pretrained(
            "facebook/tribev2",
            cache_folder="/tmp/tribev2_cache",
            config_update=config_update,
        )
        print(">>> TribeV2 ready (batch_size=1, low-VRAM mode).", flush=True)
    return _model


def _score(preds: np.ndarray, lo: int, hi: int) -> float:
    region = preds[:, lo:hi]
    ceiling = float(np.percentile(preds, 95))
    if ceiling <= 0:
        return 0.0
    return float(np.clip(np.mean(region) / ceiling, 0.0, 1.0))


def analyze_video(video_path: str) -> dict:
    model = get_model()
    prepared, is_temp = _prepare_video(video_path)
    try:
        df = model.get_events_dataframe(video_path=prepared)
        preds, _ = model.predict(events=df)   # (n_timesteps, n_vertices)
    finally:
        if is_temp:
            try: os.unlink(prepared)
            except OSError: pass

    n = preds.shape[1]
    q = n // 4
    return {
        "visual":   _score(preds, 0,   q),
        "audio":    _score(preds, q,   2*q),
        "language": _score(preds, 2*q, 3*q),
        "reward":   _score(preds, 3*q, n),
    }


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
        scores = analyze_video(video_path)
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

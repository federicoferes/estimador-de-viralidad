"""
HuggingFace Space — TribeV2 Virality Backend
SDK: gradio  |  Hardware: T4-small
"""

import os
import tempfile
import time
import numpy as np
from pathlib import Path

import gradio as gr
from fastapi import File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from tribev2 import TribeModel

_model: TribeModel | None = None


def get_model() -> TribeModel:
    global _model
    if _model is None:
        print(">>> Loading TribeV2...", flush=True)
        _model = TribeModel.from_pretrained(
            "facebook/tribev2",
            cache_folder="/tmp/tribev2_cache",
        )
        print(">>> Ready.", flush=True)
    return _model


def _score(preds: np.ndarray, lo: int, hi: int) -> float:
    region = preds[:, lo:hi]
    ceiling = float(np.percentile(preds, 95))
    if ceiling <= 0:
        return 0.0
    return float(np.clip(np.mean(region) / ceiling, 0.0, 1.0))


def analyze_video(video_path: str) -> dict:
    model = get_model()
    df = model.get_events_dataframe(video_path=video_path)
    preds, _ = model.predict(events=df)   # (n_timesteps, n_vertices)

    n = preds.shape[1]
    q = n // 4
    return {
        "visual":   _score(preds, 0,   q),
        "audio":    _score(preds, q,   2*q),
        "language": _score(preds, 2*q, 3*q),
        "reward":   _score(preds, 3*q, n),
    }


# ── Gradio UI ──────────────────────────────────────────────────────────────

def gradio_fn(video_path: str) -> dict:
    scores = analyze_video(video_path)
    overall = round(
        0.35 * scores["reward"] * 100
        + 0.25 * scores["visual"] * 100
        + 0.20 * scores["audio"] * 100
        + 0.20 * scores["language"] * 100
    )
    return {
        "Viralidad Global": f"{overall}/100",
        "Impacto Visual":        f"{round(scores['visual']*100)}/100",
        "Enganche Auditivo":     f"{round(scores['audio']*100)}/100",
        "Narrativa / Lenguaje":  f"{round(scores['language']*100)}/100",
        "Recompensa Emocional":  f"{round(scores['reward']*100)}/100",
    }


demo = gr.Interface(
    fn=gradio_fn,
    inputs=gr.Video(label="Video a analizar"),
    outputs=gr.JSON(label="Potencial de Viralidad"),
    title="Estimador de Viralidad — TribeV2",
    description="Subí un video y la IA predice su potencial viral analizando activación neuronal.",
)

# ── Custom FastAPI route on demo.app (called by Vercel) ───────────────────

demo.app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


@demo.app.post("/predict")
async def predict(video: UploadFile = File(...)):
    t0 = time.time()
    suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await video.read())
        tmp_path = tmp.name
    try:
        scores = analyze_video(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        os.unlink(tmp_path)
    return {**scores, "elapsed_ms": round((time.time() - t0) * 1000)}


if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)

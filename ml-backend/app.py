"""
HuggingFace Space — TribeV2 Virality Backend
SDK: gradio  |  Hardware: T4-small GPU minimum
Code: github.com/facebookresearch/tribev2
Weights: huggingface.co/facebook/tribev2
"""

import os
import tempfile
import time
import numpy as np
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# tribev2 installed from GitHub via requirements.txt
# HF_TOKEN env var (Space secret) allows downloading gated LLaMA 3.2-3B weights
from tribev2 import TribeModel

app = FastAPI(title="TribeV2 Virality API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

# Cortical vertex indices grouped by functional ROI
# fsaverage5 surface: ~20k vertices, mapped via HCP atlas
ROI_MASKS: dict[str, list[int]] = {}  # populated lazily from utils_fmri

_model: TribeModel | None = None


def get_model() -> TribeModel:
    global _model
    if _model is None:
        print(">>> Loading TribeV2 weights...", flush=True)
        _model = TribeModel.from_pretrained(
            "facebook/tribev2",
            cache_folder="/tmp/tribev2_cache",
        )
        print(">>> TribeV2 ready.", flush=True)
    return _model


def activation_to_score(preds: np.ndarray, lo: int, hi: int) -> float:
    """
    preds: (n_timesteps, n_vertices)
    Slice a vertex range, average over time and vertices, normalize to [0,1].
    """
    region = preds[:, lo:hi]
    mean_val = float(np.mean(region))
    ceiling = float(np.percentile(preds, 95))
    if ceiling <= 0:
        return 0.0
    return float(np.clip(mean_val / ceiling, 0.0, 1.0))


@app.on_event("startup")
async def warmup():
    get_model()


@app.post("/predict")
async def predict(video: UploadFile = File(...)):
    t0 = time.time()
    suffix = Path(video.filename or "video.mp4").suffix or ".mp4"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await video.read())
        tmp_path = tmp.name

    try:
        model = get_model()
        df = model.get_events_dataframe(video_path=tmp_path)
        preds, _ = model.predict(events=df)   # (n_timesteps, n_vertices)

        n = preds.shape[1]
        q = n // 4   # rough quarter-splits for demo ROI mapping

        scores = {
            "visual":   activation_to_score(preds, 0,     q),
            "audio":    activation_to_score(preds, q,     2*q),
            "language": activation_to_score(preds, 2*q,   3*q),
            "reward":   activation_to_score(preds, 3*q,   n),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        os.unlink(tmp_path)

    elapsed_ms = round((time.time() - t0) * 1000)
    return {**scores, "elapsed_ms": elapsed_ms}


import gradio as gr
import httpx, json as _json


def gradio_predict(video_path: str) -> str:
    with open(video_path, "rb") as f:
        r = httpx.post("http://localhost:7860/predict", files={"video": f}, timeout=300)
    data = r.json()
    score = round(
        0.35 * data["reward"] * 100
        + 0.25 * data["visual"] * 100
        + 0.20 * data["audio"] * 100
        + 0.20 * data["language"] * 100
    )
    return _json.dumps({
        "Viralidad Global": f"{score}/100",
        "Impacto Visual": f"{round(data['visual']*100)}/100",
        "Enganche Auditivo": f"{round(data['audio']*100)}/100",
        "Narrativa": f"{round(data['language']*100)}/100",
        "Recompensa Emocional": f"{round(data['reward']*100)}/100",
    }, ensure_ascii=False, indent=2)


demo = gr.Interface(
    fn=gradio_predict,
    inputs=gr.Video(label="Video a analizar"),
    outputs=gr.JSON(label="Potencial de Viralidad"),
    title="Estimador de Viralidad — TribeV2",
    description="Subí un video y la IA predice su potencial viral analizando activación neuronal.",
)

if __name__ == "__main__":
    import uvicorn
    from gradio.routes import mount_gradio_app
    uvicorn.run(mount_gradio_app(app, demo, path="/"), host="0.0.0.0", port=7860)

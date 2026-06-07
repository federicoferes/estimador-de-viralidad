"""
HuggingFace Space — TribeV2 Virality Backend
Deploy this to a GPU Space (T4 or A10G) at huggingface.co/spaces

Space settings:
  SDK: gradio
  Hardware: GPU (T4 small minimum)
  Visibility: Public (or private + HF_TOKEN for auth)
"""

import os
import sys
import subprocess
import json
import tempfile
import time
import numpy as np
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Install TribeV2 at startup (setup.sh doesn't run in Gradio SDK)
_TRIBE_DIR = "/tmp/tribev2"
if not Path(_TRIBE_DIR).exists():
    print(">>> Downloading TribeV2...", flush=True)
    from huggingface_hub import snapshot_download
    snapshot_download(
        repo_id="facebook/tribev2",
        local_dir=_TRIBE_DIR,
        token=os.environ.get("HF_TOKEN"),
        ignore_patterns=["*.safetensors.index.json"],
    )
    print(">>> Installing TribeV2...", flush=True)
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-e", _TRIBE_DIR, "--no-deps", "-q"]
    )
    print(">>> TribeV2 ready.", flush=True)

sys.path.insert(0, _TRIBE_DIR)
from tribev2.demo_utils import TribeModel

app = FastAPI(title="TribeV2 Virality API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

# ROI groups mapped to virality dimensions
# These are the brain region indices from TribeV2's cortical/subcortical surface
ROI_GROUPS = {
    "visual": [
        "V1v", "V1d", "V2v", "V2d", "V3v", "V3d", "V4", "MT", "MST",
        "V3A", "V3B", "LO1", "LO2", "VO1", "VO2", "PHC1", "PHC2",
        "EBA", "FBA-1", "FBA-2", "FFA-1", "FFA-2",
    ],
    "audio": [
        "A1", "LBelt", "MBelt", "PBelt", "RI", "STSdp", "STSda",
        "STSvp", "STSva", "TA2",
    ],
    "language": [
        "IFJa", "IFJp", "IFSp", "IFSa", "p47r", "a47r", "PFcm",
        "TPOJ1", "TPOJ2", "TPOJ3", "STV", "PSL", "SFL",
    ],
    "reward": [
        # Subcortical reward/salience circuit
        "Accumbens-area", "Caudate", "Putamen", "Pallidum",
        "Amygdala", "Hippocampus",
        # Cortical: ACC, insula (salience/emotion)
        "24dd", "24dv", "a24pr", "p24pr", "AAIC", "AVI",
        "FOP1", "FOP2", "FOP3", "FOP4", "FOP5",
    ],
}

_model: TribeModel | None = None


def get_model() -> TribeModel:
    global _model
    if _model is None:
        print("Loading TribeV2 model weights…")
        _model = TribeModel.from_pretrained("facebook/tribev2")
        print("TribeV2 ready.")
    return _model


def activation_to_score(activations: np.ndarray, roi_names: list[str], target_rois: list[str]) -> float:
    """
    Extract mean activation for a set of named ROIs and normalize to [0, 1].
    Uses the 95th percentile of the full activation distribution as ceiling.
    """
    indices = [i for i, name in enumerate(roi_names) if any(t in name for t in target_rois)]
    if not indices:
        return 0.0
    subset = activations[indices]
    ceiling = np.percentile(activations, 95)
    if ceiling <= 0:
        return 0.0
    score = float(np.mean(subset)) / ceiling
    return float(np.clip(score, 0.0, 1.0))


@app.on_event("startup")
async def warmup():
    get_model()


@app.post("/predict")
async def predict(video: UploadFile = File(...)):
    t0 = time.time()

    # Save the uploaded video to a temp file
    suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await video.read())
        tmp_path = tmp.name

    try:
        model = get_model()

        # TribeV2 inference: video → predicted fMRI activations
        # Returns cortical + subcortical arrays shaped (n_vertices,) or (n_rois,)
        result = model.predict_from_video(tmp_path)

        cortical: np.ndarray = result["cortical"]         # (n_vertices,)
        subcortical: np.ndarray = result["subcortical"]   # (n_subcortical_rois,)
        roi_names: list[str] = result["roi_names"]        # labels for subcortical

        # Build full activation vector: cortical parcel means + subcortical rois
        full_activations = np.concatenate([cortical, subcortical])
        full_roi_names = (result.get("cortical_roi_names") or [f"ctx_{i}" for i in range(len(cortical))]) + roi_names

        scores = {
            dim: activation_to_score(full_activations, full_roi_names, rois)
            for dim, rois in ROI_GROUPS.items()
        }

    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        os.unlink(tmp_path)

    elapsed_ms = round((time.time() - t0) * 1000)
    return {**scores, "elapsed_ms": elapsed_ms}


# Gradio wrapper for the Space UI (optional — the Space also exposes the FastAPI above)
import gradio as gr

def gradio_predict(video_path: str) -> str:
    import httpx, json as _json
    with open(video_path, "rb") as f:
        r = httpx.post("http://localhost:8000/predict", files={"video": f}, timeout=120)
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
    description="Subí un video y la IA predice su potencial viral analizando la activación neuronal que genera en el cerebro humano.",
    examples=[],
    cache_examples=False,
)

if __name__ == "__main__":
    import uvicorn
    # Mount Gradio on /ui and run FastAPI on /predict
    from gradio.routes import mount_gradio_app
    app_with_ui = mount_gradio_app(app, demo, path="/ui")
    uvicorn.run(app_with_ui, host="0.0.0.0", port=7860)

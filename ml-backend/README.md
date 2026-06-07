---
title: Estimador de Viralidad - TribeV2 Backend
emoji: 🧠
colorFrom: purple
colorTo: cyan
sdk: gradio
sdk_version: "5"
app_file: app.py
pinned: false
license: cc-by-nc-4.0
---

# TribeV2 Virality Backend

HuggingFace Space that wraps [TribeV2](https://huggingface.co/facebook/tribev2) as a FastAPI endpoint.

## Endpoints

- `GET /` — Gradio UI
- `POST /predict` — multipart/form-data with `video` field → JSON scores

## Scores returned

```json
{
  "visual": 0.85,
  "audio": 0.62,
  "language": 0.71,
  "reward": 0.78,
  "elapsed_ms": 1240
}
```

## Hardware

Requires GPU (T4 small minimum). Go to Space Settings → Hardware → T4 small.

## Auth (HuggingFace gated model)

TribeV2 uses LLaMA 3.2-3B internally (gated). The Space needs your HF token:

Space Settings → Repository secrets → `HF_TOKEN`

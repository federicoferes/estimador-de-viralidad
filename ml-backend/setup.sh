#!/bin/bash
# Runs once at Space startup before app.py

set -e

echo ">>> Clonando TribeV2..."

# huggingface-cli usa HF_TOKEN del entorno (configurado en Space secrets)
python - <<'PYEOF'
import os
from huggingface_hub import snapshot_download

snapshot_download(
    repo_id="facebook/tribev2",
    local_dir="/tmp/tribev2",
    token=os.environ.get("HF_TOKEN"),
    ignore_patterns=["*.bin.index.json"],  # solo código + pesos pequeños
)
PYEOF

echo ">>> Instalando TribeV2..."
pip install -e /tmp/tribev2 --no-deps -q

echo ">>> TribeV2 listo."

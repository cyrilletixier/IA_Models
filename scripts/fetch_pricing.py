#!/usr/bin/env python3
"""fetch_pricing.py -- Snapshot des prix et metriques API depuis OpenRouter.

Recupere l'API publique https://openrouter.ai/api/v1/models (aucune cle requise),
garde les champs utiles et ecrit data/raw/openrouter_models.json.

Sortie par modele :
  id, name, context_length, pricing (prompt/completion en $/token),
  open_weights (hauteur: hugging_face_id non null), supported_parameters.

Usage :
    python3 scripts/fetch_pricing.py [--out data/raw/openrouter_models.json]
"""

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

API_URL = "https://openrouter.ai/api/v1/models"
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "data" / "raw" / "openrouter_models.json"
USER_AGENT = "IA_Models/0.1 (github pages data pipeline)"


def fetch(url: str, retries: int = 3, timeout: int = 30) -> dict:
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 -- reseau, on retente puis on echoue propre
            print(f"[warn] tentative {attempt}/{retries} echouee: {exc}", file=sys.stderr)
            if attempt == retries:
                raise
            time.sleep(2 * attempt)
    raise RuntimeError("inatteignable")


def slim(entry: dict) -> dict:
    pricing = entry.get("pricing") or {}
    return {
        "id": entry.get("id"),
        "name": entry.get("name"),
        "context_length": entry.get("context_length"),
        "pricing": {
            "prompt": float(pricing.get("prompt", 0) or 0),
            "completion": float(pricing.get("completion", 0) or 0),
        },
        "open_weights": bool(entry.get("hugging_face_id")),
        "supported_parameters": sorted(entry.get("supported_parameters") or []),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out", type=Path, default=DEFAULT_OUT, help="fichier de sortie JSON"
    )
    args = parser.parse_args()

    print(f"[fetch] {API_URL}")
    payload = fetch(API_URL)
    models = [slim(e) for e in payload.get("data", [])]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "source": "openrouter",
        "api_url": API_URL,
        "fetched_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model_count": len(models),
        "models": models,
    }
    args.out.write_text(
        json.dumps(snapshot, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"[done] {len(models)} modeles -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

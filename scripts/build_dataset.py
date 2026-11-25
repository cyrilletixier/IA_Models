#!/usr/bin/env python3
"""build_dataset.py -- Fusion benchmarks + prix et calcul des indices.

Entrées :
    data/benchmarks.json          benchmarks curatés (id OpenRouter + scores sourcés)
    data/raw/openrouter_models.json  snapshot prix/contexte (scripts/fetch_pricing.py)

Sortie :
    data/models.json             dataset consommé par le site statique

Indices calculés :
    price_in_out      $ / 1M tokens input et output
    price_blended     (3*in + out) / 4   -- mélange 75/25 standard
    perf_per_dollar   aa_intelligence / price_blended (perf globale par $)

Le site affiche :
    idx_code      FrontierCode 2.0 (%)
    idx_analyse   GPQA Diamond (%)
    idx_global    AA Intelligence Index (0-100)

Usage :
    python3 scripts/build_dataset.py
"""

import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BENCH_FILE = ROOT / "data" / "benchmarks.json"
PRICING_FILE = ROOT / "data" / "raw" / "openrouter_models.json"
OUT_FILE = ROOT / "data" / "models.json"

LAB_COLORS = {
    "Anthropic": "#d97757",
    "OpenAI": "#74aa9c",
    "Google": "#5b9bd5",
    "Mistral AI": "#ff7000",
    "DeepSeek": "#4d6bfe",
    "Moonshot AI": "#a32cdf",
    "Alibaba": "#e6a23c",
    "SpaceXAI": "#9aa0a6",
}
DEFAULT_LAB_COLOR = "#7aa2f7"


def load_json(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"[erreur] fichier manquant : {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def merge_model(bench_entry: dict, price_map: dict) -> dict:
    or_id = bench_entry["openrouter_id"]
    price_info = price_map.get(or_id)
    benchmarks = bench_entry.get("benchmarks") or {}

    def metric(name: str):
        m = benchmarks.get(name)
        return m if (m and m.get("value") is not None) else None

    aa = metric("aa_intelligence")
    fc = metric("frontiercode2")
    gpqa = metric("gpqa_diamond")

    model = {
        "id": or_id,
        "name": bench_entry.get("name") or (price_info or {}).get("name") or or_id,
        "lab": bench_entry.get("lab", "?"),
        "lab_color": LAB_COLORS.get(bench_entry.get("lab", ""), DEFAULT_LAB_COLOR),
        "open_weights": bool(price_info and price_info.get("open_weights")),
        "context_tokens": (price_info or {}).get("context_length"),
        "benchmarks": {"aa_intelligence": aa, "frontiercode2": fc, "gpqa_diamond": gpqa},
        "pricing": None,
    }

    if price_info:
        price_in = price_info["pricing"]["prompt"] * 1_000_000
        price_out = price_info["pricing"]["completion"] * 1_000_000
        blended = (3 * price_in + price_out) / 4
        model["pricing"] = {
            "in_per_m": round(price_in, 6),
            "out_per_m": round(price_out, 6),
            "blended_per_m": round(blended, 6),
        }
        if aa and blended > 0:
            model["pricing"]["perf_per_dollar"] = round(aa["value"] / blended, 4)

    return model


def main() -> int:
    bench = load_json(BENCH_FILE)
    pricing_snapshot = load_json(PRICING_FILE)
    price_map = {m["id"]: m for m in pricing_snapshot["models"]}

    models = [merge_model(e, price_map) for e in bench["models"]]

    dataset = {
        "_meta": {
            "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "pricing_fetched_at_utc": pricing_snapshot.get("fetched_at_utc"),
            "benchmarks_updated": bench["_meta"].get("updated"),
            "sources": dict(bench["_meta"].get("sources", {})),
            "formula": {
                "blended_per_m": "(3*price_in + price_out)/4, $/1M tokens",
                "perf_per_dollar": "aa_intelligence / blended_per_m",
            },
        },
        "models": models,
    }

    OUT_FILE.write_text(
        json.dumps(dataset, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    n_priced = sum(1 for m in models if m["pricing"])
    n_benched = sum(1 for m in models if m["benchmarks"]["aa_intelligence"])
    print(f"[done] {len(models)} modeles, {n_priced} prix OpenRouter, "
          f"{n_benched} avec indice global -> {OUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

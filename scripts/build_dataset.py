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

Auto-hebergement (modeles open_weights avec params_total_b connus) :
    vram_q4_gb    total_b * 0.58 + 1.5   (quantisation ~4.5 bits/poids)
    vram_q8_gb    total_b * 1.10 + 1.5    (~9 bits/poids)
    vram_fp16_gb  total_b * 2.0  + 2.5   (precision native)
    Poids seuls, KV cache et overhead moteur NON inclus. MoE : la totalite
    des poids reside en VRAM, seuls les parametres actifs comptent au compute.

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
PROVIDERS_FILE = ROOT / "data" / "providers.json"
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
    "IBM": "#4076d4",
    "Cohere": "#b18cff",
    "Xiaomi": "#ff6900",
    "inclusionAI": "#5fc9a2",
    "StepFun": "#4dabf7",
    "Z.ai": "#3fc1ff",
    "NVIDIA": "#76b900",
    "Thinking Machines": "#f472b6",
    "Meta": "#0866ff",
    "Liquid AI": "#21d0c0",
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
        "open_weights": bool(bench_entry.get("open_weights")),
        "params_total_b": bench_entry.get("params_total_b"),
        "params_active_b": bench_entry.get("params_active_b"),
        "context_tokens": (price_info or {}).get("context_length"),
        "released_at": None,
        "freshness": None,
        "benchmarks": {"aa_intelligence": aa, "frontiercode2": fc, "gpqa_diamond": gpqa},
        "pricing": None,
        "self_host": None,
    }

    params_total = model["params_total_b"]
    if model["open_weights"] and params_total:
        # poids seuls ; MoE = la totalite des poids reside en VRAM, KV cache non inclus
        q4 = round(params_total * 0.58 + 1.5, 1)   # ~4.5 bits/poids + overhead
        q8 = round(params_total * 1.10 + 1.5, 1)  # ~9 bits/poids + overhead
        fp16 = round(params_total * 2.0 + 2.5, 1) # ~16 bits/poids + overhead
        model["self_host"] = {"vram_q4_gb": q4, "vram_q8_gb": q8, "vram_fp16_gb": fp16}

    created = (price_info or {}).get("created")
    if created:
        from datetime import date, datetime, timezone
        rel = datetime.fromtimestamp(created, tz=timezone.utc).date()
        model["released_at"] = rel.isoformat()
        today = date.today()
        months = (today - rel).days / 30.44
        if months < 2:      score = 5
        elif months < 5:    score = 4
        elif months < 12:   score = 3
        elif months < 24:   score = 2
        else:               score = 1
        model["freshness"] = {"score": score, "age_months": round(months, 1)}

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


def merge_providers(model: dict, providers_by_model: dict) -> None:
    """Attache les offres par fournisseur (BenchLeader) au modele, prix melange calcule."""
    entry = providers_by_model.get(model["id"])
    offers = entry.get("providers", []) if entry else []
    out = []
    for o in offers:
        row = dict(o)
        if row.get("in_per_m") is not None and row.get("out_per_m") is not None:
            row["blended_per_m"] = round((3 * row["in_per_m"] + row["out_per_m"]) / 4, 6)
        else:
            row["blended_per_m"] = None
        out.append(row)
    out.sort(key=lambda r: (r.get("blended_per_m") is None, r.get("blended_per_m") or 0))
    model["providers"] = out


def main() -> int:
    bench = load_json(BENCH_FILE)
    pricing_snapshot = load_json(PRICING_FILE)
    providers_snapshot = load_json(PROVIDERS_FILE) if PROVIDERS_FILE.exists() else None
    price_map = {m["id"]: m for m in pricing_snapshot["models"]}
    providers_by_model = (providers_snapshot or {}).get("by_model", {})

    models = [merge_model(e, price_map) for e in bench["models"]]
    for m in models:
        merge_providers(m, providers_by_model)

    dataset = {
        "_meta": {
            "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "pricing_fetched_at_utc": pricing_snapshot.get("fetched_at_utc"),
            "benchmarks_updated": bench["_meta"].get("updated"),
            "providers_fetched_at_utc": (providers_snapshot or {}).get("_meta", {}).get("updated"),
            "providers_source": (providers_snapshot or {}).get("_meta", {}).get("source"),
            "sources": dict(bench["_meta"].get("sources", {})),
            "formula": {
                "blended_per_m": "(3*price_in + price_out)/4, $/1M tokens",
            "provider_blended": "meme formule appliquee aux prix propres de chaque fournisseur",
                "perf_per_dollar": "aa_intelligence / blended_per_m",
                "freshness": "score 1-5 : 5 < 2 mois, 4 < 5 mois, 3 < 1 an, 2 < 2 ans, 1 plus vieux",
                "self_host_vram": "q4 = total_b*0.58+1.5, q8 = total_b*1.10+1.5, fp16 = total_b*2.0+2.5 (GB, poids seuls, KV cache non inclus)",
            },
        },
        "models": models,
    }

    OUT_FILE.write_text(
        json.dumps(dataset, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    n_priced = sum(1 for m in models if m["pricing"])
    n_benched = sum(1 for m in models if m["benchmarks"]["aa_intelligence"])
    n_open = sum(1 for m in models if m["open_weights"])
    n_hostable = sum(1 for m in models if m["self_host"])
    n_offers = sum(len(m["providers"]) for m in models)
    n_multi = sum(1 for m in models if len(m["providers"]) > 1)
    print(f"[done] {len(models)} modeles, {n_priced} prix OpenRouter, "
          f"{n_benched} avec indice global, {n_open} open weights, "
          f"{n_hostable} avec VRAM calculee, {n_offers} offres fournisseurs "
          f"({n_multi} modeles multi-offres) -> {OUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

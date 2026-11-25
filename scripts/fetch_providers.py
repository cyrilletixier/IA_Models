#!/usr/bin/env python3
"""fetch_providers.py -- Prix par fournisseur d'inference pour chaque modele suivis.

Pour chaque entree de data/benchmarks.json (champ benchleader_slug), recupere la page
model BenchLeader et parse la section "API pricing: where to run it" : chaque
fournisseur qui route le modele via OpenRouter avec son propre prix, sa vitesse
et sa latence (mesurees sur trafic live 30 min -- indicatif).

Sortie : data/providers.json
    { "_meta": {...}, "by_model": { "<openrouter_id>": { "slug", "fetched_at", "providers": [...] } } }

Resiste aux pages absentees / bloquees : l'entree du tour precedent est conservee
si le fetch echoue. Aucune cle requise.

Usage :
    python3 scripts/fetch_providers.py
"""

import json
import re
import time
import urllib.request
from pathlib import Path

BASE_URL = "https://www.benchleader.com/models/{slug}"
ROOT = Path(__file__).resolve().parent.parent
BENCH_FILE = ROOT / "data" / "benchmarks.json"
OUT_FILE = ROOT / "data" / "providers.json"
USER_AGENT = "IA_Models/0.1 (github pages data pipeline)"

PROVIDER_TABLE = re.compile(
    r"<th>Provider</th>.*?<tbody>(.*?)</tbody>", re.S
)
ROW_TDS = re.compile(r"<tr>(.*?)</tr>", re.S)


def fetch_html(slug: str, retries: int = 2, timeout: int = 30) -> str | None:
    url = BASE_URL.format(slug=slug)
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", "replace")
        except Exception as exc:  # noqa: BLE001 -- reseau, tolerer et continuer
            print(f"[warn] {slug}: tentative {attempt} echouee: {exc}", flush=True)
            if attempt < retries:
                time.sleep(1.5 * attempt)
    return None


def _num(field: str) -> float | None:
    m = re.search(r"([\d.]+)", field)
    return float(m.group(1)) if m else None


def _price(field: str) -> float | None:
    m = re.search(r"\$([\d.]+)", field)
    return float(m.group(1)) if m else None


def parse_providers(html: str) -> list[dict]:
    """Parse la table 'API pricing: where to run it' de la page modele."""
    rows: list[dict] = []
    tbl = PROVIDER_TABLE.search(html)
    if not tbl:
        return rows
    for tr in ROW_TDS.findall(tbl.group(1)):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 7:
            continue
        txt = [re.sub(r"<[^>]+>", "", t).strip() for t in tds]
        rows.append(
            {
                "provider": txt[0],
                "speed_tok_s": _num(txt[1]) if "tok/s" in txt[1] else None,
                "first_token_s": _num(txt[2]) if "s" in txt[2] else None,
                "in_per_m": _price(txt[3]),
                "out_per_m": _price(txt[4]),
                "context": txt[5] if txt[5] != "\u2013" else None,
                "quant": txt[6] if txt[6] != "\u2013" else None,
            }
        )
    return rows


def load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] {path} illisible, repart de zero: {exc}", flush=True)
        return None


def main() -> int:
    bench = json.loads(BENCH_FILE.read_text(encoding="utf-8"))
    previous = load_json(OUT_FILE) or {"_meta": {}, "by_model": {}}
    by_model = previous.get("by_model", {})

    n_ok = n_fail = n_kept = 0
    for entry in bench["models"]:
        or_id = entry["openrouter_id"]
        slug = entry.get("benchleader_slug")
        if not slug:
            print(f"[skip] {or_id}: pas de benchleader_slug", flush=True)
            continue
        html = fetch_html(slug)
        if html is None:
            print(f"[fail] {or_id} ({slug}): page invalide", flush=True)
            n_fail += 1
            continue
        providers = parse_providers(html)
        if not providers:
            print(f"[warn] {or_id} ({slug}): 0 offre parsee", flush=True)
        by_model[or_id] = {
            "slug": slug,
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "providers": providers,
        }
        n_ok += 1

    # entrees d'un modele retire de benchmarks.json : on bouge avec le dataset
    known = {m["openrouter_id"] for m in bench["models"]}
    by_model = {k: v for k, v in by_model.items() if k in known}

    out = {
        "_meta": {
            "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": (
                "BenchLeader pages modeles, section 'API pricing: where to run it' : "
                "prix propres de chaque fournisseur routant le modele via OpenRouter"
            ),
            "note": (
                "Vitesse et latence premier token mesurees par BenchLeader sur trafic "
                "live 30 min : indicatif, pas un engagement. Une ligne par offre "
                "(quantisation incluse). Les offres echouees gardent les donnees du "
                "fetch precedent (fetched_at par entree)."
            ),
        },
        "by_model": dict(sorted(by_model.items())),
    }
    OUT_FILE.write_text(
        json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    total_offers = sum(len(v.get("providers", [])) for v in by_model.values())
    print(
        f"[done] {n_ok} pages ok, {n_fail} echecs -> {OUT_FILE} "
        f"({len(by_model)} modeles, {total_offers} offres)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

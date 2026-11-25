# IA_Models

> Suivi des modèles d'IA : performances (code, analyse), coûts, fournisseurs d'inférence.
> Site statique, data driven, hébergé sur GitHub Pages. Zéro framework, zéro honte.

```
 _________________  ____   __      ____   __________  __  ___
\_____   \_   ___\ \   \ / _\    /  _ \  \_____   /  \ \ \/  /
 |   ___/\ \  \  \|  |_ \(  <  /  /_\ \   /    /|   | \     /
 |   |____\ \  \__\|   |  \  \|  |    |  |  /    / |   | /     \
 |______ /  \_____ |___|   \_\   \___|_| /     /  |___|/___/\___\
        \/        \/
```

## Pages

| Page | Contenu |
|---|---|
| `/` (Dashboard) | KPIs, leaders par indice, top perf/prix |
| `/models.html` | Liste des modèles : contexte, prix, indices Code / Analyse / Global, perf par $ |
| `/costs.html` | Coûts par scénario de charge (chat, refactoring, analyse de docs) |
| `/providers.html` | Vue agrégée par laboratoire |

## Indices suivis (v0)

| Indice | Description | Source |
|---|---|---|
| Code | FrontierCode 2.0 (AA) : 132 tâches réelles sur des repos open source, validées par un mainteneur | Artificial Analysis |
| Analyse | GPQA Diamond : 198 questions sciences de niveau doctorat, "Google-proof" | Epoch AI Benchmarking Hub |
| Global | AA Intelligence Index v5.0.1 : composite 9 évaluations (knowledge work, coding, science, général) | Artificial Analysis |
| Perf/$ | Indice Global / prix mélangé (3:1 input:output) | calcul maison |

Prix en $ / 1M tokens, mélange standard 75 % input / 25 % output : `(3×in + out) / 4`.

## Pipeline de données

```
OpenRouter API ──▶ scripts/fetch_pricing.py ──▶ data/raw/openrouter_models.json (ignoré)
                                                      │
data/benchmarks.json (curation, sourcée, datée) ──────┤
                                                      ▼
                                        scripts/build_dataset.py
                                                      ▼
                                              data/models.json
                                                      ▼
                                    Site statique (fetch client-side)
```

Tout Python stdlib, aucune dépendance :

```bash
python3 scripts/fetch_pricing.py   # snapshot OpenRouter -> data/raw/
python3 scripts/build_dataset.py  # fusion + calcul des indices -> data/models.json
```

- `data/benchmarks.json` : benchmarks curatés à la main, chaque métrique avec sa date et
  son réglage de raisonnement (max / xhigh / high / medium). C'est le fichier à mettre à
  jour quand de nouveaux scores sortent. Politique de sélection : pour chaque indice, le
  meilleur score publié du modèle, tous réglages de raisonnement confondus.
- `scripts/fetch_pricing.py` : récupère les prix et contextes en direct sur l'API publique
  OpenRouter (aucune clé requise). Marque `OPEN` les modèles à poids ouverts.
- `scripts/build_dataset.py` : fusionne le tout et calcule prix mélangé et perf/$.
- `data/raw/` est ignoré par git : le snapshot est régénérable à tout moment via le script
  et la CI le refait à chaque run.

## Automatisation

- `.github/workflows/update-data.yml` : cron hebdomadaire, re-fetch des prix OpenRouter,
  re-build du dataset et commit si le diff est non vide.
- `.github/workflows/deploy-pages.yml` : à chaque push sur `main`, déploie le site sur
  GitHub Pages (artifact du dépôt entier, `.nojekyll`).

Première activation de Pages (une seule fois, Settings → Pages → Source : GitHub Actions),
ensuite c'est automatique.

## Ajouter un modèle

1. Ajouter une entrée dans `data/benchmarks.json` (id OpenRouter + scores si connus).
2. Les prix, contexte et badge OPEN arrivent tout seuls au prochain run du pipeline.

## Roadmap

- [ ] Historique des prix (séries temporelles) + graphes
- [ ] Page Fournisseurs réelle : plusieurs fournisseurs d'inférence par modèle
      (OpenRouter, DeepInfra, Together, Fireworks, APIs natives)
- [ ] Benchmarks latence (tokens/s) et débit
- [ ] Comparateur de modèles côte à côte

## Sources

- Prix et contextes : [OpenRouter](https://openrouter.ai/api/v1/models) (API publique)
- Benchmarks : Artificial Analysis (AA Intelligence Index v5.0.1, FrontierCode 2.0) et
  Epoch AI Benchmarking Hub (GPQA Diamond), agrégés par BenchLeader, données du 2026-11-25

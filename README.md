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
| `/hosting.html` | Auto-hébergement : filtre par VRAM de GPU + quantisation, indique quels modèles ouverts tiennent chez soi |

## Indices suivis (v0)

| Indice | Description | Source |
|---|---|---|
| Code | FrontierCode 2.0 (AA) : 132 tâches réelles sur des repos open source, validées par un mainteneur | Artificial Analysis |
| Analyse | GPQA Diamond : 198 questions sciences de niveau doctorat, "Google-proof" | Epoch AI Benchmarking Hub |
| Global | AA Intelligence Index v5.0.1 : composite 9 évaluations (knowledge work, coding, science, général) | Artificial Analysis |
| Perf/$ | Indice Global / prix mélangé (3:1 input:output) | calcul maison |

Prix en $ / 1M tokens, mélange standard 75 % input / 25 % output : `(3×in + out) / 4`.

## Auto-hébergement

La page `/hosting.html` filtre les modèles à poids ouverts selon la VRAM de votre GPU
(presets 6 à 96 Go ou valeur libre) et la quantisation (Q4 / Q8 / FP16). Pour chaque
modèle dont la taille est publiée, la VRAM requise est estimée sur les poids seuls :

| Quantisation | Formule (Go) | ~bits/poids |
|---|---|---|
| Q4 | `params_B × 0.58 + 1.5` | ~4.5 |
| Q8 | `params_B × 1.10 + 1.5` | ~9 |
| FP16 | `params_B × 2.0 + 2.5` | 16 |

KV cache, overhead moteur et migraine de compatibilité non inclus : prévoyez de la marge,
surtout à long contexte. Pour un MoE, la totalité des poids réside en VRAM (c'est le
prix du Sparse), seuls les paramètres actifs comptent au compute ; les deux tailles
sont stockées (`params_total_b`, `params_active_b`).

L'ouverture des poids est curatée dans `data/benchmarks.json` via le champ
`open_weights` : le flag HuggingFace de l'API OpenRouter est bruité (des modèles
fermés en ont un), on ne s'y fie pas. Un poids ouvert sans taille publiée
(Kimi K3.1 Pro, Mistral Large 4, DeepSeek V4.1 Flash, GLM 5.3...) apparaît avec le
statut « taille non publiée » : héberger un modèle dont on ignore la taille, c'est
acheter un meuble sans les dimensions.
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

- `data/benchmarks.json` : benchmarks curatés à la main, chaque métrique avec son réglage
  de raisonnement (max / xhigh / high / medium / low) et sa date quand elle est publiée.
  C'est le fichier à mettre à jour quand de nouveaux scores sortent. Politique de sélection : pour chaque indice, le
  meilleur score publié du modèle, tous réglages de raisonnement confondus.
- `scripts/fetch_pricing.py` : récupère les prix et contextes en direct sur l'API publique
  OpenRouter (aucune clé requise).
- `scripts/build_dataset.py` : fusionne le tout et calcule prix mélangé, perf/$ et
  VRAM d'auto-hébergement à partir de `params_total_b`.
- `data/raw/` est ignoré par git : le snapshot est régénérable à tout moment via le script
  et la CI le refait à chaque run.

## Automatisation

- `.github/workflows/update-data.yml` : cron hebdomadaire, re-fetch des prix OpenRouter,
  re-build du dataset et commit si le diff est non vide.
- `.github/workflows/deploy-pages.yml` : à chaque push sur `main`, déploie le site sur
  GitHub Pages (artifact du dépôt entier, `.nojekyll`).

GitHub Pages est activé en source "GitHub Actions" ;
chaque push sur main déploie automatiquement, sans intervention.

## Ajouter un modèle

1. Ajouter une entrée dans `data/benchmarks.json` (id OpenRouter + scores si connus).
   Pour un modèle à poids ouverts : `open_weights: true`, `params_total_b` (et
   `params_active_b` pour un MoE) si la taille est publiée.
2. Les prix et contexte arrivent tout seuls au prochain run du pipeline ; badge OPEN,
   tailles et VRAM suivent les champs de l'entrée.

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

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
| `/` (Que prendre ?) | Aide au choix : le modèle gagnant par usage (code, analyse, budget, auto-hébergement, contexte long) + top perf/prix |
| `/models.html` | Liste des modèles : contexte, prix, indices Code / Analyse / Global, perf par $ |
| `/costs.html` | Coûts par scénario de charge (chat, refactoring, analyse de docs) |
| `/providers.html` | Comparateur par modèle : prix, vitesse et latence de chaque fournisseur (OpenRouter, DeepInfra, Together, API du labo…) |
| `/hosting.html` | Auto-hébergement : filtre par VRAM de GPU, VRAM requise aux trois quantisations (Q4/Q8/FP16), option « seulement ce qui tient » |
| `/hardware.html` | Hardware : le matériel qui fait tourner les poids ouverts — coût initial, consommation, VRAM, bande passante et tok/s estimés par modèle/quantisation |

## Indices suivis (v0)

| Indice | Description | Source |
|---|---|---|
| Code | FrontierCode 2.0 (AA) : 132 tâches réelles sur des repos open source, validées par un mainteneur | Artificial Analysis |
| Analyse | GPQA Diamond : 198 questions sciences de niveau doctorat, "Google-proof" (rerun AA utilisé, source notée, quand Epoch n'a pas publié pour le modèle) | Epoch AI Benchmarking Hub / Artificial Analysis |
| Global | AA Intelligence Index v5.0.1 : composite 9 évaluations (knowledge work, coding, science, général). Marqueur `v4` quand seule la version 4.x est publiée pour le modèle | Artificial Analysis |
| Perf/$ | Indice Global / prix mélangé (3:1 input:output) | calcul maison |

Prix en $ / 1M tokens, mélange standard 75 % input / 25 % output : `(3×in + out) / 4`.

## Hardware

`data/hardware.json` (curé, committé) liste les composants pertinents pour l'auto-hébergement :
GPU grand public et occasion, cartes datacenter, Mac à mémoire unifiée, même le CPU pour la
blague. Champs : VRAM, bande passante mémoire, TDP, prix constaté (USD, marché/occasion).

Performance estimée, batch 1 en décode :

```
tokens/s = bande passante (GB/s) × 0.55 / poids actifs (Go)
```

Dense : les poids actifs = la totalité. MoE : un token ne lit que les paramètres actifs —
c'est toute la valeur du Sparse — mais la totalité réside en VRAM (critère de fit).
Coût horaire élec = TDP × électricité ($0.35/kWh, paramètre dans le fichier). Ce sont des
estimations rule-of-thumb type llama.cpp, pas des mesures benchées.

## Fraîcheur

Chaque modèle porte sa date de sortie (champ `created` de l'API OpenRouter, date du
snapshot publié) et un score de fraîcheur recalculé à chaque build :

| Score | Âge |
|---|---|
| 5 | moins de 2 mois |
| 4 | moins de 5 mois |
| 3 | moins d'un an |
| 2 | moins de 2 ans |
| 1 | plus de 2 ans |

Affiché en points (1 à 5) sur la page modèles et en date + points dans la synthèse
fournisseurs. Cliquer un nom de modèle (dashboard, modèles, auto-hébergement) ouvre
la page fournisseurs filtrée sur ce modèle (`providers.html#model=<id>`).

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
BenchLeader ──────▶ scripts/fetch_providers.py ──▶ data/providers.json
(pages modèles,   (prix/vitesse par fournisseur,  (committé)
 prix par offre)    tolère les pages absentes)
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
- `scripts/fetch_providers.py` : parse les pages modèles BenchLeader (slug par entrée dans
  `benchmarks.json`, champ `benchleader_slug`) et collecte, pour chaque modèle, chaque offre
  qui le route via OpenRouter : fournisseur, prix propres in/out, vitesse, latence premier
  token, quantisation. Une page échouée garde les données du fetch précédent.
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
- [ ] Garder les fournisseurs qui disparaissent de OpenRouter sous forme d'historique
- [ ] Benchmarks latence (tokens/s) et débit, côté modèles
- [ ] Comparateur de modèles côte à côte

## Sources

- Prix et contextes : [OpenRouter](https://openrouter.ai/api/v1/models) (API publique)
- Benchmarks : Artificial Analysis (AA Intelligence Index v5.0.1, FrontierCode 2.0) et
  Epoch AI Benchmarking Hub (GPQA Diamond), agrégés par BenchLeader, données du 2026-11-25

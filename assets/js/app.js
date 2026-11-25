/* IA_Models -- rendu client-side depuis data/models.json */
"use strict";

const DATA_URL = "data/models.json";

const fmt = {
	price(v) {
		if (v == null) return '<span class="na">--</span>';
		if (v === 0) return "gratis";
		if (v < 0.01) return "$" + v.toFixed(4);
		if (v < 1) return "$" + v.toFixed(3);
		return "$" + v.toFixed(2);
	},
	context(t) {
		if (t == null) return '<span class="na">--</span>';
		if (t >= 1_000_000) return Math.round(t / 1_000_000) + "M";
		return Math.round(t / 1000) + "k";
	},
	num(v, digits = 1) {
		return v == null ? '<span class="na">--</span>' : v.toFixed(digits);
	},
	unixToISO(t) {
		return t == null ? "--" : t.replace("T", " ").replace("Z", " UTC");
	},
};

function esc(s) {
	const div = document.createElement("div");
	div.textContent = String(s);
	return div.innerHTML;
}

async function loadDataset() {
	const resp = await fetch(DATA_URL);
	if (!resp.ok) throw new Error("data/models.json introuvable (" + resp.status + ")");
	return resp.json();
}

/* ---------- helpers d'indices ---------- */

function bmValue(m, key) {
	const b = m.benchmarks[key];
	return b && b.value != null ? b.value : null;
}

function freshDots(m) {
	if (!m.freshness) return '<span class="na">--</span>';
	let out = '<span class="dots" title="sorti le ' + (m.released_at || "?") + ", " +
		m.freshness.age_months + ' mois">';
	for (let i = 1; i <= 5; i++) {
		out += '<span class="dot-f' + (i <= m.freshness.score ? " on" : "") + '">●</span>';
	}
	return out + "</span>";
}

function modelLink(m) {
	return '<a class="cell-main" href="providers.html#model=' + encodeURIComponent(m.id) + '">' +
		esc(m.name) + "</a>";
}

function barCell(value, max, cssClass) {
	if (value == null) return '<td class="num"><span class="na">--</span></td>';
	const pct = max > 0 ? Math.round((value / max) * 100) : 0;
	return (
		'<td class="num"><div class="bar-cell">' +
		'<div class="bar ' + cssClass + '"><span style="width:' + pct + '%"></span></div>' +
		"<span>" + value.toFixed(1) + "</span></div></td>"
	);
}

/* ---------- header : statut ---------- */

function renderStatusBar(dataset) {
	const el = document.querySelector("#data-status");
	if (!el) return;
	el.innerHTML =
		'<span class="dot">●</span> ' +
		dataset.models.length +
		" modèles · data " +
		esc(dataset._meta.generated_at_utc.slice(0, 10));
}

/* ---------- page dashboard : que prendre ? ---------- */

function renderDashboard(dataset) {
	const host = document.querySelector("#dispatch");
	if (!host) return;
	const models = dataset.models;
	const priced = models.filter((m) => m.pricing && m.pricing.blended_per_m > 0);

	const sortedBy = (key) =>
		models
			.filter((m) => bmValue(m, key) != null)
			.sort((a, b) => bmValue(b, key) - bmValue(a, key));

	const aaDesc = (pool) =>
		[...pool].sort((a, b) => (bmValue(b, "aa_intelligence") ?? -1) - (bmValue(a, "aa_intelligence") ?? -1));

	const money = (m) =>
		m.pricing ? fmt.price(m.pricing.blended_per_m) + " /M mélangé" : "prix inconnu";

	function card(question, pick, key, alts, extra, altKey) {
		if (!pick) return "";
		const shownKey = altKey || key;
		const shownVal = (m) => {
			const v = key === "__extra" ? null : bmValue(m, key);
			return v != null ? v.toFixed(1) : "?";
		};
		const badges =
			(pick.open_weights ? '<span class="badge open">OPEN</span>' : "") +
			(pick.freshness ? ' <span class="dots">' + freshDots(pick).replace(/^<span[^>]*>|<\/span>$/g, "") + "</span>" : "");
		const altLine = alts.length
			? '<div class="pick-alt">sinon : ' +
			  alts
					.map((m) => '<a href="providers.html#model=' + encodeURIComponent(m.id) + '">' +
						esc(m.name) + "</a>")
					.join(" · ") + "</div>"
			: "";
		return (
			'<div class="kpi"><div class="k-label">' + question + "</div>" +
			'<div class="k-name">' + modelLink(pick) + badges + "</div>" +
			'<div class="k-value">' + (extra.num ?? shownVal(pick)) +
			'<span class="accent">' + extra.unit + "</span></div>" +
			'<div class="k-sub">' + extra.sub + "</div>" + altLine + "</div>"
		);
	}

	/* pools */
	const codeTop = sortedBy("frontiercode2");
	const analysisTop = sortedBy("gpqa_diamond");
	const valueTop = priced
		.filter((m) => m.pricing.perf_per_dollar)
		.sort((a, b) => b.pricing.perf_per_dollar - a.pricing.perf_per_dollar);
	const hostable = models.filter((m) => m.self_host);
	const host16 = aaDesc(hostable.filter((m) => m.self_host.vram_q4_gb <= 16));
	const openAny = aaDesc(hostable);
	const longCtx = aaDesc(models.filter((m) => m.context_tokens >= 1_000_000));

	host.innerHTML =
		card("écrire du code", codeTop[0], "frontiercode2", codeTop.slice(1, 3), {
			unit: "%", sub: "FrontierCode 2.0 · " + money(codeTop[0])}) +
		card("analyser dur (GPQA)", analysisTop[0], "gpqa_diamond", analysisTop.slice(1, 3), {
			unit: "%", sub: "GPQA Diamond · " + money(analysisTop[0])}) +
		card("le meilleur rapport qualité/prix", valueTop[0], "aa_intelligence", valueTop.slice(1, 3), {
			unit: "/$", num: valueTop[0].pricing.perf_per_dollar.toFixed(0),
			sub: "indice global par dollar · " + money(valueTop[0])}) +
		card("le faire tourner chez soi · 16 Go @ Q4", host16[0], "aa_intelligence", host16.slice(1, 3), {
			unit: "", sub: "indice global · tient en " + host16[0].self_host.vram_q4_gb.toFixed(1) + " Go @ Q4"}) +
		card("l'open weights le plus costaud, RAM intendante", openAny[0], "aa_intelligence", openAny.slice(1, 3), {
			unit: "", sub: "indice global · prévoir " + openAny[0].self_host.vram_q4_gb.toFixed(1) + " Go @ Q4"}) +
		card("tronquer le moins · 1M de contexte", longCtx[0], "aa_intelligence", longCtx.slice(1, 3), {
			unit: "", sub: fmt.context(longCtx[0].context_tokens) + " tokens · " + money(longCtx[0])});

	/* top perf/$ */
	const valueRank = valueTop.slice(0, 8);
	const tbody = document.querySelector("#top-value tbody");
	if (tbody) {
		tbody.innerHTML = valueRank
			.map(
				(m, i) =>
					'<tr><td class="faint">' + (i + 1) + "</td><td>" +
					'<span class="lab-dot" style="background:' + m.lab_color + '"></span>' + modelLink(m) +
					'<span class="badge">' + esc(m.lab) + "</span></td>" +
					'<td class="num">' + fmt.num(bmValue(m, "aa_intelligence")) + "</td>" +
					'<td class="num">' + fmt.price(m.pricing.blended_per_m) + "</td>" +
					'<td class="num pos">' + m.pricing.perf_per_dollar.toFixed(2) + "</td></tr>"
			)
			.join("");
	}
}

/* ---------- page modèles ---------- */

const COLUMNS = [
	{ key: "name", label: "Modèle", sortable: true },
	{ key: "lab", label: "Labo", sortable: true },
	{ key: "context_tokens", label: "Ctx", sortable: true, num: true },
	{ key: "in", label: "$ IN /M", sortable: true, num: true },
	{ key: "out", label: "$ OUT /M", sortable: true, num: true },
	{ key: "blended", label: "$ mélangé /M", sortable: true, num: true },
	{ key: "frontiercode2", label: "Code (FC2)", sortable: true, num: true },
	{ key: "gpqa_diamond", label: "Analyse (GPQA)", sortable: true, num: true },
	{ key: "aa_intelligence", label: "Global (AA)", sortable: true, num: true },
	{ key: "perf_per_dollar", label: "Perf / $", sortable: true, num: true },
	{ key: "freshness", label: "Fraîcheur", sortable: true },
];

function sortValue(m, key) {
	switch (key) {
		case "name": return m.name.toLowerCase();
		case "lab": return m.lab.toLowerCase();
		case "context_tokens": return m.context_tokens || 0;
		case "in": return m.pricing ? m.pricing.in_per_m : -1;
		case "out": return m.pricing ? m.pricing.out_per_m : -1;
		case "blended": return m.pricing ? m.pricing.blended_per_m : -1;
		case "frontiercode2": return bmValue(m, "frontiercode2") ?? -1;
		case "gpqa_diamond": return bmValue(m, "gpqa_diamond") ?? -1;
		case "aa_intelligence": return bmValue(m, "aa_intelligence") ?? -1;
		case "perf_per_dollar": return m.pricing && m.pricing.perf_per_dollar ? m.pricing.perf_per_dollar : -1;
		case "freshness": return m.freshness ? m.freshness.score : -1;
		default: return 0;
	}
}

function renderModelsTable(dataset) {
	const host = document.querySelector("#models-table");
	if (!host) return;
	const models = dataset.models;
	const maxFC = Math.max(...models.map((m) => bmValue(m, "frontiercode2") || 0), 1);
	const maxGPQA = Math.max(...models.map((m) => bmValue(m, "gpqa_diamond") || 0), 1);
	const maxAA = Math.max(...models.map((m) => bmValue(m, "aa_intelligence") || 0), 1);

	let sortKey = "aa_intelligence";
	let sortDir = -1;
	let query = "";
	let labFilter = "";

	const labs = [...new Set(models.map((m) => m.lab))].sort();

	const thead = document.createElement("thead");
	thead.innerHTML =
		"<tr>" +
		COLUMNS.map(
			(c) =>
				'<th class="sortable' + (c.num ? " num" : "") + '" data-key="' + c.key + '">' +
				c.label + '<span class="arrow"></span></th>'
		).join("") +
		"</tr>";
	const tbody = document.createElement("tbody");
	host.append(thead, tbody);

	function draw() {
		let rows = models.filter((m) => {
			if (labFilter && m.lab !== labFilter) return false;
			if (query) {
				const q = query.toLowerCase();
				if (
					!m.name.toLowerCase().includes(q) &&
					!m.id.toLowerCase().includes(q) &&
					!m.lab.toLowerCase().includes(q)
				) return false;
			}
			return true;
		});
		rows.sort((a, b) => {
			const va = sortValue(a, sortKey);
			const vb = sortValue(b, sortKey);
			if (va < vb) return -1 * sortDir;
			if (va > vb) return 1 * sortDir;
			return 0;
		});

		tbody.innerHTML = rows
			.map((m) => {
				const p = m.pricing;
				return (
					"<tr>" +
					"<td>" + modelLink(m) +
					(m.open_weights ? '<span class="badge open">OPEN</span>' : "") +
					'<div class="cell-sub">' + esc(m.id) + "</div></td>" +
					'<td><span class="lab-dot" style="background:' + m.lab_color + '"></span>' + esc(m.lab) + "</td>" +
					'<td class="num dim">' + fmt.context(m.context_tokens) + "</td>" +
					'<td class="num">' + (p ? fmt.price(p.in_per_m) : '<span class="na">--</span>') + "</td>" +
					'<td class="num">' + (p ? fmt.price(p.out_per_m) : '<span class="na">--</span>') + "</td>" +
					'<td class="num">' + (p ? fmt.price(p.blended_per_m) : '<span class="na">--</span>') + "</td>" +
					barCell(bmValue(m, "frontiercode2"), maxFC, "code") +
					barCell(bmValue(m, "gpqa_diamond"), maxGPQA, "analyse") +
					(() => {
						const aa = m.benchmarks.aa_intelligence;
						return barCell(bmValue(m, "aa_intelligence"), maxAA, "global") +
							(aa && aa.version && aa.version.startsWith("v4")
								? '<span class="v4-tag">v4</span>'
								: "");
					})() +
					'<td class="num">' +
					(p && p.perf_per_dollar
						? '<span class="pos">' + p.perf_per_dollar.toFixed(2) + "</span>"
						: '<span class="na">--</span>') +
					"</td>" +
					'<td class="num">' + freshDots(m) + "</td></tr>"
				);
			})
			.join("");

		thead.querySelectorAll("th").forEach((th) => {
			const isActive = th.dataset.key === sortKey;
			th.querySelector(".arrow").textContent = isActive ? ((sortDir > 0) ? " ↑" : " ↓") : "";
		});

		const countEl = document.querySelector("#row-count");
		if (countEl) countEl.textContent = rows.length + " / " + models.length;
	}

	thead.addEventListener("click", (e) => {
		const th = e.target.closest("th.sortable");
		if (!th) return;
		const key = th.dataset.key;
		if (key === sortKey) sortDir = -sortDir;
		else {
			sortKey = key;
			sortDir = -1; /* defaut : meilleur en haut */
		}
		draw();
	});

	const search = document.querySelector("#model-search");
	if (search) search.addEventListener("input", () => { query = search.value.trim(); draw(); });

	const select = document.querySelector("#lab-filter");
	if (select) {
		select.innerHTML =
			'<option value="">Tous les labos</option>' +
			labs.map((l) => '<option value="' + esc(l) + '">' + esc(l) + "</option>").join("");
		select.addEventListener("change", () => { labFilter = select.value; draw(); });
	}

	draw();
}

/* ---------- page coûts ---------- */

const WORKLOADS = {
	chat: { label: "Chat simple (10k in / 2k out)", in_k: 10, out_k: 2 },
	refactor: { label: "Gros refactoring (500k in / 100k out)", in_k: 500, out_k: 100 },
	analyse: { label: "Analyse de corpus (2M in / 50k out)", in_k: 2000, out_k: 50 },
};

function renderCosts(dataset) {
	const host = document.querySelector("#costs-table");
	if (!host) return;
	const models = dataset.models.filter((m) => m.pricing);
	let workload = "chat";

	const select = document.querySelector("#workload");
	if (select) {
		select.innerHTML = Object.entries(WORKLOADS)
			.map(([k, w]) => '<option value="' + k + '">' + w.label + "</option>")
			.join("");
		select.addEventListener("change", () => { workload = select.value; draw(); });
	}

	function cost(m) {
		const w = WORKLOADS[workload];
		return (
			(m.pricing.in_per_m * w.in_k) / 1000 +
			(m.pricing.out_per_m * w.out_k) / 1000
		);
	}

	function draw() {
		const rows = [...models].sort((a, b) => cost(a) - cost(b));
		const max = Math.max(...rows.map(cost), 0.000001);
		document.querySelector("#costs-tbody").innerHTML = rows
			.map((m, i) => {
				const c = cost(m);
				const pct = Math.max(2, Math.round((c / max) * 100));
				return (
					"<tr><td class=\"faint\">" + (i + 1) + "</td>" +
					'<td><span class="lab-dot" style="background:' + m.lab_color + '"></span>' +
					'<span class="cell-main">' + esc(m.name) + "</span></td>" +
					'<td class="num dim">' + fmt.context(m.context_tokens) + "</td>" +
					'<td class="num"><div class="bar-cell">' +
					'<div class="bar analyse"><span style="width:' + pct + '%"></span></div>' +
					"<span>" + (c < 0.01 ? "$" + c.toFixed(4) : "$" + c.toFixed(2)) +
					"</span></div></td></tr>"
				);
			})
			.join("");
	}

	draw();
}

/* ---------- page fournisseurs ---------- */

/* fournisseurs qui sont l'API native du labo */
const LAB_PROVIDER = {
	"Anthropic": "Anthropic",
	"OpenAI": "OpenAI",
	"Google AI Studio": "Google",
	"Google Vertex": "Google",
	"Mistral": "Mistral AI",
	"Moonshot AI": "Moonshot AI",
	"Alibaba Cloud Int.": "Alibaba",
	"Xiaomi": "Xiaomi",
	"Z.ai": "Z.ai",
	"Cohere": "Cohere",
	"DeepSeek": "DeepSeek",
	"SpaceXAI": "SpaceXAI",
	"IBM": "IBM",
	"inclusionAI": "inclusionAI",
	"StepFun": "StepFun",
};

function renderProviders(dataset) {
	const host = document.querySelector("#providers-table");
	const select = document.querySelector("#provider-model");
	if (!host || !select) return;

	const models = [...dataset.models].sort(
		(a, b) => (bmValue(b, "aa_intelligence") ?? -1) - (bmValue(a, "aa_intelligence") ?? -1)
	);

	select.innerHTML = models
		.map((m) => '<option value="' + esc(m.id) + '">' + esc(m.name) + " — " + esc(m.lab) + "</option>")
		.join("");

	function hashTarget() {
		const match = (location.hash || "").match(/model=([^&]+)/);
		return match ? decodeURIComponent(match[1]) : null;
	}
	const initial = hashTarget();
	if (initial && models.some((m) => m.id === initial)) select.value = initial;
	window.addEventListener("hashchange", () => {
		const target = hashTarget();
		if (target && models.some((m) => m.id === target)) {
			select.value = target;
			draw();
		}
	});

	const tbody = host.querySelector("tbody");
	const countEl = document.querySelector("#offer-count");
	const summaryEl = document.querySelector("#provider-summary");
	const stampEl = document.querySelector("#providers-at");
	if (stampEl) stampEl.textContent = fmt.unixToISO(dataset._meta.providers_fetched_at_utc);

	function describe(m) {
		const offers = m.providers || [];
		const labOffers = offers.filter((o) => LAB_PROVIDER[o.provider] === m.lab);
		const orPrice = m.pricing ? m.pricing.blended_per_m : null;
		const cheapest = offers.length
			? offers.reduce((a, b) => ((b.blended_per_m ?? Infinity) < (a.blended_per_m ?? Infinity) ? b : a))
			: null;
		const parts = [];
		parts.push('<div class="stat-row"><span>Modèle</span><b>' + esc(m.name) + "</b></div>");
		parts.push('<div class="stat-row"><span>Labo</span><b>' + esc(m.lab) + "</b></div>");
		if (m.released_at) {
			parts.push(
				'<div class="stat-row"><span>Sorti le</span><b>' + esc(m.released_at) +
				" (" + m.freshness.age_months + " mois)</b> " + freshDots(m) + "</div>"
			);
		}
		parts.push(
			'<div class="stat-row"><span>Offres publiées</span><b>' + offers.length +
			(offers.length ? " dont " + labOffers.length + " via l'API du labo" : "") + "</b></div>"
		);
		if (cheapest && cheapest.blended_per_m != null) {
			parts.push(
				'<div class="stat-row"><span>Moins cher</span><b>' + esc(cheapest.provider) +
				" (" + fmt.price(cheapest.blended_per_m) + " /M" +
				(cheapest.quant ? ", " + esc(cheapest.quant) : "") + ")</b></div>"
			);
		}
		if (orPrice != null && cheapest && cheapest.blended_per_m != null) {
			const delta = ((cheapest.blended_per_m / orPrice - 1) * 100).toFixed(0);
			parts.push(
				'<div class="stat-row"><span>Routeur vs moins cher</span><b class="' +
				(cheapest.blended_per_m < orPrice ? "pos" : "neg") + '">' +
				(cheapest.blended_per_m < orPrice ? delta + " % de marge à prendre ailleurs" :
					delta + " % (le routeur est le moins cher)") + "</b></div>"
			);
		}
		if (summaryEl) summaryEl.innerHTML = '<div class="provider-summary">' + parts.join("") + "</div>";
	}

	function draw() {
		const m = models.find((x) => x.id === select.value) || models[0];
		if (!m) return;
		describe(m);

		const offers = m.providers || [];
		const rows = [];
		if (m.pricing) {
			rows.push(
				"<tr>" +
				'<td><span class="cell-main">OpenRouter</span>' +
				'<span class="badge open">routage</span></td>' +
				'<td class="dim">–</td>' +
				'<td class="num">' + fmt.price(m.pricing.in_per_m) + "</td>" +
				'<td class="num">' + fmt.price(m.pricing.out_per_m) + "</td>" +
				'<td class="num">' + fmt.price(m.pricing.blended_per_m) + "</td>" +
				'<td class="num"><span class="na">--</span></td>' +
				'<td class="num"><span class="na">--</span></td>' +
				'<td class="num dim">' + fmt.context(m.context_tokens) + "</td></tr>"
			);
		}
		const minBlend = Math.min(
			m.pricing ? m.pricing.blended_per_m : Infinity,
			...offers.map((o) => o.blended_per_m ?? Infinity)
		);
		rows.push(
			offers
				.map((o) => {
					const isLab = LAB_PROVIDER[o.provider] === m.lab;
					const best = o.blended_per_m != null && o.blended_per_m === minBlend;
					return (
						"<tr>" +
						'<td><span class="cell-main">' + esc(o.provider) + "</span>" +
						(isLab ? '<span class="badge open">API du labo</span>' : "") +
						(best ? '<span class="badge best">moins cher</span>' : "") + "</td>" +
						'<td class="dim">' + (o.quant ? esc(o.quant) : '<span class="na">--</span>') + "</td>" +
						'<td class="num">' + fmt.price(o.in_per_m) + "</td>" +
						'<td class="num">' + fmt.price(o.out_per_m) + "</td>" +
						'<td class="num' + (best ? " pos" : "") + '">' +
						(o.blended_per_m != null ? fmt.price(o.blended_per_m) : '<span class="na">--</span>') + "</td>" +
						'<td class="num dim">' + (o.speed_tok_s != null ? Math.round(o.speed_tok_s) : '<span class="na">--</span>') + "</td>" +
						'<td class="num dim">' + (o.first_token_s != null ? o.first_token_s.toFixed(2) + " s" : '<span class="na">--</span>') + "</td>" +
						'<td class="num dim">' + (o.context ? esc(o.context) : '<span class="na">--</span>') + "</td></tr>"
					);
				})
				.join("")
		);
		if (!m.pricing && !offers.length) {
			rows.push(
				'<tr><td colspan="8"><span class="na">Aucune offre publiée pour ce modèle — ' +
				"servi uniquement par des canaux privés, ou curation incomplète.</span></td></tr>"
			);
		}
		tbody.innerHTML = rows.join("");
		if (countEl)
			countEl.textContent = offers.length + " offre" + (offers.length > 1 ? "s" : "") + " hors routeur";
	}

	select.addEventListener("change", draw);
	draw();
}

/* ---------- page auto-hebergement ---------- */

const VRAM_PRESETS = [6, 8, 12, 16, 24, 32, 48, 64, 96];
const HOST_QUANTA = [
	{ key: "vram_q4_gb", label: "VRAM Q4" },
	{ key: "vram_q8_gb", label: "VRAM Q8" },
	{ key: "vram_fp16_gb", label: "VRAM FP16" },
];

function renderHosting(dataset) {
	const host = document.querySelector("#hosting-table");
	if (!host) return;
	const open = dataset.models.filter((m) => m.open_weights);

	let vram = 16;
	let customMode = false;
	let fitOnly = false;

	const vramSelect = document.querySelector("#vram-select");
	const vramCustom = document.querySelector("#vram-custom");
	const fitOnlyBox = document.querySelector("#fit-only");
	const countEl = document.querySelector("#fit-count");
	const tbody = host.querySelector("tbody");

	vramSelect.innerHTML =
		VRAM_PRESETS.map((v) => '<option value="' + v + '"' + (v === vram ? " selected" : "") + ">" + v + " Go</option>").join("") +
		'<option value="custom">autre…</option>';
	vramCustom.hidden = true;

	function currentVram() {
		if (!customMode) return vram;
		const v = parseFloat(vramCustom.value);
		return isNaN(v) || v <= 0 ? 0 : v;
	}

	function draw() {
		const gpu = currentVram();
		const rows = [...open].sort(
			(a, b) =>
				(a.self_host ? a.self_host.vram_q4_gb : Infinity) -
				(b.self_host ? b.self_host.vram_q4_gb : Infinity)
		);
		tbody.innerHTML = rows
			.map((m) => {
				const sh = m.self_host;
				let vramCells = "";
				let bestFit = null;
				if (sh) {
					for (const q of HOST_QUANTA) {
						const need = sh[q.key];
						const fits = gpu > 0 && need <= gpu;
						if (fits && (!bestFit || need > bestFit.need)) bestFit = { quant: q, need };
						vramCells +=
							'<td class="num ' + (fits ? "fit-ok" : "fit-no") + '">' +
							(fits ? "<b>" : "") + need.toFixed(1) + (fits ? "</b>" : "") + " Go</td>";
					}
				} else {
					vramCells = '<td class="num" colspan="3"><span class="na">taille non publiée</span></td>';
				}
				const params =
					m.params_total_b == null
						? '<span class="na">--</span>'
						: m.params_total_b + "B" +
						  (m.params_active_b != null ? ' <span class="cell-sub">A' + m.params_active_b + "B</span>" : "");
				if (fitOnly && sh && !(gpu > 0 && sh.vram_q4_gb <= gpu)) return "";
				if (fitOnly && !sh) return "";
				const p = m.pricing;
				return (
					"<tr>" +
					"<td>" + modelLink(m) +
					'<div class="cell-sub">' + esc(m.id) + "</div></td>" +
					'<td><span class="lab-dot" style="background:' + m.lab_color + '"></span>' + esc(m.lab) + "</td>" +
					'<td class="num">' + params + "</td>" +
					vramCells +
					'<td class="num dim">' + (p ? fmt.price(p.blended_per_m) : '<span class="na">--</span>') + "</td>" +
					'<td class="num">' + (bmValue(m, "aa_intelligence") != null ? bmValue(m, "aa_intelligence").toFixed(1) : '<span class="na">--</span>') + "</td>" +
					'<td class="num dim">' + fmt.context(m.context_tokens) + "</td></tr>"
				);
			})
			.join("");

		const nFit = (key) => open.filter((m) => m.self_host && m.self_host[key] <= gpu).length;
		const nSized = open.filter((m) => m.self_host).length;
		countEl.textContent =
			gpu > 0
				? nFit("vram_q4_gb") + " / " + nSized + " tiennent en " + gpu + " Go @ Q4 · " +
				  nFit("vram_q8_gb") + " @ Q8 · " + nFit("vram_fp16_gb") + " @ FP16"
				: "indiquez votre VRAM";
	}

	vramSelect.addEventListener("change", () => {
		if (vramSelect.value === "custom") {
			customMode = true;
			vramCustom.hidden = false;
			vramCustom.focus();
		} else {
			customMode = false;
			vramCustom.hidden = true;
			vram = parseInt(vramSelect.value, 10);
		}
		draw();
	});
	vramCustom.addEventListener("input", draw);
	if (fitOnlyBox) fitOnlyBox.addEventListener("change", () => { fitOnly = fitOnlyBox.checked; draw(); });

	draw();
}

/* ---------- boot ---------- */

(async function boot() {
	try {
		const dataset = await loadDataset();
		renderStatusBar(dataset);
		renderDashboard(dataset);
		renderModelsTable(dataset);
		renderCosts(dataset);
		renderProviders(dataset);
		renderHosting(dataset);
		const stamp = document.querySelector("#generated-at");
		if (stamp) stamp.textContent = fmt.unixToISO(dataset._meta.generated_at_utc);
		const pricingStamp = document.querySelector("#pricing-at");
		if (pricingStamp)
			pricingStamp.textContent = fmt.unixToISO(dataset._meta.pricing_fetched_at_utc);
	} catch (err) {
		console.error(err);
		const body = document.querySelector(".wrap");
		if (body) {
			body.insertAdjacentHTML(
				"afterbegin",
				'<div class="panel"><div class="panel-body" style="color:var(--red)">' +
				"Échec du chargement de data/models.json — " +
				"exécuter scripts/fetch_pricing.py puis scripts/build_dataset.py." +
				"</div></div>"
			);
		}
	}
})();

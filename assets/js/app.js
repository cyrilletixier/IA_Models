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

/* ---------- page dashboard ---------- */

function renderDashboard(dataset) {
	const host = document.querySelector("#dashboard");
	if (!host) return;
	const models = dataset.models;
	const priced = models.filter((m) => m.pricing && m.pricing.blended_per_m > 0);

	const bestBy = (get, filter) => {
		const pool = (filter ? priced.filter(filter) : priced).filter((m) => get(m) != null);
		if (!pool.length) return null;
		return pool.reduce((a, b) => (get(b) > get(a) ? b : a));
	};

	const topCode = bestBy((m) => bmValue(m, "frontiercode2"));
	const topAnalysis = bestBy((m) => bmValue(m, "gpqa_diamond"));
	const topGlobal = bestBy((m) => bmValue(m, "aa_intelligence"));
	const topPerfDollar = bestBy((m) => m.pricing.perf_per_dollar);
	const cheapest = priced.length
		? priced.reduce((a, b) =>
				b.pricing.blended_per_m < a.pricing.blended_per_m ? b : a
			)
		: null;
	const maxCtx = models.reduce(
		(a, b) => Math.max(a, b.context_tokens || 0), 0);

	function kpi(id, model, getValue, unit) {
		const cell = document.querySelector("#" + id);
		if (!cell) return;
		if (!model) {
			cell.innerHTML = '<div class="k-value"><span class="na">--</span></div>';
			return;
		}
		cell.innerHTML =
			'<div class="k-value">' + (getValue(model) ?? "--") +
			'<span class="accent">' + unit + "</span></div>" +
			'<div class="k-sub">' + esc(model.name) + "</div>";
	}

	kpi("kpi-code", topCode, (m) => bmValue(m, "frontiercode2").toFixed(1), "%");
	kpi("kpi-analyse", topAnalysis, (m) => bmValue(m, "gpqa_diamond").toFixed(1), "%");
	kpi("kpi-global", topGlobal, (m) => bmValue(m, "aa_intelligence").toFixed(1), "");
	kpi("kpi-value", topPerfDollar, (m) => m.pricing.perf_per_dollar.toFixed(1), "/$");
	kpi("kpi-cheap", cheapest, (m) => "$" + m.pricing.blended_per_m.toFixed(2), "/M");

	const ctxCell = document.querySelector("#kpi-ctx");
	if (ctxCell) {
		ctxCell.innerHTML =
			'<div class="k-value">' + fmt.context(maxCtx) +
			'<span class="accent"> tok</span></div>' +
			'<div class="k-sub">plus grande fenêtre</div>';
	}

	/* top perf/$ */
	const valueRank = priced
		.filter((m) => m.pricing.perf_per_dollar)
		.sort((a, b) => b.pricing.perf_per_dollar - a.pricing.perf_per_dollar)
		.slice(0, 8);
	const tbody = document.querySelector("#top-value tbody");
	if (tbody) {
		tbody.innerHTML = valueRank
			.map(
				(m, i) =>
					"<tr><td class=\"faint\">" + (i + 1) + '</td><td><span class="lab-dot" style="background:' +
					m.lab_color + '"></span><span class="cell-main">' + esc(m.name) +
					'</span><span class="badge">' + esc(m.lab) + "</span></td>" +
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
					'<td><span class="cell-main">' + esc(m.name) + "</span>" +
					(m.open_weights ? '<span class="badge open">OPEN</span>' : "") +
					'<div class="cell-sub">' + esc(m.id) + "</div></td>" +
					'<td><span class="lab-dot" style="background:' + m.lab_color + '"></span>' + esc(m.lab) + "</td>" +
					'<td class="num dim">' + fmt.context(m.context_tokens) + "</td>" +
					'<td class="num">' + (p ? fmt.price(p.in_per_m) : '<span class="na">--</span>') + "</td>" +
					'<td class="num">' + (p ? fmt.price(p.out_per_m) : '<span class="na">--</span>') + "</td>" +
					'<td class="num">' + (p ? fmt.price(p.blended_per_m) : '<span class="na">--</span>') + "</td>" +
					barCell(bmValue(m, "frontiercode2"), maxFC, "code") +
					barCell(bmValue(m, "gpqa_diamond"), maxGPQA, "analyse") +
					barCell(bmValue(m, "aa_intelligence"), maxAA, "global") +
					'<td class="num">' +
					(p && p.perf_per_dollar
						? '<span class="pos">' + p.perf_per_dollar.toFixed(2) + "</span>"
						: '<span class="na">--</span>') +
					"</td></tr>"
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

function renderProviders(dataset) {
	const host = document.querySelector("#providers");
	if (!host) return;
	const byLab = new Map();
	for (const m of dataset.models) {
		if (!byLab.has(m.lab)) byLab.set(m.lab, []);
		byLab.get(m.lab).push(m);
	}
	const cards = [...byLab.entries()]
		.map(([lab, ms]) => {
			const priced = ms.filter((m) => m.pricing);
			const cheapest = priced.length
				? Math.min(...priced.map((m) => m.pricing.blended_per_m))
				: null;
			const priciest = priced.length
				? Math.max(...priced.map((m) => m.pricing.blended_per_m))
				: null;
			const bestGlobal = ms
				.map((m) => bmValue(m, "aa_intelligence"))
				.filter((v) => v != null);
			const color = ms[0].lab_color;
			return (
				'<div class="provider-card"><h3><span class="lab-dot" style="background:' +
				color + '"></span>' + esc(lab) + "</h3>" +
				'<div class="stat-row"><span>Modèles suivis</span><b>' + ms.length + "</b></div>" +
				'<div class="stat-row"><span>Poids ouverts</span><b>' +
				ms.filter((m) => m.open_weights).length + "</b></div>" +
				'<div class="stat-row"><span>Prix mélangé</span><b>' +
				(cheapest != null
					? fmt.price(cheapest) + " → " + fmt.price(priciest)
					: "--") +
				" /M</b></div>" +
				'<div class="stat-row"><span>Meilleur indice global</span><b>' +
				(bestGlobal.length ? Math.max(...bestGlobal).toFixed(1) : "--") +
				"</b></div></div>"
			);
		})
		.join("");
	host.innerHTML = cards;
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

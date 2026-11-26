/* ==========================================================================
   Análisis de Datos - lógica del cliente
   Seguridad: todo lo que llega del servidor se inserta con textContent /
   createElement (NUNCA innerHTML). El servidor ya descartó nombres e
   identificaciones: aquí ni siquiera existen.
   ========================================================================== */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const SVG_NS = "http://www.w3.org/2000/svg";
  const CSRF = document.querySelector('meta[name="csrf-token"]').content;
  const MAX_MB = Number(document.querySelector('meta[name="max-mb"]').content) || 5;
  const FONT = "Inter, Segoe UI, system-ui, Arial, sans-serif";

  // Paleta categórica en orden fijo (validada para daltonismo); "Otros" en gris.
  // Paleta verde de la plantilla (oscuro, medio, claro...); "Otros" en gris azulado.
  // Cada sector lleva su etiqueta y valor en la leyenda.
  const CAT = ["#2e7d6f", "#70af9a", "#a8d4b9", "#1b5248", "#d2eadf", "#4f9a87", "#8fc4ab", "#3b6f66"];
  const OTHER = "#9fb3be";
  const SEQ = ["#d6ece2", "#bfe0d0", "#a8d4b9", "#8cc3a8", "#70af9a", "#56998a", "#3f8c7c", "#2e7d6f", "#23675b", "#1b5248"];
  const BAR = "#a8d4b9", BAR_MAX = "#2e7d6f", INK = "#1b2b27", MUTED = "#667772", GRID = "#e6eeeb";

  const state = {
    data: null, file: "", step: 1,
    cols: new Map(),          // key -> {key,name,type,view,sheet,sheetIdx,order}
    selected: [],             // keys
    checkL: new Set(), checkR: new Set(),
    collapsed: new Set(),
    view: 0,
  };

  /* ---------------- utilidades DOM ---------------- */
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };
  const svg = (tag, attrs = {}) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const svgText = (txt, attrs) => { const t = svg("text", attrs); t.textContent = txt; return t; };
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
  const fmt = (n, d = 0) => (n === null || n === undefined || Number.isNaN(Number(n))) ? "—" :
    Number(n).toLocaleString("es-EC", { maximumFractionDigits: d });
  const pct = (a, b) => (b ? (100 * a) / b : 0);
  const plural = (n, s, p) => `${fmt(n)} ${n === 1 ? s : p}`;
  // "Edad" -> "edad", pero siglas como "IMC" o "T.A" se respetan
  const lower1 = (s) => {
    const first = s.split(" ")[0];
    if (first.length > 1 && first === first.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(first)) return s;
    return s.charAt(0).toLowerCase() + s.slice(1);
  };

  const ICONS = {
    num: "M4 20V10m6 10V4m6 16v-7m4 7H2",
    cat: "M12 3a9 9 0 1 0 9 9h-9z M14 2.5A8 8 0 0 1 21.5 10H14z",
    date: "M3 17l5-6 4 4 8-9 M3 21h18",
  };
  const icon = (kind) => {
    const s = svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
    ICONS[kind].split(" M").forEach((d, i) => s.appendChild(svg("path", { d: (i ? "M" : "") + d })));
    return s;
  };

  /* ---------------- tooltip / toast ---------------- */
  const tip = $("#tooltip");
  const bindTip = (node, title, line) => {
    node.addEventListener("mousemove", (e) => {
      clear(tip); tip.appendChild(el("b", null, title)); tip.appendChild(document.createTextNode(line));
      tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; tip.hidden = false;
    });
    node.addEventListener("mouseleave", () => { tip.hidden = true; });
  };
  let toastT;
  function toast(msg, err = false) {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast" + (err ? " error" : ""); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 5000);
  }

  /* ---------------- navegación entre pasos ---------------- */
  function go(step) {
    state.step = step;
    document.body.dataset.step = String(step);
    [1, 2, 3, 4].forEach((s) => { $("#step" + s).hidden = s !== step; });
    $$("#stepList li").forEach((li) => {
      const s = Number(li.dataset.s);
      li.classList.toggle("current", s === step);
      li.classList.toggle("done", s < step);
    });
    const dash = step === 4;
    $("#sideSteps").hidden = dash;
    $("#sideViews").hidden = !dash;
    $("#privacyCard").hidden = dash;
    $("#fileCard").hidden = !dash;
    $("#newFileBtn").hidden = !dash;
    $("#sidebar").classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $$("[data-back]").forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.back))));
  $("#newFileBtn").addEventListener("click", () => go(1));

  /* ---------------- PASO 1: carga ---------------- */
  const input = $("#fileInput");
  $$("[data-pick]").forEach((b) => b.addEventListener("click", () => input.click()));
  input.addEventListener("change", () => { if (input.files[0]) upload(input.files[0]); input.value = ""; });
  const zone = $("#uploadZone");
  ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
  zone.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) upload(f); });
  ["dragover", "drop"].forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));
  $("#demoBtn").addEventListener("click", () => send("/api/demo", null, "Datos_demostracion.xlsx"));

  function upload(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["xlsx", "csv"].includes(ext)) return toast("Formato no permitido. Usa un archivo .xlsx o .csv.", true);
    if (file.size > MAX_MB * 1024 * 1024) return toast(`El archivo supera el límite de ${MAX_MB} MB.`, true);
    if (!file.size) return toast("El archivo está vacío.", true);
    const fd = new FormData();
    fd.append("archivo", file, file.name);
    send("/api/upload", fd, file.name);
  }

  let busy = false;
  async function send(url, body, label) {
    if (busy) return;
    busy = true;
    const hint = $("#uploadHint"), old = "o arrastra y suelta tu archivo .xlsx aquí";
    hint.textContent = body ? "Analizando y protegiendo los datos…" : "Generando datos ficticios…";
    $("#progress").hidden = false;
    $$("#step1 button").forEach((b) => { b.disabled = true; });
    try {
      const res = await fetch(url, {
        method: "POST", body, credentials: "same-origin", cache: "no-store",
        headers: { "X-CSRF-Token": CSRF, "X-Requested-With": "fetch" },
      });
      let data = null;
      try { data = await res.json(); } catch { /* no JSON */ }
      if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || "No se pudo procesar el archivo.");
      loadData(data, label);
      go(2);
      const h = data.totals.hidden;
      toast(h ? `Se ocultaron ${plural(h, "columna con datos personales", "columnas con datos personales")}.` : "Archivo cargado.");
    } catch (err) {
      toast(String(err.message || err).slice(0, 200), true);
    } finally {
      busy = false;
      hint.textContent = old;
      $("#progress").hidden = true;
      $$("#step1 button").forEach((b) => { b.disabled = false; });
    }
  }

  function loadData(data, label) {
    state.data = data;
    state.file = label;
    state.cols.clear();
    state.selected = []; state.checkL.clear(); state.checkR.clear(); state.collapsed.clear();
    let order = 0;
    data.sheets.forEach((sh, si) => sh.columns.forEach((c) => {
      state.cols.set(c.key, { ...c, sheet: sh.name, sheetIdx: si, rows: sh.rows, order: order++ });
    }));
    $("#searchInput").value = "";
    $("#pickFile").textContent = label;
    const t = data.totals, meta = $("#pickMeta");
    clear(meta);
    meta.append(
      document.createTextNode(`${plural(t.sheets, "hoja detectada", "hojas detectadas")} · ${plural(t.available, "columna disponible", "columnas disponibles")}`),
    );
    if (t.hidden) {
      meta.append(document.createTextNode(" · "));
      meta.append(el("b", null, `${plural(t.hidden, "dato personal oculto", "datos personales ocultos")}`));
    }
    renderPicker();
  }

  /* ---------------- PASO 2: selector de columnas ---------------- */
  const search = $("#searchInput");
  search.addEventListener("input", renderPicker);

  function matches(c) {
    const q = search.value.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.sheet.toLowerCase().includes(q);
  }
  const available = () => [...state.cols.values()].filter((c) => !state.selected.includes(c.key));
  const selectedCols = () => state.selected.map((k) => state.cols.get(k)).sort((a, b) => a.order - b.order);

  function renderList(container, cols, checks, side) {
    clear(container);
    if (!cols.length) {
      container.appendChild(el("p", "empty-list", side === "L"
        ? (search.value ? "Sin resultados para la búsqueda." : "Todas las columnas fueron seleccionadas.")
        : "Aún no hay columnas seleccionadas. Márcalas a la izquierda y usa la flecha."));
      return;
    }
    const groups = new Map();
    cols.forEach((c) => { if (!groups.has(c.sheetIdx)) groups.set(c.sheetIdx, []); groups.get(c.sheetIdx).push(c); });
    groups.forEach((list, si) => {
      const gid = side + si;
      const open = !state.collapsed.has(gid);
      const head = el("div", "group-h");
      const toggle = el("button", "group-toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(open));
      const chev = svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
      chev.appendChild(svg("path", { d: "m6 9 6 6 6-6" }));
      toggle.append(chev, el("span", "gname", list[0].sheet), el("span", "gcount", list.length));
      toggle.addEventListener("click", () => { open ? state.collapsed.add(gid) : state.collapsed.delete(gid); renderPicker(); });

      // Seleccionar / deseleccionar todo en esta hoja
      const allMarked = list.every((c) => checks.has(c.key));
      const selAll = el("button", "group-all", allMarked ? "Deseleccionar todo" : "Seleccionar todo");
      selAll.type = "button";
      selAll.setAttribute("aria-label", `${allMarked ? "Deseleccionar" : "Seleccionar"} todas las columnas de ${list[0].sheet}`);
      selAll.addEventListener("click", () => {
        list.forEach((c) => (allMarked ? checks.delete(c.key) : checks.add(c.key)));
        state.collapsed.delete(gid);
        renderPicker();
      });
      head.append(toggle, selAll);
      if (side === "L") {
        // Precargar todo: pasa todas las columnas de esta hoja a la selección
        const pre = el("button", "group-all group-pre", "Precargar todo");
        pre.type = "button";
        pre.title = `Añadir todas las columnas de ${list[0].sheet} a la selección`;
        pre.addEventListener("click", () => {
          move(list.map((c) => c.key), true);
          toast(`Se añadieron ${plural(list.length, "columna", "columnas")} de ${list[0].sheet}.`);
        });
        head.appendChild(pre);
      }
      container.appendChild(head);
      if (!open) return;
      list.forEach((c) => {
        const row = el("label", "item" + (checks.has(c.key) ? " checked" : ""));
        const cb = el("input"); cb.type = "checkbox"; cb.checked = checks.has(c.key);
        cb.addEventListener("change", () => { cb.checked ? checks.add(c.key) : checks.delete(c.key); renderPicker(); });
        row.append(cb, el("span", "iname", c.name), el("span", "type-tag", c.type));
        row.title = c.name;
        row.addEventListener("dblclick", (e) => { e.preventDefault(); side === "L" ? move([c.key], true) : move([c.key], false); });
        container.appendChild(row);
      });
    });
  }

  function renderPicker() {
    const avail = available().filter(matches).sort((a, b) => a.order - b.order);
    const sel = selectedCols();
    // limpia marcas de columnas que ya no están visibles en su lado
    [...state.checkL].forEach((k) => { if (!avail.some((c) => c.key === k)) state.checkL.delete(k); });
    [...state.checkR].forEach((k) => { if (!state.selected.includes(k)) state.checkR.delete(k); });

    renderList($("#availList"), avail, state.checkL, "L");
    renderList($("#selList"), sel, state.checkR, "R");
    $("#availCount").textContent = `${plural(available().length, "disponible", "disponibles")}`;
    $("#selCount").textContent = plural(sel.length, "columna", "columnas");
    $("#availFoot").textContent = state.checkL.size
      ? `${plural(state.checkL.size, "columna marcada", "columnas marcadas")} para añadir`
      : "Marca columnas o haz doble clic para añadirlas.";
    $("#selFoot").textContent = state.checkR.size
      ? `${plural(state.checkR.size, "columna marcada", "columnas marcadas")} para quitar`
      : "Se conservará el orden de las columnas.";
    $("#addAll").disabled = !avail.length;
    $("#addSel").disabled = !state.checkL.size;
    $("#remAll").disabled = !sel.length;
    $("#remSel").disabled = !state.checkR.size;
    $("#toStep3").disabled = !sel.length;
  }

  function move(keys, add) {
    if (add) keys.forEach((k) => { if (!state.selected.includes(k)) state.selected.push(k); state.checkL.delete(k); });
    else { state.selected = state.selected.filter((k) => !keys.includes(k)); keys.forEach((k) => state.checkR.delete(k)); }
    renderPicker();
  }
  $("#addAll").addEventListener("click", () => move(available().filter(matches).map((c) => c.key), true));
  $("#addSel").addEventListener("click", () => move([...state.checkL], true));
  $("#remAll").addEventListener("click", () => move([...state.selected], false));
  $("#remSel").addEventListener("click", () => move([...state.checkR], false));
  $("#toStep3").addEventListener("click", () => { renderConfirm(); go(3); });

  /* ---------------- PASO 3: confirmar ---------------- */
  function viewTitle(c) {
    if (c.view.kind === "num") return `Distribución por ${lower1(c.name)}`;
    if (c.view.kind === "date") return `Tendencia ${c.view.granularity} · ${c.name}`;
    return `Distribución de ${lower1(c.name)}`;
  }
  const kindLabel = { num: "Rangos de valores", cat: "Frecuencia por categoría", date: "Evolución en el tiempo" };

  function kpiCard(label, value, foot) {
    const k = el("article", "card kpi");
    k.append(el("p", "kpi-label", label), el("p", "kpi-value", value), el("p", "kpi-foot", foot));
    k.title = `${label}: ${value}`;
    return k;
  }

  function renderConfirm() {
    const sel = selectedCols(), t = state.data.totals;
    const sheets = new Set(sel.map((c) => c.sheet));
    const box = $("#confirmKpis"); clear(box);
    box.append(
      kpiCard("Registros", fmt(Math.max(...sel.map((c) => c.rows))), "Filas con datos"),
      kpiCard("Columnas seleccionadas", fmt(sel.length), `de ${fmt(t.available)} disponibles`),
      kpiCard("Hojas", fmt(sheets.size), [...sheets].join(" · ")),
      kpiCard("Datos personales", fmt(t.hidden), "Ocultos automáticamente"),
    );
    const list = $("#confirmList"); clear(list);
    sel.forEach((c, i) => {
      const li = el("li");
      const ic = el("span", "ic"); ic.appendChild(icon(c.view.kind));
      const tx = el("span", "tx");
      tx.append(el("b", null, viewTitle(c)), el("span", null, `${c.sheet} · ${kindLabel[c.view.kind]}`));
      li.append(ic, tx, el("span", "n", String(i + 1).padStart(2, "0")));
      list.appendChild(li);
    });
    $("#viewsCount").textContent = plural(sel.length, "vista", "vistas");
    $("#hiddenTitle").textContent = t.hidden
      ? `${plural(t.hidden, "columna con datos personales fue excluida", "columnas con datos personales fueron excluidas")} y no se analizarán.`
      : "No se detectaron columnas con datos personales.";
  }
  $("#toStep4").addEventListener("click", () => { buildViews(); state.view = 0; go(4); renderView(); });

  /* ---------------- PASO 4: dashboard ---------------- */
  function buildViews() {
    const nav = $("#viewList"); clear(nav);
    const sel = selectedCols();
    sel.forEach((c, i) => {
      const b = el("button", "view-item");
      b.type = "button";
      b.style.animationDelay = `${i * 40}ms`;
      const tx = el("span");
      tx.append(el("small", null, `Opción ${i + 1}`), el("span", "t", viewTitle(c)));
      b.append(icon(c.view.kind), tx);
      b.title = viewTitle(c);
      b.addEventListener("click", () => { state.view = i; renderView(); $("#sidebar").classList.remove("open"); window.scrollTo({ top: 0, behavior: "smooth" }); });
      nav.appendChild(b);
    });
    const sheets = [...new Set(sel.map((c) => c.sheet))];
    $("#fileCardName").textContent = state.file;
    $("#fileCardName").title = state.file;
    $("#fileCardMeta").textContent = `${fmt(Math.max(...sel.map((c) => c.rows)))} registros · ${plural(sel.length, "columna", "columnas")}`;
    $("#footSource").textContent = `Fuente: ${state.file} · ${sheets.join(" y ")}`;
    $("#footNote").textContent = state.data.source === "demo" ? "Vista de ejemplo · Datos ficticios" : "Solo datos agregados · Nombres e identificaciones excluidos";
  }

  const realItems = (v) => v.items.filter((i) => !i.other);
  const topItem = (v) => realItems(v).reduce((a, b) => (b.count > a.count ? b : a), realItems(v)[0] || v.items[0]);

  function renderView() {
    const sel = selectedCols();
    const c = sel[state.view];
    if (!c) return;
    $$("#viewList .view-item").forEach((b, i) => b.classList.toggle("active", i === state.view));
    const v = c.view, top = topItem(v), unit = v.unit ? ` ${v.unit}` : "";
    $("#viewTitle").textContent = viewTitle(c);
    $("#viewSub").textContent = `Una visión clara de los ${fmt(v.total)} registros analizados.`;

    // KPIs
    const k = $("#viewKpis"); clear(k);
    const topFoot = `${plural(top.count, "registro", "registros")} · ${fmt(pct(top.count, v.total))} %`;
    k.append(kpiCard("Registros analizados", fmt(v.total), v.total < c.rows ? `De ${fmt(c.rows)} filas (resto vacías)` : "Total de la hoja"));
    if (v.kind === "num") {
      k.append(
        kpiCard(`${c.name} media`, `${fmt(v.stats.mean, 1)}${unit}`, `Mediana ${fmt(v.stats.median, 1)}${unit}`),
        kpiCard("Grupo predominante", `${top.label}${unit}`, topFoot),
        kpiCard("Grupos", fmt(v.items.length), `Rango ${fmt(v.stats.min, 1)} – ${fmt(v.stats.max, 1)}${unit}`),
      );
    } else if (v.kind === "date") {
      k.append(
        kpiCard("Periodo", v.granularity === "mensual" ? plural(v.items.length, "mes", "meses") : plural(v.items.length, "año", "años"),
          `${v.items[0].label} – ${v.items[v.items.length - 1].label}`),
        kpiCard(v.granularity === "mensual" ? "Mes con más registros" : "Año con más registros", top.label, topFoot),
        kpiCard(v.granularity === "mensual" ? "Promedio por mes" : "Promedio por año", fmt(v.total / v.items.length, 1), "Registros por periodo"),
      );
    } else {
      const real = realItems(v);
      const low = real.reduce((a, b) => (b.count < a.count ? b : a), real[0]);
      k.append(
        kpiCard("Más frecuente", top.label, topFoot),
        kpiCard("Categorías", fmt(real.length), v.items.some((i) => i.other) ? "Más el grupo «Otros»" : "Distribución completa"),
        kpiCard("Menos frecuente", low.label, `${plural(low.count, "registro", "registros")} · ${fmt(pct(low.count, v.total))} %`),
      );
    }

    // Gráfico principal
    const groupWord = v.kind === "num" ? "rango" : v.kind === "date" ? (v.granularity === "mensual" ? "mes" : "año") : "categoría";
    $("#mainTitle").textContent = v.kind === "date" ? `Registros por ${groupWord}` : `Registros por ${v.kind === "num" ? "grupo de " : ""}${lower1(c.name)}`;
    $("#mainSub").textContent = `Número de registros en cada ${groupWord}`;
    if (v.kind === "date") drawLine(v); else drawBars(v, v.kind === "num" ? `Rango de ${lower1(c.name)}${v.unit ? ` (${v.unit})` : ""}` : c.name);

    // Gráfico lateral
    drawSide(c, sel);

    // Hallazgo
    if (v.kind === "date") {
      $("#insightTitle").textContent = `${top.label} fue el periodo con más registros.`;
    } else if (v.kind === "num") {
      $("#insightTitle").textContent = `El grupo de ${top.label}${unit} concentra la mayor proporción de registros.`;
    } else {
      $("#insightTitle").textContent = `«${top.label}» es la categoría más frecuente en ${lower1(c.name)}.`;
    }
    $("#insightText").textContent =
      `Representa el ${fmt(pct(top.count, v.total))} % del total (${fmt(top.count)} de ${fmt(v.total)}). ` +
      "Los gráficos describen los datos; no constituyen una recomendación clínica.";

    // Tabla
    $("#thGroup").textContent = v.kind === "num" ? `Rango${v.unit ? ` (${v.unit})` : ""}` : v.kind === "date" ? "Periodo" : "Categoría";
    const tb = $("#tableBody"); clear(tb);
    v.items.forEach((it) => {
      const tr = el("tr", it === top ? "max" : "");
      tr.append(el("td", null, it.label), el("td", "r", fmt(it.count)), el("td", "r", `${fmt(pct(it.count, v.total), 1)} %`));
      tb.appendChild(tr);
    });
    $$("#step4 .card, #step4 .insight").forEach((n, i) => { n.classList.remove("reveal"); void n.offsetWidth; n.style.animationDelay = `${i * 40}ms`; n.classList.add("reveal"); });
  }

  /* ---- ejes comunes ---- */
  function niceTicks(max) {
    const raw = Math.max(max, 1) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw && (s >= 1 ? Number.isInteger(s) : true)) || 10 * mag;
    const out = [];
    for (let t = 0; t <= max + step * 0.0001 || out.length < 2; t += step) out.push(Math.round(t * 100) / 100);
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
    return out;
  }
  function frame(root, H) {
    clear(root);
    const W = Math.max(320, Math.round(root.getBoundingClientRect().width) || 680);
    root.setAttribute("viewBox", `0 0 ${W} ${H}`);
    root.setAttribute("font-family", FONT);
    return W;
  }
  function yAxis(root, ticks, pl, pr, W, y) {
    ticks.forEach((t) => {
      root.appendChild(svg("line", { x1: pl, x2: W - pr, y1: y(t), y2: y(t), stroke: GRID, "stroke-width": 1 }));
      root.appendChild(svgText(fmt(t), { x: pl - 10, y: y(t) + 4, "text-anchor": "end", "font-size": 11.5, fill: MUTED }));
    });
  }
  const trunc = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s);

  /* ---- barras verticales ---- */
  function drawBars(v, axisTitle) {
    const root = $("#mainChart"), H = 320;
    const W = frame(root, H), pl = 44, pr = 10, pt = 28, pb = 58;
    const items = v.items, max = Math.max(...items.map((i) => i.count), 1);
    const ticks = niceTicks(max), ymax = ticks[ticks.length - 1];
    const ih = H - pt - pb, iw = W - pl - pr;
    const y = (val) => pt + ih - (val / ymax) * ih;
    yAxis(root, ticks, pl, pr, W, y);
    const bw = iw / items.length, w = Math.min(64, bw * 0.62);
    const maxChars = Math.max(3, Math.floor(bw / 7.2));
    items.forEach((it, i) => {
      const cx = pl + bw * i + bw / 2, x = cx - w / 2, top = y(it.count), h = pt + ih - top;
      const r = Math.min(6, w / 2, h);
      const isMax = it.count === max;
      if (h > 0) {
        const d = `M ${x} ${pt + ih} V ${top + r} Q ${x} ${top} ${x + r} ${top} H ${x + w - r} Q ${x + w} ${top} ${x + w} ${top + r} V ${pt + ih} Z`;
        const p = svg("path", { d, fill: it.other ? OTHER : isMax ? BAR_MAX : BAR, class: "bar" });
        root.appendChild(p);
      }
      root.appendChild(svgText(fmt(it.count), { x: cx, y: top - 8, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: INK }));
      root.appendChild(svgText(trunc(it.label, maxChars), { x: cx, y: pt + ih + 20, "text-anchor": "middle", "font-size": 12, fill: MUTED }));
      const hit = svg("rect", { x: pl + bw * i, y: pt, width: bw, height: ih + 24, fill: "transparent" });
      bindTip(hit, it.label, `${fmt(it.count)} registros · ${fmt(pct(it.count, v.total), 1)} %`);
      root.appendChild(hit);
    });
    root.appendChild(svgText(axisTitle, { x: pl + iw / 2, y: H - 8, "text-anchor": "middle", "font-size": 12.5, fill: MUTED }));
  }

  /* ---- línea (tendencia) ---- */
  function drawLine(v) {
    const root = $("#mainChart"), H = 320;
    const W = frame(root, H), pl = 44, pr = 16, pt = 28, pb = 58;
    const items = v.items, max = Math.max(...items.map((i) => i.count), 1);
    const ticks = niceTicks(max), ymax = ticks[ticks.length - 1];
    const ih = H - pt - pb, iw = W - pl - pr;
    const y = (val) => pt + ih - (val / ymax) * ih;
    const inset = 18;
    const step = items.length > 1 ? (iw - inset * 2) / (items.length - 1) : 0;
    const x = (i) => (items.length > 1 ? pl + inset + step * i : pl + iw / 2);
    yAxis(root, ticks, pl, pr, W, y);

    const defs = svg("defs"), g = svg("linearGradient", { id: "areaGrad", x1: 0, y1: 0, x2: 0, y2: 1 });
    g.append(svg("stop", { offset: "0%", "stop-color": "#2e7d6f", "stop-opacity": 0.22 }), svg("stop", { offset: "100%", "stop-color": "#2e7d6f", "stop-opacity": 0 }));
    defs.appendChild(g); root.appendChild(defs);
    const pts = items.map((it, i) => `${x(i).toFixed(1)},${y(it.count).toFixed(1)}`);
    root.appendChild(svg("path", { d: `M ${x(0)} ${pt + ih} L ${pts.join(" L ")} L ${x(items.length - 1)} ${pt + ih} Z`, fill: "url(#areaGrad)" }));
    root.appendChild(svg("path", { d: `M ${pts.join(" L ")}`, fill: "none", stroke: BAR_MAX, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const every = Math.ceil(items.length / Math.max(1, Math.floor(iw / 60)));
    items.forEach((it, i) => {
      const isMax = it.count === max;
      root.appendChild(svg("circle", { cx: x(i), cy: y(it.count), r: isMax ? 6 : 4, fill: "#fff", stroke: BAR_MAX, "stroke-width": 2.5 }));
      if (isMax || i === 0 || i === items.length - 1) {
        root.appendChild(svgText(fmt(it.count), { x: x(i), y: y(it.count) - 12, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: INK }));
      }
      if (i % every === 0 || i === items.length - 1) {
        root.appendChild(svgText(it.label, { x: x(i), y: pt + ih + 20, "text-anchor": "middle", "font-size": 12, fill: MUTED }));
      }
      const hw = items.length > 1 ? step : iw;
      const hit = svg("rect", { x: x(i) - hw / 2, y: pt, width: hw, height: ih + 24, fill: "transparent" });
      bindTip(hit, it.label, `${fmt(it.count)} registros · ${fmt(pct(it.count, v.total), 1)} %`);
      root.appendChild(hit);
    });
    root.appendChild(svgText(v.granularity === "mensual" ? "Mes" : "Año", { x: pl + iw / 2, y: H - 8, "text-anchor": "middle", "font-size": 12.5, fill: MUTED }));
  }

  /* ---- gráfico lateral: dona o estadísticas ---- */
  const PREF = /nivel|riesgo|diagn|resultado|estado|categor|clasif|sexo|g[eé]nero/i;
  function companion(c, sel) {
    const cats = sel.filter((x) => x.view.kind === "cat" && x.key !== c.key && x.view.items.length <= 8);
    return cats.find((x) => PREF.test(x.name)) || cats[0] || (c.view.kind === "cat" ? c : null);
  }

  function drawSide(c, sel) {
    const card = $("#sideChartCard"), root = $("#donut"), legend = $("#legend");
    clear(root); clear(legend);
    card.querySelectorAll(".stats-grid").forEach((n) => n.remove());
    const comp = companion(c, sel);
    if (!comp) {
      root.parentElement.hidden = true;
      $("#sideTitle").textContent = c.view.kind === "num" ? `Resumen de ${lower1(c.name)}` : "Resumen";
      $("#sideSub").textContent = "Medidas descriptivas de la columna";
      const dl = el("dl", "stats-grid");
      const st = c.view.stats || {};
      const rows = c.view.kind === "num"
        ? [["Media", st.mean], ["Mediana", st.median], ["Mínimo", st.min], ["Máximo", st.max], ["Desv. est.", st.std], ["Registros", c.view.total]]
        : [["Registros", c.view.total], ["Periodos", c.view.items.length]];
      rows.forEach(([kk, vv]) => { const d = el("div"); d.append(el("dt", null, kk), el("dd", null, fmt(vv, 2))); dl.appendChild(d); });
      card.appendChild(dl);
      return;
    }
    root.parentElement.hidden = false;
    const v = comp.view;
    $("#sideTitle").textContent = comp === c ? `Participación · ${c.name}` : comp.name;
    $("#sideSub").textContent = "Participación sobre el total de registros";
    const cx = 100, cy = 100, R = 90, r = 62;
    let a0 = -Math.PI / 2;
    v.items.forEach((it, i) => {
      const frac = it.count / v.total, a1 = a0 + frac * Math.PI * 2;
      const color = it.other ? OTHER : v.ordinal ? SEQ[Math.round(i * (SEQ.length - 1) / Math.max(1, v.items.length - 1))] : CAT[i % CAT.length];
      const p = svg("path", { d: arc(cx, cy, R, r, a0, a1), fill: color, stroke: "#fff", "stroke-width": 2 });
      bindTip(p, it.label, `${fmt(it.count)} registros · ${fmt(frac * 100, 1)} %`);
      p.addEventListener("mouseenter", () => root.classList.add("dim"));
      p.addEventListener("mouseleave", () => root.classList.remove("dim"));
      root.appendChild(p);
      a0 = a1;
      const li = el("li"), sw = el("span", "sw");
      sw.style.background = color;
      li.append(sw, el("span", "lb", it.label), el("span", "vl", `${fmt(it.count)} · ${fmt(frac * 100)} %`));
      li.title = it.label;
      legend.appendChild(li);
    });
    root.appendChild(svgText(fmt(v.total), { x: cx, y: cy + 6, "text-anchor": "middle", "font-size": 30, "font-weight": 800, fill: INK, "font-family": FONT }));
    root.appendChild(svgText("registros", { x: cx, y: cy + 26, "text-anchor": "middle", "font-size": 12, fill: MUTED, "font-family": FONT }));
  }

  function arc(cx, cy, R, r, a0, a1) {
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
    return `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
  }

  /* ---------------- Exportar gráfico (PNG) ---------------- */
  $("#exportBtn").addEventListener("click", () => {
    const src = $("#mainChart");
    const vb = src.getAttribute("viewBox").split(" ").map(Number);
    const W = vb[2], H = vb[3], head = 70, pad = 24;
    const out = svg("svg", { xmlns: SVG_NS, width: W + pad * 2, height: H + head + pad, viewBox: `0 0 ${W + pad * 2} ${H + head + pad}`, "font-family": FONT });
    out.appendChild(svg("rect", { width: "100%", height: "100%", fill: "#ffffff" }));
    out.appendChild(svgText($("#viewTitle").textContent, { x: pad, y: 34, "font-size": 20, "font-weight": 700, fill: INK }));
    out.appendChild(svgText($("#mainSub").textContent, { x: pad, y: 56, "font-size": 13, fill: MUTED }));
    const g = svg("g", { transform: `translate(${pad} ${head})` });
    Array.from(src.childNodes).forEach((n) => { if (!(n.tagName === "rect" && n.getAttribute("fill") === "transparent")) g.appendChild(n.cloneNode(true)); });
    out.appendChild(g);
    const blob = new Blob([new XMLSerializer().serializeToString(out)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2, canvas = document.createElement("canvas");
      canvas.width = (W + pad * 2) * scale; canvas.height = (H + head + pad) * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) return toast("No se pudo exportar el gráfico.", true);
        const a = document.createElement("a");
        const slug = $("#viewTitle").textContent.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);
        a.href = URL.createObjectURL(png); a.download = `grafico-${slug || "dashboard"}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast("No se pudo exportar el gráfico.", true); };
    img.src = url;
  });

  /* ---------------- Mostrar / ocultar tabla ---------------- */
  const tBtn = $("#tableToggle"), tCard = $("#tableCard");
  tBtn.addEventListener("click", () => {
    const open = tCard.hidden;
    tCard.hidden = !open;
    tBtn.setAttribute("aria-expanded", String(open));
    tBtn.querySelector("span").textContent = open ? "Ocultar tabla" : "Mostrar tabla";
    if (open) tCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  /* ---------------- menú móvil / resize ---------------- */
  const sidebar = $("#sidebar"), menuBtn = $("#menuBtn");
  menuBtn.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  let rT;
  window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { if (state.step === 4) renderView(); }, 150); });

  go(1);
})();

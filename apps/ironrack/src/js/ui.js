/*
 * Ironrack — Piezas de interfaz compartidas: la hoja que sube desde abajo
 * (menús, confirmaciones, formularios), los avisos breves y el selector de
 * ejercicios. Las acciones de toda la app se declaran en IR.acc y se disparan
 * por delegación con data-a="nombre" (clic) y data-on="nombre" (teclear).
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const { esc } = IR.u;
  IR.acc = IR.acc || {};
  IR.vistas = IR.vistas || {};

  const $ = (s, r) => (r || document).querySelector(s);

  // ── Hoja inferior ──
  let alCerrar = null;
  function hoja(html, { onCerrar } = {}) {
    if (alCerrar) { const f = alCerrar; alCerrar = null; f(); }
    const h = $("#hoja");
    h.innerHTML = '<div class="hoja-asa"></div>' + html;
    $("#velo").hidden = false;
    h.hidden = false;
    requestAnimationFrame(() => { h.classList.add("abierta"); $("#velo").classList.add("abierto"); });
    alCerrar = onCerrar || null;
    return h;
  }
  function cerrarHoja() {
    const h = $("#hoja");
    h.classList.remove("abierta");
    $("#velo").classList.remove("abierto");
    setTimeout(() => { if (!h.classList.contains("abierta")) { h.hidden = true; $("#velo").hidden = true; h.innerHTML = ""; } }, 200);
    if (alCerrar) { const f = alCerrar; alCerrar = null; f(); }
  }

  function confirmar(texto, { detalle = "", si = "Aceptar", no = "Cancelar", peligro = false } = {}) {
    return new Promise((ok) => {
      let respondido = false;
      const fin = (v) => { if (!respondido) { respondido = true; ok(v); } };
      hoja(`<h3>${esc(texto)}</h3>${detalle ? `<p class="suave">${esc(detalle)}</p>` : ""}
        <div class="botones">
          <button class="btn" data-a="_no">${esc(no)}</button>
          <button class="btn ${peligro ? "peligro" : "primario"}" data-a="_si">${esc(si)}</button>
        </div>`, { onCerrar: () => fin(false) });
      IR.acc._si = () => { fin(true); cerrarHoja(); };
      IR.acc._no = () => cerrarHoja();
    });
  }

  // Menú de opciones: [{ texto, fn, peligro }]
  function menu(titulo, opciones) {
    hoja(`<h3>${esc(titulo)}</h3><div class="menu">${opciones.map((o, i) =>
      `<button class="opcion ${o.peligro ? "peligro" : ""}" data-a="_menu" data-i="${i}">${esc(o.texto)}</button>`).join("")}</div>`);
    IR.acc._menu = (el) => { cerrarHoja(); opciones[+el.dataset.i].fn(); };
  }

  let tAviso = null;
  // El mismo aviso que Solvento: arriba, con un punto del color que se pida
  // (el del acento si no se pide ninguno) y tres segundos.
  function aviso(texto, color) {
    const a = $("#aviso");
    a.textContent = texto;
    a.style.setProperty("--punto", color || "var(--acento)");
    a.hidden = false;
    a.classList.add("visible");
    clearTimeout(tAviso);
    tAviso = setTimeout(() => { a.classList.remove("visible"); setTimeout(() => { a.hidden = true; }, 250); }, 3000);
  }

  // ── Selector de ejercicios (uno o varios) ──
  function elegirEjercicios({ titulo = "Añadir ejercicios", multiple = true } = {}) {
    return new Promise((ok) => {
      const elegidos = [];
      let grupo = "", texto = "", hecho = false;
      const fin = (v) => { if (!hecho) { hecho = true; ok(v); } };

      const lista = () => {
        const xs = IR.bib.buscar(texto, grupo);
        if (!xs.length) return `<p class="vacio">Nada con «${esc(texto)}». Puedes crearlo en Ejercicios.</p>`;
        return xs.map((x) => {
          const n = elegidos.indexOf(x.id);
          return `<button class="fila-ej ${n >= 0 ? "elegido" : ""}" data-a="_elegir" data-id="${esc(x.id)}">
            <span><b>${esc(x.nombre)}</b><small>${esc(x.grupo)} · ${esc(x.equipo)}${x.propio ? " · propio" : ""}</small></span>
            <span class="marca-elegido">${n >= 0 ? (multiple ? n + 1 : "✓") : "+"}</span></button>`;
        }).join("");
      };
      const pie = () => multiple
        ? `<button class="btn primario ancho" data-a="_anadirElegidos" ${elegidos.length ? "" : "disabled"}>Añadir${elegidos.length ? " (" + elegidos.length + ")" : ""}</button>`
        : "";

      const h = hoja(`<h3>${esc(titulo)}</h3>
        <input class="buscador" type="search" placeholder="Buscar ejercicio" data-on="_buscarEj" autocomplete="off">
        <div class="chips desliza">${["", ...IR.bib.GRUPOS].map((g) =>
          `<button class="chip ${g === grupo ? "activo" : ""}" data-a="_grupoEj" data-g="${esc(g)}">${g || "Todos"}</button>`).join("")}</div>
        <div class="lista-ej">${lista()}</div>
        <div class="hoja-pie">${pie()}</div>`, { onCerrar: () => fin([]) });
      h.classList.add("alta");

      const repintar = () => { $(".lista-ej", h).innerHTML = lista(); $(".hoja-pie", h).innerHTML = pie(); };
      IR.acc._buscarEj = (el) => { texto = el.value; repintar(); };
      IR.acc._grupoEj = (el) => {
        grupo = el.dataset.g;
        h.querySelectorAll(".chip").forEach((c) => c.classList.toggle("activo", c.dataset.g === grupo));
        repintar();
      };
      IR.acc._elegir = (el) => {
        const id = el.dataset.id;
        if (!multiple) { fin([id]); cerrarHoja(); return; }
        const i = elegidos.indexOf(id);
        if (i >= 0) elegidos.splice(i, 1); else elegidos.push(id);
        repintar();
      };
      IR.acc._anadirElegidos = () => { fin(elegidos.slice()); cerrarHoja(); };
    });
  }

  // ── Formulario de ejercicio propio (crear o editar) ──
  function formEjercicio(ej) {
    return new Promise((ok) => {
      const opc = (lista, sel) => lista.map((x) => `<option ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("");
      let hecho = false;
      const fin = (v) => { if (!hecho) { hecho = true; ok(v); } };
      hoja(`<h3>${ej ? "Editar ejercicio" : "Nuevo ejercicio"}</h3>
        <form class="form" id="f-ej">
          <label>Nombre <input name="nombre" required maxlength="60" value="${esc(ej ? ej.nombre : "")}" autocomplete="off"></label>
          <label>Grupo muscular <select name="grupo">${opc(IR.bib.GRUPOS, ej ? ej.grupo : "Pecho")}</select></label>
          <label>Material <select name="equipo">${opc(IR.bib.EQUIPOS, ej ? ej.equipo : "Barra")}</select></label>
          <div class="botones">
            ${ej ? '<button type="button" class="btn peligro" data-a="_borrarEj">Borrar</button>' : '<button type="button" class="btn" data-a="_cancelarEj">Cancelar</button>'}
            <button class="btn primario">Guardar</button>
          </div>
        </form>`, { onCerrar: () => fin(null) });
      const f = $("#f-ej");
      if (!ej) setTimeout(() => f.nombre.focus(), 250);
      f.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const nombre = f.nombre.value.trim();
        if (!nombre) return;
        fin({ nombre, grupo: f.grupo.value, equipo: f.equipo.value });
        cerrarHoja();
      });
      IR.acc._cancelarEj = () => cerrarHoja();
      IR.acc._borrarEj = () => { fin({ borrar: true }); cerrarHoja(); };
    });
  }

  // ── Delegación de eventos ──
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-a]");
    if (!el || el.disabled) return;
    const fn = IR.acc[el.dataset.a];
    if (!fn) return;
    ev.preventDefault();
    fn(el, ev);
  });
  document.addEventListener("input", (ev) => {
    const el = ev.target.closest("[data-on]");
    if (el && IR.acc[el.dataset.on]) IR.acc[el.dataset.on](el, ev);
  });
  document.addEventListener("change", (ev) => {
    const el = ev.target.closest("[data-cambio]");
    if (el && IR.acc[el.dataset.cambio]) IR.acc[el.dataset.cambio](el, ev);
  });
  IR.acc._cerrarVelo = () => cerrarHoja();
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$("#hoja").hidden) cerrarHoja(); });

  // ── Gráfica de línea en SVG ──
  // El SVG se estira al ancho de la tarjeta, y con él sus textos: en pantalla
  // ancha se dibuja con más anchura interna para que los ejes no salgan enormes.
  const anchoGrafica = () => (window.innerWidth >= 700 ? 680 : 340);

  // puntos: [{ x: tiempo, y: valor }]
  function grafica(puntos, { unidad = "kg", alto = 180 } = {}) {
    if (!puntos.length) return '<p class="vacio">Sin datos todavía.</p>';
    const W = anchoGrafica(), H = W > 340 ? Math.round(alto * 1.25) : alto, izq = 38, der = 10, arr = 12, abj = 24;
    const xs = puntos.map((p) => p.x), ys = puntos.map((p) => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    if (x0 === x1) { x0 -= 86400000; x1 += 86400000; }
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const marg = (y1 - y0) * 0.15 || Math.max(1, y1 * 0.1);
    y0 = Math.max(0, y0 - marg); y1 += marg;
    const px = (x) => izq + ((x - x0) / (x1 - x0)) * (W - izq - der);
    const py = (y) => arr + (1 - (y - y0) / (y1 - y0)) * (H - arr - abj);
    const ticks = [0, 1, 2, 3].map((i) => y0 + ((y1 - y0) * i) / 3);
    const linea = puntos.map((p, i) => (i ? "L" : "M") + px(p.x).toFixed(1) + " " + py(p.y).toFixed(1)).join(" ");
    const area = linea + ` L${px(puntos[puntos.length - 1].x).toFixed(1)} ${H - abj} L${px(puntos[0].x).toFixed(1)} ${H - abj} Z`;
    const ult = puntos[puntos.length - 1];
    return `<svg class="grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución">
      ${ticks.map((t) => `<line x1="${izq}" x2="${W - der}" y1="${py(t).toFixed(1)}" y2="${py(t).toFixed(1)}" class="rejilla"/>
        <text x="${izq - 6}" y="${(py(t) + 3).toFixed(1)}" text-anchor="end" class="eje">${Math.round(t)}</text>`).join("")}
      <path d="${area}" class="area"/>
      <path d="${linea}" class="linea"/>
      ${puntos.length <= 40 ? puntos.map((p) => `<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="2.6" class="punto"/>`).join("") : ""}
      <circle cx="${px(ult.x).toFixed(1)}" cy="${py(ult.y).toFixed(1)}" r="4.5" class="punto ultimo"/>
      <text x="${izq}" y="${H - 6}" class="eje">${IR.u.corta(puntos[0].x)}</text>
      <text x="${W - der}" y="${H - 6}" text-anchor="end" class="eje">${IR.u.corta(ult.x)}</text>
      <text x="${W - der}" y="10" text-anchor="end" class="eje">${esc(unidad)}</text>
    </svg>`;
  }

  // Barras simples: [{ etiqueta, valor }]
  function barras(datos, { alto = 120 } = {}) {
    const W = anchoGrafica(), H = W > 340 ? Math.round(alto * 1.25) : alto, abj = 18, max = Math.max(1, ...datos.map((d) => d.valor));
    const ancho = (W - 4) / datos.length;
    return `<svg class="grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Entrenos por semana">
      ${datos.map((d, i) => {
        const h = ((H - abj - 14) * d.valor) / max;
        const x = 2 + i * ancho + ancho * 0.18, w = ancho * 0.64, y = H - abj - h;
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h, d.valor ? 2 : 0).toFixed(1)}" rx="3" class="barra ${i === datos.length - 1 ? "actual" : ""}"/>
          ${d.valor ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" class="eje">${d.valor}</text>` : ""}
          ${d.etiqueta ? `<text x="${(x + w / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="eje">${esc(d.etiqueta)}</text>` : ""}`;
      }).join("")}
    </svg>`;
  }

  IR.ui = { $, hoja, cerrarHoja, confirmar, menu, aviso, elegirEjercicios, formEjercicio, grafica, barras };
})();

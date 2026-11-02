/*
 * Solvento (asociaciones) — Las páginas de la contabilidad: Facturas, IVA,
 * Subvenciones y Cuentas del ejercicio, y el extracto del banco en Caja.
 *
 * Solo existen en una asociación (perfil «organizacion»): lo que antes llevaba
 * Agora y que desde TESORERIA.md lleva Solvento, que solo ve Tesorería. Los
 * cálculos están en contabilidad.js (y en facturas.js e iva.js, que vienen de
 * Agora); aquí solo se pintan y se rellenan, con las piezas de render.js y
 * forms.js para que se vean igual que el resto de Solvento.
 *
 * Las facturas van en céntimos, como en Agora (se traen tal cual); lo demás,
 * en euros, como todo Solvento.
 */
(function () {
  "use strict";
  const WA = window.WA, C = WA.Contabilidad, Fac = WA.Facturas, IVA = WA.IVA, D = WA.Dinero;
  const DB = window.SolventoDB;
  const R = () => window.SolventoRender.ui;
  const FU = () => window.SolventoForms.ui;
  const esOrg = () => !!(window.SolventoPerfil && window.SolventoPerfil.esOrganizacion());
  const docu = () => DB.state.doc || {};
  const cfgDe = (d) => { if (!d.config) d.config = {}; return d.config; };
  const lista = (d, k) => { if (!Array.isArray(d[k])) d[k] = []; return d[k]; };
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const eurC = (c) => D.formatear(c);
  const eurE = (e) => R().fmtEur(e);
  const fechaCorta = (iso) => (iso ? WA.Fechas.corta(iso) : "—");
  const guardar = () => (window.SolventoBoot && window.SolventoBoot.saveDoc ? window.SolventoBoot.saveDoc() : Promise.resolve());
  const aviso = (t, color) => { if (window.SolventoBoot && window.SolventoBoot.toast) window.SolventoBoot.toast(t, color); };
  const hoyISO = () => WA.Fechas.hoy();
  const titulo = (t) => `<div class="cont-titulo">${esc(t)}</div>`;
  const nota = (t) => `<div class="cont-nota">${t}</div>`;
  const boton = (texto, onclick, clase) => `<button type="button" class="cont-btn ${clase || ""}" onclick="${onclick}">${texto}</button>`;
  const segmentado = (opciones, actual, accion) => `<div class="cont-seg" role="tablist">${opciones.map(([v, t]) =>
    `<button type="button" role="tab" aria-selected="${v === actual}" onclick="${accion}('${v}')">${esc(t)}</button>`).join("")}</div>`;
  const insignia = (texto, tono) => `<span class="cont-insignia ${tono || ""}">${esc(texto)}</span>`;

  const VISTA = { tipoFactura: "emitida", anioIva: null, anioEj: null, sub: null };

  // ── Facturas ──────────────────────────────────────────────────────────────
  const ESTADO_FACTURA = {
    borrador: ["Borrador", "gris"], pendiente: ["Pendiente", "ambar"], parcial: ["Cobrada en parte", "ambar"],
    cobrada: ["Cobrada", "verde"], pagada: ["Pagada", "verde"], anulada: ["Anulada", "gris"],
  };
  const estadoTexto = (f, e) => {
    const x = ESTADO_FACTURA[e.estado] || [e.estado, ""];
    return f.tipo === "recibida" && e.estado === "parcial" ? ["Pagada en parte", "ambar"] : x;
  };

  function pageFacturas(d) {
    const fs = lista(d, "facturas"), movs = d.movimientos || [];
    const r = C.resumenFacturas(fs, movs);
    const tipo = VISTA.tipoFactura;
    const deTipo = fs.filter((f) => f.tipo === tipo)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.numero).localeCompare(String(a.numero)));
    const n = (t) => fs.filter((f) => f.tipo === t).length;
    const fila = (f) => {
      const t = Fac.totales(f), e = C.estadoPago(f, movs), [txt, tono] = estadoTexto(f, e);
      const numero = f.estado === "borrador" ? "Borrador" : f.numero || "Sin número";
      const quien = (f.tercero || {}).nombre || (tipo === "emitida" ? "Sin cliente" : "Sin proveedor");
      return `<tr class="table-row cont-clicable" onclick="v2Factura('${esc(f.id)}')" tabindex="0" onkeydown="if(event.key==='Enter')v2Factura('${esc(f.id)}')">
        <td style="text-align:left;"><div class="m-titulo"><div class="m-nombre" style="font-weight:600;color:var(--t0);">${esc(quien)}</div>
          <div class="m-sub" style="font-size:0.78rem;color:var(--t2);">${esc(numero)} · ${esc(fechaCorta(f.fecha))}${f.rectifica ? " · rectifica " + esc(f.rectifica.numero) : ""}</div></div></td>
        <td style="text-align:right;font-weight:600;color:var(--t0);white-space:nowrap;">${esc(eurC(t.total))}</td>
        <td class="m-mini" style="text-align:right;white-space:nowrap;">${insignia(txt, tono)}</td></tr>`;
    };
    return R().header("Facturas", eurC(r.porCobrar)) +
      `<div class="v2-wrap pagina-sub" style="margin-top:-1rem;">por cobrar de ${r.nPorCobrar} ${r.nPorCobrar === 1 ? "factura" : "facturas"}</div>` +
      `<div class="v2-hub-grid">
        ${R().hubCard("Por cobrar", eurC(r.porCobrar), null, R().GREEN, r.nPorCobrar + (r.nPorCobrar === 1 ? " factura emitida" : " facturas emitidas"))}
        ${R().hubCard("Por pagar", eurC(r.porPagar), null, "var(--ambar)", r.nPorPagar + (r.nPorPagar === 1 ? " factura recibida" : " facturas recibidas"))}
        ${R().hubCard("Borradores", String(r.borradores), null, "var(--t2)", r.borradores ? "sin emitir todavía" : "ninguno pendiente")}
      </div>
      <div class="v2-wrap"><div class="table-container">
        <div class="cont-cabecera">
          ${segmentado([["emitida", "Emitidas · " + n("emitida")], ["recibida", "Recibidas · " + n("recibida")]], tipo, "v2FacturasTipo")}
          <div class="cont-acciones">${boton("Datos del emisor", "v2DatosEmisor()", "solo-editor")}
            ${R().addBtn(tipo === "emitida" ? "＋ Factura emitida" : "＋ Factura recibida", `v2FacturaNueva('${tipo}')`)}</div>
        </div>
        ${deTipo.length ? `<table class="minimal-table m-lista"><tbody>${deTipo.map(fila).join("")}</tbody></table>`
          : nota(tipo === "emitida" ? "Aún no hay facturas emitidas. Las que hagas se numeran solas, por año." : "Aún no hay facturas recibidas: apunta aquí las de tus proveedores para llevar el IVA soportado y lo que queda por pagar.")}
      </div></div>` +
      `<div class="v2-wrap">${nota("Una factura no cuenta por sí misma en Ingresos y gastos: cuenta su cobro o su pago, que se apunta desde la propia factura. Requisitos de una factura y de las rectificativas: verificar con asesoría.")}</div>`;
  }

  window.v2FacturasTipo = (t) => { VISTA.tipoFactura = t; pintarPagina("facturas"); };
  window.v2FacturaNueva = (tipo) => editarFactura(C.facturaNueva(tipo, hoyISO()), true);
  window.v2Factura = (id) => {
    const f = lista(docu(), "facturas").find((x) => x.id === id);
    if (!f) return;
    if (f.tipo === "emitida" && f.estado !== "borrador") verFactura(f); else editarFactura(f, false);
  };

  const OPCIONES_IVA = [["sujeto|21", "21 %"], ["sujeto|10", "10 %"], ["sujeto|4", "4 %"], ["sujeto|0", "0 %"], ["exento|0", "Exento"], ["no_sujeto|0", "No sujeto"]];
  const lineaHtml = (l, i) => {
    const iva = (l.tratamiento || "sujeto") + "|" + (l.tratamiento === "sujeto" || !l.tratamiento ? Number(l.tipoIva) : 0);
    const precio = l.precio ? D.formatear(l.precio, { simbolo: false }) : "";
    return `<div class="fl-linea" data-i="${i}">
      <input class="fl-concepto" placeholder="Concepto" value="${esc(l.concepto)}" aria-label="Concepto de la línea ${i + 1}" style="${FU().styleInput}">
      <input class="fl-cantidad" inputmode="decimal" value="${esc(l.cantidad)}" aria-label="Cantidad" title="Cantidad" style="${FU().styleInput}">
      <input class="fl-precio" inputmode="decimal" placeholder="Precio €" value="${esc(precio)}" aria-label="Precio unitario (€)" style="${FU().styleInput}">
      <select class="fl-iva" aria-label="IVA" style="${FU().styleInput}">${OPCIONES_IVA.map(([v, t]) => `<option value="${v}" ${v === iva ? "selected" : ""}>${t}</option>`).join("")}</select>
      <button type="button" class="fl-quitar" aria-label="Quitar la línea ${i + 1}" title="Quitar">✕</button></div>`;
  };
  function leerLineas() {
    return [...document.querySelectorAll("#fl-lineas .fl-linea")].map((el) => {
      const [trat, tipo] = el.querySelector(".fl-iva").value.split("|");
      const cant = parseFloat(String(el.querySelector(".fl-cantidad").value).replace(",", "."));
      return { concepto: el.querySelector(".fl-concepto").value.trim(), cantidad: isFinite(cant) ? cant : 0,
        precio: D.desdeTexto(el.querySelector(".fl-precio").value) || 0, tratamiento: trat, tipoIva: +tipo };
    });
  }
  function leerFactura(base) {
    const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const f = Object.assign({}, base, {
      fecha: g("fl-fecha") || hoyISO(), vencimiento: g("fl-vence"),
      tercero: { nombre: g("fl-nombre"), nif: g("fl-nif"), direccion: g("fl-dir"), email: g("fl-email") },
      lineas: leerLineas().filter((l) => l.concepto || l.precio),
      retencionPct: parseFloat(g("fl-ret").replace(",", ".")) || 0,
      motivoExencion: g("fl-exencion"), categoria: g("fl-cat"), centro: g("fl-centro"), notas: g("fl-notas"),
    });
    if (base.tipo === "recibida") {
      f.numero = g("fl-numero");
      f.deducible = !!(document.getElementById("fl-deducible") || {}).checked;
    }
    if (base.rectifica) f.motivoRectificacion = g("fl-motivo");
    return f;
  }
  function totalesHtml(f) {
    const t = Fac.totales(f);
    const filaT = (a, b, fuerte) => `<div class="fl-tot${fuerte ? " fuerte" : ""}"><span>${a}</span><span>${b}</span></div>`;
    return filaT("Base imponible", esc(eurC(t.base))) +
      t.porTipo.filter((g) => g.tratamiento === "sujeto" && g.cuota).map((g) => filaT("IVA " + g.tipoIva + " %", esc(eurC(g.cuota)))).join("") +
      (t.baseExenta ? filaT("Base exenta", esc(eurC(t.baseExenta))) : "") +
      (t.retencion ? filaT("Retención IRPF " + f.retencionPct + " %", "−" + esc(eurC(t.retencion))) : "") +
      filaT("Total", esc(eurC(t.total)), true);
  }

  function editarFactura(f, nueva) {
    const ui = FU(), emitida = f.tipo === "emitida";
    const cats = emitida ? ui.categoriasIngresoCfg() : ui.categoriasCfg();
    const body =
      (f.rectifica ? `<div class="cont-aviso">Rectifica la factura <b>${esc(f.rectifica.numero)}</b> del ${esc(fechaCorta(f.rectifica.fecha))}.
          Va en su propia serie y con las líneas de la original en negativo: deja las que corrijas y añade las buenas si hay que volver a facturar.</div>` +
        ui.field("fl-motivo", "Qué se corrige y por qué", `<textarea id="fl-motivo" rows="2" style="${ui.styleInput}">${esc(f.motivoRectificacion)}</textarea>`) : "") +
      (emitida ? "" : ui.field("fl-numero", "Número de la factura del proveedor", ui.input("fl-numero", "text", f.numero))) +
      `<div class="fl-dos">${ui.field("fl-fecha", "Fecha", ui.input("fl-fecha", "date", f.fecha))}
        ${ui.field("fl-vence", "Vencimiento — opcional", ui.input("fl-vence", "date", f.vencimiento))}</div>` +
      `<div class="fl-dos">${ui.field("fl-nombre", emitida ? "Cliente" : "Proveedor", ui.input("fl-nombre", "text", (f.tercero || {}).nombre))}
        ${ui.field("fl-nif", "NIF", ui.input("fl-nif", "text", (f.tercero || {}).nif))}</div>` +
      ui.field("fl-dir", "Dirección — opcional", ui.input("fl-dir", "text", (f.tercero || {}).direccion)) +
      (emitida ? ui.field("fl-email", "Correo — opcional", ui.input("fl-email", "email", (f.tercero || {}).email)) : "") +
      `<div class="ff"><label style="${ui.styleLabel}">Líneas</label>
        <div class="fl-cab" aria-hidden="true"><span>Concepto</span><span>Cant.</span><span>Precio</span><span>IVA</span><span></span></div>
        <div id="fl-lineas">${(f.lineas || []).map(lineaHtml).join("")}</div>
        <button type="button" id="fl-anadir" class="cont-btn">＋ Línea</button></div>` +
      `<div class="fl-dos">${ui.field("fl-ret", "Retención IRPF (%) — opcional", ui.input("fl-ret", "number", f.retencionPct || "", 'step="0.01" min="0" max="50"'))}
        ${emitida ? "" : `<div class="ff"><label style="${ui.styleLabel}">IVA deducible</label><label class="cont-check"><input type="checkbox" id="fl-deducible" ${f.deducible !== false ? "checked" : ""}> Se deduce el IVA de esta factura</label></div>`}</div>` +
      (emitida ? `<div id="fl-exencion-caja">${ui.field("fl-exencion", "Motivo de la exención (el artículo de la ley)", ui.input("fl-exencion", "text", f.motivoExencion, 'placeholder="Art. 20.Uno.12.º de la Ley 37/1992"'))}</div>` : "") +
      ui.field("fl-cat", emitida ? "Categoría de ingreso (para su cobro)" : "Categoría de gasto (para su pago)", ui.selectorArbol("fl-cat", f.categoria)) +
      ui.field("fl-centro", "Centro de coste — opcional (una subvención, un proyecto)", ui.selectorArbol("fl-centro", f.centro)) +
      ui.field("fl-notas", "Notas — opcional", ui.input("fl-notas", "text", f.notas)) +
      `<div class="fl-totales" id="fl-totales">${totalesHtml(f)}</div>` +
      (emitida ? `<div class="cont-fila-botones"><button type="button" class="cont-btn" id="fl-borrador">Guardar borrador</button>
          ${nueva ? "" : `<button type="button" class="cont-btn peligro" id="fl-borrar">Borrar borrador</button>`}</div>`
        : (nueva ? "" : `<div class="cont-fila-botones"><button type="button" class="cont-btn peligro" id="fl-borrar">Borrar factura</button></div>`)) +
      (emitida ? nota("Al emitirla se le da su número (correlativo por año) y ya no se puede cambiar: para corregirla se hace una rectificativa.") : "");
    const titulo = emitida ? (f.rectifica ? "Rectificativa (borrador)" : nueva ? "Nueva factura emitida" : "Factura emitida (borrador)")
      : (nueva ? "Nueva factura recibida" : "Factura recibida");
    const d = docu();
    const abierta = ui.shell(titulo, body, () => {
      const x = leerFactura(f);
      if (emitida) {
        try { ui.upsert(lista(d, "facturas"), C.emitir(x, d.facturas, d.config)); } catch (e) { return e.message; }
      } else {
        const p = Fac.revisar(x);
        if (p.length) return p[0];
        ui.upsert(lista(d, "facturas"), x);
      }
      return null;
    }, () => aviso(emitida ? "Factura emitida" : "Factura guardada"), { ancha: true, boton: emitida ? "Emitir la factura" : "Guardar" });
    if (!abierta) return;
    ui.wireArbol("fl-cat", ui.uniq(cats), "— Sin categoría —");
    ui.wireArbol("fl-centro", ui.centrosCfg(), "— Ninguno —");
    const caja = document.getElementById("fl-lineas");
    const recalcular = () => {
      const x = leerFactura(f);
      document.getElementById("fl-totales").innerHTML = totalesHtml(x);
      const ex = document.getElementById("fl-exencion-caja");
      if (ex) ex.hidden = !x.lineas.some((l) => l.tratamiento === "exento");
    };
    caja.addEventListener("input", recalcular);
    caja.addEventListener("change", recalcular);
    document.getElementById("fl-ret").addEventListener("input", recalcular);
    caja.addEventListener("click", (ev) => {
      if (!ev.target.classList.contains("fl-quitar")) return;
      ev.target.closest(".fl-linea").remove();
      recalcular();
    });
    document.getElementById("fl-anadir").addEventListener("click", () => {
      caja.insertAdjacentHTML("beforeend", lineaHtml(Fac.lineaVacia(), caja.children.length));
      caja.lastElementChild.querySelector(".fl-concepto").focus();
    });
    recalcular();
    const bBorrador = document.getElementById("fl-borrador");
    if (bBorrador) bBorrador.addEventListener("click", async () => {
      ui.upsert(lista(d, "facturas"), Object.assign(leerFactura(f), { estado: "borrador" }));
      ui.close(); await guardar(); aviso("Borrador guardado");
    });
    const bBorrar = document.getElementById("fl-borrar");
    if (bBorrar) bBorrar.addEventListener("click", async () => {
      if (C.pagosDe(f, d.movimientos).length) { aviso("Tiene pagos apuntados: bórralos antes en Caja", "var(--rojo)"); return; }
      if (!window.confirm("¿Borrar esta factura?")) return;
      d.facturas = d.facturas.filter((x) => x.id !== f.id);
      ui.close(); await guardar(); aviso("Factura borrada");
    });
  }

  // Una factura emitida: ya no se toca. Se mira, se cobra, se imprime o se rectifica.
  function verFactura(f) {
    const ui = FU(), d = docu(), t = Fac.totales(f), e = C.estadoPago(f, d.movimientos);
    const [txt, tono] = estadoTexto(f, e);
    const pagos = C.pagosDe(f, d.movimientos);
    const rects = Fac.rectificativasDe(f, d.facturas);
    const body = `<div class="fv-cab">${insignia(txt, tono)} <span>${esc(fechaCorta(f.fecha))}</span>
        ${f.rectifica ? `<span>· rectifica ${esc(f.rectifica.numero)}</span>` : ""}</div>
      <div class="fv-quien"><b>${esc((f.tercero || {}).nombre)}</b>${(f.tercero || {}).nif ? " · " + esc(f.tercero.nif) : ""}</div>
      <table class="fv-lineas"><tbody>${(f.lineas || []).map((l) => `<tr><td>${esc(l.concepto)}</td>
        <td class="num">${esc(String(l.cantidad).replace(".", ","))} × ${esc(eurC(l.precio))}</td>
        <td class="num">${esc(eurC(Fac.baseLinea(l)))}</td></tr>`).join("")}</tbody></table>
      <div class="fl-totales">${totalesHtml(f)}</div>
      ${f.motivoRectificacion ? nota("Motivo: " + esc(f.motivoRectificacion)) : ""}
      <div class="fv-pagos">${titulo(f.tipo === "emitida" ? "Cobros" : "Pagos")}
        ${pagos.length ? pagos.map((m) => `<div class="fv-pago"><span>${esc(m.fecha)} · ${esc(m.cuenta_destino || m.cuenta_origen)}</span><b>${esc(eurE(Math.abs(C.euros(m.importe))))}</b></div>`).join("")
          : `<div class="cont-nota">Nada todavía.</div>`}
        ${e.pendiente > 0 ? `<div class="fv-pago"><span>Pendiente</span><b>${esc(eurC(e.pendiente))}</b></div>` : ""}</div>
      ${rects.length ? `<div class="fv-pagos">${titulo("Rectificativas")}${rects.map((r) =>
        `<div class="fv-pago"><button type="button" class="cont-enlace" onclick="v2Factura('${esc(r.id)}')">${esc(r.estado === "borrador" ? "Borrador" : r.numero)}</button><b>${esc(eurC(Fac.totales(r).total))}</b></div>`).join("")}</div>` : ""}
      <div class="cont-fila-botones">
        ${e.pendiente > 0 ? `<button type="button" class="cont-btn principal solo-editor" id="fv-cobrar">${f.tipo === "emitida" ? "Registrar cobro" : "Registrar pago"}</button>` : ""}
        <button type="button" class="cont-btn" id="fv-imprimir">Imprimir o PDF</button>
        ${f.tipo === "emitida" && !f.rectifica ? `<button type="button" class="cont-btn solo-editor" id="fv-rectificar">Rectificar</button>` : ""}
      </div>`;
    const abierta = ui.shell("Factura " + (f.numero || ""), body, () => null, null, { ancha: true, boton: false, leer: true });
    if (!abierta) return;
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener("click", fn); };
    on("fv-cobrar", () => { ui.close(); registrarPago(f); });
    on("fv-imprimir", () => imprimirFactura(f));
    on("fv-rectificar", () => { ui.close(); rectificar(f); });
  }

  function registrarPago(f) {
    const ui = FU(), d = docu(), e = C.estadoPago(f, d.movimientos);
    const cuentas = ui.CUENTAS();
    const body = ui.field("fp-cuenta", f.tipo === "emitida" ? "Cuenta donde entra" : "Cuenta de la que sale", ui.select("fp-cuenta", cuentas, cuentas[0])) +
      ui.field("fp-fecha", "Fecha", ui.input("fp-fecha", "date", hoyISO())) +
      ui.field("fp-importe", "Importe (€)", ui.input("fp-importe", "text", D.formatear(e.pendiente, { simbolo: false }), 'inputmode="decimal"')) +
      nota("Se apunta como " + (f.tipo === "emitida" ? "un ingreso" : "un gasto") + " en Caja, con la categoría y el centro de la factura, y queda enlazado a ella.");
    ui.shell(f.tipo === "emitida" ? "Registrar cobro" : "Registrar pago", body, () => {
      const importe = D.desdeTexto(ui.G("fp-importe"));
      if (!importe || importe <= 0) return "Escribe el importe";
      if (!ui.G("fp-cuenta")) return "Elige la cuenta";
      lista(d, "movimientos").push(C.movimientoDePago(f, { cuenta: ui.G("fp-cuenta"), fecha: ui.G("fp-fecha"), importe, movimientos: d.movimientos }));
      return null;
    }, () => aviso(f.tipo === "emitida" ? "Cobro apuntado" : "Pago apuntado"));
  }

  function rectificar(f) {
    const ui = FU();
    ui.shell("Rectificar la factura " + f.numero, ui.field("fr-motivo", "Qué se corrige y por qué", `<textarea id="fr-motivo" rows="3" style="${ui.styleInput}"></textarea>`) +
      nota("Se crea una rectificativa en borrador con las líneas de esta en negativo. La original no se toca."), () => {
      const motivo = ui.G("fr-motivo");
      if (!motivo) return "Di qué se corrige y por qué";
      const r = Object.assign(Fac.rectificativa(f, motivo, hoyISO()), { id: ui.newId("f"), categoria: f.categoria || "", centro: f.centro || "" });
      lista(docu(), "facturas").push(r);
      VISTA.rectAbrir = r.id;
      return null;
    }, () => { const id = VISTA.rectAbrir; VISTA.rectAbrir = null; if (id) setTimeout(() => window.v2Factura(id), 50); }, { boton: "Crear la rectificativa" });
  }

  // Imprimir (o guardar como PDF desde el diálogo de imprimir)
  function imprimir(html) {
    let caja = document.getElementById("impresion");
    if (!caja) { caja = document.createElement("div"); caja.id = "impresion"; document.body.appendChild(caja); }
    caja.innerHTML = html;
    document.body.classList.add("imprimiendo");
    const fin = () => { document.body.classList.remove("imprimiendo"); window.removeEventListener("afterprint", fin); };
    window.addEventListener("afterprint", fin);
    setTimeout(() => window.print(), 50);
  }
  function imprimirFactura(f) {
    const d = docu(), ent = cfgDe(d).entidad || {}, t = Fac.totales(f);
    const emitida = f.tipo === "emitida";
    const yo = `<b>${esc(ent.nombre || "")}</b><br>${ent.nif ? "NIF " + esc(ent.nif) + "<br>" : ""}${esc(ent.direccion || "").replace(/\n/g, "<br>")}${ent.email ? "<br>" + esc(ent.email) : ""}`;
    const otro = `<b>${esc((f.tercero || {}).nombre || "")}</b><br>${(f.tercero || {}).nif ? "NIF " + esc(f.tercero.nif) + "<br>" : ""}${esc((f.tercero || {}).direccion || "")}`;
    imprimir(`<div class="imp-factura">
      <div class="imp-cab"><div><div class="imp-titulo">${f.rectifica ? "Factura rectificativa" : "Factura"}</div>
        <div>Número <b>${esc(f.numero)}</b> · Fecha ${esc(fechaCorta(f.fecha))}${f.vencimiento ? " · Vence " + esc(fechaCorta(f.vencimiento)) : ""}</div>
        ${f.rectifica ? `<div>Rectifica la factura ${esc(f.rectifica.numero)} del ${esc(fechaCorta(f.rectifica.fecha))}. Motivo: ${esc(f.motivoRectificacion)}</div>` : ""}</div></div>
      <div class="imp-partes"><div><div class="imp-et">${emitida ? "Emisor" : "Proveedor"}</div>${emitida ? yo : otro}</div>
        <div><div class="imp-et">${emitida ? "Cliente" : "Destinatario"}</div>${emitida ? otro : yo}</div></div>
      <table class="imp-lineas"><thead><tr><th>Concepto</th><th>Cantidad</th><th>Precio</th><th>IVA</th><th>Importe</th></tr></thead><tbody>
        ${(f.lineas || []).map((l) => `<tr><td>${esc(l.concepto)}</td><td>${esc(String(l.cantidad).replace(".", ","))}</td><td>${esc(eurC(l.precio))}</td>
          <td>${l.tratamiento === "sujeto" ? l.tipoIva + " %" : l.tratamiento === "exento" ? "Exento" : "No sujeto"}</td><td>${esc(eurC(Fac.baseLinea(l)))}</td></tr>`).join("")}
      </tbody></table>
      <div class="imp-totales">${totalesHtml(f)}</div>
      ${t.baseExenta && f.motivoExencion ? `<p>Operación exenta: ${esc(f.motivoExencion)}</p>` : ""}
      ${emitida && ent.iban ? `<p>Pago por transferencia a ${esc(ent.iban)}</p>` : ""}
      ${f.notas ? `<p>${esc(f.notas)}</p>` : ""}${ent.pie ? `<p class="imp-pie">${esc(ent.pie)}</p>` : ""}
    </div>`);
  }

  window.v2DatosEmisor = () => {
    const ui = FU(), d = docu(), cfg = cfgDe(d), e = cfg.entidad || {}, fc = cfg.facturacion || {};
    ui.shell("Datos del emisor", ui.field("de-nombre", "Nombre de la asociación", ui.input("de-nombre", "text", e.nombre)) +
      ui.field("de-nif", "NIF", ui.input("de-nif", "text", e.nif)) +
      ui.field("de-dir", "Domicilio", `<textarea id="de-dir" rows="2" style="${ui.styleInput}">${esc(e.direccion)}</textarea>`) +
      ui.field("de-email", "Correo", ui.input("de-email", "email", e.email)) +
      ui.field("de-iban", "IBAN para los cobros — opcional", ui.input("de-iban", "text", e.iban)) +
      ui.field("de-serie", "Serie de las facturas — opcional", ui.input("de-serie", "text", fc.serie, 'placeholder="Sin serie: 2026-0001"')) +
      ui.field("de-pie", "Texto al pie de las facturas — opcional", ui.input("de-pie", "text", e.pie, 'placeholder="Inscrita en el Registro de Asociaciones con el n.º…"')) +
      nota("Salen en cada factura que se imprime. Menciones obligatorias de una factura: verificar con asesoría."), () => {
      cfg.entidad = { nombre: ui.G("de-nombre"), nif: ui.G("de-nif"), direccion: ui.G("de-dir"), email: ui.G("de-email"), iban: ui.G("de-iban"), pie: ui.G("de-pie") };
      cfg.facturacion = Object.assign({}, fc, { serie: ui.G("de-serie").toUpperCase() });
      return null;
    });
  };

  // ── IVA ───────────────────────────────────────────────────────────────────
  const SITUACION = { ingresar: ["A ingresar", "rojo"], cero: ["Sin cuota", "gris"], compensar: ["A compensar", "azul"], devolver: ["A devolver", "verde"] };
  function pageIva(d) {
    const fs = lista(d, "facturas"), cfg = cfgDe(d);
    const anios = Array.from(new Set(fs.filter((f) => f.fecha).map((f) => +String(f.fecha).slice(0, 4)).concat([new Date().getFullYear()]))).sort((a, b) => b - a);
    const anio = VISTA.anioIva || anios[0];
    const r = IVA.resumenAnual(fs, cfg, anio);
    const avisos = IVA.avisos(fs, cfg);
    const tarjeta = (t, i) => {
      const [txt, tono] = SITUACION[t.situacion] || ["", ""];
      const fila = (a, b) => `<div class="iva-fila"><span>${a}</span><span>${b}</span></div>`;
      const negativo4 = i === 3 && (t.situacion === "compensar" || t.situacion === "devolver");
      return `<div class="dashboard-panel iva-tri">
        <div class="iva-tri-cab"><span>${i + 1}.º trimestre</span>${insignia(txt, tono)}</div>
        <div class="iva-tri-res">${esc(eurC(t.resultado || 0))}</div>
        ${fila("IVA repercutido", esc(eurC(t.devengado)))}
        ${fila("IVA soportado deducible", (t.deducible ? "−" : "") + esc(eurC(t.deducible)))}
        ${t.compensacionAplicada ? fila("Compensado de antes", "−" + esc(eurC(t.compensacionAplicada))) : ""}
        ${t.quedaACompensar ? fila("Queda a compensar", esc(eurC(t.quedaACompensar))) : ""}
        ${t.retenciones ? fila("Retenciones IRPF (111)", esc(eurC(t.retenciones))) : ""}
        <div class="iva-fila suave"><span>${t.nEmitidas} emitidas · ${t.nRecibidas} recibidas</span></div>
        ${t.aviso ? `<div class="cont-nota">${esc(t.aviso)}</div>` : ""}
        ${negativo4 ? `<button type="button" class="cont-btn solo-editor" onclick="v2IvaDevolucion('${t.clave}')">${t.situacion === "devolver" ? "Dejarlo a compensar" : "Pedir la devolución"}</button>` : ""}
      </div>`;
    };
    const porTipo = (l) => l.length ? `<table class="minimal-table"><thead><tr><th style="text-align:left;">Tipo</th><th style="text-align:right;">Base</th><th style="text-align:right;">Cuota</th></tr></thead><tbody>
      ${l.map((g) => `<tr class="table-row"><td style="text-align:left;">${g.tipoIva} %</td><td style="text-align:right;">${esc(eurC(g.base))}</td><td style="text-align:right;font-weight:600;">${esc(eurC(g.cuota))}</td></tr>`).join("")}</tbody></table>` : nota("Nada en " + anio + ".");
    return R().header("IVA", String(anio)) +
      `<div class="v2-wrap cont-cabecera">${segmentado(anios.map((a) => [String(a), String(a)]), String(anio), "v2IvaAnio")}
        <div class="cont-acciones">${boton("Ajustes del IVA", "v2IvaAjustes()", "solo-editor")}</div></div>` +
      (avisos.length ? `<div class="v2-wrap">${avisos.map((a) => `<div class="cont-aviso">${esc(a)}</div>`).join("")}</div>` : "") +
      `<div class="v2-wrap"><div class="iva-trimestres">${r.trimestres.map(tarjeta).join("")}</div></div>` +
      `<div class="v2-wrap"><div class="table-container">${titulo("Resumen del año (390)")}
        <div class="iva-resumen">
          <div class="iva-fila"><span>IVA repercutido</span><span>${esc(eurC(r.devengado))}</span></div>
          <div class="iva-fila"><span>IVA soportado deducible</span><span>${esc(eurC(r.deducible))}</span></div>
          <div class="iva-fila"><span>Ingresado en el año</span><span>${esc(eurC(r.ingresado))}</span></div>
          <div class="iva-fila"><span>Queda a compensar</span><span>${esc(eurC(r.quedaACompensar))}</span></div>
          ${r.baseExenta ? `<div class="iva-fila"><span>Operaciones exentas (base)</span><span>${esc(eurC(r.baseExenta))}</span></div>` : ""}
          ${r.retenciones ? `<div class="iva-fila"><span>Retenciones IRPF practicadas</span><span>${esc(eurC(r.retenciones))}</span></div>` : ""}
        </div>
        ${titulo("Repercutido, por tipo")}${porTipo(r.devengadoPorTipo)}
        ${titulo("Soportado, por tipo")}${porTipo(r.soportadoPorTipo)}
      </div></div>` +
      `<div class="v2-wrap">${nota("Es una ayuda orientativa, no asesoramiento fiscal: suma lo que hay en las facturas (emitidas y recibidas deducibles) para rellenar el 303 de cada trimestre y el 390. Quien presenta los modelos debe revisarlo con la asesoría.")}</div>`;
  }
  window.v2IvaAnio = (a) => { VISTA.anioIva = +a; pintarPagina("iva"); };
  window.v2IvaDevolucion = async (clave) => {
    const cfg = cfgDe(docu()), iva = cfg.iva = Object.assign({}, cfg.iva);
    const l = (iva.devolucionesSolicitadas || []).slice(), i = l.indexOf(clave);
    if (i >= 0) l.splice(i, 1); else l.push(clave);
    iva.devolucionesSolicitadas = l;
    await guardar();
  };
  window.v2IvaAjustes = () => {
    const ui = FU(), cfg = cfgDe(docu()), iva = cfg.iva || {};
    ui.shell("Ajustes del IVA", ui.field("iv-prorrata", "Porcentaje de deducción, prorrata (%)", ui.input("iv-prorrata", "number", iva.prorrata == null ? 100 : iva.prorrata, 'min="0" max="100" step="1"')) +
      nota("Si la asociación hace a la vez operaciones exentas y sujetas, puede que no deduzca todo el IVA soportado. El porcentaje lo dice la asesoría; la app no lo calcula.") +
      ui.field("iv-saldo", "Quedaba a compensar de antes (€) — opcional", ui.input("iv-saldo", "text", iva.saldoACompensarInicial ? D.formatear(iva.saldoACompensarInicial, { simbolo: false }) : "", 'inputmode="decimal"')) +
      ui.field("iv-periodo", "…desde el trimestre", ui.input("iv-periodo", "text", iva.periodoSaldoInicial || "", 'placeholder="2026-T1"')), () => {
      const p = parseFloat(ui.G("iv-prorrata"));
      if (!(p >= 0 && p <= 100)) return "La prorrata va de 0 a 100";
      const periodo = ui.G("iv-periodo").toUpperCase();
      if (periodo && !/^\d{4}-T[1-4]$/.test(periodo)) return "El trimestre se escribe así: 2026-T1";
      cfg.iva = Object.assign({}, iva, { prorrata: p, saldoACompensarInicial: D.desdeTexto(ui.G("iv-saldo")) || 0, periodoSaldoInicial: periodo });
      return null;
    });
  };

  // ── Subvenciones y proyectos ──────────────────────────────────────────────
  const estadoSub = (s) => (C.ESTADOS_SUBVENCION.find((x) => x[0] === (s.estadoSubvencion || "idea")) || ["", ""])[1];
  function pageSubvenciones(d) {
    const subs = lista(d, "subvenciones"), movs = d.movimientos || [];
    const abierta = VISTA.sub && subs.find((s) => s.id === VISTA.sub);
    if (abierta) return fichaSubvencion(abierta, d);
    const enCurso = subs.filter((s) => s.estado !== "cerrado");
    const concedido = enCurso.reduce((t, s) => t + C.euros(s.importeConcedido), 0);
    const cobrado = enCurso.reduce((t, s) => t + C.ejecucion(s, movs).ingresos.realizado, 0);
    const plazos = enCurso.map((s) => C.proximoPlazo(s)).filter(Boolean);
    const fila = (s) => {
      const ej = C.ejecucion(s, movs), p = C.proximoPlazo(s);
      const pct = ej.gastos.previsto > 0 ? Math.round(ej.gastos.realizado / ej.gastos.previsto * 100) : null;
      return `<tr class="table-row cont-clicable" onclick="v2Subvencion('${esc(s.id)}')" tabindex="0" onkeydown="if(event.key==='Enter')v2Subvencion('${esc(s.id)}')">
        <td style="text-align:left;"><div class="m-titulo"><div class="m-nombre" style="font-weight:600;color:var(--t0);">${esc(s.nombre || "Sin nombre")}</div>
          <div class="m-sub" style="font-size:0.78rem;color:var(--t2);">${s.tipo === "subvencion" ? "Subvención · " + esc(estadoSub(s)) : "Proyecto"}${s.financiador ? " · " + esc(s.financiador) : ""}${s.estado === "cerrado" ? " · cerrado" : ""}</div>
          ${p ? `<div class="m-sub">${insignia(p.etiqueta + " " + fechaCorta(p.fecha), p.vencido ? "rojo" : "ambar")}</div>` : ""}</div></td>
        <td style="text-align:right;font-weight:600;color:var(--t0);white-space:nowrap;">${s.importeConcedido ? esc(eurE(C.euros(s.importeConcedido))) : "—"}</td>
        <td class="m-mini" style="text-align:right;color:var(--t2);white-space:nowrap;">${pct === null ? "sin presupuesto" : pct + " % gastado"}</td></tr>`;
    };
    return R().header("Subvenciones", eurE(concedido)) +
      `<div class="v2-wrap pagina-sub" style="margin-top:-1rem;">concedido en lo que está en curso</div>` +
      `<div class="v2-hub-grid">
        ${R().hubCard("Concedido", eurE(concedido), null, R().GREEN, enCurso.length + (enCurso.length === 1 ? " en curso" : " en curso"))}
        ${R().hubCard("Cobrado", eurE(cobrado), null, "var(--azul)", "pendiente " + eurE(Math.max(concedido - cobrado, 0)))}
        ${R().hubCard("Plazos", String(plazos.length), null, plazos.some((p) => p.vencido) ? R().RED : "var(--ambar)", plazos.length ? "solicitudes o justificaciones" : "nada pendiente")}
      </div>
      <div class="v2-wrap"><div class="table-container">
        <div class="cont-cabecera">${titulo("Subvenciones y proyectos")}
          <div class="cont-acciones">${R().addBtn("＋ Proyecto", "v2SubvencionNueva('proyecto')")}${R().addBtn("＋ Subvención", "v2SubvencionNueva('subvencion')")}</div></div>
        ${subs.length ? `<table class="minimal-table m-lista"><tbody>${subs.slice().sort((a, b) => (a.estado === "cerrado") - (b.estado === "cerrado") || String(b.fechaInicio).localeCompare(String(a.fechaInicio))).map(fila).join("")}</tbody></table>`
          : nota("Aún no hay ninguna. Cada una tiene su centro de coste: lo que se le impute al apuntar un gasto o un ingreso cuenta en su ejecución.")}
      </div></div>`;
  }

  function fichaSubvencion(s, d) {
    const ej = C.ejecucion(s, d.movimientos || []), p = C.proximoPlazo(s);
    const concedido = C.euros(s.importeConcedido);
    const req = s.requisitos || [];
    const dato = (a, b) => b ? `<div class="iva-fila"><span>${a}</span><span>${b}</span></div>` : "";
    const filaEj = (x) => `<tr class="table-row"><td style="text-align:left;"><div class="m-titulo"><div class="m-nombre" style="color:var(--t0);font-weight:600;">${esc(x.categoria)}</div>
        <div class="m-sub">${x.tipo === "ingreso" ? "ingreso" : "gasto"}${x.previsto ? " · previsto " + esc(eurE(x.previsto)) : ""}</div></div></td>
      <td style="text-align:right;font-weight:600;white-space:nowrap;">${esc(eurE(x.realizado))}</td>
      <td class="m-mini" style="text-align:right;white-space:nowrap;color:${x.pct > 100 && x.tipo === "gasto" ? "var(--rojo)" : "var(--t2)"};">${x.pct === null ? "—" : Math.round(x.pct) + " %"}</td></tr>`;
    return `<div class="v2-wrap" style="margin-top:1rem;"><button type="button" class="cont-enlace" onclick="v2Subvencion(null)">← Todas las subvenciones</button></div>` +
      R().header(s.nombre || "Sin nombre", concedido ? eurE(concedido) : (s.tipo === "subvencion" ? estadoSub(s) : "Proyecto")) +
      `<div class="v2-hub-grid">
        ${R().hubCard("Gastado", eurE(ej.gastos.realizado), ej.gastos.previsto ? ej.gastos.realizado / ej.gastos.previsto * 100 : null, "var(--ambar)",
          ej.gastos.previsto ? "de " + eurE(ej.gastos.previsto) + " previstos" : "sin presupuesto de gasto", null, null, null, "de lo previsto")}
        ${R().hubCard("Cobrado", eurE(ej.ingresos.realizado), null, R().GREEN, concedido ? "pendiente " + eurE(Math.max(concedido - ej.ingresos.realizado, 0)) : "lo imputado como ingreso")}
        ${p ? R().hubCard("Plazo", fechaCorta(p.fecha), null, p.vencido ? R().RED : "var(--ambar)", p.etiqueta.toLowerCase()) : ""}
      </div>
      <div class="v2-wrap"><div class="table-container">
        <div class="cont-cabecera">${titulo("Datos")}<div class="cont-acciones">${boton("Editar", `v2SubvencionEditar('${esc(s.id)}')`, "solo-editor")}</div></div>
        <div class="iva-resumen">
          ${dato("Tipo", s.tipo === "subvencion" ? "Subvención · " + esc(estadoSub(s)) : "Proyecto propio")}
          ${dato("Quién la financia", esc(s.financiador))}${dato("Convocatoria o referencia", esc(s.referencia))}
          ${dato("Centro de coste", esc(s.centro))}
          ${dato("Solicitado", s.importeSolicitado ? esc(eurE(C.euros(s.importeSolicitado))) : "")}
          ${dato("Fechas", esc(fechaCorta(s.fechaInicio)) + (s.fechaFin ? " – " + esc(fechaCorta(s.fechaFin)) : ""))}
          ${dato("Plazo de solicitud", s.plazoSolicitud ? esc(fechaCorta(s.plazoSolicitud)) : "")}${dato("Solicitada el", s.fechaSolicitud ? esc(fechaCorta(s.fechaSolicitud)) : "")}
          ${dato("Resolución", s.fechaResolucion ? esc(fechaCorta(s.fechaResolucion)) : "")}
          ${dato("Plazo de justificación", s.plazoJustificacion ? esc(fechaCorta(s.plazoJustificacion)) : "")}${dato("Justificada el", s.fechaJustificacion ? esc(fechaCorta(s.fechaJustificacion)) : "")}
          ${s.urlBases ? `<div class="iva-fila"><span>Bases</span><span><a href="${esc(s.urlBases)}" target="_blank" rel="noopener">Abrir</a></span></div>` : ""}
          ${s.notas ? nota(esc(s.notas)) : ""}
        </div>
      </div></div>
      <div class="v2-wrap"><div class="table-container">
        ${titulo("Documentación y requisitos" + (req.length ? " · " + req.filter((r) => r.hecho).length + " de " + req.length : ""))}
        ${req.map((r) => `<label class="cont-check sub-req"><input type="checkbox" ${r.hecho ? "checked" : ""} onchange="v2SubRequisito('${esc(s.id)}','${esc(r.id)}',this.checked)"> ${esc(r.texto)}
          <button type="button" class="cont-enlace solo-editor" onclick="v2SubRequisitoQuitar('${esc(s.id)}','${esc(r.id)}')" aria-label="Quitar">Quitar</button></label>`).join("") || nota("Nada apuntado.")}
        <div class="sub-req-nuevo solo-editor"><input id="sub-req-nuevo" placeholder="Memoria técnica, certificado de estar al corriente…" style="${FU().styleInput}">
          ${boton("Añadir", `v2SubRequisitoAnadir('${esc(s.id)}')`)}</div>
      </div></div>
      <div class="v2-wrap"><div class="table-container">
        <div class="cont-cabecera">${titulo("Presupuesto y ejecución")}<div class="cont-acciones">${boton("Editar presupuesto", `v2SubvencionPresupuesto('${esc(s.id)}')`, "solo-editor")}</div></div>
        ${ej.filas.length ? `<table class="minimal-table m-lista"><tbody>${ej.filas.map(filaEj).join("")}</tbody></table>`
          : nota(s.centro ? "Nada imputado todavía a «" + esc(s.centro) + "», ni presupuesto." : "Ponle un centro de coste (Editar) para que cuente lo que se le impute.")}
        ${nota("Lo realizado es lo apuntado con el centro de coste «" + esc(s.centro || "—") + "» (o uno de dentro). Qué gastos son justificables lo dicen las bases de cada subvención.")}
      </div></div>
      <div class="v2-wrap"><div class="table-container">${titulo("Movimientos imputados")}
        ${ej.movimientos.length ? `<table class="minimal-table m-lista m-movs"><tbody>${ej.movimientos.slice()
          .sort((a, b) => C.aISO(b.fecha).localeCompare(C.aISO(a.fecha))).map((m) => `<tr class="table-row"><td class="m-cab" style="text-align:left;">
            <span class="m-nombre">${esc(m.detalle || (m.tipo === "Ingreso" ? m.tipo_ingreso : m.tipo_gasto) || "—")}</span>
            <div class="m-sub" style="font-size:0.78rem;color:var(--t2);">${esc(m.fecha)} · ${esc((m.tipo === "Ingreso" ? m.tipo_ingreso : m.tipo_gasto) || "sin categoría")}</div></td>
            <td style="text-align:right;font-weight:600;white-space:nowrap;color:${m.tipo === "Ingreso" ? "var(--verde)" : "var(--rojo)"};">${m.tipo === "Ingreso" ? "+" : "−"}${esc(eurE(Math.abs(C.euros(m.importe))))}</td></tr>`).join("")}</tbody></table>`
          : nota("Ninguno todavía.")}
      </div></div>
      <div class="v2-wrap" style="padding-bottom:2rem;">${boton("Borrar " + (s.tipo === "subvencion" ? "la subvención" : "el proyecto"), `v2SubvencionBorrar('${esc(s.id)}')`, "peligro solo-editor")}</div>`;
  }

  window.v2Subvencion = (id) => { VISTA.sub = id; pintarPagina("subvenciones"); window.scrollTo(0, 0); };
  window.v2SubvencionNueva = (tipo) => editarSubvencion(Object.assign(C.subvencionNueva(hoyISO()), { tipo }), true);
  window.v2SubvencionEditar = (id) => { const s = lista(docu(), "subvenciones").find((x) => x.id === id); if (s) editarSubvencion(s, false); };
  function editarSubvencion(s, nueva) {
    const ui = FU(), d = docu();
    const sub = s.tipo === "subvencion";
    const body = ui.field("sv-nombre", "Nombre", ui.input("sv-nombre", "text", s.nombre, 'placeholder="Huerto escolar 2026"')) +
      ui.field("sv-tipo", "Tipo", ui.selectKV("sv-tipo", [["subvencion", "Subvención"], ["proyecto", "Proyecto propio"]], s.tipo)) +
      `<div class="fl-dos">${ui.field("sv-financiador", "Quién la financia", ui.input("sv-financiador", "text", s.financiador))}
        ${ui.field("sv-ref", "Convocatoria o referencia", ui.input("sv-ref", "text", s.referencia))}</div>` +
      ui.field("sv-centro", "Centro de coste (lo que se le imputa cuenta aquí)", ui.selectorArbol("sv-centro", s.centro)) +
      nota("Si lo dejas vacío, se crea uno con su nombre: «" + (sub ? "Subvenciones" : "Proyectos") + " > nombre».") +
      `<div class="fl-dos">${ui.field("sv-solicitado", "Solicitado (€)", ui.input("sv-solicitado", "text", s.importeSolicitado ? String(s.importeSolicitado).replace(".", ",") : "", 'inputmode="decimal"'))}
        ${ui.field("sv-concedido", "Concedido (€)", ui.input("sv-concedido", "text", s.importeConcedido ? String(s.importeConcedido).replace(".", ",") : "", 'inputmode="decimal"'))}</div>` +
      `<div class="fl-dos">${ui.field("sv-inicio", "Empieza", ui.input("sv-inicio", "date", s.fechaInicio))}${ui.field("sv-fin", "Termina", ui.input("sv-fin", "date", s.fechaFin))}</div>` +
      `<div class="fl-dos">${ui.field("sv-estado", "Estado", ui.selectKV("sv-estado", [["en curso", "En curso"], ["cerrado", "Cerrado"]], s.estado))}
        ${ui.field("sv-estsub", "Situación de la subvención", ui.selectKV("sv-estsub", C.ESTADOS_SUBVENCION, s.estadoSubvencion || "idea"))}</div>` +
      `<div class="fl-dos">${ui.field("sv-psol", "Fin del plazo de solicitud", ui.input("sv-psol", "date", s.plazoSolicitud))}${ui.field("sv-fsol", "Se solicitó el", ui.input("sv-fsol", "date", s.fechaSolicitud))}</div>` +
      `<div class="fl-dos">${ui.field("sv-fres", "Resolución", ui.input("sv-fres", "date", s.fechaResolucion))}${ui.field("sv-pjus", "Fin del plazo de justificación", ui.input("sv-pjus", "date", s.plazoJustificacion))}</div>` +
      ui.field("sv-fjus", "Se justificó el", ui.input("sv-fjus", "date", s.fechaJustificacion)) +
      ui.field("sv-url", "Enlace a las bases — opcional", ui.input("sv-url", "url", s.urlBases)) +
      ui.field("sv-notas", "Notas — opcional", ui.input("sv-notas", "text", s.notas));
    const abierta = ui.shell(nueva ? (sub ? "Nueva subvención" : "Nuevo proyecto") : "Editar " + (s.nombre || ""), body, () => {
      const nombre = ui.G("sv-nombre");
      if (!nombre) return "Ponle un nombre";
      const tipo = ui.G("sv-tipo");
      let centro = ui.G("sv-centro") || (tipo === "subvencion" ? "Subvenciones" : "Proyectos") + " > " + nombre;
      const cfg = cfgDe(d);
      ui.centrosCfg();
      ui.registrarRuta(cfg.centros, centro);
      const num = (id) => (D.desdeTexto(ui.G(id)) || 0) / 100;
      ui.upsert(lista(d, "subvenciones"), Object.assign({}, s, {
        nombre, tipo, financiador: ui.G("sv-financiador"), referencia: ui.G("sv-ref"), centro,
        importeSolicitado: num("sv-solicitado"), importeConcedido: num("sv-concedido"),
        fechaInicio: ui.G("sv-inicio"), fechaFin: ui.G("sv-fin"), estado: ui.G("sv-estado"), estadoSubvencion: ui.G("sv-estsub"),
        plazoSolicitud: ui.G("sv-psol"), fechaSolicitud: ui.G("sv-fsol"), fechaResolucion: ui.G("sv-fres"),
        plazoJustificacion: ui.G("sv-pjus"), fechaJustificacion: ui.G("sv-fjus"), urlBases: ui.G("sv-url"), notas: ui.G("sv-notas"),
      }));
      VISTA.sub = s.id;
      return null;
    }, null, { ancha: true });
    if (abierta) ui.wireArbol("sv-centro", ui.centrosCfg(), "— Uno nuevo con su nombre —");
  }
  const conSub = async (id, fn) => { const s = lista(docu(), "subvenciones").find((x) => x.id === id); if (!s) return; fn(s); await guardar(); };
  window.v2SubRequisito = (id, rid, hecho) => conSub(id, (s) => { (s.requisitos || []).forEach((r) => { if (r.id === rid) r.hecho = hecho; }); });
  window.v2SubRequisitoQuitar = (id, rid) => conSub(id, (s) => { s.requisitos = (s.requisitos || []).filter((r) => r.id !== rid); });
  window.v2SubRequisitoAnadir = (id) => {
    const t = (document.getElementById("sub-req-nuevo") || {}).value || "";
    if (!t.trim()) return;
    conSub(id, (s) => { s.requisitos = (s.requisitos || []).concat([{ id: FU().newId("r"), texto: t.trim(), hecho: false }]); });
  };
  window.v2SubvencionBorrar = async (id) => {
    if (!window.confirm("¿Borrar? Los movimientos imputados a su centro de coste no se tocan.")) return;
    const d = docu();
    d.subvenciones = (d.subvenciones || []).filter((s) => s.id !== id);
    VISTA.sub = null;
    await guardar();
  };
  window.v2SubvencionPresupuesto = (id) => {
    const ui = FU(), d = docu(), s = lista(d, "subvenciones").find((x) => x.id === id);
    if (!s) return;
    const raiz = (r) => String(r || "").split(">")[0].trim();
    const pres = s.presupuesto || {};
    const deTipo = (tipo, cats) => ui.uniq(cats.map(raiz).concat(Object.keys(pres).filter((k) => k.indexOf(tipo + "|") === 0).map((k) => k.slice(tipo.length + 1))));
    const gastos = deTipo("gasto", ui.categoriasCfg()), ingresos = deTipo("ingreso", ui.categoriasIngresoCfg());
    const campo = (tipo, c, i) => `<div class="sp-fila"><label for="sp-${tipo}-${i}">${esc(c)}</label>
      <input id="sp-${tipo}-${i}" data-clave="${esc(tipo + "|" + c)}" class="sp-imp" inputmode="decimal" value="${pres[tipo + "|" + c] ? esc(String(pres[tipo + "|" + c]).replace(".", ",")) : ""}" placeholder="0" style="${ui.styleInput}"></div>`;
    ui.shell("Presupuesto · " + s.nombre, titulo("Gastos previstos") + gastos.map((c, i) => campo("gasto", c, i)).join("") +
      titulo("Ingresos previstos") + ingresos.map((c, i) => campo("ingreso", c, i)).join("") +
      nota("Por categoría (las de primer nivel). Lo que se deje vacío no lleva presupuesto."), () => {
      const nuevo = {};
      document.querySelectorAll(".sp-imp").forEach((el) => {
        const v = (D.desdeTexto(el.value) || 0) / 100;
        if (v) nuevo[el.dataset.clave] = v;
      });
      s.presupuesto = nuevo;
      return null;
    }, null, { ancha: true });
  };

  // ── Cuentas del ejercicio ─────────────────────────────────────────────────
  function saldoTotalHasta(d, hastaISO) {
    const M = window.SolventoModel;
    const antes = (l) => (l || []).filter((x) => C.aISO(x.fecha) <= hastaISO);
    // La caja entera a esa fecha, como la cuenta la página de Caja
    return M.computeSaldos(antes(d.movimientos), antes(d.inversiones)).patrimonioLiquido || 0;
  }
  function datosEjercicio(d) {
    const anios = Array.from(new Set(C.aniosConMovimientos(d.movimientos).concat([new Date().getFullYear()]))).sort((a, b) => b - a);
    const anio = VISTA.anioEj || anios[0];
    const c = C.cuentasEjercicio(d.movimientos, anio, cfgDe(d));
    const inicio = saldoTotalHasta(d, (anio - 1) + "-12-31"), fin = saldoTotalHasta(d, anio + "-12-31");
    return { anios, anio, c, inicio, fin };
  }
  function tablaResultados(c) {
    const bloque = (nombre, partidas, total) => `<tr class="ej-grupo"><td>${nombre}</td><td class="num">${esc(eurE(total))}</td></tr>` +
      partidas.map((p) => `<tr class="ej-partida"><td>${esc(p.texto)}</td><td class="num">${esc(eurE(p.total))}</td></tr>` +
        p.categorias.map((x) => `<tr class="ej-cat"><td>${esc(x.nombre)}</td><td class="num">${esc(eurE(x.total))}</td></tr>`).join("")).join("");
    return `<table class="ej-tabla"><tbody>${bloque("Ingresos", c.ingresos, c.totalIngresos)}${bloque("Gastos", c.gastos, c.totalGastos)}
      <tr class="ej-total"><td>Resultado del ejercicio (excedente)</td><td class="num">${esc((c.resultado >= 0 ? "" : "−") + eurE(Math.abs(c.resultado)))}</td></tr></tbody></table>`;
  }
  function pageEjercicio(d) {
    const x = datosEjercicio(d), c = x.c;
    return R().header("Cuentas del ejercicio", String(x.anio)) +
      `<div class="v2-wrap cont-cabecera">${segmentado(x.anios.map((a) => [String(a), String(a)]), String(x.anio), "v2EjAnio")}
        <div class="cont-acciones">${boton("Cambiar partidas", "v2EjPartidas()", "solo-editor")}${boton("Imprimir o PDF", "v2EjImprimir()")}</div></div>` +
      `<div class="v2-hub-grid">
        ${R().hubCard("Ingresos", eurE(c.totalIngresos), null, R().GREEN, c.ingresos.length + (c.ingresos.length === 1 ? " partida" : " partidas"))}
        ${R().hubCard("Gastos", eurE(c.totalGastos), null, R().RED, c.gastos.length + (c.gastos.length === 1 ? " partida" : " partidas"))}
        ${R().hubCard("Resultado", (c.resultado >= 0 ? "+" : "−") + eurE(Math.abs(c.resultado)), null, R().rc(c.resultado), c.resultado >= 0 ? "excedente" : "déficit")}
      </div>
      <div class="v2-wrap"><div class="table-container">${titulo("Cuenta de resultados")}${tablaResultados(c)}</div></div>
      <div class="v2-wrap"><div class="table-container">${titulo("Tesorería")}<div class="iva-resumen">
        <div class="iva-fila"><span>Saldo a 1 de enero</span><span>${esc(eurE(x.inicio))}</span></div>
        <div class="iva-fila"><span>Saldo a 31 de diciembre</span><span>${esc(eurE(x.fin))}</span></div>
        <div class="iva-fila suave"><span>Variación</span><span>${esc((x.fin - x.inicio >= 0 ? "+" : "−") + eurE(Math.abs(x.fin - x.inicio)))}</span></div></div>
      </div></div>
      <div class="v2-wrap">${nota("Por criterio de caja: cuenta el dinero cuando entra o sale, con el IVA incluido. Sirve para informar a la asamblea; las cuentas anuales formales de una entidad sin fines lucrativos llevan otro criterio. Las partidas son las del modelo abreviado, como aproximación: qué partida le toca a cada categoría, verificar con asesoría.")}</div>`;
  }
  window.v2EjAnio = (a) => { VISTA.anioEj = +a; pintarPagina("ejercicio"); };
  window.v2EjImprimir = () => {
    const d = docu(), x = datosEjercicio(d), ent = cfgDe(d).entidad || {};
    imprimir(`<div class="imp-factura"><div class="imp-titulo">Cuentas del ejercicio ${x.anio}</div>
      <div>${esc(ent.nombre || "")}${ent.nif ? " · NIF " + esc(ent.nif) : ""}</div>
      ${tablaResultados(x.c)}
      <table class="ej-tabla"><tbody><tr class="ej-grupo"><td>Tesorería</td><td></td></tr>
        <tr class="ej-partida"><td>Saldo a 1 de enero</td><td class="num">${esc(eurE(x.inicio))}</td></tr>
        <tr class="ej-partida"><td>Saldo a 31 de diciembre</td><td class="num">${esc(eurE(x.fin))}</td></tr></tbody></table>
      <p class="imp-pie">Por criterio de caja. Informe para la asamblea, no las cuentas anuales oficiales.</p></div>`);
  };
  window.v2EjPartidas = () => {
    const ui = FU(), d = docu(), cfg = cfgDe(d), x = datosEjercicio(d);
    const filas = [];
    ["ingreso", "gasto"].forEach((tipo) => (tipo === "ingreso" ? x.c.ingresos : x.c.gastos).forEach((p) => p.categorias.forEach((c) => filas.push({ tipo, nombre: c.nombre }))));
    const opciones = (tipo) => C.PARTIDAS.filter((p) => p.tipo === tipo).map((p) => [p.id, p.texto]);
    ui.shell("Partidas de " + x.anio, filas.map((f, i) => ui.field("ep-" + i, (f.tipo === "ingreso" ? "Ingreso · " : "Gasto · ") + f.nombre,
      ui.selectKV("ep-" + i, opciones(f.tipo), C.partidaDe(f.nombre, f.tipo, cfg)))).join("") +
      nota("Cada categoría (de primer nivel) en su partida del modelo abreviado. Se recuerda para los otros años."), () => {
      const mapa = Object.assign({}, cfg.partidasEjercicio);
      filas.forEach((f, i) => { mapa[f.tipo + "|" + f.nombre] = ui.G("ep-" + i); });
      cfg.partidasEjercicio = mapa;
      return null;
    }, null, { ancha: true });
  };

  // ── El extracto del banco (en Caja, para cualquiera) ──────────────────────
  window.v2ImportarExtracto = () => {
    const sel = document.createElement("input");
    sel.type = "file";
    sel.accept = ".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    sel.addEventListener("change", async () => {
      const archivo = sel.files && sel.files[0];
      if (!archivo) return;
      let filas;
      try {
        const bytes = new Uint8Array(await archivo.arrayBuffer());
        if (/\.xlsx$/i.test(archivo.name)) {
          const hojas = await WA.XLSX.leer(bytes);
          filas = hojas[Object.keys(hojas)[0]] || [];
        } else {
          let texto = new TextDecoder("utf-8").decode(bytes);
          // Algunos bancos exportan en Latin-1: si sale el carácter de reemplazo, se relee así
          if (texto.indexOf("�") >= 0) texto = new TextDecoder("windows-1252").decode(bytes);
          const l = WA.CSV.leer(texto);
          filas = [l.cabecera].concat(l.filas);
        }
      } catch (e) { aviso("No se ha podido leer: " + e.message, "var(--rojo)"); return; }
      abrirExtracto(archivo.name, filas);
    });
    sel.click();
  };
  function abrirExtracto(nombre, filas) {
    const ui = FU(), d = docu();
    const det = WA.Extracto.detectarColumnas(filas) || { fila: 0, columnas: {} };
    const cab = filas[det.fila] || [];
    const opcCol = [["", "—"]].concat(cab.map((t, i) => [String(i), String(t || "Columna " + (i + 1))]));
    const campos = [["fecha", "Fecha"], ["concepto", "Concepto"], ["importe", "Importe (con signo)"], ["cargo", "Cargos (salidas)"], ["abono", "Abonos (entradas)"]];
    const cuentas = ui.CUENTAS();
    let resultado = null;
    const body = nota("«" + esc(nombre) + "»: " + Math.max(filas.length - det.fila - 1, 0) + " filas.") +
      ui.field("ex-cuenta", "¿De qué cuenta es?", ui.select("ex-cuenta", cuentas, cuentas[0])) +
      ui.field("ex-fila", "Fila de los títulos", ui.input("ex-fila", "number", det.fila + 1, 'min="1"')) +
      `<div class="fl-dos">${campos.map(([k, t]) => ui.field("ex-" + k, t, ui.selectKV("ex-" + k, opcCol, det.columnas[k] === undefined ? "" : String(det.columnas[k])))).join("")}</div>` +
      `<div id="ex-previa" aria-live="polite"></div>` +
      nota("Lo que ya estaba (misma cuenta, fecha, importe y concepto) se salta. La categoría la aprende de lo que ya tienes apuntado con el mismo concepto; lo demás entra sin categoría, para clasificarlo después.");
    const abierta = ui.shell("Importar extracto", body, () => {
      if (!resultado || !resultado.nuevos.length) return "No hay movimientos nuevos: revisa qué columna es cada cosa";
      lista(d, "movimientos").push(...resultado.nuevos);
      VISTA.importados = resultado.nuevos.length;
      return null;
    }, () => { aviso(VISTA.importados + " movimientos importados"); VISTA.importados = 0; }, { ancha: true, boton: "Importar" });
    if (!abierta) return;
    const calcular = () => {
      const cols = {};
      campos.forEach(([k]) => { const v = ui.G("ex-" + k); if (v !== "") cols[k] = +v; });
      resultado = C.importarExtracto({ filas, filaCabecera: (+ui.G("ex-fila") || 1) - 1, columnas: cols, cuenta: ui.G("ex-cuenta"), movimientos: d.movimientos });
      document.getElementById("ex-previa").innerHTML = `<div class="ex-resumen"><b>${resultado.nuevos.length} nuevos</b> · ${resultado.duplicados} ya estaban · ${resultado.problemas.length} con problemas</div>` +
        resultado.nuevos.slice(0, 5).map((m) => `<div class="fv-pago"><span>${esc(m.fecha)} · ${esc(m.detalle)}</span><b style="color:${m.tipo === "Ingreso" ? "var(--verde)" : "var(--rojo)"};">${m.tipo === "Ingreso" ? "+" : "−"}${esc(eurE(C.euros(m.importe)))}</b></div>`).join("") +
        (resultado.nuevos.length > 5 ? nota("…y " + (resultado.nuevos.length - 5) + " más.") : "") +
        (resultado.problemas.length ? nota(esc(resultado.problemas.slice(0, 3).map((p) => "Fila " + p.fila + ": " + p.mensaje).join(" · "))) : "");
    };
    document.getElementById("ff-form").addEventListener("change", calcular);
    calcular();
  }

  // ── Lo que viene de Agora (TESORERIA.md, fase 3) ──────────────────────────
  // Agora prepara el paquete con su dinero y SweetSuite lo deja aquí, en
  // memoria. Se enseña qué hay, se trae al aceptar y se le dice a Agora.
  function traerDeAgora(paquete) {
    if (!esOrg() || !paquete) return;
    const ui = FU(), d = docu();
    let previa;
    try { previa = C.traerDeAgora(JSON.parse(JSON.stringify(d)), paquete); }
    catch (e) { aviso(e.message, "var(--rojo)"); return; }
    const linea = (n, uno, varios) => n ? `<div class="fv-pago"><span>${n === 1 ? uno : varios}</span><b>${n}</b></div>` : "";
    const nada = !previa.movimientos && !previa.facturas && !previa.subvenciones;
    const body = `<div class="cont-nota" style="margin-top:0;">El dinero que llevaba Agora, preparado el ${esc(fechaCorta(paquete.fecha))}: cuentas, movimientos
        (con las cuotas cobradas, y los anticipos y reembolsos como préstamos), facturas y subvenciones.</div>
      <div class="fv-pagos">${titulo("Lo que entra")}
        ${linea(previa.movimientos, "movimiento", "movimientos")}${linea(previa.facturas, "factura", "facturas")}
        ${linea(previa.subvenciones, "subvención o proyecto", "subvenciones y proyectos")}${linea(previa.cuentas, "cuenta nueva", "cuentas nuevas")}
        ${nada ? `<div class="cont-nota">Nada nuevo: ya estaba todo.</div>` : ""}
        ${previa.yaEstaban ? `<div class="fv-pago"><span>Ya estaban (no se repiten)</span><b>${previa.yaEstaban}</b></div>` : ""}</div>
      ${nota("Los saldos de inicio de cada cuenta entran como ajuste, que no cuenta como ingreso ni gasto. Nada de lo que ya hay aquí se toca, y traerlo otra vez no repite nada.")}`;
    ui.shell("Traer de Agora", body, () => {
      if (nada) return null;
      VISTA.traido = C.traerDeAgora(d, paquete);
      return null;
    }, () => {
      const r = VISTA.traido;
      VISTA.traido = null;
      if (!r) return;
      aviso("De Agora: " + r.movimientos + " movimientos, " + r.facturas + " facturas y " + r.subvenciones + " subvenciones");
      const SS = window.SolventoSuite;
      if (SS && SS.enviar) SS.enviar("solvento", "agora", { tipo: "dinero-traido", fecha: hoyISO(), resumen: r });
    }, { boton: nada ? "Cerrar" : "Traer a Solvento", ancha: true });
  }

  // ── Pintar ────────────────────────────────────────────────────────────────
  const PAGINAS = { facturas: pageFacturas, iva: pageIva, subvenciones: pageSubvenciones, ejercicio: pageEjercicio };
  function pintarPagina(id) {
    const el = document.getElementById("v2-page-" + id);
    if (!el) return;
    el.innerHTML = esOrg() ? PAGINAS[id](docu()) : "";
  }
  function pintar() { Object.keys(PAGINAS).forEach(pintarPagina); }

  window.SolventoAsociacion = { pintar, pintarPagina, traerDeAgora };
})();

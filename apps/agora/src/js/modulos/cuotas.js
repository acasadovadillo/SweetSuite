/*
 * webkit_asociaciones — Módulo «Cuotas».
 *
 *   #/cuotas            cuotas de un periodo: emitirlas (remesa), cobrarlas, anularlas
 *   #/cuotas/impagados  quién debe qué
 *   #/cuotas/tipos      tipos de socio con su cuota y periodicidad
 *
 * También exporta WA.CuotasUI (tabla de cuotas con sus botones), que usa la
 * ficha del socio. La lógica está en logica/cuotas.js, con tests.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, S = WA.Socios, C = WA.Cuotas, D = WA.Dinero;

  var estadoVista = { periodo: null, estado: "todas", texto: "" };

  var CLASE_ESTADO = { pendiente: "estado-aviso", pagada: "estado-ok", devuelta: "estado-error", anulada: "estado-neutro" };
  var PERIODICIDAD_TEXTO = { anual: "al año", semestral: "al semestre", trimestral: "al trimestre", mensual: "al mes" };

  // ── Tabla de cuotas reutilizable ─────────────────────────────────────────
  /**
   * opciones: { conSocio (columna con el socio), seleccionable (casillas para cobrar varias) }
   * Los botones llevan data-accion y data-id; conectar() se encarga de ellos.
   */
  function tabla(cuotas, opciones) {
    var o = opciones || {};
    if (!cuotas.length) return '<p class="vacio">No hay cuotas.</p>';
    return '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Cuotas</caption><thead><tr>' +
      (o.seleccionable ? '<th scope="col" class="celda-casilla"><input type="checkbox" data-todas aria-label="Seleccionar todas las pendientes"></th>' : "") +
      // Con socio (vista de un periodo) el concepto sobra: todas son del mismo periodo.
      (o.conSocio ? '<th scope="col" class="num">Nº</th><th scope="col">Socio</th>' : '<th scope="col">Concepto</th>') +
      '<th scope="col" class="importe">Importe</th><th scope="col">Estado</th><th scope="col">Pago</th>' +
      '<th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody>' +
      cuotas.map(function (q) {
        var debe = C.debe(q);
        var pago = q.pago ? esc(F.corta(q.pago.fecha)) + " · " + esc(q.pago.forma) : "";
        return "<tr>" +
          (o.seleccionable ? '<td class="celda-casilla">' + (debe ? '<input type="checkbox" data-sel="' + esc(q.id) + '" aria-label="Seleccionar la cuota de ' + esc(q.socioNombre) + '">' : "") + "</td>" : "") +
          (o.conSocio ? '<td class="num">' + esc(q.socioNumero) + '</td><th scope="row">' +
            (q.socioId ? '<a href="#/socios/ficha/' + encodeURIComponent(q.socioId) + '">' + esc(q.socioNombre) + "</a>" : esc(q.socioNombre)) + "</th>"
            : "<td>" + esc(q.concepto) + "</td>") +
          '<td class="importe">' + esc(D.formatear(q.importe)) + "</td>" +
          '<td><span class="estado ' + CLASE_ESTADO[q.estado] + '">' + esc(C.ESTADOS[q.estado]) + "</span></td>" +
          "<td>" + pago + "</td>" +
          '<td class="celda-acciones">' +
          (debe ? '<button type="button" class="btn btn-pequeno btn-primario" data-accion="cobrar" data-id="' + esc(q.id) + '">Cobrar</button> ' : "") +
          '<button type="button" class="btn btn-pequeno btn-secundario" data-accion="mas" data-id="' + esc(q.id) + '" aria-label="Más opciones de la cuota de ' + esc(q.socioNombre) + '">Más…</button>' +
          "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  /** Diálogo de cobro (una o varias cuotas). Devuelve el pago o null. */
  async function pedirPago(cuotas, socio, config) {
    var forma = (socio && socio.formaPago) || "Transferencia";
    var cuentas = (config.cuentas || []).map(function (c) { return [c.id, c.nombre]; });
    var total = D.sumar(cuotas.map(function (q) { return q.importe; }));
    var r = await UI.dialogo({
      titulo: cuotas.length === 1 ? "Cobrar cuota" : "Cobrar " + cuotas.length + " cuotas",
      contenido: "<p>" + (cuotas.length === 1 ? esc(cuotas[0].socioNombre) + " · " + esc(cuotas[0].concepto) : cuotas.length + " cuotas") +
        " · <strong>" + esc(D.formatear(total)) + "</strong></p>" +
        '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "fecha", etiqueta: "Fecha del pago", tipo: "date", valor: F.hoy(), requerido: true }) +
        UI.campo({ nombre: "forma", etiqueta: "Forma de pago", tipo: "select", valor: forma, opciones: S.FORMAS_PAGO }) +
        UI.campo({ nombre: "cuentaId", etiqueta: "Dónde entra el dinero", tipo: "select", valor: C.cuentaPorDefecto(forma, config.cuentas), opciones: cuentas }) +
        UI.campo({ nombre: "referencia", etiqueta: "Referencia (opcional)", valor: "", ayuda: "N.º de operación, concepto de la transferencia…" }) +
        "</div></form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Marcar como pagada" + (cuotas.length > 1 ? "s" : ""), valor: "enviar", estilo: "btn-primario" }],
      validar: function (form) {
        var ok = F.esValida(form.elements.fecha.value);
        UI.marcarError(form, "fecha", ok ? "" : "Pon la fecha del pago.");
        return ok;
      },
      alAbrir: function (d) {
        // Al cambiar la forma de pago se propone la cuenta que le corresponde (efectivo → caja).
        var f = d.querySelector("form");
        f.elements.forma.addEventListener("change", function () { f.elements.cuentaId.value = C.cuentaPorDefecto(f.elements.forma.value, config.cuentas); });
      },
    });
    return r.valor === "enviar" ? r.datos : null;
  }

  /** Menú «Más…» de una cuota: deshacer pago, devuelta, anular, reactivar, cambiar importe, borrar. */
  async function masOpciones(datos, q) {
    var botones = [{ texto: "Cerrar", valor: "cancelar" }];
    if (q.estado === "pagada") botones.unshift({ texto: "Deshacer el pago", valor: "deshacer" }, { texto: "El banco la devolvió", valor: "devolver" });
    if (q.estado === "pendiente" || q.estado === "devuelta") botones.unshift({ texto: "Cambiar importe…", valor: "importe" }, { texto: "Anular", valor: "anular" });
    if (q.estado === "anulada") botones.unshift({ texto: "Volver a pendiente", valor: "reactivar" }, { texto: "Borrar", valor: "borrar" });
    var historial = (q.historial || []).map(function (h) { return "<li>" + esc(F.corta(h.fecha)) + " · " + esc(h.accion) + (h.detalle ? " · " + esc(h.detalle) : "") + "</li>"; }).join("");
    var r = await UI.dialogo({
      titulo: q.concepto,
      contenido: "<p>" + esc(q.socioNombre) + " · " + esc(D.formatear(q.importe)) + " · " + esc(C.ESTADOS[q.estado]) + "</p>" +
        (q.pago ? '<p class="detalle">Pagada el ' + esc(F.corta(q.pago.fecha)) + " por " + esc(q.pago.forma) + (q.pago.referencia ? " · " + esc(q.pago.referencia) : "") + "</p>" : "") +
        (historial ? '<details class="historico"><summary>Historial</summary><ul class="lista">' + historial + "</ul></details>" : ""),
      botones: botones,
    });
    var v = r.valor;
    if (v === "deshacer") await datos.guardar("cuotas", C.deshacerPago(q));
    else if (v === "devolver") await datos.guardar("cuotas", C.devolver(q, F.hoy(), "Devolución bancaria"));
    else if (v === "anular") {
      if (!(await UI.confirmar("La cuota dejará de contar como deuda. Se puede volver a poner como pendiente.", { titulo: "Anular cuota", aceptar: "Anular" }))) return false;
      await datos.guardar("cuotas", C.anular(q, ""));
    } else if (v === "reactivar") await datos.guardar("cuotas", C.reactivar(q));
    else if (v === "borrar") {
      if (!(await UI.confirmar("Se borrará la cuota anulada. Si solo quieres que no cuente, basta con dejarla anulada.", { titulo: "Borrar cuota", aceptar: "Borrar", peligro: true }))) return false;
      await datos.borrar("cuotas", q.id);
    } else if (v === "importe") {
      var ri = await UI.dialogo({
        titulo: "Cambiar importe",
        contenido: '<form class="formulario" novalidate>' +
          UI.campo({ nombre: "importe", etiqueta: "Importe (€)", valor: D.formatear(q.importe, { simbolo: false }), atributos: 'inputmode="decimal"',
            ayuda: "Por ejemplo, para prorratear a quien entra a mitad de periodo." }) +
          UI.campo({ nombre: "motivo", etiqueta: "Motivo", valor: "" }) + "</form>",
        botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }],
        validar: function (form) {
          var c = D.desdeTexto(form.elements.importe.value);
          var ok = c !== null && c > 0;
          UI.marcarError(form, "importe", ok ? "" : "Escribe un importe mayor que cero (p. ej. 15,00).");
          return ok;
        },
      });
      if (ri.valor !== "enviar") return false;
      var nueva = JSON.parse(JSON.stringify(q));
      var antes = q.importe;
      nueva.importe = D.desdeTexto(ri.datos.importe);
      nueva.historial = (nueva.historial || []).concat([{ fecha: F.hoy(), accion: "importe cambiado",
        detalle: D.formatear(antes) + " → " + D.formatear(nueva.importe) + (ri.datos.motivo ? " · " + ri.datos.motivo : "") }]);
      await datos.guardar("cuotas", nueva);
    } else return false;
    UI.aviso("Cuota actualizada.");
    return true;
  }

  /** Conecta los botones de una tabla de cuotas. alTerminar() se llama tras cualquier cambio. */
  function conectar(contenedor, datos, alTerminar) {
    contenedor.addEventListener("click", async function (e) {
      var b = e.target.closest("[data-accion]");
      if (!b) return;
      var q = await datos.obtener("cuotas", b.getAttribute("data-id"));
      if (!q) return;
      var cambio = false;
      if (b.getAttribute("data-accion") === "cobrar") {
        var config = await datos.leer("config");
        var socio = q.socioId ? await datos.obtener("socios", q.socioId) : null;
        var pago = await pedirPago([q], socio, config);
        if (pago) {
          try { await datos.guardar("cuotas", C.registrarPago(q, pago)); cambio = true; UI.aviso("Cuota cobrada."); }
          catch (err) { UI.aviso(err.message, "error"); }
        }
      } else cambio = await masOpciones(datos, q);
      if (cambio && alTerminar) alTerminar();
    });
  }

  WA.CuotasUI = { tabla: tabla, conectar: conectar };

  // ── Pestañas del módulo ─────────────────────────────────────────────────
  function pestanas(actual) {
    var p = [["", "Cuotas"], ["impagados", "Impagados"], ["tipos", "Tipos de socio"]];
    return '<nav class="pestanas" aria-label="Apartados de cuotas">' + p.map(function (x) {
      return '<a href="#/cuotas' + (x[0] ? "/" + x[0] : "") + '"' + (actual === x[0] ? ' aria-current="page"' : "") + ">" + x[1] + "</a>";
    }).join("") + "</nav>";
  }

  async function cargar(datos) {
    var r = await Promise.all([datos.listar("socios"), datos.listar("cuotas"), datos.leer("config"), datos.listar("remesas")]);
    return { socios: r[0].map(S.completar), cuotas: r[1], config: r[2], remesas: r[3] };
  }

  /** Periodos que tiene sentido ofrecer: los de los tipos de socio activos (año anterior, actual y siguiente) y los que ya tienen cuotas. */
  function periodosDisponibles(c) {
    var anio = +F.hoy().slice(0, 4), claves = {};
    var periodicidades = {};
    (c.config.tiposSocio || []).forEach(function (t) { if (t.activo !== false && t.cuota > 0) periodicidades[t.periodicidad || "anual"] = true; });
    if (!Object.keys(periodicidades).length) periodicidades.anual = true;
    Object.keys(periodicidades).forEach(function (p) {
      [anio - 1, anio, anio + 1].forEach(function (a) { C.periodosDelAnio(p, a).forEach(function (x) { claves[x.clave] = x; }); });
    });
    c.cuotas.forEach(function (q) { var p = C.periodo(q.periodo); if (p) claves[p.clave] = p; });
    // Del año más reciente al más antiguo; dentro de cada año, el año entero primero y luego sus partes en orden.
    var orden = { anual: 0, semestral: 1, trimestral: 2, mensual: 3 };
    return Object.keys(claves).map(function (k) { return claves[k]; }).sort(function (a, b) {
      return b.anio - a.anio || orden[a.periodicidad] - orden[b.periodicidad] || a.inicio.localeCompare(b.inicio);
    });
  }
  function periodoPorDefecto(c) {
    var t = (c.config.tiposSocio || []).filter(function (x) { return x.activo !== false && x.cuota > 0; })[0];
    return C.periodoDeFecha((t && t.periodicidad) || "anual", F.hoy()).clave;
  }

  // ── Cuotas de un periodo ────────────────────────────────────────────────
  async function pintarPeriodo(cont, datos) {
    var c = await cargar(datos);
    var periodos = periodosDisponibles(c);
    if (!estadoVista.periodo) estadoVista.periodo = periodoPorDefecto(c);
    var p = C.periodo(estadoVista.periodo);
    var delPeriodo = c.cuotas.filter(function (q) { return q.periodo === p.clave; })
      .sort(function (a, b) { return (a.socioNumero || 0) - (b.socioNumero || 0); });
    var res = C.resumen(delPeriodo);
    var sinCuota = (c.config.tiposSocio || []).every(function (t) { return !(t.cuota > 0); });

    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Cuotas</h1></div>' + pestanas("") +
      (sinCuota ? '<div class="caja-aviso">Ningún tipo de socio tiene cuota todavía. <a href="#/cuotas/tipos">Ponle importe a la cuota</a> para poder emitirlas.</div>' : "") +
      '<div class="barra-filtros"><label>Periodo <select id="q-periodo">' + periodos.map(function (x) {
        return '<option value="' + esc(x.clave) + '"' + (x.clave === p.clave ? " selected" : "") + ">" + esc(x.etiqueta.charAt(0).toUpperCase() + x.etiqueta.slice(1)) + "</option>";
      }).join("") + "</select></label>" +
      '<button type="button" class="btn btn-primario" id="q-emitir"' + (sinCuota ? " disabled" : "") + ">Emitir cuotas de este periodo…</button></div>" +
      '<div class="rejilla-tarjetas cifras">' +
      cifra("Emitido", res.emitido, res.nPagadas + res.nPendientes + " cuotas") +
      cifra("Cobrado", res.cobrado, res.nPagadas + " pagadas") +
      cifra("Pendiente", res.pendiente, res.nPendientes + " sin cobrar") +
      '<section class="tarjeta"><h2>Por forma de pago</h2>' + (Object.keys(res.porForma).length ? '<ul class="lista-cifras">' +
        Object.keys(res.porForma).map(function (f) { return "<li><span>" + esc(f) + "</span><strong>" + esc(D.formatear(res.porForma[f])) + "</strong></li>"; }).join("") + "</ul>"
        : '<p class="detalle">Nada cobrado todavía.</p>') + "</section></div>" +
      '<div class="barra-filtros"><label class="filtro-texto"><span class="sr">Buscar socio</span><input type="search" id="q-buscar" placeholder="Buscar socio…" value="' + esc(estadoVista.texto) + '"></label>' +
      '<label><span class="sr">Estado</span><select id="q-estado">' + [["todas", "Todas"], ["debe", "Sin cobrar"], ["pagada", "Pagadas"], ["anulada", "Anuladas"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (estadoVista.estado === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></label>" +
      '<button type="button" class="btn btn-secundario" id="q-cobrar-sel" disabled>Cobrar seleccionadas</button>' +
      '<button type="button" class="btn btn-secundario lectura-ok" id="q-exportar">Exportar (CSV)</button></div>' +
      '<div id="q-tabla"></div>';

    function visibles() {
      var t = estadoVista.texto.trim().toLowerCase();
      return delPeriodo.filter(function (q) {
        if (estadoVista.estado === "debe" && !C.debe(q)) return false;
        if (estadoVista.estado !== "todas" && estadoVista.estado !== "debe" && q.estado !== estadoVista.estado) return false;
        return !t || (q.socioNombre + " " + q.socioNumero).toLowerCase().indexOf(t) >= 0;
      });
    }
    var zona = cont.querySelector("#q-tabla");
    var bSel = cont.querySelector("#q-cobrar-sel");
    function refrescar() {
      zona.innerHTML = delPeriodo.length ? tabla(visibles(), { conSocio: true, seleccionable: true })
        : '<p class="vacio">Todavía no se han emitido las cuotas de este periodo. Pulsa «Emitir cuotas de este periodo».</p>';
      bSel.disabled = true;
    }
    refrescar();
    conectar(zona, datos, function () { WA.App.repintar(); });
    zona.addEventListener("change", function (e) {
      if (e.target.hasAttribute("data-todas")) {
        zona.querySelectorAll("[data-sel]").forEach(function (x) { x.checked = e.target.checked; });
      }
      bSel.disabled = !zona.querySelector("[data-sel]:checked");
      var n = zona.querySelectorAll("[data-sel]:checked").length;
      bSel.textContent = n ? "Cobrar seleccionadas (" + n + ")" : "Cobrar seleccionadas";
    });
    bSel.addEventListener("click", async function () {
      var ids = Array.prototype.map.call(zona.querySelectorAll("[data-sel]:checked"), function (x) { return x.getAttribute("data-sel"); });
      var elegidas = delPeriodo.filter(function (q) { return ids.indexOf(q.id) >= 0; });
      var pago = await pedirPago(elegidas, null, c.config);
      if (!pago) return;
      await datos.guardarVarios("cuotas", elegidas.map(function (q) { return C.registrarPago(q, pago); }));
      UI.aviso(elegidas.length + " cuotas cobradas.");
      WA.App.repintar();
    });
    cont.querySelector("#q-periodo").addEventListener("change", function (e) { estadoVista.periodo = e.target.value; WA.App.repintar(); });
    cont.querySelector("#q-buscar").addEventListener("input", function (e) { estadoVista.texto = e.target.value; refrescar(); });
    cont.querySelector("#q-estado").addEventListener("change", function (e) { estadoVista.estado = e.target.value; refrescar(); });
    cont.querySelector("#q-emitir").addEventListener("click", function () { emitir(datos, c, p); });
    cont.querySelector("#q-exportar").addEventListener("click", function () { exportarCuotas(visibles(), c.config, "cuotas-" + p.clave); });
  }

  function cifra(titulo, centimos, detalle) {
    return '<section class="tarjeta"><h2>' + esc(titulo) + '</h2><p class="cifra">' + esc(D.formatear(centimos)) + '</p><p class="detalle">' + esc(detalle) + "</p></section>";
  }

  async function emitir(datos, c, p) {
    var remesaId = WA.Esquema.nuevoId();
    var r = C.generar({ periodo: p.clave, socios: c.socios, tipos: c.config.tiposSocio, cuotas: c.cuotas, fechaEmision: F.hoy(), remesaId: remesaId });
    // Los omitidos se agrupan por motivo; «otra periodicidad» no se enseña, no aporta.
    var porMotivo = {};
    r.omitidos.forEach(function (o) {
      if (o.motivo === "otraPeriodicidad") return;
      (porMotivo[o.texto] = porMotivo[o.texto] || []).push(o.socio);
    });
    var omitidosHtml = Object.keys(porMotivo).map(function (m) {
      return "<li><strong>" + esc(m) + "</strong>: " + porMotivo[m].length + " (" +
        esc(porMotivo[m].slice(0, 8).map(function (s) { return S.nombreCompleto(s); }).join(", ")) + (porMotivo[m].length > 8 ? "…" : "") + ")</li>";
    }).join("");
    if (!r.nuevas.length) {
      await UI.dialogo({ titulo: "Nada que emitir", contenido: "<p>No hay cuotas nuevas para el " + esc(p.etiqueta) + ".</p>" +
        (omitidosHtml ? '<ul class="lista">' + omitidosHtml + "</ul>" : ""), botones: [{ texto: "Entendido", valor: "cancelar", estilo: "btn-primario" }] });
      return;
    }
    var res = await UI.dialogo({
      titulo: "Emitir cuotas del " + p.etiqueta,
      contenido: "<p>Se emitirán <strong>" + r.nuevas.length + " cuotas</strong> por un total de <strong>" + esc(D.formatear(r.total)) + "</strong>, todas pendientes de cobro.</p>" +
        (omitidosHtml ? '<details class="historico"><summary>Socios a los que no se emite</summary><ul class="lista">' + omitidosHtml + "</ul></details>" : "") +
        '<p class="detalle">A quien entra a mitad de periodo se le emite la cuota entera; si queréis prorratear, cambiad su importe después («Más…» → «Cambiar importe»).</p>',
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Emitir " + r.nuevas.length + " cuotas", valor: "emitir", estilo: "btn-primario" }],
    });
    if (res.valor !== "emitir") return;
    await datos.guardarVarios("cuotas", r.nuevas);
    await datos.guardar("remesas", { id: remesaId, periodo: p.clave, fechaEmision: F.hoy(), concepto: "Cuotas " + p.etiqueta, nCuotas: r.nuevas.length, total: r.total });
    UI.aviso(r.nuevas.length + " cuotas emitidas.");
    WA.App.repintar();
  }

  async function exportarCuotas(lista, config, nombre) {
    var cuentas = {};
    (config.cuentas || []).forEach(function (c) { cuentas[c.id] = c.nombre; });
    var columnas = [
      { titulo: "Nº socio", clave: "socioNumero" }, { titulo: "Socio", clave: "socioNombre" },
      { titulo: "Periodo", clave: "periodo" }, { titulo: "Concepto", clave: "concepto" },
      { titulo: "Importe (€)", valor: function (q) { return D.formatear(q.importe, { simbolo: false }); } },
      { titulo: "Estado", valor: function (q) { return C.ESTADOS[q.estado]; } },
      { titulo: "Emitida", valor: function (q) { return F.corta(q.fechaEmision); } },
      { titulo: "Fecha de pago", valor: function (q) { return q.pago ? F.corta(q.pago.fecha) : ""; } },
      { titulo: "Forma de pago", valor: function (q) { return q.pago ? q.pago.forma : ""; } },
      { titulo: "Cuenta", valor: function (q) { return q.pago ? cuentas[q.pago.cuentaId] || "" : ""; } },
      { titulo: "Referencia", valor: function (q) { return q.pago ? q.pago.referencia : ""; } },
    ];
    UI.descargar(nombre + "-" + F.hoy() + ".csv", WA.CSV.escribir(columnas, lista), "text/csv;charset=utf-8");
  }

  // ── Impagados ───────────────────────────────────────────────────────────
  async function pintarImpagados(cont, datos) {
    var c = await cargar(datos);
    var deud = C.deudores(c.cuotas);
    var porId = {};
    c.socios.forEach(function (s) { porId[s.id] = s; });
    var total = D.sumar(deud.map(function (d) { return d.total; }));
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Cuotas</h1></div>' + pestanas("impagados") +
      '<p class="intro">' + (deud.length ? deud.length + (deud.length === 1 ? " socio debe " : " socios deben ") + "<strong>" + esc(D.formatear(total)) + "</strong> en total." : "Nadie debe nada. 🎉") + "</p>" +
      (deud.length ? '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Socios con cuotas sin cobrar</caption><thead><tr>' +
        '<th scope="col" class="num">Nº</th><th scope="col">Socio</th><th scope="col">Cuotas</th><th scope="col" class="importe">Debe</th><th scope="col" class="solo-ancho">Contacto</th></tr></thead><tbody>' +
        deud.map(function (d) {
          var s = porId[d.socioId] || {};
          return '<tr><td class="num">' + esc(d.socioNumero) + '</td><th scope="row">' +
            (s.id ? '<a href="#/socios/ficha/' + encodeURIComponent(s.id) + '">' + esc(d.socioNombre) + "</a>" : esc(d.socioNombre)) +
            (s.fechaBaja ? ' <span class="etiqueta">Baja</span>' : "") + "</th>" +
            "<td>" + esc(d.cuotas.map(function (q) { return (C.periodo(q.periodo) || {}).etiqueta || q.periodo; }).join(", ")) + "</td>" +
            '<td class="importe">' + esc(D.formatear(d.total)) + "</td>" +
            '<td class="solo-ancho">' + (s.email ? '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + "</a>" : "") +
            (s.telefono ? '<br><span class="detalle">' + esc(s.telefono) + "</span>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<div class="acciones"><button type="button" class="btn btn-secundario lectura-ok" id="i-correos">Copiar sus correos</button>' +
        '<button type="button" class="btn btn-secundario lectura-ok" id="i-exportar">Exportar (CSV)</button></div>' +
        '<p class="detalle">Para avisar a varios a la vez, pega los correos en «CCO» (copia oculta): así nadie ve las direcciones de los demás.</p>' : "");
    if (!deud.length) return;
    cont.querySelector("#i-correos").addEventListener("click", async function () {
      var correos = deud.map(function (d) { return (porId[d.socioId] || {}).email; }).filter(Boolean);
      try { await navigator.clipboard.writeText(correos.join(", ")); UI.aviso(correos.length + " correos copiados."); }
      catch (e) { UI.aviso("No se han podido copiar. Correos: " + correos.join(", "), "info"); }
    });
    cont.querySelector("#i-exportar").addEventListener("click", function () {
      var lista = [];
      deud.forEach(function (d) { lista = lista.concat(d.cuotas); });
      exportarCuotas(lista, c.config, "impagados");
    });
  }

  // ── Tipos de socio ──────────────────────────────────────────────────────
  async function editarTipo(datos, config, socios, tipo) {
    var t = tipo || { id: "", nombre: "", cuota: 0, periodicidad: "anual", activo: true };
    var enUso = tipo ? socios.filter(function (s) { return s.tipoSocioId === tipo.id; }).length : 0;
    var r = await UI.dialogo({
      titulo: tipo ? "Editar tipo de socio" : "Nuevo tipo de socio",
      contenido: '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "nombre", etiqueta: "Nombre", valor: t.nombre, requerido: true, ancho: "completo", ayuda: "Por ejemplo: Socio, Juvenil, Familiar, Honorario, Protector…" }) +
        UI.campo({ nombre: "cuota", etiqueta: "Cuota ordinaria (€)", valor: D.formatear(t.cuota, { simbolo: false }), atributos: 'inputmode="decimal"', ayuda: "0 si no paga cuota." }) +
        UI.campo({ nombre: "periodicidad", etiqueta: "Se paga", tipo: "select", valor: t.periodicidad, opciones: C.PERIODICIDADES }) +
        "</div>" +
        '<label class="casilla"><input type="checkbox" name="activo"' + (t.activo !== false ? " checked" : "") + "><span>Se pueden dar de alta socios de este tipo</span></label>" +
        (enUso ? '<p class="detalle">' + enUso + " socios son de este tipo. El cambio de cuota vale para las cuotas que se emitan a partir de ahora; las ya emitidas no cambian.</p>" : "") +
        '<p class="detalle">Las cuotas las fija la asamblea según vuestros estatutos.</p></form>',
      botones: (tipo && !enUso && config.tiposSocio.length > 1 ? [{ texto: "Borrar", valor: "borrar", estilo: "btn-peligro-suave" }] : [])
        .concat([{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }]),
      validar: function (form) {
        var nombre = form.elements.nombre.value.trim();
        var cuota = D.desdeTexto(form.elements.cuota.value || "0");
        var repetido = config.tiposSocio.some(function (x) { return x.id !== t.id && x.nombre.toLowerCase() === nombre.toLowerCase(); });
        UI.marcarError(form, "nombre", !nombre ? "Escribe el nombre." : repetido ? "Ya hay un tipo con ese nombre." : "");
        UI.marcarError(form, "cuota", cuota === null || cuota < 0 ? "Escribe un importe (p. ej. 30 o 12,50)." : "");
        return !!nombre && !repetido && cuota !== null && cuota >= 0;
      },
    });
    if (r.valor === "borrar") {
      config.tiposSocio = config.tiposSocio.filter(function (x) { return x.id !== tipo.id; });
    } else if (r.valor === "enviar") {
      var nuevo = { id: t.id || WA.Esquema.nuevoId(), nombre: r.datos.nombre, cuota: D.desdeTexto(r.datos.cuota || "0"),
        periodicidad: r.datos.periodicidad, activo: !!r.datos.activo };
      var i = config.tiposSocio.findIndex(function (x) { return x.id === nuevo.id; });
      if (i >= 0) config.tiposSocio[i] = nuevo; else config.tiposSocio.push(nuevo);
    } else return;
    await datos.escribir("config", config);
    UI.aviso("Tipos de socio guardados.");
    WA.App.repintar();
  }

  async function pintarTipos(cont, datos) {
    var c = await cargar(datos);
    var cuenta = function (id) { return c.socios.filter(function (s) { return s.tipoSocioId === id && S.estado(s) !== "baja"; }).length; };
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Cuotas</h1></div>' + pestanas("tipos") +
      '<div class="tarjeta-cabecera"><p class="intro">Cada tipo de socio tiene su cuota ordinaria y cada cuánto se paga.</p>' +
      '<button type="button" class="btn btn-primario" id="t-nuevo">Añadir tipo de socio</button></div>' +
      '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Tipos de socio</caption><thead><tr>' +
      '<th scope="col">Tipo</th><th scope="col" class="importe">Cuota</th><th scope="col">Se paga</th><th scope="col" class="num">Socios activos</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody>' +
      c.config.tiposSocio.map(function (t) {
        return '<tr><th scope="row">' + esc(t.nombre) + (t.activo === false ? ' <span class="etiqueta">No admite altas</span>' : "") + "</th>" +
          '<td class="importe">' + (t.cuota > 0 ? esc(D.formatear(t.cuota)) : "Sin cuota") + "</td>" +
          "<td>" + (t.cuota > 0 ? esc(PERIODICIDAD_TEXTO[t.periodicidad] || "") : "—") + "</td>" +
          '<td class="num">' + cuenta(t.id) + "</td>" +
          '<td class="celda-acciones"><button type="button" class="btn btn-pequeno btn-secundario" data-tipo="' + esc(t.id) + '">Editar</button></td></tr>';
      }).join("") + "</tbody></table></div>";
    cont.querySelector("#t-nuevo").addEventListener("click", function () { editarTipo(datos, c.config, c.socios, null); });
    cont.querySelector("tbody").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tipo]");
      if (!b) return;
      var t = c.config.tiposSocio.filter(function (x) { return x.id === b.getAttribute("data-tipo"); })[0];
      if (t) editarTipo(datos, c.config, c.socios, t);
    });
  }

  async function pintar(cont, datos, ruta) {
    if (ruta[0] === "impagados") return pintarImpagados(cont, datos);
    if (ruta[0] === "tipos") return pintarTipos(cont, datos);
    return pintarPeriodo(cont, datos);
  }

  WA.App.registrar({
    id: "cuotas", titulo: "Cuotas", orden: 25, pintar: pintar,
    icono: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6.5 14.5h4"/>',
  });
})(typeof self !== "undefined" ? self : this);

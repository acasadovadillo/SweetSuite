/*
 * webkit_asociaciones — Módulo «Tesorería».
 *
 *   #/tesoreria                      resumen: saldos, ingresos y gastos del año, pendientes
 *   #/tesoreria/movimientos          libro de movimientos; apuntar a mano o importar el extracto
 *   #/tesoreria/anticipos            anticipos y reembolsos
 *   #/tesoreria/anticipo/<id>        ficha de un anticipo o reembolso
 *   #/tesoreria/ajustes              cuentas, categorías, reglas, IVA y facturación
 *
 * La lógica está en logica/tesoreria.js y logica/extracto.js (con tests).
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, D = WA.Dinero, T = WA.Tesoreria, Fac = WA.Facturas, U = WA.TesUI;

  var vista = { anio: null, cuenta: "", categoria: "*", texto: "" };
  var anioActual = function () { return vista.anio || +F.hoy().slice(0, 4); };

  function pestanas(actual) {
    var p = [["", "Resumen"], ["movimientos", "Movimientos"], ["anticipos", "Anticipos y reembolsos"], ["ajustes", "Ajustes"]];
    return '<nav class="pestanas" aria-label="Apartados de tesorería">' + p.map(function (x) {
      return '<a href="#/tesoreria' + (x[0] ? "/" + x[0] : "") + '"' + (actual === x[0] ? ' aria-current="page"' : "") + ">" + x[1] + "</a>";
    }).join("") + "</nav>";
  }
  function selectorAnio(c, id) {
    var anios = {};
    anios[+F.hoy().slice(0, 4)] = true;
    c.movimientos.concat(c.facturas).forEach(function (m) { if (m.fecha) anios[+m.fecha.slice(0, 4)] = true; });
    c.cuotas.forEach(function (q) { if (q.pago) anios[+q.pago.fecha.slice(0, 4)] = true; });
    return '<label>Año <select id="' + id + '">' + Object.keys(anios).sort().reverse().map(function (a) {
      return '<option value="' + a + '"' + (+a === anioActual() ? " selected" : "") + ">" + a + "</option>";
    }).join("") + "</select></label>";
  }

  // ── Resumen ─────────────────────────────────────────────────────────────
  async function pintarResumen(cont, datos) {
    var c = await U.cargar(datos);
    var anio = anioActual();
    var s = T.saldos(c.config.cuentas, c.movimientos, c.cuotas, undefined, c.actividades);
    var res = T.resultados(T.partidas(c.movimientos, c.cuotas, c.anticipos, c.actividades), anio + "-01-01", anio + "-12-31");
    var sinClasificar = c.movimientos.filter(function (m) { return (m.tipo === "ingreso" || m.tipo === "gasto") && !m.categoriaId; }).length;
    var pend = { emitida: 0, recibida: 0, nE: 0, nR: 0 };
    c.facturas.forEach(function (f) {
      if (f.estado === "borrador" || f.estado === "anulada") return;
      var e = Fac.estadoPago(f, c.movimientos, c.anticipos);
      if (e.pendiente > 0) { pend[f.tipo] += e.pendiente; if (f.tipo === "emitida") pend.nE++; else pend.nR++; }
    });
    var abiertos = c.anticipos.filter(function (a) { return !a.cerrado && T.situacionAnticipo(a, c.movimientos).saldo !== 0; });
    var tabla = function (obj, total, titulo) {
      var filas = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; });
      return '<section class="tarjeta"><h2>' + titulo + "</h2>" + (filas.length ? '<ul class="lista-cifras">' + filas.map(function (k) {
        return "<li><span>" + esc(U.nombreCategoria(c, k)) + "</span><strong>" + esc(D.formatear(obj[k])) + "</strong></li>";
      }).join("") + '<li class="total"><span>Total</span><strong>' + esc(D.formatear(total)) + "</strong></li></ul>" : '<p class="detalle">Nada en ' + anio + ".</p>") + "</section>";
    };
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Tesorería</h1><button type="button" class="btn btn-secundario" id="t-excel">Descargar Excel del año</button></div>' + pestanas("") +
      (sinClasificar ? '<div class="caja-aviso">Hay <strong>' + sinClasificar + ' movimientos sin clasificar</strong>. <a href="#/tesoreria/movimientos" id="t-ver-sin">Clasificarlos</a></div>' : "") +
      '<div class="rejilla-tarjetas cifras">' + c.config.cuentas.map(function (cu) {
        return '<section class="tarjeta"><h2>' + esc(cu.nombre) + '</h2><p class="cifra">' + esc(D.formatear(s.porCuenta[cu.id] || 0)) + "</p></section>";
      }).join("") + '<section class="tarjeta tarjeta-destacada"><h2>Total disponible</h2><p class="cifra">' + esc(D.formatear(s.total)) + "</p></section></div>" +
      '<div class="barra-filtros">' + selectorAnio(c, "t-anio") + "</div>" +
      '<div class="rejilla-tarjetas">' + tabla(res.ingresos, res.totalIngresos, "Ingresos " + anio) + tabla(res.gastos, res.totalGastos, "Gastos " + anio) +
      '<section class="tarjeta"><h2>Resultado ' + anio + '</h2><p class="cifra ' + (res.resultado < 0 ? "importe-negativo" : "") + '">' + esc(D.formatear(res.resultado)) + "</p>" +
      '<ul class="lista-cifras"><li><span>Pendiente de cobrar (' + pend.nE + ' facturas)</span><strong><a href="#/facturas">' + esc(D.formatear(pend.emitida)) + "</a></strong></li>" +
      '<li><span>Pendiente de pagar (' + pend.nR + ' facturas)</span><strong><a href="#/facturas/recibidas">' + esc(D.formatear(pend.recibida)) + "</a></strong></li>" +
      '<li><span>Anticipos y reembolsos abiertos</span><strong><a href="#/tesoreria/anticipos">' + abiertos.length + "</a></strong></li></ul></section></div>" +
      U.ayuda("Los importes son de dinero cobrado o pagado (criterio de caja), con el IVA incluido. Las cuentas anuales formales pueden necesitar otro criterio: verificar con asesoría.");
    cont.querySelector("#t-anio").addEventListener("change", function (e) { vista.anio = +e.target.value; WA.App.repintar(); });
    cont.querySelector("#t-excel").addEventListener("click", function () { U.exportarExcel(c, anio); });
    var verSin = cont.querySelector("#t-ver-sin");
    if (verSin) verSin.addEventListener("click", function () { vista.categoria = ""; vista.anio = null; });
  }

  // ── Movimientos ─────────────────────────────────────────────────────────
  async function pintarMovimientos(cont, datos) {
    var c = await U.cargar(datos);
    var categorias = [["*", "Todas las categorías"], ["", "Sin clasificar"]].concat(U.opcionesCategorias(c, null, false));
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Tesorería</h1><div class="acciones-cabecera">' +
      '<button type="button" class="btn btn-secundario" id="m-importar">Importar extracto del banco…</button>' +
      '<button type="button" class="btn btn-primario" id="m-nuevo">Nuevo movimiento</button></div></div>' + pestanas("movimientos") +
      '<div class="barra-filtros">' + selectorAnio(c, "m-anio") +
      '<label><span class="sr">Cuenta</span><select id="m-cuenta"><option value="">Todas las cuentas</option>' + U.opcionesCuentas(c).map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (vista.cuenta === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>";
      }).join("") + "</select></label>" +
      '<label><span class="sr">Categoría</span><select id="m-categoria">' + categorias.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (vista.categoria === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>";
      }).join("") + "</select></label>" +
      '<label class="filtro-texto"><span class="sr">Buscar</span><input type="search" id="m-buscar" placeholder="Buscar concepto…" value="' + esc(vista.texto) + '"></label></div>' +
      '<p class="detalle" id="m-cuenta-n" aria-live="polite"></p><div id="m-tabla"></div>';

    function visibles() {
      var anio = String(anioActual()), t = vista.texto.trim().toLowerCase();
      return T.libro(c.movimientos, c.cuotas, c.actividades).filter(function (m) {
        if (m.fecha.slice(0, 4) !== anio) return false;
        if (vista.cuenta && m.cuentaId !== vista.cuenta && m.cuentaDestinoId !== vista.cuenta) return false;
        if (vista.categoria !== "*") {
          if (m.tipo !== "ingreso" && m.tipo !== "gasto") return false;
          if ((m.categoriaId || "") !== vista.categoria) return false;
        }
        return !t || (m.concepto + " " + (m.conceptoBanco || "")).toLowerCase().indexOf(t) >= 0;
      });
    }
    function etiquetas(m) {
      var e = [];
      if (m.virtual) e.push('<span class="etiqueta">' + (m.origenVirtual === "inscripcion" ? "Inscripción cobrada" : "Cuota cobrada") + "</span>");
      if ((m.inscripcionIds || []).length && !m.virtual) e.push('<span class="etiqueta">' + m.inscripcionIds.length + (m.inscripcionIds.length === 1 ? " inscripción" : " inscripciones") + "</span>");
      if (m.actividadId) { var act = U.buscar(c.actividades, m.actividadId); if (act) e.push('<a class="etiqueta" href="#/actividades/ficha/' + encodeURIComponent(act.id) + '">' + esc(act.titulo) + "</a>"); }
      if ((m.cuotaIds || []).length && !m.virtual) e.push('<span class="etiqueta">' + m.cuotaIds.length + (m.cuotaIds.length === 1 ? " cuota" : " cuotas") + "</span>");
      if (m.facturaId) { var f = U.buscar(c.facturas, m.facturaId); if (f) e.push('<a class="etiqueta" href="#/facturas/ver/' + encodeURIComponent(f.id) + '">Factura ' + esc(f.numero) + "</a>"); }
      if (m.anticipoId) e.push('<a class="etiqueta" href="#/tesoreria/anticipo/' + encodeURIComponent(m.anticipoId) + '">' + (m.sentido === "entrada" ? "Devolución" : "Anticipo/reembolso") + "</a>");
      if (m.origen === "extracto") e.push('<span class="etiqueta">Banco</span>');
      return e.join(" ");
    }
    function refrescar() {
      var lista = visibles();
      var suma = D.sumar(lista.map(function (m) { return vista.cuenta && m.tipo === "traspaso" && m.cuentaDestinoId === vista.cuenta ? m.importe : T.conSigno(m); }));
      cont.querySelector("#m-cuenta-n").textContent = lista.length + (lista.length === 1 ? " movimiento" : " movimientos") + " · neto " + D.formatear(suma);
      cont.querySelector("#m-tabla").innerHTML = !lista.length ? '<p class="vacio">No hay movimientos con estos filtros.</p>' :
        '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Movimientos</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Concepto</th>' +
        '<th scope="col">Categoría</th><th scope="col" class="solo-ancho">Cuenta</th><th scope="col" class="importe">Importe</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody>' +
        lista.map(function (m) {
          var cat = m.tipo === "ingreso" || m.tipo === "gasto"
            ? (m.categoriaId ? esc(U.nombreCategoria(c, m.categoriaId)) : '<span class="estado estado-aviso">Sin clasificar</span>')
            : '<span class="detalle">' + esc(m.tipo === "traspaso" ? "Traspaso → " + U.nombreCuenta(c, m.cuentaDestinoId) : "Anticipo o reembolso") + "</span>";
          var importe = vista.cuenta && m.tipo === "traspaso" && m.cuentaDestinoId === vista.cuenta ? m.importe : T.conSigno(m);
          return "<tr><td>" + esc(F.corta(m.fecha)) + "</td><td>" + esc(m.concepto || m.conceptoBanco || "—") +
            (m.concepto && m.conceptoBanco && m.conceptoBanco !== m.concepto ? '<br><span class="detalle">' + esc(m.conceptoBanco) + "</span>" : "") +
            (etiquetas(m) ? '<div class="etiquetas">' + etiquetas(m) + "</div>" : "") + "</td>" +
            "<td>" + cat + (m.proyectoId ? '<br><span class="detalle">' + esc(U.nombreProyecto(c, m.proyectoId)) + "</span>" : "") + "</td>" +
            '<td class="solo-ancho">' + esc(U.nombreCuenta(c, m.cuentaId)) + "</td>" +
            '<td class="importe">' + U.importeHtml(importe) + "</td>" +
            '<td class="celda-acciones">' + (m.virtual ? '<a class="btn btn-pequeno btn-secundario" href="' + (m.origenVirtual === "inscripcion" ? "#/actividades/ficha/" + encodeURIComponent(m.actividadId) : "#/cuotas") + '">Ver</a>'
              : '<button type="button" class="btn btn-pequeno btn-secundario" data-mov="' + esc(m.id) + '">' + (m.categoriaId || m.tipo === "traspaso" || m.tipo === "anticipo" ? "Editar" : "Clasificar") + "</button>") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    refrescar();
    cont.querySelector("#m-anio").addEventListener("change", function (e) { vista.anio = +e.target.value; refrescar(); });
    cont.querySelector("#m-cuenta").addEventListener("change", function (e) { vista.cuenta = e.target.value; refrescar(); });
    cont.querySelector("#m-categoria").addEventListener("change", function (e) { vista.categoria = e.target.value; refrescar(); });
    cont.querySelector("#m-buscar").addEventListener("input", function (e) { vista.texto = e.target.value; refrescar(); });
    cont.querySelector("#m-nuevo").addEventListener("click", async function () { if (await U.editarMovimiento(datos, c, null)) WA.App.repintar(); });
    cont.querySelector("#m-importar").addEventListener("click", function () { importarExtracto(datos, c); });
    cont.querySelector("#m-tabla").addEventListener("click", async function (e) {
      var b = e.target.closest("[data-mov]");
      if (!b) return;
      var m = U.buscar(c.movimientos, b.getAttribute("data-mov"));
      if (m && await U.editarMovimiento(datos, c, m)) WA.App.repintar();
    });
  }

  // ── Importar el extracto ────────────────────────────────────────────────
  async function importarExtracto(datos, c) {
    var archivo = await UI.elegirArchivo(".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", true);
    if (!archivo) return;
    var filas;
    try {
      if (/\.xlsx$/i.test(archivo.nombre)) {
        var hojas = await WA.XLSX.leer(archivo.bytes);
        filas = hojas[Object.keys(hojas)[0]] || [];
      } else {
        var texto = new TextDecoder("utf-8").decode(archivo.bytes);
        // Algunos bancos exportan en Latin-1: si sale el carácter de reemplazo, se relee así.
        if (texto.indexOf("\ufffd") >= 0) texto = new TextDecoder("windows-1252").decode(archivo.bytes);
        var l = WA.CSV.leer(texto);
        filas = [l.cabecera].concat(l.filas);
      }
    } catch (err) { UI.aviso(err.message, "error"); return; }
    var det = WA.Extracto.detectarColumnas(filas) || { fila: 0, columnas: {} };
    var cab = filas[det.fila] || [];
    var opcCol = [["", "—"]].concat(cab.map(function (t, i) { return [String(i), (t || "Columna " + (i + 1)) + ""]; }));
    var campos = [["fecha", "Fecha"], ["concepto", "Concepto"], ["importe", "Importe (con signo)"], ["cargo", "Cargos (salidas)"], ["abono", "Abonos (entradas)"]];
    var cuentaBanco = (c.config.cuentas.filter(function (x) { return x.tipo === "banco"; })[0] || c.config.cuentas[0] || {}).id;

    var r = await UI.dialogo({
      titulo: "Importar extracto",
      contenido: "<p>«" + esc(archivo.nombre) + "»: " + (filas.length - det.fila - 1) + " filas.</p>" +
        '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "cuentaId", etiqueta: "¿De qué cuenta es el extracto?", tipo: "select", valor: cuentaBanco, opciones: U.opcionesCuentas(c), ancho: "completo" }) +
        UI.campo({ nombre: "filaCabecera", etiqueta: "Fila de los títulos", tipo: "number", valor: String(det.fila + 1), atributos: 'min="1"' }) +
        campos.map(function (x) {
          var v = det.columnas[x[0]];
          return UI.campo({ nombre: "col-" + x[0], etiqueta: x[1], tipo: "select", valor: v === undefined ? "" : String(v), opciones: opcCol });
        }).join("") + "</div>" +
        '<div id="ex-previa" class="vista-previa-tabla" aria-live="polite"></div>' +
        "</form>" + U.ayuda("Los movimientos que ya estaban importados (misma cuenta, fecha, importe y concepto) se saltan. Los nuevos entran sin categoría, salvo que una regla de Ajustes la ponga; luego se clasifican y se enlazan con cuotas o facturas."),
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Importar", valor: "enviar", estilo: "btn-primario" }],
      alAbrir: function (d) {
        var f = d.querySelector("form");
        var calcular = function () {
          var dd = UI.leerFormulario(f), cols = {};
          campos.forEach(function (x) { if (dd["col-" + x[0]] !== "") cols[x[0]] = +dd["col-" + x[0]]; });
          var res = WA.Extracto.convertir({ filas: filas, columnas: cols, filaCabecera: (+dd.filaCabecera || 1) - 1, cuentaId: dd.cuentaId,
            existentes: c.movimientos, reglas: c.config.reglas });
          f._resultado = res;
          d.querySelector("#ex-previa").innerHTML = "<p><strong>" + res.nuevos.length + " nuevos</strong> · " + res.duplicados + " ya importados · " + res.problemas.length + " con problemas</p>" +
            (res.nuevos.length ? '<table class="tabla"><tbody>' + res.nuevos.slice(0, 5).map(function (m) {
              return "<tr><td>" + esc(F.corta(m.fecha)) + "</td><td>" + esc(m.concepto) + '</td><td class="importe">' + U.importeHtml(m.tipo === "ingreso" ? m.importe : -m.importe) + "</td></tr>";
            }).join("") + "</tbody></table>" + (res.nuevos.length > 5 ? '<p class="detalle">…y ' + (res.nuevos.length - 5) + " más.</p>" : "") : "") +
            (res.problemas.length ? '<p class="detalle">' + esc(res.problemas.slice(0, 5).map(function (p) { return "Fila " + p.fila + ": " + p.mensaje; }).join(" · ")) + "</p>" : "");
        };
        f.addEventListener("change", calcular);
        calcular();
      },
      validar: function (form) {
        var ok = form._resultado && form._resultado.nuevos.length > 0;
        if (!ok) UI.aviso("No hay movimientos nuevos que importar. Revisa qué columna es cada cosa.", "error");
        return ok;
      },
    });
    if (r.valor !== "enviar") return;
    var nuevos = r.form._resultado.nuevos;
    await datos.guardarVarios("movimientos", nuevos);
    UI.aviso(nuevos.length + " movimientos importados. Ahora clasifícalos.");
    vista.categoria = "";
    vista.anio = +nuevos[nuevos.length - 1].fecha.slice(0, 4);
    location.hash = "#/tesoreria/movimientos";
    WA.App.repintar();
  }

  // ── Anticipos y reembolsos ──────────────────────────────────────────────
  var ESTADO_ANT = { "debe la persona": ["estado-aviso", "Tiene dinero por justificar"], "se le debe": ["estado-error", "Hay que pagarle"],
    "liquidado": ["estado-ok", "Liquidado"], "sin movimientos": ["estado-neutro", "Sin movimientos"] };

  async function pintarAnticipos(cont, datos) {
    var c = await U.cargar(datos);
    var lista = c.anticipos.slice().sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Tesorería</h1><div class="acciones-cabecera">' +
      '<button type="button" class="btn btn-secundario" data-nuevo="reembolso">Nuevo reembolso</button>' +
      '<button type="button" class="btn btn-primario" data-nuevo="anticipo">Nuevo anticipo</button></div></div>' + pestanas("anticipos") +
      '<div class="rejilla-tarjetas"><section class="tarjeta"><h2>Anticipo</h2>' + U.ayuda(T.EXPLICACION.anticipo) + "</section>" +
      '<section class="tarjeta"><h2>Reembolso</h2>' + U.ayuda(T.EXPLICACION.reembolso) + "</section></div>" +
      (lista.length ? '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Anticipos y reembolsos</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th>' +
        '<th scope="col">Persona y concepto</th><th scope="col" class="importe">Entregado</th><th scope="col" class="importe">Justificado</th><th scope="col">Situación</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody>' +
        lista.map(function (a) {
          var s = T.situacionAnticipo(a, c.movimientos), e = ESTADO_ANT[s.estado];
          return "<tr><td>" + esc(F.corta(a.fecha)) + "</td><td>" + (a.tipo === "anticipo" ? "Anticipo" : "Reembolso") + '</td><th scope="row">' + esc(a.persona) +
            '<br><span class="detalle">' + esc(a.concepto) + '</span></th><td class="importe">' + esc(D.formatear(s.entregado)) + '</td><td class="importe">' + esc(D.formatear(s.justificado)) + "</td>" +
            '<td><span class="estado ' + e[0] + '">' + e[1] + "</span>" + (s.saldo ? '<br><span class="detalle">' + esc(D.formatear(Math.abs(s.saldo))) + "</span>" : "") + "</td>" +
            '<td class="celda-acciones"><a class="btn btn-pequeno btn-secundario" href="#/tesoreria/anticipo/' + encodeURIComponent(a.id) + '">Ver</a></td></tr>';
        }).join("") + "</tbody></table></div>" : '<p class="vacio">Todavía no hay anticipos ni reembolsos.</p>');
    cont.querySelectorAll("[data-nuevo]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var tipo = b.getAttribute("data-nuevo");
        var a = await editarDatosAnticipo(datos, c, { tipo: tipo, persona: "", socioId: "", fecha: F.hoy(), concepto: "", proyectoId: "", gastos: [], cerrado: false, notas: "" });
        if (a) location.hash = "#/tesoreria/anticipo/" + encodeURIComponent(a.id);
      });
    });
  }

  function personas(c) {
    var n = {};
    c.junta.forEach(function (j) { if (!j.hasta) n[j.nombre] = true; });
    c.socios.forEach(function (s) { if (!s.fechaBaja) n[[s.nombre, s.apellidos].filter(Boolean).join(" ")] = true; });
    return Object.keys(n).sort(function (a, b) { return a.localeCompare(b, "es"); });
  }

  async function editarDatosAnticipo(datos, c, a) {
    var r = await UI.dialogo({
      titulo: (a.id ? "Editar " : "Nuevo ") + (a.tipo === "anticipo" ? "anticipo" : "reembolso"),
      contenido: U.ayuda(T.EXPLICACION[a.tipo]) + '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "persona", etiqueta: "Persona", valor: a.persona, requerido: true, lista: personas(c), ancho: "completo" }) +
        UI.campo({ nombre: "concepto", etiqueta: "Para qué", valor: a.concepto, requerido: true, ancho: "completo" }) +
        UI.campo({ nombre: "fecha", etiqueta: "Fecha", tipo: "date", valor: a.fecha }) +
        UI.campo({ nombre: "proyectoId", etiqueta: "Proyecto", tipo: "select", valor: a.proyectoId, opciones: U.opcionesProyectos(c) }) +
        UI.campo({ nombre: "notas", etiqueta: "Notas", valor: a.notas, ancho: "completo" }) + "</div></form>",
      botones: (a.id ? [{ texto: "Borrar", valor: "borrar", estilo: "btn-peligro-suave" }] : []).concat([{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }]),
      validar: function (form) {
        var d = UI.leerFormulario(form);
        UI.marcarError(form, "persona", d.persona ? "" : "¿Quién?");
        UI.marcarError(form, "concepto", d.concepto ? "" : "¿Para qué?");
        return !!(d.persona && d.concepto);
      },
    });
    if (r.valor === "borrar") {
      var conMov = c.movimientos.some(function (m) { return m.anticipoId === a.id; });
      if (conMov) { UI.aviso("Tiene movimientos de dinero enlazados: bórralos antes en Movimientos.", "error"); return null; }
      if (!(await UI.confirmar("Se borrará con sus gastos.", { titulo: "Borrar", aceptar: "Borrar", peligro: true }))) return null;
      await datos.borrar("anticipos", a.id);
      location.hash = "#/tesoreria/anticipos";
      return null;
    }
    if (r.valor !== "enviar") return null;
    var g = await datos.guardar("anticipos", Object.assign(a, { persona: r.datos.persona, concepto: r.datos.concepto, fecha: r.datos.fecha, proyectoId: r.datos.proyectoId, notas: r.datos.notas }));
    UI.aviso("Guardado.");
    return g;
  }

  async function editarGasto(datos, c, a, gasto) {
    var g = gasto || { id: WA.Esquema.nuevoId(), fecha: F.hoy(), concepto: "", importe: 0, categoriaId: "", proyectoId: a.proyectoId || "", actividadId: a.actividadId || "", justificante: "", facturaId: "" };
    var facturas = [["", "—"]].concat(c.facturas.filter(function (f) { return f.tipo === "recibida"; }).map(function (f) { return [f.id, f.numero + " · " + (f.tercero || {}).nombre + " · " + D.formatear(Fac.totales(f).total)]; }));
    var r = await UI.dialogo({
      titulo: gasto ? "Editar gasto" : "Añadir gasto justificado",
      contenido: '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "concepto", etiqueta: "Concepto", valor: g.concepto, requerido: true, ancho: "completo" }) +
        UI.campo({ nombre: "fecha", etiqueta: "Fecha del ticket", tipo: "date", valor: g.fecha }) +
        UI.campo({ nombre: "importe", etiqueta: "Importe (€)", valor: g.importe ? D.formatear(g.importe, { simbolo: false }) : "", atributos: 'inputmode="decimal"' }) +
        UI.campo({ nombre: "categoriaId", etiqueta: "Categoría", tipo: "select", valor: g.categoriaId, opciones: U.opcionesCategorias(c, "gasto") }) +
        UI.campo({ nombre: "proyectoId", etiqueta: "Proyecto", tipo: "select", valor: g.proyectoId, opciones: U.opcionesProyectos(c) }) +
        UI.campo({ nombre: "actividadId", etiqueta: "Actividad", tipo: "select", valor: g.actividadId, opciones: U.opcionesActividades(c, g.actividadId) }) +
        UI.campo({ nombre: "justificante", etiqueta: "Justificante", valor: g.justificante, ayuda: "Ticket, factura simplificada… y dónde está guardado." }) +
        UI.campo({ nombre: "facturaId", etiqueta: "Factura recibida (si la hay)", tipo: "select", valor: g.facturaId, opciones: facturas, ayuda: "Para que conste como pagada y su IVA cuente." }) +
        "</div></form>",
      botones: (gasto ? [{ texto: "Quitar", valor: "quitar", estilo: "btn-peligro-suave" }] : []).concat([{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }]),
      validar: function (form) {
        var d = UI.leerFormulario(form), imp = D.desdeTexto(d.importe);
        UI.marcarError(form, "concepto", d.concepto ? "" : "Escribe el concepto.");
        UI.marcarError(form, "importe", imp > 0 ? "" : "Escribe el importe.");
        return !!d.concepto && imp > 0;
      },
    });
    if (r.valor === "quitar") a.gastos = a.gastos.filter(function (x) { return x.id !== g.id; });
    else if (r.valor === "enviar") {
      var nuevo = Object.assign(g, r.datos, { importe: D.desdeTexto(r.datos.importe) });
      var i = a.gastos.findIndex(function (x) { return x.id === nuevo.id; });
      if (i >= 0) a.gastos[i] = nuevo; else a.gastos.push(nuevo);
    } else return false;
    await datos.guardar("anticipos", a);
    return true;
  }

  async function pintarAnticipo(cont, datos, id) {
    var c = await U.cargar(datos);
    var a = U.buscar(c.anticipos, id);
    if (!a) { cont.innerHTML = '<h1>No encontrado</h1><p><a href="#/tesoreria/anticipos">Volver</a></p>'; return; }
    var s = T.situacionAnticipo(a, c.movimientos), e = ESTADO_ANT[s.estado];
    var dinero = c.movimientos.filter(function (m) { return m.anticipoId === a.id; }).sort(function (x, y) { return x.fecha.localeCompare(y.fecha); });
    var esAnticipo = a.tipo === "anticipo";
    cont.innerHTML =
      '<p class="miga"><a href="#/tesoreria/anticipos">Anticipos y reembolsos</a> › ' + (esAnticipo ? "Anticipo" : "Reembolso") + "</p>" +
      '<div class="cabecera-pagina"><h1>' + esc(a.persona) + " · " + esc(a.concepto) + '</h1><span class="estado ' + e[0] + '">' + e[1] + "</span></div>" +
      U.ayuda(T.EXPLICACION[a.tipo]) +
      '<div class="rejilla-tarjetas cifras">' +
      (esAnticipo ? '<section class="tarjeta"><h2>Entregado</h2><p class="cifra">' + esc(D.formatear(s.entregado)) + "</p></section>" : '<section class="tarjeta"><h2>Pagado a la persona</h2><p class="cifra">' + esc(D.formatear(s.entregado)) + "</p></section>") +
      '<section class="tarjeta"><h2>Gastos justificados</h2><p class="cifra">' + esc(D.formatear(s.justificado)) + "</p></section>" +
      (esAnticipo ? '<section class="tarjeta"><h2>Devuelto</h2><p class="cifra">' + esc(D.formatear(s.devuelto)) + "</p></section>" : "") +
      '<section class="tarjeta tarjeta-destacada"><h2>' + (s.saldo > 0 ? "Le queda por justificar o devolver" : s.saldo < 0 ? "La asociación le debe" : "Saldo") + '</h2><p class="cifra">' + esc(D.formatear(Math.abs(s.saldo))) + "</p></section></div>" +
      '<section class="tarjeta"><div class="tarjeta-cabecera"><h2>Gastos justificados</h2><button type="button" class="btn btn-secundario" id="a-gasto">Añadir gasto</button></div>' +
      (a.gastos.length ? '<div class="tabla-envoltorio"><table class="tabla"><tbody>' + a.gastos.map(function (g) {
        return "<tr><td>" + esc(F.corta(g.fecha)) + "</td><td>" + esc(g.concepto) + (g.justificante ? '<br><span class="detalle">' + esc(g.justificante) + "</span>" : "") + "</td><td>" +
          esc(U.nombreCategoria(c, g.categoriaId)) + '</td><td class="importe">' + esc(D.formatear(g.importe)) + '</td><td class="celda-acciones"><button type="button" class="btn btn-pequeno btn-secundario" data-gasto="' + esc(g.id) + '">Editar</button></td></tr>';
      }).join("") + "</tbody></table></div>" : '<p class="vacio">Aún no hay gastos justificados.</p>') + "</section>" +
      '<section class="tarjeta"><div class="tarjeta-cabecera"><h2>Dinero</h2><div class="acciones-cabecera">' +
      (esAnticipo ? '<button type="button" class="btn btn-secundario" data-dinero="salida">Registrar entrega</button><button type="button" class="btn btn-secundario" data-dinero="entrada">Registrar devolución</button>'
        : '<button type="button" class="btn btn-secundario" data-dinero="salida">Registrar pago a la persona</button>') + "</div></div>" +
      (dinero.length ? '<div class="tabla-envoltorio"><table class="tabla"><tbody>' + dinero.map(function (m) {
        return "<tr><td>" + esc(F.corta(m.fecha)) + "</td><td>" + esc(m.concepto) + "</td><td>" + esc(U.nombreCuenta(c, m.cuentaId)) + '</td><td class="importe">' + U.importeHtml(T.conSigno(m)) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<p class="vacio">Sin movimientos de dinero todavía.</p>') + "</section>" +
      '<div class="acciones"><button type="button" class="btn btn-secundario" id="a-editar">Editar datos</button>' +
      '<label class="casilla"><input type="checkbox" id="a-cerrado"' + (a.cerrado ? " checked" : "") + "><span>Cerrado</span></label></div>";

    cont.querySelector("#a-gasto").addEventListener("click", async function () { if (await editarGasto(datos, c, a)) WA.App.repintar(); });
    cont.querySelectorAll("[data-gasto]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var g = a.gastos.filter(function (x) { return x.id === b.getAttribute("data-gasto"); })[0];
        if (await editarGasto(datos, c, a, g)) WA.App.repintar();
      });
    });
    cont.querySelectorAll("[data-dinero]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var sentido = b.getAttribute("data-dinero");
        var propuesto = sentido === "entrada" ? Math.max(s.saldo, 0) : Math.max(-s.saldo, 0);
        var concepto = sentido === "entrada" ? "Devolución de " + a.persona : (esAnticipo ? "Anticipo a " : "Reembolso a ") + a.persona;
        if (await U.editarMovimiento(datos, c, null, { tipo: "anticipo", sentido: sentido, anticipoId: a.id, importe: propuesto, concepto: concepto,
          cuentaId: (c.config.cuentas.filter(function (x) { return x.tipo === "caja"; })[0] || c.config.cuentas[0]).id })) WA.App.repintar();
      });
    });
    cont.querySelector("#a-editar").addEventListener("click", async function () { if (await editarDatosAnticipo(datos, c, a)) WA.App.repintar(); });
    cont.querySelector("#a-cerrado").addEventListener("change", async function (ev) { a.cerrado = ev.target.checked; await datos.guardar("anticipos", a); UI.aviso("Guardado."); });
  }

  // ── Ajustes ─────────────────────────────────────────────────────────────
  async function pintarAjustes(cont, datos) {
    var c = await U.cargar(datos);
    var cfg = c.config;
    var usoCategoria = function (id) {
      return c.movimientos.some(function (m) { return m.categoriaId === id; }) || c.facturas.some(function (f) { return f.categoriaId === id; }) ||
        c.anticipos.some(function (a) { return a.gastos.some(function (g) { return g.categoriaId === id; }); });
    };
    var IVA_TXT = { sujeto: "Sujeto", exento: "Exento", no_sujeto: "No sujeto" };
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Tesorería</h1></div>' + pestanas("ajustes") +
      '<section class="tarjeta"><div class="tarjeta-cabecera"><h2>Cuentas</h2><button type="button" class="btn btn-secundario" id="aj-cuenta">Añadir cuenta</button></div>' +
      '<div class="tabla-envoltorio"><table class="tabla"><tbody>' + cfg.cuentas.map(function (cu) {
        return '<tr><th scope="row">' + esc(cu.nombre) + '<br><span class="detalle">' + (cu.tipo === "caja" ? "Caja (efectivo)" : "Banco") + (cu.iban ? " · " + esc(cu.iban) : "") + "</span></th>" +
          "<td>Saldo inicial " + esc(D.formatear(cu.saldoInicial || 0)) + (cu.fechaSaldoInicial ? " el " + esc(F.corta(cu.fechaSaldoInicial)) : "") + "</td>" +
          '<td class="celda-acciones"><button type="button" class="btn btn-pequeno btn-secundario" data-cuenta="' + esc(cu.id) + '">Editar</button></td></tr>';
      }).join("") + "</tbody></table></div>" +
      U.ayuda("El saldo inicial es el dinero que había en la cuenta antes del primer movimiento apuntado aquí.") + "</section>" +

      '<section class="tarjeta"><div class="tarjeta-cabecera"><h2>Categorías de ingresos y gastos</h2><button type="button" class="btn btn-secundario" id="aj-categoria">Añadir categoría</button></div>' +
      ["ingreso", "gasto"].map(function (tipo) {
        return "<h3>" + (tipo === "ingreso" ? "Ingresos" : "Gastos") + '</h3><ul class="lista-editable">' + cfg.categorias.filter(function (x) { return x.tipo === tipo; }).map(function (x) {
          return "<li><span>" + esc(x.nombre) + (x.activa === false ? ' <span class="etiqueta">Oculta</span>' : "") + (tipo === "ingreso" && x.iva ? ' <span class="detalle">· IVA: ' + IVA_TXT[x.iva] + "</span>" : "") +
            '</span><button type="button" class="btn btn-pequeno btn-secundario" data-categoria="' + esc(x.id) + '">Editar</button></li>';
        }).join("") + "</ul>";
      }).join("") + U.ayuda("Las categorías son las partidas del presupuesto. En los ingresos, el «IVA habitual» se propone al hacer una factura con esa categoría.") + "</section>" +

      '<section class="tarjeta"><div class="tarjeta-cabecera"><h2>Reglas para clasificar el extracto</h2><button type="button" class="btn btn-secundario" id="aj-regla">Añadir regla</button></div>' +
      (cfg.reglas.length ? '<ul class="lista-editable">' + cfg.reglas.map(function (rg, i) {
        return "<li><span>Si el concepto contiene «" + esc(rg.texto) + "» → " + esc(U.nombreCategoria(c, rg.categoriaId)) + '</span><button type="button" class="btn btn-pequeno btn-peligro-suave" data-quitar-regla="' + i + '">Quitar</button></li>';
      }).join("") + "</ul>" : '<p class="vacio">Sin reglas.</p>') + U.ayuda("Al importar un extracto, cada movimiento cuyo concepto contenga ese texto entra ya con su categoría.") + "</section>" +

      '<section class="tarjeta"><h2>IVA</h2><form id="aj-iva" class="formulario" novalidate>' +
      '<label class="casilla"><input type="checkbox" name="presenta"' + (cfg.iva.presenta ? " checked" : "") + "><span>La asociación presenta declaraciones de IVA (modelo 303)</span></label>" +
      '<div class="rejilla">' +
      UI.campo({ nombre: "prorrata", etiqueta: "Porcentaje de IVA soportado que se deduce", tipo: "number", valor: String(cfg.iva.prorrata), atributos: 'min="0" max="100" step="1"',
        ayuda: "100 si se deduce todo. Si hay que aplicar prorrata, el porcentaje lo calcula la asesoría." }) +
      UI.campo({ nombre: "saldoACompensarInicial", etiqueta: "Saldo a compensar que venía de antes (€)", valor: D.formatear(cfg.iva.saldoACompensarInicial || 0, { simbolo: false }), atributos: 'inputmode="decimal"' }) +
      UI.campo({ nombre: "periodoSaldoInicial", etiqueta: "Desde el trimestre", valor: cfg.iva.periodoSaldoInicial, atributos: 'placeholder="2026-T1"', ayuda: "Formato: 2026-T1." }) +
      '</div><div class="acciones"><button type="submit" class="btn btn-primario">Guardar IVA</button></div></form></section>' +

      '<section class="tarjeta"><h2>Facturas emitidas</h2><form id="aj-fac" class="formulario" novalidate><div class="rejilla">' +
      UI.campo({ nombre: "serie", etiqueta: "Serie (opcional)", valor: cfg.facturacion.serie, ayuda: "Letras delante del número: A-2026-0001." }) +
      UI.campo({ nombre: "motivoExencion", etiqueta: "Motivo de exención habitual", valor: cfg.facturacion.motivoExencion, ancho: "completo",
        ayuda: "El texto que debe figurar en las facturas con operaciones exentas (el artículo de la ley). Verificar con asesoría." }) +
      UI.campo({ nombre: "condicionesPago", etiqueta: "Forma de pago que aparece en la factura", valor: cfg.facturacion.condicionesPago, ancho: "completo" }) +
      UI.campo({ nombre: "pie", etiqueta: "Pie de factura", valor: cfg.facturacion.pie, ancho: "completo" }) +
      '</div><div class="acciones"><button type="submit" class="btn btn-primario">Guardar</button></div></form></section>';

    var guardar = async function () { await datos.escribir("config", cfg); UI.aviso("Ajustes guardados."); WA.App.repintar(); };

    async function editarCuenta(cu) {
      var x = cu || { id: WA.Esquema.nuevoId(), nombre: "", tipo: "banco", iban: "", saldoInicial: 0, fechaSaldoInicial: "" };
      var enUso = cu && (c.movimientos.some(function (m) { return m.cuentaId === cu.id || m.cuentaDestinoId === cu.id; }) || c.cuotas.some(function (q) { return q.pago && q.pago.cuentaId === cu.id; }));
      var r = await UI.dialogo({
        titulo: cu ? "Editar cuenta" : "Nueva cuenta",
        contenido: '<form class="formulario" novalidate><div class="rejilla">' +
          UI.campo({ nombre: "nombre", etiqueta: "Nombre", valor: x.nombre, requerido: true, ancho: "completo" }) +
          UI.campo({ nombre: "tipo", etiqueta: "Tipo", tipo: "select", valor: x.tipo, opciones: [["banco", "Banco"], ["caja", "Caja (efectivo)"]] }) +
          UI.campo({ nombre: "iban", etiqueta: "IBAN", valor: x.iban }) +
          UI.campo({ nombre: "saldoInicial", etiqueta: "Saldo inicial (€)", valor: D.formatear(x.saldoInicial || 0, { simbolo: false }), atributos: 'inputmode="decimal"' }) +
          UI.campo({ nombre: "fechaSaldoInicial", etiqueta: "A fecha de", tipo: "date", valor: x.fechaSaldoInicial }) + "</div></form>",
        botones: (cu && !enUso && cfg.cuentas.length > 1 ? [{ texto: "Borrar", valor: "borrar", estilo: "btn-peligro-suave" }] : []).concat([{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }]),
        validar: function (form) {
          var d = UI.leerFormulario(form), ok = !!d.nombre && D.desdeTexto(d.saldoInicial || "0") !== null;
          UI.marcarError(form, "nombre", d.nombre ? "" : "Pon un nombre.");
          return ok;
        },
      });
      if (r.valor === "borrar") cfg.cuentas = cfg.cuentas.filter(function (y) { return y.id !== x.id; });
      else if (r.valor === "enviar") {
        Object.assign(x, { nombre: r.datos.nombre, tipo: r.datos.tipo, iban: WA.Validar.normalizar(r.datos.iban), saldoInicial: D.desdeTexto(r.datos.saldoInicial || "0"), fechaSaldoInicial: r.datos.fechaSaldoInicial });
        if (!cu) cfg.cuentas.push(x);
      } else return;
      await guardar();
    }
    async function editarCategoria(cat) {
      var x = cat || { id: WA.Esquema.nuevoId(), nombre: "", tipo: "gasto", iva: "", activa: true };
      var enUso = cat && usoCategoria(cat.id);
      var r = await UI.dialogo({
        titulo: cat ? "Editar categoría" : "Nueva categoría",
        contenido: '<form class="formulario" novalidate><div class="rejilla">' +
          UI.campo({ nombre: "nombre", etiqueta: "Nombre", valor: x.nombre, requerido: true, ancho: "completo" }) +
          UI.campo({ nombre: "tipo", etiqueta: "Es de", tipo: "select", valor: x.tipo, opciones: [["ingreso", "Ingresos"], ["gasto", "Gastos"]] }) +
          UI.campo({ nombre: "iva", etiqueta: "IVA habitual (ingresos)", tipo: "select", valor: x.iva, opciones: [["", "—"]].concat(Fac.TRATAMIENTOS) }) +
          UI.campo({ nombre: "partida", etiqueta: "Partida en el informe de cuentas", tipo: "select", valor: x.partida || "", ancho: "completo",
            opciones: [["", "Automática" + (WA.Informes.PARTIDA_POR_DEFECTO[x.id] ? "" : " (otros ingresos u otros gastos)")]].concat(WA.Informes.PARTIDAS.map(function (q) { return [q.id, q.texto]; })),
            ayuda: "Dónde se suma en la cuenta de resultados con el modelo de entidades sin fines lucrativos (Informes → Cuentas). Orientativo: verificar con asesoría." }) +
          "</div>" + '<label class="casilla"><input type="checkbox" name="activa"' + (x.activa !== false ? " checked" : "") + "><span>Se puede usar (desmárcala para ocultarla sin borrarla)</span></label></form>" +
          U.ayuda("Cuotas de socios y donaciones no están sujetas a IVA; algunas actividades pueden estar exentas. Qué tratamiento tiene cada ingreso: verificar con asesoría."),
        botones: (cat && !enUso && cat.id !== T.CATEGORIA_CUOTAS ? [{ texto: "Borrar", valor: "borrar", estilo: "btn-peligro-suave" }] : []).concat([{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }]),
        validar: function (form) { var ok = !!form.elements.nombre.value.trim(); UI.marcarError(form, "nombre", ok ? "" : "Pon un nombre."); return ok; },
      });
      if (r.valor === "borrar") cfg.categorias = cfg.categorias.filter(function (y) { return y.id !== x.id; });
      else if (r.valor === "enviar") {
        Object.assign(x, { nombre: r.datos.nombre, tipo: r.datos.tipo, iva: r.datos.tipo === "ingreso" ? r.datos.iva : "", activa: !!r.datos.activa, partida: r.datos.partida || "" });
        if (!cat) cfg.categorias.push(x);
      } else return;
      await guardar();
    }
    cont.querySelector("#aj-cuenta").addEventListener("click", function () { editarCuenta(null); });
    cont.querySelectorAll("[data-cuenta]").forEach(function (b) { b.addEventListener("click", function () { editarCuenta(U.buscar(cfg.cuentas, b.getAttribute("data-cuenta"))); }); });
    cont.querySelector("#aj-categoria").addEventListener("click", function () { editarCategoria(null); });
    cont.querySelectorAll("[data-categoria]").forEach(function (b) { b.addEventListener("click", function () { editarCategoria(U.buscar(cfg.categorias, b.getAttribute("data-categoria"))); }); });
    cont.querySelector("#aj-regla").addEventListener("click", async function () {
      var r = await UI.dialogo({
        titulo: "Nueva regla",
        contenido: '<form class="formulario" novalidate><div class="rejilla">' +
          UI.campo({ nombre: "texto", etiqueta: "Si el concepto del banco contiene", valor: "", requerido: true, ayuda: "Por ejemplo: COMISION, SEGURO, DOMINIO" }) +
          UI.campo({ nombre: "categoriaId", etiqueta: "Ponerle la categoría", tipo: "select", valor: "", opciones: U.opcionesCategorias(c, null, false) }) + "</div></form>",
        botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Añadir", valor: "enviar", estilo: "btn-primario" }],
        validar: function (form) { var ok = !!form.elements.texto.value.trim(); UI.marcarError(form, "texto", ok ? "" : "Escribe el texto."); return ok; },
      });
      if (r.valor !== "enviar") return;
      cfg.reglas.push({ texto: r.datos.texto, categoriaId: r.datos.categoriaId });
      await guardar();
    });
    cont.querySelectorAll("[data-quitar-regla]").forEach(function (b) {
      b.addEventListener("click", async function () { cfg.reglas.splice(+b.getAttribute("data-quitar-regla"), 1); await guardar(); });
    });
    cont.querySelector("#aj-iva").addEventListener("submit", async function (e) {
      e.preventDefault();
      var d = UI.leerFormulario(e.target);
      var p = Math.max(0, Math.min(100, Math.round(Number(d.prorrata))));
      var periodoOk = !d.periodoSaldoInicial || /^\d{4}-T[1-4]$/.test(d.periodoSaldoInicial);
      UI.marcarError(e.target, "periodoSaldoInicial", periodoOk ? "" : "Escríbelo así: 2026-T1.");
      if (!periodoOk || !isFinite(p)) return;
      Object.assign(cfg.iva, { presenta: !!d.presenta, prorrata: p, saldoACompensarInicial: D.desdeTexto(d.saldoACompensarInicial || "0") || 0, periodoSaldoInicial: d.periodoSaldoInicial });
      await guardar();
    });
    cont.querySelector("#aj-fac").addEventListener("submit", async function (e) {
      e.preventDefault();
      var d = UI.leerFormulario(e.target);
      Object.assign(cfg.facturacion, { serie: d.serie.toUpperCase().replace(/[^A-Z0-9]/g, ""), motivoExencion: d.motivoExencion, condicionesPago: d.condicionesPago, pie: d.pie });
      await guardar();
    });
  }

  async function pintar(cont, datos, ruta) {
    if (ruta[0] === "movimientos") return pintarMovimientos(cont, datos);
    if (ruta[0] === "anticipos") return pintarAnticipos(cont, datos);
    if (ruta[0] === "anticipo") return pintarAnticipo(cont, datos, ruta[1]);
    if (ruta[0] === "ajustes") return pintarAjustes(cont, datos);
    return pintarResumen(cont, datos);
  }

  WA.App.registrar({
    id: "tesoreria", titulo: "Tesorería", orden: 30, pintar: pintar,
    icono: '<path d="M3 10h18"/><path d="M5 10V20M9.5 10V20M14.5 10V20M19 10V20"/><path d="M2.5 20h19"/><path d="M12 3 21 8H3l9-5Z"/>',
  });
})(typeof self !== "undefined" ? self : this);

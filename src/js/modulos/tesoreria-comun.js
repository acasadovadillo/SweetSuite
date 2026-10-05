/*
 * webkit_asociaciones — Piezas de interfaz compartidas por Tesorería, Facturas,
 * IVA y Proyectos (WA.TesUI):
 *
 *   cargar(datos)              todo lo que hace falta, de una vez
 *   nombreCategoria/Cuenta/Proyecto(c, id)
 *   opcionesCategorias(c, tipo, conVacia) · opcionesCuentas(c) · opcionesProyectos(c)
 *   editarMovimiento(datos, c, mov, valores)   diálogo de alta/edición, con conciliación
 *   exportarExcel(c, anio)     libro de Excel con movimientos, resultados, facturas, IVA…
 *   ayuda(texto)               párrafo de «letra pequeña»
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, D = WA.Dinero, T = WA.Tesoreria, Fac = WA.Facturas;

  async function cargar(datos) {
    var r = await Promise.all(["config", "movimientos", "cuotas", "facturas", "anticipos", "proyectos", "socios", "junta", "asociacion", "actividades", "documentos"].map(function (k) {
      return k === "config" || k === "asociacion" ? datos.leer(k) : datos.listar(k);
    }));
    return { config: r[0], movimientos: r[1], cuotas: r[2], facturas: r[3], anticipos: r[4], proyectos: r[5], socios: r[6], junta: r[7], asociacion: r[8], actividades: r[9], documentos: r[10] };
  }

  var buscar = function (lista, id) { return (lista || []).filter(function (x) { return x.id === id; })[0]; };
  function nombreCategoria(c, id) { var x = buscar(c.config.categorias, id); return x ? x.nombre : id ? id : "Sin clasificar"; }
  function nombreCuenta(c, id) { var x = buscar(c.config.cuentas, id); return x ? x.nombre : id || "—"; }
  function nombreProyecto(c, id) { var x = buscar(c.proyectos, id); return x ? x.nombre : ""; }
  function nombreActividad(c, id) { var x = buscar(c.actividades, id); return x ? x.titulo : ""; }
  /** Actividades para un desplegable: las más recientes primero (y la ya elegida, aunque sea antigua). */
  function opcionesActividades(c, actual) {
    var lista = (c.actividades || []).slice().sort(function (a, b) { return String(b.inicio).localeCompare(String(a.inicio)); });
    return [["", "—"]].concat(lista.filter(function (a, i) { return i < 60 || a.id === actual; }).map(function (a) {
      return [a.id, String(a.inicio).slice(0, 10).split("-").reverse().join("/") + " · " + a.titulo];
    }));
  }

  function opcionesCategorias(c, tipo, conVacia) {
    var lista = (c.config.categorias || []).filter(function (x) { return (!tipo || x.tipo === tipo) && x.activa !== false; })
      .map(function (x) { return [x.id, x.nombre]; });
    return (conVacia === false ? [] : [["", "Sin clasificar"]]).concat(lista);
  }
  function opcionesCuentas(c) { return (c.config.cuentas || []).map(function (x) { return [x.id, x.nombre]; }); }
  function opcionesProyectos(c) {
    return [["", "—"]].concat((c.proyectos || []).filter(function (p) { return p.estado !== "cerrado"; }).map(function (p) { return [p.id, p.nombre]; }));
  }
  function ayuda(texto) { return '<p class="letra-pequena">' + esc(texto) + "</p>"; }

  /** Importe con su signo y color: verde si entra, rojo si sale. */
  function importeHtml(centimos) {
    return '<span class="' + (centimos < 0 ? "importe-negativo" : "importe-positivo") + '">' + (centimos > 0 ? "+" : "") + esc(D.formatear(centimos)) + "</span>";
  }

  // ── Alta y edición de un movimiento ──────────────────────────────────────
  /**
   * Diálogo de movimiento. mov = null para uno nuevo; valores = datos iniciales
   * (p. ej. { tipo: "anticipo", anticipoId, sentido }). Devuelve true si guardó.
   */
  async function editarMovimiento(datos, c, mov, valores) {
    var nuevo = !mov;
    var m = Object.assign({ fecha: F.hoy(), cuentaId: (c.config.cuentas[0] || {}).id, tipo: "gasto", importe: 0, concepto: "", categoriaId: "",
      proyectoId: "", actividadId: "", cuentaDestinoId: "", sentido: "salida", anticipoId: "", facturaId: "", cuotaIds: [], inscripcionIds: [], origen: "manual", conceptoBanco: "", notas: "" },
    mov || {}, valores || {});
    // Sugerencias de conciliación (solo si aún no está enlazado a nada).
    var sugerencias = !nuevo && (m.tipo === "ingreso" || m.tipo === "gasto") && !m.facturaId && !(m.cuotaIds || []).length && !(m.inscripcionIds || []).length
      ? WA.Extracto.sugerencias(m, c) : [];
    var facturasPendientes = c.facturas.filter(function (f) {
      if (f.estado === "borrador" || f.estado === "anulada") return false;
      return f.id === m.facturaId || Fac.estadoPago(f, c.movimientos, c.anticipos).pendiente > 0;
    });
    var opcFactura = function (tipo) {
      return [["", "—"]].concat(facturasPendientes.filter(function (f) { return f.tipo === tipo; }).map(function (f) {
        return [f.id, (f.numero || "s/n") + " · " + (f.tercero || {}).nombre + " · " + D.formatear(Fac.totales(f).total)];
      }));
    };
    var anticipos = [["", "—"]].concat(c.anticipos.map(function (a) { return [a.id, (a.tipo === "anticipo" ? "Anticipo" : "Reembolso") + " · " + a.persona + " · " + a.concepto]; }));
    var enlazadas = (m.cuotaIds || []).map(function (id) { return buscar(c.cuotas, id); }).filter(Boolean);
    var inscEnlazadas = (m.inscripcionIds || []).map(function (ref) {
      var p = String(ref).split(":"), a = buscar(c.actividades, p[0]);
      var i = a && (a.inscripciones || []).filter(function (x) { return x.id === p[1]; })[0];
      return i ? i.nombre + " · " + a.titulo + " (" + D.formatear(i.importe) + ")" : null;
    }).filter(Boolean);

    var r = await UI.dialogo({
      titulo: nuevo ? "Nuevo movimiento" : "Movimiento",
      contenido: '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "tipo", etiqueta: "Tipo", tipo: "select", valor: m.tipo, opciones: T.TIPOS }) +
        UI.campo({ nombre: "fecha", etiqueta: "Fecha", tipo: "date", valor: m.fecha, requerido: true }) +
        UI.campo({ nombre: "cuentaId", etiqueta: "Cuenta", tipo: "select", valor: m.cuentaId, opciones: opcionesCuentas(c) }) +
        UI.campo({ nombre: "importe", etiqueta: "Importe (€)", valor: m.importe ? D.formatear(m.importe, { simbolo: false }) : "", requerido: true, atributos: 'inputmode="decimal"', ayuda: "Siempre en positivo." }) +
        UI.campo({ nombre: "concepto", etiqueta: "Concepto", valor: m.concepto, ancho: "completo" }) +
        (m.conceptoBanco ? '<p class="detalle campo-completo">Según el banco: «' + esc(m.conceptoBanco) + "»</p>" : "") +
        '<div class="campo-completo" data-para="ingreso gasto"><div class="rejilla">' +
        UI.campo({ nombre: "categoriaIngreso", etiqueta: "Categoría", tipo: "select", valor: m.tipo === "ingreso" ? m.categoriaId : "", opciones: opcionesCategorias(c, "ingreso"), clase: "solo-ingreso" }) +
        UI.campo({ nombre: "categoriaGasto", etiqueta: "Categoría", tipo: "select", valor: m.tipo === "gasto" ? m.categoriaId : "", opciones: opcionesCategorias(c, "gasto"), clase: "solo-gasto" }) +
        UI.campo({ nombre: "proyectoId", etiqueta: "Proyecto", tipo: "select", valor: m.proyectoId, opciones: opcionesProyectos(c) }) +
        UI.campo({ nombre: "actividadId", etiqueta: "Actividad", tipo: "select", valor: m.actividadId, opciones: opcionesActividades(c, m.actividadId) }) +
        UI.campo({ nombre: "facturaEmitida", etiqueta: "Cobro de la factura", tipo: "select", valor: m.tipo === "ingreso" ? m.facturaId : "", opciones: opcFactura("emitida"), clase: "solo-ingreso" }) +
        UI.campo({ nombre: "facturaRecibida", etiqueta: "Pago de la factura", tipo: "select", valor: m.tipo === "gasto" ? m.facturaId : "", opciones: opcFactura("recibida"), clase: "solo-gasto" }) +
        "</div></div>" +
        '<div class="campo-completo" data-para="traspaso">' +
        UI.campo({ nombre: "cuentaDestinoId", etiqueta: "A la cuenta", tipo: "select", valor: m.cuentaDestinoId, opciones: opcionesCuentas(c) }) + "</div>" +
        '<div class="campo-completo" data-para="anticipo"><div class="rejilla">' +
        UI.campo({ nombre: "sentido", etiqueta: "Sentido", tipo: "select", valor: m.sentido, opciones: [["salida", "La asociación da dinero a la persona"], ["entrada", "La persona devuelve dinero"]] }) +
        UI.campo({ nombre: "anticipoId", etiqueta: "Anticipo o reembolso", tipo: "select", valor: m.anticipoId, opciones: anticipos }) +
        "</div>" + ayuda("Entregar un anticipo, pagar un reembolso o recibir la devolución del sobrante no es un gasto ni un ingreso: solo mueve dinero. El gasto son los tickets que se justifican en el anticipo o reembolso.") + "</div>" +
        (inscEnlazadas.length ? '<p class="campo-completo detalle">Corresponde a las inscripciones: ' + esc(inscEnlazadas.join(", ")) + "</p>" : "") +
        (enlazadas.length ? '<p class="campo-completo detalle">Corresponde a las cuotas: ' + esc(enlazadas.map(function (q) { return q.socioNombre + " (" + D.formatear(q.importe) + ")"; }).join(", ")) + "</p>" : "") +
        (sugerencias.length ? '<fieldset class="campo-completo"><legend>¿Corresponde a…?</legend>' + sugerencias.slice(0, 6).map(function (s) {
          return '<label class="casilla"><input type="checkbox" name="sug-' + esc(s.tipo) + "-" + esc(s.id) + '"><span>' + esc(s.texto) + "</span></label>";
        }).join("") + "</fieldset>" : "") +
        UI.campo({ nombre: "notas", etiqueta: "Notas", valor: m.notas, ancho: "completo" }) +
        "</div></form>",
      botones: (nuevo || m.virtual ? [] : [{ texto: "Borrar", valor: "borrar", estilo: "btn-peligro-suave" }])
        .concat([{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }]),
      alAbrir: function (d) {
        var f = d.querySelector("form");
        var ver = function () {
          var tipo = f.elements.tipo.value;
          d.querySelectorAll("[data-para]").forEach(function (x) { x.hidden = x.getAttribute("data-para").split(" ").indexOf(tipo) < 0; });
          d.querySelectorAll(".solo-ingreso").forEach(function (x) { x.hidden = tipo !== "ingreso"; });
          d.querySelectorAll(".solo-gasto").forEach(function (x) { x.hidden = tipo !== "gasto"; });
        };
        f.elements.tipo.addEventListener("change", ver);
        ver();
      },
      validar: function (form) {
        var d = UI.leerFormulario(form), ok = true;
        var imp = D.desdeTexto(d.importe);
        UI.marcarError(form, "importe", imp > 0 ? "" : "Escribe un importe mayor que cero."); if (!(imp > 0)) ok = false;
        UI.marcarError(form, "fecha", F.esValida(d.fecha) ? "" : "Pon la fecha."); if (!F.esValida(d.fecha)) ok = false;
        var mismo = d.tipo === "traspaso" && d.cuentaDestinoId === d.cuentaId;
        UI.marcarError(form, "cuentaDestinoId", mismo ? "Elige otra cuenta distinta." : ""); if (mismo) ok = false;
        return ok;
      },
    });

    if (r.valor === "borrar") {
      if (!(await UI.confirmar("Se borrará este movimiento. Las cuotas que tuviera enlazadas seguirán pagadas.", { titulo: "Borrar movimiento", aceptar: "Borrar", peligro: true }))) return false;
      await datos.borrar("movimientos", m.id);
      UI.aviso("Movimiento borrado.");
      return true;
    }
    if (r.valor !== "enviar") return false;
    var d = r.datos;
    m.tipo = d.tipo; m.fecha = d.fecha; m.cuentaId = d.cuentaId; m.importe = D.desdeTexto(d.importe);
    m.concepto = d.concepto; m.notas = d.notas; m.proyectoId = d.tipo === "ingreso" || d.tipo === "gasto" ? d.proyectoId : "";
    m.actividadId = d.tipo === "ingreso" || d.tipo === "gasto" ? d.actividadId : "";
    m.categoriaId = d.tipo === "ingreso" ? d.categoriaIngreso : d.tipo === "gasto" ? d.categoriaGasto : "";
    m.facturaId = d.tipo === "ingreso" ? d.facturaEmitida : d.tipo === "gasto" ? d.facturaRecibida : "";
    m.cuentaDestinoId = d.tipo === "traspaso" ? d.cuentaDestinoId : "";
    m.sentido = d.tipo === "anticipo" ? d.sentido : "";
    m.anticipoId = d.tipo === "anticipo" ? d.anticipoId : "";
    if (d.tipo !== "ingreso") { m.cuotaIds = []; m.inscripcionIds = []; }

    // Sugerencias marcadas: cuotas (se marcan pagadas) o una factura.
    var cuotasElegidas = [], inscripcionesElegidas = [], facturaElegida = "";
    Object.keys(d).forEach(function (k) {
      if (!d[k] || k.indexOf("sug-") !== 0) return;
      var partes = k.split("-"), tipo = partes[1], id = partes.slice(2).join("-");
      if (tipo === "cuota") cuotasElegidas.push(buscar(c.cuotas, id));
      if (tipo === "inscripcion") inscripcionesElegidas.push({ actividadId: id.split(":")[0], inscripcionId: id.split(":")[1] });
      if (tipo === "factura") facturaElegida = id;
    });
    if (facturaElegida) m.facturaId = facturaElegida;
    if (m.facturaId && !m.categoriaId) m.categoriaId = (buscar(c.facturas, m.facturaId) || {}).categoriaId || "";
    if (cuotasElegidas.length) {
      var con = T.conciliarCuotas(m, cuotasElegidas.filter(Boolean));
      m = con.movimiento;
      await datos.guardarVarios("cuotas", con.cuotas);
      if (con.diferencia) UI.aviso("Ojo: las cuotas suman " + D.formatear(m.importe - con.diferencia) + " y el movimiento es de " + D.formatear(m.importe) + ".", "info");
    }
    if (inscripcionesElegidas.length) {
      var ci = T.conciliarInscripciones(m, inscripcionesElegidas, c.actividades);
      m = ci.movimiento;
      await datos.guardarVarios("actividades", ci.actividades);
      if (ci.diferencia) UI.aviso("Ojo: las inscripciones suman " + D.formatear(m.importe - ci.diferencia) + " y el movimiento es de " + D.formatear(m.importe) + ".", "info");
    }
    if (!m.concepto) m.concepto = m.conceptoBanco || "";
    await datos.guardar("movimientos", m);
    UI.aviso(nuevo ? "Movimiento apuntado." : "Movimiento guardado.");
    return true;
  }

  // ── Excel ────────────────────────────────────────────────────────────────
  var ESTADO_FACTURA = { borrador: "Borrador", pendiente: "Pendiente", parcial: "Pagada en parte", cobrada: "Cobrada", pagada: "Pagada", anulada: "Anulada" };
  function exportarExcel(c, anio) {
    var desde = anio + "-01-01", hasta = anio + "-12-31";
    var enAnio = function (f) { return f >= desde && f <= hasta; };
    var hojas = [];
    var lib = T.libro(c.movimientos, c.cuotas, c.actividades).filter(function (m) { return enAnio(m.fecha); }).reverse();
    hojas.push({ nombre: "Movimientos " + anio, columnas: [
      { titulo: "Fecha", tipo: "fecha" }, { titulo: "Cuenta" }, { titulo: "Tipo", ancho: 14 }, { titulo: "Concepto", ancho: 40 }, { titulo: "Categoría" },
      { titulo: "Proyecto" }, { titulo: "Actividad" }, { titulo: "Importe", tipo: "dinero" }, { titulo: "Según el banco", ancho: 40 }],
      filas: lib.map(function (m) {
        return [m.fecha, nombreCuenta(c, m.cuentaId), (T.TIPOS.filter(function (t) { return t[0] === m.tipo; })[0] || [])[1] + (m.tipo === "traspaso" ? " → " + nombreCuenta(c, m.cuentaDestinoId) : ""),
          m.concepto, m.tipo === "ingreso" || m.tipo === "gasto" ? nombreCategoria(c, m.categoriaId) : "", nombreProyecto(c, m.proyectoId), nombreActividad(c, m.actividadId), T.conSigno(m), m.conceptoBanco || ""];
      }) });
    var todasPartidas = T.partidas(c.movimientos, c.cuotas, c.anticipos, c.actividades);
    var res = T.resultados(todasPartidas, desde, hasta);
    var filasRes = [];
    Object.keys(res.ingresos).forEach(function (k) { filasRes.push(["Ingreso", nombreCategoria(c, k), res.ingresos[k]]); });
    Object.keys(res.gastos).forEach(function (k) { filasRes.push(["Gasto", nombreCategoria(c, k), res.gastos[k]]); });
    filasRes.push(["", "Total ingresos", res.totalIngresos], ["", "Total gastos", res.totalGastos], ["", "Resultado", res.resultado]);
    hojas.push({ nombre: "Ingresos y gastos " + anio, columnas: [{ titulo: "Tipo", ancho: 12 }, { titulo: "Categoría", ancho: 36 }, { titulo: "Importe", tipo: "dinero" }], filas: filasRes });
    ["emitida", "recibida"].forEach(function (tipo) {
      var lista = c.facturas.filter(function (f) { return f.tipo === tipo && f.estado !== "borrador" && enAnio(f.fecha); })
        .sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
      hojas.push({ nombre: "Facturas " + (tipo === "emitida" ? "emitidas" : "recibidas"), columnas: [
        { titulo: "Fecha", tipo: "fecha" }, { titulo: "Número", ancho: 14 }, { titulo: tipo === "emitida" ? "Cliente" : "Proveedor" }, { titulo: "NIF", ancho: 12 },
        { titulo: "Base 21 %", tipo: "dinero" }, { titulo: "IVA 21 %", tipo: "dinero" }, { titulo: "Base 10 %", tipo: "dinero" }, { titulo: "IVA 10 %", tipo: "dinero" },
        { titulo: "Base 4 %", tipo: "dinero" }, { titulo: "IVA 4 %", tipo: "dinero" }, { titulo: "Base 0 %", tipo: "dinero" },
        { titulo: "Exento", tipo: "dinero" }, { titulo: "No sujeto", tipo: "dinero" }, { titulo: "Retención", tipo: "dinero" }, { titulo: "Total", tipo: "dinero" },
        { titulo: "Estado", ancho: 12 }],
        filas: lista.map(function (f) {
          var t = Fac.totales(f);
          var g = function (tipoIva, campo) { var x = t.porTipo.filter(function (p) { return p.tratamiento === "sujeto" && p.tipoIva === tipoIva; })[0]; return x ? x[campo] : 0; };
          return [f.fecha, f.numero, (f.tercero || {}).nombre, (f.tercero || {}).nif, g(21, "base"), g(21, "cuota"), g(10, "base"), g(10, "cuota"), g(4, "base"), g(4, "cuota"), g(0, "base"),
            t.baseExenta, t.baseNoSujeta, t.retencion, t.total, ESTADO_FACTURA[f.estado === "anulada" ? "anulada" : Fac.estadoPago(f, c.movimientos, c.anticipos).estado]];
        }) });
    });
    var iva = WA.IVA.resumenAnual(c.facturas, c.config, anio);
    hojas.push({ nombre: "IVA " + anio, columnas: [{ titulo: "Trimestre", ancho: 12 }, { titulo: "IVA devengado", tipo: "dinero" }, { titulo: "IVA deducible", tipo: "dinero" },
      { titulo: "Compensado de antes", tipo: "dinero" }, { titulo: "Resultado", tipo: "dinero" }, { titulo: "Situación", ancho: 14 }, { titulo: "Queda a compensar", tipo: "dinero" },
      { titulo: "Retenciones IRPF", tipo: "dinero" }],
      filas: iva.trimestres.map(function (t) {
        return [t.clave, t.devengado, t.deducible, t.compensacionAplicada || 0, t.resultado || 0, t.situacion, t.quedaACompensar || 0, t.retenciones];
      }) });
    var prev = (c.config.presupuestos || {})[anio] || {};
    var ej = T.ejecucion(prev, res, c.config.categorias);
    hojas.push({ nombre: "Presupuesto " + anio, columnas: [{ titulo: "Tipo", ancho: 12 }, { titulo: "Categoría", ancho: 36 }, { titulo: "Previsto", tipo: "dinero" },
      { titulo: "Realizado", tipo: "dinero" }, { titulo: "Diferencia", tipo: "dinero" }],
      filas: ej.filas.map(function (f) { return [f.tipo === "ingreso" ? "Ingreso" : "Gasto", f.nombre, f.previsto, f.realizado, f.diferencia]; }) });
    hojas.push({ nombre: "Anticipos y reembolsos", columnas: [{ titulo: "Tipo", ancho: 12 }, { titulo: "Persona" }, { titulo: "Fecha", tipo: "fecha" }, { titulo: "Concepto", ancho: 36 },
      { titulo: "Entregado", tipo: "dinero" }, { titulo: "Justificado", tipo: "dinero" }, { titulo: "Devuelto", tipo: "dinero" }, { titulo: "Saldo", tipo: "dinero" }],
      filas: c.anticipos.filter(function (a) { return enAnio(a.fecha); }).map(function (a) {
        var s = T.situacionAnticipo(a, c.movimientos);
        return [a.tipo === "anticipo" ? "Anticipo" : "Reembolso", a.persona, a.fecha, a.concepto, s.entregado, s.justificado, s.devuelto, s.saldo];
      }) });
    hojas.push({ nombre: "Actividades " + anio, columnas: [{ titulo: "Fecha", tipo: "fecha" }, { titulo: "Actividad", ancho: 36 }, { titulo: "Estado", ancho: 12 },
      { titulo: "Inscritos", tipo: "numero" }, { titulo: "Asistentes", tipo: "numero" }, { titulo: "Menores", tipo: "numero" },
      { titulo: "Ingresos", tipo: "dinero" }, { titulo: "Gastos", tipo: "dinero" }, { titulo: "Resultado", tipo: "dinero" }],
      filas: (c.actividades || []).filter(function (a) { return enAnio(String(a.inicio).slice(0, 10)); })
        .sort(function (a, b) { return String(a.inicio).localeCompare(String(b.inicio)); }).map(function (a) {
          var r = WA.Actividades.resumen(a, c.socios), b = WA.Actividades.balance(a.id, todasPartidas);
          return [String(a.inicio).slice(0, 10), a.titulo, WA.Actividades.ESTADOS[a.estado], r.inscritas, r.asistentes, r.menores, b.ingresos, b.gastos, b.resultado];
        }) });
    var bytes = WA.XLSX.escribir(hojas);
    UI.descargar("tesoreria-" + anio + "-descargado-" + F.hoy() + ".xlsx", new Blob([bytes], { type: WA.XLSX.TIPO_MIME }));
  }

  WA.TesUI = {
    cargar: cargar, nombreCategoria: nombreCategoria, nombreCuenta: nombreCuenta, nombreProyecto: nombreProyecto,
    nombreActividad: nombreActividad, opcionesActividades: opcionesActividades,
    opcionesCategorias: opcionesCategorias, opcionesCuentas: opcionesCuentas, opcionesProyectos: opcionesProyectos,
    editarMovimiento: editarMovimiento, exportarExcel: exportarExcel, ayuda: ayuda, importeHtml: importeHtml, buscar: buscar,
  };
})(typeof self !== "undefined" ? self : this);

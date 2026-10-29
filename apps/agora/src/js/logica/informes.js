/*
 * webkit_asociaciones — Informes: memoria anual, cuentas y panel (sin interfaz:
 * tests/informes.test.js).
 *
 * Todas las funciones reciben «c», un objeto con lo que hay en los datos:
 *   { asociacion, config, junta, socios, cuotas, movimientos, facturas, anticipos,
 *     proyectos, actividades, actas, obligaciones, documentos }
 *
 * ⚠️ Las cuentas salen de la tesorería, que va por CRITERIO DE CAJA (cuenta el
 * dinero cuando entra o sale, con IVA). Sirven para informar a la asamblea, pero
 * las cuentas anuales formales de una entidad sin fines lucrativos se llevan por
 * devengo y con partida doble: verificar con asesoría.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { F: require("../nucleo/fechas.js"), D: require("../nucleo/dinero.js"), S: require("./socios.js"), C: require("./cuotas.js"),
        A: require("./actividades.js"), T: require("./tesoreria.js"), Fac: require("./facturas.js"), IVA: require("./iva.js"), Ac: require("./actas.js") }
    : { F: raiz.WA.Fechas, D: raiz.WA.Dinero, S: raiz.WA.Socios, C: raiz.WA.Cuotas, A: raiz.WA.Actividades, T: raiz.WA.Tesoreria,
        Fac: raiz.WA.Facturas, IVA: raiz.WA.IVA, Ac: raiz.WA.Actas };
  var modulo = fabrica(dep);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Informes = modulo;
})(typeof self !== "undefined" ? self : this, function (x) {
  "use strict";
  var F = x.F, D = x.D, S = x.S, C = x.C, A = x.A, T = x.T, Fac = x.Fac, IVA = x.IVA, Ac = x.Ac;

  // ── Modelo de cuenta de resultados de entidades sin fines lucrativos ─────
  /*
   * Partidas (resumidas) del modelo abreviado de cuenta de resultados del plan de
   * contabilidad de entidades sin fines lucrativos, para agrupar las categorías.
   * Es una APROXIMACIÓN para orientarse: la asignación de cada categoría y el
   * modelo exacto aplicable hay que verificarlos con asesoría.
   */
  var PARTIDAS = [
    { id: "1a", grupo: "explotacion", signo: 1, texto: "1. a) Cuotas de asociados y afiliados" },
    { id: "1b", grupo: "explotacion", signo: 1, texto: "1. b) Aportaciones de usuarios" },
    { id: "1c", grupo: "explotacion", signo: 1, texto: "1. c) Ingresos de promociones, patrocinadores y colaboraciones" },
    { id: "1d", grupo: "explotacion", signo: 1, texto: "1. d) Subvenciones, donaciones y legados imputados al excedente del ejercicio" },
    { id: "2", grupo: "explotacion", signo: 1, texto: "2. Ventas y otros ingresos ordinarios de la actividad mercantil" },
    { id: "7", grupo: "explotacion", signo: 1, texto: "7. Otros ingresos de la actividad" },
    { id: "3", grupo: "explotacion", signo: -1, texto: "3. Gastos por ayudas y otros" },
    { id: "6", grupo: "explotacion", signo: -1, texto: "6. Aprovisionamientos" },
    { id: "8", grupo: "explotacion", signo: -1, texto: "8. Gastos de personal" },
    { id: "9", grupo: "explotacion", signo: -1, texto: "9. Otros gastos de la actividad" },
    { id: "14", grupo: "financiero", signo: 1, texto: "14. Ingresos financieros" },
    { id: "15", grupo: "financiero", signo: -1, texto: "15. Gastos financieros" },
    { id: "19", grupo: "impuestos", signo: -1, texto: "19. Impuestos sobre beneficios" },
  ];
  /** Partida por defecto de las categorías con las que empieza la aplicación. */
  var PARTIDA_POR_DEFECTO = {
    cuotas: "1a", inscripciones: "1b", donaciones: "1d", subvenciones: "1d", ventas: "2", servicios: "2", "otros-ingresos": "7",
    actividades: "9", material: "6", seguros: "9", banco: "9", web: "9", administracion: "9", difusion: "9", desplazamientos: "9",
    profesionales: "9", impuestos: "9", "otros-gastos": "9",
  };

  // ── Utilidades ──────────────────────────────────────────────────────────
  var limites = function (anio) { return { desde: anio + "-01-01", hasta: anio + "-12-31" }; };
  var suma = function (l) { return D.sumar(l); };

  /** Junta vigente en una fecha. */
  function juntaEn(junta, fecha) {
    return (junta || []).filter(function (j) { return j.desde && j.desde <= fecha && (!j.hasta || j.hasta > fecha); });
  }

  // ── Socios ──────────────────────────────────────────────────────────────
  /** Cifras de socios de un año: a 31/12, altas, bajas, por tipo, sexo y edad. */
  function socios(c, anio) {
    var l = limites(anio);
    var tipos = {};
    (c.config.tiposSocio || []).forEach(function (t) { tipos[t.id] = t.nombre; });
    var activos = (c.socios || []).filter(function (s) { return S.activoEn(s, l.hasta); });
    var contar = function (lista, clave) {
      var o = {};
      lista.forEach(function (s) { var k = clave(s) || "Sin indicar"; o[k] = (o[k] || 0) + 1; });
      return o;
    };
    var tramo = function (s) {
      var e = S.edad(s.fechaNacimiento, l.hasta);
      if (e === null) return "Sin indicar";
      return e < 18 ? "Menores de 18" : e < 30 ? "18 a 29" : e < 65 ? "30 a 64" : "65 o más";
    };
    return {
      activos: activos.length,
      inicio: (c.socios || []).filter(function (s) { return S.activoEn(s, F.sumarDias(l.desde, -1)); }).length,
      altas: (c.socios || []).filter(function (s) { return s.fechaAlta >= l.desde && s.fechaAlta <= l.hasta; }).length,
      bajas: (c.socios || []).filter(function (s) { return s.fechaBaja && s.fechaBaja >= l.desde && s.fechaBaja <= l.hasta; }).length,
      porTipo: contar(activos, function (s) { return tipos[s.tipoSocioId]; }),
      porSexo: contar(activos, function (s) { return s.sexo; }),
      porEdad: contar(activos, tramo),
    };
  }

  // ── Memoria anual ───────────────────────────────────────────────────────
  function memoria(c, anio) {
    var l = limites(anio);
    var porId = {};
    (c.socios || []).forEach(function (s) { porId[s.id] = s; });
    var acts = A.ordenar(c.actividades).filter(function (a) { var f = A.fechaDe(a); return f >= l.desde && f <= l.hasta && a.estado !== "cancelada"; });
    var partidas = T.partidas(c.movimientos, c.cuotas, c.anticipos, c.actividades);
    var filasAct = acts.map(function (a) {
      var r = A.resumen(a, c.socios);
      return { id: a.id, titulo: a.titulo, tipo: a.tipo, fecha: A.fechaDe(a), lugar: a.lugar, estado: a.estado, inscritas: r.inscritas,
        asistentes: r.asistentes, menores: r.menores, proyecto: ((c.proyectos || []).filter(function (p) { return p.id === a.proyectoId; })[0] || {}).nombre || "",
        balance: A.balance(a.id, partidas) };
    });
    // Personas distintas que han participado (socios por su id; los demás, por nombre y contacto).
    var personas = {};
    acts.forEach(function (a) {
      (a.inscripciones || []).forEach(function (i) { if (i.estado === "inscrita") personas[i.socioId || (i.nombre + "|" + i.contacto).toLowerCase()] = true; });
    });
    var proys = (c.proyectos || []).filter(function (p) {
      var ini = p.fechaInicio || "0000", fin = p.fechaFin || "9999";
      return ini <= l.hasta && fin >= l.desde;
    }).map(function (p) {
      var parts = partidas.filter(function (q) { return q.proyectoId === p.id && q.fecha >= l.desde && q.fecha <= l.hasta; });
      var res = T.resultados(parts);
      var ej = T.ejecucion(p.presupuesto || {}, res, c.config.categorias);
      return { id: p.id, nombre: p.nombre, tipo: p.tipo, financiador: p.financiador, estadoSubvencion: p.estadoSubvencion || "", concedido: p.importeConcedido || 0,
        gastoPrevisto: ej.gastos.previsto, gastoRealizado: res.totalGastos, ingresos: res.totalIngresos };
    });
    var organos = {};
    (c.config.organos || []).forEach(function (o) { organos[o.id] = o.nombre; });
    var actas = (c.actas || []).filter(function (a) { return a.fecha >= l.desde && a.fecha <= l.hasta; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
    var reuniones = {};
    actas.forEach(function (a) { var n = organos[a.organoId] || "Otros"; reuniones[n] = (reuniones[n] || 0) + 1; });
    // En orden cronológico, y dentro de cada acta, en el orden de sus puntos.
    var acuerdos = Ac.acuerdos(actas, c.config.organos).sort(function (x, y) {
      return String(x.fecha).localeCompare(String(y.fecha)) || String(x.numero).localeCompare(String(y.numero)) || x.punto - y.punto;
    });
    var textos = ((c.config.memorias || {})[anio]) || {};
    return {
      anio: anio, asociacion: c.asociacion, textos: { presentacion: textos.presentacion || "", fines: textos.fines || "", valoracion: textos.valoracion || "" },
      junta: juntaEn(c.junta, l.hasta), cambiosJunta: (c.junta || []).filter(function (j) { return (j.desde >= l.desde && j.desde <= l.hasta) || (j.hasta && j.hasta >= l.desde && j.hasta <= l.hasta); }),
      socios: socios(c, anio),
      actividades: filasAct,
      totalesActividades: {
        n: filasAct.length, inscripciones: suma(filasAct.map(function (a) { return a.inscritas; })), asistentes: suma(filasAct.map(function (a) { return a.asistentes; })),
        menores: suma(filasAct.map(function (a) { return a.menores; })), personasDistintas: Object.keys(personas).length,
      },
      proyectos: proys, reuniones: reuniones, nActas: actas.length, acuerdos: acuerdos,
    };
  }

  // ── Cuentas ─────────────────────────────────────────────────────────────
  /** ¿Cuánto quedaba por cobrar o pagar en una fecha? (situación a 31/12, aunque se cobrara después) */
  function pendientesEn(c, fecha) {
    var cuotas = (c.cuotas || []).filter(function (q) {
      if (q.estado === "anulada" || q.fechaEmision > fecha) return false;
      return !q.pago || q.pago.fecha > fecha;
    });
    var inscripciones = [];
    (c.actividades || []).forEach(function (a) {
      if (A.fechaDe(a) > fecha) return;
      (a.inscripciones || []).forEach(function (i) {
        if (i.estado !== "inscrita" || !(i.importe > 0)) return;
        if (!i.pago || i.pago.fecha > fecha) inscripciones.push({ actividad: a.titulo, nombre: i.nombre, importe: i.importe });
      });
    });
    var movsHasta = (c.movimientos || []).filter(function (m) { return m.fecha <= fecha; });
    var antHasta = (c.anticipos || []).map(function (a) { return Object.assign({}, a, { gastos: (a.gastos || []).filter(function (g) { return g.fecha <= fecha; }) }); });
    var fact = { emitidas: [], recibidas: [] };
    (c.facturas || []).forEach(function (f) {
      if (f.estado === "borrador" || f.estado === "anulada" || f.fecha > fecha) return;
      var e = Fac.estadoPago(f, movsHasta, antHasta);
      if (e.pendiente > 0) fact[f.tipo === "emitida" ? "emitidas" : "recibidas"].push({ numero: f.numero, tercero: (f.tercero || {}).nombre, pendiente: e.pendiente });
    });
    var anticipos = { personasDeben: [], seLesDebe: [] };
    (c.anticipos || []).forEach(function (a) {
      if (a.fecha > fecha) return;
      var s = T.situacionAnticipo(antHasta.filter(function (y) { return y.id === a.id; })[0], movsHasta);
      if (s.saldo > 0) anticipos.personasDeben.push({ persona: a.persona, concepto: a.concepto, importe: s.saldo });
      if (s.saldo < 0) anticipos.seLesDebe.push({ persona: a.persona, concepto: a.concepto, importe: -s.saldo });
    });
    var anio = +fecha.slice(0, 4);
    var iva = IVA.resumenAnual(c.facturas, c.config, anio);
    return {
      cuotas: { n: cuotas.length, importe: suma(cuotas.map(function (q) { return q.importe; })) },
      inscripciones: { n: inscripciones.length, importe: suma(inscripciones.map(function (i) { return i.importe; })) },
      facturasEmitidas: { lista: fact.emitidas, importe: suma(fact.emitidas.map(function (f) { return f.pendiente; })) },
      facturasRecibidas: { lista: fact.recibidas, importe: suma(fact.recibidas.map(function (f) { return f.pendiente; })) },
      anticipos: { personasDeben: anticipos.personasDeben, seLesDebe: anticipos.seLesDebe,
        importeDeben: suma(anticipos.personasDeben.map(function (a) { return a.importe; })), importeSeLesDebe: suma(anticipos.seLesDebe.map(function (a) { return a.importe; })) },
      ivaACompensar: c.config.iva && c.config.iva.presenta ? iva.quedaACompensar : 0,
    };
  }

  /** Agrupa ingresos y gastos (por categoría) en las partidas del modelo ESFL. */
  function cuentaEsfl(res, categorias) {
    var porCat = {};
    (categorias || []).forEach(function (k) { porCat[k.id] = k; });
    var importes = {}, sinPartida = [];
    var poner = function (catId, importe, tipo) {
      var cat = porCat[catId] || {};
      var partida = cat.partida || PARTIDA_POR_DEFECTO[catId];
      if (!partida) { sinPartida.push({ categoria: cat.nombre || (catId || "Sin clasificar"), tipo: tipo, importe: importe }); partida = tipo === "ingreso" ? "7" : "9"; }
      importes[partida] = (importes[partida] || 0) + importe;
    };
    Object.keys(res.ingresos).forEach(function (k) { poner(k, res.ingresos[k], "ingreso"); });
    Object.keys(res.gastos).forEach(function (k) { poner(k, res.gastos[k], "gasto"); });
    var lineas = PARTIDAS.map(function (p) { return { id: p.id, texto: p.texto, grupo: p.grupo, importe: p.signo * (importes[p.id] || 0) }; });
    var total = function (grupo) { return suma(lineas.filter(function (l) { return l.grupo === grupo; }).map(function (l) { return l.importe; })); };
    var actividad = total("explotacion"), financiero = total("financiero"), impuestos = total("impuestos");
    return { lineas: lineas, excedenteActividad: actividad, excedenteFinanciero: financiero, antesImpuestos: actividad + financiero,
      excedente: actividad + financiero + impuestos, sinPartida: sinPartida };
  }

  function cuentas(c, anio) {
    var l = limites(anio), la = limites(anio - 1);
    var partidas = T.partidas(c.movimientos, c.cuotas, c.anticipos, c.actividades);
    var res = T.resultados(partidas, l.desde, l.hasta);
    var resAnterior = T.resultados(partidas, la.desde, la.hasta);
    var inicio = T.saldos(c.config.cuentas, c.movimientos, c.cuotas, F.sumarDias(l.desde, -1), c.actividades);
    var fin = T.saldos(c.config.cuentas, c.movimientos, c.cuotas, l.hasta, c.actividades);
    var presupuesto = T.ejecucion(((c.config.presupuestos || {})[anio]) || {}, res, c.config.categorias);
    var pend = pendientesEn(c, l.hasta);
    // Estado de situación simplificado a 31/12 (no es el balance oficial).
    var activo = { tesoreria: fin.total, cuotas: pend.cuotas.importe, inscripciones: pend.inscripciones.importe, clientes: pend.facturasEmitidas.importe,
      anticipos: pend.anticipos.importeDeben, iva: pend.ivaACompensar };
    var pasivo = { proveedores: pend.facturasRecibidas.importe, personas: pend.anticipos.importeSeLesDebe };
    var totalActivo = suma(Object.keys(activo).map(function (k) { return activo[k]; }));
    var totalPasivo = suma(Object.keys(pasivo).map(function (k) { return pasivo[k]; }));
    return {
      anio: anio, resultados: res, anterior: resAnterior, saldosInicio: inicio, saldosFin: fin, presupuesto: presupuesto, pendientes: pend,
      esfl: cuentaEsfl(res, c.config.categorias),
      situacion: { activo: activo, pasivo: pasivo, totalActivo: totalActivo, totalPasivo: totalPasivo, neto: totalActivo - totalPasivo },
    };
  }

  // ── Panel y series para gráficas ────────────────────────────────────────
  /** Últimos días de los n meses que acaban en el mes de «hoy» (incluido). */
  function finesDeMes(hoy, n) {
    var a = +hoy.slice(0, 4), m = +hoy.slice(5, 7), out = [];
    for (var k = n - 1; k >= 0; k--) {
      var d = new Date(a, m - 1 - k + 1, 0);
      var iso = F.aISO(d);
      out.push(iso > hoy ? hoy : iso);
    }
    return out;
  }

  function panel(c, hoy) {
    var h = hoy || F.hoy(), anio = +h.slice(0, 4), l = limites(anio);
    var partidas = T.partidas(c.movimientos, c.cuotas, c.anticipos, c.actividades);
    var res = T.resultados(partidas, l.desde, l.hasta);
    var s = T.saldos(c.config.cuentas, c.movimientos, c.cuotas, h, c.actividades);
    var prev = ((c.config.presupuestos || {})[anio]) || {};
    var ej = T.ejecucion(prev, res, c.config.categorias);
    var cuotasAnio = (c.cuotas || []).filter(function (q) { return String(q.periodo).slice(0, 4) === String(anio); });
    var rc = C.resumen(cuotasAnio);
    var meses = finesDeMes(h, 12);
    return {
      saldo: s, ingresos: res.totalIngresos, gastos: res.totalGastos, resultado: res.resultado,
      presupuestoGastos: ej.gastos, presupuestoIngresos: ej.ingresos,
      socios: { activos: (c.socios || []).filter(function (x) { return S.activoEn(x, h); }).length,
        altas: (c.socios || []).filter(function (x) { return x.fechaAlta >= l.desde && x.fechaAlta <= h; }).length,
        bajas: (c.socios || []).filter(function (x) { return x.fechaBaja && x.fechaBaja >= l.desde && x.fechaBaja <= h; }).length },
      cuotas: { cobrado: rc.cobrado, pendiente: rc.pendiente, emitido: rc.emitido, deudaTotal: suma(C.deudores(c.cuotas).map(function (d) { return d.total; })) },
      subvencionesEnMarcha: (c.proyectos || []).filter(function (p) { return p.tipo === "subvencion" && ["preparando", "solicitada", "concedida", "justificando"].indexOf(p.estadoSubvencion || "idea") >= 0; }),
      serieSaldo: meses.map(function (f) { return { fecha: f, valor: T.saldos(c.config.cuentas, c.movimientos, c.cuotas, f, c.actividades).total }; }),
      serieSocios: meses.map(function (f) { return { fecha: f, valor: (c.socios || []).filter(function (x) { return S.activoEn(x, f); }).length }; }),
    };
  }

  return { PARTIDAS: PARTIDAS, PARTIDA_POR_DEFECTO: PARTIDA_POR_DEFECTO, juntaEn: juntaEn, socios: socios, memoria: memoria,
    pendientesEn: pendientesEn, cuentaEsfl: cuentaEsfl, cuentas: cuentas, finesDeMes: finesDeMes, panel: panel };
});

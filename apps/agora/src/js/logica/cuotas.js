/*
 * Agora — Lógica de cuotas (sin interfaz: se prueba en tests/cuotas.test.js).
 *
 * TIPOS DE SOCIO (en la configuración): { id, nombre, cuota (céntimos por periodo),
 *   periodicidad: "anual" | "semestral" | "trimestral" | "mensual", activo }
 *
 * PERIODOS: cada cuota pertenece a un periodo con una clave de texto:
 *   anual "2026" · semestral "2026-S1" · trimestral "2026-T3" · mensual "2026-03"
 *
 * CUOTA: { id, socioId, socioNumero, socioNombre, tipoSocioId, periodo, concepto,
 *          importe (céntimos), fechaEmision, remesaId,
 *          estado: "pendiente" | "pagada" | "devuelta" | "anulada",
 *          pago: { fecha, forma, cuentaId, referencia } | null,
 *          historial: [{ fecha, accion, detalle }] }
 *   · El número y el nombre del socio se copian en la cuota: si el socio se
 *     borra (derecho de supresión), el registro contable sigue teniendo sentido.
 *   · «devuelta» = recibo domiciliado que el banco devolvió: cuenta como deuda.
 *   · «anulada» = ya no se debe (p. ej. baja): no cuenta como deuda.
 *
 * CONTABILIDAD: una cuota PAGADA es un ingreso. aMovimientos() la traduce al
 * formato de movimiento que usará la tesorería (Fase 3), de modo que las cuotas
 * se reflejan en las cuentas sin apuntarlas dos veces.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { Fechas: require("../nucleo/fechas.js"), Dinero: require("../nucleo/dinero.js"), Socios: require("./socios.js") }
    : { Fechas: raiz.WA.Fechas, Dinero: raiz.WA.Dinero, Socios: raiz.WA.Socios };
  var modulo = fabrica(dep.Fechas, dep.Dinero, dep.Socios);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Cuotas = modulo;
})(typeof self !== "undefined" ? self : this, function (F, D, S) {
  "use strict";

  var PERIODICIDADES = [
    ["anual", "Anual"], ["semestral", "Semestral"], ["trimestral", "Trimestral"], ["mensual", "Mensual"],
  ];
  var ESTADOS = { pendiente: "Pendiente", pagada: "Pagada", devuelta: "Devuelta", anulada: "Anulada" };
  var CATEGORIA_CONTABLE = "Cuotas de socios";

  var dos = function (n) { return String(n).padStart(2, "0"); };
  var ultimoDia = function (a, m) { return new Date(a, m, 0).getDate(); }; // m: 1–12

  // ── Periodos ─────────────────────────────────────────────────────────────
  /** Clave de periodo → { clave, periodicidad, anio, inicio, fin, etiqueta } o null. */
  function periodo(clave) {
    var c = String(clave || ""), m;
    if ((m = /^(\d{4})$/.exec(c))) {
      return { clave: c, periodicidad: "anual", anio: +m[1], inicio: m[1] + "-01-01", fin: m[1] + "-12-31", etiqueta: "año " + m[1] };
    }
    if ((m = /^(\d{4})-S([12])$/.exec(c))) {
      var s = +m[2], mi = s === 1 ? 1 : 7, mf = s === 1 ? 6 : 12;
      return { clave: c, periodicidad: "semestral", anio: +m[1], inicio: m[1] + "-" + dos(mi) + "-01",
        fin: m[1] + "-" + dos(mf) + "-" + ultimoDia(+m[1], mf), etiqueta: (s === 1 ? "1.er" : "2.º") + " semestre " + m[1] };
    }
    if ((m = /^(\d{4})-T([1-4])$/.exec(c))) {
      var t = +m[2], ti = (t - 1) * 3 + 1, tf = t * 3;
      return { clave: c, periodicidad: "trimestral", anio: +m[1], inicio: m[1] + "-" + dos(ti) + "-01",
        fin: m[1] + "-" + dos(tf) + "-" + dos(ultimoDia(+m[1], tf)), etiqueta: ["1.er", "2.º", "3.er", "4.º"][t - 1] + " trimestre " + m[1] };
    }
    if ((m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(c))) {
      return { clave: c, periodicidad: "mensual", anio: +m[1], inicio: c + "-01", fin: c + "-" + dos(ultimoDia(+m[1], +m[2])),
        etiqueta: F.MESES[+m[2] - 1] + " " + m[1] };
    }
    return null;
  }

  /** Todos los periodos de un año para una periodicidad. */
  function periodosDelAnio(periodicidad, anio) {
    var a = String(anio);
    var claves = periodicidad === "semestral" ? [a + "-S1", a + "-S2"]
      : periodicidad === "trimestral" ? [1, 2, 3, 4].map(function (t) { return a + "-T" + t; })
      : periodicidad === "mensual" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return a + "-" + dos(m); })
      : [a];
    return claves.map(periodo);
  }

  /** El periodo (de esa periodicidad) que contiene una fecha. */
  function periodoDeFecha(periodicidad, fechaISO) {
    var a = fechaISO.slice(0, 4), m = +fechaISO.slice(5, 7);
    if (periodicidad === "semestral") return periodo(a + "-S" + (m <= 6 ? 1 : 2));
    if (periodicidad === "trimestral") return periodo(a + "-T" + Math.ceil(m / 3));
    if (periodicidad === "mensual") return periodo(a + "-" + dos(m));
    return periodo(a);
  }

  /** Tipo de socio por defecto de una asociación nueva. */
  function tipoPorDefecto() {
    return { id: "socio", nombre: "Socio", cuota: 0, periodicidad: "anual", activo: true };
  }

  // ── Generar las cuotas de un periodo (la «remesa») ───────────────────────
  var MOTIVOS = {
    sinTipo: "No tiene tipo de socio",
    otraPeriodicidad: "Su tipo de socio paga con otra periodicidad",
    exento: "Exento de cuota",
    cuotaCero: "Su tipo de socio no tiene cuota",
    noActivo: "No era socio en ese periodo",
    yaTiene: "Ya tiene la cuota de ese periodo",
  };

  /** Meses de un periodo que tocan a quien se da de alta en él (desde el mes del alta): { meses, de }. */
  function mesesDesde(p, fechaAlta) {
    var mes = function (iso) { return +iso.slice(0, 4) * 12 + +iso.slice(5, 7); };
    var de = mes(p.fin) - mes(p.inicio) + 1;
    return { meses: fechaAlta > p.inicio ? Math.max(1, mes(p.fin) - mes(fechaAlta) + 1) : de, de: de };
  }

  /**
   * Prepara las cuotas de un periodo para todos los socios a los que les toca.
   * No guarda nada: devuelve { periodo, nuevas: [cuotas], omitidos: [{ socio, motivo }], total }.
   * Se incluye a quien fue socio en algún momento del periodo. Con
   * o.prorratear, quien se dio de alta a mitad de periodo paga solo los meses
   * que le tocan, contando el del alta (la baja no se prorratea).
   */
  function generar(o) {
    var p = periodo(o.periodo);
    if (!p) throw new Error("Periodo no válido: " + o.periodo);
    var tipos = {};
    (o.tipos || []).forEach(function (t) { tipos[t.id] = t; });
    var tienen = {};
    (o.cuotas || []).forEach(function (c) { if (c.periodo === p.clave && c.estado !== "anulada") tienen[c.socioId] = true; });
    var nuevas = [], omitidos = [];
    (o.socios || []).forEach(function (s) {
      var t = tipos[s.tipoSocioId], motivo = null;
      if (!t) motivo = "sinTipo";
      else if ((t.periodicidad || "anual") !== p.periodicidad) motivo = "otraPeriodicidad";
      else if (!s.fechaAlta || s.fechaAlta > p.fin || (s.fechaBaja && s.fechaBaja <= p.inicio)) motivo = "noActivo";
      else if (s.exentoCuota) motivo = "exento";
      else if (!(t.cuota > 0)) motivo = "cuotaCero";
      else if (tienen[s.id]) motivo = "yaTiene";
      if (motivo) { omitidos.push({ socio: s, motivo: motivo, texto: MOTIVOS[motivo] }); return; }
      var m = mesesDesde(p, s.fechaAlta), parte = o.prorratear && m.meses < m.de;
      nuevas.push({
        socioId: s.id, socioNumero: s.numero, socioNombre: S.nombreCompleto(s), tipoSocioId: t.id,
        periodo: p.clave, concepto: "Cuota " + t.nombre.toLowerCase() + " · " + p.etiqueta + (parte ? " (" + m.meses + " de " + m.de + " meses)" : ""),
        importe: parte ? Math.round(t.cuota * m.meses / m.de) : t.cuota, fechaEmision: o.fechaEmision || F.hoy(), remesaId: o.remesaId || "",
        estado: "pendiente", pago: null, historial: [],
      });
    });
    nuevas.sort(function (a, b) { return (a.socioNumero || 0) - (b.socioNumero || 0); });
    return { periodo: p, nuevas: nuevas, omitidos: omitidos, total: D.sumar(nuevas.map(function (c) { return c.importe; })) };
  }

  // ── Cambiar el estado de una cuota (devuelven una copia nueva) ──────────
  var copia = function (c) { return JSON.parse(JSON.stringify(c)); };
  function anotar(c, accion, detalle, fecha) {
    c.historial = (c.historial || []).concat([{ fecha: fecha || F.hoy(), accion: accion, detalle: detalle || "" }]);
    return c;
  }

  /** Marca una cuota como pagada. pago: { fecha, forma, cuentaId, referencia }. */
  function registrarPago(cuota, pago) {
    if (!pago || !F.esValida(pago.fecha)) throw new Error("Falta la fecha del pago.");
    if (S.FORMAS_PAGO.indexOf(pago.forma) < 0) throw new Error("Elige la forma de pago.");
    if (cuota.estado === "anulada") throw new Error("La cuota está anulada.");
    var c = copia(cuota);
    c.estado = "pagada";
    c.pago = { fecha: pago.fecha, forma: pago.forma, cuentaId: pago.cuentaId || "", referencia: pago.referencia || "" };
    return anotar(c, "pago", pago.forma, pago.fecha);
  }

  /** Deshace un pago apuntado por error: vuelve a pendiente. */
  function deshacerPago(cuota) {
    var c = copia(cuota);
    var antes = c.pago;
    c.estado = "pendiente";
    c.pago = null;
    return anotar(c, "pago deshecho", antes ? antes.forma + " del " + F.corta(antes.fecha) : "");
  }

  /** El banco devolvió el recibo domiciliado: vuelve a deberse. */
  function devolver(cuota, fecha, motivo) {
    var c = copia(cuota);
    c.estado = "devuelta";
    c.pago = null;
    return anotar(c, "devuelta", motivo || "", fecha);
  }

  /** Ya no se debe (baja, error, condonación). */
  function anular(cuota, motivo) {
    var c = copia(cuota);
    c.estado = "anulada";
    c.pago = null;
    return anotar(c, "anulada", motivo || "");
  }

  function reactivar(cuota) {
    var c = copia(cuota);
    c.estado = "pendiente";
    return anotar(c, "reactivada", "");
  }

  var debe = function (c) { return c.estado === "pendiente" || c.estado === "devuelta"; };

  // ── Resúmenes ───────────────────────────────────────────────────────────
  /** Totales de una lista de cuotas, en céntimos. */
  function resumen(cuotas) {
    var r = { n: 0, emitido: 0, cobrado: 0, pendiente: 0, anulado: 0, nPagadas: 0, nPendientes: 0, porForma: {} };
    (cuotas || []).forEach(function (c) {
      r.n++;
      if (c.estado === "anulada") { r.anulado += c.importe; return; }
      r.emitido += c.importe;
      if (c.estado === "pagada") {
        r.cobrado += c.importe; r.nPagadas++;
        var f = (c.pago && c.pago.forma) || "Otra";
        r.porForma[f] = (r.porForma[f] || 0) + c.importe;
      } else { r.pendiente += c.importe; r.nPendientes++; }
    });
    return r;
  }

  /** Deudores: socios con cuotas pendientes o devueltas, de mayor a menor deuda. */
  function deudores(cuotas, hasta) {
    var por = {};
    (cuotas || []).forEach(function (c) {
      if (!debe(c)) return;
      if (hasta && c.fechaEmision > hasta) return;
      var k = c.socioId || "?" + c.socioNombre;
      if (!por[k]) por[k] = { socioId: c.socioId, socioNumero: c.socioNumero, socioNombre: c.socioNombre, cuotas: [], total: 0 };
      por[k].cuotas.push(c);
      por[k].total += c.importe;
    });
    return Object.keys(por).map(function (k) { return por[k]; })
      .sort(function (a, b) { return b.total - a.total || (a.socioNumero || 0) - (b.socioNumero || 0); });
  }

  /** ¿Está al corriente un socio? (ninguna cuota pendiente o devuelta) */
  function alCorriente(socioId, cuotas) {
    return !(cuotas || []).some(function (c) { return c.socioId === socioId && debe(c); });
  }

  /** Cuenta donde suele entrar cada forma de pago: el efectivo a caja, lo demás al banco. */
  function cuentaPorDefecto(forma, cuentas) {
    var lista = cuentas || [];
    var tipo = forma === "Efectivo" ? "caja" : "banco";
    return (lista.filter(function (c) { return c.tipo === tipo; })[0] || lista[0] || {}).id || "";
  }

  /**
   * Cuotas pagadas → movimientos de ingreso para la contabilidad (Fase 3).
   * { fecha, tipo: "ingreso", importe, cuentaId, categoria, categoriaId: "cuotas", concepto, forma, origen: { tipo: "cuota", id } }
   */
  function aMovimientos(cuotas) {
    return (cuotas || []).filter(function (c) { return c.estado === "pagada" && c.pago; }).map(function (c) {
      return {
        fecha: c.pago.fecha, tipo: "ingreso", importe: c.importe, cuentaId: c.pago.cuentaId,
        categoria: CATEGORIA_CONTABLE, categoriaId: "cuotas", forma: c.pago.forma,
        concepto: c.concepto + " · n.º " + c.socioNumero + " " + c.socioNombre,
        origen: { tipo: "cuota", id: c.id },
      };
    }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
  }

  return {
    PERIODICIDADES: PERIODICIDADES, ESTADOS: ESTADOS, MOTIVOS: MOTIVOS, CATEGORIA_CONTABLE: CATEGORIA_CONTABLE,
    periodo: periodo, periodosDelAnio: periodosDelAnio, periodoDeFecha: periodoDeFecha, tipoPorDefecto: tipoPorDefecto,
    generar: generar, mesesDesde: mesesDesde, registrarPago: registrarPago, deshacerPago: deshacerPago, devolver: devolver,
    anular: anular, reactivar: reactivar, debe: debe,
    resumen: resumen, deudores: deudores, alCorriente: alCorriente, cuentaPorDefecto: cuentaPorDefecto, aMovimientos: aMovimientos,
  };
});

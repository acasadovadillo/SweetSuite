/*
 * webkit_asociaciones — Lógica de tesorería (sin interfaz: tests/tesoreria.test.js).
 *
 * MOVIMIENTO (dinero que entra o sale de una cuenta):
 *   { id, fecha, cuentaId, tipo, importe (céntimos, siempre positivo), concepto,
 *     categoriaId, proyectoId,
 *     cuentaDestinoId    (traspaso entre cuentas propias)
 *     sentido            (anticipo: "salida" = se entrega o reembolsa dinero a una
 *                         persona; "entrada" = la persona devuelve lo que sobró)
 *     anticipoId, facturaId, cuotaIds: [ids]   (enlaces: qué paga o cobra)
 *     origen: "manual" | "extracto", conceptoBanco, notas }
 *   tipo: "ingreso" | "gasto" | "traspaso" | "anticipo"
 *
 * CRITERIO: la tesorería cuenta el dinero cuando entra o sale (criterio de
 * caja), con el IVA incluido. Es lo práctico para una asociación pequeña, pero
 * las cuentas anuales formales pueden exigir otro criterio (plan de
 * contabilidad de entidades sin fines lucrativos): verificar con asesoría.
 *
 * DE DÓNDE SALE CADA COSA:
 *   · Saldo de una cuenta = saldo inicial + movimientos + cuotas cobradas que
 *     no estén ya enlazadas a un movimiento (para no contarlas dos veces).
 *   · Ingresos y gastos (por categoría y proyecto) = movimientos de ingreso y
 *     gasto + cuotas cobradas no enlazadas + gastos justificados en anticipos y
 *     reembolsos. Los traspasos y las entregas/devoluciones de anticipos NO son
 *     ingresos ni gastos: solo mueven dinero.
 *   · Las facturas no cuentan por sí mismas: cuenta su cobro o su pago.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { Dinero: require("../nucleo/dinero.js"), Fechas: require("../nucleo/fechas.js"), Cuotas: require("./cuotas.js") }
    : { Dinero: raiz.WA.Dinero, Fechas: raiz.WA.Fechas, Cuotas: raiz.WA.Cuotas };
  var modulo = fabrica(dep.Dinero, dep.Fechas, dep.Cuotas);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Tesoreria = modulo;
})(typeof self !== "undefined" ? self : this, function (D, F, Cuotas) {
  "use strict";

  var TIPOS = [["ingreso", "Ingreso"], ["gasto", "Gasto"], ["traspaso", "Traspaso entre cuentas"], ["anticipo", "Anticipo o reembolso"]];
  var CATEGORIA_CUOTAS = "cuotas";
  var SIN_CLASIFICAR = "";

  /** Categorías con las que empieza una asociación (se pueden cambiar). «iva» es el tratamiento habitual del ingreso. */
  function categoriasPorDefecto() {
    var c = function (id, nombre, tipo, iva) { return { id: id, nombre: nombre, tipo: tipo, iva: iva || "", activa: true }; };
    return [
      c("cuotas", "Cuotas de socios", "ingreso", "no_sujeto"),
      c("donaciones", "Donaciones", "ingreso", "no_sujeto"),
      c("subvenciones", "Subvenciones", "ingreso", "no_sujeto"),
      c("inscripciones", "Inscripciones a actividades", "ingreso", "sujeto"),
      c("ventas", "Venta de productos", "ingreso", "sujeto"),
      c("servicios", "Prestación de servicios", "ingreso", "sujeto"),
      c("otros-ingresos", "Otros ingresos", "ingreso", "no_sujeto"),
      c("actividades", "Gastos de actividades", "gasto"),
      c("material", "Material y suministros", "gasto"),
      c("seguros", "Seguros", "gasto"),
      c("banco", "Comisiones bancarias", "gasto"),
      c("web", "Web y servicios digitales", "gasto"),
      c("administracion", "Gastos administrativos y tasas", "gasto"),
      c("difusion", "Comunicación y difusión", "gasto"),
      c("desplazamientos", "Desplazamientos", "gasto"),
      c("profesionales", "Servicios profesionales", "gasto"),
      c("impuestos", "Impuestos (pago de IVA, etc.)", "gasto"),
      c("otros-gastos", "Otros gastos", "gasto"),
    ];
  }

  /** Efecto de un movimiento en cada cuenta: { cuentaId: céntimos con signo }. */
  function efecto(m) {
    var e = {};
    var poner = function (c, v) { if (c) e[c] = (e[c] || 0) + v; };
    if (m.tipo === "ingreso") poner(m.cuentaId, m.importe);
    else if (m.tipo === "gasto") poner(m.cuentaId, -m.importe);
    else if (m.tipo === "traspaso") { poner(m.cuentaId, -m.importe); poner(m.cuentaDestinoId, m.importe); }
    else if (m.tipo === "anticipo") poner(m.cuentaId, m.sentido === "entrada" ? m.importe : -m.importe);
    return e;
  }
  /** Importe con signo para listados (traspasos: negativo en la cuenta de origen). */
  var conSigno = function (m) { return m.tipo === "ingreso" || (m.tipo === "anticipo" && m.sentido === "entrada") ? m.importe : -m.importe; };

  /** Ids de cuotas ya enlazadas a algún movimiento (conciliadas con el banco). */
  function cuotasEnlazadas(movimientos) {
    var s = {};
    (movimientos || []).forEach(function (m) { (m.cuotaIds || []).forEach(function (id) { s[id] = true; }); });
    return s;
  }

  /**
   * El libro: movimientos reales + cuotas cobradas no enlazadas, convertidas en
   * movimientos de solo lectura (virtual: true). Ordenado por fecha, del más reciente al más antiguo.
   */
  function libro(movimientos, cuotas) {
    var enlazadas = cuotasEnlazadas(movimientos);
    var virtuales = Cuotas.aMovimientos((cuotas || []).filter(function (c) { return !enlazadas[c.id]; })).map(function (v) {
      return { id: "cuota:" + v.origen.id, virtual: true, fecha: v.fecha, cuentaId: v.cuentaId, tipo: "ingreso", importe: v.importe,
        concepto: v.concepto, categoriaId: CATEGORIA_CUOTAS, proyectoId: "", forma: v.forma, cuotaIds: [v.origen.id] };
    });
    return (movimientos || []).concat(virtuales).sort(function (a, b) {
      return b.fecha.localeCompare(a.fecha) || String(b.creado || "").localeCompare(String(a.creado || ""));
    });
  }

  /** Saldo de cada cuenta en una fecha (incluida). cuentas: config.cuentas con saldoInicial. */
  function saldos(cuentas, movimientos, cuotas, hasta) {
    var h = hasta || "9999-12-31";
    var r = {};
    (cuentas || []).forEach(function (c) { r[c.id] = Number(c.saldoInicial) || 0; });
    libro(movimientos, cuotas).forEach(function (m) {
      if (m.fecha > h) return;
      var e = efecto(m);
      Object.keys(e).forEach(function (k) { r[k] = (r[k] || 0) + e[k]; });
    });
    var total = D.sumar(Object.keys(r).map(function (k) { return r[k]; }));
    return { porCuenta: r, total: total };
  }

  /**
   * Partidas de ingreso y gasto (para resultados y presupuestos):
   * [{ fecha, tipo: "ingreso"|"gasto", importe, categoriaId, proyectoId, origen }]
   */
  function partidas(movimientos, cuotas, anticipos) {
    var out = [];
    libro(movimientos, cuotas).forEach(function (m) {
      if (m.tipo !== "ingreso" && m.tipo !== "gasto") return;
      out.push({ fecha: m.fecha, tipo: m.tipo, importe: m.importe, categoriaId: m.categoriaId || SIN_CLASIFICAR, proyectoId: m.proyectoId || "", origen: m.virtual ? "cuota" : "movimiento", id: m.id });
    });
    (anticipos || []).forEach(function (a) {
      (a.gastos || []).forEach(function (g) {
        out.push({ fecha: g.fecha, tipo: "gasto", importe: g.importe, categoriaId: g.categoriaId || SIN_CLASIFICAR, proyectoId: g.proyectoId || a.proyectoId || "", origen: "anticipo", id: a.id });
      });
    });
    return out;
  }

  /** Ingresos y gastos por categoría entre dos fechas (incluidas). */
  function resultados(lista, desde, hasta) {
    var r = { ingresos: {}, gastos: {}, totalIngresos: 0, totalGastos: 0 };
    lista.forEach(function (p) {
      if ((desde && p.fecha < desde) || (hasta && p.fecha > hasta)) return;
      var grupo = p.tipo === "ingreso" ? r.ingresos : r.gastos;
      grupo[p.categoriaId] = (grupo[p.categoriaId] || 0) + p.importe;
      if (p.tipo === "ingreso") r.totalIngresos += p.importe; else r.totalGastos += p.importe;
    });
    r.resultado = r.totalIngresos - r.totalGastos;
    return r;
  }

  /**
   * Ejecución de un presupuesto: lo previsto contra lo realizado, por categoría.
   * previsto: { categoriaId: céntimos }. realizado: lo que devuelve resultados().
   */
  function ejecucion(previsto, realizado, categorias) {
    var porId = {};
    (categorias || []).forEach(function (c) { porId[c.id] = c; });
    var ids = {};
    Object.keys(previsto || {}).forEach(function (k) { ids[k] = true; });
    Object.keys(realizado.ingresos).concat(Object.keys(realizado.gastos)).forEach(function (k) { ids[k] = true; });
    var filas = Object.keys(ids).map(function (id) {
      var c = porId[id] || { id: id, nombre: id ? id : "Sin clasificar", tipo: realizado.ingresos[id] ? "ingreso" : "gasto" };
      var hecho = (c.tipo === "ingreso" ? realizado.ingresos[id] : realizado.gastos[id]) || 0;
      var prev = Number((previsto || {})[id]) || 0;
      return { categoriaId: id, nombre: c.nombre, tipo: c.tipo, previsto: prev, realizado: hecho, diferencia: prev - hecho,
        pct: prev > 0 ? Math.round(hecho / prev * 1000) / 10 : null };
    });
    filas.sort(function (a, b) { return a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre, "es"); });
    var suma = function (tipo, campo) { return D.sumar(filas.filter(function (f) { return f.tipo === tipo; }).map(function (f) { return f[campo]; })); };
    return {
      filas: filas,
      ingresos: { previsto: suma("ingreso", "previsto"), realizado: suma("ingreso", "realizado") },
      gastos: { previsto: suma("gasto", "previsto"), realizado: suma("gasto", "realizado") },
    };
  }

  // ── Anticipos y reembolsos ──────────────────────────────────────────────
  /*
   * ANTICIPO: la asociación entrega dinero por adelantado a una persona para que
   *   haga gastos en su nombre; después justifica con tickets o facturas y
   *   devuelve lo que sobre (o se le abona lo que falte).
   * REEMBOLSO: una persona paga un gasto de la asociación con su dinero y
   *   presenta el justificante; la asociación le devuelve el importe.
   *
   * { id, tipo: "anticipo" | "reembolso", persona, socioId, fecha, concepto, proyectoId,
   *   gastos: [{ id, fecha, concepto, importe, categoriaId, proyectoId, justificante, facturaId }],
   *   cerrado, notas }
   * El dinero entregado, reembolsado o devuelto son movimientos de tipo
   * «anticipo» enlazados (anticipoId).
   */
  var EXPLICACION = {
    anticipo: "La asociación adelanta dinero a una persona para que haga gastos en su nombre. Después justifica con tickets o facturas y devuelve lo que sobre (o se le paga lo que falte).",
    reembolso: "Una persona paga un gasto de la asociación con su propio dinero y entrega el justificante. La asociación le devuelve el importe.",
  };

  /**
   * Situación de un anticipo o reembolso:
   *   entregado (dinero que le ha dado la asociación), devuelto (lo que ha devuelto la persona),
   *   justificado (gastos), saldo = entregado − devuelto − justificado
   *     saldo > 0 → la persona tiene dinero de la asociación (debe justificarlo o devolverlo)
   *     saldo < 0 → la asociación le debe dinero (hay que pagarle)
   */
  function situacionAnticipo(a, movimientos) {
    var entregado = 0, devuelto = 0;
    (movimientos || []).forEach(function (m) {
      if (m.anticipoId !== a.id || m.tipo !== "anticipo") return;
      if (m.sentido === "entrada") devuelto += m.importe; else entregado += m.importe;
    });
    var justificado = D.sumar((a.gastos || []).map(function (g) { return g.importe; }));
    var saldo = entregado - devuelto - justificado;
    var estado = saldo > 0 ? "debe la persona" : saldo < 0 ? "se le debe" : justificado > 0 || entregado > 0 ? "liquidado" : "sin movimientos";
    return { entregado: entregado, devuelto: devuelto, justificado: justificado, saldo: saldo, estado: estado };
  }

  // ── Conciliar con cuotas ────────────────────────────────────────────────
  /**
   * Enlaza un movimiento de ingreso con cuotas: las que estén pendientes se marcan
   * pagadas (fecha y cuenta del movimiento, forma «Transferencia» salvo que se diga otra).
   * Devuelve { movimiento, cuotas (las modificadas), diferencia } sin guardar nada.
   */
  function conciliarCuotas(movimiento, cuotas, forma) {
    var m = JSON.parse(JSON.stringify(movimiento));
    m.cuotaIds = (cuotas || []).map(function (c) { return c.id; });
    m.categoriaId = CATEGORIA_CUOTAS;
    var cambiadas = (cuotas || []).map(function (c) {
      if (c.estado === "pagada") return c;
      return Cuotas.registrarPago(c, { fecha: m.fecha, forma: forma || "Transferencia", cuentaId: m.cuentaId, referencia: m.conceptoBanco || m.concepto });
    });
    var suma = D.sumar((cuotas || []).map(function (c) { return c.importe; }));
    return { movimiento: m, cuotas: cambiadas, diferencia: m.importe - suma };
  }

  return {
    TIPOS: TIPOS, CATEGORIA_CUOTAS: CATEGORIA_CUOTAS, EXPLICACION: EXPLICACION,
    categoriasPorDefecto: categoriasPorDefecto, efecto: efecto, conSigno: conSigno, cuotasEnlazadas: cuotasEnlazadas,
    libro: libro, saldos: saldos, partidas: partidas, resultados: resultados, ejecucion: ejecucion,
    situacionAnticipo: situacionAnticipo, conciliarCuotas: conciliarCuotas,
  };
});

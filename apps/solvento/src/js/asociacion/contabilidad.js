/*
 * Solvento (asociaciones) — La contabilidad de una asociación, sobre los datos
 * de Solvento (sin interfaz: tools/pruebas/contabilidad.js).
 *
 * Las piezas de cálculo vienen de Agora tal cual (facturas.js, iva.js,
 * extracto.js, en céntimos). Esto las une con lo de Solvento, que va en euros
 * y en texto:
 *
 *   · FACTURAS (doc.facturas, el formato de Agora; ver facturas.js), más
 *     «categoria» y «centro» de Solvento. No cuentan por sí mismas: cuenta su
 *     cobro o su pago, que es un movimiento con «factura: <id>».
 *   · SUBVENCIONES Y PROYECTOS (doc.subvenciones), en euros:
 *       { id, nombre, tipo: "subvencion" | "proyecto", financiador, referencia,
 *         centro (centro de coste: lo que se le imputa es lo suyo),
 *         importeSolicitado, importeConcedido, fechaInicio, fechaFin (ISO),
 *         estado: "en curso" | "cerrado",
 *         estadoSubvencion: "idea" | "solicitada" | "concedida" | "denegada" | "justificada",
 *         plazoSolicitud, fechaSolicitud, fechaResolucion, plazoJustificacion, fechaJustificacion,
 *         urlBases, requisitos: [{ id, texto, hecho }],
 *         presupuesto: { "gasto|<categoría>" o "ingreso|<categoría>": euros }, notas }
 *   · CUENTAS DEL EJERCICIO: ingresos y gastos del año agrupados en las
 *     partidas del modelo abreviado de entidades sin fines lucrativos.
 *   · EXTRACTOS: un CSV o Excel del banco, convertido en movimientos de Solvento.
 *
 * Todo va por CRITERIO DE CAJA (cuenta el dinero cuando entra o sale), como
 * en Agora. Para informar a la asamblea vale; las cuentas anuales formales
 * llevan otro criterio: verificar con asesoría.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { D: require("./dinero.js"), F: require("./fechas.js"), Fac: require("./facturas.js"), IVA: require("./iva.js"), Ext: require("./extracto.js") }
    : { D: raiz.WA.Dinero, F: raiz.WA.Fechas, Fac: raiz.WA.Facturas, IVA: raiz.WA.IVA, Ext: raiz.WA.Extracto };
  var modulo = fabrica(dep);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Contabilidad = modulo;
})(typeof self !== "undefined" ? self : this, function (x) {
  "use strict";
  var D = x.D, F = x.F, Fac = x.Fac, Ext = x.Ext;

  // ── Lo de Solvento: fechas dd/mm/aaaa e importes en texto ─────────────────
  var aISO = function (es) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(es || ""));
    return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : String(es || "").slice(0, 10);
  };
  var aES = function (iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
  };
  var euros = function (v) { var n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : 0; };
  var cent = function (e) { return D.aCentimos(e) || 0; };
  var textoEuros = function (c) { return (Math.round(c) / 100).toFixed(2); };
  var plano = function (s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  };
  var nuevoId = function (p) { return p + Math.random().toString(16).slice(2, 12); };
  // La categoría de un movimiento, sea ingreso o gasto
  var categoriaDe = function (m) { return String((m.tipo === "Ingreso" ? m.tipo_ingreso : m.tipo_gasto) || "").trim(); };
  var raizDe = function (ruta) { return String(ruta || "").split(">")[0].trim(); };

  // ── Facturas ──────────────────────────────────────────────────────────────
  /** Una factura en blanco, del tipo pedido. */
  function facturaNueva(tipo, hoyISO) {
    return {
      id: nuevoId("f"), tipo: tipo === "recibida" ? "recibida" : "emitida",
      estado: tipo === "recibida" ? "emitida" : "borrador", serie: "", numero: "",
      fecha: hoyISO || F.hoy(), fechaOperacion: "", vencimiento: "",
      tercero: { nombre: "", nif: "", direccion: "", email: "" },
      lineas: [Fac.lineaVacia()], retencionPct: 0, deducible: true, motivoExencion: "",
      categoria: "", centro: "", notas: "",
    };
  }

  /** Emitir un borrador: le da su número (correlativo por serie y año). */
  function emitir(f, facturas, config) {
    var p = Fac.revisar(f);
    if (p.length) throw new Error(p[0]);
    var cfg = (config && config.facturacion) || {};
    var serie = Fac.serieDe(f, cfg);
    return Object.assign({}, f, {
      estado: "emitida", serie: serie,
      numero: Fac.siguienteNumero(facturas, String(f.fecha).slice(0, 4), serie),
    });
  }

  /** Los movimientos que cobran o pagan una factura. */
  var pagosDe = function (f, movimientos) {
    return (movimientos || []).filter(function (m) { return m.factura === f.id; });
  };

  /**
   * Lo cobrado o pagado de una factura, desde los movimientos de Solvento:
   * { total, pagado, pendiente (en céntimos), estado }. Ver Facturas.estadoPago.
   */
  function estadoPago(f, movimientos) {
    var movs = pagosDe(f, movimientos).map(function (m) { return { facturaId: f.id, importe: cent(Math.abs(euros(m.importe))) }; });
    return Fac.estadoPago(f, movs, []);
  }

  /**
   * El movimiento que cobra (emitida) o paga (recibida) una factura. Una
   * rectificativa en negativo es al revés: se devuelve el dinero.
   * o: { cuenta, fecha (ISO), importe (céntimos; por defecto lo pendiente) }
   */
  function movimientoDePago(f, o) {
    var e = estadoPago(f, o.movimientos || []);
    var importe = o.importe != null ? Math.abs(o.importe) : Math.max(e.pendiente, 0);
    var entra = (f.tipo === "emitida") === (e.total >= 0);
    var quien = String((f.tercero || {}).nombre || "").trim();
    return {
      id: nuevoId("m"), fecha: aES(o.fecha || F.hoy()), tipo: entra ? "Ingreso" : "Gasto",
      importe: textoEuros(importe),
      cuenta_origen: entra ? "" : o.cuenta, cuenta_destino: entra ? o.cuenta : "",
      tipo_ingreso: entra ? f.categoria || "" : "", tipo_gasto: entra ? "" : f.categoria || "",
      tipo_prestamo: "", persona_prestamo: "", centro: f.centro || "",
      detalle: "Factura " + (f.numero || "") + (quien ? " · " + quien : ""),
      factura: f.id,
    };
  }

  /** Lo que queda por cobrar y por pagar, para la cabecera de la página. */
  function resumenFacturas(facturas, movimientos) {
    var r = { porCobrar: 0, nPorCobrar: 0, porPagar: 0, nPorPagar: 0, borradores: 0 };
    (facturas || []).forEach(function (f) {
      if (f.estado === "borrador") { r.borradores++; return; }
      var e = estadoPago(f, movimientos);
      if (e.estado !== "pendiente" && e.estado !== "parcial") return;
      if (f.tipo === "emitida") { r.porCobrar += e.pendiente; r.nPorCobrar++; } else { r.porPagar += e.pendiente; r.nPorPagar++; }
    });
    return r;
  }

  // ── Subvenciones y proyectos ──────────────────────────────────────────────
  var ESTADOS_SUBVENCION = [["idea", "Idea"], ["solicitada", "Solicitada"], ["concedida", "Concedida"],
    ["denegada", "Denegada"], ["justificada", "Justificada"]];

  function subvencionNueva(hoyISO) {
    return {
      id: nuevoId("s"), nombre: "", tipo: "subvencion", financiador: "", referencia: "", centro: "",
      importeSolicitado: 0, importeConcedido: 0, fechaInicio: hoyISO || F.hoy(), fechaFin: "",
      estado: "en curso", estadoSubvencion: "idea", plazoSolicitud: "", fechaSolicitud: "", fechaResolucion: "",
      plazoJustificacion: "", fechaJustificacion: "", urlBases: "", requisitos: [], presupuesto: {}, notas: "",
    };
  }

  /** ¿Es de esta subvención? Lo imputado a su centro de coste o a uno de dentro. */
  var deSubvencion = function (s, m) {
    var c = String(m.centro || "").trim(), mio = String(s.centro || "").trim();
    return !!mio && (c === mio || c.indexOf(mio + " >") === 0);
  };

  /**
   * Presupuesto y ejecución de una subvención: por categoría (de primer nivel), lo previsto y lo
   * realizado (los ingresos y gastos imputados a su centro de coste).
   * Devuelve { filas: [{ categoria, tipo, previsto, realizado, pct }], gastos, ingresos, movimientos }
   * (importes en euros).
   */
  function ejecucion(s, movimientos) {
    var movs = (movimientos || []).filter(function (m) { return (m.tipo === "Ingreso" || m.tipo === "Gasto") && deSubvencion(s, m); });
    var real = {};
    // Por categoría de primer nivel, que es como se presupuesta («Material»
    // recoge «Material > Papelería»)
    movs.forEach(function (m) {
      var cat = raizDe(categoriaDe(m)) || "Sin categoría", tipo = m.tipo === "Ingreso" ? "ingreso" : "gasto";
      var k = tipo + "|" + cat;
      real[k] = (real[k] || 0) + Math.abs(euros(m.importe));
    });
    var pres = s.presupuesto || {};
    var claves = {};
    Object.keys(real).forEach(function (k) { claves[k] = true; });
    Object.keys(pres).forEach(function (k) { if (/^(ingreso|gasto)\|/.test(k)) claves[k] = true; });
    var filas = Object.keys(claves).map(function (k) {
      var tipo = k.split("|")[0], cat = k.slice(tipo.length + 1);
      var previsto = euros(pres[k]);
      var realizado = Math.round((real[k] || 0) * 100) / 100;
      return { categoria: cat, tipo: tipo, previsto: previsto, realizado: realizado, pct: previsto > 0 ? realizado / previsto * 100 : null };
    }).sort(function (a, b) { return a.tipo.localeCompare(b.tipo) || a.categoria.localeCompare(b.categoria, "es"); });
    var tot = function (tipo, campo) { return Math.round(filas.filter(function (f) { return f.tipo === tipo; }).reduce(function (t, f) { return t + f[campo]; }, 0) * 100) / 100; };
    return {
      filas: filas, movimientos: movs,
      gastos: { previsto: tot("gasto", "previsto"), realizado: tot("gasto", "realizado") },
      ingresos: { previsto: tot("ingreso", "previsto"), realizado: tot("ingreso", "realizado") },
    };
  }

  /** Los plazos que vienen de una subvención: el que toque según su estado. */
  function proximoPlazo(s, hoyISO) {
    var hoy = hoyISO || F.hoy();
    var p = null;
    if ((s.estadoSubvencion === "idea" || !s.estadoSubvencion) && s.plazoSolicitud) p = { etiqueta: "Pedirla antes del", fecha: s.plazoSolicitud };
    else if (s.estadoSubvencion === "concedida" && s.plazoJustificacion && !s.fechaJustificacion) p = { etiqueta: "Justificarla antes del", fecha: s.plazoJustificacion };
    if (!p) return null;
    p.vencido = p.fecha < hoy;
    return p;
  }

  // ── Cuentas del ejercicio ─────────────────────────────────────────────────
  /*
   * Partidas (resumidas) del modelo abreviado de cuenta de resultados del plan
   * de contabilidad de entidades sin fines lucrativos. Es una APROXIMACIÓN para
   * orientarse: qué partida le toca a cada categoría hay que verificarlo con
   * asesoría (y se puede cambiar en Ajustes).
   */
  var PARTIDAS = [
    { id: "1a", tipo: "ingreso", texto: "1. a) Cuotas de asociados y afiliados" },
    { id: "1b", tipo: "ingreso", texto: "1. b) Aportaciones de usuarios" },
    { id: "1c", tipo: "ingreso", texto: "1. c) Ingresos de promociones, patrocinadores y colaboraciones" },
    { id: "1d", tipo: "ingreso", texto: "1. d) Subvenciones, donaciones y legados imputados al excedente del ejercicio" },
    { id: "2", tipo: "ingreso", texto: "2. Ventas y otros ingresos ordinarios de la actividad mercantil" },
    { id: "7", tipo: "ingreso", texto: "7. Otros ingresos de la actividad" },
    { id: "14", tipo: "ingreso", texto: "14. Ingresos financieros" },
    { id: "3", tipo: "gasto", texto: "3. Gastos por ayudas y otros" },
    { id: "6", tipo: "gasto", texto: "6. Aprovisionamientos" },
    { id: "8", tipo: "gasto", texto: "8. Gastos de personal" },
    { id: "9", tipo: "gasto", texto: "9. Otros gastos de la actividad" },
    { id: "15", tipo: "gasto", texto: "15. Gastos financieros" },
    { id: "19", tipo: "gasto", texto: "19. Impuestos sobre beneficios" },
  ];
  // Por el nombre de la categoría, la partida más probable
  var PISTAS = [
    ["ingreso", /cuota/, "1a"], ["ingreso", /inscrip|matricul|usuari/, "1b"], ["ingreso", /patrocin|colabora|promoci/, "1c"],
    ["ingreso", /subvenc|donac|donativ|legado/, "1d"], ["ingreso", /venta|servici|factur/, "2"], ["ingreso", /interes|financ/, "14"],
    ["gasto", /ayuda|beca|premio/, "3"], ["gasto", /material|compra|suministr|aprovision/, "6"],
    ["gasto", /personal|nomina|sueldo|seguridad social/, "8"], ["gasto", /interes|prestamo|financ/, "15"],
    ["gasto", /impuesto sobre (beneficios|sociedades)/, "19"],
  ];
  function partidaDe(categoria, tipo, config) {
    var mapa = (config && config.partidasEjercicio) || {};
    var raiz = raizDe(categoria);
    if (mapa[tipo + "|" + categoria]) return mapa[tipo + "|" + categoria];
    if (mapa[tipo + "|" + raiz]) return mapa[tipo + "|" + raiz];
    var n = plano(categoria);
    for (var i = 0; i < PISTAS.length; i++) if (PISTAS[i][0] === tipo && PISTAS[i][1].test(n)) return PISTAS[i][2];
    return tipo === "ingreso" ? "7" : "9";
  }

  /**
   * Ingresos y gastos de un año, por partida y, dentro, por categoría.
   * Devuelve { anio, ingresos: [{ partida, texto, total, categorias: [{ nombre, total }] }],
   *            gastos: [...], totalIngresos, totalGastos, resultado } (euros).
   */
  function cuentasEjercicio(movimientos, anio, config) {
    var desde = anio + "-01-01", hasta = anio + "-12-31";
    var por = { ingreso: {}, gasto: {} };
    (movimientos || []).forEach(function (m) {
      if (m.tipo !== "Ingreso" && m.tipo !== "Gasto") return;
      if (/ajuste/i.test(categoriaDe(m))) return;        // un cuadre de saldo no es ni ingreso ni gasto
      var f = aISO(m.fecha);
      if (f < desde || f > hasta) return;
      var tipo = m.tipo === "Ingreso" ? "ingreso" : "gasto";
      var cat = raizDe(categoriaDe(m)) || "Sin categoría";
      var p = partidaDe(categoriaDe(m) || cat, tipo, config);
      var g = por[tipo][p] || (por[tipo][p] = {});
      g[cat] = (g[cat] || 0) + Math.abs(euros(m.importe));
    });
    var r2 = function (n) { return Math.round(n * 100) / 100; };
    var bloque = function (tipo) {
      return PARTIDAS.filter(function (p) { return p.tipo === tipo && por[tipo][p.id]; }).map(function (p) {
        var cats = Object.keys(por[tipo][p.id]).map(function (n) { return { nombre: n, total: r2(por[tipo][p.id][n]) }; })
          .sort(function (a, b) { return b.total - a.total; });
        return { partida: p.id, texto: p.texto, total: r2(cats.reduce(function (t, c) { return t + c.total; }, 0)), categorias: cats };
      });
    };
    var ingresos = bloque("ingreso"), gastos = bloque("gasto");
    var suma = function (l) { return r2(l.reduce(function (t, p) { return t + p.total; }, 0)); };
    var ti = suma(ingresos), tg = suma(gastos);
    return { anio: anio, ingresos: ingresos, gastos: gastos, totalIngresos: ti, totalGastos: tg, resultado: r2(ti - tg) };
  }

  /** Los años con algún ingreso o gasto, del más reciente al más antiguo. */
  function aniosConMovimientos(movimientos) {
    var a = {};
    (movimientos || []).forEach(function (m) { if (m.tipo === "Ingreso" || m.tipo === "Gasto") a[aISO(m.fecha).slice(0, 4)] = true; });
    return Object.keys(a).filter(function (x) { return /^\d{4}$/.test(x); }).map(Number).sort(function (p, q) { return q - p; });
  }

  // ── Extractos del banco ───────────────────────────────────────────────────
  /**
   * Convierte las filas de un extracto en movimientos de Solvento para esa
   * cuenta. Lo que ya está (misma cuenta, fecha, importe y concepto) no se
   * repite. La categoría la aprende de lo que ya hay: un concepto que ya se
   * apuntó con una categoría la vuelve a llevar.
   * o: { filas, filaCabecera, columnas, cuenta, movimientos }
   * Devuelve { nuevos: [movimiento], duplicados, problemas }.
   */
  function importarExtracto(o) {
    var mios = (o.movimientos || []).filter(function (m) {
      return (m.tipo === "Ingreso" && m.cuenta_destino === o.cuenta) || (m.tipo === "Gasto" && m.cuenta_origen === o.cuenta);
    });
    var existentes = mios.map(function (m) {
      return { cuentaId: o.cuenta, fecha: aISO(m.fecha), tipo: m.tipo === "Ingreso" ? "ingreso" : "gasto",
        importe: cent(Math.abs(euros(m.importe))), concepto: m.detalle || "", conceptoBanco: m.concepto_banco || "" };
    });
    var r = Ext.convertir({ filas: o.filas, filaCabecera: o.filaCabecera, columnas: o.columnas, cuentaId: o.cuenta, existentes: existentes });
    // Lo aprendido: concepto → categoría y centro de lo que ya está apuntado
    var aprendido = {};
    (o.movimientos || []).forEach(function (m) {
      var k = (m.tipo === "Ingreso" ? "ingreso|" : "gasto|") + plano(m.concepto_banco || m.detalle);
      if (categoriaDe(m)) aprendido[k] = { categoria: categoriaDe(m), centro: m.centro || "" };
    });
    var nuevos = r.nuevos.map(function (n) {
      var entra = n.tipo === "ingreso";
      var a = aprendido[(entra ? "ingreso|" : "gasto|") + plano(n.conceptoBanco)] || {};
      return {
        id: nuevoId("m"), fecha: aES(n.fecha), tipo: entra ? "Ingreso" : "Gasto", importe: textoEuros(n.importe),
        cuenta_origen: entra ? "" : o.cuenta, cuenta_destino: entra ? o.cuenta : "",
        tipo_ingreso: entra ? a.categoria || "" : "", tipo_gasto: entra ? "" : a.categoria || "",
        tipo_prestamo: "", persona_prestamo: "", centro: a.centro || "",
        detalle: n.conceptoBanco, concepto_banco: n.conceptoBanco, origen: "extracto",
      };
    });
    return { nuevos: nuevos, duplicados: r.duplicados, problemas: r.problemas };
  }

  // ── Lo que viene de Agora (TESORERIA.md, fase 3) ─────────────────────────
  /**
   * Junta en el documento de Solvento el paquete del dinero de Agora
   * (logica/traspaso.js de Agora). Lo que ya está (por id) no se repite: se
   * puede traer dos veces. Cambia «doc» y devuelve lo que ha añadido:
   * { movimientos, facturas, subvenciones, cuentas, yaEstaban }.
   */
  function traerDeAgora(doc, paquete) {
    if (!paquete || paquete.tipo !== "dinero-agora") throw new Error("Esto no es el dinero de Agora");
    var cfg = doc.config = doc.config || {};
    var r = { movimientos: 0, facturas: 0, subvenciones: 0, cuentas: 0, yaEstaban: 0 };
    var juntar = function (coleccion, lista, campo) {
      var l = doc[coleccion] = Array.isArray(doc[coleccion]) ? doc[coleccion] : [];
      var ya = {};
      l.forEach(function (x) { ya[x.id] = true; });
      (lista || []).forEach(function (x) {
        if (ya[x.id]) { r.yaEstaban++; return; }
        l.push(JSON.parse(JSON.stringify(x)));
        ya[x.id] = true;
        r[campo]++;
      });
    };
    juntar("movimientos", paquete.movimientos, "movimientos");
    juntar("facturas", paquete.facturas, "facturas");
    juntar("subvenciones", paquete.subvenciones, "subvenciones");
    // Las cuentas, si Solvento ya lleva su lista (si no, las deduce de los movimientos)
    if (Array.isArray(cfg.cuentas)) {
      (paquete.cuentas || []).forEach(function (k) {
        if (!k.cuenta || cfg.cuentas.some(function (x) { return x.cuenta === k.cuenta; })) return;
        var c = { cuenta: k.cuenta, accent: "#6b7280" };
        if (k.emoji) c.emoji = k.emoji;
        cfg.cuentas.push(c);
        r.cuentas++;
      });
    }
    // Las categorías y los centros, para que salgan al apuntar (con sus ramas)
    var conRamas = function (clave, rutas) {
      if (!Array.isArray(cfg[clave])) return;      // sin lista, Solvento la siembra de lo que hay
      (rutas || []).forEach(function (ruta) {
        var partes = String(ruta || "").split(">").map(function (x) { return x.trim(); }).filter(Boolean);
        for (var i = 1; i <= partes.length; i++) {
          var acumulada = partes.slice(0, i).join(" > ");
          if (cfg[clave].indexOf(acumulada) < 0) cfg[clave].push(acumulada);
        }
      });
    };
    conRamas("categorias_ingreso", paquete.categoriasIngreso);
    conRamas("categorias", paquete.categoriasGasto);
    if (!Array.isArray(cfg.centros)) cfg.centros = [];
    conRamas("centros", paquete.centros);
    // Los datos del emisor, la facturación y el IVA: los de Agora, si aquí aún no hay
    var e = paquete.entidad || {};
    if (!cfg.entidad || !cfg.entidad.nombre) cfg.entidad = { nombre: e.nombre || "", nif: e.nif || "", direccion: e.direccion || "", email: e.email || "", iban: e.iban || "", pie: "" };
    if (!cfg.facturacion && paquete.facturacion) cfg.facturacion = JSON.parse(JSON.stringify(paquete.facturacion));
    if (!cfg.iva && paquete.iva) cfg.iva = JSON.parse(JSON.stringify(paquete.iva));
    cfg.desdeAgora = { fecha: paquete.fecha, resumen: paquete.resumen };
    return r;
  }

  /**
   * FASE 4: los cobros de cuotas e inscripciones de Agora. Llega la lista
   * ENTERA de cómo tienen que estar (ver Traspaso.cobros en Agora) y se deja
   * igual: los que faltan se añaden, los que cambiaron se ponen al día y los
   * que ya no están (una cuota descobrada) se quitan. La categoría y el centro
   * que se les haya cambiado aquí se respetan. Devuelve { altas, cambios, bajas }.
   */
  var DE_COBRO = /^agora-(cuota|inscripcion):/;
  function ponerCobrosDeAgora(doc, lista) {
    var movs = doc.movimientos = Array.isArray(doc.movimientos) ? doc.movimientos : [];
    var quiero = {};
    (lista || []).forEach(function (m) { if (DE_COBRO.test(m.id)) quiero[m.id] = m; });
    var r = { altas: 0, cambios: 0, bajas: 0 };
    for (var i = movs.length - 1; i >= 0; i--) {
      var m = movs[i];
      if (!DE_COBRO.test(String(m.id))) continue;
      var q = quiero[m.id];
      if (!q) { movs.splice(i, 1); r.bajas++; continue; }
      delete quiero[m.id];
      var antes = JSON.stringify([m.fecha, m.importe, m.cuenta_destino, m.detalle, m.cuotas]);
      m.fecha = q.fecha; m.importe = q.importe; m.cuenta_destino = q.cuenta_destino; m.detalle = q.detalle;
      if (q.cuotas) m.cuotas = q.cuotas.slice();
      if (JSON.stringify([m.fecha, m.importe, m.cuenta_destino, m.detalle, m.cuotas]) !== antes) r.cambios++;
    }
    Object.keys(quiero).forEach(function (id) { movs.push(JSON.parse(JSON.stringify(quiero[id]))); r.altas++; });
    return r;
  }

  return {
    aISO: aISO, aES: aES, euros: euros, cent: cent, plano: plano,
    facturaNueva: facturaNueva, emitir: emitir, pagosDe: pagosDe, estadoPago: estadoPago, movimientoDePago: movimientoDePago,
    resumenFacturas: resumenFacturas,
    ESTADOS_SUBVENCION: ESTADOS_SUBVENCION, subvencionNueva: subvencionNueva, ejecucion: ejecucion, proximoPlazo: proximoPlazo,
    PARTIDAS: PARTIDAS, partidaDe: partidaDe, cuentasEjercicio: cuentasEjercicio, aniosConMovimientos: aniosConMovimientos,
    importarExtracto: importarExtracto, traerDeAgora: traerDeAgora, ponerCobrosDeAgora: ponerCobrosDeAgora,
  };
});

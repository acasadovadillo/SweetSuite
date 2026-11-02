/*
 * Agora — El dinero, a Solvento (sin interfaz: tests/traspaso.test.js).
 *
 * Desde TESORERIA.md, el dinero de una asociación se lleva en Solvento (que
 * solo ve Tesorería). Esto prepara, UNA VEZ, el paquete con todo lo de dinero
 * que hay en Agora, ya en el formato de Solvento: SweetSuite se lo lleva a
 * Solvento en memoria, y Solvento lo junta con lo suyo sin repetir nada.
 *
 * Qué pasa a qué:
 *   · cuentas → cuentas de Solvento (por nombre); su saldo inicial, un apunte
 *     «de ajuste» (no cuenta como ingreso ni como gasto) en su fecha;
 *   · movimientos de ingreso, gasto y traspaso → los mismos en Solvento, con la
 *     categoría por su nombre y, si eran de un proyecto, su centro de coste;
 *   · cuotas e inscripciones cobradas sin movimiento propio → su ingreso
 *     (en Agora contaban solas; en Solvento tiene que haber un apunte);
 *   · anticipos y reembolsos → préstamos entre personas de Solvento: lo que se
 *     le da a la persona es «dinero prestado»; lo que devuelve o justifica,
 *     «devolución»; y cada gasto justificado, un gasto (sin cuenta: el dinero
 *     ya salió al entregárselo). Así lo que debe cada persona sale igual que en
 *     Agora;
 *   · facturas → las mismas (Solvento usa el formato de Agora), con su
 *     categoría por nombre y su centro;
 *   · proyectos y subvenciones → subvenciones de Solvento, en euros, cada una
 *     con su centro de coste («Subvenciones > nombre» o «Proyectos > nombre»).
 *
 * Todo lleva su id de Agora con «agora-» delante (las facturas, el mismo):
 * traerlo dos veces no repite nada.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { D: require("../nucleo/dinero.js"), T: require("./tesoreria.js"), Dir: require("../nucleo/direccion.js") }
    : { D: raiz.WA.Dinero, T: raiz.WA.Tesoreria, Dir: raiz.WA.Direccion };
  var modulo = fabrica(dep.D, dep.T, dep.Dir);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Traspaso = modulo;
})(typeof self !== "undefined" ? self : this, function (D, T, Dir) {
  "use strict";

  var aES = function (iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
  };
  var euros = function (c) { return (Math.round(Number(c) || 0) / 100).toFixed(2); };
  var aEuros = function (c) { return Math.round(Number(c) || 0) / 100; };
  var porId = function (lista) { var o = {}; (lista || []).forEach(function (x) { o[x.id] = x; }); return o; };
  var limpio = function (s) { return String(s == null ? "" : s).replace(/>/g, "›").trim(); };

  /** El centro de coste de un proyecto o subvención. */
  function centroDe(p) {
    return p ? (p.tipo === "subvencion" ? "Subvenciones" : "Proyectos") + " > " + (limpio(p.nombre) || "Sin nombre") : "";
  }

  /**
   * El paquete. c: lo que hay en Agora { config, asociacion, movimientos,
   * cuotas, facturas, anticipos, proyectos, actividades }; hoy: "AAAA-MM-DD".
   */
  function paquete(c, hoy) {
    var cfg = c.config || {};
    var cuentas = porId(cfg.cuentas), cats = porId(cfg.categorias), proyectos = porId(c.proyectos), anticipos = porId(c.anticipos);
    var nombreCuenta = function (id) { return cuentas[id] ? limpio(cuentas[id].nombre) : ""; };
    var nombreCat = function (id, tipo) {
      if (cats[id]) return limpio(cats[id].nombre);
      if (id === "cuotas") return "Cuotas de socios";
      return id ? limpio(id) : "";
    };
    var centro = function (proyectoId) { return proyectoId && proyectos[proyectoId] ? centroDe(proyectos[proyectoId]) : ""; };
    var base = function (id, fecha, tipo, importe) {
      return { id: id, fecha: aES(fecha), tipo: tipo, importe: euros(importe), cuenta_origen: "", cuenta_destino: "",
        tipo_ingreso: "", tipo_gasto: "", tipo_prestamo: "", persona_prestamo: "", centro: "", detalle: "", origen: "agora" };
    };
    var movs = [];
    var libro = T.libro(c.movimientos, c.cuotas, c.actividades);

    // El saldo inicial de cada cuenta, como ajuste: en su fecha o, si no la tiene, la del primer movimiento de la cuenta
    (cfg.cuentas || []).forEach(function (k) {
      var s = Number(k.saldoInicial) || 0;
      if (!s) return;
      var fechas = libro.filter(function (m) { return m.cuentaId === k.id || m.cuentaDestinoId === k.id; }).map(function (m) { return m.fecha; }).sort();
      var fecha = k.fechaSaldoInicial || fechas[0] || hoy;
      var m = base("agora-saldo:" + k.id, fecha, s > 0 ? "Ingreso" : "Gasto", Math.abs(s));
      if (s > 0) { m.cuenta_destino = nombreCuenta(k.id); m.tipo_ingreso = "Ingreso de ajuste"; }
      else { m.cuenta_origen = nombreCuenta(k.id); m.tipo_gasto = "Gasto de ajuste"; }
      m.detalle = "Saldo inicial (de Agora)";
      movs.push(m);
    });

    libro.forEach(function (x) {
      var id = "agora-" + x.id;
      var detalle = limpio(x.concepto || x.conceptoBanco) || "";
      if (x.tipo === "ingreso" || x.tipo === "gasto") {
        var entra = x.tipo === "ingreso";
        var m = base(id, x.fecha, entra ? "Ingreso" : "Gasto", x.importe);
        if (entra) { m.cuenta_destino = nombreCuenta(x.cuentaId); m.tipo_ingreso = nombreCat(x.categoriaId, "ingreso"); }
        else { m.cuenta_origen = nombreCuenta(x.cuentaId); m.tipo_gasto = nombreCat(x.categoriaId, "gasto"); }
        m.centro = centro(x.proyectoId);
        m.detalle = detalle;
        if (x.facturaId) m.factura = x.facturaId;
        if (x.cuotaIds && x.cuotaIds.length) m.cuotas = x.cuotaIds.slice();
        if (x.conceptoBanco) m.concepto_banco = limpio(x.conceptoBanco);
        if (x.notas) m.notas = x.notas;
        movs.push(m);
      } else if (x.tipo === "traspaso") {
        var t = base(id, x.fecha, "Traspaso", x.importe);
        t.cuenta_origen = nombreCuenta(x.cuentaId); t.cuenta_destino = nombreCuenta(x.cuentaDestinoId);
        t.detalle = detalle || "Traspaso";
        movs.push(t);
      } else if (x.tipo === "anticipo") {
        var a = anticipos[x.anticipoId] || {};
        var p = base(id, x.fecha, "Préstamo", x.importe);
        var sale = x.sentido !== "entrada";
        p.tipo_prestamo = sale ? "Dinero prestado" : "Devolución";
        p.persona_prestamo = limpio(a.persona) || "Sin nombre";
        if (sale) p.cuenta_origen = nombreCuenta(x.cuentaId); else p.cuenta_destino = nombreCuenta(x.cuentaId);
        p.detalle = (a.tipo === "reembolso" ? "Reembolso" : "Anticipo") + (a.concepto ? " · " + limpio(a.concepto) : "") + (detalle && detalle !== a.concepto ? " · " + detalle : "");
        movs.push(p);
      }
    });

    // Lo justificado de cada anticipo o reembolso: el gasto y, frente a la persona, su devolución
    (c.anticipos || []).forEach(function (a) {
      (a.gastos || []).forEach(function (g) {
        var gid = "agora-anticipo:" + a.id + ":" + (g.id || g.fecha + g.importe);
        var gasto = base(gid, g.fecha, "Gasto", g.importe);
        gasto.tipo_gasto = nombreCat(g.categoriaId, "gasto");
        gasto.centro = centro(g.proyectoId || a.proyectoId);
        gasto.detalle = limpio(g.concepto) + " (justificado por " + (limpio(a.persona) || "—") + ")";
        if (g.facturaId) gasto.factura = g.facturaId;
        movs.push(gasto);
        var dev = base(gid + ":justificado", g.fecha, "Préstamo", g.importe);
        dev.tipo_prestamo = "Devolución";
        dev.persona_prestamo = limpio(a.persona) || "Sin nombre";
        dev.detalle = "Justificado: " + limpio(g.concepto);
        movs.push(dev);
      });
    });

    var facturas = (c.facturas || []).map(function (f) {
      var x = JSON.parse(JSON.stringify(f));
      x.categoria = nombreCat(f.categoriaId, f.tipo === "emitida" ? "ingreso" : "gasto");
      x.centro = centro(f.proyectoId);
      x.origen = "agora";
      return x;
    });

    var subvenciones = (c.proyectos || []).map(function (p) {
      var pres = {};
      Object.keys(p.presupuesto || {}).forEach(function (cid) {
        var cat = cats[cid];
        var tipo = cat && cat.tipo === "ingreso" ? "ingreso" : "gasto";
        if (Number(p.presupuesto[cid])) pres[tipo + "|" + nombreCat(cid, tipo)] = aEuros(p.presupuesto[cid]);
      });
      return {
        id: "agora-" + p.id, nombre: limpio(p.nombre), tipo: p.tipo === "subvencion" ? "subvencion" : "proyecto",
        financiador: p.financiador || "", referencia: p.referencia || "", centro: centroDe(p),
        importeSolicitado: aEuros(p.importeSolicitado), importeConcedido: aEuros(p.importeConcedido),
        fechaInicio: p.fechaInicio || "", fechaFin: p.fechaFin || "", estado: p.estado === "cerrado" ? "cerrado" : "en curso",
        estadoSubvencion: p.estadoSubvencion || "idea", plazoSolicitud: p.plazoSolicitud || "", fechaSolicitud: p.fechaSolicitud || "",
        fechaResolucion: p.fechaResolucion || "", plazoJustificacion: p.plazoJustificacion || "", fechaJustificacion: p.fechaJustificacion || "",
        urlBases: p.urlBases || "", requisitos: (p.requisitos || []).map(function (r) { return { id: r.id, texto: r.texto, hecho: !!r.hecho }; }),
        presupuesto: pres, notas: p.notas || "", origen: "agora",
      };
    });

    var as = c.asociacion || {};
    var dir = as.domicilio && Dir ? Dir.formatear(as.domicilio).completa : "";
    // (sin las de ajuste, que son de Solvento y no se ofrecen al apuntar)
    var unicos = function (l) { return l.filter(function (x, i) { return x && !/ajuste/i.test(x) && l.indexOf(x) === i; }); };
    return {
      tipo: "dinero-agora", version: 1, fecha: hoy,
      entidad: { nombre: as.nombre || "", nif: as.nif || "", direccion: dir, email: as.email || "", iban: as.iban || "" },
      facturacion: cfg.facturacion || {}, iva: cfg.iva || {},
      cuentas: (cfg.cuentas || []).map(function (k) { return { cuenta: limpio(k.nombre), emoji: k.tipo === "caja" ? "💵" : undefined }; }),
      categoriasIngreso: unicos(movs.map(function (m) { return m.tipo_ingreso; }).concat(facturas.filter(function (f) { return f.tipo === "emitida"; }).map(function (f) { return f.categoria; }))
        .concat((cfg.categorias || []).filter(function (k) { return k.tipo === "ingreso"; }).map(function (k) { return limpio(k.nombre); }))),
      categoriasGasto: unicos(movs.map(function (m) { return m.tipo_gasto; }).concat(facturas.filter(function (f) { return f.tipo === "recibida"; }).map(function (f) { return f.categoria; }))
        .concat((cfg.categorias || []).filter(function (k) { return k.tipo === "gasto"; }).map(function (k) { return limpio(k.nombre); }))),
      centros: unicos(subvenciones.map(function (s) { return s.centro; })),
      movimientos: movs, facturas: facturas, subvenciones: subvenciones,
      resumen: { cuentas: (cfg.cuentas || []).length, movimientos: movs.length, facturas: facturas.length, subvenciones: subvenciones.length,
        anticipos: (c.anticipos || []).length },
    };
  }

  return { paquete: paquete, centroDe: centroDe };
});

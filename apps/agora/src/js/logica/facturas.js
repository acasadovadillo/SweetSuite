/*
 * Agora — Lógica de facturas (sin interfaz: tests/facturas.test.js).
 *
 * FACTURA:
 *   { id, tipo: "emitida" | "recibida",
 *     estado: "borrador" | "emitida" | "anulada"    (las recibidas nacen «emitida»)
 *     serie, numero (texto: «2026-0007» en las emitidas; el del proveedor en las recibidas),
 *     fecha, fechaOperacion (si es distinta), vencimiento,
 *     tercero: { nombre, nif, direccion, email },   (cliente o proveedor)
 *     lineas: [{ concepto, cantidad (número, admite decimales), precio (céntimos),
 *                tratamiento: "sujeto" | "exento" | "no_sujeto", tipoIva (21, 10, 4, 0) }],
 *     retencionPct (IRPF, p. ej. 15), deducible (recibidas: si su IVA se deduce),
 *     motivoExencion (texto que debe figurar si hay líneas exentas),
 *     categoriaId, proyectoId, notas }
 *
 * CÁLCULO (todo en céntimos):
 *   · base de cada línea = cantidad × precio, redondeada al céntimo;
 *   · la cuota de IVA se calcula sobre la SUMA de bases de cada tipo (no línea a
 *     línea), que es como suele hacerse en una factura con varias líneas;
 *   · retención = % sobre la suma de bases;
 *   · total = bases + cuotas − retención.
 * Criterio de redondeo y menciones obligatorias de una factura (Real Decreto
 * 1619/2012): verificar con asesoría.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { Dinero: require("../nucleo/dinero.js"), Fechas: require("../nucleo/fechas.js") }
    : { Dinero: raiz.WA.Dinero, Fechas: raiz.WA.Fechas };
  var modulo = fabrica(dep.Dinero, dep.Fechas);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Facturas = modulo;
})(typeof self !== "undefined" ? self : this, function (D, F) {
  "use strict";

  var TIPOS_IVA = [21, 10, 4, 0];
  var TRATAMIENTOS = [["sujeto", "Sujeto a IVA"], ["exento", "Exento de IVA"], ["no_sujeto", "No sujeto a IVA"]];

  function lineaVacia(tratamiento) {
    return { concepto: "", cantidad: 1, precio: 0, tratamiento: tratamiento || "sujeto", tipoIva: 21 };
  }

  function baseLinea(l) {
    var cantidad = Number(l.cantidad);
    if (!isFinite(cantidad)) cantidad = 0;
    return D.redondear(cantidad * (Number(l.precio) || 0));
  }

  /**
   * Totales de una factura:
   *   { porTipo: [{ tratamiento, tipoIva, base, cuota }], base, cuota, baseSujeta, baseExenta,
   *     baseNoSujeta, retencion, total }
   */
  function totales(f) {
    var grupos = {};
    (f.lineas || []).forEach(function (l) {
      var trat = l.tratamiento || "sujeto";
      var tipo = trat === "sujeto" ? Number(l.tipoIva) || 0 : 0;
      var k = trat + "|" + tipo;
      if (!grupos[k]) grupos[k] = { tratamiento: trat, tipoIva: tipo, base: 0, cuota: 0 };
      grupos[k].base += baseLinea(l);
    });
    var porTipo = Object.keys(grupos).map(function (k) {
      var g = grupos[k];
      g.cuota = g.tratamiento === "sujeto" ? D.porcentaje(g.base, g.tipoIva) : 0;
      return g;
    }).sort(function (a, b) { return a.tratamiento.localeCompare(b.tratamiento) || b.tipoIva - a.tipoIva; });
    var suma = function (filtro, campo) {
      return D.sumar(porTipo.filter(filtro).map(function (g) { return g[campo]; }));
    };
    var todos = function () { return true; };
    var base = suma(todos, "base"), cuota = suma(todos, "cuota");
    var retencion = f.retencionPct > 0 ? D.porcentaje(base, Number(f.retencionPct)) : 0;
    return {
      porTipo: porTipo, base: base, cuota: cuota, retencion: retencion, total: base + cuota - retencion,
      baseSujeta: suma(function (g) { return g.tratamiento === "sujeto"; }, "base"),
      baseExenta: suma(function (g) { return g.tratamiento === "exento"; }, "base"),
      baseNoSujeta: suma(function (g) { return g.tratamiento === "no_sujeto"; }, "base"),
    };
  }

  /**
   * Siguiente número de una factura emitida: «2026-0001», correlativo por año
   * (y por serie si la hay: «A-2026-0001»). Se calcula a partir de las ya
   * emitidas, así nunca se repite ni salta un número aunque se borre un borrador.
   */
  function siguienteNumero(facturas, anio, serie) {
    var prefijo = (serie ? serie + "-" : "") + anio + "-";
    var max = 0;
    (facturas || []).forEach(function (f) {
      if (f.tipo !== "emitida" || f.estado === "borrador" || !f.numero || f.numero.indexOf(prefijo) !== 0) return;
      var n = parseInt(f.numero.slice(prefijo.length), 10);
      if (n > max) max = n;
    });
    return prefijo + String(max + 1).padStart(4, "0");
  }

  /** ¿Se puede emitir? Devuelve la lista de problemas (vacía si está bien). */
  function revisar(f) {
    var p = [];
    if (!F.esValida(f.fecha)) p.push("Falta la fecha.");
    if (!String((f.tercero || {}).nombre || "").trim()) p.push(f.tipo === "emitida" ? "Falta el cliente." : "Falta el proveedor.");
    var lineas = (f.lineas || []).filter(function (l) { return String(l.concepto || "").trim() || l.precio; });
    if (!lineas.length) p.push("La factura no tiene ninguna línea.");
    lineas.forEach(function (l, i) {
      if (!String(l.concepto || "").trim()) p.push("La línea " + (i + 1) + " no tiene concepto.");
      if (!isFinite(Number(l.cantidad)) || Number(l.cantidad) === 0) p.push("La línea " + (i + 1) + " no tiene cantidad.");
    });
    if (f.tipo === "emitida" && lineas.some(function (l) { return l.tratamiento === "exento"; }) && !String(f.motivoExencion || "").trim()) {
      p.push("Hay líneas exentas: indica el motivo de la exención (el artículo de la ley que la ampara).");
    }
    if (f.tipo === "recibida" && !String(f.numero || "").trim()) p.push("Falta el número de la factura del proveedor.");
    return p;
  }

  /**
   * Cuánto se ha cobrado (emitidas) o pagado (recibidas) de una factura, mirando
   * los movimientos y los gastos de anticipos/reembolsos enlazados a ella.
   */
  function estadoPago(f, movimientos, anticipos) {
    var t = totales(f).total;
    var pagado = 0;
    (movimientos || []).forEach(function (m) { if (m.facturaId === f.id) pagado += m.importe; });
    (anticipos || []).forEach(function (a) {
      (a.gastos || []).forEach(function (g) { if (g.facturaId === f.id) pagado += g.importe; });
    });
    var pendiente = t - pagado;
    return {
      total: t, pagado: pagado, pendiente: pendiente,
      estado: f.estado === "anulada" ? "anulada" : f.estado === "borrador" ? "borrador"
        : pendiente <= 0 ? (f.tipo === "emitida" ? "cobrada" : "pagada") : pagado > 0 ? "parcial" : "pendiente",
    };
  }

  /** Trimestre de una fecha: "2026-10-01" → "2026-T4". */
  function trimestre(fechaISO) {
    var m = +String(fechaISO).slice(5, 7);
    return String(fechaISO).slice(0, 4) + "-T" + Math.ceil(m / 3);
  }

  return {
    TIPOS_IVA: TIPOS_IVA, TRATAMIENTOS: TRATAMIENTOS, lineaVacia: lineaVacia, baseLinea: baseLinea,
    totales: totales, siguienteNumero: siguienteNumero, revisar: revisar, estadoPago: estadoPago, trimestre: trimestre,
  };
});

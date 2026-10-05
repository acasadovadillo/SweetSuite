/*
 * webkit_asociaciones — Importar el extracto del banco (sin interfaz: tests/extracto.test.js).
 *
 * Cada banco exporta a su manera (CSV o Excel, con unas filas de cabecera
 * antes de la tabla, importe en una columna con signo o en dos columnas
 * «cargo» y «abono»…). Esto:
 *   1. busca la fila de títulos y adivina qué columna es cada cosa
 *      (se puede corregir a mano en la pantalla de importación);
 *   2. convierte cada fila en un movimiento (ingreso si el importe es positivo,
 *      gasto si es negativo), sin categoría salvo que una regla la ponga;
 *   3. descarta los que ya estaban importados (misma cuenta, fecha, importe y concepto);
 *   4. sugiere con qué cuota o factura casa cada movimiento.
 * No guarda nada: devuelve lo que habría que guardar.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { Dinero: require("../nucleo/dinero.js"), Fechas: require("../nucleo/fechas.js"), Facturas: require("./facturas.js"), Cuotas: require("./cuotas.js") }
    : { Dinero: raiz.WA.Dinero, Fechas: raiz.WA.Fechas, Facturas: raiz.WA.Facturas, Cuotas: raiz.WA.Cuotas };
  var modulo = fabrica(dep.Dinero, dep.Fechas, dep.Facturas, dep.Cuotas);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Extracto = modulo;
})(typeof self !== "undefined" ? self : this, function (D, F, Fac, Cuotas) {
  "use strict";

  var plano = function (s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  };

  var CAMPOS = {
    fecha: ["fecha", "fecha operacion", "fecha de operacion", "f. operacion", "fecha contable", "fecha valor", "f. valor", "date"],
    concepto: ["concepto", "descripcion", "movimiento", "detalle", "concepto / descripcion", "observaciones", "descripcion del movimiento", "description"],
    importe: ["importe", "cantidad", "importe (eur)", "importe eur", "importe (€)", "importe euros", "amount"],
    cargo: ["cargo", "cargos", "debe", "salida", "salidas", "gastos", "reintegro"],
    abono: ["abono", "abonos", "haber", "entrada", "entradas", "ingresos", "ingreso"],
    saldo: ["saldo", "saldo (eur)", "saldo eur", "saldo disponible", "balance"],
  };

  /**
   * Busca, en las primeras filas, la que parece la cabecera y qué columna es cada campo.
   * Devuelve { fila: índice, columnas: { fecha, concepto, importe, cargo, abono, saldo } } o null.
   */
  function detectarColumnas(filas) {
    var limite = Math.min(filas.length, 30);
    for (var f = 0; f < limite; f++) {
      var cols = {};
      (filas[f] || []).forEach(function (celda, i) {
        var t = plano(celda).replace(/[:.]$/, "");
        Object.keys(CAMPOS).forEach(function (campo) {
          if (cols[campo] === undefined && CAMPOS[campo].indexOf(t) >= 0) cols[campo] = i;
        });
      });
      var tieneImporte = cols.importe !== undefined || cols.cargo !== undefined || cols.abono !== undefined;
      if (cols.fecha !== undefined && tieneImporte) {
        // Si hay «fecha operación» y «fecha valor», nos quedamos con la primera que apareció.
        return { fila: f, columnas: cols };
      }
    }
    return null;
  }

  /** Lee una fecha de una celda: texto («01/10/2026», «2026-10-01») o número de Excel. */
  function leerFecha(v) {
    if (typeof v === "number" && v > 20000 && v < 80000) {
      var d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
      return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
    }
    return F.desdeTexto(String(v == null ? "" : v).trim().slice(0, 10));
  }
  /** Lee un importe: número (Excel) o texto («-1.234,56», «1.234,56 €»). */
  function leerImporte(v) {
    if (v === "" || v == null) return null;
    if (typeof v === "number") return D.aCentimos(v);
    return D.desdeTexto(v);
  }

  /** Clave para detectar duplicados: misma cuenta, fecha, importe con signo y concepto. */
  var claveDe = function (cuentaId, fecha, importeConSigno, concepto) {
    return [cuentaId, fecha, importeConSigno, plano(concepto).slice(0, 60)].join("|");
  };

  /**
   * Convierte las filas del extracto en movimientos.
   * opciones: { filas, columnas (de detectarColumnas o elegidas a mano), filaCabecera,
   *             cuentaId, existentes (movimientos ya guardados), reglas: [{ texto, categoriaId }] }
   * Devuelve { nuevos: [movimiento], duplicados: n, problemas: [{ fila, mensaje }] }
   */
  function convertir(o) {
    var c = o.columnas, problemas = [], nuevos = [], duplicados = 0;
    // Cuántas veces aparece cada clave en lo ya guardado (dos cargos iguales el mismo día son posibles).
    var ya = {};
    (o.existentes || []).forEach(function (m) {
      if (m.tipo !== "ingreso" && m.tipo !== "gasto") return;
      var k = claveDe(m.cuentaId, m.fecha, m.tipo === "ingreso" ? m.importe : -m.importe, m.conceptoBanco || m.concepto);
      ya[k] = (ya[k] || 0) + 1;
    });
    var reglas = (o.reglas || []).filter(function (r) { return plano(r.texto); });
    for (var i = (o.filaCabecera || 0) + 1; i < o.filas.length; i++) {
      var fila = o.filas[i] || [];
      if (!fila.some(function (x) { return String(x).trim() !== ""; })) continue;
      var nFila = i + 1;
      var fecha = leerFecha(fila[c.fecha]);
      var importe = null;
      if (c.importe !== undefined && c.importe !== null && c.importe !== "") importe = leerImporte(fila[c.importe]);
      else {
        var cargo = c.cargo !== undefined ? leerImporte(fila[c.cargo]) : null;
        var abono = c.abono !== undefined ? leerImporte(fila[c.abono]) : null;
        if (cargo || abono) importe = (abono || 0) - Math.abs(cargo || 0);
      }
      if (!fecha && importe === null) continue;            // filas de totales o notas al pie
      if (!fecha) { problemas.push({ fila: nFila, mensaje: "Sin fecha válida: no se importa." }); continue; }
      if (importe === null || importe === 0) { problemas.push({ fila: nFila, mensaje: "Sin importe: no se importa." }); continue; }
      var concepto = c.concepto !== undefined ? String(fila[c.concepto] == null ? "" : fila[c.concepto]).trim() : "";
      var k = claveDe(o.cuentaId, fecha, importe, concepto);
      if (ya[k]) { ya[k]--; duplicados++; continue; }
      var regla = reglas.filter(function (r) { return plano(concepto).indexOf(plano(r.texto)) >= 0; })[0];
      nuevos.push({
        fecha: fecha, cuentaId: o.cuentaId, tipo: importe > 0 ? "ingreso" : "gasto", importe: Math.abs(importe),
        concepto: concepto, conceptoBanco: concepto, categoriaId: regla ? regla.categoriaId : "", proyectoId: "",
        origen: "extracto", cuotaIds: [], facturaId: "", anticipoId: "", notas: "",
      });
    }
    return { nuevos: nuevos, duplicados: duplicados, problemas: problemas };
  }

  /**
   * Sugerencias de conciliación para un movimiento:
   *   ingreso → cuotas sin cobrar del mismo importe cuyo socio aparece en el concepto,
   *             y facturas emitidas pendientes por ese importe;
   *   gasto   → facturas recibidas pendientes por ese importe.
   * Devuelve [{ tipo: "cuota" | "factura", id, texto, puntos }] de más a menos probable.
   */
  function sugerencias(m, datos) {
    var out = [];
    var concepto = plano(m.conceptoBanco || m.concepto);
    var palabras = function (nombre) { return plano(nombre).split(" ").filter(function (p) { return p.length > 2; }); };
    if (m.tipo === "ingreso") {
      var deCuotas = [];
      (datos.cuotas || []).forEach(function (q) {
        if (!Cuotas.debe(q) || q.importe !== m.importe) return;
        var coinciden = palabras(q.socioNombre).filter(function (p) { return concepto.indexOf(p) >= 0; }).length;
        if (!coinciden) return;
        deCuotas.push({ tipo: "cuota", id: q.id, texto: "Cuota de " + q.socioNombre + " · " + q.concepto, puntos: coinciden });
      });
      // Solo las que más palabras del nombre comparten: un apellido suelto en común no basta
      // si hay otra cuota que coincide en nombre y apellidos.
      var mejor = Math.max.apply(null, [0].concat(deCuotas.map(function (x) { return x.puntos; })));
      out = out.concat(deCuotas.filter(function (x) { return x.puntos === mejor; }));
    }
    (datos.facturas || []).forEach(function (f) {
      var buscada = m.tipo === "ingreso" ? "emitida" : "recibida";
      if (f.tipo !== buscada || f.estado === "borrador" || f.estado === "anulada") return;
      var e = Fac.estadoPago(f, datos.movimientos, datos.anticipos);
      if (e.pendiente !== m.importe) return;
      var puntos = 1 + palabras((f.tercero || {}).nombre).filter(function (p) { return concepto.indexOf(p) >= 0; }).length +
        (f.numero && concepto.indexOf(plano(f.numero)) >= 0 ? 3 : 0);
      out.push({ tipo: "factura", id: f.id, texto: "Factura " + (f.numero || "") + " · " + ((f.tercero || {}).nombre || ""), puntos: puntos });
    });
    return out.sort(function (a, b) { return b.puntos - a.puntos; });
  }

  return { CAMPOS: CAMPOS, detectarColumnas: detectarColumnas, leerFecha: leerFecha, leerImporte: leerImporte, convertir: convertir, sugerencias: sugerencias };
});

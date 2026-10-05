/*
 * webkit_asociaciones — Ayuda para el IVA (sin interfaz: tests/iva.test.js).
 *
 * ⚠️ ES UNA AYUDA ORIENTATIVA, NO ASESORAMIENTO FISCAL. Suma lo que hay en las
 * facturas para que sea más fácil rellenar el modelo 303 (trimestral) y el
 * resumen anual, pero quien presenta los modelos debe revisarlo. Todo lo que
 * depende de la norma lleva «verificar con asesoría».
 *
 * Qué hace:
 *   · IVA devengado: el de las facturas EMITIDAS (no borradores ni anuladas)
 *     con fecha en el trimestre, por tipo (21, 10, 4 %).
 *   · IVA deducible: el de las facturas RECIBIDAS marcadas como deducibles, con
 *     fecha en el trimestre, multiplicado por el porcentaje de deducción
 *     (prorrata) que se haya configurado. La app NO calcula la prorrata: hay que
 *     indicarla (verificar con asesoría).
 *   · Resultado del trimestre = devengado − deducible − lo que quedaba por
 *     compensar de trimestres anteriores (solo hasta dejarlo en cero).
 *   · Si sale NEGATIVO:
 *       – en el 1.º, 2.º y 3.er trimestre la diferencia queda «A COMPENSAR» en
 *         los siguientes; no se puede pedir que la devuelvan;
 *       – en el 4.º trimestre se puede elegir entre compensar o pedir la
 *         devolución.
 *     (Regla general; las entidades inscritas en el registro de devolución
 *     mensual, REDEME, tienen otro régimen. Verificar con asesoría.)
 *   · Retenciones de IRPF practicadas en facturas recibidas (las que se
 *     ingresan con el modelo 111), por trimestre.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { Dinero: require("../nucleo/dinero.js"), Facturas: require("./facturas.js") }
    : { Dinero: raiz.WA.Dinero, Facturas: raiz.WA.Facturas };
  var modulo = fabrica(dep.Dinero, dep.Facturas);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).IVA = modulo;
})(typeof self !== "undefined" ? self : this, function (D, Fac) {
  "use strict";

  var cuenta = function (f) { return f.estado !== "borrador" && f.estado !== "anulada"; };
  var trimestres = function (anio) { return [1, 2, 3, 4].map(function (t) { return anio + "-T" + t; }); };
  var anterior = function (clave) {
    var a = +clave.slice(0, 4), t = +clave.slice(-1);
    return t === 1 ? (a - 1) + "-T4" : a + "-T" + (t - 1);
  };

  /** Sumas de un trimestre (sin compensaciones). */
  function sumasTrimestre(facturas, clave, config) {
    var cfg = (config && config.iva) || {};
    var prorrata = cfg.prorrata == null ? 100 : Number(cfg.prorrata);
    var devengado = {}, soportado = {};
    var r = { clave: clave, devengadoPorTipo: [], soportadoPorTipo: [], devengado: 0, soportado: 0, deducible: 0,
      baseExenta: 0, baseNoSujeta: 0, retenciones: 0, nEmitidas: 0, nRecibidas: 0, prorrata: prorrata };
    (facturas || []).forEach(function (f) {
      if (!cuenta(f) || !f.fecha || Fac.trimestre(f.fecha) !== clave) return;
      var t = Fac.totales(f);
      if (f.tipo === "emitida") {
        r.nEmitidas++;
        r.baseExenta += t.baseExenta;
        r.baseNoSujeta += t.baseNoSujeta;
        t.porTipo.forEach(function (g) {
          if (g.tratamiento !== "sujeto") return;
          var k = g.tipoIva;
          devengado[k] = devengado[k] || { tipoIva: k, base: 0, cuota: 0 };
          devengado[k].base += g.base; devengado[k].cuota += g.cuota;
        });
      } else {
        r.nRecibidas++;
        r.retenciones += t.retencion;
        if (f.deducible === false) return;
        t.porTipo.forEach(function (g) {
          if (g.tratamiento !== "sujeto") return;
          var k = g.tipoIva;
          soportado[k] = soportado[k] || { tipoIva: k, base: 0, cuota: 0 };
          soportado[k].base += g.base; soportado[k].cuota += g.cuota;
        });
      }
    });
    var lista = function (o) { return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return b.tipoIva - a.tipoIva; }); };
    r.devengadoPorTipo = lista(devengado);
    r.soportadoPorTipo = lista(soportado);
    r.devengado = D.sumar(r.devengadoPorTipo.map(function (x) { return x.cuota; }));
    r.soportado = D.sumar(r.soportadoPorTipo.map(function (x) { return x.cuota; }));
    r.deducible = prorrata >= 100 ? r.soportado : D.porcentaje(r.soportado, prorrata);
    return r;
  }

  /**
   * Liquidaciones encadenadas: calcula trimestre a trimestre desde el primero
   * que tiene facturas (o desde config.iva.periodoSaldoInicial) hasta «hasta»,
   * arrastrando lo que queda a compensar.
   * config.iva: { prorrata, saldoACompensarInicial, periodoSaldoInicial, devolucionesSolicitadas: ["2025-T4"] }
   * Devuelve un objeto { "2026-T1": liquidación, ... }.
   */
  function liquidaciones(facturas, config, hasta) {
    var cfg = (config && config.iva) || {};
    var claves = (facturas || []).filter(function (f) { return cuenta(f) && f.fecha; }).map(function (f) { return Fac.trimestre(f.fecha); });
    if (cfg.periodoSaldoInicial) claves.push(cfg.periodoSaldoInicial);
    claves.push(hasta);
    claves.sort();
    var desde = claves[0];
    var devoluciones = cfg.devolucionesSolicitadas || [];
    var pendiente = cfg.periodoSaldoInicial ? Number(cfg.saldoACompensarInicial) || 0 : 0;
    var out = {}, clave = desde, vueltas = 0;
    while (clave <= hasta && vueltas++ < 400) {
      var s = sumasTrimestre(facturas, clave, config);
      s.resultadoPeriodo = s.devengado - s.deducible;
      s.compensacionDisponible = pendiente;
      s.compensacionAplicada = s.resultadoPeriodo > 0 ? Math.min(pendiente, s.resultadoPeriodo) : 0;
      s.resultado = s.resultadoPeriodo - s.compensacionAplicada;
      pendiente -= s.compensacionAplicada;
      var cuarto = clave.slice(-1) === "4";
      if (s.resultado > 0) {
        s.situacion = "ingresar";
        s.aviso = "";
      } else if (s.resultado === 0) {
        s.situacion = "cero";
        s.aviso = "";
      } else if (cuarto && devoluciones.indexOf(clave) >= 0) {
        s.situacion = "devolver";
        s.aviso = "Se ha marcado que en este 4.º trimestre se pide la devolución.";
      } else {
        s.situacion = "compensar";
        pendiente += -s.resultado;
        s.aviso = cuarto
          ? "Resultado negativo en el 4.º trimestre: se puede pedir la devolución o dejarlo a compensar. Ahora está «a compensar»."
          : "Resultado negativo: márcalo «A COMPENSAR», no «a devolver». Solo en el 4.º trimestre se puede pedir la devolución (salvo REDEME).";
      }
      s.quedaACompensar = pendiente;
      out[clave] = s;
      clave = siguiente(clave);
    }
    return out;
  }
  function siguiente(clave) {
    var a = +clave.slice(0, 4), t = +clave.slice(-1);
    return t === 4 ? (a + 1) + "-T1" : a + "-T" + (t + 1);
  }

  /** Resumen de un año: los cuatro trimestres y los totales por tipo. */
  function resumenAnual(facturas, config, anio) {
    var todas = liquidaciones(facturas, config, anio + "-T4");
    var trs = trimestres(anio).map(function (k) { return todas[k] || Object.assign(sumasTrimestre(facturas, k, config), { resultado: 0, situacion: "cero" }); });
    var acumular = function (campo) {
      var o = {};
      trs.forEach(function (t) {
        (t[campo] || []).forEach(function (g) {
          o[g.tipoIva] = o[g.tipoIva] || { tipoIva: g.tipoIva, base: 0, cuota: 0 };
          o[g.tipoIva].base += g.base; o[g.tipoIva].cuota += g.cuota;
        });
      });
      return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return b.tipoIva - a.tipoIva; });
    };
    var suma = function (campo) { return D.sumar(trs.map(function (t) { return t[campo] || 0; })); };
    return {
      anio: anio, trimestres: trs,
      devengadoPorTipo: acumular("devengadoPorTipo"), soportadoPorTipo: acumular("soportadoPorTipo"),
      devengado: suma("devengado"), deducible: suma("deducible"), baseExenta: suma("baseExenta"),
      baseNoSujeta: suma("baseNoSujeta"), retenciones: suma("retenciones"),
      ingresado: D.sumar(trs.filter(function (t) { return t.situacion === "ingresar"; }).map(function (t) { return t.resultado; })),
      quedaACompensar: trs[3].quedaACompensar || 0,
    };
  }

  /** Avisos generales según la configuración y las facturas. */
  function avisos(facturas, config) {
    var cfg = (config && config.iva) || {};
    var out = [];
    var hayExentas = (facturas || []).some(function (f) { return f.tipo === "emitida" && cuenta(f) && Fac.totales(f).baseExenta > 0; });
    if (hayExentas && !(cfg.prorrata < 100)) {
      out.push("Hay facturas emitidas con operaciones exentas. Cuando una entidad hace operaciones exentas y sujetas a la vez, puede que no pueda deducir todo el IVA soportado (prorrata). Consultadlo con la asesoría y, si procede, indicad el porcentaje en Tesorería → Ajustes.");
    }
    if (cfg.prorrata < 100) out.push("Se está aplicando un porcentaje de deducción del " + cfg.prorrata + " % al IVA soportado (prorrata indicada en Ajustes).");
    return out;
  }

  return { sumasTrimestre: sumasTrimestre, liquidaciones: liquidaciones, resumenAnual: resumenAnual, avisos: avisos, trimestres: trimestres, anterior: anterior, siguiente: siguiente };
});

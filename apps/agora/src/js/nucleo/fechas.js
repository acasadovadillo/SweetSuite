/*
 * Agora — Fechas.
 *
 * Todas las fechas se GUARDAN como texto ISO «aaaa-mm-dd» (2026-10-01): se
 * ordenan bien como texto, no dependen de la zona horaria y cualquier hoja de
 * cálculo las entiende. Solo se convierten a «01/10/2026» para enseñarlas.
 *
 * Se trabaja siempre con fechas LOCALES (sin hora): new Date(año, mes, día).
 * Nunca new Date("2026-10-01"), que el navegador interpreta en UTC y en España
 * puede devolver el día anterior.
 */
(function (raiz, fabrica) {
  var modulo = fabrica();
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Fechas = modulo;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  var dos = function (n) { return String(n).padStart(2, "0"); };

  /** Date local → "aaaa-mm-dd". */
  function aISO(fecha) {
    return fecha.getFullYear() + "-" + dos(fecha.getMonth() + 1) + "-" + dos(fecha.getDate());
  }

  /** Fecha de hoy en ISO. Se puede inyectar «ahora» para los tests. */
  function hoy(ahora) {
    return aISO(ahora || new Date());
  }

  /** "aaaa-mm-dd" → Date local, o null si no es una fecha real (p. ej. 2026-02-30). */
  function desdeISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    var a = +m[1], mes = +m[2], d = +m[3];
    var f = new Date(a, mes - 1, d);
    if (f.getFullYear() !== a || f.getMonth() !== mes - 1 || f.getDate() !== d) return null;
    return f;
  }

  function esValida(iso) {
    return desdeISO(iso) !== null;
  }

  /** "2026-10-01" → "01/10/2026" ("" si no es válida). */
  function corta(iso) {
    var f = desdeISO(iso);
    return f ? dos(f.getDate()) + "/" + dos(f.getMonth() + 1) + "/" + f.getFullYear() : "";
  }

  /** "2026-10-01" → "1 de octubre de 2026". */
  function larga(iso) {
    var f = desdeISO(iso);
    return f ? f.getDate() + " de " + MESES[f.getMonth()] + " de " + f.getFullYear() : "";
  }

  /** Lee "01/10/2026", "1/10/26" o "2026-10-01" y devuelve ISO, o null. */
  function desdeTexto(texto) {
    var s = String(texto || "").trim();
    if (esValida(s)) return s;
    var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(s);
    if (!m) return null;
    var a = +m[3];
    if (m[3].length === 2) a += 2000;
    var iso = a + "-" + dos(+m[2]) + "-" + dos(+m[1]);
    return esValida(iso) ? iso : null;
  }

  /** Días enteros de «desde» a «hasta» (positivo si hasta es posterior). */
  function diasEntre(desde, hasta) {
    var a = desdeISO(desde), b = desdeISO(hasta);
    if (!a || !b) return null;
    // Date.UTC evita que el cambio de hora de marzo/octubre reste o sume una hora.
    var ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    var ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ub - ua) / 864e5);
  }

  function sumarDias(iso, n) {
    var f = desdeISO(iso);
    if (!f) return null;
    f.setDate(f.getDate() + n);
    return aISO(f);
  }

  /** Marca de tiempo completa (para «creado» / «modificado»), en ISO con hora UTC. */
  function marca(ahora) {
    return (ahora || new Date()).toISOString();
  }

  return {
    MESES: MESES, aISO: aISO, hoy: hoy, desdeISO: desdeISO, esValida: esValida,
    corta: corta, larga: larga, desdeTexto: desdeTexto,
    diasEntre: diasEntre, sumarDias: sumarDias, marca: marca,
  };
});

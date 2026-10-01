/*
 * webkit_asociaciones — Tema: claro, oscuro o el del sistema («auto»).
 *
 * Se carga en <head>, ANTES que el CSS, a propósito: si se aplicara después de
 * pintar, quien use el tema oscuro vería un fogonazo blanco en cada carga.
 * Es una preferencia del dispositivo (no un dato de la asociación), así que
 * vive en localStorage, fuera de los datos cifrados.
 *
 * Adaptado de tema.js de Solvento.
 */
(function () {
  "use strict";
  var CLAVE = "webkit_asociaciones_tema";
  var VALIDOS = ["auto", "claro", "oscuro"];
  var sistema = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function guardado() {
    try { var v = localStorage.getItem(CLAVE); return VALIDOS.indexOf(v) >= 0 ? v : "auto"; }
    catch (e) { return "auto"; }
  }
  function efectivo(pref) {
    return pref === "auto" ? (sistema && sistema.matches ? "oscuro" : "claro") : pref;
  }
  function aplicar() {
    document.documentElement.setAttribute("data-tema", efectivo(guardado()));
  }
  function poner(pref) {
    if (VALIDOS.indexOf(pref) < 0) pref = "auto";
    try { localStorage.setItem(CLAVE, pref); } catch (e) { /* sin almacenamiento: dura la sesión */ }
    aplicar();
  }

  aplicar();
  if (sistema && sistema.addEventListener) sistema.addEventListener("change", aplicar);

  window.WA = window.WA || {};
  window.WA.Tema = { poner: poner, actual: guardado, VALIDOS: VALIDOS };
})();

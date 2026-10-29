/*
 * Agora — Preferencias de ESTE dispositivo.
 *
 * No son datos de la asociación (por eso no van cifradas ni en la copia de
 * seguridad): cada ordenador decide las suyas. Viven en localStorage.
 *
 *   bloqueoMinutos   minutos sin usar la aplicación antes de bloquearla (0 = nunca)
 *   borrarAlSalir    al pulsar «Cerrar sesión», borrar los datos de este navegador
 *                    (pensado para ordenadores compartidos: el local de la asociación,
 *                    una biblioteca…). Los datos se recuperan con la copia de seguridad.
 */
(function (raiz) {
  "use strict";
  var CLAVE = "sweetsuite_agora_preferencias";
  var POR_DEFECTO = { bloqueoMinutos: 15, borrarAlSalir: false };

  function leer() {
    try { return Object.assign({}, POR_DEFECTO, JSON.parse(localStorage.getItem(CLAVE) || "{}")); }
    catch (e) { return Object.assign({}, POR_DEFECTO); }
  }
  function poner(cambios) {
    var p = Object.assign(leer(), cambios);
    try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch (e) { /* dura la sesión */ }
    return p;
  }

  (raiz.WA = raiz.WA || {}).Preferencias = { leer: leer, poner: poner, POR_DEFECTO: POR_DEFECTO };
})(typeof self !== "undefined" ? self : this);

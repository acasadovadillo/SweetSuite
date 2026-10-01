/*
 * webkit_asociaciones — Arranque. Es el ÚLTIMO script: para cuando se ejecuta,
 * todos los módulos ya se han registrado.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA;
  WA.App.iniciar();
  WA.Acceso.mostrar();
})(typeof self !== "undefined" ? self : this);

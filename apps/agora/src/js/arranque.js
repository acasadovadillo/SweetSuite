/*
 * Agora — Arranque. Es el ÚLTIMO script: para cuando se ejecuta,
 * todos los módulos ya se han registrado. Se entra con la cuenta de
 * SweetSuite (fuera de SweetSuite, suite-puente.js ya se ha ido a ella).
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA;
  if (!WA.Suite) return;
  WA.App.iniciar();
  WA.App.entrarEnSuite();
})(typeof self !== "undefined" ? self : this);

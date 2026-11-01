/*
 * Agora — El puente con SweetSuite.
 *
 * Agora vive dentro de SweetSuite: la entrada, las contraseñas y la cuenta (la
 * de la empresa y la de quien la representa) son de SweetSuite, que le pasa a
 * Agora su secreto y quién entra, con su cargo (window.parent.SweetSuite).
 * Abierta sola (su carpeta, apps/agora/), se va a SweetSuite con ?app=agora:
 * allí sale la entrada de Agora, con su logo y su color, y al entrar se abre
 * solo Agora, como una app suelta. La cuenta y los datos son los mismos.
 */
(function (raiz) {
  "use strict";
  var ss = null;
  try { ss = raiz.parent !== raiz ? raiz.parent.SweetSuite || null : null; } catch (e) { ss = null; }
  if (!ss) {
    location.replace("../../?app=agora#app/agora");
    return;
  }
  (raiz.WA = raiz.WA || {}).Suite = ss;
})(typeof self !== "undefined" ? self : this);

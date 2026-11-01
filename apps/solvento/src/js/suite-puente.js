/*
 * Solvento — El puente con SweetSuite.
 *
 * Solvento vive dentro de SweetSuite: la entrada, la contraseña y la cuenta son
 * de SweetSuite, que le pasa a Solvento su secreto (window.parent.SweetSuite).
 * Abierta sola (su carpeta, apps/solvento/), se va a SweetSuite con ?app=solvento:
 * allí sale la entrada de Solvento, con su logo y su color, y al entrar se abre
 * solo Solvento, como una app suelta. La cuenta y los datos son los mismos.
 *
 * Va lo primero, antes que tema.js: lo demás pregunta aquí.
 */
(function () {
  "use strict";
  let ss = null;
  try { ss = window.parent !== window ? window.parent.SweetSuite || null : null; } catch (e) { ss = null; }
  if (!ss) {
    location.replace("../../?app=solvento#app/solvento");
    return;
  }
  window.SolventoSuite = ss;
})();

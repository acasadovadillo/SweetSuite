/*
 * Solvento — El puente con SweetSuite.
 *
 * Solvento vive dentro de SweetSuite: la entrada, la contraseña y la cuenta son
 * de SweetSuite, que le pasa a Solvento su secreto (window.parent.SweetSuite).
 * Abierta sola, fuera de SweetSuite, no tiene con qué abrir nada: se va a
 * SweetSuite, que la abre dentro.
 *
 * Va lo primero, antes que tema.js: lo demás pregunta aquí.
 */
(function () {
  "use strict";
  let ss = null;
  try { ss = window.parent !== window ? window.parent.SweetSuite || null : null; } catch (e) { ss = null; }
  if (!ss) {
    location.replace("../../#app/solvento");
    return;
  }
  window.SolventoSuite = ss;
})();

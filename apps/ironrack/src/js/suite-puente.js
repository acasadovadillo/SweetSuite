/*
 * Ironrack — El puente con SweetSuite.
 *
 * Ironrack vive dentro de SweetSuite: la entrada, la contraseña y la cuenta son
 * de SweetSuite, que le pasa a Ironrack su secreto (window.parent.SweetSuite).
 * Abierta sola, fuera de SweetSuite, no tiene con qué abrir nada: se va a
 * SweetSuite, que la abre dentro.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  let ss = null;
  try { ss = window.parent !== window ? window.parent.SweetSuite || null : null; } catch (e) { ss = null; }
  if (!ss) {
    location.replace("../../#app/ironrack");
    return;
  }
  IR.suite = ss;
})();

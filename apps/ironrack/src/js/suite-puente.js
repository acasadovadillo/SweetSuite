/*
 * Ironrack — El puente con SweetSuite.
 *
 * Ironrack vive dentro de SweetSuite: la entrada, la contraseña y la cuenta son
 * de SweetSuite, que le pasa a Ironrack su secreto (window.parent.SweetSuite).
 * Abierta sola (su carpeta, apps/ironrack/), se va a SweetSuite con ?app=ironrack:
 * allí sale la entrada de Ironrack, con su logo y su color, y al entrar se abre
 * solo Ironrack, como una app suelta. La cuenta y los datos son los mismos.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  let ss = null;
  try { ss = window.parent !== window ? window.parent.SweetSuite || null : null; } catch (e) { ss = null; }
  if (!ss) {
    location.replace("../../?app=ironrack#app/ironrack");
    return;
  }
  IR.suite = ss;
})();

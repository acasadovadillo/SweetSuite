/*
 * Ironrack — Color de acento (Ajustes › Apariencia).
 *
 * La paleta es la de «Color de acento» de OpenClaw, medida sobre sus capturas.
 * El color elegido se guarda en el documento cifrado (ajustes.acento), así que
 * acompaña al usuario en todos sus dispositivos; además se deja una copia en
 * este navegador solo para pintar con él la pantalla de entrada, que se ve antes
 * de poder abrir el documento. Un color no es un dato personal.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});

  const ACENTOS = [
    { nombre: "Coral", color: "#ff5c5c" },
    { nombre: "Salmón", color: "#ff8067" },
    { nombre: "Ámbar", color: "#f6b94b" },
    { nombre: "Menta", color: "#50c99c" },
    { nombre: "Turquesa", color: "#31b9b0" },
    { nombre: "Azul", color: "#599cf3" },
    { nombre: "Lavanda", color: "#a78bf7" },
    { nombre: "Rosa", color: "#f572b4" },
    { nombre: "Pizarra", color: "#8795a7" },
  ];
  const PREDETERMINADO = ACENTOS[0].color;
  const CLAVE = "ironrack_acento";

  const valido = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ""));
  const deLaPaleta = (c) => ACENTOS.some((a) => a.color === String(c).toLowerCase());

  // Luminancia relativa (WCAG) para elegir el texto que va encima del acento:
  // blanco salvo en los acentos claros, como hace OpenClaw con el ámbar.
  function luminancia(hex) {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  const textoSobre = (hex) => (luminancia(hex) > 0.4 ? "#0e1015" : "#ffffff");

  function aplicar(color) {
    const c = valido(color) ? color.toLowerCase() : PREDETERMINADO;
    const raiz = document.documentElement.style;
    raiz.setProperty("--acento", c);
    raiz.setProperty("--acento-texto", textoSobre(c));
    try { localStorage.setItem(CLAVE, c); } catch (e) { /* sin almacenamiento */ }
    return c;
  }
  // El de la última vez, para la pantalla de entrada
  const guardado = () => { try { return localStorage.getItem(CLAVE); } catch (e) { return null; } };
  const actual = () => {
    const doc = IR.almacen && IR.almacen.S.doc;
    return (doc && valido(doc.ajustes.acento) && doc.ajustes.acento.toLowerCase()) || PREDETERMINADO;
  };

  aplicar(guardado());

  IR.tema = { ACENTOS, PREDETERMINADO, aplicar, actual, valido, deLaPaleta };
})();

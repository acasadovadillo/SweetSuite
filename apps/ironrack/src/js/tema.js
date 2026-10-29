/*
 * Ironrack — Color de acento (Ajustes › Apariencia).
 *
 * La paleta es la de «Color de acento» de OpenClaw, medida sobre sus capturas.
 * El color elegido se guarda en el documento cifrado (ajustes.acento), así que
 * acompaña al usuario en todos sus dispositivos.
 *
 * El tema claro u oscuro es el de SweetSuite (sweetsuite_tema).
 *
 * La pantalla de entrada va siempre en el rojo de siempre: todavía no se sabe
 * quién entra, y el acento es de cada cuenta. Al entrar se aplica el suyo, y al
 * salir se vuelve al rojo.
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

  // El botón principal no lleva el acento tal cual, sino oscurecido hasta que
  // el texto blanco encima se lea (4,5:1): la misma regla que Solvento. Con el
  // coral es el #d23c3c de OpenClaw, medido a mano.
  const contrasteBlanco = (hex) => 1.05 / (luminancia(hex) + 0.05);
  function boton(hex) {
    if (hex === PREDETERMINADO) return "#d23c3c";
    let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)), c = hex;
    for (let i = 0; i < 60 && contrasteBlanco(c) < 4.5; i++) {
      r *= 0.97; g *= 0.97; b *= 0.97;
      c = "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    }
    return c;
  }

  function aplicar(color) {
    const c = valido(color) ? color.toLowerCase() : PREDETERMINADO;
    const raiz = document.documentElement.style;
    raiz.setProperty("--acento", c);
    raiz.setProperty("--acento-texto", textoSobre(c));
    raiz.setProperty("--boton", boton(c));
    raiz.setProperty("--boton-texto", textoSobre(boton(c)));
    return c;
  }
  const actual = () => {
    const doc = IR.almacen && IR.almacen.S.doc;
    return (doc && valido(doc.ajustes.acento) && doc.ajustes.acento.toLowerCase()) || PREDETERMINADO;
  };

  aplicar(PREDETERMINADO);

  // El tema (claro, oscuro o el del sistema) es el de SweetSuite, de este
  // dispositivo; si se cambia allí, se cambia aquí también al momento.
  const CLAVE_TEMA = "sweetsuite_tema";
  const sistema = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  function aplicarTema() {
    let pref = "auto";
    try { pref = localStorage.getItem(CLAVE_TEMA) || "auto"; } catch (e) { /* el del sistema */ }
    const t = pref === "claro" || pref === "oscuro" ? pref : (sistema && sistema.matches ? "claro" : "oscuro");
    document.documentElement.setAttribute("data-tema", t);
  }
  aplicarTema();
  window.addEventListener("storage", (e) => { if (e.key === CLAVE_TEMA) aplicarTema(); });
  if (sistema && sistema.addEventListener) sistema.addEventListener("change", aplicarTema);
  // Hasta la 1.5.1 se guardaba aquí el último acento para pintar la entrada
  try { localStorage.removeItem("ironrack_acento"); } catch (e) { /* nada que borrar */ }

  IR.tema = { ACENTOS, PREDETERMINADO, aplicar, actual, valido, deLaPaleta };
})();

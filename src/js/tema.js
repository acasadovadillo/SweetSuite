/*
 * SweetSuite — Tema (claro, oscuro o el del sistema) y color de acento.
 *
 * Se carga en <head>, antes que el CSS, para que no haya un fogonazo del otro
 * tema. El tema es de este dispositivo y lo comparten SweetSuite y Solvento
 * (sweetsuite_tema); Ironrack es solo oscura.
 *
 * El acento es de la cuenta: va cifrado en el llavero (preferencias.acento) y
 * se aplica al entrar. La entrada va siempre con el de SweetSuite, el coral:
 * todavía no se sabe quién entra.
 */
(function () {
  "use strict";
  const CLAVE = "sweetsuite_tema";
  const VALIDOS = ["auto", "claro", "oscuro"];
  const sistema = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

  const guardado = () => {
    try { const v = localStorage.getItem(CLAVE); return VALIDOS.indexOf(v) >= 0 ? v : "auto"; }
    catch (e) { return "auto"; }
  };
  const efectivo = (pref) => (pref === "auto" ? (sistema && sistema.matches ? "claro" : "oscuro") : pref);
  function aplicarTema() {
    const t = efectivo(guardado());
    document.documentElement.setAttribute("data-tema", t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "claro" ? "#f6f6f7" : "#0e1015");
  }
  function ponerTema(pref) {
    if (VALIDOS.indexOf(pref) < 0) pref = "auto";
    try { localStorage.setItem(CLAVE, pref); } catch (e) { /* dura la sesión */ }
    aplicarTema();
  }

  // ── Acento: la paleta de OpenClaw, la misma que en Ironrack y Solvento ──
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

  function luminancia(hex) {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  const textoSobre = (hex) => (luminancia(hex) > 0.4 ? "#0e1015" : "#ffffff");
  // El botón principal: el acento oscurecido hasta que el blanco se lea (4,5:1)
  function boton(hex) {
    if (hex === PREDETERMINADO) return "#d23c3c";
    let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)), c = hex;
    for (let i = 0; i < 60 && 1.05 / (luminancia(c) + 0.05) < 4.5; i++) {
      r *= 0.97; g *= 0.97; b *= 0.97;
      c = "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    }
    return c;
  }
  function aplicarAcento(color) {
    const c = valido(color) ? color.toLowerCase() : PREDETERMINADO;
    const raiz = document.documentElement.style;
    raiz.setProperty("--acento", c);
    raiz.setProperty("--acento-texto", textoSobre(c));
    raiz.setProperty("--boton", boton(c));
    raiz.setProperty("--boton-texto", textoSobre(boton(c)));
    return c;
  }

  aplicarTema();
  aplicarAcento(PREDETERMINADO);
  if (sistema && sistema.addEventListener) sistema.addEventListener("change", aplicarTema);

  window.SweetTema = {
    tema: guardado, ponerTema, efectivo: () => efectivo(guardado()),
    ACENTOS, PREDETERMINADO, valido, deLaPaleta, aplicarAcento,
  };
})();

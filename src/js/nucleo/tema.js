/*
 * webkit_asociaciones — Tema (claro, oscuro o el del sistema) y color de acento.
 *
 * Se carga en <head>, ANTES que el CSS, a propósito: si se aplicara después de
 * pintar, quien use el tema oscuro vería un fogonazo blanco en cada carga.
 * El tema es una preferencia del dispositivo (no un dato de la asociación), así
 * que vive en localStorage, fuera de los datos cifrados.
 *
 * El acento es el sistema de Ironrack y Solvento: la paleta de OpenClaw más el
 * verde de ABIES, que es el de siempre. Es de cada usuario y va en los datos
 * cifrados (config.acentos[id del usuario]); lo aplica app.js al entrar, y al
 * salir se vuelve al verde: la pantalla de acceso aún no sabe quién entra.
 * Con un acento elegido, el botón principal lleva el acento oscurecido hasta
 * que el texto blanco se lee (4,5:1), y en el tema claro también el acento,
 * para que se lea sobre blanco.
 *
 * Adaptado de tema.js de Solvento.
 */
(function () {
  "use strict";
  var CLAVE = "webkit_asociaciones_tema";
  var VALIDOS = ["auto", "claro", "oscuro"];
  var sistema = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function guardado() {
    try { var v = localStorage.getItem(CLAVE); return VALIDOS.indexOf(v) >= 0 ? v : "auto"; }
    catch (e) { return "auto"; }
  }
  function efectivo(pref) {
    return pref === "auto" ? (sistema && sistema.matches ? "oscuro" : "claro") : pref;
  }
  function aplicar() {
    document.documentElement.setAttribute("data-tema", efectivo(guardado()));
  }
  function poner(pref) {
    if (VALIDOS.indexOf(pref) < 0) pref = "auto";
    try { localStorage.setItem(CLAVE, pref); } catch (e) { /* sin almacenamiento: dura la sesión */ }
    aplicar();
  }

  // ── Color de acento ──────────────────────────────────────────────────────
  // La paleta de «Color de acento» de OpenClaw (la de Ironrack y Solvento).
  // El verde de ABIES no está aquí: es el de tokens.css, sin acento elegido.
  var ACENTOS = [
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
  var valido = function (c) { return /^#[0-9a-f]{6}$/i.test(String(c || "")); };

  var rgb = function (c) { return [1, 3, 5].map(function (i) { return parseInt(c.slice(i, i + 2), 16); }); };
  var hex = function (v) { return "#" + v.map(function (x) { return ("0" + Math.round(x).toString(16)).slice(-2); }).join(""); };
  /** Un color al tanto por uno sobre un fondo: los tonos del elemento activo. */
  function mezcla(c, fondo, cuanto) {
    var a = rgb(c), b = rgb(fondo);
    return hex(a.map(function (x, i) { return b[i] + (x - b[i]) * cuanto; }));
  }
  // Luminancia relativa (WCAG): texto blanco encima salvo en los acentos claros.
  function luminancia(c) {
    var v = rgb(c).map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  var textoSobre = function (c) { return luminancia(c) > 0.4 ? "#0e1015" : "#ffffff"; };
  /** Oscurecido hasta 4,5:1 con el blanco (con el coral, el #d23c3c de OpenClaw). */
  function boton(c) {
    if (c === "#ff5c5c") return "#d23c3c";
    var v = rgb(c), r = c;
    for (var i = 0; i < 60 && 1.05 / (luminancia(r) + 0.05) < 4.5; i++) {
      v = v.map(function (x) { return x * 0.97; });
      r = hex(v);
    }
    return r;
  }

  /** Aplica un acento («» o null: el verde de ABIES). Devuelve el que queda. */
  function acento(color) {
    var viejo = document.getElementById("acento-usuario");
    if (viejo) viejo.remove();
    if (!valido(color)) return "";
    var c = color.toLowerCase(), b = boton(c);
    var oscuro = "--acento:" + c + ";--acento-hover:" + mezcla("#ffffff", c, 0.15) + ";--acento-texto:" + textoSobre(c) +
      ";--acento-suave:" + mezcla(c, "#0e1015", 0.11) + ";--acento-linea:" + mezcla(c, "#0e1015", 0.25) +
      ";--primario:" + b + ";--primario-texto:" + textoSobre(b) + ";";
    var claro = "--acento:" + b + ";--acento-hover:" + mezcla("#000000", b, 0.15) + ";--acento-texto:" + textoSobre(b) +
      ";--acento-suave:" + mezcla(c, "#ffffff", 0.105) + ";--acento-linea:" + mezcla(c, "#ffffff", 0.32) +
      ";--primario:" + b + ";--primario-texto:" + textoSobre(b) + ";";
    var s = document.createElement("style");
    s.id = "acento-usuario";
    s.textContent = ":root{" + oscuro + "}:root[data-tema=\"claro\"]{" + claro + "}";
    document.head.appendChild(s);
    return c;
  }

  aplicar();
  if (sistema && sistema.addEventListener) sistema.addEventListener("change", aplicar);

  window.WA = window.WA || {};
  window.WA.Tema = { poner: poner, actual: guardado, VALIDOS: VALIDOS, ACENTOS: ACENTOS, acento: acento, valido: valido };
})();

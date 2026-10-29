/*
 * Agora — Dinero.
 *
 * REGLA DE ORO: todos los importes se guardan y se calculan en CÉNTIMOS
 * ENTEROS (1234,56 € → 123456). Nunca en euros con decimales: en coma flotante
 * 0,1 + 0,2 no da 0,3, y en una tesorería esos céntimos acaban descuadrando.
 *
 * Solo se pasa a euros con decimales para ENSEÑAR un importe (formatear) y solo
 * se lee de texto al ESCRIBIRLO el usuario (desdeTexto).
 *
 * Redondeo: «la mitad se aleja del cero» (2,5 → 3; −2,5 → −3), que es el
 * redondeo comercial habitual. Si en algún cálculo concreto (por ejemplo, la
 * cuota de IVA de una factura) la norma exige otro criterio, se indicará allí.
 *
 * Funciona en el navegador (window.WA.Dinero) y en Node (require) para los tests.
 */
(function (raiz, fabrica) {
  var modulo = fabrica();
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Dinero = modulo;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Redondea un número al entero más cercano; la mitad se aleja del cero. */
  function redondear(x) {
    // toPrecision(15) quita el «ruido» de la coma flotante: 1.005 * 100 da
    // 100.49999999999999, que sin esto redondearía a 100 en vez de a 101.
    var limpio = Number(Math.abs(x).toPrecision(15));
    var r = Math.round(limpio);
    return x < 0 ? -r : r;
  }

  /** Euros (número) → céntimos (entero). Solo para datos que ya vienen como número. */
  function aCentimos(euros) {
    var n = Number(euros);
    if (!isFinite(n)) return null;
    return redondear(n * 100);
  }

  /** Céntimos → euros (número). Solo para mostrar o exportar; no calcular con ello. */
  function aEuros(centimos) {
    return centimos / 100;
  }

  /**
   * Lee un importe escrito por una persona y lo devuelve en céntimos, o null si
   * no se entiende. Acepta lo habitual en España y algún formato «de ordenador»:
   *   "12"  "12,5"  "1.234,56"  "1234.56"  "-3,20"  "15 €"  "1 234,56"
   * Caso ambiguo: "1.234" (solo un punto seguido de tres cifras) se lee como
   * mil doscientos treinta y cuatro, que es como se escribe en español.
   */
  function desdeTexto(texto) {
    if (typeof texto === "number") return aCentimos(texto);
    var s = String(texto == null ? "" : texto).trim().replace(/[€\s\u00a0]/g, "");
    if (!s) return null;
    var negativo = false;
    if (s[0] === "-" || s[0] === "−") { negativo = true; s = s.slice(1); }
    else if (s[0] === "+") s = s.slice(1);

    var ultPunto = s.lastIndexOf("."), ultComa = s.lastIndexOf(",");
    var entera, decimales;
    if (ultPunto >= 0 && ultComa >= 0) {
      // Hay los dos: el que va el último es el separador decimal.
      var sepDec = ultComa > ultPunto ? "," : ".";
      var sepMil = sepDec === "," ? "." : ",";
      var partes = s.split(sepDec);
      if (partes.length !== 2) return null;
      entera = partes[0].split(sepMil).join("");
      decimales = partes[1];
    } else if (ultComa >= 0) {
      var p = s.split(",");
      if (p.length !== 2) return null;
      entera = p[0]; decimales = p[1];
    } else if (ultPunto >= 0) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) { entera = s.split(".").join(""); decimales = ""; }
      else {
        var q = s.split(".");
        if (q.length !== 2) return null;
        entera = q[0]; decimales = q[1];
      }
    } else {
      entera = s; decimales = "";
    }
    if (entera === "") entera = "0";
    if (!/^\d+$/.test(entera) || !/^\d*$/.test(decimales)) return null;

    // Aritmética con texto para no pasar nunca por coma flotante.
    var dos = (decimales + "00").slice(0, 2);
    var resto = decimales.slice(2);
    var cent = parseInt(entera, 10) * 100 + parseInt(dos, 10);
    if (resto && parseInt(resto[0], 10) >= 5) cent += 1; // la mitad se aleja del cero
    if (!isFinite(cent) || cent > Number.MAX_SAFE_INTEGER) return null;
    return negativo && cent !== 0 ? -cent : cent;
  }

  /**
   * Céntimos → texto en formato español: 123456 → "1.234,56 €".
   * Se hace a mano (no con Intl) para que el resultado sea idéntico en todos los
   * navegadores y en los tests. Siempre agrupa los miles con punto, también en
   * cifras de cuatro dígitos, porque en tablas de importes se lee mejor.
   * opciones.simbolo = false → "1.234,56" (sin €), útil en campos de formulario.
   */
  function formatear(centimos, opciones) {
    if (centimos == null || !isFinite(centimos)) return "—";
    var conSimbolo = !opciones || opciones.simbolo !== false;
    var neg = centimos < 0;
    var abs = Math.abs(Math.trunc(centimos));
    var entera = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    var dec = String(abs % 100).padStart(2, "0");
    return (neg ? "−" : "") + entera + "," + dec + (conSimbolo ? "\u00a0€" : "");
  }

  /** Suma una lista de importes en céntimos (ignora vacíos). */
  function sumar(lista) {
    var t = 0;
    for (var i = 0; i < (lista || []).length; i++) {
      var v = lista[i];
      if (typeof v === "number" && isFinite(v)) t += v;
    }
    return t;
  }

  /**
   * Porcentaje de un importe, redondeado al céntimo: porcentaje(10000, 21) → 2100.
   * El porcentaje puede tener decimales (10,5 %).
   */
  function porcentaje(centimos, pct) {
    return redondear(centimos * pct / 100);
  }

  /**
   * Reparte un importe en n partes que suman EXACTAMENTE el total. Los céntimos
   * que sobran van a las primeras partes: repartir(1000, 3) → [334, 333, 333].
   */
  function repartir(centimos, n) {
    if (!(n > 0)) return [];
    var signo = centimos < 0 ? -1 : 1;
    var abs = Math.abs(centimos);
    var base = Math.floor(abs / n), sobra = abs - base * n;
    var out = [];
    for (var i = 0; i < n; i++) out.push(signo * (base + (i < sobra ? 1 : 0)));
    return out;
  }

  return {
    redondear: redondear, aCentimos: aCentimos, aEuros: aEuros,
    desdeTexto: desdeTexto, formatear: formatear,
    sumar: sumar, porcentaje: porcentaje, repartir: repartir,
  };
});

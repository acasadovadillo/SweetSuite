/*
 * webkit_asociaciones — CSV (leer y escribir hojas de cálculo en texto).
 *
 * Al ESCRIBIR se usa el formato que Excel en español abre con doble clic:
 *   · separador punto y coma (;), porque la coma es el separador decimal;
 *   · marca BOM al principio, para que Excel reconozca las tildes (UTF-8);
 *   · comillas dobles alrededor de los campos que lo necesitan;
 *   · fin de línea CRLF.
 *
 * Al LEER se acepta casi cualquier CSV: detecta el separador (; , o tabulador),
 * entiende comillas, saltos de línea dentro de un campo y la marca BOM.
 *
 *   escribir(columnas, filas)  columnas: [{ clave, titulo }], filas: [objeto] → texto
 *   leer(texto)                → { cabecera: [texto], filas: [[texto]], numeros: [n.º de fila en la hoja] }
 */
(function (raiz, fabrica) {
  var modulo = fabrica();
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).CSV = modulo;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BOM = "\ufeff";

  function celda(valor, sep) {
    var s = valor == null ? "" : String(valor);
    // Excel ejecutaría como fórmula un texto que empiece por = + - @: se protege
    // con un apóstrofo (riesgo conocido como «inyección CSV»). Los números
    // negativos se dejan tal cual.
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-\d+([.,]\d+)?$/.test(s))) s = "'" + s;
    if (s.indexOf(sep) >= 0 || /["\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function escribir(columnas, filas, separador) {
    var sep = separador || ";";
    var lineas = [columnas.map(function (c) { return celda(c.titulo, sep); }).join(sep)];
    (filas || []).forEach(function (f) {
      lineas.push(columnas.map(function (c) {
        var v = typeof c.valor === "function" ? c.valor(f) : f[c.clave];
        return celda(v, sep);
      }).join(sep));
    });
    return BOM + lineas.join("\r\n") + "\r\n";
  }

  /** Adivina el separador mirando la primera línea (fuera de comillas). */
  function detectarSeparador(texto) {
    var cuenta = { ";": 0, ",": 0, "\t": 0 }, dentro = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (ch === '"') dentro = !dentro;
      else if (!dentro && (ch === "\n" || ch === "\r")) break;
      else if (!dentro && ch in cuenta) cuenta[ch]++;
    }
    var mejor = ";";
    Object.keys(cuenta).forEach(function (k) { if (cuenta[k] > cuenta[mejor]) mejor = k; });
    return mejor;
  }

  function leer(texto) {
    var s = String(texto || "");
    if (s.charAt(0) === BOM) s = s.slice(1);
    var sep = detectarSeparador(s);
    var filas = [], fila = [], campo = "", dentro = false, i = 0;
    while (i < s.length) {
      var ch = s[i];
      if (dentro) {
        if (ch === '"') {
          if (s[i + 1] === '"') { campo += '"'; i += 2; continue; }
          dentro = false; i++; continue;
        }
        campo += ch; i++; continue;
      }
      if (ch === '"' && campo === "") { dentro = true; i++; continue; }
      if (ch === sep) { fila.push(campo); campo = ""; i++; continue; }
      if (ch === "\r" || ch === "\n") {
        fila.push(campo); campo = "";
        filas.push(fila); fila = [];
        if (ch === "\r" && s[i + 1] === "\n") i++;
        i++; continue;
      }
      campo += ch; i++;
    }
    if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
    // Fuera las filas totalmente vacías (líneas en blanco, típicas de Excel), pero
    // recordando el número de fila de cada una tal y como se ve en la hoja (la
    // primera es la 1), para que los avisos señalen la fila correcta.
    var numeros = [];
    filas = filas.filter(function (f, i) {
      var llena = f.some(function (c) { return String(c).trim() !== ""; });
      if (llena) numeros.push(i + 1);
      return llena;
    });
    var cabecera = (filas.shift() || []).map(function (c) { return String(c).trim(); });
    numeros.shift();
    return { cabecera: cabecera, filas: filas, numeros: numeros, separador: sep };
  }

  return { escribir: escribir, leer: leer, BOM: BOM };
});

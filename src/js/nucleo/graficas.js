/*
 * webkit_asociaciones — Gráficas sencillas en SVG, sin librerías.
 *
 *   lineas(serie, opciones)  evolución en el tiempo. serie: [{ fecha, valor }]
 *     opciones: { titulo, formato(valor) → texto, alto, desdeCero (para recuentos) }
 *   barra(parte, total, opciones)  barra de progreso con su porcentaje
 *
 * Los colores salen de las variables del tema (claro u oscuro). Cada gráfica
 * lleva un texto alternativo y una tabla oculta con los datos, para que se pueda
 * leer con lector de pantalla.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, esc = WA.UI.esc;
  var MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var contador = 0; // ids únicos para el degradado de cada gráfica

  function lineas(serie, opciones) {
    var o = opciones || {};
    var fmt = o.formato || function (v) { return String(v); };
    if (!serie || !serie.length) return '<p class="vacio">Sin datos.</p>';
    var an = 600, al = o.alto || 180, mi = 56, md = 12, ms = 14, mb = 26;
    var valores = serie.map(function (p) { return p.valor; });
    var min = Math.min.apply(null, valores), max = Math.max.apply(null, valores);
    if (min === max) { min = min - 1; max = max + 1; }
    // Un poco de aire arriba y abajo, y el cero dentro si los datos están cerca.
    var margen = (max - min) * 0.1, todoPositivo = min >= 0;
    min -= margen; max += margen;
    if (todoPositivo && min < 0) min = 0; // sin valores negativos en el eje si no hay datos negativos
    if (o.desdeCero || (min > 0 && min < (max - min))) min = Math.min(min, 0);
    var x = function (i) { return mi + (serie.length === 1 ? 0 : i * (an - mi - md) / (serie.length - 1)); };
    var y = function (v) { return ms + (al - ms - mb) * (1 - (v - min) / (max - min)); };
    var puntos = serie.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.valor).toFixed(1); });
    var area = "M" + x(0).toFixed(1) + "," + (al - mb) + " L" + puntos.join(" L") + " L" + x(serie.length - 1).toFixed(1) + "," + (al - mb) + " Z";
    var rejilla = [0, 0.5, 1].map(function (t) {
      var v = min + (max - min) * t, yy = y(v).toFixed(1);
      return '<line x1="' + mi + '" x2="' + (an - md) + '" y1="' + yy + '" y2="' + yy + '" class="g-rejilla"/>' +
        '<text x="' + (mi - 6) + '" y="' + yy + '" class="g-eje" text-anchor="end" dominant-baseline="middle">' + esc(fmt(Math.round(v))) + "</text>";
    }).join("");
    var etiquetas = serie.map(function (p, i) {
      if (serie.length > 6 && i % 2 === 1 && i !== serie.length - 1) return "";
      var m = +String(p.fecha).slice(5, 7) - 1;
      return '<text x="' + x(i).toFixed(1) + '" y="' + (al - 8) + '" class="g-eje" text-anchor="middle">' + (MESES_CORTOS[m] || "") + "</text>";
    }).join("");
    var ultimo = serie[serie.length - 1];
    var resumen = (o.titulo ? o.titulo + ": " : "") + "de " + fmt(serie[0].valor) + " a " + fmt(ultimo.valor);
    return '<figure class="grafica"><svg viewBox="0 0 ' + an + " " + al + '" role="img" aria-label="' + esc(resumen) + '">' +
      '<defs><linearGradient id="g-deg-' + (++contador) + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" class="g-degradado-ini"/><stop offset="100%" class="g-degradado-fin"/></linearGradient></defs>' +
      rejilla + '<path d="' + area + '" class="g-area" fill="url(#g-deg-' + contador + ')"/><polyline points="' + puntos.join(" ") + '" class="g-linea"/>' +
      '<circle cx="' + x(serie.length - 1).toFixed(1) + '" cy="' + y(ultimo.valor).toFixed(1) + '" r="4" class="g-punto"/>' + etiquetas + "</svg>" +
      '<table class="sr"><caption>' + esc(o.titulo || "Datos") + "</caption><tbody>" + serie.map(function (p) {
        return "<tr><th>" + esc(p.fecha) + "</th><td>" + esc(fmt(p.valor)) + "</td></tr>";
      }).join("") + "</tbody></table></figure>";
  }

  function barra(parte, total, opciones) {
    var o = opciones || {};
    var pct = total > 0 ? Math.round(parte / total * 100) : 0;
    return '<div class="barra-progreso grande' + (pct > 100 ? " pasada" : "") + '" role="img" aria-label="' + esc((o.titulo || "") + " " + pct + " %") + '"><span style="width:' + Math.min(pct, 100) + '%"></span></div>' +
      '<p class="detalle">' + (o.texto ? esc(o.texto) + " · " : "") + pct + " %</p>";
  }

  WA.Graficas = { lineas: lineas, barra: barra };
})(typeof self !== "undefined" ? self : this);

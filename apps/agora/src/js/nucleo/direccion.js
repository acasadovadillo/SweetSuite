/*
 * Agora — Direcciones postales españolas.
 *
 * Una dirección se guarda por partes (no como una línea de texto) para poder
 * escribirla bien en convocatorias, recibos y certificados, y para comprobar
 * que el código postal corresponde a la provincia.
 *
 *   { tipoVia, nombreVia, numero, km, bloque, portal, escalera, planta, puerta,
 *     complemento, codigoPostal, municipio, provincia }
 *
 * Todo es texto. «numero» admite "s/n" (sin número).
 *
 * Funciones:
 *   vacia()                 dirección vacía
 *   formatear(d)            { linea1, linea2, completa } para enseñar o imprimir
 *   provinciaDeCP(cp)       "28013" → "Madrid" (por las dos primeras cifras)
 *   normalizarProvincia(t)  "malaga" → "Málaga"; "" si no la reconoce
 *   desdeTexto(texto)       reparte una dirección escrita en una línea
 *                           ("C/ Mayor, 15, 5º G") en sus partes. Se usa al
 *                           migrar datos antiguos; es orientativo, no infalible.
 */
(function (raiz, fabrica) {
  var modulo = fabrica();
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Direccion = modulo;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /*
   * Tipos de vía más habituales. [nombre, abreviaturas con las que suele
   * escribirse] — las abreviaturas solo sirven para reconocerlos al leer texto.
   */
  var TIPOS_VIA = [
    ["Calle", ["c/", "c.", "cl", "cl.", "calle", "c"]],
    ["Avenida", ["avda.", "avda", "av.", "av", "avenida"]],
    ["Plaza", ["pza.", "pza", "pl.", "plza.", "plaza"]],
    ["Paseo", ["pº", "p.º", "p°", "pso.", "paseo"]],
    ["Carretera", ["ctra.", "ctra", "carretera"]],
    ["Camino", ["cmno.", "cno.", "camino"]],
    ["Ronda", ["rda.", "ronda"]],
    ["Travesía", ["trva.", "travesía", "travesia"]],
    ["Glorieta", ["gta.", "glorieta"]],
    ["Bulevar", ["blvr.", "bulevar"]],
    ["Rambla", ["rbla.", "rambla"]],
    ["Pasaje", ["pje.", "pasaje"]],
    ["Callejón", ["cjón.", "callejón", "callejon"]],
    ["Costanilla", ["costanilla"]],
    ["Cuesta", ["cta.", "cuesta"]],
    ["Vía", ["vía", "via"]],
    ["Urbanización", ["urb.", "urbanización", "urbanizacion"]],
    ["Polígono", ["pol.", "polígono", "poligono"]],
    ["Barrio", ["bº", "b.º", "barrio"]],
    ["Lugar", ["lugar"]],
    ["Partida", ["partida"]],
    ["Diseminado", ["diseminado"]],
  ];

  /*
   * Provincias por las dos primeras cifras del código postal (01–52), con el
   * nombre oficial (bilingüe donde lo es).
   */
  var PROVINCIAS_CP = {
    "01": "Araba/Álava", "02": "Albacete", "03": "Alicante/Alacant", "04": "Almería", "05": "Ávila",
    "06": "Badajoz", "07": "Illes Balears", "08": "Barcelona", "09": "Burgos", "10": "Cáceres",
    "11": "Cádiz", "12": "Castellón/Castelló", "13": "Ciudad Real", "14": "Córdoba", "15": "A Coruña",
    "16": "Cuenca", "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Gipuzkoa",
    "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León", "25": "Lleida",
    "26": "La Rioja", "27": "Lugo", "28": "Madrid", "29": "Málaga", "30": "Murcia",
    "31": "Navarra", "32": "Ourense", "33": "Asturias", "34": "Palencia", "35": "Las Palmas",
    "36": "Pontevedra", "37": "Salamanca", "38": "Santa Cruz de Tenerife", "39": "Cantabria", "40": "Segovia",
    "41": "Sevilla", "42": "Soria", "43": "Tarragona", "44": "Teruel", "45": "Toledo",
    "46": "Valencia/València", "47": "Valladolid", "48": "Bizkaia", "49": "Zamora", "50": "Zaragoza",
    "51": "Ceuta", "52": "Melilla",
  };

  /** Lista de provincias ordenada alfabéticamente, para un desplegable. */
  var PROVINCIAS = Object.keys(PROVINCIAS_CP).map(function (k) { return PROVINCIAS_CP[k]; })
    .sort(function (a, b) { return a.localeCompare(b, "es"); });

  /** Plantas habituales (sugerencias del campo; se puede escribir cualquier otra). */
  var PLANTAS = ["Sótano", "Semisótano", "Bajo", "Entreplanta", "Principal", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Ático", "Sobreático"];

  var CAMPOS = ["tipoVia", "nombreVia", "numero", "km", "bloque", "portal", "escalera", "planta", "puerta",
    "complemento", "codigoPostal", "municipio", "provincia"];

  function vacia() {
    var d = {};
    CAMPOS.forEach(function (c) { d[c] = ""; });
    return d;
  }

  var sinTildes = function (s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  };

  function provinciaDeCP(cp) {
    var m = /^(\d{2})\d{3}$/.exec(String(cp || "").trim());
    return m ? PROVINCIAS_CP[m[1]] || "" : "";
  }

  /** Reconoce una provincia escrita a mano ("malaga", "Alicante", "Álava"…). */
  function normalizarProvincia(texto) {
    var t = sinTildes(texto);
    if (!t) return "";
    for (var i = 0; i < PROVINCIAS.length; i++) {
      var p = PROVINCIAS[i];
      if (sinTildes(p) === t) return p;
      // Cada mitad de un nombre bilingüe vale por sí sola: "Alicante", "Alacant".
      if (p.indexOf("/") > 0 && p.split("/").some(function (x) { return sinTildes(x) === t; })) return p;
    }
    var alias = { "baleares": "Illes Balears", "islas baleares": "Illes Balears", "vizcaya": "Bizkaia",
      "guipuzcoa": "Gipuzkoa", "la coruna": "A Coruña", "coruna": "A Coruña", "gerona": "Girona",
      "lerida": "Lleida", "orense": "Ourense", "castellon": "Castellón/Castelló", "tenerife": "Santa Cruz de Tenerife" };
    return alias[t] || "";
  }

  /** "5" → "5.º"; "Bajo" → "Bajo". Las plantas numéricas llevan ordinal. */
  function textoPlanta(p) {
    var s = String(p || "").trim();
    return /^\d+$/.test(s) ? s + ".º" : s;
  }

  /**
   * Compone la dirección como se escribe en una carta:
   *   linea1: "Calle Mayor, 15, portal 2, esc. B, 5.º G"
   *   linea2: "28013 Madrid (Madrid)"  — la provincia solo si no coincide con el municipio
   */
  function formatear(d) {
    d = d || {};
    var t = function (c) { return String(d[c] || "").trim(); };
    var partes = [];
    // «Otro» significa que el tipo va escrito dentro del nombre.
    var via = [t("tipoVia") === "Otro" ? "" : t("tipoVia"), t("nombreVia")].filter(Boolean).join(" ");
    if (via) partes.push(via);
    if (t("numero")) partes.push(/^s\/?n$/i.test(t("numero")) ? "s/n" : t("numero"));
    if (t("km")) partes.push("km " + t("km"));
    if (t("bloque")) partes.push("bloque " + t("bloque"));
    if (t("portal")) partes.push("portal " + t("portal"));
    if (t("escalera")) partes.push("esc. " + t("escalera"));
    var pisoPuerta = [textoPlanta(t("planta")), t("puerta")].filter(Boolean).join(" ");
    if (pisoPuerta) partes.push(pisoPuerta);
    if (t("complemento")) partes.push(t("complemento"));
    var linea1 = partes.join(", ");

    var prov = t("provincia");
    var muni = t("municipio");
    // "Madrid (Madrid)" sobra: la provincia solo se añade si se llama distinto que el municipio.
    var mismoNombre = sinTildes(prov).split("/").indexOf(sinTildes(muni)) >= 0;
    var lugar = [t("codigoPostal"), muni].filter(Boolean).join(" ");
    var linea2 = prov && !mismoNombre ? (lugar ? lugar + " (" + prov + ")" : prov) : lugar;
    return { linea1: linea1, linea2: linea2, completa: [linea1, linea2].filter(Boolean).join(", ") };
  }

  // ── Leer una dirección escrita en una sola línea ─────────────────────────
  function tipoDesdeTexto(s) {
    var bajo = s.toLowerCase();
    var mejor = null;
    TIPOS_VIA.forEach(function (tv) {
      tv[1].forEach(function (abr) {
        // La abreviatura tiene que ir seguida de espacio (o ser "c/", "pº"…, que ya se separan solas).
        var cierraSola = /[\/.ºº°]$/.test(abr);
        if (bajo.indexOf(abr) === 0 && (cierraSola || /\s/.test(bajo.charAt(abr.length)))) {
          if (!mejor || abr.length > mejor.abr.length) mejor = { tipo: tv[0], abr: abr };
        }
      });
    });
    return mejor;
  }

  var RE_NUMERO = /^(?:n[º°o]?\.?\s*)?(\d+\s*[a-z]?|s\/?n)$/i;
  var RE_PISO = /^(\d+)\s*(?:\.?\s*[º°ª])?\.?\s*(?:[-–]?\s*([a-z0-9]{1,5}\.?))?$/i;
  var RE_PISO_NOMBRE = /^(bajo|bj\.?|entreplanta|entlo\.?|principal|pral\.?|[áa]tico|sobre[áa]tico|s[óo]tano|semis[óo]tano)\s*(?:[-–]?\s*([a-z0-9]{1,5}\.?))?$/i;
  var PISO_NOMBRE = { bajo: "Bajo", bj: "Bajo", entreplanta: "Entreplanta", entlo: "Entreplanta", principal: "Principal", pral: "Principal",
    atico: "Ático", sobreatico: "Sobreático", sotano: "Sótano", semisotano: "Semisótano" };

  function desdeTexto(texto) {
    var d = vacia();
    var s = String(texto || "").trim().replace(/\s+/g, " ");
    if (!s) return d;
    var tv = tipoDesdeTexto(s);
    if (tv) { d.tipoVia = tv.tipo; s = s.slice(tv.abr.length).trim(); }
    var trozos = s.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
    d.nombreVia = trozos.shift() || "";
    // "Mayor 15" sin coma: el número se separa del nombre.
    var pegado = /^(.*\D)\s+(\d+\s*[a-z]?)$/i.exec(d.nombreVia);
    if (pegado && trozos.every(function (x) { return !RE_NUMERO.test(x); })) {
      d.nombreVia = pegado[1].trim();
      trozos.unshift(pegado[2]);
    }
    var sobra = [];
    trozos.forEach(function (x) {
      var m;
      if (!d.numero && (m = RE_NUMERO.exec(x))) { d.numero = /^s\/?n$/i.test(m[1]) ? "s/n" : m[1].replace(/\s+/g, "").toUpperCase(); return; }
      if (!d.planta && (m = RE_PISO.exec(x))) { d.planta = m[1]; d.puerta = (m[2] || "").toUpperCase(); return; }
      if (!d.planta && (m = RE_PISO_NOMBRE.exec(x))) {
        d.planta = PISO_NOMBRE[sinTildes(m[1]).replace(/\./g, "")] || m[1];
        d.puerta = (m[2] || "").toUpperCase();
        return;
      }
      if ((m = /^portal\s+(.+)$/i.exec(x))) { d.portal = m[1]; return; }
      if ((m = /^esc(?:alera|\.)?\s*(.+)$/i.exec(x))) { d.escalera = m[1]; return; }
      if ((m = /^(?:bloque|blq\.?|bl\.)\s*(.+)$/i.exec(x))) { d.bloque = m[1]; return; }
      if ((m = /^km\.?\s*(.+)$/i.exec(x))) { d.km = m[1]; return; }
      if ((m = /^puerta\s+(.+)$/i.exec(x))) { d.puerta = m[1]; return; }
      sobra.push(x);
    });
    d.complemento = sobra.join(", ");
    return d;
  }

  return {
    TIPOS_VIA: TIPOS_VIA.map(function (t) { return t[0]; }), PROVINCIAS: PROVINCIAS, PLANTAS: PLANTAS, CAMPOS: CAMPOS,
    vacia: vacia, formatear: formatear, provinciaDeCP: provinciaDeCP,
    normalizarProvincia: normalizarProvincia, desdeTexto: desdeTexto,
  };
});

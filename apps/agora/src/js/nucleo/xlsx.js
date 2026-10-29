/*
 * webkit_asociaciones — Excel (.xlsx) sin librerías: escribir y leer.
 *
 * Un .xlsx es un ZIP con unos cuantos XML dentro. Escribirlo cabe aquí (portado
 * de exportar.js de Solvento) y así no hace falta traer una librería de medio
 * mega que dejaría la aplicación sin funcionar sin conexión.
 *
 *   escribir(hojas) → Uint8Array con el .xlsx
 *     hojas: [{ nombre, columnas: [{ titulo, tipo: "texto" | "fecha" | "dinero" | "numero" }], filas: [[valor…]] }]
 *     · "fecha": texto ISO «aaaa-mm-dd» → fecha de Excel (se puede ordenar y agrupar)
 *     · "dinero": CÉNTIMOS enteros → euros con dos decimales
 *   leer(bytes) → Promise<{ nombreHoja: [[valor…]] }>   (filas y columnas desde 0)
 *     Las celdas numéricas vienen como número; las fechas de Excel también (número
 *     de días): usar serieAFecha() para convertirlas.
 *
 * Funciona en el navegador y en Node ≥ 18 (lee con DecompressionStream, que
 * los dos traen). No usa DOMParser, así que se puede probar en Node.
 */
(function (raiz, fabrica) {
  var modulo = fabrica();
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).XLSX = modulo;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var utf8 = function (s) { return new TextEncoder().encode(s); };

  // ── ZIP sin comprimir (método «store») ───────────────────────────────────
  var TABLA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(archivos) {
    var partes = [], central = [], offset = 0;
    var ahora = new Date();
    var hora = ((ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1)) & 0xFFFF;
    var fecha = (((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate()) & 0xFFFF;
    archivos.forEach(function (a) {
      var nombre = utf8(a.nombre), datos = a.datos, crc = crc32(datos);
      var cab = new DataView(new ArrayBuffer(30));
      cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true);
      cab.setUint16(8, 0, true); cab.setUint16(10, hora, true); cab.setUint16(12, fecha, true);
      cab.setUint32(14, crc, true); cab.setUint32(18, datos.length, true); cab.setUint32(22, datos.length, true);
      cab.setUint16(26, nombre.length, true); cab.setUint16(28, 0, true);
      partes.push(new Uint8Array(cab.buffer), nombre, datos);
      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true); cen.setUint16(12, hora, true); cen.setUint16(14, fecha, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
      cen.setUint16(28, nombre.length, true); cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), nombre);
      offset += 30 + nombre.length + datos.length;
    });
    var tamCentral = central.reduce(function (s, x) { return s + x.length; }, 0);
    var fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
    var todo = partes.concat(central, [new Uint8Array(fin.buffer)]);
    var total = todo.reduce(function (s, x) { return s + x.length; }, 0);
    var out = new Uint8Array(total), p = 0;
    todo.forEach(function (x) { out.set(x, p); p += x.length; });
    return out;
  }

  // ── Escribir ─────────────────────────────────────────────────────────────
  var xmlEsc = function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      // XML no admite caracteres de control: si se cuela uno, Excel da el archivo por dañado.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  };
  function letra(i) { // 0 → A, 26 → AA
    var s = "";
    for (var n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }
  /** "2026-10-01" → días desde el 30/12/1899 (la fecha cero de Excel). */
  function fechaASerie(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5);
  }
  function serieAFecha(n) {
    if (typeof n !== "number" || !isFinite(n)) return null;
    var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5);
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }

  var ESTILO = { fecha: 1, dinero: 2, numero: 0 };
  function celda(ref, valor, tipo) {
    if (valor == null || valor === "") return "";
    if (tipo === "fecha") {
      var s = fechaASerie(valor);
      if (s !== null) return '<c r="' + ref + '" s="1"><v>' + s + "</v></c>";
    } else if (tipo === "dinero" && typeof valor === "number" && isFinite(valor)) {
      return '<c r="' + ref + '" s="2"><v>' + (valor / 100).toFixed(2) + "</v></c>";
    } else if (tipo === "numero" && typeof valor === "number" && isFinite(valor)) {
      return '<c r="' + ref + '"><v>' + valor + "</v></c>";
    }
    return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(valor) + "</t></is></c>";
  }
  function hojaXml(h) {
    var tipos = h.columnas.map(function (c) { return c.tipo || "texto"; });
    var filas = ['<row r="1">' + h.columnas.map(function (c, i) { return celda(letra(i) + "1", c.titulo, "texto"); }).join("") + "</row>"];
    (h.filas || []).forEach(function (f, r) {
      filas.push('<row r="' + (r + 2) + '">' + f.map(function (v, i) { return celda(letra(i) + (r + 2), v, tipos[i]); }).join("") + "</row>");
    });
    // Columnas algo más anchas que las de por defecto y la primera fila fija.
    var cols = "<cols>" + h.columnas.map(function (c, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.ancho || (c.tipo === "texto" || !c.tipo ? 28 : 14)) + '" customWidth="1"/>';
    }).join("") + "</cols>";
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      cols + "<sheetData>" + filas.join("") + "</sheetData></worksheet>";
  }
  /** Excel no admite en el nombre de una hoja \ / ? * [ ] : ni más de 31 caracteres. */
  var nombreHoja = function (n, i) { return (String(n || "Hoja " + (i + 1)).replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31)) || "Hoja " + (i + 1); };

  function escribir(hojas) {
    // Nombres válidos y sin repetir (Excel no abre un libro con dos hojas iguales).
    var usados = {};
    var nombres = hojas.map(function (h, i) {
      var base = nombreHoja(h.nombre, i), n = base, k = 2;
      while (usados[n.toLowerCase()]) n = base.slice(0, 27) + " (" + (k++) + ")";
      usados[n.toLowerCase()] = true;
      return n;
    });
    var archivos = [
      { nombre: "[Content_Types].xml", datos: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map(function (h, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") +
        "</Types>") },
      { nombre: "_rels/.rels", datos: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { nombre: "xl/workbook.xml", datos: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        nombres.map(function (n, i) { return '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + "</sheets></workbook>") },
      { nombre: "xl/_rels/workbook.xml.rels", datos: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map(function (h, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
        '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
      // Tres estilos: normal, fecha dd/mm/aaaa y dinero con dos decimales y separador de miles.
      { nombre: "xl/styles.xml", datos: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>') },
    ];
    hojas.forEach(function (h, i) { archivos.push({ nombre: "xl/worksheets/sheet" + (i + 1) + ".xml", datos: utf8(hojaXml(h)) }); });
    return zip(archivos);
  }

  // ── Leer ─────────────────────────────────────────────────────────────────
  async function leerZip(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("El archivo no es un Excel moderno (.xlsx). Si es .xls, ábrelo y guárdalo como .xlsx o .csv.");
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true);
    var dec = new TextDecoder(), partes = {};
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var lNombre = dv.getUint16(p + 28, true), lExtra = dv.getUint16(p + 30, true), lComent = dv.getUint16(p + 32, true);
      partes[dec.decode(u8.subarray(p + 46, p + 46 + lNombre))] = {
        metodo: dv.getUint16(p + 10, true), comprimido: dv.getUint32(p + 20, true), local: dv.getUint32(p + 42, true),
      };
      p += 46 + lNombre + lExtra + lComent;
    }
    return async function (nombre) {
      var e = partes[nombre];
      if (!e) return null;
      var ini = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
      var datos = u8.subarray(ini, ini + e.comprimido);
      if (e.metodo === 0) return dec.decode(datos);
      if (e.metodo !== 8) throw new Error("Compresión no soportada en el Excel.");
      var flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(flujo).text();
    };
  }

  var desescapar = function (s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&amp;/g, "&");
  };
  /** Todo el texto de los <t> de un trozo de XML (las cadenas con formato tienen varios). */
  var textos = function (xml) {
    var out = "", re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g, m;
    while ((m = re.exec(xml))) out += m[1] ? desescapar(m[1]) : "";
    return out;
  };
  var colNum = function (ref) {
    var n = 0, letras = ref.replace(/\d+/g, "");
    for (var i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n - 1;
  };
  var atributo = function (etiqueta, nombre) {
    var m = new RegExp("\\s" + nombre + '="([^"]*)"').exec(etiqueta);
    return m ? m[1] : null;
  };

  async function leer(bytes) {
    var parte = await leerZip(bytes);
    var compartidas = [];
    var ss = await parte("xl/sharedStrings.xml");
    if (ss) (ss.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).forEach(function (si) { compartidas.push(textos(si)); });
    var libro = await parte("xl/workbook.xml");
    var rels = await parte("xl/_rels/workbook.xml.rels") || "";
    var destino = {};
    (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(function (r) { destino[atributo(r, "Id")] = atributo(r, "Target"); });
    var hojas = {};
    var etiquetas = (libro || "").match(/<sheet\b[^>]*>/g) || [];
    for (var i = 0; i < etiquetas.length; i++) {
      var et = etiquetas[i];
      var ruta = destino[atributo(et, "r:id")] || "";
      ruta = ruta.charAt(0) === "/" ? ruta.slice(1) : "xl/" + ruta.replace(/^\.\//, "");
      var xml = await parte(ruta);
      if (!xml) continue;
      var filas = [];
      var reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, m;
      while ((m = reC.exec(xml))) {
        var attrs = " " + m[1], dentro = m[2] || "";
        var ref = atributo(attrs, "r"), tipo = atributo(attrs, "t");
        if (!ref) continue;
        var v = /<v>([\s\S]*?)<\/v>/.exec(dentro), valor = null;
        if (tipo === "s" && v) valor = compartidas[+v[1]];
        else if (tipo === "inlineStr") valor = textos(dentro);
        else if (tipo === "str" && v) valor = desescapar(v[1]);
        else if (tipo === "b" && v) valor = v[1] === "1";
        else if (tipo === "e") valor = null;           // #REF!, #DIV/0!…
        else if (v) valor = parseFloat(v[1]);
        if (valor === null || valor === undefined || valor === "" || (typeof valor === "number" && !isFinite(valor))) continue;
        var fila = +ref.replace(/[A-Z]+/g, "") - 1, col = colNum(ref);
        while (filas.length <= fila) filas.push([]);
        filas[fila][col] = valor;
      }
      // Huecos como "" para que cada fila sea una lista normal.
      hojas[desescapar(atributo(et, "name") || "Hoja " + (i + 1))] = filas.map(function (f) {
        var r = [];
        for (var j = 0; j < f.length; j++) r.push(f[j] === undefined ? "" : f[j]);
        return r;
      });
    }
    return hojas;
  }

  return { escribir: escribir, leer: leer, fechaASerie: fechaASerie, serieAFecha: serieAFecha, TIPO_MIME: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
});

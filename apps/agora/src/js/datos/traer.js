/*
 * Agora — Traer una copia de la app de antes («ABIES · Gestión»).
 *
 * Antes de SweetSuite, los datos vivían en un navegador y se guardaban con
 * copias .json (ver datos/copia.js). Para pasarlos a Agora se abre una de esas
 * copias UNA vez, con lo que pedía entonces:
 *
 *   · Copia de ABIES (desde los usuarios): nombre, cargo, contraseña personal
 *     y contraseña del archivo de cualquiera que tuviera cuenta.
 *   · Copia antigua cifrada: su contraseña.
 *   · Copia sin cifrar: nada.
 *
 * Lo que trae se MEZCLA con lo que ya haya (datos/mezcla.js): los registros se
 * juntan, y en la asociación y la configuración manda la copia, que se apunta
 * como cambiada ahora para que llegue así al resto de la junta. El acento de
 * cada uno (config.acentos) es de ahora y no se toca. Los usuarios de entonces
 * no se traen: quién entra y con qué cargo lo dice SweetSuite.
 *
 * Sin DOM: se prueba en Node (tests/traer.test.js).
 */
(function (raiz, fabrica) {
  var r = typeof require === "function";
  var modulo = fabrica(r ? require("./esquema.js") : raiz.WA.Esquema, r ? require("./mezcla.js") : raiz.WA.Mezcla,
    r ? require("./cuentas.js") : raiz.WA.Cuentas, r ? require("../nucleo/cripto.js") : raiz.WA.Cripto);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Traer = modulo;
})(typeof self !== "undefined" ? self : this, function (Esquema, Mezcla, Cuentas, Cripto) {
  "use strict";

  /** Lo que hay que pedir para abrir una copia ya leída (Copia.leer): "usuario", "contrasena" o "nada". */
  function quePide(lectura) {
    return lectura.boveda ? "usuario" : lectura.cifrada ? "contrasena" : "nada";
  }

  /**
   * Abre la copia: { doc, adjuntos: [[id, bytes]], faltan }. No toca nada; si
   * las credenciales no valen, falla con codigo "ACCESO" o "CONTRASENA".
   */
  async function abrir(lectura, o) {
    o = o || {};
    var doc, llave = null, archivos = lectura.archivos || {};
    if (lectura.boveda) {
      var c = await Cuentas.abrir(lectura.boveda, o);
      doc = c.doc; llave = c.llaveDatos;
    } else if (lectura.cifrada) {
      var r = await Cripto.descifrar(lectura.bloque, o.contrasenaCopia);
      doc = r.objeto; llave = r.llave;
    } else doc = lectura.documento;
    doc = Esquema.migrar(doc);
    var adjuntos = [], ids = (doc.documentos || []).map(function (d) { return d.id; });
    for (var i = 0; i < ids.length; i++) {
      var a = archivos[ids[i]];
      if (!a) continue;
      adjuntos.push([ids[i], llave ? await Cripto.descifrarBytes(Cripto.archivoDesdeBase64(a), llave) : Cripto.desdeBase64(a.datos)]);
    }
    return { doc: doc, adjuntos: adjuntos, faltan: ids.length - adjuntos.length };
  }

  /** Junta lo traído con lo de ahora (ver arriba). Devuelve un documento nuevo. */
  function aplicar(actual, viejo, ahora) {
    var t = ahora || new Date().toISOString();
    viejo = Esquema.migrar(viejo);
    var m = Mezcla.mezclar(actual, viejo);
    m.meta.cambios = m.meta.cambios || {};
    Object.keys(viejo.asociacion).forEach(function (k) {
      m.asociacion[k] = viejo.asociacion[k];
      m.meta.cambios["asociacion." + k] = t;
    });
    Object.keys(viejo.config).forEach(function (k) {
      if (k === "acentos") return;
      m.config[k] = viejo.config[k];
      m.meta.cambios["config." + k] = t;
    });
    // El contador de socios, el mayor (por si ya se dio de alta a alguien aquí)
    var maxNum = m.socios.reduce(function (x, s) { return Math.max(x, +s.numero || 0); }, 0);
    m.config.siguienteNumeroSocio = Math.max(+m.config.siguienteNumeroSocio || 1, maxNum + 1);
    m.meta.cambiosDesdeCopia = 0;
    return m;
  }

  return { quePide: quePide, abrir: abrir, aplicar: aplicar };
});

/*
 * Agora — Mezclar dos versiones del documento, registro a registro.
 *
 * Varios miembros de la junta trabajan a la vez, cada uno en su dispositivo, y
 * todos guardan en el mismo archivo de GitHub. Si ganara el último en guardar,
 * borraría lo que hubiera hecho otro entre medias. Por eso, al traer lo de
 * GitHub, las dos versiones se MEZCLAN:
 *
 *   · Colecciones (socios, cuotas, facturas…): registro a registro por su id;
 *     gana la versión con el «modificado» más reciente. Lo borrado deja una
 *     marca en «borrados» (id → cuándo) para que la otra copia no lo resucite;
 *     si alguien lo cambió DESPUÉS de que otro lo borrara, vuelve.
 *   · El registro de cambios: se juntan los apuntes de los dos.
 *   · Los objetos sueltos (asociación, configuración): campo a campo. El
 *     repositorio apunta en meta.cambios cuándo se cambió cada uno
 *     («config.categorias», «asociacion.nif»…) y gana el más reciente. Si
 *     ninguno lo apuntó (datos de antes de mezclar), gana el documento más
 *     antiguo: el recién creado en otro dispositivo solo trae lo de serie.
 *
 * Da igual el orden: mezclar(a, b) y mezclar(b, a) tienen los mismos datos, así
 * que dos dispositivos que se mezclan entre sí acaban con lo mismo.
 */
(function (raiz, fabrica) {
  var Esquema = typeof require === "function" ? require("./esquema.js") : raiz.WA.Esquema;
  var Repositorio = typeof require === "function" ? require("./repositorio.js") : raiz.WA.Repositorio;
  var modulo = fabrica(Esquema, Repositorio);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Mezcla = modulo;
})(typeof self !== "undefined" ? self : this, function (Esquema, Repositorio) {
  "use strict";

  var OBJETOS = ["asociacion", "config"];
  var mayor = function (x, y) { return String(x || "") > String(y || "") ? x : y; };
  var texto = function (x) { return JSON.stringify(x); };

  /** De dos versiones del mismo registro, la más reciente (con empate, una fija para los dos lados). */
  function ganador(x, y) {
    var mx = String(x.modificado || ""), my = String(y.modificado || "");
    if (mx !== my) return mx > my ? x : y;
    return texto(x) >= texto(y) ? x : y;
  }

  function mezclarColeccion(a, b, borrados) {
    var porId = new Map(), orden = [];
    a.concat(b).forEach(function (r) {
      if (!r || !r.id) return;
      var y = porId.get(r.id);
      if (!y) orden.push(r.id);
      porId.set(r.id, y ? ganador(r, y) : r);
    });
    return orden.map(function (id) { return porId.get(id); })
      .filter(function (r) { return !(borrados[r.id] && String(borrados[r.id]) >= String(r.modificado || "")); });
  }

  function mezclarRegistro(a, b) {
    var vistos = {}, todos = [];
    a.concat(b).forEach(function (x) { if (x && x.id && !vistos[x.id]) { vistos[x.id] = true; todos.push(x); } });
    todos.sort(function (x, y) { return String(x.fecha) < String(y.fecha) ? -1 : String(x.fecha) > String(y.fecha) ? 1 : (x.id < y.id ? -1 : 1); });
    return todos.slice(-Repositorio.MAX_REGISTRO);
  }

  /** Un objeto suelto, campo a campo según meta.cambios («clave.campo» → cuándo). */
  function mezclarObjeto(clave, a, b) {
    var oa = a[clave] || {}, ob = b[clave] || {};
    var ca = a.meta.cambios || {}, cb = b.meta.cambios || {};
    var creadoA = String(a.meta.creado || ""), creadoB = String(b.meta.creado || "");
    var out = {};
    Object.keys(oa).concat(Object.keys(ob)).forEach(function (k) {
      if (k in out) return;
      var ta = String(ca[clave + "." + k] || ""), tb = String(cb[clave + "." + k] || "");
      var deB = tb !== ta ? tb > ta : creadoA !== creadoB ? creadoB < creadoA : texto(ob[k]) > texto(oa[k]);
      var v = deB ? ob[k] : oa[k];
      if (v === undefined) v = deB ? oa[k] : ob[k];
      out[k] = v;
    });
    return out;
  }

  /** Mezcla dos documentos (de cualquier versión): devuelve uno nuevo, sin tocar los dados. */
  function mezclar(a, b) {
    if (!a) return Esquema.migrar(b);
    if (!b) return Esquema.migrar(a);
    a = Esquema.migrar(a);
    b = Esquema.migrar(b);

    var borrados = Object.assign({}, a.borrados);
    Object.keys(b.borrados).forEach(function (id) { borrados[id] = mayor(borrados[id], b.borrados[id]); });
    var cambios = Object.assign({}, a.meta.cambios);
    Object.keys(b.meta.cambios || {}).forEach(function (k) { cambios[k] = mayor(cambios[k], b.meta.cambios[k]); });

    var out = Esquema.documentoVacio();
    out.meta = Object.assign({}, a.meta, {
      creado: String(a.meta.creado) < String(b.meta.creado) ? a.meta.creado : b.meta.creado,
      modificado: mayor(a.meta.modificado, b.meta.modificado),
      cambios: cambios,
    });
    OBJETOS.forEach(function (k) { out[k] = mezclarObjeto(k, a, b); });
    Esquema.COLECCIONES.forEach(function (c) {
      out[c] = c === "registro" ? mezclarRegistro(a[c], b[c]) : mezclarColeccion(a[c], b[c], borrados);
    });
    out.borrados = borrados;
    // Dos altas a la vez no deben repetir número de socio en las siguientes
    var maxNum = out.socios.reduce(function (m, s) { return Math.max(m, +s.numero || 0); }, 0);
    out.config.siguienteNumeroSocio = Math.max(+a.config.siguienteNumeroSocio || 1, +b.config.siguienteNumeroSocio || 1, maxNum + 1);
    return Esquema.migrar(out);
  }

  /** Los ids que b ha borrado y a aún no sabía (para quitar sus adjuntos de este dispositivo). */
  function borradosNuevos(a, b) {
    var ya = (a && a.borrados) || {};
    return Object.keys((b && b.borrados) || {}).filter(function (id) { return !ya[id]; });
  }

  return { mezclar: mezclar, borradosNuevos: borradosNuevos };
});

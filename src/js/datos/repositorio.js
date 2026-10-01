/*
 * webkit_asociaciones — Capa de datos (repositorio).
 *
 * ES LA ÚNICA PUERTA A LOS DATOS. Los módulos de la interfaz (socios,
 * tesorería…) nunca tocan el documento ni el almacenamiento directamente: piden
 * y guardan a través de estas funciones. Por eso son todas asíncronas (devuelven
 * promesas) aunque hoy los datos estén en memoria: el día que haya una versión
 * con servidor, bastará con escribir otro repositorio con las MISMAS funciones
 * que hable con una API (fetch), y ningún módulo tendrá que cambiar.
 *
 *   leer(clave)                  → copia de un objeto suelto (p. ej. "asociacion")
 *   escribir(clave, valor)
 *   listar(coleccion)            → copia de todos los registros
 *   obtener(coleccion, id)       → copia de un registro o null
 *   guardar(coleccion, registro) → lo crea (si no tiene id) o lo actualiza; devuelve la copia guardada
 *   borrar(coleccion, id)        → true si existía
 *   documento()                  → copia del documento completo (para copias de seguridad)
 *
 * Siempre se devuelven COPIAS: si un formulario modifica lo que recibió, no
 * cambia nada guardado hasta que llame a guardar().
 *
 * crearRepositorio(doc, alCambiar): «alCambiar(doc)» se llama tras cada cambio;
 * la sesión la usa para cifrar y guardar en el navegador. En los tests y en el
 * modo demostración no hace nada.
 */
(function (raiz, fabrica) {
  var Esquema = typeof require === "function" ? require("./esquema.js") : raiz.WA.Esquema;
  var modulo = fabrica(Esquema);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Repositorio = modulo;
})(typeof self !== "undefined" ? self : this, function (Esquema) {
  "use strict";

  var copiar = function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); };

  function crearRepositorio(doc, alCambiar, reloj) {
    var ahora = reloj || function () { return new Date().toISOString(); };
    var avisar = alCambiar || function () {};

    function coleccion(nombre) {
      if (Esquema.COLECCIONES.indexOf(nombre) < 0) throw new Error("Colección desconocida: " + nombre);
      if (!Array.isArray(doc[nombre])) doc[nombre] = [];
      return doc[nombre];
    }
    function cambiado() {
      doc.meta.modificado = ahora();
      doc.meta.cambiosDesdeCopia = (doc.meta.cambiosDesdeCopia || 0) + 1;
      return Promise.resolve(avisar(doc));
    }

    return {
      leer: async function (clave) { return copiar(doc[clave]); },

      escribir: async function (clave, valor) {
        if (clave === "meta" || clave === "app" || clave === "esquema" || Esquema.COLECCIONES.indexOf(clave) >= 0) {
          throw new Error("«" + clave + "» no se escribe con escribir().");
        }
        doc[clave] = copiar(valor);
        await cambiado();
      },

      listar: async function (nombre) { return copiar(coleccion(nombre)); },

      obtener: async function (nombre, id) {
        var r = coleccion(nombre).find(function (x) { return x.id === id; });
        return r ? copiar(r) : null;
      },

      guardar: async function (nombre, registro) {
        var lista = coleccion(nombre);
        var r = copiar(registro);
        var t = ahora();
        var i = r.id ? lista.findIndex(function (x) { return x.id === r.id; }) : -1;
        if (i >= 0) {
          r.creado = lista[i].creado;
          r.modificado = t;
          lista[i] = r;
        } else {
          r.id = r.id || Esquema.nuevoId();
          r.creado = t;
          r.modificado = t;
          lista.push(r);
        }
        await cambiado();
        return copiar(r);
      },

      borrar: async function (nombre, id) {
        var lista = coleccion(nombre);
        var i = lista.findIndex(function (x) { return x.id === id; });
        if (i < 0) return false;
        lista.splice(i, 1);
        await cambiado();
        return true;
      },

      documento: async function () { return copiar(doc); },

      /** Estado de la copia de seguridad, para el aviso de la cabecera. */
      estadoCopia: async function () {
        return { ultimaCopia: doc.meta.ultimaCopia, cambiosDesdeCopia: doc.meta.cambiosDesdeCopia || 0 };
      },

      /** Se llama justo después de descargar una copia. No cuenta como cambio. */
      marcarCopiaHecha: async function () {
        doc.meta.ultimaCopia = ahora();
        doc.meta.cambiosDesdeCopia = 0;
        await avisar(doc);
      },
    };
  }

  return { crearRepositorio: crearRepositorio };
});

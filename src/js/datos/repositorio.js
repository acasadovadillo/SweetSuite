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
 *   guardarVarios(coleccion, [registros]) → como guardar(), pero todos de una vez
 *                                  (importaciones, remesas): un solo guardado
 *   borrar(coleccion, id)        → true si existía
 *   documento()                  → copia del documento completo (para copias de seguridad)
 *   guardarArchivo(ficha, bytes) → adjunta un archivo: su ficha va a la colección
 *                                  «documentos» y sus bytes a un almacén aparte
 *   leerArchivo(id)              → los bytes (Uint8Array) de un adjunto
 *   borrarArchivo(id)            → quita la ficha y los bytes
 *
 * Siempre se devuelven COPIAS: si un formulario modifica lo que recibió, no
 * cambia nada guardado hasta que llame a guardar().
 *
 * crearRepositorio(doc, alCambiar, reloj, archivos): «alCambiar(doc)» se llama tras
 * cada cambio; la sesión la usa para cifrar y guardar en el navegador. En los
 * tests y en el modo demostración no hace nada. «archivos» es dónde van los bytes
 * de los adjuntos: { guardar(id, bytes), leer(id), borrar(id) } (la sesión los
 * cifra; si no se da, quedan en memoria).
 */
(function (raiz, fabrica) {
  var Esquema = typeof require === "function" ? require("./esquema.js") : raiz.WA.Esquema;
  var modulo = fabrica(Esquema);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Repositorio = modulo;
})(typeof self !== "undefined" ? self : this, function (Esquema) {
  "use strict";

  var copiar = function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); };

  /** Almacén de bytes en memoria (demostración y tests). inicial: { id: Uint8Array }. */
  function archivosEnMemoria(inicial) {
    var m = Object.assign({}, inicial || {});
    return {
      guardar: async function (id, bytes) { m[id] = new Uint8Array(bytes); },
      leer: async function (id) { return m[id] ? new Uint8Array(m[id]) : null; },
      borrar: async function (id) { delete m[id]; },
    };
  }

  function crearRepositorio(doc, alCambiar, reloj, archivos) {
    var ahora = reloj || function () { return new Date().toISOString(); };
    var avisar = alCambiar || function () {};
    var bytes = archivos || archivosEnMemoria();

    function coleccion(nombre) {
      if (Esquema.COLECCIONES.indexOf(nombre) < 0) throw new Error("Colección desconocida: " + nombre);
      if (!Array.isArray(doc[nombre])) doc[nombre] = [];
      return doc[nombre];
    }
    /** Crea (si no tiene id o no existe) o sustituye un registro en la lista. */
    function colocar(lista, registro, t) {
      var r = copiar(registro);
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
      return r;
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
        var r = colocar(coleccion(nombre), registro, ahora());
        await cambiado();
        return copiar(r);
      },

      guardarVarios: async function (nombre, registros) {
        var lista = coleccion(nombre), t = ahora();
        var guardados = (registros || []).map(function (r) { return colocar(lista, r, t); });
        if (guardados.length) await cambiado();
        return copiar(guardados);
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

      guardarArchivo: async function (ficha, contenido) {
        var r = copiar(ficha);
        r.id = r.id || Esquema.nuevoId();
        r.tamano = contenido.length;
        // Primero los bytes: si fallan (sin espacio…), no queda una ficha sin archivo.
        await bytes.guardar(r.id, contenido);
        var t = ahora();
        var lista = coleccion("documentos");
        var i = lista.findIndex(function (x) { return x.id === r.id; });
        if (i >= 0) { r.creado = lista[i].creado; r.modificado = t; lista[i] = r; } else { r.creado = t; r.modificado = t; lista.push(r); }
        await cambiado();
        return copiar(r);
      },
      leerArchivo: async function (id) { return bytes.leer(id); },
      borrarArchivo: async function (id) {
        await bytes.borrar(id);
        var lista = coleccion("documentos");
        var i = lista.findIndex(function (x) { return x.id === id; });
        if (i >= 0) { lista.splice(i, 1); await cambiado(); }
        return i >= 0;
      },

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

  return { crearRepositorio: crearRepositorio, archivosEnMemoria: archivosEnMemoria };
});

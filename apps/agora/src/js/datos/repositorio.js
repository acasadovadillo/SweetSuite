/*
 * Agora — Capa de datos (repositorio).
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
 * crearRepositorio(doc, alCambiar, reloj, archivos, opciones): «alCambiar(doc)» se llama tras
 * cada cambio; la sesión la usa para cifrar y guardar en el navegador. En los
 * tests y en el modo demostración no hace nada. «archivos» es dónde van los bytes
 * de los adjuntos: { guardar(id, bytes), leer(id), borrar(id) } (la sesión los
 * cifra; si no se da, quedan en memoria).
 *
 * opciones (Fase 7a, usuarios):
 *   autor()      → { id, texto: "Alberto · Tesorería" } de quien está trabajando
 *   permitido()  → false si su cargo no puede modificar la sección abierta:
 *                  entonces cualquier escritura falla con el código "PERMISO"
 * Cada cambio queda FIRMADO en el registro (creadoPor / modificadoPor) y apuntado
 * en la colección «registro» (quién, cuándo, qué). El registro guarda los
 * últimos MAX_REGISTRO apuntes.
 *
 * Para mezclar lo que guarda cada miembro de la junta (ver datos/mezcla.js), lo
 * borrado deja una marca en doc.borrados y, al escribir un objeto suelto, se
 * apunta en doc.meta.cambios cuándo cambió cada uno de sus campos.
 */
(function (raiz, fabrica) {
  var Esquema = typeof require === "function" ? require("./esquema.js") : raiz.WA.Esquema;
  var modulo = fabrica(Esquema);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Repositorio = modulo;
})(typeof self !== "undefined" ? self : this, function (Esquema) {
  "use strict";

  var copiar = function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); };
  var MAX_REGISTRO = 5000;

  /** Una etiqueta corta para el registro: el nombre, el título o el concepto del registro. */
  function etiqueta(r) {
    if (!r) return "";
    var t = r.nombre && r.apellidos ? r.nombre + " " + r.apellidos : r.nombre || r.titulo || r.concepto || r.numero || r.persona || r.socioNombre || "";
    return String(t).slice(0, 80);
  }

  /** Almacén de bytes en memoria (demostración y tests). inicial: { id: Uint8Array }. */
  function archivosEnMemoria(inicial) {
    var m = Object.assign({}, inicial || {});
    return {
      guardar: async function (id, bytes) { m[id] = new Uint8Array(bytes); },
      leer: async function (id) { return m[id] ? new Uint8Array(m[id]) : null; },
      borrar: async function (id) { delete m[id]; },
    };
  }

  function crearRepositorio(doc, alCambiar, reloj, archivos, opciones) {
    var ahora = reloj || function () { return new Date().toISOString(); };
    var avisar = alCambiar || function () {};
    var bytes = archivos || archivosEnMemoria();
    var op = opciones || {};
    var autor = function () { return op.autor ? op.autor() : null; };

    /** Antes de cualquier escritura: ¿puede el cargo de quien trabaja tocar esta sección? */
    function exigirPermiso() {
      if (op.permitido && !op.permitido()) {
        var e = new Error("Tu cargo puede ver esta sección, pero no modificarla.");
        e.codigo = "PERMISO";
        throw e;
      }
    }
    /** Apunta un cambio en el registro (lo más reciente al final). */
    function apuntar(accion, donde, registro, resumen, t) {
      var a = autor();
      if (!a) return;
      if (!Array.isArray(doc.registro)) doc.registro = [];
      doc.registro.push({ id: Esquema.nuevoId(), fecha: t, usuarioId: a.id, autor: a.texto, accion: accion, donde: donde,
        registroId: registro ? registro.id || "" : "", resumen: resumen != null ? resumen : etiqueta(registro) });
      if (doc.registro.length > MAX_REGISTRO) doc.registro.splice(0, doc.registro.length - MAX_REGISTRO);
    }
    function firmar(r, nuevo) {
      var a = autor();
      if (!a) return;
      if (nuevo) r.creadoPor = a.texto;
      r.modificadoPor = a.texto;
    }

    function coleccion(nombre, paraEscribir) {
      if (paraEscribir && nombre === "registro") throw new Error("El registro solo lo escribe la aplicación.");
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
        if (lista[i].creadoPor) r.creadoPor = lista[i].creadoPor;
        r.modificado = t;
        firmar(r, false);
        lista[i] = r;
      } else {
        r.id = r.id || Esquema.nuevoId();
        r.creado = t;
        r.modificado = t;
        firmar(r, true);
        lista.push(r);
      }
      r._nuevo = i < 0; // solo para el registro; se quita antes de devolver
      return r;
    }
    /** Apunta qué campos de un objeto suelto han cambiado, y cuándo (para mezclar). */
    function marcarCampos(clave, antes, nuevo, t) {
      if (!nuevo || typeof nuevo !== "object") return;
      doc.meta.cambios = doc.meta.cambios || {};
      Object.keys(antes).concat(Object.keys(nuevo)).forEach(function (k) {
        if (JSON.stringify(antes[k]) !== JSON.stringify(nuevo[k])) doc.meta.cambios[clave + "." + k] = t;
      });
    }
    /** Lo borrado deja marca: así otra copia sin el borrado no lo resucita al mezclar. */
    function marcarBorrado(id, t) {
      if (!doc.borrados || typeof doc.borrados !== "object") doc.borrados = {};
      doc.borrados[id] = t;
    }
    function cambiado() {
      doc.meta.modificado = ahora();
      doc.meta.cambiosDesdeCopia = (doc.meta.cambiosDesdeCopia || 0) + 1;
      return Promise.resolve(avisar(doc));
    }

    return {
      leer: async function (clave) { return copiar(doc[clave]); },

      escribir: async function (clave, valor) {
        if (clave === "meta" || clave === "app" || clave === "esquema" || clave === "borrados" || Esquema.COLECCIONES.indexOf(clave) >= 0) {
          throw new Error("«" + clave + "» no se escribe con escribir().");
        }
        exigirPermiso();
        var t = ahora(), antes = doc[clave] || {}, nuevo = copiar(valor);
        marcarCampos(clave, antes, nuevo, t);
        doc[clave] = nuevo;
        apuntar("cambio", clave, null, clave === "config" ? "Configuración" : clave === "asociacion" ? "Datos de la asociación" : clave, t);
        await cambiado();
      },

      listar: async function (nombre) { return copiar(coleccion(nombre)); },

      obtener: async function (nombre, id) {
        var r = coleccion(nombre).find(function (x) { return x.id === id; });
        return r ? copiar(r) : null;
      },

      guardar: async function (nombre, registro) {
        exigirPermiso();
        var t = ahora();
        var r = colocar(coleccion(nombre, true), registro, t);
        apuntar(r._nuevo ? "alta" : "cambio", nombre, r, null, t);
        delete r._nuevo;
        await cambiado();
        return copiar(r);
      },

      guardarVarios: async function (nombre, registros) {
        exigirPermiso();
        var lista = coleccion(nombre, true), t = ahora();
        var guardados = (registros || []).map(function (r) { return colocar(lista, r, t); });
        if (guardados.length === 1) apuntar(guardados[0]._nuevo ? "alta" : "cambio", nombre, guardados[0], null, t);
        else if (guardados.length) apuntar("varios", nombre, null, guardados.length + " registros", t);
        guardados.forEach(function (r) { delete r._nuevo; });
        if (guardados.length) await cambiado();
        return copiar(guardados);
      },

      borrar: async function (nombre, id) {
        exigirPermiso();
        var lista = coleccion(nombre, true);
        var i = lista.findIndex(function (x) { return x.id === id; });
        if (i < 0) return false;
        var quitado = lista.splice(i, 1)[0], t = ahora();
        marcarBorrado(id, t);
        apuntar("baja", nombre, quitado, null, t);
        await cambiado();
        return true;
      },

      documento: async function () { return copiar(doc); },

      guardarArchivo: async function (ficha, contenido) {
        exigirPermiso();
        var r = copiar(ficha);
        r.id = r.id || Esquema.nuevoId();
        r.tamano = contenido.length;
        // Primero los bytes: si fallan (sin espacio…), no queda una ficha sin archivo.
        await bytes.guardar(r.id, contenido);
        var t = ahora();
        var lista = coleccion("documentos");
        var i = lista.findIndex(function (x) { return x.id === r.id; });
        if (i >= 0) { r.creado = lista[i].creado; r.modificado = t; firmar(r, false); lista[i] = r; } else { r.creado = t; r.modificado = t; firmar(r, true); lista.push(r); }
        apuntar(i >= 0 ? "cambio" : "alta", "documentos", r, null, t);
        await cambiado();
        return copiar(r);
      },
      leerArchivo: async function (id) { return bytes.leer(id); },
      borrarArchivo: async function (id) {
        exigirPermiso();
        await bytes.borrar(id);
        var lista = coleccion("documentos");
        var i = lista.findIndex(function (x) { return x.id === id; });
        if (i >= 0) { var t = ahora(); marcarBorrado(id, t); apuntar("baja", "documentos", lista.splice(i, 1)[0], null, t); await cambiado(); }
        return i >= 0;
      },

      /** Apunta en el registro algo que no es un registro de datos (p. ej. la gestión de usuarios). */
      anotar: async function (accion, donde, resumen) {
        apuntar(accion, donde, null, resumen, ahora());
        await cambiado();
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

  return { crearRepositorio: crearRepositorio, archivosEnMemoria: archivosEnMemoria, MAX_REGISTRO: MAX_REGISTRO };
});

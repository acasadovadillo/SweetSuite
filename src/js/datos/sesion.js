/*
 * webkit_asociaciones — Sesión: abrir, guardar y cerrar los datos.
 *
 * Une las piezas: Cripto (cifrar), Bóveda (guardar en el navegador), Esquema
 * (migrar) y Repositorio (la puerta que usan los módulos).
 *
 * Estados:
 *   · cerrada       no hay datos en memoria; se ve la pantalla de acceso
 *   · abierta       datos reales descifrados en memoria; cada cambio se cifra y se guarda
 *   · demostración  datos inventados en memoria; NADA se guarda
 *
 * Mientras la sesión está abierta, el documento descifrado vive SOLO en memoria.
 * Al bloquear o cerrar, se suelta (y con él la clave).
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA;

  var estado = { modo: "cerrada", doc: null, llave: null, repo: null };
  var oyentes = [];
  var cola = Promise.resolve();   // los guardados van en fila: nunca dos a la vez
  var pendientes = 0;             // guardados en curso (para avisar si cierras la pestaña)

  function avisar() { oyentes.forEach(function (f) { try { f(estado.modo); } catch (e) { console.error(e); } }); }

  /** Cifra y guarda el documento actual. Se encadena para que no se pisen. */
  function persistir() {
    if (estado.modo !== "abierta") return Promise.resolve();
    var doc = estado.doc, llave = estado.llave;
    pendientes++;
    cola = cola.then(function () {
      return WA.Cripto.cifrar(doc, llave).then(WA.Boveda.escribir);
    }).catch(function (e) {
      console.error(e);
      WA.UI && WA.UI.aviso("No se ha podido guardar en el navegador. Descarga una copia de seguridad ahora.", "error");
    }).then(function () { pendientes--; avisar(); });
    return cola;
  }

  /**
   * Dónde van los bytes de los adjuntos: cifrados con la llave de la sesión en la
   * bóveda del navegador. En la demostración, en memoria.
   */
  function archivosCifrados() {
    return {
      guardar: async function (id, bytes) { await WA.Boveda.escribirArchivo(id, await WA.Cripto.cifrarBytes(bytes, estado.llave)); },
      leer: async function (id) {
        var r = await WA.Boveda.leerArchivo(id);
        return r ? WA.Cripto.descifrarBytes(r, estado.llave) : null;
      },
      borrar: function (id) { return WA.Boveda.borrarArchivo(id); },
    };
  }

  function abrirCon(doc, llave, modo) {
    estado.doc = doc;
    estado.llave = llave;
    estado.modo = modo;
    estado.repo = WA.Repositorio.crearRepositorio(doc, modo === "abierta" ? persistir : null, null,
      modo === "abierta" ? archivosCifrados() : WA.Repositorio.archivosEnMemoria());
    avisar();
  }

  var idsDocumentos = function (doc) { return (doc.documentos || []).map(function (d) { return d.id; }); };

  var Sesion = {
    get modo() { return estado.modo; },
    get datos() { return estado.repo; },
    hayGuardadosPendientes: function () { return pendientes > 0; },
    alCambiar: function (f) { oyentes.push(f); },

    /** Primera vez: crea unos datos vacíos protegidos con esta contraseña. */
    crear: async function (contrasena) {
      var llave = await WA.Cripto.crearLlave(contrasena);
      abrirCon(WA.Esquema.documentoVacio(), llave, "abierta");
      await persistir();
      WA.Boveda.pedirPersistencia();
    },

    /** Descifra lo guardado en el navegador. Lanza error si la contraseña falla. */
    desbloquear: async function (contrasena) {
      var bloque = await WA.Boveda.leer();
      if (!bloque) throw new Error("No hay datos guardados en este navegador.");
      var r = await WA.Cripto.descifrar(bloque, contrasena);
      var doc = WA.Esquema.migrar(r.objeto);
      abrirCon(doc, r.llave, "abierta");
      if (doc.esquema !== r.objeto.esquema) await persistir(); // se guardan ya migrados
    },

    /**
     * Recupera una copia de seguridad. Si va cifrada hace falta SU contraseña;
     * a partir de ahí, los datos quedan protegidos con «contrasenaNueva» (que
     * puede ser la misma). Sustituye lo que hubiera en el navegador.
     */
    restaurar: async function (lectura, contrasenaCopia, contrasenaNueva) {
      var objeto, llaveCopia = null;
      if (lectura.cifrada) {
        var r = await WA.Cripto.descifrar(lectura.bloque, contrasenaCopia);
        objeto = r.objeto; llaveCopia = r.llave;
      } else objeto = lectura.documento;
      var doc = WA.Esquema.migrar(objeto);
      // Recién restaurada, la copia ES una copia de seguridad: no hay cambios pendientes.
      doc.meta.cambiosDesdeCopia = 0;
      var llave = await WA.Cripto.crearLlave(contrasenaNueva || contrasenaCopia);
      // Los adjuntos: se descifran con la llave de la copia (o vienen en claro) y se
      // vuelven a cifrar con la nueva. Primero todos en memoria: si alguno falla, no se toca nada.
      var archivos = lectura.archivos || {}, listos = [];
      for (var i = 0, ids = idsDocumentos(doc); i < ids.length; i++) {
        var a = archivos[ids[i]];
        if (!a) continue;
        var bytes = lectura.cifrada ? await WA.Cripto.descifrarBytes(WA.Cripto.archivoDesdeBase64(a), llaveCopia) : WA.Cripto.desdeBase64(a.datos);
        listos.push([ids[i], await WA.Cripto.cifrarBytes(bytes, llave)]);
      }
      var faltan = idsDocumentos(doc).length - listos.length;
      await WA.Boveda.borrarArchivos();
      for (var k = 0; k < listos.length; k++) await WA.Boveda.escribirArchivo(listos[k][0], listos[k][1]);
      abrirCon(doc, llave, "abierta");
      await persistir();
      WA.Boveda.pedirPersistencia();
      return { archivos: listos.length, faltan: faltan };
    },

    /** Modo demostración: datos inventados que no se guardan en ningún sitio. */
    demostracion: function () {
      abrirCon(WA.Demo.documentoDemo(), null, "demostración");
      // Los adjuntos de ejemplo, en memoria.
      estado.repo = WA.Repositorio.crearRepositorio(estado.doc, null, null, WA.Repositorio.archivosEnMemoria(WA.Demo.archivosDemo()));
    },

    /** Bloquea: suelta datos y clave de la memoria. Lo guardado sigue cifrado. */
    bloquear: async function () {
      await cola;
      estado.doc = null; estado.llave = null; estado.repo = null; estado.modo = "cerrada";
      avisar();
    },

    /** Borra del navegador los datos guardados (no las copias descargadas). */
    borrarDelNavegador: async function () {
      await cola;
      await WA.Boveda.borrar();
      await WA.Boveda.borrarArchivos();
    },

    /** Cambia la contraseña: vuelve a cifrar con una sal nueva. */
    cambiarContrasena: async function (actual, nueva) {
      if (estado.modo !== "abierta") throw new Error("No hay una sesión abierta.");
      var bloque = await WA.Boveda.leer();
      await WA.Cripto.descifrar(bloque, actual); // lanza si «actual» no es la buena
      var vieja = estado.llave, nuevaLlave = await WA.Cripto.crearLlave(nueva);
      // Los adjuntos se vuelven a cifrar con la llave nueva (todos en memoria antes de escribir).
      var listos = [];
      for (var i = 0, ids = idsDocumentos(estado.doc); i < ids.length; i++) {
        var r = await WA.Boveda.leerArchivo(ids[i]);
        if (r) listos.push([ids[i], await WA.Cripto.cifrarBytes(await WA.Cripto.descifrarBytes(r, vieja), nuevaLlave)]);
      }
      await cola;
      for (var k = 0; k < listos.length; k++) await WA.Boveda.escribirArchivo(listos[k][0], listos[k][1]);
      estado.llave = nuevaLlave;
      await persistir();
    },

    /**
     * Arma el contenido del archivo de copia. Cifrada: con la llave de la sesión
     * (la misma contraseña). En demostración no hay llave: solo sin cifrar.
     */
    contenidoCopia: async function (cifrada) {
      var doc = await estado.repo.documento();
      var archivos = {}, ids = idsDocumentos(doc), i;
      if (cifrada) {
        if (!estado.llave) throw new Error("En la demostración la copia no se puede cifrar.");
        // Ya están cifrados con la misma llave que los datos: van tal cual, en base64.
        for (i = 0; i < ids.length; i++) {
          var r = await WA.Boveda.leerArchivo(ids[i]);
          if (r) archivos[ids[i]] = WA.Cripto.archivoABase64(r);
        }
        return WA.Copia.sobreCifrado(await WA.Cripto.cifrar(doc, estado.llave), doc.asociacion.nombre, null, archivos);
      }
      for (i = 0; i < ids.length; i++) {
        var b = await estado.repo.leerArchivo(ids[i]);
        if (b) archivos[ids[i]] = { datos: WA.Cripto.aBase64(b) };
      }
      return WA.Copia.sobreAbierto(doc, null, archivos);
    },
  };

  WA.Sesion = Sesion;
})(typeof self !== "undefined" ? self : this);

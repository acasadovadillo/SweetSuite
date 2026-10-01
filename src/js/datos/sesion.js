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

  function abrirCon(doc, llave, modo) {
    estado.doc = doc;
    estado.llave = llave;
    estado.modo = modo;
    estado.repo = WA.Repositorio.crearRepositorio(doc, modo === "abierta" ? persistir : null);
    avisar();
  }

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
      var objeto;
      if (lectura.cifrada) objeto = (await WA.Cripto.descifrar(lectura.bloque, contrasenaCopia)).objeto;
      else objeto = lectura.documento;
      var doc = WA.Esquema.migrar(objeto);
      // Recién restaurada, la copia ES una copia de seguridad: no hay cambios pendientes.
      doc.meta.cambiosDesdeCopia = 0;
      var llave = await WA.Cripto.crearLlave(contrasenaNueva || contrasenaCopia);
      abrirCon(doc, llave, "abierta");
      await persistir();
      WA.Boveda.pedirPersistencia();
    },

    /** Modo demostración: datos inventados que no se guardan en ningún sitio. */
    demostracion: function () {
      abrirCon(WA.Demo.documentoDemo(), null, "demostración");
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
    },

    /** Cambia la contraseña: vuelve a cifrar con una sal nueva. */
    cambiarContrasena: async function (actual, nueva) {
      if (estado.modo !== "abierta") throw new Error("No hay una sesión abierta.");
      var bloque = await WA.Boveda.leer();
      await WA.Cripto.descifrar(bloque, actual); // lanza si «actual» no es la buena
      estado.llave = await WA.Cripto.crearLlave(nueva);
      await persistir();
    },

    /**
     * Arma el contenido del archivo de copia. Cifrada: con la llave de la sesión
     * (la misma contraseña). En demostración no hay llave: solo sin cifrar.
     */
    contenidoCopia: async function (cifrada) {
      var doc = await estado.repo.documento();
      if (cifrada) {
        if (!estado.llave) throw new Error("En la demostración la copia no se puede cifrar.");
        return WA.Copia.sobreCifrado(await WA.Cripto.cifrar(doc, estado.llave), doc.asociacion.nombre);
      }
      return WA.Copia.sobreAbierto(doc);
    },
  };

  WA.Sesion = Sesion;
})(typeof self !== "undefined" ? self : this);

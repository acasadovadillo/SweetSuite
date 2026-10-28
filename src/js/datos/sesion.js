/*
 * ABIES · Gestión — Sesión: entrar, guardar y salir (con usuarios desde la Fase 7a).
 *
 * Une las piezas: Cuentas (usuarios y doble llave), Cripto (cifrar), Bóveda
 * (guardar en el navegador), Esquema (migrar) y Repositorio (la puerta que usan
 * los módulos).
 *
 * Estados:
 *   · cerrada       no hay datos en memoria; se ve la pantalla de acceso
 *   · abierta       un usuario ha entrado; cada cambio se cifra y se guarda
 *   · demostración  datos y usuarios inventados en memoria; NADA se guarda
 *
 * Mientras la sesión está abierta, los datos descifrados y las claves viven SOLO
 * en memoria. Al bloquear o cerrar, se sueltan.
 *
 * En el navegador se guarda la BÓVEDA (ver datos/cuentas.js): la cabecera con los
 * usuarios, cifrada con la contraseña del archivo, y los datos, cifrados con la
 * clave de datos. Los adjuntos van aparte, cifrados con la misma clave de datos.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA;
  var Cu = function () { return WA.Cuentas; };

  // cuentas = { cabecera, llaveArchivo, llaveDatos, usuarioId, doc } (el «estado» de Cuentas)
  var estado = { modo: "cerrada", doc: null, cuentas: null, repo: null };
  var oyentes = [];
  var cola = Promise.resolve();   // los guardados van en fila: nunca dos a la vez
  var pendientes = 0;             // guardados en curso (para avisar si cierras la pestaña)
  var ultimo = null;              // nombre y cargo de la última sesión, para volver a entrar tras bloquear

  function avisar() { oyentes.forEach(function (f) { try { f(estado.modo); } catch (e) { console.error(e); } }); }

  /** Cifra y guarda la bóveda. Se encadena para que los guardados no se pisen. */
  function persistir() {
    if (estado.modo !== "abierta") return Promise.resolve();
    var c = estado.cuentas;
    pendientes++;
    cola = cola.then(function () {
      c.doc = estado.doc;
      return Cu().sellar(c).then(WA.Boveda.escribir);
    }).catch(function (e) {
      console.error(e);
      WA.UI && WA.UI.aviso("No se ha podido guardar en el navegador. Descarga una copia de seguridad ahora.", "error");
    }).then(function () { pendientes--; avisar(); });
    return cola;
  }

  /** Los bytes de los adjuntos: cifrados con la clave de datos en la bóveda del navegador. */
  function archivosCifrados() {
    return {
      guardar: async function (id, bytes) { await WA.Boveda.escribirArchivo(id, await WA.Cripto.cifrarBytes(bytes, estado.cuentas.llaveDatos)); },
      leer: async function (id) {
        var r = await WA.Boveda.leerArchivo(id);
        return r ? WA.Cripto.descifrarBytes(r, estado.cuentas.llaveDatos) : null;
      },
      borrar: function (id) { return WA.Boveda.borrarArchivo(id); },
    };
  }

  function usuarioActual() {
    var c = estado.cuentas;
    if (!c) return null;
    return c.cabecera.usuarios.filter(function (u) { return u.id === c.usuarioId; })[0] || null;
  }
  function puedeEditar(modulo) { return WA.Permisos.puedeEditar(usuarioActual(), modulo); }
  function moduloAbierto() { return WA.App && WA.App.moduloActual ? WA.App.moduloActual() : ""; }

  function abrirCon(doc, cuentas, modo, archivos) {
    estado.doc = doc;
    estado.cuentas = cuentas;
    estado.modo = modo;
    var u = usuarioActual();
    if (modo === "abierta") ultimo = u ? { nombre: u.nombre, cargo: u.cargo } : null; // la demostración no cuenta
    estado.repo = WA.Repositorio.crearRepositorio(doc, modo === "abierta" ? persistir : null, null,
      archivos || (modo === "abierta" ? archivosCifrados() : WA.Repositorio.archivosEnMemoria()),
      {
        autor: function () { var x = usuarioActual(); return x ? { id: x.id, texto: Cu().firma(x) } : null; },
        permitido: function () { return puedeEditar(moduloAbierto()); },
      });
    avisar();
  }

  var idsDocumentos = function (doc) { return (doc.documentos || []).map(function (d) { return d.id; }); };

  /** Vuelve a cifrar todos los adjuntos de una llave a otra (primero todos en memoria). */
  async function recifrarArchivos(doc, vieja, nueva) {
    var listos = [];
    for (var i = 0, ids = idsDocumentos(doc); i < ids.length; i++) {
      var r = await WA.Boveda.leerArchivo(ids[i]);
      if (r) listos.push([ids[i], await WA.Cripto.cifrarBytes(await WA.Cripto.descifrarBytes(r, vieja), nueva)]);
    }
    for (var k = 0; k < listos.length; k++) await WA.Boveda.escribirArchivo(listos[k][0], listos[k][1]);
  }

  /**
   * Escribe en el navegador una bóveda nueva a partir de un documento y sus
   * adjuntos (en claro) y entra como administración. Sirve para crear, para
   * convertir los datos antiguos y para recuperar copias antiguas o sin cifrar.
   */
  async function bovedaNueva(doc, adjuntos, o) {
    var c = await Cu().crear({ contrasenaArchivo: o.contrasenaArchivo, contrasenaAdmin: o.contrasenaAdmin, doc: doc });
    var listos = [];
    for (var i = 0; i < adjuntos.length; i++) listos.push([adjuntos[i][0], await WA.Cripto.cifrarBytes(adjuntos[i][1], c.llaveDatos)]);
    await WA.Boveda.borrarArchivos();
    for (var k = 0; k < listos.length; k++) await WA.Boveda.escribirArchivo(listos[k][0], listos[k][1]);
    abrirCon(doc, c, "abierta");
    await persistir();
    WA.Boveda.pedirPersistencia();
    return { archivos: listos.length, faltan: idsDocumentos(doc).length - listos.length };
  }

  function exigirAbierta() { if (estado.modo !== "abierta") throw new Error("No hay una sesión abierta."); }
  var demo = function () { return estado.modo === "demostración"; };

  // ── Demostración: usuarios de ejemplo, sin claves ──────────────────────
  function cabeceraDemo() {
    var t = "2026-01-10T10:00:00.000Z";
    var u = function (id, nombre, cargo, rol) {
      return { id: id, nombre: nombre, cargo: cargo, rol: rol || "cargo", permisos: WA.Permisos.porDefecto(cargo, rol),
        activo: true, debeCambiar: false, creado: t, modificado: t, ultimoAcceso: "" };
    };
    return { generacion: 1, usuarios: [
      u("demo-admin", WA.Permisos.NOMBRE_ADMIN, WA.Permisos.CARGO_ADMIN, "admin"),
      u("demo-pres", "Lucía Ficticia", "Presidencia"), u("demo-sec", "Carmen Demo", "Secretaría"),
      u("demo-tes", "Javier Supuesto", "Tesorería"), u("demo-voc", "Nora Imaginaria", "Vocalía"),
    ] };
  }

  var Sesion = {
    get modo() { return estado.modo; },
    get datos() { return estado.repo; },
    /** Quien ha entrado (sin claves): { id, nombre, cargo, rol, permisos, … } o null. */
    get usuario() { var u = usuarioActual(); return u ? Cu().publico(u) : null; },
    get firma() { return Cu().firma(usuarioActual()); },
    get esAdmin() { var u = usuarioActual(); return !!(u && u.rol === "admin"); },
    /** Nombre y cargo de la última sesión (para rellenar la pantalla al volver a entrar). */
    get ultimo() { return ultimo; },
    puedeEditar: puedeEditar,
    hayGuardadosPendientes: function () { return pendientes > 0; },
    alCambiar: function (f) { oyentes.push(f); },

    /** ¿Qué hay en este navegador? "ninguna", "abies" (con usuarios) o "antigua" (una sola contraseña). */
    tipoBoveda: async function () {
      var b = await WA.Boveda.leer();
      if (!b) return "ninguna";
      if (Cu().esBoveda(b)) return "abies";
      if (WA.Cripto.esBloque(b)) return "antigua";
      return "ninguna";
    },

    /** Primera vez: bóveda vacía con la contraseña del archivo y la cuenta ABIES. */
    crear: async function (o) {
      await bovedaNueva(WA.Esquema.documentoVacio(), [], o);
    },

    /** Entrar: nombre, cargo, contraseña personal y contraseña del archivo. */
    entrar: async function (o) {
      var b = await WA.Boveda.leer();
      if (!Cu().esBoveda(b)) throw new Error("No hay datos de ABIES en este navegador.");
      var c = await Cu().abrir(b, o);
      var antes = c.doc.esquema;
      c.doc = WA.Esquema.migrar(c.doc);
      abrirCon(c.doc, c, "abierta");
      await persistir(); // guarda el último acceso (y los datos ya migrados, si hacía falta)
      return { migrado: antes !== c.doc.esquema };
    },

    /** Los datos de antes de los usuarios (una sola contraseña) pasan a una bóveda de ABIES. */
    actualizarAntigua: async function (o) {
      var bloque = await WA.Boveda.leer();
      var r = await WA.Cripto.descifrar(bloque, o.contrasenaAntigua);
      var doc = WA.Esquema.migrar(r.objeto), adjuntos = [];
      for (var i = 0, ids = idsDocumentos(doc); i < ids.length; i++) {
        var a = await WA.Boveda.leerArchivo(ids[i]);
        if (a) adjuntos.push([ids[i], await WA.Cripto.descifrarBytes(a, r.llave)]);
      }
      return bovedaNueva(doc, adjuntos, o);
    },

    /**
     * Recupera una copia.
     *  · Copia de ABIES (cifrada): se abre con nombre, cargo y las dos contraseñas
     *    de esa copia; sustituye todo lo de este navegador (usuarios incluidos).
     *  · Copia antigua cifrada: hace falta su contraseña (o.contrasenaCopia).
     *  · Copia sin cifrar o antigua: con sesión de administración abierta, sus datos
     *    sustituyen a los actuales y se conservan los usuarios; sin sesión, se crea
     *    una bóveda nueva (o.contrasenaArchivo y o.contrasenaAdmin).
     */
    restaurar: async function (lectura, o) {
      if (estado.modo === "abierta" && !Sesion.esAdmin) throw new Error("Solo la cuenta de administración puede recuperar copias.");
      if (lectura.boveda) {
        var c = await Cu().abrir(lectura.boveda, o);   // comprueba antes de tocar nada
        c.doc = WA.Esquema.migrar(c.doc);
        var archivos = lectura.archivos || {}, ids = Object.keys(archivos);
        await WA.Boveda.borrarArchivos();
        for (var i = 0; i < ids.length; i++) await WA.Boveda.escribirArchivo(ids[i], WA.Cripto.archivoDesdeBase64(archivos[ids[i]]));
        c.doc.meta.cambiosDesdeCopia = 0;
        abrirCon(c.doc, c, "abierta");
        await persistir();
        WA.Boveda.pedirPersistencia();
        return { archivos: ids.length, faltan: idsDocumentos(c.doc).length - ids.length };
      }
      // Copias antiguas o sin cifrar: primero, el documento y los adjuntos en claro.
      var objeto, llaveCopia = null;
      if (lectura.cifrada) {
        var r = await WA.Cripto.descifrar(lectura.bloque, o.contrasenaCopia);
        objeto = r.objeto; llaveCopia = r.llave;
      } else objeto = lectura.documento;
      var doc = WA.Esquema.migrar(objeto), adjuntos = [], arch = lectura.archivos || {};
      for (var k = 0, ids2 = idsDocumentos(doc); k < ids2.length; k++) {
        var a = arch[ids2[k]];
        if (!a) continue;
        adjuntos.push([ids2[k], lectura.cifrada ? await WA.Cripto.descifrarBytes(WA.Cripto.archivoDesdeBase64(a), llaveCopia) : WA.Cripto.desdeBase64(a.datos)]);
      }
      doc.meta.cambiosDesdeCopia = 0;
      if (estado.modo === "abierta") {
        if (!Sesion.esAdmin) throw new Error("Solo la cuenta de administración puede recuperar copias.");
        await cola;
        var llave = estado.cuentas.llaveDatos, listos = [];
        for (var j = 0; j < adjuntos.length; j++) listos.push([adjuntos[j][0], await WA.Cripto.cifrarBytes(adjuntos[j][1], llave)]);
        await WA.Boveda.borrarArchivos();
        for (var m = 0; m < listos.length; m++) await WA.Boveda.escribirArchivo(listos[m][0], listos[m][1]);
        abrirCon(doc, estado.cuentas, "abierta");
        await persistir();
        return { archivos: listos.length, faltan: idsDocumentos(doc).length - listos.length };
      }
      return bovedaNueva(doc, adjuntos, o);
    },

    /** Demostración: datos y usuarios inventados, sin guardar nada. Se entra con el cargo elegido. */
    demostracion: function (usuarioId) {
      var cab = cabeceraDemo();
      var c = { cabecera: cab, usuarioId: usuarioId || "demo-admin", llaveArchivo: null, llaveDatos: null };
      abrirCon(WA.Demo.documentoDemo(), c, "demostración", WA.Repositorio.archivosEnMemoria(WA.Demo.archivosDemo()));
    },
    usuariosDemo: function () { return cabeceraDemo().usuarios.map(function (u) { return Cu().publico(u); }); },

    /** Bloquea: suelta datos y claves de la memoria. Lo guardado sigue cifrado. */
    bloquear: async function () {
      await cola;
      estado.doc = null; estado.cuentas = null; estado.repo = null; estado.modo = "cerrada";
      avisar();
    },

    /** Borra del navegador los datos guardados (no las copias descargadas). */
    borrarDelNavegador: async function () {
      await cola;
      await WA.Boveda.borrar();
      await WA.Boveda.borrarArchivos();
    },

    // ── Usuarios ──────────────────────────────────────────────────────────
    usuarios: function () {
      return estado.cuentas ? estado.cuentas.cabecera.usuarios.map(function (u) { return Cu().publico(u); }) : [];
    },
    anadirUsuario: async function (o) {
      if (demo()) {
        if (!Sesion.esAdmin) throw new Error("Solo la cuenta de administración puede hacer esto.");
        var t = new Date().toISOString();
        estado.cuentas.cabecera.usuarios.push({ id: WA.Esquema.nuevoId(), nombre: o.nombre, cargo: o.cargo, rol: "cargo",
          permisos: o.permisos || WA.Permisos.porDefecto(o.cargo), activo: true, debeCambiar: true, creado: t, modificado: t });
        avisar(); return;
      }
      exigirAbierta();
      var u = await Cu().anadirUsuario(estado.cuentas, o);
      await estado.repo.anotar("alta", "usuarios", u.nombre + " · " + u.cargo);
      return u;
    },
    editarUsuario: async function (id, o) {
      if (demo()) {
        var x = estado.cuentas.cabecera.usuarios.filter(function (u) { return u.id === id; })[0];
        if (x && x.rol !== "admin") Object.assign(x, { nombre: o.nombre || x.nombre, cargo: o.cargo || x.cargo, permisos: o.permisos || x.permisos });
        avisar(); return;
      }
      exigirAbierta();
      var u = Cu().editarUsuario(estado.cuentas, id, o);
      await estado.repo.anotar("cambio", "usuarios", u.nombre + " · " + u.cargo + " (nombre, cargo o permisos)");
      return u;
    },
    restablecerContrasena: async function (id, contrasena) {
      if (demo()) { var x = estado.cuentas.cabecera.usuarios.filter(function (u) { return u.id === id; })[0]; if (x) { x.activo = true; x.debeCambiar = true; } avisar(); return; }
      exigirAbierta();
      var r = await Cu().restablecerContrasena(estado.cuentas, id, contrasena);
      await estado.repo.anotar("cambio", "usuarios", r.nombre + " · " + r.cargo + " (contraseña provisional)");
    },
    /** Desactiva y cambia la clave de datos; los adjuntos se vuelven a cifrar con la nueva. */
    desactivarUsuario: async function (id) {
      if (demo()) { var x = estado.cuentas.cabecera.usuarios.filter(function (u) { return u.id === id; })[0]; if (x && x.rol !== "admin") x.activo = false; avisar(); return; }
      exigirAbierta();
      await cola;
      var quien = Cu().publico(estado.cuentas.cabecera.usuarios.filter(function (u) { return u.id === id; })[0] || { nombre: "?", cargo: "" });
      var vieja = await Cu().desactivarUsuario(estado.cuentas, id);
      await recifrarArchivos(estado.doc, vieja, estado.cuentas.llaveDatos);
      await estado.repo.anotar("baja", "usuarios", quien.nombre + " · " + quien.cargo + " (desactivado; nueva clave de datos)");
    },
    cambiarMiContrasena: async function (actual, nueva) {
      if (demo()) throw new Error("En la demostración no hay contraseñas.");
      exigirAbierta();
      await Cu().cambiarPropia(estado.cuentas, actual, nueva);
      await persistir();
    },
    cambiarContrasenaArchivo: async function (actual, nueva) {
      if (demo()) throw new Error("En la demostración no hay contraseñas.");
      exigirAbierta();
      await cola;
      await Cu().cambiarContrasenaArchivo(estado.cuentas, actual, nueva, await WA.Boveda.leer());
      await estado.repo.anotar("cambio", "usuarios", "Contraseña del archivo");
    },

    /**
     * Arma el contenido del archivo de copia. Cifrada: la bóveda tal cual y los
     * adjuntos ya cifrados (se abre con las mismas credenciales). Sin cifrar: solo
     * administración (y en la demostración, que no tiene claves).
     */
    contenidoCopia: async function (cifrada) {
      var doc = await estado.repo.documento();
      var archivos = {}, ids = idsDocumentos(doc), i;
      if (cifrada) {
        exigirAbierta();
        await cola;
        for (i = 0; i < ids.length; i++) {
          var r = await WA.Boveda.leerArchivo(ids[i]);
          if (r) archivos[ids[i]] = WA.Cripto.archivoABase64(r);
        }
        return WA.Copia.sobreBoveda(await WA.Boveda.leer(), archivos);
      }
      if (!demo() && !Sesion.esAdmin) throw new Error("Solo la cuenta de administración puede descargar una copia sin cifrar.");
      for (i = 0; i < ids.length; i++) {
        var b = await estado.repo.leerArchivo(ids[i]);
        if (b) archivos[ids[i]] = { datos: WA.Cripto.aBase64(b) };
      }
      return WA.Copia.sobreAbiertoAbies(doc, archivos);
    },
  };

  WA.Sesion = Sesion;
})(typeof self !== "undefined" ? self : this);

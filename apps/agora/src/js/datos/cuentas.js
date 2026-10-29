/*
 * Agora — Cuentas de usuario y bóveda con doble llave (Fase 7a).
 *
 * Sin interfaz ni almacenamiento: recibe y devuelve objetos, así que se prueba
 * en Node (tests/cuentas.test.js). La sesión lo une con la bóveda del navegador.
 *
 * FORMATO DE LA BÓVEDA
 *   { formato: "abies-boveda", version: 1,
 *     cabecera: <bloque cifrado con la CONTRASEÑA DEL ARCHIVO (Cripto.cifrar)>,
 *     datos:    <bloque cifrado con la CLAVE DE DATOS (Cripto.cifrarConClave)> }
 *
 *   La cabecera, descifrada, es { generacion, usuarios: [usuario…] } y cada usuario:
 *   { id, nombre, cargo, rol: "admin" | "cargo", permisos: [secciones], activo,
 *     publica (JWK), privada (cifrada con SU contraseña), envuelta (la clave de
 *     datos envuelta con su pública), debeCambiar, creado, modificado, ultimoAcceso }
 *
 * ENTRAR exige las dos contraseñas: la del archivo abre la cabecera (y con ella la
 * lista de usuarios); la personal abre la privada del usuario, que desenvuelve la
 * clave de datos, que descifra los datos. Si algo no cuadra, el error no dice qué
 * (nombre, cargo o cuál de las contraseñas), para no dar pistas.
 *
 * Los ADJUNTOS se cifran aparte con la misma clave de datos.
 *
 * Desactivar a alguien CAMBIA la clave de datos (generacion + 1): se envuelve la
 * nueva solo para los activos, con sus claves públicas, sin pedir contraseñas.
 * Quien se va no puede leer nada guardado después, aunque se quede el archivo.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { C: require("../nucleo/cripto.js"), P: require("../logica/permisos.js"), E: require("./esquema.js") }
    : { C: raiz.WA.Cripto, P: raiz.WA.Permisos, E: raiz.WA.Esquema };
  var modulo = fabrica(dep);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Cuentas = modulo;
})(typeof self !== "undefined" ? self : this, function (x) {
  "use strict";
  var C = x.C, P = x.P, E = x.E;

  var FORMATO = "abies-boveda";
  var MINIMO = 8;
  var ahora = function () { return new Date().toISOString(); };

  function errorAcceso() {
    var e = new Error("No se ha podido entrar: revisa el nombre, el cargo y las dos contraseñas.");
    e.codigo = "ACCESO";
    return e;
  }
  function errorUso(texto) { var e = new Error(texto); e.codigo = "USO"; return e; }

  var esBoveda = function (b) { return !!(b && b.formato === FORMATO && b.cabecera && b.datos); };
  var coincide = function (u, nombre, cargo) {
    return P.normalizar(u.nombre) === P.normalizar(nombre) && P.normalizar(u.cargo) === P.normalizar(cargo);
  };
  /** «Alberto · Tesorería»: así firma cada cambio. */
  var firma = function (u) { return u ? u.nombre + " · " + u.cargo : ""; };
  /** Lo que se puede enseñar de un usuario (sin claves). */
  function publico(u) {
    return { id: u.id, nombre: u.nombre, cargo: u.cargo, rol: u.rol, permisos: (u.permisos || []).slice(), activo: u.activo !== false,
      debeCambiar: !!u.debeCambiar, creado: u.creado, modificado: u.modificado, ultimoAcceso: u.ultimoAcceso || "" };
  }

  function comprobarContrasena(c) {
    if (String(c || "").length < MINIMO) throw errorUso("La contraseña necesita al menos " + MINIMO + " caracteres.");
  }

  /** Crea un usuario con su par de claves, protegido con «contrasena», con acceso a la clave de datos. */
  async function nuevoUsuario(o, llaveDatos, iter) {
    comprobarContrasena(o.contrasena);
    var par = await C.nuevoParUsuario();
    var t = ahora();
    return {
      id: o.id || E.nuevoId(), nombre: String(o.nombre || "").trim(), cargo: String(o.cargo || "").trim(),
      rol: o.rol === "admin" ? "admin" : "cargo",
      permisos: o.rol === "admin" ? P.IDS.slice() : (o.permisos ? o.permisos.filter(function (p) { return P.IDS.indexOf(p) >= 0; }) : P.porDefecto(o.cargo)),
      activo: true, publica: par.publica,
      privada: await C.protegerPrivada(par.privada, o.contrasena, iter),
      envuelta: await C.envolverClave(llaveDatos, par.publica),
      debeCambiar: !!o.debeCambiar, creado: t, modificado: t, ultimoAcceso: "",
    };
  }

  /**
   * Bóveda nueva: la contraseña del archivo, la cuenta de administración (ABIES)
   * y el documento inicial. Devuelve el «estado» abierto con el que trabaja la sesión.
   */
  async function crear(o, iter) {
    comprobarContrasena(o.contrasenaArchivo);
    var llaveDatos = await C.nuevaClaveDatos();
    var admin = await nuevoUsuario({ nombre: P.NOMBRE_ADMIN, cargo: P.CARGO_ADMIN, rol: "admin", contrasena: o.contrasenaAdmin }, llaveDatos, iter);
    admin.ultimoAcceso = ahora();
    return {
      cabecera: { generacion: 1, usuarios: [admin] },
      llaveArchivo: await C.crearLlave(o.contrasenaArchivo, iter),
      llaveDatos: llaveDatos, usuarioId: admin.id, doc: o.doc,
    };
  }

  /** Cifra el estado en una bóveda lista para guardar. */
  async function sellar(estado) {
    return { formato: FORMATO, version: 1,
      cabecera: await C.cifrar(estado.cabecera, estado.llaveArchivo),
      datos: await C.cifrarConClave(estado.doc, estado.llaveDatos) };
  }

  /** Lee la cabecera con la contraseña del archivo. Lanza «ACCESO» si no es. */
  async function abrirCabecera(boveda, contrasenaArchivo) {
    if (!esBoveda(boveda)) throw errorUso("No es una bóveda de Agora.");
    try {
      var r = await C.descifrar(boveda.cabecera, contrasenaArchivo);
      return { cabecera: r.objeto, llaveArchivo: r.llave };
    } catch (e) { throw errorAcceso(); }
  }

  /** Entrar: nombre + cargo + contraseña personal + contraseña del archivo. */
  async function abrir(boveda, o) {
    var c = await abrirCabecera(boveda, o.contrasenaArchivo);
    var u = c.cabecera.usuarios.filter(function (y) { return y.activo !== false && y.envuelta && coincide(y, o.nombre, o.cargo); })[0];
    if (!u) throw errorAcceso();
    var llaveDatos, doc;
    try {
      var privada = await C.abrirPrivada(u.privada, o.contrasena);
      llaveDatos = await C.desenvolverClave(u.envuelta, privada);
      doc = await C.descifrarConClave(boveda.datos, llaveDatos);
    } catch (e) { throw errorAcceso(); }
    u.ultimoAcceso = ahora();
    return { cabecera: c.cabecera, llaveArchivo: c.llaveArchivo, llaveDatos: llaveDatos, usuarioId: u.id, doc: doc };
  }

  // ── Operaciones sobre un estado abierto ────────────────────────────────
  var usuarioDe = function (estado, id) {
    var u = estado.cabecera.usuarios.filter(function (y) { return y.id === id; })[0];
    if (!u) throw errorUso("Ese usuario no existe.");
    return u;
  };
  var actual = function (estado) { return usuarioDe(estado, estado.usuarioId); };
  function exigirAdmin(estado) {
    if (actual(estado).rol !== "admin") throw errorUso("Solo la cuenta de administración puede hacer esto.");
  }
  function exigirUnico(estado, nombre, cargo, salvoId) {
    if (!String(nombre || "").trim() || !String(cargo || "").trim()) throw errorUso("Hace falta el nombre y el cargo.");
    var repetido = estado.cabecera.usuarios.some(function (y) { return y.id !== salvoId && y.activo !== false && coincide(y, nombre, cargo); });
    if (repetido) throw errorUso("Ya hay un usuario activo con ese nombre y ese cargo.");
  }

  /** Alta de un usuario (solo administración). Entra con una contraseña provisional. */
  async function anadirUsuario(estado, o, iter) {
    exigirAdmin(estado);
    exigirUnico(estado, o.nombre, o.cargo);
    var u = await nuevoUsuario({ nombre: o.nombre, cargo: o.cargo, rol: "cargo", contrasena: o.contrasena, permisos: o.permisos, debeCambiar: true }, estado.llaveDatos, iter);
    estado.cabecera.usuarios.push(u);
    return publico(u);
  }

  /** Cambia nombre, cargo o permisos (solo administración). */
  function editarUsuario(estado, id, o) {
    exigirAdmin(estado);
    var u = usuarioDe(estado, id);
    var nombre = o.nombre != null ? o.nombre : u.nombre, cargo = o.cargo != null ? o.cargo : u.cargo;
    if (u.rol === "admin" && (P.normalizar(nombre) !== P.normalizar(u.nombre) || P.normalizar(cargo) !== P.normalizar(u.cargo))) {
      throw errorUso("La cuenta de administración se llama siempre «" + P.NOMBRE_ADMIN + " · " + P.CARGO_ADMIN + "».");
    }
    exigirUnico(estado, nombre, cargo, id);
    u.nombre = String(nombre).trim(); u.cargo = String(cargo).trim();
    if (o.permisos && u.rol !== "admin") u.permisos = o.permisos.filter(function (p) { return P.IDS.indexOf(p) >= 0; });
    u.modificado = ahora();
    return publico(u);
  }

  /**
   * Nueva contraseña para un usuario: un par de claves nuevo con acceso a la
   * clave de datos. Sirve para restablecer (administración, provisional) y para
   * reactivar a alguien.
   */
  async function rehacerAcceso(estado, u, contrasena, debeCambiar, iter) {
    var nuevo = await nuevoUsuario({ id: u.id, nombre: u.nombre, cargo: u.cargo, rol: u.rol, permisos: u.permisos, contrasena: contrasena, debeCambiar: debeCambiar }, estado.llaveDatos, iter);
    u.publica = nuevo.publica; u.privada = nuevo.privada; u.envuelta = nuevo.envuelta;
    u.debeCambiar = !!debeCambiar; u.activo = true; u.modificado = ahora();
  }
  async function restablecerContrasena(estado, id, contrasena, iter) {
    exigirAdmin(estado);
    var u = usuarioDe(estado, id);
    if (u.activo === false) exigirUnico(estado, u.nombre, u.cargo, id);
    await rehacerAcceso(estado, u, contrasena, u.id !== estado.usuarioId, iter);
    return publico(u);
  }

  /** Cada usuario cambia la suya (comprueba la actual). */
  async function cambiarPropia(estado, actualTexto, nueva, iter) {
    var u = actual(estado);
    try { await C.abrirPrivada(u.privada, actualTexto); } catch (e) { throw errorUso("La contraseña actual no es correcta."); }
    if (actualTexto === nueva) throw errorUso("La nueva tiene que ser distinta de la actual.");
    await rehacerAcceso(estado, u, nueva, false, iter);
  }

  /**
   * Desactiva a alguien y cambia la clave de datos. Devuelve la llave vieja: la
   * sesión la necesita para volver a cifrar los adjuntos con la nueva.
   */
  async function desactivarUsuario(estado, id) {
    exigirAdmin(estado);
    var u = usuarioDe(estado, id);
    if (u.rol === "admin") throw errorUso("La cuenta de administración no se puede desactivar.");
    if (id === estado.usuarioId) throw errorUso("No puedes desactivarte a ti mismo.");
    u.activo = false; u.envuelta = null; u.privada = null; u.publica = null; u.modificado = ahora();
    return rotarClave(estado);
  }

  /** Clave de datos nueva, envuelta para todos los activos. Devuelve la anterior. */
  async function rotarClave(estado) {
    var vieja = estado.llaveDatos, nueva = await C.nuevaClaveDatos();
    var activos = estado.cabecera.usuarios.filter(function (y) { return y.activo !== false && y.publica; });
    for (var i = 0; i < activos.length; i++) activos[i].envuelta = await C.envolverClave(nueva, activos[i].publica);
    estado.llaveDatos = nueva;
    estado.cabecera.generacion = (estado.cabecera.generacion || 1) + 1;
    return vieja;
  }

  /** Nueva contraseña del archivo (solo administración). */
  async function cambiarContrasenaArchivo(estado, actualTexto, nueva, boveda, iter) {
    exigirAdmin(estado);
    comprobarContrasena(nueva);
    await abrirCabecera(boveda, actualTexto).catch(function () { throw errorUso("La contraseña del archivo actual no es correcta."); });
    estado.llaveArchivo = await C.crearLlave(nueva, iter);
  }

  return {
    FORMATO: FORMATO, MINIMO: MINIMO, esBoveda: esBoveda, coincide: coincide, firma: firma, publico: publico,
    crear: crear, sellar: sellar, abrir: abrir, abrirCabecera: abrirCabecera,
    anadirUsuario: anadirUsuario, editarUsuario: editarUsuario, restablecerContrasena: restablecerContrasena,
    cambiarPropia: cambiarPropia, desactivarUsuario: desactivarUsuario, rotarClave: rotarClave,
    cambiarContrasenaArchivo: cambiarContrasenaArchivo,
    usuarioActual: function (estado) { return actual(estado); },
  };
});

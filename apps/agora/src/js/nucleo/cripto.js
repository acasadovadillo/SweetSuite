/*
 * webkit_asociaciones — Cifrado (Web Crypto API del navegador, sin librerías).
 *
 * Es el ÚNICO sitio donde se cifra o descifra. La contraseña nunca se guarda ni
 * sale del navegador: solo sirve para derivar una clave que vive en memoria
 * mientras la sesión está abierta.
 *
 *   Derivación de la clave : PBKDF2-HMAC-SHA256, 310.000 iteraciones (OWASP 2023)
 *   Cifrado                : AES-256-GCM (si la contraseña es incorrecta o el
 *                            archivo se ha manipulado, el descifrado falla)
 *   Formato del bloque     : JSON { v, kdf, iter, sal, iv, ct } (en base64)
 *
 * La MISMA contraseña cifra lo guardado en el navegador y la copia de seguridad:
 * de hecho, la copia es ese mismo bloque cifrado metido en un sobre.
 *
 * Derivar la clave es lento a propósito (~0,3 s), para que adivinar contraseñas
 * sea caro. Por eso se deriva una vez al entrar y se reutiliza en cada guardado
 * con un vector (iv) nuevo cada vez, que es lo que exige AES-GCM.
 *
 * Adaptado de crypto.js de Solvento. Funciona en el navegador y en Node ≥ 20.
 */
(function (raiz, fabrica) {
  var modulo = fabrica();
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Cripto = modulo;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ITERACIONES = 310000;
  var BYTES_SAL = 16;
  var BYTES_IV = 12; // el tamaño recomendado para AES-GCM

  var sutil = function () {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      // Pasa al abrir el archivo en navegadores muy antiguos o en contextos no
      // seguros. file:// y localhost sí son contextos seguros.
      throw new Error("Este navegador no permite cifrar. Actualízalo o prueba con otro.");
    }
    return crypto.subtle;
  };
  var codificar = function (s) { return new TextEncoder().encode(s); };
  var decodificar = function (b) { return new TextDecoder().decode(b); };

  function aBase64(bytes) {
    // Por trozos: con archivos de varios MB, carácter a carácter sería muy lento.
    var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), partes = [];
    for (var i = 0; i < arr.length; i += 0x8000) partes.push(String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000)));
    return btoa(partes.join(""));
  }
  function desdeBase64(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function nuevaSal() {
    return crypto.getRandomValues(new Uint8Array(BYTES_SAL));
  }

  /** Contraseña + sal → clave AES (no exportable: no se puede sacar de memoria). */
  async function derivarClave(contrasena, sal, iteraciones) {
    var base = await sutil().importKey("raw", codificar(contrasena), "PBKDF2", false, ["deriveKey"]);
    return sutil().deriveKey(
      { name: "PBKDF2", salt: sal, iterations: iteraciones || ITERACIONES, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  /**
   * Prepara una «llave» lista para usar: la clave derivada más la sal y las
   * iteraciones con las que se derivó (hacen falta para descifrar después).
   */
  async function crearLlave(contrasena, iteraciones) {
    var sal = nuevaSal(), iter = iteraciones || ITERACIONES;
    return { clave: await derivarClave(contrasena, sal, iter), sal: sal, iter: iter };
  }

  /** Cifra un objeto con una llave ya derivada. Devuelve el bloque cifrado. */
  async function cifrar(objeto, llave) {
    var iv = crypto.getRandomValues(new Uint8Array(BYTES_IV));
    var ct = await sutil().encrypt({ name: "AES-GCM", iv: iv }, llave.clave, codificar(JSON.stringify(objeto)));
    return { v: 1, kdf: "PBKDF2-SHA256", iter: llave.iter, sal: aBase64(llave.sal), iv: aBase64(iv), ct: aBase64(ct) };
  }

  /**
   * Descifra un bloque con la contraseña. Devuelve { objeto, llave }: la llave
   * se guarda en memoria para seguir cifrando en la sesión sin volver a derivar.
   * Si la contraseña no es la buena lanza un error con codigo "CONTRASENA".
   */
  async function descifrar(bloque, contrasena) {
    if (!esBloque(bloque)) throw new Error("No es un bloque cifrado de webkit_asociaciones.");
    var sal = desdeBase64(bloque.sal);
    var clave = await derivarClave(contrasena, sal, bloque.iter);
    var plano;
    try {
      plano = await sutil().decrypt({ name: "AES-GCM", iv: desdeBase64(bloque.iv) }, clave, desdeBase64(bloque.ct));
    } catch (e) {
      var err = new Error("La contraseña no es correcta.");
      err.codigo = "CONTRASENA";
      throw err;
    }
    return { objeto: JSON.parse(decodificar(plano)), llave: { clave: clave, sal: sal, iter: bloque.iter } };
  }

  /**
   * Archivos adjuntos: se cifran como bytes (sin pasar por JSON) con la llave de
   * la sesión y un iv nuevo. Devuelve { iv, ct } (Uint8Array); en las copias de
   * seguridad viajan en base64 (archivoABase64 / archivoDesdeBase64).
   */
  async function cifrarBytes(bytes, llave) {
    var iv = crypto.getRandomValues(new Uint8Array(BYTES_IV));
    var ct = await sutil().encrypt({ name: "AES-GCM", iv: iv }, llave.clave, bytes);
    return { iv: iv, ct: new Uint8Array(ct) };
  }
  async function descifrarBytes(registro, llave) {
    try {
      var plano = await sutil().decrypt({ name: "AES-GCM", iv: registro.iv }, llave.clave, registro.ct);
      return new Uint8Array(plano);
    } catch (e) {
      var err = new Error("No se ha podido descifrar el archivo.");
      err.codigo = "CONTRASENA";
      throw err;
    }
  }
  var archivoABase64 = function (r) { return { iv: aBase64(r.iv), ct: aBase64(r.ct) }; };
  var archivoDesdeBase64 = function (r) { return { iv: desdeBase64(r.iv), ct: desdeBase64(r.ct) }; };

  // ── Usuarios: clave de datos y pares de claves (Fase 7a) ──────────────
  /*
   * Los datos se cifran con una CLAVE DE DATOS aleatoria (AES-256-GCM). Cada
   * usuario tiene un par de claves ECDH P-256: la pública va en claro dentro de
   * la cabecera; la privada, cifrada con SU contraseña personal. La clave de
   * datos se «envuelve» para cada usuario con su pública (ECDH con un par
   * efímero → clave AES de un solo uso), así que:
   *   · solo quien tiene la privada (es decir, su contraseña) la desenvuelve;
   *   · el administrador puede dar acceso o cambiar la clave de datos sin
   *     conocer la contraseña de nadie (solo usa claves públicas).
   */
  var ECDH = { name: "ECDH", namedCurve: "P-256" };

  /** Clave de datos nueva, aleatoria. Se puede exportar (para envolverla). */
  async function nuevaClaveDatos() {
    return { clave: await sutil().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]) };
  }

  /** Cifra un objeto con la clave de datos. Bloque { v: 2, iv, ct }. */
  async function cifrarConClave(objeto, llave) {
    var iv = crypto.getRandomValues(new Uint8Array(BYTES_IV));
    var ct = await sutil().encrypt({ name: "AES-GCM", iv: iv }, llave.clave, codificar(JSON.stringify(objeto)));
    return { v: 2, iv: aBase64(iv), ct: aBase64(ct) };
  }
  async function descifrarConClave(bloque, llave) {
    try {
      var plano = await sutil().decrypt({ name: "AES-GCM", iv: desdeBase64(bloque.iv) }, llave.clave, desdeBase64(bloque.ct));
      return JSON.parse(decodificar(plano));
    } catch (e) {
      var err = new Error("No se han podido descifrar los datos.");
      err.codigo = "CONTRASENA";
      throw err;
    }
  }

  /** Par de claves de un usuario: { publica (JWK), privada (bytes PKCS#8) }. */
  async function nuevoParUsuario() {
    var par = await sutil().generateKey(ECDH, true, ["deriveKey"]);
    return {
      publica: await sutil().exportKey("jwk", par.publicKey),
      privada: new Uint8Array(await sutil().exportKey("pkcs8", par.privateKey)),
    };
  }

  /** Cifra la privada con la contraseña personal: { sal, iter, iv, ct } en base64. */
  async function protegerPrivada(privada, contrasena, iteraciones) {
    var llave = await crearLlave(contrasena, iteraciones);
    var r = await cifrarBytes(privada, llave);
    return { sal: aBase64(llave.sal), iter: llave.iter, iv: aBase64(r.iv), ct: aBase64(r.ct) };
  }
  /** Descifra la privada con la contraseña personal. Lanza codigo "CONTRASENA" si no es. */
  async function abrirPrivada(protegida, contrasena) {
    var clave = await derivarClave(contrasena, desdeBase64(protegida.sal), protegida.iter);
    var bytes = await descifrarBytes({ iv: desdeBase64(protegida.iv), ct: desdeBase64(protegida.ct) }, { clave: clave });
    return sutil().importKey("pkcs8", bytes, ECDH, false, ["deriveKey"]);
  }

  /** Clave AES de un solo uso a partir de una privada y una pública ECDH. */
  function acuerdo(privada, publica) {
    return sutil().deriveKey({ name: "ECDH", public: publica }, privada, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  /** Envuelve la clave de datos para un usuario (con su pública). */
  async function envolverClave(llaveDatos, publicaJwk) {
    var publica = await sutil().importKey("jwk", publicaJwk, ECDH, false, []);
    var efimera = await sutil().generateKey(ECDH, true, ["deriveKey"]);
    var clave = await acuerdo(efimera.privateKey, publica);
    var cruda = new Uint8Array(await sutil().exportKey("raw", llaveDatos.clave));
    var r = await cifrarBytes(cruda, { clave: clave });
    return { efimera: await sutil().exportKey("jwk", efimera.publicKey), iv: aBase64(r.iv), ct: aBase64(r.ct) };
  }
  /** Desenvuelve la clave de datos con la privada del usuario. */
  async function desenvolverClave(envuelta, privada) {
    var efimera = await sutil().importKey("jwk", envuelta.efimera, ECDH, false, []);
    var clave = await acuerdo(privada, efimera);
    var cruda = await descifrarBytes({ iv: desdeBase64(envuelta.iv), ct: desdeBase64(envuelta.ct) }, { clave: clave });
    return { clave: await sutil().importKey("raw", cruda, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]) };
  }

  function esBloque(b) {
    return !!(b && b.v === 1 && typeof b.sal === "string" && typeof b.iv === "string" && typeof b.ct === "string" && b.iter > 0);
  }

  return {
    ITERACIONES: ITERACIONES, crearLlave: crearLlave, cifrar: cifrar,
    nuevaClaveDatos: nuevaClaveDatos, cifrarConClave: cifrarConClave, descifrarConClave: descifrarConClave,
    nuevoParUsuario: nuevoParUsuario, protegerPrivada: protegerPrivada, abrirPrivada: abrirPrivada,
    envolverClave: envolverClave, desenvolverClave: desenvolverClave,
    descifrar: descifrar, esBloque: esBloque, cifrarBytes: cifrarBytes, descifrarBytes: descifrarBytes,
    archivoABase64: archivoABase64, archivoDesdeBase64: archivoDesdeBase64, aBase64: aBase64, desdeBase64: desdeBase64,
  };
});

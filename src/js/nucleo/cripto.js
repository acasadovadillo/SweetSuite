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
  async function crearLlave(contrasena) {
    var sal = nuevaSal();
    return { clave: await derivarClave(contrasena, sal, ITERACIONES), sal: sal, iter: ITERACIONES };
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

  function esBloque(b) {
    return !!(b && b.v === 1 && typeof b.sal === "string" && typeof b.iv === "string" && typeof b.ct === "string" && b.iter > 0);
  }

  return {
    ITERACIONES: ITERACIONES, crearLlave: crearLlave, cifrar: cifrar,
    descifrar: descifrar, esBloque: esBloque, cifrarBytes: cifrarBytes, descifrarBytes: descifrarBytes,
    archivoABase64: archivoABase64, archivoDesdeBase64: archivoDesdeBase64, aBase64: aBase64, desdeBase64: desdeBase64,
  };
});

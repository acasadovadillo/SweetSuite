/*
 * webkit_asociaciones — Formato de la copia de seguridad.
 *
 * Una copia es un archivo .json con un «sobre» que dice qué es y, dentro, los
 * datos. Hay dos variantes:
 *
 *   Cifrada (la normal):
 *     { formato: "webkit_asociaciones-copia", version: 1, creada, cifrada: true,
 *       asociacion: "Nombre", datos: <bloque cifrado de cripto.js> }
 *
 *   Sin cifrar (solo para revisar los datos o llevarlos a otro programa):
 *     { formato: ..., cifrada: false, asociacion, documento: { ...todo en claro... } }
 *
 * El nombre de la asociación va fuera del cifrado para que sepas de quién es una
 * copia sin abrirla. Es lo único que va en claro.
 *
 * Los ARCHIVOS ADJUNTOS van en «archivos»: { id: { iv, ct } } cifrados con la misma
 * llave que los datos (copia cifrada) o { id: { datos } } en claro (copia sin
 * cifrar), siempre en base64.
 *
 * DESDE LA FASE 7a (usuarios de ABIES) la copia cifrada es la BÓVEDA entera:
 *     { formato: "abies-copia", version: 2, creada, cifrada: true,
 *       boveda: { formato: "abies-boveda", cabecera, datos }, archivos: { id: { iv, ct } } }
 *   Se abre con lo mismo que la aplicación: nombre, cargo y las dos contraseñas.
 *   Nada va en claro, ni siquiera el nombre de la asociación.
 *   La copia sin cifrar es { formato: "abies-copia", version: 2, cifrada: false, documento, archivos }.
 * Las copias antiguas (webkit_asociaciones-copia v1) se siguen leyendo.
 *
 * Este archivo solo arma y lee sobres (sin DOM): se puede probar en Node.
 */
(function (raiz, fabrica) {
  var modulo = fabrica();
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Copia = modulo;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FORMATO = "webkit_asociaciones-copia";
  var VERSION = 1;
  var FORMATO_ABIES = "abies-copia";
  var VERSION_ABIES = 2;

  /** Copia cifrada de ABIES: la bóveda y los adjuntos tal cual (ya van cifrados). */
  function sobreBoveda(boveda, archivos, ahora) {
    var s = { formato: FORMATO_ABIES, version: VERSION_ABIES, creada: (ahora || new Date()).toISOString(), cifrada: true, boveda: boveda };
    if (archivos && Object.keys(archivos).length) s.archivos = archivos;
    return s;
  }
  /** Copia SIN cifrar de ABIES (solo la cuenta de administración). */
  function sobreAbiertoAbies(documento, archivos, ahora) {
    var s = { formato: FORMATO_ABIES, version: VERSION_ABIES, creada: (ahora || new Date()).toISOString(), cifrada: false, documento: documento };
    if (archivos && Object.keys(archivos).length) s.archivos = archivos;
    return s;
  }

  function sobreCifrado(bloque, nombreAsociacion, ahora, archivos) {
    var s = { formato: FORMATO, version: VERSION, creada: (ahora || new Date()).toISOString(),
      cifrada: true, asociacion: nombreAsociacion || "", datos: bloque };
    if (archivos && Object.keys(archivos).length) s.archivos = archivos;
    return s;
  }

  function sobreAbierto(documento, ahora, archivos) {
    var s = { formato: FORMATO, version: VERSION, creada: (ahora || new Date()).toISOString(),
      cifrada: false, asociacion: (documento.asociacion && documento.asociacion.nombre) || "", documento: documento };
    if (archivos && Object.keys(archivos).length) s.archivos = archivos;
    return s;
  }

  /**
   * Lee el texto de un archivo de copia. Devuelve
   *   { cifrada: true,  bloque, asociacion, creada }   o
   *   { cifrada: false, documento, asociacion, creada }
   * Lanza un error con un mensaje claro si el archivo no es una copia válida.
   * También acepta un documento suelto (sin sobre), por si alguien lo editó a mano.
   */
  function leer(texto) {
    var j;
    try { j = JSON.parse(texto); } catch (e) { throw new Error("El archivo no es una copia de seguridad (no es JSON válido)."); }
    if (j && j.formato === FORMATO_ABIES) {
      if (j.version > VERSION_ABIES) throw new Error("Esta copia es de una versión más nueva de la aplicación. Descarga la última versión.");
      if (j.cifrada) {
        if (!j.boveda || !j.boveda.cabecera || !j.boveda.datos) throw new Error("La copia está incompleta o dañada.");
        return { cifrada: true, boveda: j.boveda, asociacion: "", creada: j.creada || null, archivos: j.archivos || {} };
      }
      if (!j.documento || typeof j.documento !== "object") throw new Error("La copia está incompleta o dañada.");
      return { cifrada: false, documento: j.documento, asociacion: (j.documento.asociacion && j.documento.asociacion.nombre) || "", creada: j.creada || null, archivos: j.archivos || {} };
    }
    if (j && j.formato === FORMATO) {
      if (j.version > VERSION) throw new Error("Esta copia es de una versión más nueva de la aplicación. Descarga la última versión.");
      if (j.cifrada) {
        if (!j.datos || typeof j.datos.ct !== "string") throw new Error("La copia está incompleta o dañada.");
        return { cifrada: true, antigua: true, bloque: j.datos, asociacion: j.asociacion || "", creada: j.creada || null, archivos: j.archivos || {} };
      }
      if (!j.documento || typeof j.documento !== "object") throw new Error("La copia está incompleta o dañada.");
      return { cifrada: false, documento: j.documento, asociacion: j.asociacion || "", creada: j.creada || null, archivos: j.archivos || {} };
    }
    if (j && j.app === "webkit_asociaciones") {
      return { cifrada: false, documento: j, asociacion: (j.asociacion && j.asociacion.nombre) || "", creada: null, archivos: {} };
    }
    throw new Error("El archivo no es una copia de seguridad de ABIES · Gestión.");
  }

  /** "copia-asociacion-los-almendros-2026-10-01.json" (o "-sin-cifrar"). */
  function nombreArchivo(nombreAsociacion, fechaISO, cifrada) {
    var slug = String(nombreAsociacion || "asociacion")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "asociacion";
    return "copia-" + slug + "-" + fechaISO + (cifrada === false ? "-SIN-CIFRAR" : "") + ".json";
  }

  return { FORMATO: FORMATO, FORMATO_ABIES: FORMATO_ABIES, sobreCifrado: sobreCifrado, sobreAbierto: sobreAbierto,
    sobreBoveda: sobreBoveda, sobreAbiertoAbies: sobreAbiertoAbies, leer: leer, nombreArchivo: nombreArchivo };
});

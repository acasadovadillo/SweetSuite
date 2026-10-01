/*
 * webkit_asociaciones — Bóveda: dónde se guarda el bloque CIFRADO en el navegador.
 *
 * Por qué IndexedDB y no localStorage:
 *   · localStorage admite unos 5 MB y solo texto; IndexedDB, cientos de MB y
 *     archivos (útil si algún día se adjuntan facturas o actas en PDF).
 *   · IndexedDB es asíncrono como lo sería una API: no bloquea la página al guardar.
 * Si IndexedDB no está disponible (algún navegador abriendo el archivo con
 * file://, o en modo privado), se usa localStorage como respaldo.
 *
 * Aquí NUNCA llega nada en claro: solo el bloque que devuelve Cripto.cifrar().
 *
 * ATENCIÓN (limitación conocida): el navegador guarda los datos asociados a
 * él mismo y a la ubicación del archivo. Si abres el HTML con otro navegador, o
 * lo mueves de carpeta, puede que aparezca vacío. Los datos no se han perdido:
 * siguen donde estaban, o se recuperan con la copia de seguridad.
 */
(function (raiz) {
  "use strict";

  var BD = "webkit_asociaciones";
  var ALMACEN = "boveda";
  var CLAVE = "datos";
  var CLAVE_LS = "webkit_asociaciones_boveda";

  var abierta = null; // promesa de la base de datos (o null si no hay IndexedDB)

  function abrir() {
    if (abierta) return abierta;
    abierta = new Promise(function (resolver) {
      try {
        if (!raiz.indexedDB) return resolver(null);
        var pet = raiz.indexedDB.open(BD, 1);
        pet.onupgradeneeded = function () { pet.result.createObjectStore(ALMACEN); };
        pet.onsuccess = function () { resolver(pet.result); };
        pet.onerror = function () { resolver(null); };
        pet.onblocked = function () { resolver(null); };
      } catch (e) {
        resolver(null);
      }
    });
    return abierta;
  }

  function operacion(modo, hacer) {
    return abrir().then(function (bd) {
      if (!bd) return { sinIndexedDB: true };
      return new Promise(function (resolver, rechazar) {
        var tx = bd.transaction(ALMACEN, modo);
        var pet = hacer(tx.objectStore(ALMACEN));
        var resultado;
        if (pet) pet.onsuccess = function () { resultado = pet.result; };
        tx.oncomplete = function () { resolver({ valor: resultado }); };
        tx.onerror = function () { rechazar(tx.error || new Error("No se pudo guardar en el navegador.")); };
        tx.onabort = function () { rechazar(tx.error || new Error("El navegador canceló el guardado (¿sin espacio?).")); };
      });
    });
  }

  var ls = {
    leer: function () { try { var s = localStorage.getItem(CLAVE_LS); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    escribir: function (b) { localStorage.setItem(CLAVE_LS, JSON.stringify(b)); },
    borrar: function () { try { localStorage.removeItem(CLAVE_LS); } catch (e) { /* nada que borrar */ } },
  };

  /** Devuelve el bloque cifrado guardado, o null si no hay datos. */
  async function leer() {
    var r = await operacion("readonly", function (s) { return s.get(CLAVE); });
    if (r.sinIndexedDB) return ls.leer();
    return r.valor || ls.leer(); // por si se guardó con el respaldo en otra ocasión
  }

  async function escribir(bloque) {
    var r = await operacion("readwrite", function (s) { return s.put(bloque, CLAVE); });
    if (r.sinIndexedDB) ls.escribir(bloque);
    else ls.borrar(); // que no quede una versión vieja en el respaldo
  }

  async function borrar() {
    await operacion("readwrite", function (s) { return s.delete(CLAVE); });
    ls.borrar();
  }

  async function hayDatos() {
    return !!(await leer());
  }

  /** Dónde se está guardando, para enseñarlo en Ajustes. */
  async function tipo() {
    return (await abrir()) ? "IndexedDB" : "localStorage";
  }

  /**
   * Pide al navegador que no borre estos datos cuando ande corto de espacio.
   * El navegador puede decir que no; no pasa nada, pero se avisa en Ajustes.
   */
  async function pedirPersistencia() {
    try {
      if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
    } catch (e) { /* no soportado */ }
    return false;
  }

  (raiz.WA = raiz.WA || {}).Boveda = { leer: leer, escribir: escribir, borrar: borrar, hayDatos: hayDatos, tipo: tipo, pedirPersistencia: pedirPersistencia };
})(typeof self !== "undefined" ? self : this);

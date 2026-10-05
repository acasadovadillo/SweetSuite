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
  var ARCHIVOS = "archivos";   // adjuntos cifrados: { id → { iv, ct } } (versión 2 de la base de datos)
  var CLAVE = "datos";
  var CLAVE_LS = "webkit_asociaciones_boveda";

  var abierta = null; // promesa de la base de datos (o null si no hay IndexedDB)

  function abrir() {
    if (abierta) return abierta;
    abierta = new Promise(function (resolver) {
      try {
        if (!raiz.indexedDB) return resolver(null);
        var pet = raiz.indexedDB.open(BD, 2);
        pet.onupgradeneeded = function () {
          var bd = pet.result;
          if (!bd.objectStoreNames.contains(ALMACEN)) bd.createObjectStore(ALMACEN);
          if (!bd.objectStoreNames.contains(ARCHIVOS)) bd.createObjectStore(ARCHIVOS);
        };
        pet.onsuccess = function () {
          var bd = pet.result;
          // Si otra pestaña con una versión más nueva necesita actualizar la base, se le cede.
          bd.onversionchange = function () { bd.close(); };
          resolver(bd);
        };
        pet.onerror = function () { resolver(null); };
        // Otra pestaña con la versión anterior tiene la base abierta: NO se da por
        // perdida (los datos parecerían haber desaparecido); se espera a que la cierren.
        pet.onblocked = function () {
          var msg = "Hay otra pestaña con la aplicación abierta. Ciérrala para continuar (hay que actualizar el almacén de datos).";
          if (raiz.WA && raiz.WA.UI) raiz.WA.UI.aviso(msg, "error"); else if (raiz.alert) raiz.alert(msg);
        };
      } catch (e) {
        resolver(null);
      }
    });
    return abierta;
  }

  function operacion(modo, hacer, almacen) {
    return abrir().then(function (bd) {
      if (!bd) return { sinIndexedDB: true };
      return new Promise(function (resolver, rechazar) {
        var tx = bd.transaction(almacen || ALMACEN, modo);
        var pet = hacer(tx.objectStore(almacen || ALMACEN));
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

  // ── Archivos adjuntos (solo con IndexedDB: en localStorage no caben) ──────
  async function exigirIndexedDB() {
    if (!(await abrir())) throw new Error("Este navegador no permite guardar archivos abriendo la aplicación así. Prueba con otro navegador (Chrome, Edge, Firefox).");
  }
  async function leerArchivo(id) {
    await exigirIndexedDB();
    return (await operacion("readonly", function (s) { return s.get(id); }, ARCHIVOS)).valor || null;
  }
  async function escribirArchivo(id, registro) {
    await exigirIndexedDB();
    await operacion("readwrite", function (s) { return s.put(registro, id); }, ARCHIVOS);
  }
  async function borrarArchivo(id) {
    if (!(await abrir())) return;
    await operacion("readwrite", function (s) { return s.delete(id); }, ARCHIVOS);
  }
  async function borrarArchivos() {
    if (!(await abrir())) return;
    await operacion("readwrite", function (s) { return s.clear(); }, ARCHIVOS);
  }

  /** Espacio usado y disponible según el navegador (orientativo), en bytes. */
  async function espacio() {
    try {
      if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
    } catch (e) { /* no soportado */ }
    return null;
  }

  (raiz.WA = raiz.WA || {}).Boveda = { leer: leer, escribir: escribir, borrar: borrar, hayDatos: hayDatos, tipo: tipo, pedirPersistencia: pedirPersistencia,
    leerArchivo: leerArchivo, escribirArchivo: escribirArchivo, borrarArchivo: borrarArchivo, borrarArchivos: borrarArchivos, espacio: espacio };
})(typeof self !== "undefined" ? self : this);

/*
 * webkit_asociaciones — Forma de los datos (esquema) y migraciones.
 *
 * Todos los datos de una asociación son UN documento JSON:
 *
 *   {
 *     app: "webkit_asociaciones",
 *     esquema: 3,                 ← versión de esta forma; sube cuando cambia
 *     meta: { creado, modificado, ultimaCopia, cambiosDesdeCopia },
 *     asociacion: { nombre, siglas, nif, domicilio: {…por partes…}, ... },   ← un objeto suelto
 *     config: { tiposSocio, cuentas, siguienteNumeroSocio },  ← ajustes de la asociación
 *     junta: [ { id, cargo, nombre, ... } ],      ← colecciones: listas de registros
 *     socios: [...], cuotas: [...], remesas: [...]  (ver logica/socios.js y logica/cuotas.js)
 *     ... (cada fase añade sus colecciones: socios, cuotas, facturas…)
 *   }
 *
 * Reglas para todo registro de una colección:
 *   · id        texto único (nunca se reutiliza)
 *   · creado / modificado   marca de tiempo ISO
 *   · importes en CÉNTIMOS enteros, fechas «aaaa-mm-dd» (ver dinero.js y fechas.js)
 *
 * CUANDO CAMBIE LA FORMA (p. ej. la Fase 2 añade «socios»):
 *   1. sube VERSION,
 *   2. añade una función a MIGRACIONES que lleve un documento de la versión
 *      anterior a la nueva (sin perder nada),
 *   3. añade un test en tests/esquema.test.js.
 * Así, una copia de seguridad antigua siempre se puede abrir con la versión nueva.
 *
 * Historial: v1 (fase 1) · v2 domicilio por partes y sin «fines» · v3 socios, cuotas y remesas (fase 2).
 */
(function (raiz, fabrica) {
  var Direccion = typeof require === "function" ? require("../nucleo/direccion.js") : raiz.WA.Direccion;
  var modulo = fabrica(Direccion);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Esquema = modulo;
})(typeof self !== "undefined" ? self : this, function (Direccion) {
  "use strict";

  var APP = "webkit_asociaciones";
  var VERSION = 3;

  /** Las colecciones (listas de registros) que existen en esta versión. */
  var COLECCIONES = ["junta", "socios", "cuotas", "remesas"];

  /** Cargos habituales de una junta directiva. Los estatutos de cada asociación
   *  pueden llamarlos de otra forma: por eso existe «Otro». */
  var CARGOS = ["Presidencia", "Vicepresidencia", "Secretaría", "Tesorería", "Vocalía", "Otro"];

  function asociacionVacia() {
    return {
      nombre: "", siglas: "", nif: "",
      registro: "",          // dónde está inscrita (registro nacional o autonómico)
      numeroRegistro: "",
      fechaConstitucion: "",
      domicilio: Direccion.vacia(),   // por partes: ver nucleo/direccion.js
      email: "", telefono: "", web: "",
      iban: "",              // cuenta de la asociación (se usará en las remesas de cuotas)
    };
  }

  /*
   * Configuración de la asociación (no de este ordenador):
   *   tiposSocio  tipos de socio con su cuota y periodicidad (ver logica/cuotas.js)
   *   cuentas     dónde entra el dinero: { id, nombre, tipo: "banco" | "caja" }.
   *               La Fase 3 (tesorería) las ampliará.
   *   siguienteNumeroSocio  contador: un número de socio nunca se reutiliza
   */
  function configVacia() {
    return {
      tiposSocio: [{ id: "socio", nombre: "Socio", cuota: 0, periodicidad: "anual", activo: true }],
      cuentas: [{ id: "banco", nombre: "Cuenta bancaria", tipo: "banco" }, { id: "caja", nombre: "Caja (efectivo)", tipo: "caja" }],
      siguienteNumeroSocio: 1,
    };
  }

  function documentoVacio(ahora) {
    var t = (ahora || new Date()).toISOString();
    return {
      app: APP,
      esquema: VERSION,
      meta: { creado: t, modificado: t, ultimaCopia: null, cambiosDesdeCopia: 0 },
      asociacion: asociacionVacia(),
      config: configVacia(),
      junta: [], socios: [], cuotas: [], remesas: [],
    };
  }

  /*
   * Migraciones: MIGRACIONES[n] lleva un documento de la versión n a la n+1.
   * La 0 existe para documentos sin campo «esquema» (no debería haber, pero
   * así una importación incompleta se rellena en vez de romperse).
   */
  var MIGRACIONES = {
    // 0 → 1: rellena lo que falte con la forma que tenía la versión 1.
    0: function (doc) {
      var base = documentoVacio();
      doc.app = APP;
      doc.meta = Object.assign(base.meta, doc.meta || {});
      doc.asociacion = Object.assign({ nombre: "", siglas: "", nif: "", registro: "", numeroRegistro: "",
        fechaConstitucion: "", email: "", telefono: "", web: "", iban: "", fines: "" }, doc.asociacion || {});
      doc.asociacion.domicilio = Object.assign({ via: "", codigoPostal: "", municipio: "", provincia: "" }, doc.asociacion.domicilio || {});
      if (!Array.isArray(doc.junta)) doc.junta = [];
      doc.esquema = 1;
      return doc;
    },

    // 1 → 2: el domicilio pasa de una línea («via») a ir por partes, y se quitan
    // los «fines» (vendrán de los estatutos adjuntos). Lo que no se consiga
    // repartir de la línea antigua se guarda en «complemento»: no se pierde nada.
    1: function (doc) {
      var viejo = doc.asociacion.domicilio || {};
      var nuevo = Object.assign(Direccion.vacia(), Direccion.desdeTexto(viejo.via));
      nuevo.codigoPostal = String(viejo.codigoPostal || "").trim();
      nuevo.municipio = String(viejo.municipio || "").trim();
      nuevo.provincia = Direccion.normalizarProvincia(viejo.provincia) || String(viejo.provincia || "").trim() ||
        Direccion.provinciaDeCP(nuevo.codigoPostal);
      doc.asociacion.domicilio = nuevo;
      delete doc.asociacion.fines;
      doc.esquema = 2;
      return doc;
    },

    // 2 → 3: llegan los socios y las cuotas (Fase 2).
    2: function (doc) {
      doc.config = Object.assign(configVacia(), doc.config || {});
      ["socios", "cuotas", "remesas"].forEach(function (c) { if (!Array.isArray(doc[c])) doc[c] = []; });
      doc.esquema = 3;
      return doc;
    },
  };

  /**
   * Lleva cualquier documento a la versión actual. Lanza un error con un
   * mensaje claro si viene de una versión MÁS NUEVA de la aplicación (no se
   * puede adivinar qué significan sus campos nuevos).
   */
  function migrar(doc) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("El archivo no contiene datos de una asociación.");
    if (doc.app && doc.app !== APP) throw new Error("Estos datos son de otra aplicación.");
    var copia = JSON.parse(JSON.stringify(doc));
    var v = typeof copia.esquema === "number" ? copia.esquema : 0;
    if (v > VERSION) {
      throw new Error("Estos datos se crearon con una versión más nueva de webkit_asociaciones. Descarga la última versión para abrirlos.");
    }
    while (v < VERSION) {
      copia = MIGRACIONES[v](copia);
      v = copia.esquema;
    }
    return asegurarForma(copia);
  }

  /*
   * Red de seguridad: un documento que dice ser de una versión pero le falta
   * algo (una copia editada a mano, un fallo antiguo) se completa con lo que
   * falte, sin tocar lo que ya tiene. Así nunca falla al guardar por un campo ausente.
   */
  function asegurarForma(doc) {
    var base = documentoVacio();
    doc.app = APP;
    doc.meta = Object.assign(base.meta, doc.meta || {});
    doc.asociacion = Object.assign(asociacionVacia(), doc.asociacion || {});
    doc.asociacion.domicilio = Object.assign(Direccion.vacia(), doc.asociacion.domicilio || {});
    doc.config = Object.assign(configVacia(), doc.config || {});
    if (!Array.isArray(doc.config.tiposSocio) || !doc.config.tiposSocio.length) doc.config.tiposSocio = configVacia().tiposSocio;
    if (!Array.isArray(doc.config.cuentas) || !doc.config.cuentas.length) doc.config.cuentas = configVacia().cuentas;
    COLECCIONES.forEach(function (c) { if (!Array.isArray(doc[c])) doc[c] = []; });
    return doc;
  }

  /** Identificador único para un registro nuevo. */
  function nuevoId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  return {
    APP: APP, VERSION: VERSION, COLECCIONES: COLECCIONES, CARGOS: CARGOS,
    documentoVacio: documentoVacio, asociacionVacia: asociacionVacia, configVacia: configVacia, direccionVacia: Direccion.vacia,
    migrar: migrar, nuevoId: nuevoId,
  };
});

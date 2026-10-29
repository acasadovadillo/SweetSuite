/*
 * Agora — Permisos por cargo (sin interfaz: tests/cuentas.test.js).
 *
 * Todos los usuarios VEN todo; cada uno EDITA las secciones de su cargo. La
 * cuenta de administración (ABIES) lo edita todo y es la única que gestiona
 * usuarios. El administrador puede cambiar las secciones de cada usuario.
 *
 * ⚠️ Sin servidor, estos permisos los hace cumplir la aplicación (el
 * repositorio rechaza lo que no toca), no el cifrado: quien entra con
 * credenciales válidas tiene la clave de todos los datos. Para una junta de
 * confianza basta; para garantizarlo hace falta la versión con servidor.
 */
(function (raiz, fabrica) {
  var modulo = fabrica();
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Permisos = modulo;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Secciones que se pueden editar. El id es el del módulo (#/socios…). */
  var SECCIONES = [
    ["asociacion", "Asociación y junta"],
    ["socios", "Socios"],
    ["cuotas", "Cuotas"],
    ["actividades", "Actividades"],
    ["tesoreria", "Tesorería"],
    ["facturas", "Facturas"],
    ["iva", "IVA"],
    ["proyectos", "Presupuestos y subvenciones"],
    ["actas", "Actas"],
    ["obligaciones", "Obligaciones"],
    ["documentos", "Documentos"],
    ["informes", "Informes (textos de la memoria)"],
  ];
  var IDS = SECCIONES.map(function (s) { return s[0]; });

  /** Cargos habituales (para sugerir al escribir). Se admite cualquier otro. */
  var CARGOS = ["Presidencia", "Vicepresidencia", "Secretaría", "Tesorería", "Vocalía", "Coordinación"];
  var CARGO_ADMIN = "Administración";
  var NOMBRE_ADMIN = "ABIES";

  /** «  Tesorería » → «tesoreria»: sin tildes, minúsculas, espacios simples. */
  function normalizar(texto) {
    return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
  }

  /** Secciones que edita un cargo si el administrador no dice otra cosa. */
  function porDefecto(cargo, rol) {
    if (rol === "admin") return IDS.slice();
    var c = normalizar(cargo);
    if (c.indexOf("vicepresiden") === 0 || c.indexOf("presiden") === 0) return IDS.slice();
    if (c.indexOf("secretar") === 0) return ["asociacion", "socios", "actas", "obligaciones", "documentos", "informes"];
    if (c.indexOf("tesor") === 0) return ["cuotas", "tesoreria", "facturas", "iva", "proyectos"];
    if (c.indexOf("vocal") === 0) return ["actividades"];
    return [];
  }

  /**
   * ¿Puede este usuario modificar datos estando en este módulo?
   * Los módulos que no son una sección de datos (inicio, ajustes…) no escriben
   * datos de la asociación, o tienen su propia comprobación (usuarios, copias).
   */
  function puedeEditar(usuario, modulo) {
    if (!usuario) return false;
    if (usuario.rol === "admin") return true;
    if (IDS.indexOf(modulo) < 0) return true;
    return (usuario.permisos || []).indexOf(modulo) >= 0;
  }

  function nombreSeccion(id) {
    var s = SECCIONES.filter(function (x) { return x[0] === id; })[0];
    return s ? s[1] : id;
  }

  return { SECCIONES: SECCIONES, IDS: IDS, CARGOS: CARGOS, CARGO_ADMIN: CARGO_ADMIN, NOMBRE_ADMIN: NOMBRE_ADMIN,
    normalizar: normalizar, porDefecto: porDefecto, puedeEditar: puedeEditar, nombreSeccion: nombreSeccion };
});

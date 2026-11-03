/*
 * Agora — Admisiones: las solicitudes de alta de socios (sin interfaz:
 * tests/admisiones.test.js).
 *
 * Quien quiere ser socio lo pide; la junta lo estudia y lo admite o no. Al
 * admitirlo se le da de alta como socio, con su número y la fecha del acuerdo.
 *
 * SOLICITUD:
 *   { id, fecha (en que se pidió), nombre, apellidos, tipoDocumento, documento,
 *     fechaNacimiento, email, telefono, tipoSocioId, presentadoPor, notas,
 *     estado: "pendiente" | "admitida" | "rechazada",
 *     fechaResolucion, acuerdo (dónde y cómo se decidió: «Junta del 12/03»),
 *     motivo (si se rechaza), socioId (el socio que salió de ella) }
 *
 * El procedimiento (quién admite, si hace falta aval, plazos) lo fijan los
 * estatutos: verificar con ellos.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { F: require("../nucleo/fechas.js"), S: require("./socios.js"), V: require("../nucleo/validar.js") }
    : { F: raiz.WA.Fechas, S: raiz.WA.Socios, V: raiz.WA.Validar };
  var modulo = fabrica(dep.F, dep.S, dep.V);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Admisiones = modulo;
})(typeof self !== "undefined" ? self : this, function (F, S, V) {
  "use strict";

  var ESTADOS = { pendiente: "Pendiente", admitida: "Admitida", rechazada: "No admitida" };

  function vacia(hoy) {
    return {
      fecha: hoy || F.hoy(), nombre: "", apellidos: "", tipoDocumento: "DNI", documento: "", fechaNacimiento: "",
      email: "", telefono: "", tipoSocioId: "", presentadoPor: "", notas: "",
      estado: "pendiente", fechaResolucion: "", acuerdo: "", motivo: "", socioId: "",
    };
  }

  /** Lo que falta o no vale. Devuelve { campo: mensaje }. */
  function validar(s) {
    var e = {};
    if (!String(s.nombre || "").trim()) e.nombre = "Escribe el nombre.";
    if (!F.esValida(s.fecha)) e.fecha = "La fecha de la solicitud no es válida.";
    if (s.fechaNacimiento && !F.esValida(s.fechaNacimiento)) e.fechaNacimiento = "La fecha de nacimiento no es válida.";
    if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email).trim())) e.email = "El correo no parece válido.";
    return e;
  }

  /** ¿Es ya socio, o lo ha pedido antes? (por documento o por correo) */
  function coincidencias(s, socios, solicitudes) {
    var doc = s.documento ? V.normalizar(s.documento) : "", mail = String(s.email || "").trim().toLowerCase();
    var igual = function (o) { return (doc && o.documento && V.normalizar(o.documento) === doc) || (mail && String(o.email || "").trim().toLowerCase() === mail); };
    return {
      socios: (socios || []).filter(function (o) { return igual(o) && !o.fechaBaja; }),
      solicitudes: (solicitudes || []).filter(function (o) { return o.id !== s.id && o.estado === "pendiente" && igual(o); }),
    };
  }

  /**
   * Admitirla: el socio nuevo y la solicitud resuelta.
   * o: { fecha (del acuerdo, que es su alta), acuerdo, socios, contador (config.siguienteNumeroSocio) }
   * Devuelve { socio, solicitud, contador } (el socio sin id: lo pone quien lo guarda).
   */
  function admitir(sol, o) {
    if (sol.estado !== "pendiente") throw new Error("Esta solicitud ya está resuelta.");
    if (!F.esValida(o.fecha)) throw new Error("Indica la fecha en que se admitió.");
    if (o.fecha < sol.fecha) throw new Error("No se puede admitir antes de que se pidiera.");
    var numero = S.siguienteNumero(o.socios, o.contador);
    var socio = S.completar({
      numero: numero, nombre: sol.nombre, apellidos: sol.apellidos, tipoDocumento: sol.tipoDocumento, documento: sol.documento,
      fechaNacimiento: sol.fechaNacimiento, email: sol.email, telefono: sol.telefono, tipoSocioId: sol.tipoSocioId,
      fechaAlta: o.fecha, notas: ["Admitido" + (o.acuerdo ? " en " + o.acuerdo : "") + " (solicitud del " + F.corta(sol.fecha) + ")", sol.notas].filter(Boolean).join(". "),
    });
    var solicitud = Object.assign({}, sol, { estado: "admitida", fechaResolucion: o.fecha, acuerdo: o.acuerdo || "", motivo: "" });
    return { socio: socio, solicitud: solicitud, contador: numero + 1 };
  }

  function rechazar(sol, fecha, motivo, acuerdo) {
    if (sol.estado !== "pendiente") throw new Error("Esta solicitud ya está resuelta.");
    if (!F.esValida(fecha)) throw new Error("Indica la fecha en que se decidió.");
    return Object.assign({}, sol, { estado: "rechazada", fechaResolucion: fecha, motivo: motivo || "", acuerdo: acuerdo || "" });
  }

  /** Volver a dejarla pendiente (una rechazada por error). Una admitida no: ya es socio. */
  function reabrir(sol) {
    if (sol.estado !== "rechazada") throw new Error("Solo se puede reabrir una solicitud rechazada.");
    return Object.assign({}, sol, { estado: "pendiente", fechaResolucion: "", motivo: "", acuerdo: "" });
  }

  /** Ordenadas: las pendientes primero (las más antiguas antes) y luego lo resuelto, lo último arriba. */
  function ordenar(lista) {
    return (lista || []).slice().sort(function (a, b) {
      var pa = a.estado === "pendiente", pb = b.estado === "pendiente";
      if (pa !== pb) return pa ? -1 : 1;
      return pa ? String(a.fecha).localeCompare(String(b.fecha)) : String(b.fechaResolucion).localeCompare(String(a.fechaResolucion));
    });
  }

  return { ESTADOS: ESTADOS, vacia: vacia, validar: validar, coincidencias: coincidencias, admitir: admitir, rechazar: rechazar, reabrir: reabrir, ordenar: ordenar };
});

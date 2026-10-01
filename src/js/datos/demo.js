/*
 * webkit_asociaciones — Datos de demostración.
 *
 * TODO ES INVENTADO. Ninguna persona, asociación, NIF, correo ni teléfono de
 * aquí es real:
 *   · los correos usan el dominio example.org, reservado para ejemplos;
 *   · los teléfonos son 600 000 0xx;
 *   · el NIF G00000000 cuadra en formato pero no corresponde a ninguna entidad
 *     conocida; el IBAN (ES91 2100 0418 4502 0005 1332) es un ejemplo que se
 *     repite en documentación técnica de todo el mundo, no una cuenta de nadie.
 *
 * Si añades datos aquí, que sigan siendo claramente ficticios (hay un test que
 * comprueba los correos).
 */
(function (raiz, fabrica) {
  var Esquema = typeof require === "function" ? require("./esquema.js") : raiz.WA.Esquema;
  var modulo = fabrica(Esquema);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Demo = modulo;
})(typeof self !== "undefined" ? self : this, function (Esquema) {
  "use strict";

  function documentoDemo(ahora) {
    var doc = Esquema.documentoVacio(ahora);
    var t = doc.meta.creado;
    doc.asociacion = {
      nombre: "Asociación Cultural Los Almendros (ficticia)",
      siglas: "ACLA",
      nif: "G00000000",
      registro: "Registro de Asociaciones de ejemplo",
      numeroRegistro: "0000/EJEMPLO",
      fechaConstitucion: "2015-03-21",
      domicilio: Object.assign(Esquema.direccionVacia(), {
        tipoVia: "Calle", nombreVia: "de Ejemplo", numero: "1", planta: "Bajo", puerta: "A",
        complemento: "Local de la asociación", codigoPostal: "28000", municipio: "Villaejemplo", provincia: "Madrid",
      }),
      email: "junta@example.org",
      telefono: "600 000 000",
      web: "https://example.org",
      iban: "ES9121000418450200051332",
    };
    var junta = [
      ["Presidencia", "Lucía Ficticia Ejemplo", "presidencia@example.org", "600 000 001", "2024-03-16"],
      ["Vicepresidencia", "Mateo Inventado Prueba", "vicepresidencia@example.org", "600 000 002", "2024-03-16"],
      ["Secretaría", "Carmen Demo Muestra", "secretaria@example.org", "600 000 003", "2024-03-16"],
      ["Tesorería", "Javier Supuesto Modelo", "tesoreria@example.org", "600 000 004", "2024-03-16"],
      ["Vocalía", "Nora Imaginaria Caso", "vocal1@example.org", "600 000 005", "2025-03-15"],
    ];
    doc.junta = junta.map(function (j, i) {
      return { id: "demo-junta-" + (i + 1), cargo: j[0], cargoOtro: "", nombre: j[1], email: j[2], telefono: j[3],
        desde: j[4], hasta: "", creado: t, modificado: t };
    });
    // Una persona que ya salió de la junta, para que se vea el histórico.
    doc.junta.push({ id: "demo-junta-6", cargo: "Tesorería", cargoOtro: "", nombre: "Pablo Antiguo Ejemplo",
      email: "antiguo@example.org", telefono: "600 000 006", desde: "2020-03-14", hasta: "2024-03-16", creado: t, modificado: t });
    return doc;
  }

  return { documentoDemo: documentoDemo };
});

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
  // Las cuotas de demostración se calculan con la misma lógica que las de verdad.
  modulo.Cuotas = typeof require === "function" ? require("../logica/cuotas.js") : raiz.WA.Cuotas;
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
    rellenarSocios(doc, t);
    return doc;
  }

  /*
   * Socios y cuotas de demostración. Se generan siempre iguales (sin azar) a
   * partir de listas de nombres y apellidos corrientes combinados: no
   * corresponden a nadie. Sin documentos de identidad ni IBAN reales.
   */
  var NOMBRES = ["Lucía", "Hugo", "Martina", "Mateo", "Sofía", "Leo", "Julia", "Daniel", "Paula", "Pablo", "Valeria", "Álvaro",
    "Emma", "Manuel", "Daniela", "Adrián", "Carla", "Enzo", "Alba", "Mario", "Noa", "Diego", "Sara", "Marcos", "Carmen",
    "Javier", "Elena", "Iker", "Irene", "Bruno", "Lola", "Óscar", "Vega", "Rubén", "Nerea", "Gonzalo", "Aitana", "Íñigo", "Olivia", "Jorge"];
  var APELLIDOS = ["Ficticio", "Ejemplo", "Inventado", "Muestra", "Prueba", "Supuesto", "Modelo", "Demo", "Ensayo", "Simulado"];
  var VIAS = [["Calle", "del Olmo"], ["Avenida", "de los Pinos"], ["Plaza", "Mayor"], ["Calle", "de la Fuente"], ["Paseo", "del Río"]];
  var FORMAS = ["Transferencia", "Transferencia", "Transferencia", "Bizum", "Efectivo", "Domiciliación"];

  function rellenarSocios(doc, t) {
    doc.config.tiposSocio = [
      { id: "socio", nombre: "Socio", cuota: 3000, periodicidad: "anual", activo: true },
      { id: "juvenil", nombre: "Juvenil", cuota: 1500, periodicidad: "anual", activo: true },
      { id: "honorario", nombre: "Honorario", cuota: 0, periodicidad: "anual", activo: true },
    ];
    var dos = function (n) { return String(n).padStart(2, "0"); };
    var socios = [];
    for (var i = 0; i < 40; i++) {
      var n = i + 1;
      var joven = i % 9 === 4;                        // algunos socios juveniles
      var menor = i % 9 === 4 && i % 2 === 0;         // y alguno de ellos menor de edad
      var anioNac = menor ? 2012 + (i % 3) : joven ? 2003 + (i % 4) : 1955 + ((i * 7) % 45);
      var via = VIAS[i % VIAS.length];
      var forma = FORMAS[i % FORMAS.length];
      var alta = (2016 + (i % 10)) + "-" + dos(1 + (i * 5) % 12) + "-" + dos(1 + (i * 3) % 27);
      var s = {
        id: "demo-socio-" + n, numero: n,
        nombre: NOMBRES[i], apellidos: APELLIDOS[i % 10] + " " + APELLIDOS[(i * 3 + 1) % 10],
        tipoDocumento: "DNI", documento: "", fechaNacimiento: anioNac + "-" + dos(1 + (i % 12)) + "-" + dos(1 + (i * 2) % 28),
        sexo: i % 2 ? "Hombre" : "Mujer", ocupacion: "",
        email: "socio" + n + "@example.org", telefono: "600 000 " + String(100 + n), telefono2: "",
        direccion: { tipoVia: via[0], nombreVia: via[1], numero: String(1 + (i * 7) % 60), km: "", bloque: "", portal: "",
          escalera: "", planta: String(1 + (i % 6)), puerta: "ABCD"[i % 4], complemento: "",
          codigoPostal: "28000", municipio: "Villaejemplo", provincia: "Madrid" },
        tipoSocioId: i === 0 ? "honorario" : joven ? "juvenil" : "socio", exentoCuota: false, formaPago: forma,
        iban: forma === "Domiciliación" ? "ES9121000418450200051332" : "", titularCuenta: "",
        mandatoReferencia: forma === "Domiciliación" ? "DEMO-" + n : "", mandatoFecha: forma === "Domiciliación" ? alta : "",
        tutor: menor ? { nombre: "Madre o padre de " + NOMBRES[i], documento: "", telefono: "600 000 " + String(300 + n), email: "tutor" + n + "@example.org", relacion: "Madre" }
          : { nombre: "", documento: "", telefono: "", email: "", relacion: "" },
        consentimientos: { proteccionDatos: alta, imagen: i % 3 !== 0, comunicaciones: i % 4 !== 0 },
        fechaAlta: alta, fechaBaja: "", motivoBaja: "", notas: "", creado: t, modificado: t,
      };
      if (i % 13 === 7) { s.fechaBaja = "2025-" + dos(3 + (i % 8)) + "-15"; s.motivoBaja = "Voluntaria"; }
      socios.push(s);
    }
    doc.socios = socios;
    doc.config.siguienteNumeroSocio = socios.length + 1;

    // Cuotas 2025 (casi todas cobradas) y 2026 (la mitad pendiente).
    var Cuotas = Demo.Cuotas;
    var cuotas = [];
    [["2025", "2025-01-15", 0.9], ["2026", "2026-01-15", 0.5]].forEach(function (p, k) {
      var remesaId = "demo-remesa-" + p[0];
      var r = Cuotas.generar({ periodo: p[0], socios: socios, tipos: doc.config.tiposSocio, cuotas: [], fechaEmision: p[1], remesaId: remesaId });
      r.nuevas.forEach(function (c, j) {
        c.id = "demo-cuota-" + p[0] + "-" + c.socioNumero;
        c.creado = t; c.modificado = t;
        var socio = socios[c.socioNumero - 1];
        if ((j * 37 % 100) / 100 < p[2]) {
          var forma = socio.formaPago;
          c = Cuotas.registrarPago(c, { fecha: p[0] + "-" + dos(2 + (j % 4)) + "-" + dos(1 + (j * 3) % 27), forma: forma,
            cuentaId: forma === "Efectivo" ? "caja" : "banco", referencia: "" });
        }
        cuotas.push(c);
      });
      doc.remesas.push({ id: remesaId, periodo: p[0], fechaEmision: p[1], concepto: "Cuotas " + p[0],
        nCuotas: r.nuevas.length, total: r.total, creado: t, modificado: t });
    });
    doc.cuotas = cuotas;
  }

  var Demo = { documentoDemo: documentoDemo, Cuotas: null };
  return Demo;
});

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
    rellenarTesoreria(doc, t);
    return doc;
  }

  /*
   * Tesorería de demostración (2026): cuentas con saldo inicial, movimientos
   * manuales y otros «importados del banco» sin clasificar, facturas emitidas y
   * recibidas (una con retención), un anticipo, un reembolso, un proyecto con
   * subvención y el presupuesto anual. Terceros y NIF inventados.
   */
  function rellenarTesoreria(doc, t) {
    var cfg = doc.config;
    cfg.cuentas = [
      { id: "banco", nombre: "Cuenta corriente (Banco Ejemplo)", tipo: "banco", iban: "ES9121000418450200051332", saldoInicial: 125000, fechaSaldoInicial: "2025-01-01" },
      { id: "caja", nombre: "Caja (efectivo)", tipo: "caja", iban: "", saldoInicial: 8000, fechaSaldoInicial: "2025-01-01" },
    ];
    cfg.iva = { presenta: true, prorrata: 100, saldoACompensarInicial: 0, periodoSaldoInicial: "", devolucionesSolicitadas: [] };
    cfg.facturacion = { serie: "", motivoExencion: "", condicionesPago: "Transferencia a la cuenta ES91 2100 0418 4502 0005 1332 en 30 días.", pie: "Asociación inscrita en el registro de ejemplo." };
    cfg.reglas = [{ texto: "comision", categoriaId: "banco" }, { texto: "seguro", categoriaId: "seguros" }];
    cfg.presupuestos = { "2026": { cuotas: 105000, donaciones: 30000, subvenciones: 150000, inscripciones: 40000, servicios: 60000,
      actividades: 120000, material: 40000, seguros: 18000, banco: 3000, web: 6000, difusion: 15000, profesionales: 30000 } };
    var reg = function (o) { return Object.assign({ creado: t, modificado: t }, o); };
    var mov = function (id, fecha, cuentaId, tipo, importe, concepto, categoriaId, extra) {
      return reg(Object.assign({ id: "demo-mov-" + id, fecha: fecha, cuentaId: cuentaId, tipo: tipo, importe: importe, concepto: concepto,
        categoriaId: categoriaId || "", proyectoId: "", cuentaDestinoId: "", sentido: "", anticipoId: "", facturaId: "", cuotaIds: [],
        origen: "manual", conceptoBanco: "", notas: "" }, extra || {}));
    };
    doc.proyectos = [reg({ id: "demo-proyecto-1", nombre: "Taller de ciencia en el barrio", tipo: "subvencion", financiador: "Ayuntamiento de Villaejemplo",
      referencia: "Convocatoria de ejemplo 2026", importeConcedido: 150000, fechaInicio: "2026-03-01", fechaFin: "2026-12-31", estado: "en curso",
      presupuesto: { actividades: 80000, material: 30000, difusion: 10000, profesionales: 30000 }, notas: "" })];
    var linea = function (concepto, cantidad, precio, tratamiento, tipoIva) { return { concepto: concepto, cantidad: cantidad, precio: precio, tratamiento: tratamiento, tipoIva: tipoIva }; };
    doc.facturas = [
      reg({ id: "demo-fac-e1", tipo: "emitida", estado: "emitida", serie: "", numero: "2026-0001", fecha: "2026-02-20", fechaOperacion: "", vencimiento: "2026-03-22",
        tercero: { nombre: "Colegio Público de Ejemplo", nif: "P0000000J", direccion: "Calle de la Escuela, 2, 28000 Villaejemplo", email: "colegio@example.org" },
        lineas: [linea("Taller de observación de aves (2 sesiones)", 2, 15000, "sujeto", 21)], retencionPct: 0, deducible: true,
        motivoExencion: "", categoriaId: "servicios", proyectoId: "", notas: "" }),
      reg({ id: "demo-fac-e2", tipo: "emitida", estado: "emitida", serie: "", numero: "2026-0002", fecha: "2026-05-12", fechaOperacion: "", vencimiento: "2026-06-11",
        tercero: { nombre: "Empresa Ejemplo, S.L.", nif: "B00000000", direccion: "Avenida del Comercio, 10, 28000 Villaejemplo", email: "empresa@example.org" },
        lineas: [linea("Charla divulgativa para su plantilla", 1, 25000, "sujeto", 21), linea("Láminas ilustradas", 10, 800, "sujeto", 21)],
        retencionPct: 0, deducible: true, motivoExencion: "", categoriaId: "servicios", proyectoId: "", notas: "" }),
      reg({ id: "demo-fac-r1", tipo: "recibida", estado: "emitida", serie: "", numero: "IMP-0457", fecha: "2026-03-10", fechaOperacion: "", vencimiento: "",
        tercero: { nombre: "Imprenta Ejemplo, S.L.", nif: "B00000000", direccion: "", email: "imprenta@example.org" },
        lineas: [linea("Carteles y folletos del taller", 1, 18000, "sujeto", 21)], retencionPct: 0, deducible: true,
        motivoExencion: "", categoriaId: "difusion", proyectoId: "demo-proyecto-1", notas: "" }),
      reg({ id: "demo-fac-r2", tipo: "recibida", estado: "emitida", serie: "", numero: "2026/12", fecha: "2026-04-18", fechaOperacion: "", vencimiento: "",
        tercero: { nombre: "Ponente Ficticio Ejemplo", nif: "00000000T", direccion: "", email: "ponente@example.org" },
        lineas: [linea("Charla «Aves de ribera»", 1, 20000, "sujeto", 21)], retencionPct: 15, deducible: true,
        motivoExencion: "", categoriaId: "profesionales", proyectoId: "demo-proyecto-1", notas: "" }),
      reg({ id: "demo-fac-r3", tipo: "recibida", estado: "emitida", serie: "", numero: "T-2026-889", fecha: "2026-06-03", fechaOperacion: "", vencimiento: "",
        tercero: { nombre: "Tienda de Material Ejemplo", nif: "B00000000", direccion: "", email: "" },
        lineas: [linea("Prismáticos para préstamo", 4, 4500, "sujeto", 21)], retencionPct: 0, deducible: true,
        motivoExencion: "", categoriaId: "material", proyectoId: "demo-proyecto-1", notas: "" }),
    ];
    doc.anticipos = [
      reg({ id: "demo-ant-1", tipo: "anticipo", persona: "Javier Supuesto Modelo", socioId: "", fecha: "2026-04-02", concepto: "Compras para la salida de campo", proyectoId: "demo-proyecto-1",
        gastos: [{ id: "g1", fecha: "2026-04-05", concepto: "Bocadillos y agua", importe: 6240, categoriaId: "actividades", proyectoId: "demo-proyecto-1", justificante: "Ticket supermercado", facturaId: "" },
          { id: "g2", fecha: "2026-04-05", concepto: "Material de dibujo", importe: 2380, categoriaId: "material", proyectoId: "demo-proyecto-1", justificante: "Ticket papelería", facturaId: "" }],
        cerrado: false, notas: "" }),
      reg({ id: "demo-ant-2", tipo: "reembolso", persona: "Carmen Demo Muestra", socioId: "", fecha: "2026-05-20", concepto: "Sellos y envíos de la convocatoria", proyectoId: "",
        gastos: [{ id: "g3", fecha: "2026-05-18", concepto: "Correos: envío de convocatorias", importe: 1850, categoriaId: "administracion", proyectoId: "", justificante: "Ticket Correos", facturaId: "" }],
        cerrado: false, notas: "" }),
    ];
    doc.movimientos = [
      mov(1, "2026-01-31", "banco", "gasto", 300, "Comisión de mantenimiento", "banco", { origen: "extracto", conceptoBanco: "COMISION MANTENIMIENTO" }),
      mov(2, "2026-02-14", "banco", "ingreso", 5000, "Donación de un socio", "donaciones"),
      mov(3, "2026-02-28", "banco", "gasto", 300, "Comisión de mantenimiento", "banco", { origen: "extracto", conceptoBanco: "COMISION MANTENIMIENTO" }),
      mov(4, "2026-03-05", "banco", "gasto", 18000, "Seguro de responsabilidad civil", "seguros", { origen: "extracto", conceptoBanco: "RECIBO SEGURO RC ASEGURADORA EJEMPLO" }),
      mov(5, "2026-03-15", "banco", "ingreso", 36300, "Cobro factura 2026-0001", "servicios", { facturaId: "demo-fac-e1", origen: "extracto", conceptoBanco: "TRANSF COLEGIO PUBLICO DE EJEMPLO FRA 2026-0001" }),
      mov(6, "2026-03-20", "banco", "gasto", 21780, "Pago imprenta", "difusion", { facturaId: "demo-fac-r1", proyectoId: "demo-proyecto-1" }),
      mov(7, "2026-04-02", "banco", "traspaso", 10000, "Dinero a caja", "", { cuentaDestinoId: "caja" }),
      mov(8, "2026-04-02", "caja", "anticipo", 10000, "Anticipo para la salida de campo", "", { sentido: "salida", anticipoId: "demo-ant-1" }),
      mov(9, "2026-04-10", "caja", "anticipo", 1380, "Devolución del sobrante del anticipo", "", { sentido: "entrada", anticipoId: "demo-ant-1" }),
      mov(10, "2026-04-30", "banco", "gasto", 21200, "Pago ponente (neto de retención)", "profesionales", { facturaId: "demo-fac-r2", proyectoId: "demo-proyecto-1" }),
      mov(11, "2026-04-30", "banco", "ingreso", 75000, "Subvención: primer pago", "subvenciones", { proyectoId: "demo-proyecto-1", origen: "extracto", conceptoBanco: "TRANSF AYUNTAMIENTO DE VILLAEJEMPLO SUBV" }),
      mov(12, "2026-05-15", "caja", "ingreso", 12000, "Inscripciones salida de campo", "inscripciones"),
      mov(13, "2026-06-10", "banco", "gasto", 1200, "", "", { origen: "extracto", conceptoBanco: "CARGO DOMINIO WEB EJEMPLO" }),
      mov(14, "2026-06-12", "banco", "ingreso", 2000, "", "", { origen: "extracto", conceptoBanco: "BIZUM DE PERSONA ANONIMA DONATIVO" }),
    ];
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

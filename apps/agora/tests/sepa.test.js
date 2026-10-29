// Remesas SEPA (pain.008) y cuotas prorrateadas.
const test = require("node:test");
const assert = require("node:assert/strict");
const Sepa = require("../src/js/logica/sepa.js");
const Cuotas = require("../src/js/logica/cuotas.js");

// IBAN de ejemplo con los dígitos de control bien (no son cuentas de nadie)
const IBAN_A = "ES9121000418450200051332";
const IBAN_B = "ES7921000813610123456789";

test("identificador de acreedor: se calcula del NIF y se comprueba", () => {
  assert.equal(Sepa.validarIdentificador("DE98ZZZ09999999999").valido, true, "el de prueba oficial alemán");
  const id = Sepa.identificadorAcreedor("G12345678");
  assert.match(id, /^ES\d{2}000G12345678$/);
  assert.equal(Sepa.validarIdentificador(id).valido, true);
  assert.equal(Sepa.validarIdentificador(id.replace(/^ES\d\d/, "ES00")).valido, false);
  assert.equal(Sepa.validarIdentificador("").valido, false);
});

test("los textos pasan al juego de caracteres de SEPA", () => {
  assert.equal(Sepa.texto("Peña «Ñandú» & Cía. nº 3"), "Pena Nandu + Cia. n. 3");
  assert.equal(Sepa.texto("x".repeat(80), 70).length, 70);
});

const socios = [
  { id: "a", numero: 1, nombre: "Ana", apellidos: "Pérez", formaPago: "Domiciliación", iban: IBAN_A, mandatoReferencia: "ABIES-0001", mandatoFecha: "2025-01-15" },
  { id: "b", numero: 2, nombre: "Luis", apellidos: "Gómez", formaPago: "Domiciliación", iban: IBAN_B, mandatoReferencia: "", mandatoFecha: "" },
  { id: "c", numero: 3, nombre: "Eva", apellidos: "Ruiz", formaPago: "Transferencia", iban: "" },
  { id: "d", numero: 4, nombre: "Íñigo", apellidos: "Muñoz", formaPago: "Domiciliación", iban: IBAN_B, titularCuenta: "Íñigo Muñoz Sáez", mandatoReferencia: "ABIES-0004", mandatoFecha: "2026-01-01" },
];
const cuota = (id, socioId, numero, importe, estado) => ({ id, socioId, socioNumero: numero, importe, estado: estado || "pendiente", concepto: "Cuota socio · año 2026" });
const cuotas = [cuota("q-a", "a", 1, 2500), cuota("q-b", "b", 2, 2500), cuota("q-c", "c", 3, 2500), cuota("q-d", "d", 4, 1250), cuota("q-x", "a", 1, 2500, "pagada")];

test("entran las pendientes de quien domicilia con IBAN y mandato; el resto, con su motivo", () => {
  const r = Sepa.seleccionar(cuotas, socios, "2026-11-05");
  assert.deepEqual(r.incluidas.map((x) => x.cuota.id), ["q-a", "q-d"]);
  assert.equal(r.total, 3750);
  assert.deepEqual(r.excluidas.map((x) => x.motivo).sort(), ["noDomicilia", "sinMandato"]);
  const antes = Sepa.seleccionar(cuotas, socios, "2025-12-01");
  assert.ok(antes.excluidas.some((x) => x.motivo === "mandatoPosterior"), "un mandato firmado después del cobro no vale");
});

test("revisar dice qué falta antes de hacer el fichero", () => {
  const r = Sepa.seleccionar(cuotas, socios, "2026-11-05");
  const mal = Sepa.revisar({ asociacion: { nombre: "ABIES", iban: "" }, fechaCobro: "2026-10-01", hoy: "2026-10-29", incluidas: r.incluidas });
  assert.equal(mal.length, 3, mal.join(" | "));
  const bien = Sepa.revisar({ asociacion: { nombre: "ABIES", iban: IBAN_A, identificadorAcreedor: Sepa.identificadorAcreedor("G12345678") },
    fechaCobro: "2026-11-05", hoy: "2026-10-29", incluidas: r.incluidas });
  assert.deepEqual(bien, []);
});

test("el fichero pain.008 lleva la cabecera, el acreedor y un recibo por cuota", () => {
  const r = Sepa.seleccionar(cuotas, socios, "2026-11-05");
  const x = Sepa.fichero({ asociacion: { nombre: "Asociación ABIES", iban: IBAN_A, identificadorAcreedor: Sepa.identificadorAcreedor("G12345678") },
    incluidas: r.incluidas, fechaCobro: "2026-11-05", ahora: new Date("2026-10-29T10:00:00Z") });
  assert.match(x, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(x, /urn:iso:std:iso:20022:tech:xsd:pain\.008\.001\.02/);
  assert.match(x, /<NbOfTxs>2<\/NbOfTxs><CtrlSum>37\.50<\/CtrlSum>/);
  assert.match(x, /<SeqTp>RCUR<\/SeqTp><\/PmtTpInf><ReqdColltnDt>2026-11-05<\/ReqdColltnDt>/);
  assert.match(x, /<Cdtr><Nm>Asociacion ABIES<\/Nm><\/Cdtr>/);
  assert.match(x, /<InstdAmt Ccy="EUR">12\.50<\/InstdAmt>.*<MndtId>ABIES-0004<\/MndtId><DtOfSgntr>2026-01-01<\/DtOfSgntr>/);
  assert.match(x, /<Dbtr><Nm>Inigo Munoz Saez<\/Nm><\/Dbtr>/, "el titular de la cuenta, sin tildes");
  assert.match(x, /<Ustrd>Cuota socio ejercicio 2026<\/Ustrd>/, "«año» no se queda en «ano»");
  assert.equal((x.match(/<DrctDbtTxInf>/g) || []).length, 2);
  assert.match(x, /<CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED<\/Id><\/Othr><\/FinInstnId><\/CdtrAgt>/, "sin BIC, NOTPROVIDED");
  // Cada etiqueta cierra en su sitio
  const pila = [];
  for (const m of x.matchAll(/<(\/?)([A-Za-z]+)[^>]*>/g)) {
    if (!m[1]) pila.push(m[2]);
    else assert.equal(pila.pop(), m[2], "</" + m[2] + "> fuera de sitio");
  }
  assert.deepEqual(pila, []);
});

test("prorrateo: quien entra a mitad de año paga los meses que le tocan, contando el del alta", () => {
  const tipos = [{ id: "socio", nombre: "Socio", cuota: 2400, periodicidad: "anual", activo: true }];
  const ss = [{ id: "x", numero: 1, nombre: "Ana", tipoSocioId: "socio", fechaAlta: "2020-01-01" },
    { id: "y", numero: 2, nombre: "Luis", tipoSocioId: "socio", fechaAlta: "2026-10-15" }];
  const sin = Cuotas.generar({ periodo: "2026", socios: ss, tipos });
  assert.deepEqual(sin.nuevas.map((c) => c.importe), [2400, 2400]);
  const con = Cuotas.generar({ periodo: "2026", socios: ss, tipos, prorratear: true });
  assert.deepEqual(con.nuevas.map((c) => c.importe), [2400, 600]);
  assert.match(con.nuevas[1].concepto, /\(3 de 12 meses\)/);
  assert.deepEqual(Cuotas.mesesDesde(Cuotas.periodo("2026-T4"), "2026-11-20"), { meses: 2, de: 3 });
});

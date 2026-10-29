// Tests de fechas y de las comprobaciones de formato (NIF, IBAN, correo, CP).
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../src/js/nucleo/fechas.js");
const V = require("../src/js/nucleo/validar.js");

test("fechas ISO: válidas, inválidas y bisiestos", () => {
  assert.ok(F.esValida("2026-10-01"));
  assert.ok(F.esValida("2028-02-29"));
  assert.ok(!F.esValida("2026-02-29"));
  assert.ok(!F.esValida("2026-13-01"));
  assert.ok(!F.esValida("01/10/2026"));
  assert.ok(!F.esValida(""));
});

test("fechas: formatos para enseñar", () => {
  assert.equal(F.corta("2026-10-01"), "01/10/2026");
  assert.equal(F.larga("2026-10-01"), "1 de octubre de 2026");
  assert.equal(F.corta("mal"), "");
});

test("fechas: leer lo que escribe una persona", () => {
  assert.equal(F.desdeTexto("1/10/2026"), "2026-10-01");
  assert.equal(F.desdeTexto("01-10-26"), "2026-10-01");
  assert.equal(F.desdeTexto("2026-10-01"), "2026-10-01");
  assert.equal(F.desdeTexto("31/02/2026"), null);
});

test("fechas: días entre fechas sin que moleste el cambio de hora", () => {
  assert.equal(F.diasEntre("2026-03-28", "2026-03-30"), 2); // cruza el cambio de hora de marzo
  assert.equal(F.diasEntre("2026-10-24", "2026-10-26"), 2); // y el de octubre
  assert.equal(F.diasEntre("2026-12-31", "2026-01-01"), -364);
  assert.equal(F.sumarDias("2026-12-31", 1), "2027-01-01");
});

test("NIF de persona (DNI y NIE)", () => {
  assert.ok(V.nifPersona("12345678Z").valido);
  assert.ok(V.nifPersona("12345678-z").valido);
  assert.ok(!V.nifPersona("12345678A").valido);
  assert.ok(V.nifPersona("X1234567L").valido);
  assert.ok(!V.nifPersona("X1234567A").valido);
  assert.ok(!V.nifPersona("").valido);
});

test("NIF de entidad (asociaciones: G…)", () => {
  // G + 1234567: control 4 (o la letra D). Calculado a mano en el comentario de validar.js.
  assert.ok(V.nifEntidad("G12345674").valido);
  assert.ok(V.nifEntidad("G1234567D").valido);
  assert.ok(V.nifEntidad("g-1234567-4").valido);
  assert.ok(!V.nifEntidad("G12345675").valido);
  assert.ok(V.nifEntidad("G00000000").valido); // el de la demostración
  // Tipos que solo admiten letra (P) o solo número (A).
  assert.ok(V.nifEntidad("P1234567D").valido);
  assert.ok(!V.nifEntidad("P12345674").valido);
  assert.ok(V.nifEntidad("A12345674").valido);
  assert.ok(!V.nifEntidad("A1234567D").valido);
  assert.ok(!V.nifEntidad("12345678Z").valido);
});

test("IBAN", () => {
  assert.ok(V.iban("ES91 2100 0418 4502 0005 1332").valido);
  assert.ok(V.iban("es9121000418450200051332").valido);
  assert.ok(!V.iban("ES9121000418450200051333").valido);
  assert.ok(!V.iban("ES91210004184502").valido);
  assert.ok(V.iban("DE89 3704 0044 0532 0130 00").valido);
});

test("correo y código postal", () => {
  assert.ok(V.email("junta@example.org").valido);
  assert.ok(!V.email("junta@example").valido);
  assert.ok(!V.email("sin arroba").valido);
  assert.ok(V.codigoPostal("28013").valido);
  assert.ok(V.codigoPostal("01001").valido);
  assert.ok(!V.codigoPostal("53000").valido);
  assert.ok(!V.codigoPostal("2801").valido);
});

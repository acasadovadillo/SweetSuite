// Convocatorias: el texto, a quién va, el correo, el calendario y el acta.
const test = require("node:test");
const assert = require("node:assert/strict");
const Conv = require("../src/js/logica/convocatorias.js");
const Actas = require("../src/js/logica/actas.js");

const [junta, , asamblea] = Actas.organosPorDefecto();
const AHORA = new Date("2026-10-29T10:00:00Z");

test("una convocatoria nueva: en quince días, con el orden del día de su órgano", () => {
  const c = Conv.vacia(asamblea, AHORA);
  assert.equal(c.fecha, "2026-11-13");
  assert.equal(c.horaSegunda, "18:30", "la asamblea, con segunda convocatoria");
  assert.equal(Conv.vacia(junta, AHORA).horaSegunda, "");
  assert.ok(c.ordenDelDia.some((x) => /cuentas/.test(x)));
  assert.ok(Conv.revisar(c).some((p) => /lugar/.test(p)));
  assert.ok(Conv.revisar(c).some((p) => /convoca/.test(p)));
  assert.deepEqual(Conv.revisar(Object.assign(c, { lugar: "Centro cívico", convoca: "La Presidencia" })), []);
  assert.ok(Conv.revisar(Object.assign({}, c, { modalidad: "en línea", lugar: "" })).some((p) => /enlace/.test(p)));
});

test("el texto dice cuándo, dónde, el orden del día y quién convoca", () => {
  const c = Object.assign(Conv.vacia(asamblea, AHORA), { lugar: "Centro cívico, sala 2", convoca: "La Presidencia, Ana Pérez",
    ordenDelDia: ["Cuentas de 2026", "", "Ruegos y preguntas"] });
  const t = Conv.texto(c, asamblea, { nombre: "ABIES" });
  assert.match(t, /^ABIES\n/);
  assert.match(t, /reunión ordinaria de Asamblea General, que se celebrará el 13 de noviembre de 2026 a las 18:00 horas en primera convocatoria y a las 18:30 en segunda, en Centro cívico, sala 2\./);
  assert.match(t, /ORDEN DEL DÍA\n1\. Cuentas de 2026\n2\. Ruegos y preguntas/);
  assert.match(t, /La Presidencia, Ana Pérez\n$/);
  assert.equal(Conv.asunto(c, asamblea), "Convocatoria: Asamblea General ordinaria · 13 de noviembre de 2026");
});

test("la asamblea va a los socios activos; la junta, a la junta vigente", () => {
  const c = Object.assign(Conv.vacia(asamblea, AHORA));
  const socios = [
    { id: "a", nombre: "Ana", apellidos: "Pérez", email: "ana@example.org", fechaAlta: "2020-01-01" },
    { id: "b", nombre: "Luis", apellidos: "Gómez", email: "", fechaAlta: "2020-01-01" },
    { id: "c", nombre: "Eva", apellidos: "Ruiz", email: "eva@example.org", fechaAlta: "2020-01-01", fechaBaja: "2025-01-01" },
    { id: "d", nombre: "Otra", apellidos: "Ana", email: "ANA@example.org", fechaAlta: "2020-01-01" },
  ];
  const d = Conv.destinatarios(c, asamblea, socios, []);
  assert.deepEqual(d.correos, ["ana@example.org"], "sin bajas ni repetidos");
  assert.deepEqual(d.sinCorreo, ["Luis Gómez"]);
  const jd = [{ nombre: "Presi", email: "p@example.org", desde: "2024-01-01" }, { nombre: "Antiguo", email: "x@example.org", desde: "2020-01-01", hasta: "2023-12-31" }];
  assert.deepEqual(Conv.destinatarios(Conv.vacia(junta, AHORA), junta, socios, jd).correos, ["p@example.org"]);
});

test("el correo lleva los destinatarios en copia oculta, salvo que sean demasiados", () => {
  const corto = Conv.mailto("Asunto", "Cuerpo", ["a@example.org", "b@example.org"]);
  assert.equal(corto.conDestinatarios, true);
  assert.match(corto.url, /^mailto:\?bcc=a%40example\.org,b%40example\.org&subject=Asunto&body=Cuerpo$/);
  const muchos = Array.from({ length: 200 }, (_, i) => "socio" + i + "@example.org");
  const largo = Conv.mailto("Asunto", "Cuerpo", muchos);
  assert.equal(largo.conDestinatarios, false);
  assert.ok(largo.url.length <= Conv.LARGO_MAXIMO);
});

test("de la convocatoria salen el evento del calendario y el borrador del acta", () => {
  const c = Object.assign(Conv.vacia(junta, AHORA), { id: "c1", lugar: "Local", ordenDelDia: ["Tesorería", "Varios"] });
  const e = Conv.aEvento(c, junta);
  assert.equal(e.inicio, "2026-11-13T18:00");
  assert.equal(e.fin, "2026-11-13T20:00");
  assert.match(e.descripcion, /1\. Tesorería\n2\. Varios/);
  const a = Conv.aActa(c, junta);
  assert.equal(a.convocatoriaId, "c1");
  assert.equal(a.fecha, "2026-11-13");
  assert.deepEqual(a.ordenDelDia.map((p) => p.titulo), ["Tesorería", "Varios"]);
  assert.equal(a.estado, "borrador");
});

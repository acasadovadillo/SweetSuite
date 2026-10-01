// Tests de la lógica de socios. Todos los datos son inventados.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/js/logica/socios.js");
const CSV = require("../src/js/nucleo/csv.js");

const socio = (o) => S.completar(Object.assign({ fechaAlta: "2024-01-15" }, o));

test("estado: activo, baja y alta futura", () => {
  assert.equal(S.estado(socio({}), "2026-10-01"), "activo");
  assert.equal(S.estado(socio({ fechaBaja: "2026-03-01" }), "2026-10-01"), "baja");
  assert.equal(S.estado(socio({ fechaBaja: "2026-12-01" }), "2026-10-01"), "activo");
  assert.equal(S.estado(socio({ fechaAlta: "2027-01-01" }), "2026-10-01"), "futuro");
  assert.ok(S.activoEn(socio({ fechaBaja: "2026-03-01" }), "2026-02-28"));
  assert.ok(!S.activoEn(socio({ fechaBaja: "2026-03-01" }), "2026-03-01"));
});

test("edad y minoría de edad (el día del cumpleaños cuenta)", () => {
  assert.equal(S.edad("2008-10-01", "2026-10-01"), 18);
  assert.equal(S.edad("2008-10-02", "2026-10-01"), 17);
  assert.equal(S.edad("", "2026-10-01"), null);
  assert.ok(S.esMenor(socio({ fechaNacimiento: "2010-05-05" }), "2026-10-01"));
  assert.ok(!S.esMenor(socio({ fechaNacimiento: "" }), "2026-10-01"));
});

test("el número de socio nunca se reutiliza", () => {
  assert.equal(S.siguienteNumero([], 1), 1);
  assert.equal(S.siguienteNumero([{ numero: 3 }, { numero: 7 }], 1), 8);
  // Se borró el 8: el contador guardado impide volver a darlo.
  assert.equal(S.siguienteNumero([{ numero: 3 }, { numero: 7 }], 9), 9);
});

test("nombres", () => {
  assert.equal(S.nombreCompleto({ nombre: " Ana ", apellidos: "Pérez Ejemplo" }), "Ana Pérez Ejemplo");
  assert.equal(S.nombreListado({ nombre: "Ana", apellidos: "Pérez" }), "Pérez, Ana");
  assert.equal(S.nombreListado({ nombre: "Ana", apellidos: "" }), "Ana");
});

test("filtrar: texto sin tildes, estado, tipo y orden", () => {
  const lista = [
    socio({ id: "a", numero: 2, nombre: "Íñigo", apellidos: "Zubieta", email: "i@example.org", tipoSocioId: "juvenil" }),
    socio({ id: "b", numero: 1, nombre: "Ana", apellidos: "Martín", direccion: { municipio: "Villaejemplo" }, tipoSocioId: "socio" }),
    socio({ id: "c", numero: 3, nombre: "Luis", apellidos: "Abad", fechaBaja: "2025-01-01", tipoSocioId: "socio" }),
  ];
  const ids = (l) => l.map((s) => s.id);
  assert.deepEqual(ids(S.filtrar(lista, { texto: "inigo", hoy: "2026-10-01" })), ["a"]);
  assert.deepEqual(ids(S.filtrar(lista, { texto: "villaejemplo", hoy: "2026-10-01" })), ["b"]);
  assert.deepEqual(ids(S.filtrar(lista, { estado: "activo", hoy: "2026-10-01" })), ["b", "a"]);
  assert.deepEqual(ids(S.filtrar(lista, { estado: "baja", hoy: "2026-10-01" })), ["c"]);
  assert.deepEqual(ids(S.filtrar(lista, { tipoSocioId: "socio", orden: "nombre" })), ["c", "b"]);
  assert.deepEqual(ids(S.filtrar(lista, { texto: "ana martin" })), ["b"]);
});

test("revisar: errores que impiden guardar y avisos que no", () => {
  const r1 = S.revisar(socio({ nombre: "", fechaAlta: "" }), [], "2026-10-01");
  assert.ok(r1.errores.nombre && r1.errores.fechaAlta);
  const r2 = S.revisar(socio({ nombre: "Ana", fechaAlta: "2026-01-01", fechaBaja: "2025-01-01" }), [], "2026-10-01");
  assert.ok(r2.errores.fechaBaja);
  const r3 = S.revisar(socio({ nombre: "Ana", documento: "12345678A", email: "mal", formaPago: "Domiciliación" }), [], "2026-10-01");
  assert.deepEqual(Object.keys(r3.errores), []);
  assert.ok(r3.avisos.documento && r3.avisos.email && r3.avisos.iban);
  const menor = S.revisar(socio({ nombre: "Leo", fechaNacimiento: "2015-01-01" }), [], "2026-10-01");
  assert.ok(menor.avisos.tutorNombre);
});

test("revisar detecta duplicados por documento o correo", () => {
  const otros = [socio({ id: "x", numero: 5, documento: "12345678Z", email: "Ana@Example.org" })];
  const r = S.revisar(socio({ id: "y", nombre: "Ana", documento: "12345678-z", email: "ana@example.org" }), otros);
  assert.match(r.avisos.documento, /n\.º 5/);
  assert.match(r.avisos.email, /n\.º 5/);
  // Él mismo no cuenta como duplicado.
  assert.deepEqual(S.revisar(otros[0], otros).avisos.documento, undefined);
});

test("importar desde CSV con columnas en cualquier orden y nombres variados", () => {
  const texto = "Nº;Apellidos y nombre;DNI;E-mail;Móvil;Dirección;C.P.;Localidad;Fecha de alta;Tipo;Forma de pago\n" +
    "4;Ejemplo Prueba, Marta;12345678z;marta@example.org;'+34 600 000 111;C/ Mayor, 3, 2º B;29001;Villaejemplo;15/03/2024;Juvenil;bizum\n" +
    ";Sin Fecha, Pedro;;;;;;;;Inventado;\n" +
    ";;;;;;;;;;\n" +
    "x;;;solo@example.org;;;;;;;\n";
  const tipos = [{ id: "socio", nombre: "Socio" }, { id: "juv", nombre: "Juvenil" }];
  const r = S.desdeCSV(CSV.leer(texto), tipos, "2026-10-01");
  assert.equal(r.socios.length, 2);
  const m = r.socios[0];
  assert.deepEqual([m.numero, m.nombre, m.apellidos, m.documento, m.tipoDocumento], [4, "Marta", "Ejemplo Prueba", "12345678Z", "DNI"]);
  assert.equal(m.telefono, "+34 600 000 111", "quita el apóstrofo anti-fórmulas");
  assert.deepEqual([m.direccion.tipoVia, m.direccion.nombreVia, m.direccion.numero, m.direccion.planta, m.direccion.puerta],
    ["Calle", "Mayor", "3", "2", "B"]);
  assert.equal(m.direccion.provincia, "Málaga");
  assert.deepEqual([m.fechaAlta, m.tipoSocioId, m.formaPago], ["2024-03-15", "juv", "Bizum"]);
  const p = r.socios[1];
  assert.deepEqual([p.nombre, p.apellidos, p.fechaAlta, p.tipoSocioId, p.numero], ["Pedro", "Sin Fecha", "2026-10-01", "socio", null]);
  const textos = r.problemas.map((x) => x.fila + ": " + x.mensaje).join(" | ");
  assert.match(textos, /3: Sin fecha de alta/);
  assert.match(textos, /3: Tipo de socio «Inventado»/);
  assert.match(textos, /5: Sin nombre/);
});

test("lo exportado se puede volver a importar", () => {
  const original = socio({ numero: 9, nombre: "Ana", apellidos: "Ejemplo", documento: "X1234567L", tipoDocumento: "NIE", email: "ana@example.org",
    fechaNacimiento: "1990-02-03", direccion: { tipoVia: "Plaza", nombreVia: "Mayor", numero: "1", codigoPostal: "28013", municipio: "Madrid", provincia: "Madrid" },
    formaPago: "Efectivo", _tipoNombre: "Socio", tipoSocioId: "socio" });
  const texto = CSV.escribir(S.COLUMNAS_CSV, [original]);
  const r = S.desdeCSV(CSV.leer(texto), [{ id: "socio", nombre: "Socio" }]);
  assert.deepEqual(r.problemas, []);
  const s = r.socios[0];
  for (const k of ["numero", "nombre", "apellidos", "documento", "tipoDocumento", "email", "fechaNacimiento", "fechaAlta", "formaPago", "tipoSocioId"]) {
    assert.equal(s[k], original[k], k);
  }
  assert.deepEqual([s.direccion.tipoVia, s.direccion.nombreVia, s.direccion.numero, s.direccion.codigoPostal], ["Plaza", "Mayor", "1", "28013"]);
});

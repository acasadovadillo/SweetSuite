// Admisiones: de la solicitud de alta al socio (logica/admisiones.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../src/js/logica/admisiones.js");

const socios = [{ id: "s1", numero: 1, nombre: "Ana", documento: "12345678Z", email: "ana@ejemplo.org" }, { id: "s2", numero: 7, nombre: "Bea" }];
const sol = Object.assign(A.vacia("2026-03-01"), { id: "x1", nombre: "Carla", apellidos: "Prueba", documento: "87654321X", email: "carla@ejemplo.org", tipoSocioId: "ordinario" });

test("una solicitud necesita nombre y fechas válidas", () => {
  assert.deepEqual(A.validar(sol), {});
  assert.ok(A.validar(Object.assign({}, sol, { nombre: " " })).nombre);
  assert.ok(A.validar(Object.assign({}, sol, { email: "no-es-correo" })).email);
});

test("avisa si ya es socio o si ya lo pidió", () => {
  const repetida = Object.assign({}, sol, { id: "x2", documento: "12345678-z" });
  assert.equal(A.coincidencias(repetida, socios, []).socios[0].id, "s1");
  assert.equal(A.coincidencias(Object.assign({}, sol, { id: "x3" }), [], [sol]).solicitudes[0].id, "x1");
  assert.equal(A.coincidencias(sol, socios, [sol]).solicitudes.length, 0, "no se cuenta a sí misma");
});

test("admitirla da de alta al socio con el número siguiente y la fecha del acuerdo", () => {
  const r = A.admitir(sol, { fecha: "2026-03-12", acuerdo: "Junta del 12/03/2026", socios, contador: 5 });
  assert.deepEqual([r.socio.numero, r.socio.nombre, r.socio.documento, r.socio.fechaAlta, r.socio.tipoSocioId, r.contador], [8, "Carla", "87654321X", "2026-03-12", "ordinario", 9]);
  assert.match(r.socio.notas, /Admitido en Junta del 12\/03\/2026/);
  assert.deepEqual([r.solicitud.estado, r.solicitud.fechaResolucion], ["admitida", "2026-03-12"]);
  assert.equal(A.admitir(sol, { fecha: "2026-03-12", socios, contador: 20 }).socio.numero, 20, "el contador guardado manda si es mayor");
  assert.throws(() => A.admitir(r.solicitud, { fecha: "2026-03-13", socios }), /ya está resuelta/);
  assert.throws(() => A.admitir(sol, { fecha: "2026-02-01", socios }), /antes de que se pidiera/);
});

test("rechazarla, y reabrir una rechazada (una admitida no)", () => {
  const r = A.rechazar(sol, "2026-03-12", "No cumple los requisitos");
  assert.deepEqual([r.estado, r.motivo], ["rechazada", "No cumple los requisitos"]);
  assert.equal(A.reabrir(r).estado, "pendiente");
  assert.throws(() => A.reabrir(Object.assign({}, sol, { estado: "admitida" })), /Solo se puede reabrir/);
});

test("ordenadas: las pendientes primero, de la más antigua a la más nueva", () => {
  const l = A.ordenar([
    Object.assign({}, sol, { id: "a", estado: "admitida", fechaResolucion: "2026-01-10" }),
    Object.assign({}, sol, { id: "b", fecha: "2026-03-05" }),
    Object.assign({}, sol, { id: "c", fecha: "2026-02-01" }),
    Object.assign({}, sol, { id: "d", estado: "rechazada", fechaResolucion: "2026-02-20" }),
  ]);
  assert.deepEqual(l.map((x) => x.id), ["c", "b", "d", "a"]);
});

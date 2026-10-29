// Tests de la mezcla: dos miembros de la junta guardan a la vez y no se pisan.
const test = require("node:test");
const assert = require("node:assert/strict");
const Esquema = require("../src/js/datos/esquema.js");
const { crearRepositorio } = require("../src/js/datos/repositorio.js");
const { mezclar, borradosNuevos } = require("../src/js/datos/mezcla.js");

const copia = (x) => JSON.parse(JSON.stringify(x));
// Un reloj por dispositivo: cada llamada, un segundo más tarde
function reloj(inicio) {
  let t = Date.parse(inicio);
  return () => new Date((t += 1000)).toISOString();
}
const repoDe = (doc, inicio, quien) => crearRepositorio(doc, null, reloj(inicio), null,
  { autor: () => ({ id: quien, texto: quien }) });

function base() {
  const doc = Esquema.documentoVacio(new Date("2026-10-01T10:00:00Z"));
  doc.socios = [{ id: "s1", nombre: "Ana", numero: 1, creado: "2026-10-01T10:00:00.000Z", modificado: "2026-10-01T10:00:00.000Z" },
    { id: "s2", nombre: "Luis", numero: 2, creado: "2026-10-01T10:00:00.000Z", modificado: "2026-10-01T10:00:00.000Z" }];
  doc.config.siguienteNumeroSocio = 3;
  return doc;
}

test("dos altas a la vez: se quedan las dos", async () => {
  const a = base(), b = base();
  await repoDe(a, "2026-10-02T10:00:00Z", "alberto").guardar("socios", { nombre: "Marta", numero: 3 });
  await repoDe(b, "2026-10-02T10:00:05Z", "lucia").guardar("socios", { nombre: "Pedro", numero: 3 });
  const m = mezclar(a, b);
  assert.deepEqual(m.socios.map((s) => s.nombre).sort(), ["Ana", "Luis", "Marta", "Pedro"]);
  assert.equal(m.config.siguienteNumeroSocio, 4, "el contador no repite número");
  assert.equal(m.registro.length, 2, "los dos apuntes del registro");
});

test("el mismo registro cambiado en los dos: gana el cambio más reciente", async () => {
  const a = base(), b = base();
  await repoDe(a, "2026-10-02T10:00:00Z", "alberto").guardar("socios", Object.assign(copia(a.socios[0]), { telefono: "600000001" }));
  await repoDe(b, "2026-10-02T11:00:00Z", "lucia").guardar("socios", Object.assign(copia(b.socios[0]), { telefono: "600000002" }));
  assert.equal(mezclar(a, b).socios.find((s) => s.id === "s1").telefono, "600000002");
  assert.equal(mezclar(b, a).socios.find((s) => s.id === "s1").telefono, "600000002");
});

test("lo borrado en uno no vuelve con el otro, salvo que se cambiara después", async () => {
  const a = base(), b = base();
  await repoDe(a, "2026-10-02T10:00:00Z", "alberto").borrar("socios", "s2");
  assert.ok(a.borrados.s2, "deja marca");
  let m = mezclar(a, b);
  assert.deepEqual(m.socios.map((s) => s.id), ["s1"]);
  assert.deepEqual(borradosNuevos(b, a), ["s2"]);
  // Si el otro lo cambia DESPUÉS del borrado, el cambio gana
  await repoDe(b, "2026-10-02T12:00:00Z", "lucia").guardar("socios", Object.assign(copia(b.socios[1]), { nombre: "Luis Á." }));
  m = mezclar(a, b);
  assert.deepEqual(m.socios.map((s) => s.id).sort(), ["s1", "s2"]);
});

test("asociación y configuración se mezclan campo a campo", async () => {
  const a = base(), b = base();
  const ra = repoDe(a, "2026-10-02T10:00:00Z", "alberto"), rb = repoDe(b, "2026-10-02T10:00:30Z", "lucia");
  await ra.escribir("asociacion", Object.assign(await ra.leer("asociacion"), { nif: "G00000000" }));
  await rb.escribir("asociacion", Object.assign(await rb.leer("asociacion"), { telefono: "910000000" }));
  const ca = await ra.leer("config"); ca.limiteArchivoMB = 20;
  await ra.escribir("config", ca);
  assert.ok(a.meta.cambios["asociacion.nif"] && !a.meta.cambios["asociacion.nombre"], "solo apunta lo que cambia");
  const m = mezclar(a, b);
  assert.equal(m.asociacion.nif, "G00000000");
  assert.equal(m.asociacion.telefono, "910000000");
  assert.equal(m.config.limiteArchivoMB, 20);
  assert.deepEqual(mezclar(b, a).asociacion, m.asociacion, "da igual el orden");
});

test("mezclar con nada, o con un documento antiguo, lo deja en la versión actual", () => {
  const viejo = { app: "webkit_asociaciones", esquema: 7, asociacion: { nombre: "ABIES" }, socios: [{ id: "x", nombre: "A", modificado: "2026-01-01" }] };
  const m = mezclar(null, viejo);
  assert.equal(m.esquema, Esquema.VERSION);
  assert.equal(m.asociacion.nombre, "ABIES");
  const n = mezclar(base(), viejo);
  assert.deepEqual(n.socios.map((s) => s.id).sort(), ["s1", "s2", "x"]);
});

test("mezclar dos veces lo mismo no cambia nada", async () => {
  const a = base(), b = base();
  await repoDe(a, "2026-10-02T10:00:00Z", "alberto").guardar("cuotas", { socioId: "s1", periodo: "2026", importe: 2000 });
  const m = mezclar(a, b);
  assert.deepEqual(mezclar(m, b).cuotas, m.cuotas);
  assert.deepEqual(mezclar(m, m).socios, m.socios);
});

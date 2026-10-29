// Facturas rectificativas: corrigen una emitida sin tocarla, con su propia serie.
const test = require("node:test");
const assert = require("node:assert/strict");
const Fac = require("../src/js/logica/facturas.js");

const original = {
  id: "f1", tipo: "emitida", estado: "emitida", numero: "2026-0003", fecha: "2026-05-10",
  tercero: { nombre: "Ayuntamiento de Ejemplo", nif: "P0000000J" },
  lineas: [{ concepto: "Taller", cantidad: 2, precio: 5000, tratamiento: "sujeto", tipoIva: 21 }],
};

test("una rectificativa nace con las líneas en negativo y dice qué corrige", () => {
  const r = Fac.rectificativa(original, "Se facturó un taller de más", "2026-06-01");
  assert.equal(r.estado, "borrador");
  assert.deepEqual(r.rectifica, { id: "f1", numero: "2026-0003", fecha: "2026-05-10" });
  assert.equal(r.lineas[0].cantidad, -2);
  assert.equal(Fac.totales(r).total, -12100);
  assert.equal(original.lineas[0].cantidad, 2, "no toca la original");
  assert.throws(() => Fac.rectificativa(Object.assign({}, original, { estado: "borrador" })), /emitida/);
});

test("se numera con su propia serie y pide el motivo", () => {
  const r = Fac.rectificativa(original, "", "2026-06-01");
  assert.equal(Fac.serieDe(r, { serie: "" }), "R");
  assert.equal(Fac.serieDe(r, { serie: "A", serieRectificativas: "RA" }), "RA");
  assert.equal(Fac.serieDe(original, { serie: "A" }), "A");
  const facturas = [original, Object.assign({}, r, { estado: "emitida", numero: "R-2026-0001" })];
  assert.equal(Fac.siguienteNumero(facturas, "2026", "R"), "R-2026-0002");
  assert.equal(Fac.siguienteNumero(facturas, "2026", ""), "2026-0004", "no se mezcla con la serie normal");
  assert.ok(Fac.revisar(r).some((p) => /motivo/.test(p)));
  assert.ok(Fac.revisar(Object.assign({}, r, { motivoRectificacion: "x", fecha: "2026-01-01" })).some((p) => /anterior/.test(p)));
  assert.deepEqual(Fac.revisar(Object.assign({}, r, { motivoRectificacion: "x" })), []);
  assert.deepEqual(Fac.rectificativasDe(original, facturas).map((x) => x.numero), ["R-2026-0001"]);
});

test("una rectificativa en negativo queda pendiente hasta que se devuelve", () => {
  const r = Object.assign(Fac.rectificativa(original, "x", "2026-06-01"), { id: "r1", estado: "emitida", numero: "R-2026-0001" });
  assert.equal(Fac.estadoPago(r, [], []).estado, "pendiente");
  assert.equal(Fac.estadoPago(r, [], []).pendiente, 12100);
  assert.equal(Fac.estadoPago(r, [{ facturaId: "r1", importe: 12100 }], []).estado, "cobrada");
});

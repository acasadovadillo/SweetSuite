// Tests de facturas (totales, numeración, cobro) y de la ayuda del IVA.
// Los importes esperados están calculados a mano en los comentarios.
const test = require("node:test");
const assert = require("node:assert/strict");
const Fac = require("../src/js/logica/facturas.js");
const IVA = require("../src/js/logica/iva.js");

const linea = (cantidad, precio, tratamiento = "sujeto", tipoIva = 21) => ({ concepto: "x", cantidad, precio, tratamiento, tipoIva });
const factura = (o) => Object.assign({ id: "f" + Math.random(), tipo: "emitida", estado: "emitida", fecha: "2026-01-01", tercero: { nombre: "Cliente" }, lineas: [] }, o);

test("totales: bases por tipo, cuota sobre la suma de bases, exentas aparte", () => {
  const t = Fac.totales(factura({ lineas: [linea(2, 1250), linea(1, 333), linea(3, 999, "sujeto", 10), linea(1, 5000, "exento")] }));
  // 21 %: 25,00 + 3,33 = 28,33 → cuota 5,9493 → 5,95 · 10 %: 29,97 → 2,997 → 3,00 · exento 50,00
  assert.deepEqual(t.porTipo.map((g) => [g.tratamiento, g.tipoIva, g.base, g.cuota]),
    [["exento", 0, 5000, 0], ["sujeto", 21, 2833, 595], ["sujeto", 10, 2997, 300]]);
  assert.deepEqual([t.base, t.cuota, t.retencion, t.total, t.baseSujeta, t.baseExenta], [10830, 895, 0, 11725, 5830, 5000]);
});

test("la cuota se calcula sobre la suma (no redondeando línea a línea)", () => {
  // Tres líneas de 0,10 € al 21 %: línea a línea saldría 0; sobre la suma (0,30) son 0,063 → 0,06.
  assert.equal(Fac.totales(factura({ lineas: [linea(1, 10), linea(1, 10), linea(1, 10)] })).cuota, 6);
});

test("cantidades con decimales y retención de IRPF", () => {
  assert.equal(Fac.baseLinea(linea(1.5, 1999)), 2999); // 29,985 → 29,99
  const t = Fac.totales(factura({ tipo: "recibida", retencionPct: 15, lineas: [linea(1, 20000)] }));
  // 200 + 42 (IVA) − 30 (15 % de 200) = 212
  assert.deepEqual([t.cuota, t.retencion, t.total], [4200, 3000, 21200]);
});

test("numeración correlativa por año y serie", () => {
  const fs = [factura({ numero: "2026-0001" }), factura({ numero: "2026-0003" }), factura({ estado: "borrador", numero: "" }),
    factura({ numero: "2025-0009" }), factura({ tipo: "recibida", numero: "2026-0099" })];
  assert.equal(Fac.siguienteNumero(fs, 2026), "2026-0004");
  assert.equal(Fac.siguienteNumero(fs, 2027), "2027-0001");
  assert.equal(Fac.siguienteNumero(fs, 2026, "A"), "A-2026-0001");
});

test("revisar una factura antes de emitirla", () => {
  assert.deepEqual(Fac.revisar(factura({ lineas: [linea(1, 100)] })), []);
  const p = Fac.revisar(factura({ fecha: "", tercero: { nombre: "" }, lineas: [linea(1, 100, "exento")] }));
  assert.equal(p.length, 3);
  assert.match(p.join(" "), /motivo de la exención/);
  assert.match(Fac.revisar(factura({ tipo: "recibida", numero: "", lineas: [linea(1, 100)] })).join(" "), /número/);
});

test("estado de cobro con movimientos y gastos de anticipos", () => {
  const f = factura({ id: "F", lineas: [linea(1, 10000)] }); // total 121,00
  assert.equal(Fac.estadoPago(f, [], []).estado, "pendiente");
  assert.equal(Fac.estadoPago(f, [{ facturaId: "F", importe: 5000 }], []).estado, "parcial");
  const e = Fac.estadoPago(f, [{ facturaId: "F", importe: 5000 }], [{ gastos: [{ facturaId: "F", importe: 7100 }] }]);
  assert.deepEqual([e.pagado, e.pendiente, e.estado], [12100, 0, "cobrada"]);
  assert.equal(Fac.estadoPago(Object.assign({}, f, { tipo: "recibida" }), [{ facturaId: "F", importe: 12100 }]).estado, "pagada");
  assert.equal(Fac.trimestre("2026-10-01"), "2026-T4");
});

// ── IVA ───────────────────────────────────────────────────────────────────
const facturasAnio = () => [
  factura({ fecha: "2026-02-10", lineas: [linea(1, 10000)] }),                                  // T1 devengado 21,00
  factura({ tipo: "recibida", fecha: "2026-03-01", deducible: true, lineas: [linea(1, 20000)] }), // T1 soportado 42,00
  factura({ fecha: "2026-05-05", lineas: [linea(1, 20000)] }),                                  // T2 devengado 42,00
  factura({ tipo: "recibida", fecha: "2026-06-01", deducible: true, lineas: [linea(1, 5000, "sujeto", 10)] }), // T2 soportado 5,00
  factura({ tipo: "recibida", fecha: "2026-11-01", deducible: true, lineas: [linea(1, 10000)] }), // T4 soportado 21,00
  factura({ estado: "borrador", fecha: "2026-01-01", lineas: [linea(1, 100000)] }),             // no cuenta
  factura({ estado: "anulada", fecha: "2026-01-01", lineas: [linea(1, 100000)] }),              // no cuenta
  factura({ tipo: "recibida", fecha: "2026-01-20", deducible: false, retencionPct: 15, lineas: [linea(1, 10000)] }), // no deducible; retención 15,00
];

test("303: resultado negativo en T1-T3 queda «a compensar» y se arrastra", () => {
  const l = IVA.liquidaciones(facturasAnio(), {}, "2026-T4");
  // T1: 21 − 42 = −21 → a compensar
  assert.deepEqual([l["2026-T1"].devengado, l["2026-T1"].deducible, l["2026-T1"].resultado, l["2026-T1"].situacion], [2100, 4200, -2100, "compensar"]);
  assert.match(l["2026-T1"].aviso, /A COMPENSAR/);
  assert.equal(l["2026-T1"].retenciones, 1500);
  // T2: 42 − 5 = 37; se aplican los 21 pendientes → 16 a ingresar
  assert.deepEqual([l["2026-T2"].resultadoPeriodo, l["2026-T2"].compensacionAplicada, l["2026-T2"].resultado, l["2026-T2"].situacion], [3700, 2100, 1600, "ingresar"]);
  assert.equal(l["2026-T2"].quedaACompensar, 0);
  assert.equal(l["2026-T3"].situacion, "cero");
  // T4: −21 → en el 4.º trimestre se puede elegir; por defecto, a compensar
  assert.equal(l["2026-T4"].situacion, "compensar");
  assert.match(l["2026-T4"].aviso, /4\.º trimestre/);
  assert.equal(l["2026-T4"].quedaACompensar, 2100);
});

test("303: devolución pedida en el 4.º trimestre y saldo inicial a compensar", () => {
  const l = IVA.liquidaciones(facturasAnio(), { iva: { devolucionesSolicitadas: ["2026-T4"] } }, "2026-T4");
  assert.equal(l["2026-T4"].situacion, "devolver");
  assert.equal(l["2026-T4"].quedaACompensar, 0);
  // Venían 10,00 a compensar de 2025: T1 sigue negativo, así que en T2 hay 31,00 disponibles.
  const c = IVA.liquidaciones(facturasAnio(), { iva: { periodoSaldoInicial: "2026-T1", saldoACompensarInicial: 1000 } }, "2026-T2");
  assert.equal(c["2026-T2"].compensacionDisponible, 3100);
  assert.equal(c["2026-T2"].resultado, 600);
});

test("303: prorrata (porcentaje de deducción indicado a mano)", () => {
  const l = IVA.liquidaciones(facturasAnio(), { iva: { prorrata: 50 } }, "2026-T1");
  assert.deepEqual([l["2026-T1"].soportado, l["2026-T1"].deducible, l["2026-T1"].resultado, l["2026-T1"].situacion], [4200, 2100, 0, "cero"]);
});

test("resumen anual y avisos", () => {
  const r = IVA.resumenAnual(facturasAnio(), {}, 2026);
  assert.deepEqual([r.devengado, r.deducible, r.ingresado, r.quedaACompensar, r.retenciones], [6300, 6800, 1600, 2100, 1500]);
  assert.deepEqual(r.devengadoPorTipo.map((g) => [g.tipoIva, g.base, g.cuota]), [[21, 30000, 6300]]);
  assert.deepEqual(r.soportadoPorTipo.map((g) => [g.tipoIva, g.base, g.cuota]), [[21, 30000, 6300], [10, 5000, 500]]);
  assert.deepEqual(IVA.avisos(facturasAnio(), {}), []);
  const conExenta = facturasAnio().concat([factura({ fecha: "2026-04-01", lineas: [linea(1, 1000, "exento")] })]);
  assert.match(IVA.avisos(conExenta, {})[0], /prorrata/);
});

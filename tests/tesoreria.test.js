// Tests de tesorería: saldos, libro (cuotas sin duplicar), resultados, anticipos,
// presupuestos y conciliación con cuotas.
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/js/logica/tesoreria.js");

const cuentas = [{ id: "banco", saldoInicial: 100000 }, { id: "caja", saldoInicial: 5000 }];
const movimientos = [
  { id: "m1", fecha: "2026-01-10", cuentaId: "banco", tipo: "ingreso", importe: 3000, categoriaId: "donaciones" },
  { id: "m2", fecha: "2026-01-15", cuentaId: "banco", tipo: "gasto", importe: 1500, categoriaId: "seguros" },
  { id: "m3", fecha: "2026-02-01", cuentaId: "banco", tipo: "traspaso", importe: 2000, cuentaDestinoId: "caja" },
  { id: "m4", fecha: "2026-02-02", cuentaId: "caja", tipo: "anticipo", sentido: "salida", importe: 4000, anticipoId: "a1" },
  { id: "m5", fecha: "2026-02-20", cuentaId: "caja", tipo: "anticipo", sentido: "entrada", importe: 500, anticipoId: "a1" },
  { id: "m6", fecha: "2026-03-01", cuentaId: "banco", tipo: "ingreso", importe: 3000, categoriaId: "cuotas", cuotaIds: ["q1"] },
];
const pago = (fecha, forma, cuentaId) => ({ fecha, forma, cuentaId, referencia: "" });
const cuotas = [
  { id: "q1", socioNumero: 1, socioNombre: "Ana", concepto: "Cuota", importe: 3000, estado: "pagada", pago: pago("2026-02-28", "Transferencia", "banco") },
  { id: "q2", socioNumero: 2, socioNombre: "Bea", concepto: "Cuota", importe: 1500, estado: "pagada", pago: pago("2026-03-05", "Efectivo", "caja") },
  { id: "q3", socioNumero: 3, socioNombre: "Ciro", concepto: "Cuota", importe: 3000, estado: "pendiente", pago: null },
];
const anticipos = [{ id: "a1", tipo: "anticipo", gastos: [
  { fecha: "2026-02-10", importe: 3000, categoriaId: "material" },
  { fecha: "2026-02-12", importe: 600, categoriaId: "actividades", proyectoId: "p1" },
] }];

test("el libro incluye las cuotas cobradas que no están enlazadas a un movimiento (y solo esas)", () => {
  const l = T.libro(movimientos, cuotas);
  assert.equal(l.length, 7);
  const virtuales = l.filter((m) => m.virtual);
  assert.deepEqual(virtuales.map((m) => [m.id, m.importe, m.cuentaId, m.categoriaId]), [["cuota:q2", 1500, "caja", "cuotas"]]);
  assert.equal(l[0].fecha, "2026-03-05", "ordenado del más reciente al más antiguo");
});

test("saldos por cuenta: ingresos, gastos, traspasos, anticipos y cuotas en efectivo", () => {
  const s = T.saldos(cuentas, movimientos, cuotas);
  // banco: 1.000 + 30 − 15 − 20 + 30 = 1.025 · caja: 50 + 20 − 40 + 5 + 15 = 50
  assert.deepEqual(s.porCuenta, { banco: 102500, caja: 5000 });
  assert.equal(s.total, 107500);
  assert.deepEqual(T.saldos(cuentas, movimientos, cuotas, "2026-01-31").porCuenta, { banco: 101500, caja: 5000 });
});

test("resultados: los traspasos y las entregas de anticipos no son ingresos ni gastos", () => {
  const r = T.resultados(T.partidas(movimientos, cuotas, anticipos), "2026-01-01", "2026-12-31");
  assert.deepEqual(r.ingresos, { donaciones: 3000, cuotas: 4500 });
  assert.deepEqual(r.gastos, { seguros: 1500, material: 3000, actividades: 600 });
  assert.deepEqual([r.totalIngresos, r.totalGastos, r.resultado], [7500, 5100, 2400]);
  const soloEnero = T.resultados(T.partidas(movimientos, cuotas, anticipos), "2026-01-01", "2026-01-31");
  assert.deepEqual([soloEnero.totalIngresos, soloEnero.totalGastos], [3000, 1500]);
});

test("situación de un anticipo", () => {
  const s = T.situacionAnticipo(anticipos[0], movimientos);
  // Se le dieron 40, devolvió 5 y justificó 36: la asociación le debe 1
  assert.deepEqual([s.entregado, s.devuelto, s.justificado, s.saldo, s.estado], [4000, 500, 3600, -100, "se le debe"]);
  const reembolso = { id: "r1", tipo: "reembolso", gastos: [{ importe: 2000 }] };
  assert.equal(T.situacionAnticipo(reembolso, []).estado, "se le debe");
  assert.equal(T.situacionAnticipo(reembolso, [{ tipo: "anticipo", anticipoId: "r1", sentido: "salida", importe: 2000 }]).estado, "liquidado");
});

test("ejecución del presupuesto", () => {
  const r = T.resultados(T.partidas(movimientos, cuotas, anticipos));
  const e = T.ejecucion({ seguros: 2000, donaciones: 5000 }, r, [
    { id: "seguros", nombre: "Seguros", tipo: "gasto" }, { id: "donaciones", nombre: "Donaciones", tipo: "ingreso" }]);
  const fila = (id) => e.filas.find((f) => f.categoriaId === id);
  assert.deepEqual([fila("seguros").previsto, fila("seguros").realizado, fila("seguros").pct], [2000, 1500, 75]);
  assert.equal(fila("donaciones").pct, 60);
  assert.deepEqual(e.gastos, { previsto: 2000, realizado: 5100 });
  assert.deepEqual(e.ingresos, { previsto: 5000, realizado: 7500 });
});

test("conciliar un ingreso del banco con varias cuotas", () => {
  const mov = { id: "x", fecha: "2026-04-01", cuentaId: "banco", tipo: "ingreso", importe: 4500, concepto: "Familia" };
  const r = T.conciliarCuotas(mov, [cuotas[2], Object.assign({}, cuotas[2], { id: "q4", importe: 1500 })]);
  assert.deepEqual(r.movimiento.cuotaIds, ["q3", "q4"]);
  assert.equal(r.movimiento.categoriaId, "cuotas");
  assert.equal(r.diferencia, 0);
  assert.deepEqual(r.cuotas.map((c) => [c.estado, c.pago.fecha, c.pago.cuentaId, c.pago.forma]),
    [["pagada", "2026-04-01", "banco", "Transferencia"], ["pagada", "2026-04-01", "banco", "Transferencia"]]);
  // Una vez enlazadas, no se cuentan dos veces.
  const l = T.libro([r.movimiento], r.cuotas);
  assert.equal(l.length, 1);
});

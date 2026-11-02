// El dinero de Agora, a Solvento (logica/traspaso.js). Lo que importa es que,
// pasado a Solvento, todo cuadre igual que en Agora: los saldos de cada
// cuenta, lo que debe cada persona y los ingresos y gastos.
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/js/logica/tesoreria.js");
const Tr = require("../src/js/logica/traspaso.js");

const config = {
  cuentas: [{ id: "banco", nombre: "Bankinter", tipo: "banco", saldoInicial: 100000, fechaSaldoInicial: "2025-12-31" },
    { id: "caja", nombre: "Caja (efectivo)", tipo: "caja", saldoInicial: 5000 }],
  categorias: [{ id: "donaciones", nombre: "Donaciones", tipo: "ingreso" }, { id: "seguros", nombre: "Seguros", tipo: "gasto" },
    { id: "material", nombre: "Material y suministros", tipo: "gasto" }, { id: "actividades", nombre: "Gastos de actividades", tipo: "gasto" },
    { id: "subvenciones", nombre: "Subvenciones", tipo: "ingreso" }],
  facturacion: { serie: "" }, iva: { prorrata: 80 },
};
const movimientos = [
  { id: "m1", fecha: "2026-01-10", cuentaId: "banco", tipo: "ingreso", importe: 3000, categoriaId: "donaciones", concepto: "Donativo" },
  { id: "m2", fecha: "2026-01-15", cuentaId: "banco", tipo: "gasto", importe: 1500, categoriaId: "seguros", facturaId: "f1" },
  { id: "m3", fecha: "2026-02-01", cuentaId: "banco", tipo: "traspaso", importe: 2000, cuentaDestinoId: "caja" },
  { id: "m4", fecha: "2026-02-02", cuentaId: "caja", tipo: "anticipo", sentido: "salida", importe: 4000, anticipoId: "a1" },
  { id: "m5", fecha: "2026-02-20", cuentaId: "caja", tipo: "anticipo", sentido: "entrada", importe: 500, anticipoId: "a1" },
  { id: "m6", fecha: "2026-03-01", cuentaId: "banco", tipo: "ingreso", importe: 3000, categoriaId: "cuotas", cuotaIds: ["q1"] },
  { id: "m7", fecha: "2026-04-01", cuentaId: "banco", tipo: "ingreso", importe: 50000, categoriaId: "subvenciones", proyectoId: "p1" },
];
const pago = (fecha, forma, cuentaId) => ({ fecha, forma, cuentaId, referencia: "" });
const cuotas = [
  { id: "q1", socioNumero: 1, socioNombre: "Ana", concepto: "Cuota", importe: 3000, estado: "pagada", pago: pago("2026-02-28", "Transferencia", "banco") },
  { id: "q2", socioNumero: 2, socioNombre: "Bea", concepto: "Cuota 2026", importe: 1500, estado: "pagada", pago: pago("2026-03-05", "Efectivo", "caja") },
  { id: "q3", socioNumero: 3, socioNombre: "Ciro", concepto: "Cuota", importe: 3000, estado: "pendiente", pago: null },
];
const anticipos = [{ id: "a1", tipo: "anticipo", persona: "Pepa", concepto: "Excursión", gastos: [
  { id: "g1", fecha: "2026-02-10", importe: 3000, categoriaId: "material", concepto: "Bocadillos" },
  { id: "g2", fecha: "2026-02-12", importe: 600, categoriaId: "actividades", proyectoId: "p1", concepto: "Entradas" },
] }];
const proyectos = [{ id: "p1", nombre: "Huerto escolar", tipo: "subvencion", financiador: "Ayuntamiento", importeConcedido: 300000,
  estadoSubvencion: "concedida", fechaInicio: "2026-01-01", presupuesto: { material: 120000, actividades: 0, subvenciones: 300000 },
  requisitos: [{ id: "r1", texto: "Memoria", hecho: true }] }];
const facturas = [{ id: "f1", tipo: "recibida", estado: "emitida", numero: "P-1", fecha: "2026-01-12", tercero: { nombre: "Seguros SA" },
  lineas: [{ concepto: "Póliza", cantidad: 1, precio: 1500, tratamiento: "exento", tipoIva: 0 }], categoriaId: "seguros", proyectoId: "" }];
const c = { config, movimientos, cuotas, anticipos, proyectos, facturas, asociacion: { nombre: "ABIES", nif: "G1", email: "a@b.c" } };
const p = Tr.paquete(c, "2026-11-02");

const num = (x) => Math.round(parseFloat(x) * 100);
// Los saldos que daría Solvento con esos movimientos (como su computeSaldos)
function saldosSolvento(movs) {
  const s = {};
  const mas = (k, v) => { if (k) s[k] = (s[k] || 0) + v; };
  movs.forEach((m) => {
    const i = num(m.importe);
    if (m.tipo === "Ingreso") mas(m.cuenta_destino, i);
    else if (m.tipo === "Gasto") mas(m.cuenta_origen, -i);
    else if (m.tipo === "Traspaso") { mas(m.cuenta_origen, -i); mas(m.cuenta_destino, i); }
    else if (m.tipo === "Préstamo") { if (m.tipo_prestamo === "Dinero prestado") mas(m.cuenta_origen, -i); else mas(m.cuenta_destino, i); }
  });
  return s;
}

test("los saldos de cada cuenta quedan en Solvento igual que en Agora", () => {
  const agora = T.saldos(config.cuentas, movimientos, cuotas).porCuenta;
  const solvento = saldosSolvento(p.movimientos);
  assert.deepEqual(solvento, { Bankinter: agora.banco, "Caja (efectivo)": agora.caja });
});

test("las cuotas cobradas sin movimiento pasan como su ingreso, y las enlazadas no se repiten", () => {
  const deCuotas = p.movimientos.filter((m) => m.cuotas);
  assert.deepEqual(deCuotas.map((m) => [m.id, m.importe, m.cuenta_destino, m.tipo_ingreso]).sort(),
    [["agora-cuota:q2", "15.00", "Caja (efectivo)", "Cuotas de socios"], ["agora-m6", "30.00", "Bankinter", "Cuotas de socios"]]);
});

test("un anticipo es un préstamo: lo que debe la persona sale igual, y lo justificado es gasto", () => {
  const pepa = p.movimientos.filter((m) => m.persona_prestamo === "Pepa");
  const prestado = pepa.filter((m) => m.tipo_prestamo === "Dinero prestado").reduce((t, m) => t + num(m.importe), 0);
  const devuelto = pepa.filter((m) => m.tipo_prestamo === "Devolución").reduce((t, m) => t + num(m.importe), 0);
  assert.equal(prestado - devuelto, T.situacionAnticipo(anticipos[0], movimientos).saldo);   // 40 − 5 − 36 = −1 (se le debe)
  const justificados = p.movimientos.filter((m) => m.tipo === "Gasto" && /justificado por Pepa/.test(m.detalle));
  assert.deepEqual(justificados.map((m) => [m.importe, m.tipo_gasto, m.cuenta_origen, m.centro]),
    [["30.00", "Material y suministros", "", ""], ["6.00", "Gastos de actividades", "", "Subvenciones > Huerto escolar"]]);
});

test("los ingresos y gastos del año, los mismos que en Agora (sin el saldo inicial)", () => {
  const r = T.resultados(T.partidas(movimientos, cuotas, anticipos), "2026-01-01", "2026-12-31");
  const sinAjuste = p.movimientos.filter((m) => !/ajuste/i.test(m.tipo_ingreso + m.tipo_gasto));
  const total = (tipo) => sinAjuste.filter((m) => m.tipo === tipo).reduce((t, m) => t + num(m.importe), 0);
  assert.equal(total("Ingreso"), r.totalIngresos);
  assert.equal(total("Gasto"), r.totalGastos);
  const ajustes = p.movimientos.filter((m) => /ajuste/i.test(m.tipo_ingreso + m.tipo_gasto));
  assert.deepEqual(ajustes.map((m) => [m.fecha, m.importe, m.cuenta_destino]), [["31/12/2025", "1000.00", "Bankinter"], ["01/02/2026", "50.00", "Caja (efectivo)"]]);
});

test("facturas, subvenciones y lo de la asociación pasan con sus nombres y su centro", () => {
  assert.deepEqual([p.facturas[0].id, p.facturas[0].categoria, p.facturas[0].numero], ["f1", "Seguros", "P-1"]);
  assert.equal(p.movimientos.find((m) => m.id === "agora-m2").factura, "f1");
  const s = p.subvenciones[0];
  assert.deepEqual([s.id, s.centro, s.importeConcedido, s.estadoSubvencion, s.requisitos.length], ["agora-p1", "Subvenciones > Huerto escolar", 3000, "concedida", 1]);
  assert.deepEqual(s.presupuesto, { "gasto|Material y suministros": 1200, "ingreso|Subvenciones": 3000 });
  assert.equal(p.movimientos.find((m) => m.id === "agora-m7").centro, "Subvenciones > Huerto escolar");
  assert.deepEqual([p.entidad.nombre, p.iva.prorrata, p.cuentas.map((k) => k.cuenta).join()], ["ABIES", 80, "Bankinter,Caja (efectivo)"]);
  assert.ok(!p.categoriasIngreso.some((x) => /ajuste/i.test(x)) && p.categoriasIngreso.includes("Cuotas de socios"));
  assert.ok(new Set(p.movimientos.map((m) => m.id)).size === p.movimientos.length, "ningún id repetido");
});

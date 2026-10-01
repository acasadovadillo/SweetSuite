// Tests de la lógica de cuotas: periodos, generación de remesas, pagos y resúmenes.
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/js/logica/cuotas.js");
const S = require("../src/js/logica/socios.js");

test("periodos de cada periodicidad", () => {
  assert.deepEqual(C.periodo("2026"), { clave: "2026", periodicidad: "anual", anio: 2026, inicio: "2026-01-01", fin: "2026-12-31", etiqueta: "año 2026" });
  assert.equal(C.periodo("2026-S1").fin, "2026-06-30");
  assert.equal(C.periodo("2026-S2").inicio, "2026-07-01");
  assert.equal(C.periodo("2026-T1").fin, "2026-03-31");
  assert.equal(C.periodo("2028-02").fin, "2028-02-29"); // bisiesto
  assert.equal(C.periodo("2026-02").etiqueta, "febrero 2026");
  assert.equal(C.periodo("2026-T5"), null);
  assert.equal(C.periodosDelAnio("mensual", 2026).length, 12);
  assert.equal(C.periodosDelAnio("trimestral", 2026)[3].clave, "2026-T4");
  assert.equal(C.periodoDeFecha("trimestral", "2026-08-15").clave, "2026-T3");
  assert.equal(C.periodoDeFecha("anual", "2026-08-15").clave, "2026");
});

const tipos = [
  { id: "socio", nombre: "Socio", cuota: 3000, periodicidad: "anual" },
  { id: "honor", nombre: "Honorario", cuota: 0, periodicidad: "anual" },
  { id: "mes", nombre: "Mensual", cuota: 500, periodicidad: "mensual" },
];
const socios = [
  S.completar({ id: "1", numero: 1, nombre: "Ana", fechaAlta: "2020-01-01", tipoSocioId: "socio" }),
  S.completar({ id: "2", numero: 2, nombre: "Bea", fechaAlta: "2026-06-01", tipoSocioId: "socio" }),    // entra a mitad de año: sí
  S.completar({ id: "3", numero: 3, nombre: "Ciro", fechaAlta: "2020-01-01", fechaBaja: "2026-01-01", tipoSocioId: "socio" }), // baja el 1 de enero: no
  S.completar({ id: "4", numero: 4, nombre: "Dani", fechaAlta: "2020-01-01", tipoSocioId: "honor" }),
  S.completar({ id: "5", numero: 5, nombre: "Eva", fechaAlta: "2020-01-01", tipoSocioId: "socio", exentoCuota: true }),
  S.completar({ id: "6", numero: 6, nombre: "Fran", fechaAlta: "2020-01-01", tipoSocioId: "mes" }),
  S.completar({ id: "7", numero: 7, nombre: "Gema", fechaAlta: "2027-01-01", tipoSocioId: "socio" }),
  S.completar({ id: "8", numero: 8, nombre: "Hugo", fechaAlta: "2020-01-01", tipoSocioId: "borrado" }),
  S.completar({ id: "9", numero: 9, nombre: "Inés", fechaAlta: "2020-01-01", fechaBaja: "2026-11-30", tipoSocioId: "socio" }), // baja durante el año: sí
];

test("generar las cuotas de un año: a quién le toca y a quién no", () => {
  const r = C.generar({ periodo: "2026", socios, tipos, cuotas: [], fechaEmision: "2026-01-10" });
  assert.deepEqual(r.nuevas.map((c) => c.socioId), ["1", "2", "9"]);
  assert.equal(r.total, 9000);
  assert.equal(r.nuevas[0].concepto, "Cuota socio · año 2026");
  assert.equal(r.nuevas[0].estado, "pendiente");
  const motivo = Object.fromEntries(r.omitidos.map((o) => [o.socio.id, o.motivo]));
  assert.deepEqual(motivo, { 3: "noActivo", 4: "cuotaCero", 5: "exento", 6: "otraPeriodicidad", 7: "noActivo", 8: "sinTipo" });
});

test("generar dos veces no duplica; una cuota anulada sí se puede volver a emitir", () => {
  const primera = C.generar({ periodo: "2026", socios, tipos, cuotas: [] }).nuevas.map((c, i) => Object.assign(c, { id: "c" + i }));
  assert.equal(C.generar({ periodo: "2026", socios, tipos, cuotas: primera }).nuevas.length, 0);
  primera[0] = C.anular(primera[0], "error");
  assert.deepEqual(C.generar({ periodo: "2026", socios, tipos, cuotas: primera }).nuevas.map((c) => c.socioId), ["1"]);
});

test("cuotas mensuales", () => {
  const r = C.generar({ periodo: "2026-03", socios, tipos, cuotas: [] });
  assert.deepEqual(r.nuevas.map((c) => [c.socioId, c.importe, c.concepto]), [["6", 500, "Cuota mensual · marzo 2026"]]);
});

test("pagar, deshacer, devolver y anular", () => {
  const c0 = Object.assign(C.generar({ periodo: "2026", socios, tipos, cuotas: [] }).nuevas[0], { id: "q" });
  assert.throws(() => C.registrarPago(c0, { fecha: "", forma: "Bizum" }), /fecha/);
  assert.throws(() => C.registrarPago(c0, { fecha: "2026-02-01", forma: "Cheque raro" }), /forma/);
  const pagada = C.registrarPago(c0, { fecha: "2026-02-01", forma: "Bizum", cuentaId: "banco" });
  assert.equal(pagada.estado, "pagada");
  assert.equal(c0.estado, "pendiente", "no modifica la original");
  const deshecha = C.deshacerPago(pagada);
  assert.deepEqual([deshecha.estado, deshecha.pago], ["pendiente", null]);
  const devuelta = C.devolver(pagada, "2026-02-10", "Sin fondos");
  assert.ok(C.debe(devuelta));
  const anulada = C.anular(devuelta, "Baja");
  assert.ok(!C.debe(anulada));
  assert.throws(() => C.registrarPago(anulada, { fecha: "2026-03-01", forma: "Efectivo" }), /anulada/);
  assert.deepEqual(anulada.historial.map((h) => h.accion), ["pago", "devuelta", "anulada"]);
});

test("resumen, deudores y al corriente", () => {
  const base = C.generar({ periodo: "2026", socios, tipos, cuotas: [] }).nuevas.map((c, i) => Object.assign(c, { id: "c" + i }));
  const cuotas = [
    C.registrarPago(base[0], { fecha: "2026-02-01", forma: "Transferencia", cuentaId: "banco" }),
    base[1],
    C.anular(base[2], "baja"),
  ];
  const r = C.resumen(cuotas);
  assert.deepEqual([r.emitido, r.cobrado, r.pendiente, r.anulado, r.nPagadas, r.nPendientes], [6000, 3000, 3000, 3000, 1, 1]);
  assert.deepEqual(r.porForma, { Transferencia: 3000 });
  const d = C.deudores(cuotas);
  assert.deepEqual(d.map((x) => [x.socioId, x.total]), [["2", 3000]]);
  assert.ok(C.alCorriente("1", cuotas));
  assert.ok(!C.alCorriente("2", cuotas));
});

test("las cuotas pagadas pasan a la contabilidad como ingresos", () => {
  const cuentas = [{ id: "banco", tipo: "banco" }, { id: "caja", tipo: "caja" }];
  assert.equal(C.cuentaPorDefecto("Efectivo", cuentas), "caja");
  assert.equal(C.cuentaPorDefecto("Bizum", cuentas), "banco");
  const base = C.generar({ periodo: "2026", socios, tipos, cuotas: [] }).nuevas.map((c, i) => Object.assign(c, { id: "c" + i }));
  const cuotas = [
    C.registrarPago(base[1], { fecha: "2026-05-01", forma: "Efectivo", cuentaId: "caja" }),
    C.registrarPago(base[0], { fecha: "2026-02-01", forma: "Transferencia", cuentaId: "banco" }),
    base[2],
  ];
  const m = C.aMovimientos(cuotas);
  assert.equal(m.length, 2);
  assert.deepEqual(m.map((x) => [x.fecha, x.importe, x.cuentaId, x.tipo, x.categoria]),
    [["2026-02-01", 3000, "banco", "ingreso", "Cuotas de socios"], ["2026-05-01", 3000, "caja", "ingreso", "Cuotas de socios"]]);
  assert.deepEqual(m[0].origen, { tipo: "cuota", id: "c0" });
});

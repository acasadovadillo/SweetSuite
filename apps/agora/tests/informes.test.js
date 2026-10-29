// Tests de informes con los datos de demostración: que las cifras cuadren entre sí.
const test = require("node:test");
const assert = require("node:assert/strict");
const Demo = require("../src/js/datos/demo.js");
const I = require("../src/js/logica/informes.js");
const T = require("../src/js/logica/tesoreria.js");
const D = require("../src/js/nucleo/dinero.js");

const doc = Demo.documentoDemo(new Date(2026, 9, 5));
const c = doc; // el documento ya tiene todas las colecciones y la configuración

test("memoria: socios, actividades, proyectos y reuniones del año", () => {
  const m = I.memoria(c, 2026);
  assert.equal(m.socios.activos, doc.socios.filter((s) => !s.fechaBaja || s.fechaBaja > "2026-12-31").filter((s) => s.fechaAlta <= "2026-12-31").length);
  assert.equal(m.socios.activos, m.socios.inicio + m.socios.altas - m.socios.bajas, "a 31/12 = a 1/1 + altas − bajas");
  assert.equal(D.sumar(Object.values(m.socios.porSexo)), m.socios.activos);
  assert.equal(D.sumar(Object.values(m.socios.porTipo)), m.socios.activos);
  assert.equal(D.sumar(Object.values(m.socios.porEdad)), m.socios.activos);
  assert.ok(m.actividades.every((a) => a.fecha.startsWith("2026")), "solo las del año");
  assert.ok(!m.actividades.some((a) => a.titulo.includes("limpieza")), "sin las canceladas");
  assert.equal(m.totalesActividades.n, m.actividades.length);
  assert.equal(m.totalesActividades.asistentes, D.sumar(m.actividades.map((a) => a.asistentes)));
  assert.ok(m.totalesActividades.personasDistintas <= m.totalesActividades.inscripciones);
  assert.deepEqual(m.reuniones, { "Junta Directiva": 1, "Asamblea General": 1 });
  assert.ok(m.acuerdos.length >= 5);
  assert.equal(m.acuerdos[0].fecha <= m.acuerdos[m.acuerdos.length - 1].fecha, true, "acuerdos en orden cronológico");
  m.acuerdos.forEach(function (x, i) {
    var y = m.acuerdos[i + 1];
    if (!y) return;
    assert.ok(x.fecha <= y.fecha, "acuerdos en orden cronológico");
    if (x.actaId === y.actaId) assert.ok(x.punto <= y.punto, "dentro de un acta, en el orden de los puntos");
  });
  assert.ok(m.proyectos.some((p) => p.nombre === "Taller de ciencia en el barrio" && p.gastoRealizado > 0));
  assert.equal(m.junta.length, 5, "junta vigente a 31/12 (sin quien salió)");
});

test("cuentas: la variación de saldos cuadra con los movimientos de dinero del año", () => {
  const k = I.cuentas(c, 2026);
  const libro = T.libro(c.movimientos, c.cuotas, c.actividades).filter((m) => m.fecha >= "2026-01-01" && m.fecha <= "2026-12-31" && m.tipo !== "traspaso");
  assert.equal(k.saldosFin.total - k.saldosInicio.total, D.sumar(libro.map(T.conSigno)));
  assert.equal(k.resultados.resultado, k.resultados.totalIngresos - k.resultados.totalGastos);
  assert.ok(k.anterior.totalIngresos > 0, "hay datos del año anterior (cuotas de 2025)");
});

test("cuentas: el modelo ESFL da el mismo excedente que el resumen de caja", () => {
  const k = I.cuentas(c, 2026);
  assert.equal(k.esfl.excedente, k.resultados.resultado);
  const cuotas = k.esfl.lineas.find((l) => l.id === "1a");
  assert.equal(cuotas.importe, k.resultados.ingresos.cuotas);
  assert.ok(k.esfl.lineas.filter((l) => l.importe < 0).every((l) => ["3", "6", "8", "9", "15", "19"].includes(l.id)), "los gastos restan");
  // Los movimientos sin categoría de la demostración se avisan (y van a «otros ingresos/gastos»).
  assert.ok(k.esfl.sinPartida.length > 0 && k.esfl.sinPartida.every((x) => x.categoria === "Sin clasificar"));
  // Una categoría con su partida elegida a mano.
  const r = I.cuentaEsfl({ ingresos: { nueva: 1000 }, gastos: { otra: 300 } }, [{ id: "nueva", partida: "1c" }, { id: "otra", partida: "15" }]);
  assert.deepEqual([r.lineas.find((l) => l.id === "1c").importe, r.lineas.find((l) => l.id === "15").importe, r.excedenteActividad, r.excedenteFinanciero, r.excedente], [1000, -300, 1000, -300, 700]);
});

test("pendientes a una fecha: lo que se cobró después sigue pendiente en esa fecha", () => {
  const antes = I.pendientesEn(c, "2026-03-14");
  const despues = I.pendientesEn(c, "2026-12-31");
  // La factura 2026-0001 (20/02) se cobró el 15/03: a 14/03 estaba pendiente; a 31/12 ya no.
  assert.ok(antes.facturasEmitidas.lista.some((f) => f.numero === "2026-0001"));
  assert.ok(!despues.facturasEmitidas.lista.some((f) => f.numero === "2026-0001"));
  assert.ok(despues.facturasEmitidas.lista.some((f) => f.numero === "2026-0002"));
  assert.ok(despues.cuotas.importe > 0);
  assert.equal(despues.anticipos.importeSeLesDebe, 1850, "el reembolso de la demostración sigue sin pagar");
  const k = I.cuentas(c, 2026);
  assert.equal(k.situacion.neto, k.situacion.totalActivo - k.situacion.totalPasivo);
  assert.equal(k.situacion.activo.tesoreria, k.saldosFin.total);
});

test("panel y series para las gráficas", () => {
  const p = I.panel(c, "2026-10-05");
  assert.equal(p.serieSaldo.length, 12);
  assert.equal(p.serieSaldo[11].fecha, "2026-10-05", "el último punto es hoy");
  assert.equal(p.serieSaldo[11].valor, p.saldo.total);
  assert.equal(p.serieSaldo[0].fecha, "2025-11-30");
  assert.equal(p.serieSocios[11].valor, p.socios.activos);
  assert.equal(p.resultado, p.ingresos - p.gastos);
  assert.ok(p.subvencionesEnMarcha.length >= 1);
  assert.deepEqual(I.finesDeMes("2026-03-15", 3), ["2026-01-31", "2026-02-28", "2026-03-15"]);
});

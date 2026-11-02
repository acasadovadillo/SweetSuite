// La contabilidad de una asociación sobre los datos de Solvento: facturas que
// se cobran con movimientos, subvenciones por centro de coste, las cuentas del
// ejercicio y los extractos del banco (src/js/asociacion/contabilidad.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/js/asociacion/contabilidad.js");
const Fac = require("../src/js/asociacion/facturas.js");

const linea = (cantidad, precio, tipoIva = 21) => ({ concepto: "Taller", cantidad, precio, tratamiento: "sujeto", tipoIva });
const mov = (o) => Object.assign({ id: "m" + Math.random(), tipo: "Gasto", importe: "0", cuenta_origen: "", cuenta_destino: "",
  tipo_gasto: "", tipo_ingreso: "", centro: "", detalle: "" }, o);

test("emitir un borrador le da su número, y uno incompleto no se emite", () => {
  const ya = [{ tipo: "emitida", estado: "emitida", numero: "2026-0004", fecha: "2026-02-01" }];
  const f = Object.assign(C.facturaNueva("emitida", "2026-03-10"), { tercero: { nombre: "Ayuntamiento" }, lineas: [linea(1, 10000)] });
  const e = C.emitir(f, ya, {});
  assert.equal(e.numero, "2026-0005");
  assert.equal(e.estado, "emitida");
  assert.throws(() => C.emitir(C.facturaNueva("emitida", "2026-03-10"), ya, {}), /cliente/);
  // Una rectificativa va en su serie
  const r = Object.assign(Fac.rectificativa(e, "Precio mal", "2026-03-20"), { id: "r1" });
  assert.equal(C.emitir(r, ya.concat([e]), {}).numero, "R-2026-0001");
});

test("lo cobrado de una factura sale de sus movimientos, y el cobro es un ingreso en la cuenta", () => {
  const f = Object.assign(C.facturaNueva("emitida"), { id: "f1", estado: "emitida", numero: "2026-0001", tercero: { nombre: "Club" },
    lineas: [linea(1, 10000)], categoria: "Ventas", centro: "Proyectos > Huerto" });     // 100 + 21 = 121 €
  assert.equal(C.estadoPago(f, []).estado, "pendiente");
  const m = C.movimientoDePago(f, { cuenta: "Bankinter", fecha: "2026-04-02", movimientos: [] });
  assert.deepEqual([m.tipo, m.importe, m.cuenta_destino, m.cuenta_origen, m.tipo_ingreso, m.centro, m.factura, m.fecha],
    ["Ingreso", "121.00", "Bankinter", "", "Ventas", "Proyectos > Huerto", "f1", "02/04/2026"]);
  const parte = Object.assign({}, m, { importe: "21.00" });
  const e = C.estadoPago(f, [parte]);
  assert.deepEqual([e.estado, e.pendiente], ["parcial", 10000]);
  assert.equal(C.estadoPago(f, [parte, Object.assign({}, m, { importe: "100" })]).estado, "cobrada");
  assert.equal(C.movimientoDePago(f, { cuenta: "B", movimientos: [parte] }).importe, "100.00");
});

test("una factura recibida se paga con un gasto, y una rectificativa en negativo devuelve", () => {
  const rec = Object.assign(C.facturaNueva("recibida"), { id: "r", numero: "F-77", tercero: { nombre: "Imprenta" }, lineas: [linea(1, 5000)], categoria: "Material" });
  const p = C.movimientoDePago(rec, { cuenta: "Caja", fecha: "2026-05-01" });
  assert.deepEqual([p.tipo, p.cuenta_origen, p.tipo_gasto, p.importe], ["Gasto", "Caja", "Material", "60.50"]);
  const orig = Object.assign(C.facturaNueva("emitida"), { id: "o", estado: "emitida", numero: "2026-0001", tercero: { nombre: "X" }, lineas: [linea(1, 1000)] });
  const rect = Object.assign(Fac.rectificativa(orig, "Anulada", "2026-02-01"), { id: "x", estado: "emitida", numero: "R-2026-0001" });
  const dev = C.movimientoDePago(rect, { cuenta: "Banco" });
  assert.deepEqual([dev.tipo, dev.cuenta_origen, dev.importe], ["Gasto", "Banco", "12.10"]);
});

test("el resumen cuenta lo que queda por cobrar y por pagar", () => {
  const e1 = Object.assign(C.facturaNueva("emitida"), { id: "a", estado: "emitida", numero: "1", tercero: { nombre: "A" }, lineas: [linea(1, 10000)] });
  const r1 = Object.assign(C.facturaNueva("recibida"), { id: "b", numero: "2", tercero: { nombre: "B" }, lineas: [linea(1, 1000, 0)] });
  const b = C.facturaNueva("emitida");
  const r = C.resumenFacturas([e1, r1, b], [mov({ tipo: "Ingreso", importe: "21", factura: "a" })]);
  assert.deepEqual([r.porCobrar, r.nPorCobrar, r.porPagar, r.nPorPagar, r.borradores], [10000, 1, 1000, 1, 1]);
});

test("una subvención: lo imputado a su centro (y a los de dentro), frente a su presupuesto", () => {
  const s = Object.assign(C.subvencionNueva(), { centro: "Subvenciones > Huerto", presupuesto: { "gasto|Material": "1000", "ingreso|Subvenciones": "1500" } });
  const movs = [
    mov({ tipo: "Gasto", importe: "400", tipo_gasto: "Material > Semillas", centro: "Subvenciones > Huerto" }),
    mov({ tipo: "Gasto", importe: "100", tipo_gasto: "Material > Semillas", centro: "Subvenciones > Huerto > Taller" }),
    mov({ tipo: "Gasto", importe: "999", tipo_gasto: "Material", centro: "Subvenciones > Huertos" }),          // otro centro
    mov({ tipo: "Ingreso", importe: "750", tipo_ingreso: "Subvenciones", centro: "Subvenciones > Huerto" }),
    mov({ tipo: "Traspaso", importe: "50", centro: "Subvenciones > Huerto" }),                                  // no es ni ingreso ni gasto
  ];
  const ej = C.ejecucion(s, movs);
  assert.equal(ej.movimientos.length, 3);
  assert.deepEqual(ej.gastos, { previsto: 1000, realizado: 500 });
  assert.deepEqual(ej.ingresos, { previsto: 1500, realizado: 750 });
  // Por categoría de primer nivel: «Material > Semillas» cuenta en «Material»
  assert.deepEqual(ej.filas.map((f) => [f.tipo, f.categoria, f.previsto, f.realizado]),
    [["gasto", "Material", 1000, 500], ["ingreso", "Subvenciones", 1500, 750]]);
  assert.equal(C.ejecucion(Object.assign({}, s, { centro: "" }), movs).movimientos.length, 0, "sin centro, nada es suyo");
});

test("el plazo que toca de una subvención, según su estado", () => {
  const s = Object.assign(C.subvencionNueva(), { plazoSolicitud: "2026-03-01", plazoJustificacion: "2027-01-31" });
  assert.deepEqual(C.proximoPlazo(s, "2026-04-01"), { etiqueta: "Pedirla antes del", fecha: "2026-03-01", vencido: true });
  assert.equal(C.proximoPlazo(Object.assign({}, s, { estadoSubvencion: "concedida" }), "2026-04-01").fecha, "2027-01-31");
  assert.equal(C.proximoPlazo(Object.assign({}, s, { estadoSubvencion: "concedida", fechaJustificacion: "2026-12-01" })), null);
});

test("las cuentas del ejercicio: cada categoría en su partida, solo ese año y sin traspasos", () => {
  const movs = [
    mov({ tipo: "Ingreso", fecha: "15/01/2026", importe: "300", tipo_ingreso: "Cuotas de socios" }),
    mov({ tipo: "Ingreso", fecha: "20/02/2026", importe: "1000", tipo_ingreso: "Subvenciones > Ayuntamiento" }),
    mov({ tipo: "Ingreso", fecha: "20/02/2026", importe: "50", tipo_ingreso: "Rifa" }),
    mov({ tipo: "Gasto", fecha: "01/03/2026", importe: "200", tipo_gasto: "Material > Papelería" }),
    mov({ tipo: "Gasto", fecha: "02/03/2026", importe: "12.5", tipo_gasto: "Comisiones bancarias" }),
    mov({ tipo: "Gasto", fecha: "02/03/2025", importe: "999", tipo_gasto: "Material" }),     // otro año
    mov({ tipo: "Traspaso", fecha: "02/03/2026", importe: "500" }),
  ];
  const c = C.cuentasEjercicio(movs, 2026, {});
  assert.deepEqual(c.ingresos.map((p) => [p.partida, p.total]), [["1a", 300], ["1d", 1000], ["7", 50]]);
  assert.deepEqual(c.gastos.map((p) => [p.partida, p.total]), [["6", 200], ["9", 12.5]]);
  assert.deepEqual([c.totalIngresos, c.totalGastos, c.resultado], [1350, 212.5, 1137.5]);
  assert.deepEqual(c.ingresos[1].categorias, [{ nombre: "Subvenciones", total: 1000 }]);
  // Lo que se cambie en Ajustes manda sobre la pista del nombre
  const otra = C.cuentasEjercicio(movs, 2026, { partidasEjercicio: { "ingreso|Rifa": "1c" } });
  assert.deepEqual(otra.ingresos.map((p) => p.partida), ["1a", "1c", "1d"]);
  assert.deepEqual(C.aniosConMovimientos(movs), [2026, 2025]);
});

test("un extracto del banco: movimientos de esa cuenta, sin repetir lo que ya está y con la categoría aprendida", () => {
  const filas = [["Extracto de la cuenta"], [], ["Fecha", "Concepto", "Importe", "Saldo"],
    ["01/04/2026", "RECIBO LUZ ENDESA", "-45,20", "1000"],
    ["02/04/2026", "TRANSFERENCIA CUOTA PEPA", "30,00", "1030"],
    ["03/04/2026", "COMISION MANTENIMIENTO", "-3,00", "1027"]];
  const ya = [
    mov({ tipo: "Gasto", fecha: "01/04/2026", importe: "45.20", cuenta_origen: "Banco", detalle: "RECIBO LUZ ENDESA" }),
    mov({ tipo: "Gasto", fecha: "01/03/2026", importe: "3", cuenta_origen: "Banco", detalle: "COMISION MANTENIMIENTO", tipo_gasto: "Comisiones bancarias" }),
  ];
  const r = C.importarExtracto({ filas, filaCabecera: 2, columnas: { fecha: 0, concepto: 1, importe: 2, saldo: 3 }, cuenta: "Banco", movimientos: ya });
  assert.equal(r.duplicados, 1);
  assert.deepEqual(r.nuevos.map((m) => [m.fecha, m.tipo, m.importe, m.cuenta_origen, m.cuenta_destino, m.tipo_gasto, m.origen]),
    [["02/04/2026", "Ingreso", "30.00", "", "Banco", "", "extracto"], ["03/04/2026", "Gasto", "3.00", "Banco", "", "Comisiones bancarias", "extracto"]]);
});

test("lo que viene de Agora se junta una vez: traerlo dos veces no repite nada", () => {
  // Un paquete como el que prepara Agora (apps/agora/src/js/logica/traspaso.js)
  const Tr = require("../../agora/src/js/logica/traspaso.js");
  const p = Tr.paquete({
    config: { cuentas: [{ id: "b", nombre: "Bankinter", tipo: "banco", saldoInicial: 20000, fechaSaldoInicial: "2025-12-31" }],
      categorias: [{ id: "seg", nombre: "Seguros", tipo: "gasto" }], iva: { prorrata: 90 } },
    movimientos: [{ id: "m1", fecha: "2026-02-01", cuentaId: "b", tipo: "gasto", importe: 4000, categoriaId: "seg", facturaId: "f1" }],
    cuotas: [{ id: "q1", socioNumero: 1, socioNombre: "Ana", concepto: "Cuota", importe: 3000, estado: "pagada",
      pago: { fecha: "2026-03-01", forma: "Transferencia", cuentaId: "b" } }],
    facturas: [{ id: "f1", tipo: "recibida", estado: "emitida", numero: "X-1", fecha: "2026-01-30", tercero: { nombre: "Aseguradora" },
      lineas: [{ concepto: "Póliza", cantidad: 1, precio: 4000, tratamiento: "exento", tipoIva: 0 }], categoriaId: "seg" }],
    proyectos: [{ id: "p1", nombre: "Huerto", tipo: "subvencion", importeConcedido: 100000, presupuesto: {} }],
    anticipos: [], asociacion: { nombre: "ABIES", nif: "G1" },
  }, "2026-11-02");
  const doc = { movimientos: [mov({ id: "propio", tipo: "Gasto", importe: "5", cuenta_origen: "Bankinter" })],
    config: { cuentas: [{ cuenta: "Bankinter" }], categorias: ["Material"], categorias_ingreso: [] } };
  const r = C.traerDeAgora(doc, p);
  assert.deepEqual(r, { movimientos: 3, facturas: 1, subvenciones: 1, cuentas: 0, yaEstaban: 0 });
  assert.deepEqual(doc.config.categorias.sort(), ["Material", "Seguros"]);
  assert.ok(doc.config.categorias_ingreso.includes("Cuotas de socios"));
  assert.ok(doc.config.centros.includes("Subvenciones > Huerto") && doc.config.centros.includes("Subvenciones"));
  assert.deepEqual([doc.config.entidad.nombre, doc.config.iva.prorrata], ["ABIES", 90]);
  // La factura queda pagada por su movimiento, y el saldo inicial no es un ingreso del ejercicio
  assert.equal(C.estadoPago(doc.facturas[0], doc.movimientos).estado, "pagada");
  const ej = C.cuentasEjercicio(doc.movimientos, 2025, doc.config);
  assert.equal(ej.totalIngresos, 0);
  // Otra vez: nada nuevo
  const otra = C.traerDeAgora(doc, p);
  assert.deepEqual(otra, { movimientos: 0, facturas: 0, subvenciones: 0, cuentas: 0, yaEstaban: 5 });
  assert.equal(doc.movimientos.length, 4);
  assert.throws(() => C.traerDeAgora(doc, { tipo: "otra cosa" }), /no es el dinero de Agora/);
});

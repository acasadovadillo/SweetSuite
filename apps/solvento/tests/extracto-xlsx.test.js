// Tests de la importación del extracto bancario y del Excel (.xlsx).
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/js/asociacion/extracto.js");
const XLSX = require("../src/js/asociacion/xlsx.js");

const filas = [
  ["Banco Ejemplo"], ["Cuenta: ES00 0000"], [],
  ["Fecha operación", "Fecha valor", "Concepto", "Importe", "Saldo"],
  ["01/03/2026", "01/03/2026", "TRANSF DE MARTA EJEMPLO PRUEBA CUOTA", "30,00", "1.030,00"],
  ["02/03/2026", "02/03/2026", "COMISION MANTENIMIENTO", "-2,50", "1.027,50"],
  ["", "", "Saldo final", "", "1.027,50"],
  ["03/03/2026", "", "RECIBO SEGURO RC", "-180,00", ""],
  ["fecha mala", "", "ALGO", "-1,00", ""],
];

test("detecta la fila de títulos y las columnas", () => {
  const d = E.detectarColumnas(filas);
  assert.equal(d.fila, 3);
  assert.deepEqual(d.columnas, { fecha: 0, concepto: 2, importe: 3, saldo: 4 });
});

test("convierte el extracto: signo, duplicados, reglas y filas raras", () => {
  const d = E.detectarColumnas(filas);
  const existentes = [{ tipo: "gasto", cuentaId: "banco", fecha: "2026-03-02", importe: 250, concepto: "Comisión", conceptoBanco: "COMISION MANTENIMIENTO" }];
  const r = E.convertir({ filas, columnas: d.columnas, filaCabecera: d.fila, cuentaId: "banco", existentes, reglas: [{ texto: "seguro", categoriaId: "seguros" }] });
  assert.equal(r.duplicados, 1);
  assert.deepEqual(r.nuevos.map((m) => [m.fecha, m.tipo, m.importe, m.categoriaId, m.origen]),
    [["2026-03-01", "ingreso", 3000, "", "extracto"], ["2026-03-03", "gasto", 18000, "seguros", "extracto"]]);
  assert.deepEqual(r.problemas, [{ fila: 9, mensaje: "Sin fecha válida: no se importa." }]);
});

test("extractos con columnas de cargo y abono, y fechas de Excel", () => {
  const f = [["Fecha", "Concepto", "Cargo", "Abono"], ["2026-03-05", "X", "12,00", ""], [XLSX.fechaASerie("2026-03-06"), "Y", "", 50]];
  const d = E.detectarColumnas(f);
  const r = E.convertir({ filas: f, columnas: d.columnas, filaCabecera: d.fila, cuentaId: "c" });
  assert.deepEqual(r.nuevos.map((m) => [m.fecha, m.tipo, m.importe]), [["2026-03-05", "gasto", 1200], ["2026-03-06", "ingreso", 5000]]);
});

test("Excel: lo que se escribe se vuelve a leer", async () => {
  const bytes = XLSX.escribir([
    { nombre: "Movimientos: 2026", columnas: [{ titulo: "Fecha", tipo: "fecha" }, { titulo: "Concepto" }, { titulo: "Importe", tipo: "dinero" }, { titulo: "N", tipo: "numero" }],
      filas: [["2026-03-01", "Cuota <Ana> & \"Bea\" · ñ", 1250, 3], ["2026-03-02", "", -99, null]] },
    { nombre: "Otra", columnas: [{ titulo: "A" }], filas: [["x"]] },
  ]);
  assert.equal(bytes[0], 0x50); // «PK»: es un ZIP
  const hojas = await XLSX.leer(bytes);
  assert.deepEqual(Object.keys(hojas), ["Movimientos  2026", "Otra"], "los «:» no valen en el nombre de una hoja");
  const h = hojas["Movimientos  2026"];
  assert.deepEqual(h[0], ["Fecha", "Concepto", "Importe", "N"]);
  assert.equal(XLSX.serieAFecha(h[1][0]), "2026-03-01");
  assert.deepEqual(h[1].slice(1), ["Cuota <Ana> & \"Bea\" · ñ", 12.5, 3]);
  assert.equal(h[2][2], -0.99);
  assert.equal(XLSX.fechaASerie("1900-01-01"), 2);
  const repetidas = await XLSX.leer(XLSX.escribir([{ nombre: "A", columnas: [{ titulo: "x" }], filas: [] }, { nombre: "a", columnas: [{ titulo: "x" }], filas: [] }]));
  assert.deepEqual(Object.keys(repetidas), ["A", "a (2)"]);
});

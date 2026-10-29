// Tests del módulo de dinero: céntimos, lectura de importes escritos a mano,
// formato español y redondeos. Ejecutar: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/js/nucleo/dinero.js");

test("redondear: la mitad se aleja del cero", () => {
  assert.equal(D.redondear(2.5), 3);
  assert.equal(D.redondear(-2.5), -3);
  assert.equal(D.redondear(2.4999), 2);
  assert.equal(D.redondear(0), 0);
});

test("aCentimos resiste los errores de coma flotante", () => {
  assert.equal(D.aCentimos(1.005), 101);   // 1.005 * 100 = 100.49999… en coma flotante
  assert.equal(D.aCentimos(0.1 + 0.2), 30);
  assert.equal(D.aCentimos(19.99), 1999);
  assert.equal(D.aCentimos(-4.355), -436);
  assert.equal(D.aCentimos("no"), null);
});

test("desdeTexto entiende cómo se escriben los importes en España", () => {
  const casos = {
    "12": 1200, "12,5": 1250, "12,50": 1250, "1.234,56": 123456, "1234,56": 123456,
    "1.234": 123400, "1.234.567": 123456700, "1234.56": 123456, "12.5": 1250,
    "1,234.56": 123456, "15 €": 1500, "15€": 1500, " 1 234,56 ": 123456,
    "-3,20": -320, "−3,20": -320, "+7": 700, ",5": 50, "0": 0, "-0": 0,
  };
  for (const [texto, esperado] of Object.entries(casos)) {
    assert.equal(D.desdeTexto(texto), esperado, `«${texto}»`);
  }
});

test("desdeTexto redondea más allá del céntimo y rechaza lo que no entiende", () => {
  assert.equal(D.desdeTexto("1,005"), 101);
  assert.equal(D.desdeTexto("1,004"), 100);
  assert.equal(D.desdeTexto("-1,005"), -101);
  for (const malo of ["", "abc", "1,2,3", "12a", "1.2.3,4,5", null, undefined]) {
    assert.equal(D.desdeTexto(malo), null, `«${malo}»`);
  }
});

test("formatear da el formato español con símbolo de euro", () => {
  assert.equal(D.formatear(123456), "1.234,56\u00a0€");
  assert.equal(D.formatear(5), "0,05\u00a0€");
  assert.equal(D.formatear(-320), "−3,20\u00a0€");
  assert.equal(D.formatear(100000000), "1.000.000,00\u00a0€");
  assert.equal(D.formatear(123456, { simbolo: false }), "1.234,56");
  assert.equal(D.formatear(null), "—");
});

test("leer lo que se formateó devuelve el mismo importe", () => {
  for (const c of [0, 1, 99, 100, 123456, -98765, 100000001]) {
    assert.equal(D.desdeTexto(D.formatear(c)), c);
  }
});

test("porcentaje redondea al céntimo", () => {
  assert.equal(D.porcentaje(10000, 21), 2100);
  assert.equal(D.porcentaje(1999, 21), 420);   // 419,79 → 420
  assert.equal(D.porcentaje(1250, 10.5), 131); // 131,25 → 131
  assert.equal(D.porcentaje(250, 21), 53);     // 52,5 → 53 (la mitad se aleja del cero)
});

test("repartir: las partes suman exactamente el total", () => {
  assert.deepEqual(D.repartir(1000, 3), [334, 333, 333]);
  assert.deepEqual(D.repartir(-1000, 3), [-334, -333, -333]);
  assert.deepEqual(D.repartir(5, 0), []);
  for (const [total, n] of [[100001, 7], [1, 3], [999999, 12]]) {
    assert.equal(D.sumar(D.repartir(total, n)), total);
  }
});

test("sumar ignora valores vacíos", () => {
  assert.equal(D.sumar([100, null, 250, undefined, NaN]), 350);
  assert.equal(D.sumar([]), 0);
});

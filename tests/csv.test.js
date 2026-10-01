// Tests del CSV: lo que escribimos lo abre Excel en español y lo que leemos
// puede venir de cualquier hoja de cálculo.
const test = require("node:test");
const assert = require("node:assert/strict");
const CSV = require("../src/js/nucleo/csv.js");

test("escribir: punto y coma, BOM, comillas y CRLF", () => {
  const t = CSV.escribir([{ titulo: "Nombre", clave: "n" }, { titulo: "Nota", clave: "x" }],
    [{ n: "Ana", x: 'Dijo "hola"; adiós' }, { n: "Luis", x: "dos\nlíneas" }]);
  assert.equal(t[0], CSV.BOM);
  assert.equal(t.slice(1), 'Nombre;Nota\r\nAna;"Dijo ""hola""; adiós"\r\nLuis;"dos\nlíneas"\r\n');
});

test("escribir protege contra fórmulas de Excel pero no toca los números negativos", () => {
  const t = CSV.escribir([{ titulo: "a", clave: "a" }], [{ a: "=HYPERLINK(\"x\")" }, { a: "+34 600" }, { a: "-12,50" }, { a: "-ojo" }]);
  const lineas = t.slice(1).split("\r\n");
  assert.equal(lineas[1], "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(lineas[2], "'+34 600");
  assert.equal(lineas[3], "-12,50");
  assert.equal(lineas[4], "'-ojo");
});

test("columnas calculadas", () => {
  const t = CSV.escribir([{ titulo: "Doble", valor: (f) => f.n * 2 }], [{ n: 2 }]);
  assert.equal(t.slice(1), "Doble\r\n4\r\n");
});

test("leer: detecta el separador y entiende comillas y saltos de línea", () => {
  const conPuntoYComa = CSV.leer(CSV.BOM + 'Nombre;Nota\r\nAna;"a; b"\r\nLuis;"x\r\ny"\r\n\r\n');
  assert.equal(conPuntoYComa.separador, ";");
  assert.deepEqual(conPuntoYComa.cabecera, ["Nombre", "Nota"]);
  assert.deepEqual(conPuntoYComa.filas, [["Ana", "a; b"], ["Luis", "x\r\ny"]]);
  assert.deepEqual(conPuntoYComa.numeros, [2, 3]);
  assert.deepEqual(CSV.leer("a\n\n1\n;\n2").numeros, [3, 5], "las filas vacías no descuadran la numeración");
  const conComas = CSV.leer('a,b,c\n1,"2,5",3\n');
  assert.equal(conComas.separador, ",");
  assert.deepEqual(conComas.filas, [["1", "2,5", "3"]]);
  const conTab = CSV.leer("a\tb\n1\t2");
  assert.deepEqual(conTab.filas, [["1", "2"]]);
});

test("lo escrito se vuelve a leer igual", () => {
  const filas = [{ a: "uno", b: 'co"mi;llas' }, { a: "", b: "ñandú" }];
  const leido = CSV.leer(CSV.escribir([{ titulo: "A", clave: "a" }, { titulo: "B", clave: "b" }], filas));
  assert.deepEqual(leido.filas, [["uno", 'co"mi;llas'], ["", "ñandú"]]);
});

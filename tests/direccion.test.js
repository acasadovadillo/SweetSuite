// Tests de direcciones postales: formato, provincia por código postal y lectura
// de direcciones escritas en una línea (las que había antes de la versión 2).
// Todas las direcciones son inventadas.
const test = require("node:test");
const assert = require("node:assert/strict");
const Dir = require("../src/js/nucleo/direccion.js");

const con = (partes) => Object.assign(Dir.vacia(), partes);

test("provincia a partir del código postal", () => {
  assert.equal(Dir.provinciaDeCP("28013"), "Madrid");
  assert.equal(Dir.provinciaDeCP("08001"), "Barcelona");
  assert.equal(Dir.provinciaDeCP("01001"), "Araba/Álava");
  assert.equal(Dir.provinciaDeCP("52001"), "Melilla");
  assert.equal(Dir.provinciaDeCP("53000"), "");
  assert.equal(Dir.provinciaDeCP("2803"), "");
  assert.equal(Dir.PROVINCIAS.length, 52);
});

test("reconocer provincias escritas a mano", () => {
  assert.equal(Dir.normalizarProvincia("malaga"), "Málaga");
  assert.equal(Dir.normalizarProvincia("Alicante"), "Alicante/Alacant");
  assert.equal(Dir.normalizarProvincia("València"), "Valencia/València");
  assert.equal(Dir.normalizarProvincia("Vizcaya"), "Bizkaia");
  assert.equal(Dir.normalizarProvincia("La Coruña"), "A Coruña");
  assert.equal(Dir.normalizarProvincia("Atlántida"), "");
});

test("formatear una dirección completa", () => {
  const f = Dir.formatear(con({ tipoVia: "Calle", nombreVia: "Mayor", numero: "15", portal: "2", escalera: "B",
    planta: "5", puerta: "G", codigoPostal: "28013", municipio: "Madrid", provincia: "Madrid" }));
  assert.equal(f.linea1, "Calle Mayor, 15, portal 2, esc. B, 5.º G");
  assert.equal(f.linea2, "28013 Madrid");   // no repite «(Madrid)»
  assert.equal(f.completa, "Calle Mayor, 15, portal 2, esc. B, 5.º G, 28013 Madrid");
});

test("formatear: provincia distinta del municipio, s/n, km y «Otro»", () => {
  assert.equal(Dir.formatear(con({ tipoVia: "Plaza", nombreVia: "de España", numero: "S/N", codigoPostal: "29001",
    municipio: "Villaejemplo", provincia: "Málaga" })).completa, "Plaza de España, s/n, 29001 Villaejemplo (Málaga)");
  assert.equal(Dir.formatear(con({ tipoVia: "Carretera", nombreVia: "de Ejemplo", km: "3,5" })).linea1, "Carretera de Ejemplo, km 3,5");
  assert.equal(Dir.formatear(con({ tipoVia: "Otro", nombreVia: "Senda del Río", numero: "2" })).linea1, "Senda del Río, 2");
  assert.equal(Dir.formatear(con({ planta: "Bajo", puerta: "A" })).linea1, "Bajo A");
  assert.equal(Dir.formatear(con({ municipio: "Alicante", provincia: "Alicante/Alacant" })).linea2, "Alicante");
  assert.equal(Dir.formatear(Dir.vacia()).completa, "");
});

test("leer direcciones escritas en una línea", () => {
  const casos = [
    ["C/ Mayor, 15, 5° G", { tipoVia: "Calle", nombreVia: "Mayor", numero: "15", planta: "5", puerta: "G" }],
    ["Calle Mayor 15, 5ºG", { tipoVia: "Calle", nombreVia: "Mayor", numero: "15", planta: "5", puerta: "G" }],
    ["Avda. de la Ilustración, 3, bajo B", { tipoVia: "Avenida", nombreVia: "de la Ilustración", numero: "3", planta: "Bajo", puerta: "B" }],
    ["Pza. del Ejemplo, s/n", { tipoVia: "Plaza", nombreVia: "del Ejemplo", numero: "s/n" }],
    ["Pº de las Acacias, nº 7, portal 2, esc. izda, 3ª dcha", { tipoVia: "Paseo", nombreVia: "de las Acacias", numero: "7", portal: "2", escalera: "izda", planta: "3", puerta: "DCHA" }],
    ["Ctra. de Ejemplo, km 4", { tipoVia: "Carretera", nombreVia: "de Ejemplo", km: "4" }],
    ["Camino Real, 2, Local 3", { tipoVia: "Camino", nombreVia: "Real", numero: "2", complemento: "Local 3" }],
    ["Centro cívico El Ejemplo", { tipoVia: "", nombreVia: "Centro cívico El Ejemplo" }],
  ];
  for (const [texto, esperado] of casos) {
    const d = Dir.desdeTexto(texto);
    for (const [campo, valor] of Object.entries(esperado)) assert.equal(d[campo], valor, `«${texto}» → ${campo}`);
  }
  assert.deepEqual(Dir.desdeTexto(""), Dir.vacia());
});

test("leer una línea no pierde texto: lo que no entiende va a «complemento»", () => {
  const d = Dir.desdeTexto("C/ Mayor, 15, junto a la iglesia");
  assert.equal(d.complemento, "junto a la iglesia");
});

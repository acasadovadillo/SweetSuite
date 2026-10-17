// Tests de la capa de datos: esquema y migraciones, repositorio, cifrado,
// formato de las copias de seguridad y datos de demostración.
const test = require("node:test");
const assert = require("node:assert/strict");
const Esquema = require("../src/js/datos/esquema.js");
const { crearRepositorio } = require("../src/js/datos/repositorio.js");
const Copia = require("../src/js/datos/copia.js");
const Demo = require("../src/js/datos/demo.js");
const Cripto = require("../src/js/nucleo/cripto.js");
const V = require("../src/js/nucleo/validar.js");

// ── Esquema ────────────────────────────────────────────────────────────────
test("un documento vacío ya está en la versión actual", () => {
  const doc = Esquema.documentoVacio();
  assert.equal(doc.esquema, Esquema.VERSION);
  assert.deepEqual(Esquema.migrar(doc), doc);
});

test("migrar completa un documento antiguo o incompleto sin perder lo que tenía", () => {
  const viejo = { asociacion: { nombre: "Peña El Ejemplo", domicilio: { municipio: "Villaejemplo" } }, junta: [{ id: "x", nombre: "A" }] };
  const doc = Esquema.migrar(viejo);
  assert.equal(doc.esquema, Esquema.VERSION);
  assert.equal(doc.asociacion.nombre, "Peña El Ejemplo");
  assert.equal(doc.asociacion.domicilio.municipio, "Villaejemplo");
  assert.equal(doc.asociacion.domicilio.codigoPostal, "");
  assert.equal(doc.junta.length, 1);
  assert.equal(doc.meta.cambiosDesdeCopia, 0);
  assert.equal(viejo.esquema, undefined, "no modifica el original");
});

test("migrar completa lo que falte aunque el documento diga ser de una versión reciente", () => {
  const doc = Esquema.migrar({ app: "webkit_asociaciones", esquema: 2, asociacion: { nombre: "Peña" } });
  assert.equal(doc.asociacion.nombre, "Peña", "no pierde lo que había");
  assert.ok(doc.meta && doc.meta.creado);
  assert.equal(doc.asociacion.domicilio.codigoPostal, "");
  assert.equal(doc.config.tiposSocio.length, 1);
  for (const c of Esquema.COLECCIONES) assert.ok(Array.isArray(doc[c]), c);
});

test("migrar rechaza datos de una versión más nueva o de otra aplicación", () => {
  assert.throws(() => Esquema.migrar({ app: "webkit_asociaciones", esquema: Esquema.VERSION + 1 }), /versión más nueva/);
  assert.throws(() => Esquema.migrar({ app: "otra" }), /otra aplicación/);
  assert.throws(() => Esquema.migrar(null));
  assert.throws(() => Esquema.migrar([1, 2]));
});

// ── Repositorio ────────────────────────────────────────────────────────────
function repoDePrueba() {
  const doc = Esquema.documentoVacio(new Date("2026-01-01T10:00:00Z"));
  let llamadas = 0, n = 0;
  const reloj = () => `2026-01-01T10:00:${String(++n).padStart(2, "0")}Z`;
  const repo = crearRepositorio(doc, () => { llamadas++; }, reloj);
  return { doc, repo, llamadas: () => llamadas };
}

test("guardar crea con id y marcas de tiempo, y actualiza sin cambiar «creado»", async () => {
  const { repo, llamadas } = repoDePrueba();
  const a = await repo.guardar("junta", { cargo: "Presidencia", nombre: "Ana" });
  assert.ok(a.id);
  assert.equal(a.creado, a.modificado);
  const b = await repo.guardar("junta", Object.assign({}, a, { nombre: "Ana María" }));
  assert.equal(b.id, a.id);
  assert.equal(b.creado, a.creado);
  assert.notEqual(b.modificado, a.modificado);
  assert.equal((await repo.listar("junta")).length, 1);
  assert.equal(llamadas(), 2);
});

test("el repositorio devuelve copias: cambiar lo leído no cambia lo guardado", async () => {
  const { repo } = repoDePrueba();
  const a = await repo.guardar("junta", { nombre: "Ana" });
  const leido = await repo.obtener("junta", a.id);
  leido.nombre = "Cambiado sin guardar";
  assert.equal((await repo.obtener("junta", a.id)).nombre, "Ana");
  const asoc = await repo.leer("asociacion");
  asoc.nombre = "X";
  assert.equal((await repo.leer("asociacion")).nombre, "");
});

test("borrar y colecciones desconocidas", async () => {
  const { repo } = repoDePrueba();
  const a = await repo.guardar("junta", { nombre: "Ana" });
  assert.equal(await repo.borrar("junta", a.id), true);
  assert.equal(await repo.borrar("junta", a.id), false);
  assert.equal(await repo.obtener("junta", a.id), null);
  await assert.rejects(() => repo.listar("inventada"), /desconocida/);
  await assert.rejects(() => repo.escribir("junta", []), /no se escribe/);
});

test("contador de cambios desde la última copia", async () => {
  const { repo } = repoDePrueba();
  await repo.escribir("asociacion", { nombre: "A" });
  await repo.guardar("junta", { nombre: "B" });
  assert.equal((await repo.estadoCopia()).cambiosDesdeCopia, 2);
  await repo.marcarCopiaHecha();
  const e = await repo.estadoCopia();
  assert.equal(e.cambiosDesdeCopia, 0);
  assert.ok(e.ultimaCopia);
});

// ── Cifrado ────────────────────────────────────────────────────────────────
test("cifrar y descifrar con la contraseña correcta", async () => {
  const doc = Demo.documentoDemo();
  const llave = await Cripto.crearLlave("una frase bastante larga");
  const bloque = await Cripto.cifrar(doc, llave);
  assert.ok(Cripto.esBloque(bloque));
  assert.ok(!JSON.stringify(bloque).includes("Almendros"), "nada en claro dentro del bloque");
  const r = await Cripto.descifrar(bloque, "una frase bastante larga");
  assert.deepEqual(r.objeto, doc);
  // La llave devuelta sirve para seguir cifrando en la misma sesión.
  const otro = await Cripto.cifrar({ a: 1 }, r.llave);
  assert.equal(otro.sal, bloque.sal);
  assert.notEqual(otro.iv, bloque.iv, "cada guardado usa un iv nuevo");
  assert.deepEqual((await Cripto.descifrar(otro, "una frase bastante larga")).objeto, { a: 1 });
});

test("una contraseña incorrecta o un bloque manipulado no se descifran", async () => {
  const llave = await Cripto.crearLlave("correcta-123");
  const bloque = await Cripto.cifrar({ secreto: true }, llave);
  await assert.rejects(() => Cripto.descifrar(bloque, "incorrecta"), (e) => e.codigo === "CONTRASENA");
  const tocado = Object.assign({}, bloque, { ct: bloque.ct.slice(0, -4) + (bloque.ct.slice(-4) === "AAAA" ? "BBBB" : "AAAA") });
  await assert.rejects(() => Cripto.descifrar(tocado, "correcta-123"), (e) => e.codigo === "CONTRASENA");
  await assert.rejects(() => Cripto.descifrar({ v: 2 }, "x"), /No es un bloque/);
});

// ── Copias de seguridad ───────────────────────────────────────────────────
test("copia cifrada: se arma y se vuelve a leer", async () => {
  const doc = Demo.documentoDemo();
  const llave = await Cripto.crearLlave("contraseña-copia");
  const sobre = Copia.sobreCifrado(await Cripto.cifrar(doc, llave), doc.asociacion.nombre);
  const leida = Copia.leer(JSON.stringify(sobre));
  assert.equal(leida.cifrada, true);
  assert.equal(leida.asociacion, doc.asociacion.nombre);
  const r = await Cripto.descifrar(leida.bloque, "contraseña-copia");
  assert.deepEqual(Esquema.migrar(r.objeto), doc);
});

test("copia sin cifrar y documento suelto", () => {
  const doc = Demo.documentoDemo();
  const leida = Copia.leer(JSON.stringify(Copia.sobreAbierto(doc)));
  assert.equal(leida.cifrada, false);
  assert.deepEqual(leida.documento, doc);
  assert.equal(Copia.leer(JSON.stringify(doc)).cifrada, false);
});

test("archivos que no son copias dan un mensaje claro", () => {
  assert.throws(() => Copia.leer("esto no es json"), /no es JSON/);
  assert.throws(() => Copia.leer('{"hola":1}'), /no es una copia/);
  assert.throws(() => Copia.leer(JSON.stringify({ formato: Copia.FORMATO, version: 1, cifrada: true })), /incompleta/);
  assert.throws(() => Copia.leer(JSON.stringify({ formato: Copia.FORMATO, version: 99 })), /más nueva/);
});

test("nombre del archivo de copia", () => {
  assert.equal(Copia.nombreArchivo("Asociación Cultural Los Almendros (ficticia)", "2026-10-01"),
    "copia-asociacion-cultural-los-almendros-ficticia-2026-10-01.json");
  assert.equal(Copia.nombreArchivo("", "2026-10-01", false), "copia-asociacion-2026-10-01-SIN-CIFRAR.json");
});

// ── Demostración ──────────────────────────────────────────────────────────
test("los datos de demostración son ficticios y válidos", () => {
  const doc = Demo.documentoDemo();
  assert.deepEqual(Esquema.migrar(doc), doc);
  const correos = JSON.stringify(doc).match(/[^\s"@]+@[^\s"]+/g) || [];
  assert.ok(correos.length > 0);
  for (const c of correos) assert.match(c, /@example\.org$/, `correo no ficticio: ${c}`);
  assert.ok(V.nifEntidad(doc.asociacion.nif).valido);
  assert.ok(V.iban(doc.asociacion.iban).valido);
  for (const m of doc.junta) assert.match(m.telefono, /^600 000 0\d\d$/);
  for (const s of doc.socios) {
    assert.match(s.telefono, /^600 000 \d{3}$/);
    assert.equal(s.documento, "", "sin documentos de identidad en la demostración");
  }
  assert.equal(doc.socios.length, 40);
  assert.ok(doc.cuotas.length > 40 && doc.cuotas.some((c) => c.estado === "pagada") && doc.cuotas.some((c) => c.estado === "pendiente"));
});

// ── Migración 1 → 2: domicilio por partes y sin «fines» ───────────────────
test("migrar de la versión 1 reparte el domicilio y quita los fines", () => {
  const v1 = {
    app: "webkit_asociaciones", esquema: 1, meta: { creado: "x", modificado: "x", ultimaCopia: null, cambiosDesdeCopia: 0 },
    asociacion: { nombre: "Peña El Ejemplo", fines: "Lo que sea",
      domicilio: { via: "C/ Mayor, 15, 5° G", codigoPostal: "28013", municipio: "Madrid", provincia: "madrid" } },
    junta: [],
  };
  const doc = Esquema.migrar(v1);
  assert.equal(doc.esquema, Esquema.VERSION);
  assert.equal(doc.asociacion.fines, undefined);
  const d = doc.asociacion.domicilio;
  assert.deepEqual([d.tipoVia, d.nombreVia, d.numero, d.planta, d.puerta], ["Calle", "Mayor", "15", "5", "G"]);
  assert.deepEqual([d.codigoPostal, d.municipio, d.provincia], ["28013", "Madrid", "Madrid"]);
  assert.equal(d.via, undefined, "ya no queda el campo antiguo");
});

test("migrar de la versión 1 sin provincia la deduce del código postal", () => {
  const doc = Esquema.migrar({ app: "webkit_asociaciones", esquema: 1, asociacion: { domicilio: { via: "", codigoPostal: "29001", municipio: "", provincia: "" } }, junta: [] });
  assert.equal(doc.asociacion.domicilio.provincia, "Málaga");
});

// ── Migración 2 → 3 y guardado en bloque ─────────────────────────────────
test("migrar de la versión 2 añade socios, cuotas, remesas y la configuración", () => {
  const v2 = Esquema.migrar({ app: "webkit_asociaciones", esquema: 1, asociacion: {}, junta: [] });
  delete v2.socios; delete v2.cuotas; delete v2.remesas; delete v2.config; v2.esquema = 2;
  const doc = Esquema.migrar(v2);
  assert.equal(doc.esquema, Esquema.VERSION);
  assert.deepEqual([doc.socios, doc.cuotas, doc.remesas], [[], [], []]);
  assert.equal(doc.config.tiposSocio[0].nombre, "Socio");
  assert.equal(doc.config.siguienteNumeroSocio, 1);
});

test("guardarVarios guarda todo con un solo aviso de cambio", async () => {
  const { repo, llamadas } = repoDePrueba();
  const r = await repo.guardarVarios("socios", [{ nombre: "A" }, { nombre: "B" }]);
  assert.equal(r.length, 2);
  assert.ok(r[0].id && r[1].id && r[0].id !== r[1].id);
  assert.equal(llamadas(), 1);
  await repo.guardarVarios("socios", [Object.assign({}, r[0], { nombre: "A2" })]);
  assert.deepEqual((await repo.listar("socios")).map((s) => s.nombre), ["A2", "B"]);
  assert.equal(llamadas(), 2);
  await repo.guardarVarios("socios", []);
  assert.equal(llamadas(), 2, "una lista vacía no cuenta como cambio");
});

test("migrar de la versión 3 añade la tesorería y completa las cuentas que ya había", () => {
  const v3 = Esquema.migrar({ app: "webkit_asociaciones", esquema: 1, asociacion: {}, junta: [] });
  ["movimientos", "facturas", "anticipos", "proyectos"].forEach((c) => delete v3[c]);
  v3.config = { tiposSocio: v3.config.tiposSocio, cuentas: [{ id: "banco", nombre: "Mi banco", tipo: "banco" }], siguienteNumeroSocio: 5 };
  v3.esquema = 3;
  const doc = Esquema.migrar(v3);
  assert.equal(doc.esquema, Esquema.VERSION);
  assert.deepEqual(doc.config.cuentas, [{ id: "banco", nombre: "Mi banco", tipo: "banco", iban: "", saldoInicial: 0, fechaSaldoInicial: "" }]);
  assert.equal(doc.config.siguienteNumeroSocio, 5, "no pierde la configuración que había");
  assert.ok(doc.config.categorias.some((c) => c.id === "cuotas"));
  assert.equal(doc.config.iva.prorrata, 100);
  for (const c of ["movimientos", "facturas", "anticipos", "proyectos"]) assert.deepEqual(doc[c], []);
});

test("migrar de la versión 4 añade las actividades y la zona horaria", () => {
  const v4 = Esquema.migrar({ app: "webkit_asociaciones", esquema: 1, asociacion: {}, junta: [] });
  delete v4.actividades; delete v4.config.zonaHoraria; v4.esquema = 4;
  const doc = Esquema.migrar(v4);
  assert.equal(doc.esquema, Esquema.VERSION);
  assert.deepEqual(doc.actividades, []);
  assert.equal(doc.config.zonaHoraria, "Europe/Madrid");
});

test("migrar de la versión 5 añade actas, obligaciones, documentos y órganos", () => {
  const v5 = Esquema.migrar({ app: "webkit_asociaciones", esquema: 1, asociacion: {}, junta: [] });
  ["actas", "obligaciones", "documentos"].forEach((c) => delete v5[c]);
  delete v5.config.organos; delete v5.config.actas; delete v5.config.limiteArchivoMB; v5.esquema = 5;
  const doc = Esquema.migrar(v5);
  assert.equal(doc.esquema, Esquema.VERSION);
  assert.deepEqual([doc.actas, doc.obligaciones, doc.documentos], [[], [], []]);
  assert.deepEqual(doc.config.organos.map((o) => o.prefijo), ["JD", "CO", "AG"]);
  assert.equal(doc.config.actas.numeracion, "anual");
  assert.equal(doc.config.limiteArchivoMB, 10);
});

// ── Archivos adjuntos ───────────────────────────────────────────────────
test("adjuntar, leer y borrar un archivo (ficha en «documentos», bytes aparte)", async () => {
  const { repo, doc, llamadas } = repoDePrueba();
  const bytes = new Uint8Array([37, 80, 68, 70, 0, 255, 128]);
  const ficha = await repo.guardarArchivo({ nombre: "estatutos.pdf", tipoMime: "application/pdf", categoria: "Estatutos" }, bytes);
  assert.ok(ficha.id);
  assert.equal(ficha.tamano, 7);
  assert.equal(doc.documentos.length, 1);
  assert.ok(!JSON.stringify(doc).includes("37,80,68"), "los bytes no van dentro del documento");
  assert.deepEqual(Array.from(await repo.leerArchivo(ficha.id)), Array.from(bytes));
  assert.equal(llamadas(), 1);
  assert.equal(await repo.borrarArchivo(ficha.id), true);
  assert.equal(await repo.leerArchivo(ficha.id), null);
  assert.equal(doc.documentos.length, 0);
});

test("cifrar y descifrar los bytes de un adjunto, y su paso a base64 para la copia", async () => {
  const llave = await Cripto.crearLlave("contraseña de prueba");
  const bytes = new Uint8Array(100000).map((_, i) => i % 251);
  const cif = await Cripto.cifrarBytes(bytes, llave);
  assert.notDeepEqual(Array.from(cif.ct.slice(0, 20)), Array.from(bytes.slice(0, 20)));
  const ida = Cripto.archivoDesdeBase64(Cripto.archivoABase64(cif));
  assert.deepEqual(Array.from(await Cripto.descifrarBytes(ida, llave)), Array.from(bytes));
  const otra = await Cripto.crearLlave("otra contraseña");
  await assert.rejects(() => Cripto.descifrarBytes(cif, otra), (e) => e.codigo === "CONTRASENA");
});

test("la copia de seguridad lleva los adjuntos", async () => {
  const doc = Demo.documentoDemo();
  const sobre = Copia.sobreAbierto(doc, null, { "doc-1": { datos: "AAEC" } });
  const leida = Copia.leer(JSON.stringify(sobre));
  assert.deepEqual(leida.archivos, { "doc-1": { datos: "AAEC" } });
  assert.deepEqual(Copia.leer(JSON.stringify(Copia.sobreAbierto(doc))).archivos, {});
});

test("migrar de la versión 6 añade los textos de la memoria", () => {
  const v6 = Esquema.migrar({ app: "webkit_asociaciones", esquema: 1, asociacion: {}, junta: [] });
  delete v6.config.memorias; v6.esquema = 6;
  const doc = Esquema.migrar(v6);
  assert.equal(doc.esquema, 7);
  assert.deepEqual(doc.config.memorias, {});
});

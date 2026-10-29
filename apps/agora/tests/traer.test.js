// Traer a Agora una copia de la app de antes (fase D): se abre con lo de
// entonces, se mezcla con lo de ahora y trae sus adjuntos.
const test = require("node:test");
const assert = require("node:assert/strict");
const Cuentas = require("../src/js/datos/cuentas.js");
const Esquema = require("../src/js/datos/esquema.js");
const Copia = require("../src/js/datos/copia.js");
const Cripto = require("../src/js/nucleo/cripto.js");
const Traer = require("../src/js/datos/traer.js");

const IT = 1000;
const ARCHIVO = "contraseña del archivo";
const ADMIN = "contraseña de abies";

// Una copia como la que descargaba «ABIES · Gestión»: la bóveda y un adjunto cifrado
async function copiaDeAntes() {
  const estado = await Cuentas.crear({ contrasenaArchivo: ARCHIVO, contrasenaAdmin: ADMIN, doc: Esquema.documentoVacio(new Date("2025-01-10T10:00:00Z")) }, IT);
  const d = estado.doc;
  d.asociacion.nombre = "ABIES"; d.asociacion.nif = "G00000000";
  d.config.tiposSocio = [{ id: "socio", nombre: "Socio", cuota: 2500, periodicidad: "anual", activo: true }];
  d.socios = [{ id: "s1", numero: 1, nombre: "Ana", creado: "2025-02-01T10:00:00.000Z", modificado: "2025-02-01T10:00:00.000Z" },
    { id: "s2", numero: 2, nombre: "Luis", creado: "2025-02-01T10:00:00.000Z", modificado: "2025-02-01T10:00:00.000Z" }];
  d.config.siguienteNumeroSocio = 3;
  d.documentos = [{ id: "doc1", nombre: "estatutos.pdf", categoria: "Estatutos" }, { id: "doc2", nombre: "sin-bytes.pdf" }];
  await Cuentas.anadirUsuario(estado, { nombre: "Alberto", cargo: "Presidencia", contrasena: "de-entonces" }, IT);
  const adj = Cripto.archivoABase64(await Cripto.cifrarBytes(new TextEncoder().encode("Estatutos"), estado.llaveDatos));
  const texto = JSON.stringify(Copia.sobreBoveda(await Cuentas.sellar(estado), { doc1: adj }));
  return Copia.leer(texto);
}

test("una copia de ABIES se abre con nombre, cargo y las dos contraseñas de entonces", async () => {
  const lectura = await copiaDeAntes();
  assert.equal(Traer.quePide(lectura), "usuario");
  await assert.rejects(() => Traer.abrir(lectura, { nombre: "Alberto", cargo: "Presidencia", contrasena: "otra", contrasenaArchivo: ARCHIVO }),
    (e) => e.codigo === "ACCESO");
  const r = await Traer.abrir(lectura, { nombre: "Alberto", cargo: "Presidencia", contrasena: "de-entonces", contrasenaArchivo: ARCHIVO });
  assert.equal(r.doc.esquema, Esquema.VERSION);
  assert.equal(r.doc.socios.length, 2);
  assert.equal(r.adjuntos.length, 1);
  assert.equal(new TextDecoder().decode(r.adjuntos[0][1]), "Estatutos");
  assert.equal(r.faltan, 1, "el adjunto que no venía en la copia se cuenta");
});

test("una copia antigua cifrada pide su contraseña, y una sin cifrar nada", async () => {
  const doc = Esquema.documentoVacio(); doc.asociacion.nombre = "ABIES";
  const llave = await Cripto.crearLlave("antigua", IT);
  const cifrada = Copia.leer(JSON.stringify(Copia.sobreCifrado(await Cripto.cifrar(doc, llave), "ABIES")));
  assert.equal(Traer.quePide(cifrada), "contrasena");
  await assert.rejects(() => Traer.abrir(cifrada, { contrasenaCopia: "mala" }), (e) => e.codigo === "CONTRASENA");
  assert.equal((await Traer.abrir(cifrada, { contrasenaCopia: "antigua" })).doc.asociacion.nombre, "ABIES");
  const abierta = Copia.leer(JSON.stringify(Copia.sobreAbierto(doc)));
  assert.equal(Traer.quePide(abierta), "nada");
  assert.equal((await Traer.abrir(abierta)).doc.asociacion.nombre, "ABIES");
});

test("lo traído se junta con lo de ahora: la copia manda en la asociación, el acento de cada uno se queda", async () => {
  const lectura = await copiaDeAntes();
  const { doc: viejo } = await Traer.abrir(lectura, { nombre: "Alberto", cargo: "Presidencia", contrasena: "de-entonces", contrasenaArchivo: ARCHIVO });
  const ahora = Esquema.documentoVacio(new Date("2026-10-29T10:00:00Z"));
  ahora.socios = [{ id: "n1", numero: 1, nombre: "Nueva", creado: "2026-10-29T10:00:00.000Z", modificado: "2026-10-29T10:00:00.000Z" }];
  ahora.config.acentos = { alberto: "#599cf3" };
  ahora.meta.cambios["asociacion.nombre"] = "2026-10-29T10:00:00.000Z";
  ahora.asociacion.nombre = "Escrito aquí";
  const m = Traer.aplicar(ahora, viejo, "2026-10-29T12:00:00.000Z");
  assert.equal(m.asociacion.nombre, "ABIES");
  assert.equal(m.asociacion.nif, "G00000000");
  assert.equal(m.config.tiposSocio[0].cuota, 2500);
  assert.deepEqual(m.config.acentos, { alberto: "#599cf3" });
  assert.deepEqual(m.socios.map((s) => s.nombre).sort(), ["Ana", "Luis", "Nueva"]);
  assert.equal(m.config.siguienteNumeroSocio, 3);
  assert.equal(m.meta.cambios["asociacion.nif"], "2026-10-29T12:00:00.000Z", "se apunta como cambiado ahora");
  // …y así gana al mezclarse con lo que tenga otro miembro de la junta
  const otro = Esquema.documentoVacio(new Date("2026-10-28T10:00:00Z"));
  assert.equal(require("../src/js/datos/mezcla.js").mezclar(otro, m).config.tiposSocio[0].cuota, 2500);
});

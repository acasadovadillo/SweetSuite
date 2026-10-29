// Cuentas de usuario, doble llave y permisos por cargo (Fase 7a).
// Las iteraciones de PBKDF2 se bajan a 1000 SOLO en los tests, para que vayan rápido.
const test = require("node:test");
const assert = require("node:assert/strict");
const Cuentas = require("../src/js/datos/cuentas.js");
const Permisos = require("../src/js/logica/permisos.js");
const Esquema = require("../src/js/datos/esquema.js");

const IT = 1000;
const ARCHIVO = "contraseña del archivo";
const ADMIN = "contraseña de abies";

async function bovedaConTesorero() {
  const estado = await Cuentas.crear({ contrasenaArchivo: ARCHIVO, contrasenaAdmin: ADMIN, doc: Esquema.documentoVacio() }, IT);
  estado.doc.asociacion.nombre = "ABIES";
  const tes = await Cuentas.anadirUsuario(estado, { nombre: "Alberto", cargo: "Tesorería", contrasena: "provisional-1" }, IT);
  return { estado, tes, boveda: await Cuentas.sellar(estado) };
}

test("entrar exige nombre, cargo, contraseña personal y contraseña del archivo", async () => {
  const { boveda, tes } = await bovedaConTesorero();
  const ok = await Cuentas.abrir(boveda, { nombre: " alberto ", cargo: "TESORERIA", contrasena: "provisional-1", contrasenaArchivo: ARCHIVO });
  assert.equal(ok.usuarioId, tes.id, "nombre y cargo sin distinguir mayúsculas ni tildes");
  assert.equal(ok.doc.asociacion.nombre, "ABIES");
  const malos = [
    { nombre: "Alberto", cargo: "Tesorería", contrasena: "provisional-1", contrasenaArchivo: "otra" },
    { nombre: "Alberto", cargo: "Tesorería", contrasena: "otra-mala", contrasenaArchivo: ARCHIVO },
    { nombre: "Alberto", cargo: "Secretaría", contrasena: "provisional-1", contrasenaArchivo: ARCHIVO },
    { nombre: "Lucía", cargo: "Tesorería", contrasena: "provisional-1", contrasenaArchivo: ARCHIVO },
  ];
  for (const m of malos) {
    await assert.rejects(() => Cuentas.abrir(boveda, m), (e) => e.codigo === "ACCESO" && !/archivo|personal|cargo no/i.test(e.message.replace("revisa el nombre, el cargo y las dos contraseñas", "")));
  }
});

test("la cuenta ABIES entra con su contraseña y la del archivo; el nuevo usuario debe cambiar la suya", async () => {
  const { boveda } = await bovedaConTesorero();
  const a = await Cuentas.abrir(boveda, { nombre: "ABIES", cargo: "Administración", contrasena: ADMIN, contrasenaArchivo: ARCHIVO });
  assert.equal(Cuentas.usuarioActual(a).rol, "admin");
  const t = await Cuentas.abrir(boveda, { nombre: "Alberto", cargo: "Tesorería", contrasena: "provisional-1", contrasenaArchivo: ARCHIVO });
  assert.equal(Cuentas.usuarioActual(t).debeCambiar, true);
  await Cuentas.cambiarPropia(t, "provisional-1", "mi frase secreta", IT);
  assert.equal(Cuentas.usuarioActual(t).debeCambiar, false);
  const b2 = await Cuentas.sellar(t);
  await assert.rejects(() => Cuentas.abrir(b2, { nombre: "Alberto", cargo: "Tesorería", contrasena: "provisional-1", contrasenaArchivo: ARCHIVO }));
  const otra = await Cuentas.abrir(b2, { nombre: "Alberto", cargo: "Tesorería", contrasena: "mi frase secreta", contrasenaArchivo: ARCHIVO });
  assert.equal(otra.doc.asociacion.nombre, "ABIES");
  await assert.rejects(() => Cuentas.cambiarPropia(otra, "no es", "otra frase larga", IT), /actual no es correcta/);
});

test("solo la administración gestiona usuarios; no se repite nombre + cargo", async () => {
  const { boveda } = await bovedaConTesorero();
  const t = await Cuentas.abrir(boveda, { nombre: "Alberto", cargo: "Tesorería", contrasena: "provisional-1", contrasenaArchivo: ARCHIVO });
  await assert.rejects(() => Cuentas.anadirUsuario(t, { nombre: "X", cargo: "Vocalía", contrasena: "12345678" }, IT), /administración/);
  const a = await Cuentas.abrir(boveda, { nombre: "ABIES", cargo: "Administración", contrasena: ADMIN, contrasenaArchivo: ARCHIVO });
  await assert.rejects(() => Cuentas.anadirUsuario(a, { nombre: "alberto", cargo: "tesoreria", contrasena: "12345678" }, IT), /Ya hay/);
  await assert.rejects(() => Cuentas.anadirUsuario(a, { nombre: "Lucía", cargo: "Secretaría", contrasena: "corta" }, IT), /8 caracteres/);
  const admin = Cuentas.usuarioActual(a);
  assert.throws(() => Cuentas.editarUsuario(a, admin.id, { nombre: "Otro" }), /se llama siempre/);
  await assert.rejects(() => Cuentas.desactivarUsuario(a, admin.id), /no se puede desactivar/);
});

test("desactivar cambia la clave de datos: quien se va no abre lo guardado después", async () => {
  const { boveda, tes } = await bovedaConTesorero();
  const a = await Cuentas.abrir(boveda, { nombre: "ABIES", cargo: "Administración", contrasena: ADMIN, contrasenaArchivo: ARCHIVO });
  const sec = await Cuentas.anadirUsuario(a, { nombre: "Lucía", cargo: "Secretaría", contrasena: "provisional-2" }, IT);
  const vieja = await Cuentas.desactivarUsuario(a, tes.id);
  assert.notEqual(vieja, a.llaveDatos);
  assert.equal(a.cabecera.generacion, 2);
  a.doc.asociacion.nombre = "ABIES (después)";
  const b2 = await Cuentas.sellar(a);
  await assert.rejects(() => Cuentas.abrir(b2, { nombre: "Alberto", cargo: "Tesorería", contrasena: "provisional-1", contrasenaArchivo: ARCHIVO }), (e) => e.codigo === "ACCESO");
  // La clave vieja no descifra los datos nuevos.
  const C = require("../src/js/nucleo/cripto.js");
  await assert.rejects(() => C.descifrarConClave(b2.datos, vieja));
  // Los demás siguen entrando, sin haber cambiado su contraseña.
  const l = await Cuentas.abrir(b2, { nombre: "Lucía", cargo: "Secretaría", contrasena: "provisional-2", contrasenaArchivo: ARCHIVO });
  assert.equal(l.usuarioId, sec.id);
  assert.equal(l.doc.asociacion.nombre, "ABIES (después)");
  // Reactivar = nueva contraseña provisional.
  await Cuentas.restablecerContrasena(a, tes.id, "vuelve-alberto", IT);
  const b3 = await Cuentas.sellar(a);
  const t = await Cuentas.abrir(b3, { nombre: "Alberto", cargo: "Tesorería", contrasena: "vuelve-alberto", contrasenaArchivo: ARCHIVO });
  assert.equal(Cuentas.usuarioActual(t).debeCambiar, true);
});

test("cambiar la contraseña del archivo: la vieja deja de abrir", async () => {
  const { boveda } = await bovedaConTesorero();
  const a = await Cuentas.abrir(boveda, { nombre: "ABIES", cargo: "Administración", contrasena: ADMIN, contrasenaArchivo: ARCHIVO });
  await assert.rejects(() => Cuentas.cambiarContrasenaArchivo(a, "mala", "archivo nuevo 2026", boveda, IT), /actual no es correcta/);
  await Cuentas.cambiarContrasenaArchivo(a, ARCHIVO, "archivo nuevo 2026", boveda, IT);
  const b2 = await Cuentas.sellar(a);
  await assert.rejects(() => Cuentas.abrir(b2, { nombre: "Alberto", cargo: "Tesorería", contrasena: "provisional-1", contrasenaArchivo: ARCHIVO }));
  await Cuentas.abrir(b2, { nombre: "Alberto", cargo: "Tesorería", contrasena: "provisional-1", contrasenaArchivo: "archivo nuevo 2026" });
});

test("la cabecera no deja ver usuarios ni claves sin la contraseña del archivo", async () => {
  const { boveda } = await bovedaConTesorero();
  const texto = JSON.stringify(boveda);
  assert.ok(!/Alberto|Tesorer|ABIES|publica|privada/.test(texto), "nada legible en el archivo");
});

test("permisos por cargo: ve todo, edita lo suyo", () => {
  const sec = (c) => Permisos.porDefecto(c);
  assert.deepEqual(sec("Tesorería"), ["cuotas", "tesoreria", "facturas", "iva", "proyectos"]);
  assert.ok(sec("Secretaria").includes("actas") && !sec("Secretaria").includes("tesoreria"));
  assert.deepEqual(sec("Vocalía de actividades"), ["actividades"]);
  assert.equal(sec("Presidencia").length, Permisos.IDS.length);
  assert.equal(sec("Vicepresidencia").length, Permisos.IDS.length);
  assert.deepEqual(sec("Otro cargo"), []);
  const tes = { rol: "cargo", permisos: sec("Tesorería") };
  assert.equal(Permisos.puedeEditar(tes, "tesoreria"), true);
  assert.equal(Permisos.puedeEditar(tes, "actas"), false);
  assert.equal(Permisos.puedeEditar(tes, "inicio"), true, "las páginas sin datos no se bloquean");
  assert.equal(Permisos.puedeEditar({ rol: "admin", permisos: [] }, "actas"), true);
  assert.equal(Permisos.puedeEditar(null, "socios"), false);
});

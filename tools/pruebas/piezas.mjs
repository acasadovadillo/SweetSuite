/*
 * SweetSuite — Pruebas rápidas de las piezas, sin navegador (unos segundos).
 *
 *   · el llavero (src/js/llavero.js): contraseña, clave de recuperación,
 *     empresas con dos contraseñas, dos llaveros que se juntan…
 *   · la mezcla de Ironrack (apps/ironrack/src/js/almacen.js)
 *   · las de Solvento (apps/solvento/tools/pruebas/humo.js), que ya existían
 *
 *   node tools/pruebas/piezas.mjs
 *
 * Node trae el mismo cifrado que el navegador (WebCrypto): se cargan los
 * archivos de verdad, no copias.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const fallos = [];
let bien = 0;
async function prueba(nombre, fn) {
  try {
    const r = await fn();
    if (r === false) throw new Error("no se cumple");
    bien++;
    console.log("  ✓ " + nombre);
  } catch (e) {
    fallos.push(nombre);
    console.log("  ✗ " + nombre + " — " + (e && e.message ? e.message : e));
  }
}
// Que una promesa falle con ese código
async function falla(p, codigo) {
  try { await p; } catch (e) { return !codigo || e.code === codigo; }
  return false;
}

// Un «navegador» mínimo para cargar los archivos tal cual
function contexto(extra) {
  const ctx = Object.assign({
    crypto: globalThis.crypto, btoa, atob, TextEncoder, TextDecoder, console, setTimeout, clearTimeout, Date, Math, JSON,
  }, extra || {});
  ctx.window = ctx;
  return vm.createContext(ctx);
}

// ── El llavero ──────────────────────────────────────────────────────────────
console.log("\nEl llavero");
const cl = contexto();
vm.runInContext(leer("src/js/llavero.js"), cl);
const L = cl.SweetLlavero;

const { llavero, maestra, recuperacion } = await L.crear("ana", "contraseña-1");
await prueba("se crea una cuenta y se abre con su contraseña", async () =>
  L.igual(await L.abrir(llavero, "contraseña-1"), maestra));
await prueba("con otra contraseña no se abre", () => falla(L.abrir(llavero, "otra"), "BAD_PASSWORD"));
await prueba("la clave de recuperación abre aunque se escriba en minúsculas y con espacios", async () =>
  L.igual(await L.abrirConRecuperacion(llavero, recuperacion.toLowerCase().replace(/-/g, " ")), maestra));
await prueba("una clave de recuperación inventada no abre", () =>
  falla(L.abrirConRecuperacion(llavero, L.nuevaRecuperacion()), "BAD_PASSWORD"));
await prueba("cambiar la contraseña: abre la nueva, no la vieja, y los datos siguen siendo los mismos", async () => {
  const nuevo = await L.cambiarContrasena(llavero, maestra, "contraseña-2");
  return L.igual(await L.abrir(nuevo, "contraseña-2"), maestra) && (await falla(L.abrir(nuevo, "contraseña-1")));
});
await prueba("otra clave de recuperación: vale la nueva y deja de valer la vieja", async () => {
  const r = await L.cambiarRecuperacion(llavero, maestra);
  return L.igual(await L.abrirConRecuperacion(r.llavero, r.recuperacion), maestra) &&
    (await falla(L.abrirConRecuperacion(r.llavero, recuperacion)));
});
await prueba("cada app tiene su propio secreto, y siempre el mismo", async () => {
  const s1 = await L.secretoDeApp(maestra, "solvento"), s2 = await L.secretoDeApp(maestra, "ironrack");
  return s1 !== s2 && s1 === (await L.secretoDeApp(maestra, "solvento")) && s1.length > 30;
});
await prueba("una cuenta «ya la uso en otro dispositivo» no tiene clave de recuperación", async () => {
  const p = await L.crear("ana", "x", { provisional: true });
  return p.llavero.provisional === true && !p.recuperacion && !p.llavero.recuperacion;
});

console.log("\nEmpresas");
const emp = await L.crear("abies", "empresa-1", { empresa: { representante: "alberto", contrasenaRep: "personal-1" } });
await prueba("una empresa se abre con las dos contraseñas", async () =>
  L.igual(await L.abrirEmpresa(emp.llavero, "alberto", "empresa-1", "personal-1"), emp.maestra));
await prueba("con la de la empresa sola no se abre", () => falla(L.abrir(emp.llavero, "empresa-1")));
await prueba("con la de la empresa mal, no se abre", () => falla(L.abrirEmpresa(emp.llavero, "alberto", "mala", "personal-1"), "BAD_PASSWORD"));
await prueba("con la del representante mal, no se abre", () => falla(L.abrirEmpresa(emp.llavero, "alberto", "empresa-1", "mala"), "BAD_PASSWORD"));
await prueba("un representante sin entrada no entra (hace falta la clave de recuperación)", () =>
  falla(L.abrirEmpresa(emp.llavero, "otra", "empresa-1", "personal-2"), "SIN_REPRESENTANTE"));
await prueba("la clave de recuperación de la empresa da entrada a un representante nuevo", async () => {
  const m = await L.abrirConRecuperacion(emp.llavero, emp.recuperacion);
  const con = await L.conRepresentante(emp.llavero, m, "empresa-1", "otra", "personal-2");
  return L.igual(await L.abrirEmpresa(con, "otra", "empresa-1", "personal-2"), emp.maestra);
});
await prueba("quien sale de la lista de representantes pierde su entrada", async () => {
  const con = await L.conRepresentante(emp.llavero, emp.maestra, "empresa-1", "otra", "personal-2");
  const solo = L.soloRepresentantes(con, ["alberto"]);
  return Object.keys(solo.representantes).join() === "alberto";
});
await prueba("un llavero de antes de ser empresa se abre con su contraseña y se convierte", async () => {
  const viejo = await L.crear("abies", "empresa-1");
  const m = await L.abrirEmpresa(viejo.llavero, "alberto", "empresa-1", "personal-1");
  const nuevo = await L.conRepresentante(viejo.llavero, m, "empresa-1", "alberto", "personal-1");
  return nuevo.contrasena === null && L.igual(await L.abrirEmpresa(nuevo, "alberto", "empresa-1", "personal-1"), viejo.maestra);
});

console.log("\nDos llaveros de la misma cuenta");
const a = await L.crear("ana", "pw", {}), b = await L.crear("ana", "pw", { provisional: true });
await prueba("entre uno de verdad y uno provisional, gana siempre el de verdad", () =>
  L.ganador(a.llavero, b.llavero) === a.llavero && L.ganador(b.llavero, a.llavero) === a.llavero);
await prueba("entre dos de verdad, gana siempre el mismo (el más antiguo)", async () => {
  const c = await L.crear("ana", "pw");
  c.llavero.creado = a.llavero.creado + 1;
  return L.ganador(a.llavero, c.llavero) === a.llavero && L.ganador(c.llavero, a.llavero) === a.llavero;
});
await prueba("la clave del que pierde se guarda en «anteriores» y se recupera", async () => {
  const unido = await L.conAnteriores(a.llavero, a.maestra, [a.maestra, b.maestra]);
  const ant = await L.anteriores(unido, a.maestra);
  return ant.length === 1 && L.igual(ant[0], b.maestra);
});
await prueba("las preferencias y los datos pequeños van cifrados y se leen", async () => {
  const conP = await L.conPreferencias(a.llavero, a.maestra, { acento: "#599cf3", bloqueo: 5 });
  const p = await L.preferencias(conP, a.maestra);
  const caja = await L.cifrarDato(a.maestra, { solvento: { lineas: ["Patrimonio 1.000 €"] } });
  const d = await L.descifrarDato(a.maestra, caja);
  return p.acento === "#599cf3" && p.bloqueo === 5 && d.solvento.lineas[0] === "Patrimonio 1.000 €" &&
    !JSON.stringify(conP).includes("599cf3");
});

// ── La Administración (src/js/admin.js) ─────────────────────────────────────
console.log("\nAdministración");
const ca = contexto();
vm.runInContext(leer("src/js/admin.js"), ca);
const AD = ca.SweetAdmin;
const cat = JSON.parse(leer("cuentas.json"));
await prueba("la lista de cuentas de verdad es válida y tiene un solo Admin", () => {
  const e = AD.validar(cat);
  if (e.length) throw new Error(e[0]);
  return cat.cuentas.filter((c) => c.tipo === "admin").length === 1;
});
await prueba("dos cuentas Admin no valen", () => {
  const otro = JSON.parse(JSON.stringify(cat)); otro.cuentas.push({ usuario: "admin2", nombre: "Otro", tipo: "admin", apps: [] });
  return AD.validar(otro).some((e) => e.includes("Admin"));
});
await prueba("dar de alta una persona; no se puede repetir usuario ni llamarse «admin»", async () => {
  const c = AD.alta(cat, { usuario: "Lucía", nombre: "Lucía", tipo: "persona", apps: ["solvento"] });
  const nueva = c.cuentas.find((x) => x.usuario === "lucia");
  return !!nueva && c.cuentas[c.cuentas.length - 1].tipo === "admin" && AD.validar(c).length === 0 &&
    (await falla(Promise.resolve().then(() => AD.alta(c, { usuario: "lucia", nombre: "Otra", tipo: "persona" })), "REPETIDA")) &&
    (await falla(Promise.resolve().then(() => AD.alta(cat, { usuario: "admin", nombre: "X", tipo: "persona" })), "ADMIN"));
});
await prueba("un representante tiene que ser una persona dada de alta", () => {
  const c = AD.alta(cat, { usuario: "club", nombre: "Club", tipo: "organizacion", apps: ["solvento"], representantes: ["nadie"] });
  return AD.validar(c).some((e) => e.includes("no es una persona"));
});
await prueba("dar de baja quita también de las empresas que representaba; al Admin no se le da de baja", async () => {
  const c = AD.baja(cat, "alberto");
  return !c.cuentas.some((x) => x.usuario === "alberto") && c.cuentas.find((x) => x.usuario === "abies").representantes.length === 0 &&
    (await falla(Promise.resolve().then(() => AD.baja(cat, "admin")), "ADMIN"));
});
await prueba("dice qué tokens crear para lo nuevo, sin tildes y solo sobre su repositorio", () => {
  let c = AD.alta(cat, { usuario: "lucia", nombre: "Lucía", tipo: "persona", apps: ["solvento"] });
  c = AD.editar(c, "abies", { representantes: ["alberto", "lucia"] });
  const t = AD.tokensQueCrear(cat, c, { solvento: { repo: "Solvento-Data" }, ironrack: { repo: "Ironrack-Data" }, agora: { repo: "Agora-Data" } });
  // ABIES tiene Solvento y Agora: su representante nuevo necesita un token para cada una
  return t.map((x) => x.nombre).sort().join() === "ABIES-Lucia-Agora,ABIES-Lucia-Solvento,Lucia-Solvento" &&
    t.every((x) => x.acceso.join() === (x.app === "Agora" ? "Agora-Data" : "Solvento-Data,Solvento"));
});
await prueba("el cargo de cada representante: solo de la lista y solo de quien representa", () => {
  let c = AD.alta(cat, { usuario: "lucia", nombre: "Lucía", tipo: "persona", apps: ["solvento"] });
  c = AD.editar(c, "abies", { representantes: ["alberto", "lucia"], cargos: { alberto: "Presidencia", lucia: "Tesorería", nadie: "Vocalía" } });
  const abies = () => c.cuentas.find((x) => x.usuario === "abies");
  const bien = JSON.stringify(abies().cargos) === '{"alberto":"Presidencia","lucia":"Tesorería"}' && AD.validar(c).length === 0;
  // Un cargo que no está en la lista no vale
  const mal = JSON.parse(JSON.stringify(c)); mal.cuentas.find((x) => x.usuario === "abies").cargos.lucia = "Jefa";
  // Al dejar de representar (o al darse de baja), su cargo se va
  const sinLucia = AD.editar(c, "abies", { representantes: ["alberto"] });
  const baja = AD.baja(c, "lucia");
  return bien && AD.validar(mal).some((e) => e.includes("no es un cargo")) &&
    JSON.stringify(sinLucia.cuentas.find((x) => x.usuario === "abies").cargos) === '{"alberto":"Presidencia"}' &&
    JSON.stringify(baja.cuentas.find((x) => x.usuario === "abies").cargos) === '{"alberto":"Presidencia"}' &&
    !AD.baja(cat, "alberto").cuentas.find((x) => x.usuario === "abies").cargos;
});
await prueba("cuentas.json se escribe como a mano y se vuelve a leer igual", () => {
  const txt = AD.formatear(cat);
  return JSON.stringify(JSON.parse(txt)) === JSON.stringify(cat) && txt.includes('\n    { "usuario": "alberto"');
});

// ── La mezcla de Ironrack ───────────────────────────────────────────────────
console.log("\nIronrack: dos dispositivos");
const nada = () => {};
const almacenLocal = new Map();
const ci = contexto({
  IR: { github: {}, app: null },
  addEventListener: nada,
  document: { addEventListener: nada, visibilityState: "visible" },
  navigator: { onLine: true },
  localStorage: { getItem: (k) => almacenLocal.get(k) ?? null, setItem: (k, v) => almacenLocal.set(k, v), removeItem: (k) => almacenLocal.delete(k) },
});
vm.runInContext(leer("apps/ironrack/src/js/almacen.js"), ci);
const A = ci.IR.almacen;
const ses = (id, mod, nombre) => ({ id, inicio: mod, fin: mod + 1, nombre: nombre || id, ejercicios: [], creado: mod, mod });
const base = A.normalizar({ sesiones: [ses("s1", 100)], rutinas: [{ id: "r1", nombre: "Pierna", ejercicios: [], creado: 100, mod: 100 }] });
await prueba("cada dispositivo apunta un entreno distinto: se quedan los dos", () => {
  const d1 = A.normalizar(JSON.parse(JSON.stringify(base))); d1.sesiones.push(ses("s2", 200));
  const d2 = A.normalizar(JSON.parse(JSON.stringify(base))); d2.sesiones.push(ses("s3", 300));
  const m = A.fusionar(d1, d2);
  return m.sesiones.map((s) => s.id).sort().join() === "s1,s2,s3";
});
await prueba("la misma rutina cambiada en los dos: gana el último cambio", () => {
  const d1 = A.normalizar(JSON.parse(JSON.stringify(base))); d1.rutinas[0] = Object.assign({}, d1.rutinas[0], { nombre: "Pierna A", mod: 200 });
  const d2 = A.normalizar(JSON.parse(JSON.stringify(base))); d2.rutinas[0] = Object.assign({}, d2.rutinas[0], { nombre: "Pierna B", mod: 300 });
  return A.fusionar(d1, d2).rutinas[0].nombre === "Pierna B" && A.fusionar(d2, d1).rutinas[0].nombre === "Pierna B";
});
await prueba("un entreno borrado en un dispositivo no vuelve desde el otro", () => {
  const d1 = A.normalizar(JSON.parse(JSON.stringify(base))); d1.sesiones = []; d1.borrados.s1 = 500;
  const d2 = A.normalizar(JSON.parse(JSON.stringify(base)));
  return A.fusionar(d1, d2).sesiones.length === 0 && A.fusionar(d2, d1).sesiones.length === 0;
});
await prueba("un entreno en curso que otro dispositivo ya terminó no sigue abierto", () => {
  const d1 = A.normalizar(JSON.parse(JSON.stringify(base))); d1.actual = { id: "s9", ejercicios: [] }; d1.actualMod = 400;
  const d2 = A.normalizar(JSON.parse(JSON.stringify(base))); d2.sesiones.push(ses("s9", 450));
  return A.fusionar(d1, d2).actual === null;
});

// ── Solvento ────────────────────────────────────────────────────────────────
console.log("\nSolvento");
const r = spawnSync(process.execPath, ["tools/pruebas/humo.js"], { cwd: join(RAIZ, "apps/solvento"), encoding: "utf8" });
const lineas = (r.stdout || "").split("\n");
const ok = lineas.filter((l) => l.includes("✓")).length, mal = lineas.filter((l) => l.includes("✗"));
if (r.status === 0 && !mal.length) { bien++; console.log(`  ✓ las ${ok} pruebas de Solvento (cuentas, mezcla, entorno)`); }
else {
  fallos.push("Solvento");
  console.log(`  ✗ Solvento: ${mal.length} fallan`);
  mal.forEach((l) => console.log("    " + l.trim()));
  if (r.stderr) console.log(r.stderr.split("\n").slice(0, 5).join("\n"));
}

console.log("");
if (fallos.length) { console.log(`✗ Piezas: ${fallos.length} fallan, ${bien} bien`); process.exit(1); }
console.log(`✓ Piezas: todo bien (${bien})`);

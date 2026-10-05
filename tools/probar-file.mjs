#!/usr/bin/env node
/*
 * webkit_asociaciones — Prueba del archivo distribuido abierto con file://
 *
 *   node tools/probar-file.mjs
 *
 * Abre dist/webkit_asociaciones.html con doble clic (file://), como lo usará
 * una asociación, en un navegador Chromium SIN INTERFAZ y con un PERFIL
 * TEMPORAL (no toca tus datos ni tu navegador). Comprueba que:
 *   1. hay contexto seguro, cifrado e IndexedDB con file://
 *   2. unos datos guardados con una versión anterior (esquema 2) se abren y se migran
 *   3. lo que se guarda sobrevive a recargar la página
 *
 * Busca Chrome, Brave, Edge o Chromium en las rutas habituales; se puede
 * indicar otro con NAVEGADOR=/ruta/al/ejecutable. Sin dependencias (Node ≥ 22,
 * que trae WebSocket).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVO = pathToFileURL(join(RAIZ, "dist", "webkit_asociaciones.html")).href;
const CANDIDATOS = [
  process.env.NAVEGADOR,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);
const NAVEGADOR = CANDIDATOS.find((r) => existsSync(r));
if (!NAVEGADOR) { console.error("No encuentro Chrome, Brave, Edge ni Chromium. Indica uno con NAVEGADOR=/ruta"); process.exit(1); }
if (typeof WebSocket === "undefined") { console.error("Hace falta Node 22 o posterior."); process.exit(1); }

const perfil = mkdtempSync(join(tmpdir(), "webkit-asociaciones-prueba-"));
const PUERTO = 9333;
const nav = spawn(NAVEGADOR, ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`,
  "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const comprobar = (texto, ok, detalle) => {
  console.log((ok ? "  ✓ " : "  ✗ ") + texto + (ok || detalle === undefined ? "" : " — " + JSON.stringify(detalle)));
  if (!ok) fallos++;
};

try {
  let destinos;
  for (let i = 0; i < 40 && !destinos; i++) {
    try { destinos = await (await fetch(`http://127.0.0.1:${PUERTO}/json`)).json(); } catch { await esperar(250); }
  }
  const ws = new WebSocket(destinos.find((d) => d.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pendientes = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
  });
  const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; pendientes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluar = async (codigo) => {
    const r = await cdp("Runtime.evaluate", { expression: `(async () => { ${codigo} })()`, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "error en la página");
    return r.result.result.value;
  };
  const cargar = async () => { await cdp("Page.reload"); await esperar(1500); };

  await cdp("Page.enable");
  await cdp("Page.navigate", { url: ARCHIVO });
  await esperar(1500);
  console.log("Probando " + ARCHIVO + "\ncon " + NAVEGADOR + "\n");

  const entorno = await evaluar(`return { origen: location.origin, seguro: isSecureContext, cifrado: !!crypto.subtle, idb: typeof indexedDB, version: window.WA_VERSION }`);
  comprobar("se abre como file://", entorno.origen === "file://", entorno);
  comprobar("contexto seguro y cifrado disponibles", entorno.seguro && entorno.cifrado, entorno);

  await evaluar(`
    const llave = await WA.Cripto.crearLlave('frase de prueba file');
    const v2 = WA.Esquema.migrar({ app: 'webkit_asociaciones', esquema: 1, asociacion: { nombre: 'Prueba file',
      domicilio: { via: 'C/ Mayor, 3', codigoPostal: '28013', municipio: 'Madrid', provincia: 'Madrid' } }, junta: [] });
    delete v2.socios; delete v2.cuotas; delete v2.remesas; delete v2.config; v2.esquema = 2;
    await WA.Boveda.escribir(await WA.Cripto.cifrar(v2, llave));`);
  await cargar();
  const migrado = await evaluar(`
    await WA.Sesion.desbloquear('frase de prueba file');
    const g = (await WA.Cripto.descifrar(await WA.Boveda.leer(), 'frase de prueba file')).objeto;
    return { esquema: g.esquema, actual: WA.Esquema.VERSION, tipos: g.config.tiposSocio.length,
      colecciones: WA.Esquema.COLECCIONES.every((c) => Array.isArray(g[c])), donde: await WA.Boveda.tipo() }`);
  comprobar("datos de una versión anterior migrados y guardados al día", migrado.esquema === migrado.actual && migrado.tipos === 1 && migrado.colecciones, migrado);
  comprobar("se guarda en IndexedDB", migrado.donde === "IndexedDB", migrado);

  await evaluar(`await WA.Sesion.datos.guardar('socios', WA.Socios.completar({ numero: 1, nombre: 'Uno', fechaAlta: '2026-01-01', tipoSocioId: 'socio' }));
    await new Promise((r) => setTimeout(r, 400));`);
  await cargar();
  const tras = await evaluar(`
    await WA.Sesion.desbloquear('frase de prueba file');
    location.hash = '#/socios';
    await new Promise((r) => setTimeout(r, 600));
    return { socios: (await WA.Sesion.datos.listar('socios')).length, titulo: document.querySelector('#principal h1').textContent,
      error: !!document.querySelector('.tarjeta-error') }`);
  comprobar("lo guardado sobrevive a recargar y la página de socios se pinta", tras.socios === 1 && tras.titulo === "Socios" && !tras.error, tras);

  // Base de datos de la versión 1 (antes de los adjuntos) con datos dentro: al abrir, se actualiza sin perderlos.
  await evaluar(`
    const llave = await WA.Cripto.crearLlave('frase v1');
    const bloque = await WA.Cripto.cifrar(WA.Esquema.documentoVacio(), llave);
    await new Promise((ok, mal) => { const r = indexedDB.deleteDatabase('webkit_asociaciones'); r.onsuccess = ok; r.onerror = mal; r.onblocked = ok; });
    await new Promise((ok, mal) => {
      const r = indexedDB.open('webkit_asociaciones', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('boveda');
      r.onsuccess = () => { const tx = r.result.transaction('boveda', 'readwrite'); tx.objectStore('boveda').put(bloque, 'datos'); tx.oncomplete = () => { r.result.close(); ok(); }; tx.onerror = mal; };
      r.onerror = mal;
    });`);
  await cargar();
  const v1 = await evaluar(`
    await WA.Sesion.desbloquear('frase v1');
    const f = await WA.Sesion.datos.guardarArchivo({ nombre: "x.txt", tipoMime: "text/plain", categoria: "Otros" }, new TextEncoder().encode("hola"));
    const leido = new TextDecoder().decode(await WA.Sesion.datos.leerArchivo(f.id));
    await WA.Sesion.datos.borrarArchivo(f.id);
    return { modo: WA.Sesion.modo, leido }`);
  comprobar("una base de datos de la versión 1 se actualiza conservando los datos y admite adjuntos", v1.modo === "abierta" && v1.leido === "hola", v1);
  await evaluar(`await WA.Sesion.cambiarContrasena('frase v1', 'frase de prueba file'); return 1`);

  // Adjuntos cifrados: guardar, cambiar la contraseña, recargar, copia de seguridad y restaurar.
  const adj = await evaluar(`
    const bytes = new Uint8Array(300000).map((_, i) => (i * 7) % 256);
    const ficha = await WA.Sesion.datos.guardarArchivo({ nombre: "prueba.bin", tipoMime: "application/octet-stream", categoria: "Otros" }, bytes);
    await new Promise((r) => setTimeout(r, 300));
    const crudo = await WA.Boveda.leerArchivo(ficha.id);
    await WA.Sesion.cambiarContrasena('frase de prueba file', 'frase nueva de prueba');
    return { id: ficha.id, cifrado: crudo && crudo.ct.length >= 300000 && crudo.ct[1] !== 7 }`);
  comprobar("el adjunto se guarda cifrado", adj.cifrado, adj);
  await cargar();
  const tras2 = await evaluar(`
    await WA.Sesion.desbloquear('frase nueva de prueba');
    const b = await WA.Sesion.datos.leerArchivo(${JSON.stringify(adj.id)});
    const ok = b && b.length === 300000 && b[1] === 7 && b[299999] === (299999 * 7) % 256;
    const sobre = await WA.Sesion.contenidoCopia(true);
    window.__copia = JSON.stringify(sobre);
    return { ok, enCopia: !!(sobre.archivos && sobre.archivos[${JSON.stringify(adj.id)}]) }`);
  comprobar("tras cambiar la contraseña y recargar, el adjunto se lee bien", tras2.ok, tras2);
  comprobar("la copia de seguridad lleva el adjunto", tras2.enCopia, tras2);
  const rest = await evaluar(`
    const texto = window.__copia;
    await WA.Sesion.borrarDelNavegador();
    await WA.Sesion.bloquear();
    const vacio = !(await WA.Boveda.hayDatos()) && !(await WA.Boveda.leerArchivo(${JSON.stringify(adj.id)}));
    const r = await WA.Sesion.restaurar(WA.Copia.leer(texto), 'frase nueva de prueba', 'otra frase distinta');
    const b = await WA.Sesion.datos.leerArchivo(${JSON.stringify(adj.id)});
    return { vacio, r, ok: b && b.length === 300000 && b[299999] === (299999 * 7) % 256 }`);
  comprobar("borrar del navegador quita también los adjuntos", rest.vacio, rest);
  comprobar("restaurar la copia (con otra contraseña nueva) recupera el adjunto", rest.ok && rest.r.archivos === 1 && rest.r.faltan === 0, rest);
  ws.close();
} catch (e) {
  comprobar("la prueba se ha podido ejecutar", false, e.message);
} finally {
  nav.kill();
  await esperar(300);
  try { rmSync(perfil, { recursive: true, force: true }); } catch { /* el sistema lo limpiará */ }
}
console.log(fallos ? `\n✗ ${fallos} comprobaciones fallidas` : "\n✓ Todo en orden");
process.exit(fallos ? 1 : 0);

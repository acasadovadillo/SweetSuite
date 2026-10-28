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

  // Credenciales de prueba (solo existen en este perfil temporal del navegador).
  const ADMIN = "{ nombre: 'ABIES', cargo: 'Administración', contrasena: 'admin de prueba file', contrasenaArchivo: 'archivo de prueba file' }";
  const entrarAdmin = `await WA.Sesion.entrar(${ADMIN});`;

  // 1. Datos de antes de los usuarios (una sola contraseña y un esquema viejo): se convierten.
  await evaluar(`
    const llave = await WA.Cripto.crearLlave('frase antigua');
    const v2 = WA.Esquema.migrar({ app: 'webkit_asociaciones', esquema: 1, asociacion: { nombre: 'Prueba file',
      domicilio: { via: 'C/ Mayor, 3', codigoPostal: '28013', municipio: 'Madrid', provincia: 'Madrid' } }, junta: [] });
    delete v2.socios; delete v2.cuotas; delete v2.remesas; delete v2.config; v2.esquema = 2;
    await WA.Boveda.escribir(await WA.Cripto.cifrar(v2, llave));`);
  await cargar();
  const migrado = await evaluar(`
    const antes = await WA.Sesion.tipoBoveda();
    await WA.Sesion.actualizarAntigua({ contrasenaAntigua: 'frase antigua', contrasenaArchivo: 'archivo de prueba file', contrasenaAdmin: 'admin de prueba file' });
    const b = await WA.Boveda.leer();
    const doc = await WA.Sesion.datos.documento();
    return { antes, despues: await WA.Sesion.tipoBoveda(), legible: /Prueba file|ABIES/.test(JSON.stringify(b)), esquema: doc.esquema, actual: WA.Esquema.VERSION,
      nombre: doc.asociacion.nombre, tipos: doc.config.tiposSocio.length, colecciones: WA.Esquema.COLECCIONES.every((c) => Array.isArray(doc[c])),
      firma: WA.Sesion.firma, donde: await WA.Boveda.tipo() }`);
  comprobar("los datos de una sola contraseña se convierten al acceso por usuarios (y se migran)",
    migrado.antes === "antigua" && migrado.despues === "abies" && migrado.esquema === migrado.actual && migrado.nombre === "Prueba file" && migrado.tipos === 1 && migrado.colecciones, migrado);
  comprobar("en la bóveda no queda nada legible", !migrado.legible, migrado);
  comprobar("se guarda en IndexedDB", migrado.donde === "IndexedDB", migrado);

  // 2. Usuarios: alta de dos cargos, un socio, recargar y volver a entrar.
  await evaluar(`
    await WA.Sesion.anadirUsuario({ nombre: 'Alberto', cargo: 'Tesorería', contrasena: 'provisional tesoreria' });
    await WA.Sesion.anadirUsuario({ nombre: 'Lucía', cargo: 'Secretaría', contrasena: 'provisional secretaria' });
    location.hash = '#/socios'; await new Promise((r) => setTimeout(r, 300));
    await WA.Sesion.datos.guardar('socios', WA.Socios.completar({ numero: 1, nombre: 'Uno', fechaAlta: '2026-01-01', tipoSocioId: 'socio' }));
    await new Promise((r) => setTimeout(r, 400));`);
  await cargar();
  const tras = await evaluar(`
    ${entrarAdmin}
    location.hash = '#/socios';
    await new Promise((r) => setTimeout(r, 600));
    return { socios: (await WA.Sesion.datos.listar('socios')).length, titulo: document.querySelector('#principal h1').textContent,
      usuarios: WA.Sesion.usuarios().length, registro: (await WA.Sesion.datos.listar('registro')).map((r) => r.autor + ':' + r.accion + ':' + r.donde),
      error: !!document.querySelector('.tarjeta-error') }`);
  comprobar("lo guardado (usuarios y datos) sobrevive a recargar y la página de socios se pinta", tras.socios === 1 && tras.usuarios === 3 && tras.titulo === "Socios" && !tras.error, tras);
  comprobar("el registro firma quién hizo cada cambio", tras.registro.includes("ABIES · Administración:alta:socios") && tras.registro.includes("ABIES · Administración:alta:usuarios"), tras.registro);

  const paginas = await evaluar(`
    const out = {};
    for (const r of ['#/inicio', '#/informes', '#/informes/cuentas', '#/usuarios', '#/registro']) {
      location.hash = r;
      await new Promise((ok) => setTimeout(ok, 600));
      out[r] = { titulo: (document.querySelector('#principal h1') || {}).textContent, error: !!document.querySelector('.tarjeta-error'),
        documento: !!document.querySelector('#principal .documento-impreso'), grafica: !!document.querySelector('#principal .grafica svg') };
    }
    return out`);
  comprobar("el panel de inicio, los informes, usuarios y actividad se pintan",
    !paginas["#/inicio"].error && paginas["#/inicio"].grafica && ["#/informes", "#/informes/cuentas"].every((r) => !paginas[r].error && paginas[r].documento) &&
    paginas["#/usuarios"].titulo === "Usuarios" && paginas["#/registro"].titulo === "Actividad", paginas);

  // 3. Un cargo entra con su contraseña provisional y solo modifica lo suyo.
  const tes = await evaluar(`
    await WA.Sesion.bloquear();
    try { await WA.Sesion.entrar({ nombre: 'alberto', cargo: 'tesoreria', contrasena: 'provisional tesoreria', contrasenaArchivo: 'otra' }); return { mal: 'entró con la contraseña del archivo equivocada' }; } catch (e) { if (e.codigo !== 'ACCESO') throw e; }
    await WA.Sesion.entrar({ nombre: 'alberto', cargo: 'tesoreria', contrasena: 'provisional tesoreria', contrasenaArchivo: 'archivo de prueba file' });
    const provisional = WA.Sesion.usuario.debeCambiar;
    await WA.Sesion.cambiarMiContrasena('provisional tesoreria', 'la de alberto 2026');
    location.hash = '#/actas'; await new Promise((r) => setTimeout(r, 500));
    let actas = 'permitido';
    try { await WA.Sesion.datos.guardar('actas', { titulo: 'x' }); } catch (e) { actas = e.codigo; }
    const lectura = document.body.classList.contains('solo-lectura');
    location.hash = '#/tesoreria'; await new Promise((r) => setTimeout(r, 500));
    await WA.Sesion.datos.guardar('movimientos', { fecha: '2026-10-17', cuentaId: 'banco', tipo: 'gasto', importe: 500, concepto: 'Sellos', categoriaId: 'material' });
    const usuariosVisible = [...document.querySelectorAll('#menu-lista a')].some((a) => a.dataset.modulo === 'usuarios');
    return { provisional, actas, lectura, usuariosVisible, firma: WA.Sesion.firma }`);
  comprobar("un cargo entra con las dos contraseñas, cambia la provisional y solo modifica lo suyo",
    !tes.mal && tes.provisional === true && tes.actas === "PERMISO" && tes.lectura && !tes.usuariosVisible, tes);

  // 4. Base de datos de la versión 1 (antes de los adjuntos) con datos dentro: se actualiza sin perderlos.
  await evaluar(`
    const llave = await WA.Cripto.crearLlave('frase v1');
    const bloque = await WA.Cripto.cifrar(WA.Esquema.documentoVacio(), llave);
    await WA.Sesion.bloquear();
    await new Promise((ok, mal) => { const r = indexedDB.deleteDatabase('webkit_asociaciones'); r.onsuccess = ok; r.onerror = mal; r.onblocked = ok; });
    await new Promise((ok, mal) => {
      const r = indexedDB.open('webkit_asociaciones', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('boveda');
      r.onsuccess = () => { const tx = r.result.transaction('boveda', 'readwrite'); tx.objectStore('boveda').put(bloque, 'datos'); tx.oncomplete = () => { r.result.close(); ok(); }; tx.onerror = mal; };
      r.onerror = mal;
    });`);
  await cargar();
  const v1 = await evaluar(`
    await WA.Sesion.actualizarAntigua({ contrasenaAntigua: 'frase v1', contrasenaArchivo: 'archivo de prueba file', contrasenaAdmin: 'admin de prueba file' });
    const f = await WA.Sesion.datos.guardarArchivo({ nombre: "x.txt", tipoMime: "text/plain", categoria: "Otros" }, new TextEncoder().encode("hola"));
    const leido = new TextDecoder().decode(await WA.Sesion.datos.leerArchivo(f.id));
    await WA.Sesion.datos.borrarArchivo(f.id);
    return { modo: WA.Sesion.modo, leido }`);
  comprobar("una base de datos de la versión 1 se actualiza conservando los datos y admite adjuntos", v1.modo === "abierta" && v1.leido === "hola", v1);

  // 5. Adjuntos cifrados: guardar, desactivar a alguien (cambia la clave), recargar, copia y restaurar.
  const adj = await evaluar(`
    await WA.Sesion.anadirUsuario({ nombre: 'Lucía', cargo: 'Secretaría', contrasena: 'provisional secretaria' });
    const bytes = new Uint8Array(300000).map((_, i) => (i * 7) % 256);
    location.hash = '#/documentos'; await new Promise((r) => setTimeout(r, 300));
    const ficha = await WA.Sesion.datos.guardarArchivo({ nombre: "prueba.bin", tipoMime: "application/octet-stream", categoria: "Otros" }, bytes);
    await new Promise((r) => setTimeout(r, 300));
    const crudo = await WA.Boveda.leerArchivo(ficha.id);
    const antes = JSON.stringify(Array.from(crudo.ct.slice(0, 16)));
    const lucia = WA.Sesion.usuarios().find((u) => u.nombre === 'Lucía');
    await WA.Sesion.desactivarUsuario(lucia.id);
    const despues = JSON.stringify(Array.from((await WA.Boveda.leerArchivo(ficha.id)).ct.slice(0, 16)));
    return { id: ficha.id, cifrado: crudo && crudo.ct.length >= 300000 && crudo.ct[1] !== 7, recifrado: antes !== despues }`);
  comprobar("el adjunto se guarda cifrado", adj.cifrado, adj);
  comprobar("al desactivar a alguien los adjuntos se vuelven a cifrar con la clave nueva", adj.recifrado, adj);
  await cargar();
  const tras2 = await evaluar(`
    let lucia = 'entró';
    try { await WA.Sesion.entrar({ nombre: 'Lucía', cargo: 'Secretaría', contrasena: 'provisional secretaria', contrasenaArchivo: 'archivo de prueba file' }); } catch (e) { lucia = e.codigo; }
    ${entrarAdmin}
    const b = await WA.Sesion.datos.leerArchivo(${JSON.stringify(adj.id)});
    const ok = b && b.length === 300000 && b[1] === 7 && b[299999] === (299999 * 7) % 256;
    const sobre = await WA.Sesion.contenidoCopia(true);
    window.__copia = JSON.stringify(sobre);
    return { lucia, ok, enCopia: !!(sobre.archivos && sobre.archivos[${JSON.stringify(adj.id)}]), legible: /Lucía|Tesorer|Prueba/.test(window.__copia) }`);
  comprobar("quien está desactivado ya no entra", tras2.lucia === "ACCESO", tras2);
  comprobar("tras cambiar la clave y recargar, el adjunto se lee bien", tras2.ok, tras2);
  comprobar("la copia de seguridad lleva el adjunto y no tiene nada legible", tras2.enCopia && !tras2.legible, tras2);
  const rest = await evaluar(`
    const texto = window.__copia;
    await WA.Sesion.borrarDelNavegador();
    await WA.Sesion.bloquear();
    const vacio = !(await WA.Boveda.hayDatos()) && !(await WA.Boveda.leerArchivo(${JSON.stringify(adj.id)}));
    let mal = '';
    try { await WA.Sesion.restaurar(WA.Copia.leer(texto), { nombre: 'ABIES', cargo: 'Administración', contrasena: 'mala', contrasenaArchivo: 'archivo de prueba file' }); } catch (e) { mal = e.codigo; }
    const nadaTocado = !(await WA.Boveda.hayDatos());
    const r = await WA.Sesion.restaurar(WA.Copia.leer(texto), ${ADMIN});
    const b = await WA.Sesion.datos.leerArchivo(${JSON.stringify(adj.id)});
    return { vacio, mal, nadaTocado, r, ok: b && b.length === 300000 && b[299999] === (299999 * 7) % 256 }`);
  comprobar("borrar del navegador quita también los adjuntos", rest.vacio, rest);
  comprobar("una copia no se recupera sin sus credenciales (y no toca nada)", rest.mal === "ACCESO" && rest.nadaTocado, rest);
  comprobar("recuperar la copia con sus credenciales devuelve el adjunto", rest.ok && rest.r.archivos === 1 && rest.r.faltan === 0, rest);
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

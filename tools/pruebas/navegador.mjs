/*
 * SweetSuite — Pruebas de uso real, con un navegador sin ventana (un par de
 * minutos).
 *
 * Arranca el servidor de desarrollo con una carpeta de datos propia (los de
 * dev-data/ no se tocan) y abre Chrome, Brave, Edge o Chromium sin ventana.
 * Lo maneja por el protocolo de DevTools, sin instalar nada: entra, abre las
 * apps, guarda, prueba dos dispositivos a la vez, una empresa, el bloqueo…
 * Cada «dispositivo» es un perfil aparte del navegador, con su almacenamiento.
 *
 *   node tools/pruebas/navegador.mjs
 *   NAVEGADOR=/ruta/al/navegador node tools/pruebas/navegador.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUERTO = Number(process.env.PUERTO_PRUEBAS || 4599);
const URL_SUITE = `http://127.0.0.1:${PUERTO}/`;
const NAV = [
  process.env.NAVEGADOR,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean).find((r) => existsSync(r));
if (!NAV) { console.error("No encuentro Chrome, Brave, Edge ni Chromium. Indica uno con NAVEGADOR=/ruta"); process.exit(1); }
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const fallos = [];
let bien = 0;
async function prueba(nombre, fn) {
  try {
    const r = await fn();
    if (r === false) throw new Error("no se cumple");
    bien++;
    console.log("  ✓ " + nombre);
    return r;
  } catch (e) {
    fallos.push(nombre);
    console.log("  ✗ " + nombre + " — " + String(e && e.message ? e.message : e).split("\n")[0]);
    return null;
  }
}

// ── El servidor de desarrollo, con sus datos aparte ──
const datos = mkdtempSync(join(tmpdir(), "sweetsuite-pruebas-"));
const servidor = spawn(process.env.PYTHON || "python3", ["tools/dev/servidor.py", "--puerto", String(PUERTO), "--datos", datos], {
  cwd: RAIZ, stdio: ["ignore", "ignore", "pipe"],
  env: Object.assign({}, process.env, { PATH: dirname(process.execPath) + ":" + (process.env.PATH || "") }),
});
let errServidor = "";
servidor.stderr.on("data", (d) => { errServidor += d; });

// ── El navegador, sin ventana ──
const perfil = mkdtempSync(join(tmpdir(), "sweetsuite-navegador-"));
const navegador = spawn(NAV, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${perfil}`, "--no-first-run",
  "--no-default-browser-check", "--disable-extensions", "--disable-background-timer-throttling",
  ...(process.env.CI ? ["--no-sandbox"] : []), "about:blank",
], { stdio: "ignore" });

function terminar(codigo) {
  try { navegador.kill(); } catch (e) { /* ya estaba */ }
  try { servidor.kill(); } catch (e) { /* ya estaba */ }
  setTimeout(() => {
    try { rmSync(perfil, { recursive: true, force: true }); rmSync(datos, { recursive: true, force: true }); } catch (e) { /* da igual */ }
    process.exit(codigo);
  }, 500);
}

async function hastaQue(fn, ms, que) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* aún no */ }
    await espera(200);
  }
  throw new Error("no llegó a tiempo: " + que);
}

// ── El protocolo de DevTools ──
let ws, nId = 0;
const pendientes = new Map();
const errores = [];
function cdp(method, params, sessionId) {
  return new Promise((ok, ko) => {
    const id = ++nId;
    pendientes.set(id, { ok, ko });
    ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
  });
}

// Lo que tiene cada página para las pruebas: esperar a que algo pase, etc.
const AYUDA = `
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  async function hasta(fn, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await espera(100); }
    throw new Error("no llegó a tiempo: " + fn.toString().replace(/\\s+/g, " ").slice(0, 140));
  }
  const $ = (s) => document.querySelector(s);
  const marco = (id) => { const f = document.querySelector("#marco-" + id); return f && f.contentWindow; };
  const sinDialogo = async () => { await espera(400); if (!$("#dialogo").hidden && $('#dialogo [data-r="no"]')) $('#dialogo [data-r="no"]').click(); };
  async function entrar(usuario, pw) {
    const m = $('[data-modo="particular"]'); if (m && m.getAttribute("aria-checked") !== "true") m.click();
    await hasta(() => $("#f-entrar"));
    const f = $("#f-entrar"); f.usuario.value = usuario; f.contrasena.value = pw; f.requestSubmit();
  }
`;

// Un «dispositivo»: un perfil aparte del navegador (con su almacenamiento)
async function dispositivo({ movil = false } = {}) {
  const { browserContextId } = await cdp("Target.createBrowserContext");
  const { targetId } = await cdp("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  await cdp("Runtime.enable", {}, sessionId);
  if (movil) await cdp("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true }, sessionId);
  else await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const d = {
    async js(codigo, ms = 90000) {
      const r = await Promise.race([
        cdp("Runtime.evaluate", { expression: `(async () => { ${AYUDA}\n${codigo}\n})()`, awaitPromise: true, returnByValue: true }, sessionId),
        espera(ms).then(() => { throw new Error("la página no contestó en " + ms / 1000 + " s"); }),
      ]);
      if (r.exceptionDetails) {
        const ex = r.exceptionDetails.exception;
        throw new Error((ex && (ex.description || ex.value)) || r.exceptionDetails.text);
      }
      return r.result.value;
    },
    async abrir(url) {
      await cdp("Page.navigate", { url }, sessionId);
      await espera(300);
      await hastaQue(() => d.js(`return document.readyState === "complete" && !!window.SweetSuite && !!document.querySelector("#entrada:not([hidden])")`, 5000), 20000, "que cargue SweetSuite");
    },
  };
  return d;
}

async function main() {
  // Esperar al servidor (siembra los datos de antes) y al navegador
  await hastaQue(async () => (await fetch(URL_SUITE + "cuentas.json")).ok, 60000, "el servidor de desarrollo").catch((e) => {
    throw new Error(e.message + (errServidor ? "\n" + errServidor.slice(-400) : ""));
  });
  const ruta = await hastaQue(() => existsSync(join(perfil, "DevToolsActivePort")) && readFileSync(join(perfil, "DevToolsActivePort"), "utf8").trim().split("\n"), 20000, "el navegador");
  ws = new WebSocket(`ws://127.0.0.1:${ruta[0]}${ruta[1]}`);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pendientes.has(d.id)) {
      const p = pendientes.get(d.id);
      pendientes.delete(d.id);
      if (d.error) p.ko(new Error(d.error.message)); else p.ok(d.result);
    } else if (d.method === "Runtime.exceptionThrown") {
      errores.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text);
    }
  };
  console.log(`\nCon ${NAV.split("/").pop()}, sin ventana`);

  // ── Dispositivo A ──
  const A = await dispositivo();
  await A.abrir(URL_SUITE);
  const codigo = await prueba("se crea una cuenta, se enseña la clave de recuperación y se entra", () => A.js(`
    await entrar("alberto", "prueba-1234");
    await hasta(() => $("#b-nueva")); $("#b-nueva").click();
    await hasta(() => $("#f-crear")); const c = $("#f-crear"); c.repetir.value = "prueba-1234"; c.requestSubmit();
    const cod = await hasta(() => $("#codigo-rec") && $("#codigo-rec").textContent.replace(/\\s/g, ""), 20000);
    $("#c-guardada").click(); $("#b-seguir").click();
    await hasta(() => location.hash === "#inicio" && document.querySelectorAll(".app-tarjeta").length === 2);
    return cod;`));

  await prueba("Ironrack: con el token, un entreno nuevo se sube a GitHub al volver al inicio", () => A.js(`
    location.hash = "#app/ironrack";
    const W = await hasta(() => { const w = marco("ironrack"); return w && w.IR && w.IR.almacen && w.IR.almacen.S.doc && w; });
    const Al = W.IR.almacen;
    await Al.cambiarToken("dev"); await sinDialogo();
    Al.ponerAutoguardado(false);
    Al.anadir("sesiones", { id: "prueba-1", nombre: "Prueba", inicio: Date.now(), fin: Date.now() + 1000, ejercicios: [] });
    const pendiente = Al.pendiente();
    location.hash = "#inicio";
    await hasta(() => !Al.pendiente(), 60000);
    Al.ponerAutoguardado(true);
    const r = await fetch("/__dev/api/repos/dev/ironrack-data-dev/contents/alberto-ironrack.enc", { headers: { Authorization: "Bearer dev" } });
    return pendiente && r.ok;`));

  await prueba("Solvento: con el token se traen los datos del Solvento de antes y se suben", () => A.js(`
    location.hash = "#app/solvento";
    const W = await hasta(() => { const w = marco("solvento"); return w && w.SolventoDB && w.document.getElementById("boot-overlay").style.display === "none" && w; }, 30000);
    const d = W.document;
    d.getElementById("sync-token").value = "dev"; d.getElementById("sync-save-token").click();
    await hasta(() => d.getElementById("sync-status").textContent.includes("empieza vacío"), 30000);
    await sinDialogo();
    d.getElementById("antiguo-pass").value = "desarrollo"; d.getElementById("antiguo-token").value = "dev";
    W.confirm = () => true; d.getElementById("antiguo-traer").click();
    await hasta(() => W.SolventoDB.state.doc.movimientos.length === 3, 30000);
    await hasta(async () => (await fetch("/__dev/api/repos/dev/solvento-data-dev/contents/alberto-solvento.enc", { headers: { Authorization: "Bearer dev" } })).ok, 30000);
    return true;`));

  await prueba("el inicio enseña el resumen de cada app", () => A.js(`
    location.hash = "#inicio";
    await hasta(() => $('[data-resumen-app="solvento"]').textContent.includes("Patrimonio") &&
      $('[data-resumen-app="ironrack"]').textContent.includes("esta semana"));
    return true;`));

  // ── Dispositivo B: la misma cuenta, a la vez ──
  const B = await dispositivo();
  await B.abrir(URL_SUITE);
  await prueba("otro dispositivo trae la cuenta de GitHub al pegar el token", () => B.js(`
    await entrar("alberto", "prueba-1234");
    await hasta(() => $("#b-yalauso")); $("#b-yalauso").click();
    await hasta(() => location.hash === "#inicio");
    location.hash = "#app/solvento";
    const W = await hasta(() => { const w = marco("solvento"); return w && w.SolventoDB && w.document.getElementById("boot-overlay").style.display === "none" && w; }, 30000);
    W.document.getElementById("sync-token").value = "dev"; W.document.getElementById("sync-save-token").click();
    await hasta(() => W.SolventoDB.state.doc && W.SolventoDB.state.doc.movimientos.length === 3, 40000);
    await sinDialogo();
    return true;`));

  await prueba("dos dispositivos guardan a la vez y los dos acaban con todo", async () => {
    const mov = (id) => `{ id: "${id}", fecha: "29/10/2026", tipo: "Gasto", importe: "5", cuenta_origen: "Banco de prueba", tipo_gasto: "Prueba", detalle: "${id}" }`;
    await A.js(`location.hash = "#app/solvento"; const W = marco("solvento"); W.SolventoDB.state.doc.movimientos.push(${mov("desde-A")}); await W.SolventoBoot.saveDoc();
      await hasta(() => W.document.getElementById("sn-estado").textContent.includes("Sincronizado"), 20000); return true;`);
    await B.js(`const W = marco("solvento"); W.SolventoDB.state.doc.movimientos.push(${mov("desde-B")}); await W.SolventoBoot.saveDoc();
      await hasta(() => W.document.getElementById("sn-estado").textContent.includes("Sincronizado"), 20000); return true;`);
    const enA = await A.js(`location.hash = "#inicio"; await espera(500); location.hash = "#app/solvento";
      const W = marco("solvento"); return await hasta(() => { const ids = W.SolventoDB.state.doc.movimientos.map((m) => m.id); return ids.includes("desde-A") && ids.includes("desde-B") && ids.length; }, 20000);`);
    const enB = await B.js(`const W = marco("solvento"); return W.SolventoDB.state.doc.movimientos.length;`);
    if (enA !== 5 || enB !== 5) throw new Error(`A tiene ${enA} y B tiene ${enB}; debían ser 5`);
    return true;
  });

  // ── Una empresa ──
  const E = await dispositivo();
  await E.abrir(URL_SUITE);
  await prueba("empresa: quien no es representante no pasa del segundo paso", () => E.js(`
    $('[data-modo="empresa"]').click();
    await hasta(() => $("#f-empresa")); let f = $("#f-empresa"); f.empresa.value = "abies"; f.contrasena.value = "empresa-1234"; f.requestSubmit();
    await hasta(() => $("#f-rep")); f = $("#f-rep"); f.usuario.value = "hafsa"; f.contrasena.value = "x"; f.requestSubmit();
    return await hasta(() => $(".entrada-error").textContent.includes("no es representante"));`));
  await prueba("empresa: se crea con su representante y cada cambio queda firmado", () => E.js(`
    const f = $("#f-rep"); f.usuario.value = "alberto"; f.contrasena.value = "prueba-1234"; f.requestSubmit();
    await hasta(() => $("#b-nueva")); $("#b-nueva").click();
    await hasta(() => $("#f-crear")); const c = $("#f-crear"); c.repetir.value = "empresa-1234"; c.requestSubmit();
    await hasta(() => $("#c-guardada"), 30000); $("#c-guardada").click(); $("#b-seguir").click();
    await hasta(() => location.hash === "#inicio"); location.hash = "#app/solvento";   // ABIES tiene Solvento y Agora
    const W = await hasta(() => { const w = marco("solvento"); return w && w.SolventoDB && w.document.getElementById("boot-overlay").style.display === "none" && w; }, 40000);
    W.document.getElementById("sync-token").value = "dev"; W.document.getElementById("sync-save-token").click();
    await hasta(() => W.document.getElementById("sync-status").textContent.includes("empieza vacío"), 30000);
    await sinDialogo();
    W.document.getElementById("antiguo-pass").value = "desarrollo"; W.document.getElementById("antiguo-token").value = "dev";
    W.confirm = () => true; W.document.getElementById("antiguo-traer").click();
    const reg = await hasta(() => (W.SolventoDB.state.doc.registro || [])[0], 30000);
    return reg.nombre === "Alberto" && $("#nombre-usuario").textContent === "ABIES · Alberto";`));
  await prueba("empresa: con una contraseña mal no se abre", () => E.js(`
    await window.SweetSuite.bloquear();
    await hasta(() => $("#f-empresa")); let f = $("#f-empresa"); f.contrasena.value = "empresa-1234"; f.requestSubmit();
    await hasta(() => $("#f-rep")); f = $("#f-rep"); f.usuario.value = "alberto"; f.contrasena.value = "mala"; f.requestSubmit();
    await hasta(() => $(".entrada-error").textContent.includes("no es correcta"), 20000);
    f = $("#f-rep"); f.contrasena.value = "prueba-1234"; f.requestSubmit();
    await hasta(() => location.hash === "#inicio", 20000); location.hash = "#app/solvento";
    return true;`));

  await prueba("Agora: ABIES entra con el cargo de su representante y lo guardado sigue al volver", () => E.js(`
    location.hash = "#app/agora";
    const abierta = () => { const w = marco("agora"); return w && w.WA && w.WA.Sesion && w.WA.Sesion.modo === "abierta" && w; };
    let W = await hasta(abierta, 40000);
    const datos = W.WA.Sesion.datos;
    await datos.escribir("asociacion", Object.assign({}, await datos.leer("asociacion"), { nombre: "ABIES de prueba" }));
    const cargo = W.WA.Sesion.firma === "Alberto · Presidencia" && W.WA.Sesion.puedeEditar("socios");
    await window.SweetSuite.bloquear();
    await hasta(() => $("#f-empresa")); let f = $("#f-empresa"); f.contrasena.value = "empresa-1234"; f.requestSubmit();
    await hasta(() => $("#f-rep")); f = $("#f-rep"); f.usuario.value = "alberto"; f.contrasena.value = "prueba-1234"; f.requestSubmit();
    await hasta(() => location.hash === "#inicio", 20000); location.hash = "#app/agora";
    W = await hasta(abierta, 40000);
    return cargo && (await W.WA.Sesion.datos.leer("asociacion")).nombre === "ABIES de prueba";`));

  await prueba("Agora: con el token se sube a Agora-Data, con sus adjuntos aparte", () => E.js(`
    const W = marco("agora");
    await W.WA.Nube.cambiarToken("dev"); await sinDialogo();
    const datos = W.WA.Sesion.datos;
    const ficha = await datos.guardarArchivo({ nombre: "estatutos.txt", tipoMime: "text/plain", categoria: "Estatutos", fecha: "2026-10-29" }, new TextEncoder().encode("Estatutos de prueba"));
    await W.WA.Sesion.esperar(); await W.WA.Nube.subir();
    const api = (r) => fetch("/__dev/api/repos/dev/agora-data-dev/contents/" + r, { headers: { Authorization: "Bearer dev" } });
    const ok = (await api("abies-agora.enc")).ok && (await api("adjuntos/" + ficha.id + ".enc")).ok && (await api("abies.llavero.json")).ok;
    window.__adjunto = ficha.id;
    return ok && W.WA.Nube.estado === "ok" && !W.WA.Nube.pendiente();`));

  // Otro dispositivo de ABIES: dos miembros de la junta a la vez
  const F = await dispositivo();
  await F.abrir(URL_SUITE);
  const adjunto = await E.js(`return window.__adjunto;`);
  await prueba("Agora: otro dispositivo trae lo de la junta al pegar su token, adjuntos incluidos", () => F.js(`
    $('[data-modo="empresa"]').click();
    await hasta(() => $("#f-empresa")); let f = $("#f-empresa"); f.empresa.value = "abies"; f.contrasena.value = "empresa-1234"; f.requestSubmit();
    await hasta(() => $("#f-rep")); f = $("#f-rep"); f.usuario.value = "alberto"; f.contrasena.value = "prueba-1234"; f.requestSubmit();
    await hasta(() => $("#b-yalauso")); $("#b-yalauso").click();
    await hasta(() => location.hash === "#inicio"); location.hash = "#app/agora";
    let W = await hasta(() => { const w = marco("agora"); return w && w.WA && w.WA.Sesion && w.WA.Sesion.modo === "abierta" && w; }, 40000);
    await W.WA.Nube.cambiarToken("dev"); await sinDialogo();
    // (si las claves de la cuenta cambian, Agora vuelve a entrar con las de GitHub)
    W = await hasta(async () => { const w = marco("agora"); return w.WA.Sesion.modo === "abierta" &&
      (await w.WA.Sesion.datos.leer("asociacion")).nombre === "ABIES de prueba" && w; }, 40000);
    const bytes = await W.WA.Sesion.datos.leerArchivo(${JSON.stringify(adjunto)});
    return new TextDecoder().decode(bytes) === "Estatutos de prueba";`));

  await prueba("Agora: dos representantes guardan a la vez y los dos acaban con todo", async () => {
    const alta = (quien) => `const W = marco("agora");
      await W.WA.Sesion.datos.guardar("socios", { nombre: "Socio ${quien}", apellidos: "Prueba", fechaAlta: "2026-10-29" });
      await W.WA.Sesion.esperar(); return true;`;
    await E.js(alta("de E"));
    await F.js(alta("de F"));
    // Los dos suben a la vez: el segundo choca, trae lo del otro, mezcla y vuelve a subir
    await Promise.all([E.js(`await marco("agora").WA.Nube.subir(); return true;`), F.js(`await marco("agora").WA.Nube.subir(); return true;`)]);
    const nombres = `const W = marco("agora"); await W.WA.Nube.sincronizar({ forzar: true });
      return (await W.WA.Sesion.datos.listar("socios")).map((s) => s.nombre).sort().join(",");`;
    const enE = await E.js(nombres), enF = await F.js(nombres);
    if (enE !== "Socio de E,Socio de F" || enF !== enE) throw new Error("E tiene «" + enE + "» y F «" + enF + "»");
    // Lo que uno borra desaparece en el otro, también su adjunto en GitHub
    await F.js(`const W = marco("agora"); await W.WA.Sesion.datos.borrarArchivo(${JSON.stringify(adjunto)}); await W.WA.Sesion.esperar(); await W.WA.Nube.subir(); return true;`);
    return await E.js(`const W = marco("agora"); await W.WA.Nube.sincronizar({ forzar: true });
      const r = await fetch("/__dev/api/repos/dev/agora-data-dev/contents/adjuntos/" + ${JSON.stringify(adjunto)} + ".enc", { headers: { Authorization: "Bearer dev" } });
      const sinAdjunto = r.status === 404 && !(await W.WA.Sesion.datos.listar("documentos")).length;
      // Y en el inicio de SweetSuite, el resumen de Agora
      location.hash = "#inicio";
      await hasta(() => $('[data-resumen-app="agora"]').textContent.includes("socios activos"));
      location.hash = "#app/agora";
      return sinAdjunto;`);
  });

  await prueba("se bloquea solo tras un rato sin usarla", () => E.js(`
    const real = Date.now; Date.now = () => real() + 16 * 60000;
    document.dispatchEvent(new Event("visibilitychange"));
    // (antes de bloquear, Solvento sube lo pendiente: con el ordenador cargado tarda)
    try { await hasta(() => !$("#entrada").hidden, 60000); } finally { Date.now = real; }
    return $("#aviso").textContent.includes("bloqueado");`));

  await prueba("la política de contenido no deja conectar con otros sitios", () => A.js(`
    const W = marco("solvento");
    let salio = false; try { await W.fetch("https://example.com/?robado=1"); salio = true; } catch (e) {}
    return !salio;`));

  // ── En tamaño de móvil ──
  const M = await dispositivo({ movil: true });
  await M.abrir(URL_SUITE);
  await prueba("en el móvil: pestañas abajo, cajón y «Ir a…» desde una app", () => M.js(`
    await entrar("ana-no-existe", "x"); await hasta(() => $(".entrada-error").textContent.includes("incorrectos"));
    await entrar("paula", "paula-1234");
    await hasta(() => $("#b-nueva")); $("#b-nueva").click();
    await hasta(() => $("#f-crear")); const c = $("#f-crear"); c.repetir.value = "paula-1234"; c.requestSubmit();
    await hasta(() => $("#c-guardada"), 30000); $("#c-guardada").click(); $("#b-seguir").click();
    const W = await hasta(() => { const w = marco("solvento"); return w && w.SolventoDB && w.document.getElementById("boot-overlay").style.display === "none" && w; }, 30000);
    location.hash = "#inicio"; await espera(300);
    const pestañas = getComputedStyle($(".tabs")).display === "grid" && getComputedStyle($(".hamburguesa")).display !== "none";
    location.hash = "#app/solvento"; await espera(300);
    W.SolventoBoot.elegirApp();
    const ir = await hasta(() => !$("#dialogo").hidden && $("#dialogo").querySelectorAll("[data-ir]").length);
    return pestañas && ir === 3;`));

  // ── Un tercer dispositivo con otra contraseña: la pide, y vale la clave de recuperación ──
  const C = await dispositivo();
  await C.abrir(URL_SUITE);
  await prueba("otro dispositivo con otra contraseña: la pide, y vale la clave de recuperación", () => C.js(`
    await entrar("alberto", "otra-clave-9");
    await hasta(() => $("#b-yalauso")); $("#b-yalauso").click();
    await hasta(() => location.hash === "#inicio");
    location.hash = "#app/ironrack";
    const W = await hasta(() => { const w = marco("ironrack"); return w && w.IR && w.IR.almacen && w.IR.almacen.S.doc && w; });
    const p = W.IR.almacen.cambiarToken("dev");
    await hasta(() => $("#f-clave"), 20000);
    $("#f-clave").clave.value = ${JSON.stringify(codigo || "")}; $("#f-clave").requestSubmit();
    await p; await sinDialogo();
    return await hasta(() => W.IR.almacen.S.doc.sesiones.some((s) => s.id === "prueba-1"), 30000);`));

  // ── La cuenta Admin ──
  const AdM = await dispositivo();
  await AdM.abrir(URL_SUITE);
  await prueba("el Admin da de alta a una persona y esa persona ya puede entrar", () => AdM.js(`
    await entrar("admin", "admin-1234");
    await hasta(() => $("#b-nueva")); $("#b-nueva").click();
    await hasta(() => $("#f-crear")); const c = $("#f-crear"); c.repetir.value = "admin-1234"; c.requestSubmit();
    await hasta(() => $("#c-guardada"), 30000); $("#c-guardada").click(); $("#b-seguir").click();
    await hasta(() => $('[data-adm="token"]'), 20000); $('[data-adm="token"]').click();
    await hasta(() => $("#f-token-admin")); $("#f-token-admin").token.value = "dev"; $("#f-token-admin").requestSubmit();
    await hasta(() => $('[data-adm="nueva"]'), 30000); await sinDialogo();
    $('[data-adm="nueva"][data-tipo="persona"]').click();
    await hasta(() => $("#f-cuenta")); const f = $("#f-cuenta");
    f.usuario.value = "lucia"; f.nombre.value = "Lucía"; f.querySelector('input[name="app"][value="ironrack"]').checked = true; f.requestSubmit();
    await hasta(() => $('[data-adm="guardar"]')); $('[data-adm="guardar"]').click();
    await hasta(() => !$("#dialogo").hidden && $("#dialogo").textContent.includes("Lucia-Ironrack"), 20000);
    $('#dialogo [data-r="ok"]').click();
    return true;`));
  await prueba("…y quien no es Admin no ve la Administración", async () => {
    await AdM.abrir(URL_SUITE);
    return AdM.js(`
      await entrar("lucia", "lucia-1234");
      await hasta(() => $("#b-nueva")); $("#b-nueva").click();
      await hasta(() => $("#f-crear")); const c = $("#f-crear"); c.repetir.value = "lucia-1234"; c.requestSubmit();
      await hasta(() => $("#c-guardada"), 30000); $("#c-guardada").click(); $("#b-seguir").click();
      await hasta(() => marco("ironrack"), 20000);
      return !document.querySelector("[data-adm]") && !window.SweetSuite.apps().some((a) => a.id === "admin");`);
  });

  await prueba("ninguna página ha dado errores de JavaScript", () => {
    if (errores.length) throw new Error(errores.length + ": " + errores[0].split("\n")[0]);
    return true;
  });
}

main().then(() => {
  console.log("");
  if (fallos.length) { console.log(`✗ Navegador: ${fallos.length} fallan, ${bien} bien`); terminar(1); }
  else { console.log(`✓ Navegador: todo bien (${bien})`); terminar(0); }
}).catch((e) => {
  console.log("\n✗ No se pudieron hacer las pruebas: " + (e && e.message ? e.message : e));
  terminar(1);
});

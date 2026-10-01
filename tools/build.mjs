#!/usr/bin/env node
/*
 * webkit_asociaciones — Empaquetado en UN solo archivo HTML.
 *
 *   node tools/build.mjs              → escribe dist/webkit_asociaciones.html
 *   node tools/build.mjs --comprobar  → falla si dist/ no está al día con src/
 *                                       (lo usa la integración continua)
 *
 * Qué hace: lee src/index.html y sustituye cada
 *   <link rel="stylesheet" href="css/x.css">  por  <style>…contenido…</style>
 *   <script src="js/x.js"></script>            por  <script>…contenido…</script>
 * y añade la versión. Nada más: sin dependencias, sin minificar (así cualquiera
 * puede leer el archivo distribuido y comprobar qué hace).
 *
 * Para desarrollar NO hace falta: src/index.html se abre directamente.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(RAIZ, "src");
const SALIDA = join(RAIZ, "dist", "webkit_asociaciones.html");

export function construir() {
  const paquete = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  let html = readFileSync(join(SRC, "index.html"), "utf8");
  const usados = [];

  const leer = (ruta) => {
    const completa = join(SRC, ruta);
    if (!existsSync(completa)) throw new Error(`index.html enlaza ${ruta}, pero no existe`);
    usados.push(ruta);
    return readFileSync(completa, "utf8");
  };

  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, ruta) =>
    `<style>/* ${ruta} */\n${leer(ruta)}</style>`);

  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, ruta) => {
    // Un "</script" dentro del código cerraría la etiqueta antes de tiempo.
    const codigo = leer(ruta).replace(/<\/script/gi, "<\\/script");
    return `<script>/* ${ruta} */\n${codigo}</script>`;
  });

  // La versión sale de package.json; no se pone la fecha para que dos builds
  // del mismo código den exactamente el mismo archivo (y --comprobar funcione).
  html = html.replace("<!-- build:version -->",
    `<script>window.WA_VERSION = ${JSON.stringify(paquete.version)};</script>`);

  // Nada externo: si quedara un src= o href= a un archivo, el HTML no funcionaría solo.
  const externo = html.match(/<(script|link)[^>]+(src|href)="(?!data:|#)[^"]+"/);
  if (externo) throw new Error(`Queda una referencia externa sin empaquetar: ${externo[0]}`);

  const cabecera = `<!--\n  webkit_asociaciones ${paquete.version}\n  Archivo generado por tools/build.mjs a partir de src/. No lo edites a mano.\n-->\n`;
  return { html: cabecera + html, usados };
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const { html, usados } = construir();
  if (process.argv.includes("--comprobar")) {
    const actual = existsSync(SALIDA) ? readFileSync(SALIDA, "utf8") : "";
    if (actual !== html) {
      console.error("✗ dist/webkit_asociaciones.html no está al día. Ejecuta: npm run build");
      process.exit(1);
    }
    console.log("✓ dist/ está al día");
  } else {
    mkdirSync(dirname(SALIDA), { recursive: true });
    writeFileSync(SALIDA, html);
    const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
    console.log(`✓ dist/webkit_asociaciones.html (${kb} KB, ${usados.length} archivos empaquetados)`);
  }
}

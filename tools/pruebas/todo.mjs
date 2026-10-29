/*
 * SweetSuite — Todas las pruebas: primero las rápidas (las piezas) y después
 * las de uso real con navegador.
 *
 *   node tools/pruebas/todo.mjs             todas (un par de minutos)
 *   node tools/pruebas/todo.mjs --rapidas   solo las rápidas (unos segundos)
 *
 * Las rápidas se pasan solas antes de cada `git push` (.githooks/pre-push) y
 * todas en GitHub en cada subida (.github/workflows/pruebas.yml).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const pasos = [["Piezas", "piezas.mjs"]];
if (!process.argv.includes("--rapidas")) pasos.push(["Navegador", "navegador.mjs"]);

let mal = 0;
for (const [nombre, archivo] of pasos) {
  console.log(`\n━━ ${nombre} ━━`);
  const r = spawnSync(process.execPath, [join(AQUI, archivo)], { stdio: "inherit" });
  if (r.status !== 0) mal++;
}
console.log(mal ? `\n✗ Algo falla: revisa las ✗ de arriba` : `\n✓ Todo bien`);
process.exit(mal ? 1 : 0);

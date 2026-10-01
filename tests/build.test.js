// El archivo distribuido debe funcionar SOLO: sin ningún CSS ni JS externo.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

test("el build empaqueta todo en un único HTML", async () => {
  const { construir } = await import("../tools/build.mjs");
  const { html, usados } = construir();
  assert.ok(!/<script[^>]+src=/.test(html), "no quedan <script src>");
  assert.ok(!/<link[^>]+stylesheet/.test(html), "no quedan hojas de estilo enlazadas");
  assert.ok(html.includes("window.WA_VERSION"));
  assert.ok(usados.includes("js/arranque.js"));
  // arranque.js tiene que ir el último: los módulos se registran antes de arrancar.
  assert.ok(html.lastIndexOf("/* js/arranque.js */") > html.lastIndexOf("/* js/modulos/"));
});

test("todos los .js de src/ están enlazados en index.html (no se olvida ninguno)", () => {
  const index = readFileSync(join(__dirname, "../src/index.html"), "utf8");
  const raiz = join(__dirname, "../src/js");
  const pendientes = [];
  (function recorrer(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) recorrer(join(dir, e.name), rel + e.name + "/");
      else if (e.name.endsWith(".js") && !index.includes(`src="js/${rel}${e.name}"`)) pendientes.push(rel + e.name);
    }
  })(raiz, "");
  assert.deepEqual(pendientes, []);
});

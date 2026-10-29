/*
 * SweetSuite — Service worker: SweetSuite y sus apps abren sin conexión.
 *
 *   · La API de GitHub nunca pasa por la caché: ahí viven los datos cifrados, y
 *     una copia vieja provocaría conflictos y cambios perdidos. Siempre red.
 *   · Lo demás de este sitio (SweetSuite, las apps, los precios): primero la
 *     red y, sin conexión, la última copia. Así una versión nueva llega en
 *     cuanto se publica y la app sigue abriendo en el gimnasio o en el metro.
 *   · La letra (Google Fonts): primero la caché; no cambia.
 *
 * Al instalarse se guarda todo lo que hace falta para abrir sin conexión: lo
 * de SweetSuite y lo que piden los index.html de cada app.
 */
const VERSION = "sweetsuite-1.5.0";
const FUENTES = "sweetsuite-fuentes";
const BASE = [
  "./", "./index.html", "./manifest.json", "./cuentas.json", "./version.json",
  "./src/css/suite.css", "./src/js/tema.js", "./src/js/entorno.js", "./src/js/llavero.js", "./src/js/admin.js", "./src/js/suite.js",
  "./img/icono.svg", "./img/icono-180.png", "./img/icono-192.png", "./img/icono-512.png", "./img/contornos.svg",
];
const APPS = ["./apps/solvento/", "./apps/ironrack/", "./apps/agora/src/"];

// Lo que carga el index.html de cada app (scripts, estilos, imágenes)
async function recursosDe(carpeta) {
  try {
    const res = await fetch(carpeta + "index.html", { cache: "no-cache" });
    if (!res.ok) return [];
    const html = await res.text();
    const urls = [carpeta + "index.html", carpeta + "perfil.json"];
    const re = /(?:src|href)="((?:src\/|img\/|js\/|css\/)[^"]+)"/g;
    let m;
    while ((m = re.exec(html))) urls.push(carpeta + m[1]);
    return urls;
  } catch (e) { return []; }
}

self.addEventListener("install", (ev) => {
  ev.waitUntil((async () => {
    const c = await caches.open(VERSION);
    const deApps = (await Promise.all(APPS.map(recursosDe))).flat();
    // Uno a uno: si falta alguno, que no impida guardar los demás
    await Promise.all(BASE.concat(deApps).map((u) =>
      c.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n !== VERSION && n !== FUENTES).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "api.github.com" || url.hostname.endsWith("githubusercontent.com")) return;
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    ev.respondWith(caches.open(FUENTES).then(async (c) => {
      const hay = await c.match(req);
      if (hay) return hay;
      const r = await fetch(req);
      if (r.ok || r.type === "opaque") c.put(req, r.clone());
      return r;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Primero la red; sin ella, la copia. Las URL con ?… (los ?v= y los ?_=
  // para no usar caché) se guardan sin el parámetro, para encontrarlas sin red.
  const clave = url.origin + url.pathname;
  ev.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok) {
        const copia = r.clone();
        caches.open(VERSION).then((c) => c.put(clave, copia)).catch(() => {});
      }
      return r;
    } catch (e) {
      const c = await caches.open(VERSION);
      return (await c.match(clave)) || (await c.match(req, { ignoreSearch: true })) ||
        (req.mode === "navigate" ? await c.match("./index.html") : Response.error());
    }
  })());
});

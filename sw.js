/*
 * Ironrack — Service worker: guarda la app para que abra sin conexión en el
 * gimnasio. Solo la app: las llamadas a GitHub van siempre a la red.
 *
 * Al cambiar cualquier archivo de la app hay que subir VERSION, o los móviles
 * seguirán con la copia vieja.
 */
const VERSION = "ironrack-1.5.1";
const FUENTES = "ironrack-fuentes"; // no va con la versión: se conserva entre una y otra
const APP = [
  "./", "index.html", "manifest.json", "src/css/app.css",
  "src/js/util.js", "src/js/tema.js", "src/js/cripto.js", "src/js/github.js", "src/js/almacen.js",
  "src/js/biblioteca.js", "src/js/analisis.js", "src/js/ui.js", "src/js/descanso.js",
  "src/js/entrenar.js", "src/js/rutinas.js", "src/js/historial.js", "src/js/progreso.js",
  "src/js/ejercicios.js", "src/js/app.js",
  "img/icono.svg", "img/contornos.svg", "img/icono-180.png", "img/icono-192.png", "img/icono-512.png",
];

self.addEventListener("install", (ev) => {
  // reload: la copia sin conexión se baja del servidor, no de la caché del
  // navegador, que podría tener todavía la versión anterior.
  ev.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(APP.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== FUENTES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Red primero y, si no hay, la copia: así una versión nueva llega en cuanto
// hay conexión, y sin ella la app abre igual. Con la cobertura a medias del
// gimnasio la red puede tardar en fallar, así que a los 3 s se tira de copia.
self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== "GET") return;
  // Albert Sans (Google Fonts): copia primero. Una fuente no cambia, y así la
  // pantalla de entrada se ve igual sin cobertura.
  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    ev.respondWith(caches.open(FUENTES).then((c) => c.match(ev.request).then((r) => r || fetch(ev.request).then((res) => {
      if (res.ok || res.type === "opaque") c.put(ev.request, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;
  const copia = () => caches.match(ev.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"));
  // GitHub Pages deja guardar cada archivo 10 minutos (max-age=600): sin
  // no-cache, un cambio recién publicado tardaba eso en verse. Así se pregunta
  // siempre al servidor, que contesta un 304 sin cuerpo si no ha cambiado.
  const red = fetch(new Request(ev.request.url, { cache: "no-cache", credentials: "same-origin" })).then((r) => {
    if (r.ok) { const c = r.clone(); caches.open(VERSION).then((cache) => cache.put(ev.request, c)); }
    return r;
  });
  const plazo = new Promise((ok) => setTimeout(ok, 3000)).then(copia).then((r) => r || red);
  ev.respondWith(Promise.race([red, plazo]).catch(copia));
});

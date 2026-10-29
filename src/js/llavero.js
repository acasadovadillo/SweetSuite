/*
 * SweetSuite — El llavero de cada cuenta: la clave maestra, la contraseña y la
 * clave de recuperación.
 *
 * Cada cuenta tiene una CLAVE MAESTRA aleatoria (256 bits) que no cambia nunca.
 * De ella sale el secreto de cada app (HMAC-SHA256 con el nombre de la app),
 * que es con lo que cada app cifra su archivo, como antes lo cifraba con la
 * contraseña. La clave maestra va guardada en el llavero, envuelta dos veces:
 *
 *   · con la contraseña  (PBKDF2-SHA256, 600.000 iteraciones → AES-256-GCM)
 *   · con la clave de recuperación (160 bits aleatorios, 32 caracteres)
 *
 * Así, cambiar la contraseña o recuperarla con la clave de recuperación solo
 * vuelve a envolver la clave maestra: los archivos de las apps no se tocan.
 *
 * El llavero no tiene nada en claro que sirva sin la contraseña o la clave de
 * recuperación. Se guarda en este dispositivo y, en GitHub, al lado del archivo
 * de cada app (<usuario>.llavero.json en Solvento-Data e Ironrack-Data), para
 * que un dispositivo nuevo lo encuentre en cuanto tenga el token de una app.
 *
 * Si alguna vez una cuenta acaba con dos llaveros distintos (se estrenó en dos
 * dispositivos sin conexión), se quedan los dos: gana el más antiguo y la
 * clave del otro pasa a «anteriores», cifrada con la ganadora. Las apps
 * intentan abrir con la actual y, si no, con las anteriores, y al guardar ya
 * cifran con la actual: nada se queda sin poder abrirse.
 */
(function () {
  "use strict";
  const ITER_CONTRASENA = 600000;
  const ITER_RECUPERACION = 20000;   // la clave de recuperación es imposible de adivinar
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const fallo = (msg, code) => { const e = new Error(msg); e.code = code; return e; };
  const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));
  function aB64(bytes) {
    let s = "";
    const a = new Uint8Array(bytes);
    for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s);
  }
  function deB64(b64) {
    const s = atob(b64);
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  // ── Piezas de cifrado ──
  async function claveDeTexto(texto, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(texto), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function cifrar(bytes, clave) {
    const iv = aleatorio(12);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, bytes);
    return { iv: aB64(iv), ct: aB64(ct) };
  }
  async function descifrar(caja, clave) {
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(caja.iv) }, clave, deB64(caja.ct)));
    } catch (e) {
      throw fallo("No se abre con esa clave", "BAD_PASSWORD");
    }
  }
  async function hmac(bytesClave, texto) {
    const k = await crypto.subtle.importKey("raw", bytesClave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(texto)));
  }
  // Para lo que el llavero guarda cifrado con la propia clave maestra
  // (las anteriores y las preferencias), una clave derivada de ella.
  async function claveInterna(maestra) {
    const raw = await hmac(maestra, "SweetSuite/interno");
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  // El secreto de cada app: lo que la app usa como «contraseña» de su archivo
  async function secretoDeApp(maestra, app) {
    const b = await hmac(maestra, "SweetSuite/app/" + app);
    return aB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // ── Clave de recuperación: 160 bits en base32 de Crockford, de 4 en 4 ──
  const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  function nuevaRecuperacion() {
    const b = aleatorio(20);
    let bits = "", s = "";
    b.forEach((x) => { bits += x.toString(2).padStart(8, "0"); });
    for (let i = 0; i < bits.length; i += 5) s += ALFABETO[parseInt(bits.slice(i, i + 5), 2)];
    return s.match(/.{4}/g).join("-");
  }
  // Lo escrito a mano: sin guiones ni espacios, en mayúsculas y con las letras
  // que se confunden con números corregidas (O → 0, I y L → 1).
  const normalizarRecuperacion = (s) => String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0").replace(/[IL]/g, "1");
  const pareceRecuperacion = (s) => normalizarRecuperacion(s).length === 32;

  // ── El llavero ──
  async function envolver(maestra, texto, iter) {
    const salt = aleatorio(16);
    const caja = await cifrar(maestra, await claveDeTexto(texto, salt, iter));
    return Object.assign({ kdf: "PBKDF2-SHA256", iter, salt: aB64(salt) }, caja);
  }
  async function desenvolver(caja, texto) {
    return descifrar(caja, await claveDeTexto(texto, deB64(caja.salt), caja.iter));
  }

  // Crea un llavero nuevo. Devuelve { llavero, maestra, recuperacion }.
  // Uno «provisional» es el de un dispositivo que dice que la cuenta ya existe
  // en otro: no lleva clave de recuperación, y en cuanto aparezca el de GitHub,
  // gana ese.
  async function crear(usuario, contrasena, { provisional = false } = {}) {
    const maestra = aleatorio(32);
    const recuperacion = provisional ? null : nuevaRecuperacion();
    const ahora = Date.now();
    const llavero = {
      v: 1, tipo: "llavero-sweetsuite", usuario,
      id: aB64(aleatorio(9)).replace(/[+/=]/g, "x"),
      creado: ahora, actualizado: ahora,
      provisional: provisional || undefined,
      contrasena: await envolver(maestra, contrasena, ITER_CONTRASENA),
      recuperacion: recuperacion ? await envolver(maestra, normalizarRecuperacion(recuperacion), ITER_RECUPERACION) : null,
      anteriores: null,
      preferencias: null,
    };
    return { llavero, maestra, recuperacion };
  }

  // Abre con la contraseña o con la clave de recuperación. Devuelve la maestra.
  async function abrir(llavero, contrasena) {
    return desenvolver(llavero.contrasena, contrasena);
  }
  async function abrirConRecuperacion(llavero, codigo) {
    if (!llavero.recuperacion) throw fallo("Esta cuenta no tiene clave de recuperación", "SIN_RECUPERACION");
    return desenvolver(llavero.recuperacion, normalizarRecuperacion(codigo));
  }
  // Una u otra: lo que parezca una clave de recuperación se prueba como tal
  async function abrirConCualquiera(llavero, texto) {
    if (pareceRecuperacion(texto) && llavero.recuperacion) {
      try { return { maestra: await abrirConRecuperacion(llavero, texto), recuperada: true }; } catch (e) { /* sigue */ }
    }
    return { maestra: await abrir(llavero, texto), recuperada: false };
  }

  async function cambiarContrasena(llavero, maestra, nueva) {
    return Object.assign({}, llavero, { contrasena: await envolver(maestra, nueva, ITER_CONTRASENA), actualizado: Date.now() });
  }
  async function cambiarRecuperacion(llavero, maestra) {
    const recuperacion = nuevaRecuperacion();
    const nuevo = Object.assign({}, llavero, {
      recuperacion: await envolver(maestra, normalizarRecuperacion(recuperacion), ITER_RECUPERACION),
      provisional: undefined, actualizado: Date.now(),
    });
    return { llavero: nuevo, recuperacion };
  }

  // Las claves de llaveros que perdieron (ver arriba)
  async function anteriores(llavero, maestra) {
    if (!llavero.anteriores) return [];
    const b = await descifrar(llavero.anteriores, await claveInterna(maestra));
    return JSON.parse(dec.decode(b)).map(deB64);
  }
  async function conAnteriores(llavero, maestra, lista) {
    const unicas = [];
    lista.forEach((k) => { if (!igual(k, maestra) && !unicas.some((u) => igual(u, k))) unicas.push(k); });
    const caja = unicas.length ? await cifrar(enc.encode(JSON.stringify(unicas.map(aB64))), await claveInterna(maestra)) : null;
    return Object.assign({}, llavero, { anteriores: caja });
  }

  // Preferencias de la cuenta en SweetSuite (el color de acento), cifradas
  async function preferencias(llavero, maestra) {
    if (!llavero.preferencias) return {};
    try { return JSON.parse(dec.decode(await descifrar(llavero.preferencias, await claveInterna(maestra)))); }
    catch (e) { return {}; }
  }
  async function conPreferencias(llavero, maestra, prefs) {
    const caja = await cifrar(enc.encode(JSON.stringify(prefs || {})), await claveInterna(maestra));
    return Object.assign({}, llavero, { preferencias: caja, actualizado: Date.now() });
  }

  // Entre dos llaveros distintos de la misma cuenta, cuál se queda. Siempre el
  // mismo, lo mire quien lo mire: si no, dos dispositivos se lo cambiarían el
  // uno al otro sin fin.
  function ganador(a, b) {
    if (!!a.provisional !== !!b.provisional) return a.provisional ? b : a;
    if (a.creado !== b.creado) return a.creado < b.creado ? a : b;
    return a.id < b.id ? a : b;
  }

  const esLlavero = (x) => !!x && x.tipo === "llavero-sweetsuite" && x.v === 1 && !!x.contrasena;

  window.SweetLlavero = {
    crear, abrir, abrirConRecuperacion, abrirConCualquiera, cambiarContrasena, cambiarRecuperacion,
    anteriores, conAnteriores, preferencias, conPreferencias, secretoDeApp, ganador, esLlavero,
    nuevaRecuperacion, normalizarRecuperacion, pareceRecuperacion, igual,
  };
})();

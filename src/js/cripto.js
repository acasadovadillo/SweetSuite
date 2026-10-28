/*
 * Ironrack — Cifrado zero-knowledge (Web Crypto API).
 *
 * Mismo formato que Solvento, para que todo lo que vive en datos-cifrados se
 * abra igual:
 *   Derivación de clave : PBKDF2-HMAC-SHA256, 310.000 iteraciones
 *   Cifrado             : AES-256-GCM (contraseña errónea → falla al descifrar)
 *   Bloque              : JSON { v: 1, kdf, iter, salt, iv, ct } en base64
 *
 * La diferencia está en la sesión: Solvento deriva la clave en cada cifrado, y
 * aquí se guarda cada vez que marcas una serie. Derivarla 310.000 veces por
 * serie se nota en el móvil, así que la sesión la deriva una vez por sal y la
 * reutiliza; cada cifrado lleva su propio IV, que es lo que AES-GCM exige.
 *
 * «Recordar en este dispositivo» guarda la clave derivada —no la contraseña—
 * en IndexedDB como CryptoKey no exportable: el navegador puede usarla pero
 * nadie puede leer sus bytes, tampoco esta página.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});

  const ITER = 310000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function aB64(bytes) {
    let bin = "";
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }
  function deB64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const fallo = (msg, code) => { const e = new Error(msg); e.code = code; return e; };

  async function derivar(password, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  // Una sesión cifra siempre con su sal (la del documento publicado, cuando
  // lo hay) y descifra cualquier bloque cuya clave pueda obtener: con la
  // contraseña, todos; con solo la clave recordada, los de su sal.
  function sesion({ password = null, clave = null, salt = null, iter = null } = {}) {
    let miSalt = salt || aB64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
    let miIter = iter || ITER;
    const claves = new Map();
    if (clave) claves.set(miIter + ":" + miSalt, Promise.resolve(clave));

    function claveDe(s, it) {
      const k = it + ":" + s;
      if (!claves.has(k)) {
        if (password == null) throw fallo("Hace falta tu contraseña", "NECESITA_CONTRASENA");
        claves.set(k, derivar(password, deB64(s), it));
      }
      return claves.get(k);
    }

    async function cifrarBytes(bytes) {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const key = await claveDe(miSalt, miIter);
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
      return { v: 1, kdf: "PBKDF2-SHA256", iter: miIter, salt: miSalt, iv: aB64(iv), ct: aB64(ct) };
    }
    async function descifrarBytes(blob) {
      if (!blob || blob.v !== 1) throw fallo("Formato de bloque cifrado no reconocido", "FORMATO");
      const key = await claveDe(blob.salt, blob.iter || ITER);
      try {
        return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(blob.iv) }, key, deB64(blob.ct)));
      } catch (e) {
        throw fallo("Contraseña incorrecta", "BAD_PASSWORD");
      }
    }

    return {
      get salt() { return miSalt; },
      get iter() { return miIter; },
      tienePassword: password != null,
      // A partir de ahora se cifra con la sal de otro bloque (el publicado), para
      // que todos los dispositivos acaben usando la misma y la clave recordada
      // siga valiendo.
      adoptar(blob) { miSalt = blob.salt; miIter = blob.iter || ITER; },
      clave: () => claveDe(miSalt, miIter),
      cifrar: (obj) => cifrarBytes(enc.encode(JSON.stringify(obj))),
      descifrar: async (blob) => JSON.parse(dec.decode(await descifrarBytes(blob))),
      cifrarTexto: (s) => cifrarBytes(enc.encode(s)),
      descifrarTexto: async (blob) => dec.decode(await descifrarBytes(blob)),
    };
  }

  // ── Clave recordada (IndexedDB) ──
  function db() {
    return new Promise((ok, ko) => {
      const r = indexedDB.open("ironrack", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("claves");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
  }
  async function op(modo, fn) {
    const d = await db();
    return new Promise((ok, ko) => {
      const tx = d.transaction("claves", modo);
      const r = fn(tx.objectStore("claves"));
      tx.oncomplete = () => { d.close(); ok(r && r.result); };
      tx.onerror = () => { d.close(); ko(tx.error); };
    });
  }
  async function recordar(usuario, ses) {
    const clave = await ses.clave();
    await op("readwrite", (s) => s.put({ clave, salt: ses.salt, iter: ses.iter }, usuario));
  }
  async function recuperar(usuario) {
    try { return (await op("readonly", (s) => s.get(usuario))) || null; } catch (e) { return null; }
  }
  async function olvidar(usuario) {
    try { await op("readwrite", (s) => s.delete(usuario)); } catch (e) { /* nada que olvidar */ }
  }

  IR.cripto = { sesion, recordar, recuperar, olvidar };
})();

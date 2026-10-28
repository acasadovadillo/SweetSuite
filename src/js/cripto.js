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
 * La sesión vive solo en memoria mientras la app está abierta: ni la
 * contraseña ni la clave derivada se guardan nunca en el dispositivo. Cada vez
 * que se abre la app hay que escribir la contraseña.
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

  // Una sesión cifra siempre con su sal (la del documento publicado, cuando lo
  // hay) y descifra cualquier bloque, derivando una vez la clave de cada sal.
  function sesion({ password, salt = null, iter = null }) {
    let miSalt = salt || aB64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
    let miIter = iter || ITER;
    const claves = new Map();

    function claveDe(s, it) {
      const k = it + ":" + s;
      if (!claves.has(k)) claves.set(k, derivar(password, deB64(s), it));
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
      // A partir de ahora se cifra con la sal de otro bloque (el publicado),
      // para que todos los dispositivos acaben usando la misma.
      adoptar(blob) { miSalt = blob.salt; miIter = blob.iter || ITER; },
      cifrar: (obj) => cifrarBytes(enc.encode(JSON.stringify(obj))),
      descifrar: async (blob) => JSON.parse(dec.decode(await descifrarBytes(blob))),
      cifrarTexto: (s) => cifrarBytes(enc.encode(s)),
      descifrarTexto: async (blob) => dec.decode(await descifrarBytes(blob)),
    };
  }

  // Hasta la 1.2.0 se podía recordar la sesión, que guardaba la clave en
  // IndexedDB. Ya no existe esa opción: lo que quedara de entonces se borra al
  // abrir la app.
  function borrarSesionesAntiguas() {
    try { indexedDB.deleteDatabase("ironrack"); } catch (e) { /* nada que borrar */ }
  }

  IR.cripto = { sesion, borrarSesionesAntiguas };
})();

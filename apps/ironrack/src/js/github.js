/*
 * Ironrack — Lectura y escritura del bloque cifrado en GitHub.
 *
 * Los datos viven en el repositorio PRIVADO datos-cifrados, junto a los de
 * Solvento y Vitalo: Ironrack/<usuario>-ironrack.enc. Al ser privado hace falta
 * el token hasta para leer (fine-grained, Contents: Read and write sobre ese
 * repositorio). GitHub solo ve texto cifrado.
 *
 * En local (localhost) no se habla con GitHub: un repositorio de mentira en
 * localStorage hace sus veces, para poder probar la app sin token. Con ?real en
 * la dirección se usa GitHub de verdad.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});

  const REPO = { owner: "acasadovadillo", repo: "datos-cifrados", branch: "main", carpeta: "Ironrack" };
  // Quién entra en Ironrack. Cada cuenta tiene su archivo, su contraseña y su
  // token; añadir a alguien es añadir una línea aquí.
  const CUENTAS = [
    { usuario: "alberto", nombre: "Alberto" },
    { usuario: "hafsa", nombre: "Hafsa" },
  ];
  const API = "https://api.github.com";
  const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]real\b/.test(location.search);

  const ruta = (usuario) => `${REPO.carpeta}/${usuario}-ironrack.enc`;
  const fallo = (msg, code) => { const e = new Error(msg); e.code = code; return e; };
  const cabeceras = (token, accept) => ({
    Accept: accept || "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const urlContenido = (r) => `${API}/repos/${REPO.owner}/${REPO.repo}/contents/${r}`;
  // UTF-8 ⇄ base64 (el bloque es ASCII, pero el mensaje del commit no tiene por qué)
  const b64enc = (s) => btoa(unescape(encodeURIComponent(s)));
  const b64dec = (b) => decodeURIComponent(escape(atob(String(b).replace(/\s/g, ""))));

  // ¿Llega este token al repositorio? En uno privado, GitHub responde 404 tanto
  // si el archivo no existe como si el token no tiene acceso: antes de dar una
  // cuenta por nueva hay que preguntar aquí.
  async function acceso(token) {
    const r = await fetch(`${API}/repos/${REPO.owner}/${REPO.repo}`, { headers: cabeceras(token), cache: "no-store" });
    if (r.status === 401) throw fallo("El token de GitHub no vale o ha caducado", "AUTH");
    if (r.status === 403 || r.status === 404) throw fallo(`El token no da acceso a ${REPO.owner}/${REPO.repo}`, "AUTH");
    if (!r.ok) throw new Error("GitHub respondió " + r.status);
    return true;
  }

  // { sha, texto } o null si el archivo aún no existe
  async function leer(token, r) {
    const url = urlContenido(r) + "?ref=" + REPO.branch + "&_=" + Date.now();
    const res = await fetch(url, { headers: cabeceras(token), cache: "no-store" });
    if (res.status === 401 || res.status === 403) throw fallo("El token de GitHub no tiene permiso", "AUTH");
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("GitHub GET " + res.status);
    const j = await res.json();
    // Pasado 1 MB, la API da el sha pero no el contenido: se pide en bruto.
    if (j.content) return { sha: j.sha, texto: b64dec(j.content) };
    const raw = await fetch(url, { headers: cabeceras(token, "application/vnd.github.raw"), cache: "no-store" });
    if (!raw.ok) throw new Error("GitHub GET raw " + raw.status);
    return { sha: j.sha, texto: await raw.text() };
  }

  async function escribir(token, r, texto, sha, mensaje) {
    const body = { message: mensaje || "Ironrack: actualizar datos cifrados", content: b64enc(texto), branch: REPO.branch };
    if (sha) body.sha = sha;
    const res = await fetch(urlContenido(r), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, cabeceras(token)),
      body: JSON.stringify(body),
    });
    if (res.status === 409 || res.status === 422) throw fallo("El archivo cambió en GitHub", "CONFLICT");
    if (res.status === 401 || res.status === 403 || res.status === 404) throw fallo("El token no puede escribir en " + REPO.repo, "AUTH");
    if (!res.ok) throw new Error("GitHub PUT " + res.status);
    return (await res.json()).content.sha;
  }

  // ── Repositorio de mentira para desarrollo ──
  const espera = () => new Promise((ok) => setTimeout(ok, 250));
  const claveDev = (r) => "ironrack_dev_remoto:" + r;
  const dev = {
    async acceso(token) {
      await espera();
      if (!token || token === "malo") throw fallo("El token de GitHub no vale o ha caducado", "AUTH");
      return true;
    },
    async leer(token, r) {
      await dev.acceso(token);
      const s = localStorage.getItem(claveDev(r));
      return s ? JSON.parse(s) : null;
    },
    async escribir(token, r, texto, sha) {
      await dev.acceso(token);
      const s = localStorage.getItem(claveDev(r));
      const actual = s ? JSON.parse(s).sha : null;
      if (actual !== (sha || null)) throw fallo("El archivo cambió en GitHub", "CONFLICT");
      const nuevo = Math.random().toString(16).slice(2);
      localStorage.setItem(claveDev(r), JSON.stringify({ sha: nuevo, texto }));
      return nuevo;
    },
  };

  IR.github = Object.assign({ ruta, REPO, CUENTAS, DEV }, DEV ? dev : { acceso, leer, escribir });
})();

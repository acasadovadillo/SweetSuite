/*
 * Ironrack — Lectura y escritura del bloque cifrado en GitHub.
 *
 * Los datos viven en el repositorio PRIVADO Ironrack-Data, uno por cuenta:
 * <usuario>-ironrack.enc, y al lado el llavero de SweetSuite. Al ser privado
 * hace falta el token hasta para leer (fine-grained, Contents: Read and write
 * solo sobre Ironrack-Data). GitHub solo ve texto cifrado.
 *
 * Dónde está cada cosa lo dice SweetSuite (entorno.js): en desarrollo, todo va
 * a su servidor local, que hace de GitHub con datos de prueba.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const E = IR.suite ? IR.suite.entorno : null;

  const REPO = E ? E.repos.ironrack : { owner: "-", repo: "Ironrack-Data", branch: "main" };
  const API = E ? E.api : "";

  const ruta = (usuario) => `${usuario}-ironrack.enc`;
  const fallo = (msg, code) => { const e = new Error(msg); e.code = code; return e; };
  const cabeceras = (token, accept) => ({
    Accept: accept || "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const urlContenido = (repo, r) => `${API}/repos/${repo.owner}/${repo.repo}/contents/${r}`;
  // UTF-8 ⇄ base64 (el bloque es ASCII, pero el mensaje del commit no tiene por qué)
  const b64enc = (s) => btoa(unescape(encodeURIComponent(s)));
  const b64dec = (b) => decodeURIComponent(escape(atob(String(b).replace(/\s/g, ""))));

  // ¿Llega este token al repositorio? En uno privado, GitHub responde 404 tanto
  // si el archivo no existe como si el token no tiene acceso: antes de dar una
  // cuenta por nueva hay que preguntar aquí.
  async function acceso(token, repo = REPO) {
    const r = await fetch(`${API}/repos/${repo.owner}/${repo.repo}`, { headers: cabeceras(token), cache: "no-store" });
    if (r.status === 401) throw fallo("El token de GitHub no vale o ha caducado", "AUTH");
    if (r.status === 403 || r.status === 404) throw fallo(`El token no da acceso a ${repo.repo}`, "AUTH");
    if (!r.ok) throw new Error("GitHub respondió " + r.status);
    return true;
  }

  // { sha, texto } o null si el archivo aún no existe
  async function leer(token, r, repo = REPO) {
    const url = urlContenido(repo, r) + "?ref=" + repo.branch + "&_=" + Date.now();
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
    const res = await fetch(urlContenido(REPO, r), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, cabeceras(token)),
      body: JSON.stringify(body),
    });
    if (res.status === 409 || res.status === 422) throw fallo("El archivo cambió en GitHub", "CONFLICT");
    if (res.status === 401 || res.status === 403 || res.status === 404) throw fallo("El token no puede escribir en " + REPO.repo, "AUTH");
    if (!res.ok) throw new Error("GitHub PUT " + res.status);
    return (await res.json()).content.sha;
  }

  IR.github = {
    ruta, REPO, DEV: !E || !E.prod,
    acceso, leer, escribir,
  };
})();

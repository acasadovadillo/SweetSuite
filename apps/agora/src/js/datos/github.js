/*
 * Agora — Leer y escribir en GitHub (el repositorio privado Agora-Data).
 *
 * Como en Ironrack: la API de contenidos, con el token de quien representa a
 * la cuenta (fine-grained, Contents: Read and write, solo sobre Agora-Data).
 * GitHub solo ve texto cifrado. Lo que hay en el repositorio:
 *
 *   <cuenta>-agora.enc     el documento (socios, cuotas, tesorería…)
 *   adjuntos/<id>.enc      cada adjunto, cifrado aparte
 *   <cuenta>.llavero.json  el llavero de la cuenta (lo lleva SweetSuite)
 *
 * Dónde está cada cosa lo dice SweetSuite (entorno.js): en desarrollo, todo va
 * a su servidor local, que hace de GitHub con datos de prueba.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA;
  var E = WA.Suite ? WA.Suite.entorno : null;

  var REPO = E && E.repos.agora ? E.repos.agora : { owner: "-", repo: "Agora-Data", branch: "main" };
  var API = E ? E.api : "";

  var fallo = function (msg, code) { var e = new Error(msg); e.code = code; return e; };
  var cabeceras = function (token, accept) {
    return { Accept: accept || "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28" };
  };
  var url = function (r) { return API + "/repos/" + REPO.owner + "/" + REPO.repo + "/contents/" + r; };
  // UTF-8 ⇄ base64 (lo cifrado es ASCII, pero el mensaje del commit no tiene por qué)
  var b64enc = function (s) { return btoa(unescape(encodeURIComponent(s))); };
  var b64dec = function (b) { return decodeURIComponent(escape(atob(String(b).replace(/\s/g, "")))); };

  /**
   * ¿Llega este token al repositorio? En uno privado, GitHub responde 404 tanto
   * si el archivo no existe como si el token no tiene acceso: antes de dar algo
   * por nuevo hay que preguntar aquí.
   */
  async function acceso(token) {
    var r = await fetch(API + "/repos/" + REPO.owner + "/" + REPO.repo, { headers: cabeceras(token), cache: "no-store" });
    if (r.status === 401) throw fallo("El token de GitHub no vale o ha caducado", "AUTH");
    if (r.status === 403 || r.status === 404) throw fallo("El token no da acceso a " + REPO.repo, "AUTH");
    if (!r.ok) throw new Error("GitHub respondió " + r.status);
    return true;
  }

  /** { sha, texto } o null si el archivo no existe. */
  async function leer(token, r) {
    var u = url(r) + "?ref=" + REPO.branch + "&_=" + Date.now();
    var res = await fetch(u, { headers: cabeceras(token), cache: "no-store" });
    if (res.status === 401 || res.status === 403) throw fallo("El token de GitHub no tiene permiso", "AUTH");
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("GitHub GET " + res.status);
    var j = await res.json();
    // Pasado 1 MB, la API da el sha pero no el contenido: se pide en bruto.
    if (j.content) return { sha: j.sha, texto: b64dec(j.content) };
    var bruto = await fetch(u, { headers: cabeceras(token, "application/vnd.github.raw"), cache: "no-store" });
    if (!bruto.ok) throw new Error("GitHub GET raw " + bruto.status);
    return { sha: j.sha, texto: await bruto.text() };
  }

  /** Escribe (sha = el que había, o null si es nuevo). Devuelve el sha nuevo. */
  async function escribir(token, r, texto, sha, mensaje) {
    var cuerpo = { message: mensaje || "Agora: actualizar datos cifrados", content: b64enc(texto), branch: REPO.branch };
    if (sha) cuerpo.sha = sha;
    var res = await fetch(url(r), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, cabeceras(token)),
      body: JSON.stringify(cuerpo),
    });
    if (res.status === 409 || res.status === 422) throw fallo("El archivo cambió en GitHub", "CONFLICT");
    if (res.status === 401 || res.status === 403 || res.status === 404) throw fallo("El token no puede escribir en " + REPO.repo, "AUTH");
    if (!res.ok) throw new Error("GitHub PUT " + res.status);
    return (await res.json()).content.sha;
  }

  /** Borra un archivo (si ya no estaba, no pasa nada). */
  async function borrar(token, r, mensaje) {
    var actual = await leer(token, r);
    if (!actual) return;
    var res = await fetch(url(r), {
      method: "DELETE",
      headers: Object.assign({ "Content-Type": "application/json" }, cabeceras(token)),
      body: JSON.stringify({ message: mensaje || "Agora: quitar un archivo", sha: actual.sha, branch: REPO.branch }),
    });
    if (res.status === 404) return;
    if (res.status === 409 || res.status === 422) throw fallo("El archivo cambió en GitHub", "CONFLICT");
    if (res.status === 401 || res.status === 403) throw fallo("El token no puede escribir en " + REPO.repo, "AUTH");
    if (!res.ok) throw new Error("GitHub DELETE " + res.status);
  }

  WA.GitHub = {
    REPO: REPO, DEV: !E || !E.prod,
    documento: function (cuenta) { return cuenta + "-agora.enc"; },
    adjunto: function (id) { return "adjuntos/" + id + ".enc"; },
    acceso: acceso, leer: leer, escribir: escribir, borrar: borrar,
  };
})(typeof self !== "undefined" ? self : this);

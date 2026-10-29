/*
 * Agora — Guardar en GitHub y traer lo de los demás.
 *
 * Lo de la asociación se guarda en dos sitios, siempre cifrado:
 *
 *   1. En este dispositivo (IndexedDB, ver datos/boveda.js), en cuanto cambia algo.
 *   2. En GitHub (Agora-Data), unos segundos después con el autoguardado
 *      (encendido de serie), al pulsar Guardar o ⌘S, o al volver a SweetSuite.
 *
 * Cada miembro de la junta guarda con su token. Si otro ha guardado entre
 * medias, GitHub rechaza la escritura: se trae lo suyo, se MEZCLA registro a
 * registro (datos/mezcla.js) y se vuelve a intentar. Así nadie pisa a nadie.
 *
 * Los adjuntos van aparte (adjuntos/<id>.enc). Se suben antes que el documento
 * que los nombra y se bajan cuando alguien los abre. Lo que falta por subir o
 * por borrar se apunta en este dispositivo.
 *
 * Las llaves: el secreto de Agora es el mismo para todos los representantes
 * (sale de la clave de la cuenta ABIES), pero cada dispositivo cifra con su
 * propia sal. Lo de los demás se abre derivando la llave de su sal, una vez.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA;
  var G = function () { return WA.GitHub; };

  var S = {
    ctx: null,          // { doc(), llave(), reemplazar(doc) }: lo que da la sesión
    s: null,            // la sesión de SweetSuite (cuenta, representante, secretos)
    token: null, sha: null, estado: "local", error: null,
    llaves: {},         // sal → llave derivada
    cambios: 0,         // cambios locales (para saber si lo subido era lo último)
    virgen: false,      // documento recién creado aquí, sin tocar: lo de GitHub manda
    gen: 0,             // cada entrada; lo que empezó en una anterior no sigue
  };

  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* lleno o bloqueado */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } },
  };
  // Lo de la cuenta en este dispositivo (y lo de cada representante, con «@»)
  var k = function (n) { return "sweetsuite_agora_" + n + ":" + S.s.usuario; };
  var kRep = function (n) { return k(n) + (S.s.representante ? "@" + S.s.representante.usuario : ""); };
  var fallo = function (msg, code) { var e = new Error(msg); e.code = code; return e; };

  // ── Las llaves ──────────────────────────────────────────────────────────
  /** Prueba a abrir algo cifrado con la llave de su sal (la de la cuenta o una anterior). */
  async function conLlave(sal, iter, probar) {
    var hecha = S.llaves[sal];
    if (hecha) {
      try { return await probar(hecha); } catch (e) { if (e.codigo !== "CONTRASENA") throw e; }
    }
    var secretos = [S.s.secreto].concat(S.s.anteriores || []);
    for (var i = 0; i < secretos.length; i++) {
      var llave = await WA.Cripto.llaveConSal(secretos[i], sal, iter);
      try {
        var r = await probar(llave);
        S.llaves[sal] = llave;
        return r;
      } catch (e) { if (e.codigo !== "CONTRASENA") throw e; }
    }
    throw fallo("Lo guardado en GitHub no se abre con la cuenta de " + S.s.nombre, "CONTRASENA");
  }
  var abrir = function (bloque) { return conLlave(bloque.sal, bloque.iter, function (l) { return WA.Cripto.abrirConLlave(bloque, l); }); };
  var salDe = function (llave) { return WA.Cripto.aBase64(llave.sal); };

  // ── El token: cifrado en este dispositivo, uno por representante ────────
  async function leerToken() {
    var t = ls.get(kRep("token"));
    if (!t) return null;
    try { return (await abrir(JSON.parse(t))).token || null; } catch (e) { return null; }
  }
  async function guardarToken() {
    if (S.token) ls.set(kRep("token"), JSON.stringify(await WA.Cripto.cifrar({ token: S.token }, S.ctx.llave())));
  }

  // ── Lo pendiente ────────────────────────────────────────────────────────
  function listaAdjuntos() {
    try { var l = JSON.parse(ls.get(k("adjuntos"))); if (l && Array.isArray(l.subir) && Array.isArray(l.borrar)) return l; } catch (e) { /* vacía */ }
    return { subir: [], borrar: [] };
  }
  function ponerLista(l) {
    if (!l.subir.length && !l.borrar.length) ls.del(k("adjuntos")); else ls.set(k("adjuntos"), JSON.stringify(l));
  }
  function pendiente() {
    if (!S.s) return false;
    var l = listaAdjuntos();
    return ls.get(k("pendiente")) === "1" || l.subir.length > 0 || l.borrar.length > 0;
  }
  var autoguardado = function () { return !S.s || ls.get(kRep("auto")) !== "0"; };

  // ── El estado (el pie de la barra lateral y la tarjeta en SweetSuite) ───
  var PARA_SUITE = { ok: "ok", subiendo: "subiendo", pendiente: "pendiente", local: "", auth: "error", error: "error" };
  var TEXTO_SUITE = { ok: "Guardado en GitHub", subiendo: "Guardando…", pendiente: "Cambios sin subir",
    local: "Sin token: solo en este dispositivo", auth: "Revisa el token" };
  function estado(e, error) {
    S.estado = e;
    S.error = error || null;
    if (WA.App && WA.App.pintarEstado) WA.App.pintarEstado();
    // Con Ajustes › Sincronización a la vista, que su estado sea el de ahora
    if (WA.App && /ajustes\/sincronizacion/.test(location.hash) && !document.querySelector("dialog[open]")) WA.App.repintar();
    if (WA.Suite && S.s) WA.Suite.estado("agora", PARA_SUITE[e] || "", TEXTO_SUITE[e] || S.error || "Error al guardar");
  }
  function textoEstado() {
    switch (S.estado) {
      case "ok": return "Todo guardado y subido a GitHub, cifrado.";
      case "subiendo": return "Subiendo los cambios a GitHub…";
      case "pendiente": return autoguardado()
        ? "Guardado en este dispositivo. Se subirá a GitHub en cuanto haya conexión."
        : "Guardado en este dispositivo. Súbelo con Guardar, ⌘S o al volver a SweetSuite.";
      case "local": return "Guardado solo en este dispositivo. Pega tu token de GitHub para compartirlo con la junta en " + G().REPO.repo + ".";
      case "auth": return S.error || "El token de GitHub no vale: cámbialo en Ajustes.";
      default: return S.error || "No se ha podido guardar en GitHub.";
    }
  }
  function errorSync(e) {
    console.error(e);
    if (e.code === "AUTH") return estado("auth", e.message);
    if (e.code === "CONTRASENA") return estado("error", e.message);
    if (e.code === "LLAVERO_PENDIENTE" || e.code === "LLAVERO") return estado("error", e.message);
    if (!navigator.onLine || e instanceof TypeError) return estado("pendiente");
    estado("error", e.message || String(e));
  }

  // ── El resumen de la tarjeta de Agora en el inicio de SweetSuite ────────
  var tResumen = null;
  function resumen() {
    clearTimeout(tResumen);
    tResumen = setTimeout(function () {
      if (!S.ctx || !WA.Suite || !WA.Suite.resumen) return;
      try { WA.Suite.resumen("agora", { lineas: lineasResumen(S.ctx.doc(), WA.Fechas.hoy()) }); } catch (e) { console.error(e); }
    }, 300);
  }
  function lineasResumen(doc, hoy) {
    var activos = (doc.socios || []).filter(function (s) { return WA.Socios.activoEn(s, hoy); }).length;
    var deuda = WA.Cuotas.deudores(doc.cuotas).reduce(function (t, d) { return t + d.total; }, 0);
    var A = WA.Actividades;
    var prox = A.ordenar(doc.actividades || []).filter(function (x) { return A.fechaDe(x) >= hoy && x.estado !== "cancelada"; })[0];
    return [
      activos + (activos === 1 ? " socio activo" : " socios activos"),
      deuda ? "Cuotas pendientes: " + WA.Dinero.formatear(deuda) : "Cuotas al día",
      prox ? "Próxima: " + prox.titulo + " · " + WA.Fechas.corta(A.fechaDe(prox)) : "Sin actividades próximas",
    ];
  }

  // ── Subir ───────────────────────────────────────────────────────────────
  var tSubida = null, subiendo = null, otraVez = false;
  function programarSubida(ms) {
    clearTimeout(tSubida);
    tSubida = setTimeout(subir, ms);
  }

  /** Un cambio guardado en este dispositivo: queda pendiente y, con autoguardado, se sube en unos segundos. */
  function cambio() {
    if (!S.ctx) return;
    S.cambios++;
    S.virgen = false;
    ls.set(k("pendiente"), "1");
    if (!S.token) estado("local");
    else if (autoguardado()) programarSubida(5000);
    else estado("pendiente");
    resumen();
  }

  async function subir() {
    clearTimeout(tSubida);
    if (!S.ctx) return;
    if (!S.token) return estado("local");
    if (!navigator.onLine) return estado("pendiente");
    if (subiendo) { otraVez = true; return subiendo; }
    var gen = S.gen;
    subiendo = (async function () {
      estado("subiendo");
      var hechos = S.cambios;
      try {
        await subirAdjuntos();
        await escribirMezclando();
        if (gen !== S.gen) return;
        if (S.cambios === hechos) ls.del(k("pendiente"));
        estado(pendiente() ? "pendiente" : "ok");
      } catch (e) {
        if (gen === S.gen) errorSync(e);
      }
    })();
    try { await subiendo; } finally {
      subiendo = null;
      if (gen === S.gen && (otraVez || pendiente())) {
        otraVez = false;
        if (S.estado === "pendiente" && autoguardado()) programarSubida(1500);
      }
    }
  }

  function mensaje() {
    var r = S.s.representante;
    return "Agora: cambios de " + (r ? r.nombre : S.s.nombre);
  }

  async function escribirMezclando() {
    var ruta = G().documento(S.s.usuario);
    for (var intento = 0; ; intento++) {
      var texto = JSON.stringify(await WA.Cripto.cifrar(S.ctx.doc(), S.ctx.llave()));
      try {
        S.sha = await G().escribir(S.token, ruta, texto, S.sha, mensaje());
        ls.set(k("sha"), S.sha);
        return;
      } catch (e) {
        // Otro miembro de la junta guardó antes: se trae lo suyo, se mezcla y se reintenta
        if (e.code !== "CONFLICT" || intento >= 3) throw e;
        await traer();
      }
    }
  }

  /** Los adjuntos pendientes: subir los nuevos y borrar los quitados. */
  async function subirAdjuntos() {
    var l = listaAdjuntos(), llave = S.ctx.llave();
    while (l.subir.length) {
      var id = l.subir[0], r = await WA.Boveda.leerArchivo(id);
      if (r) {
        var texto = JSON.stringify({ v: 1, sal: salDe(llave), iter: llave.iter, iv: WA.Cripto.aBase64(r.iv), ct: WA.Cripto.aBase64(r.ct) });
        try {
          await G().escribir(S.token, G().adjunto(id), texto, null, "Agora: adjunto");
        } catch (e) {
          if (e.code !== "CONFLICT") throw e;
          // Ya estaba (se sustituyó el archivo): con su sha
          var ya = await G().leer(S.token, G().adjunto(id));
          await G().escribir(S.token, G().adjunto(id), texto, ya && ya.sha, "Agora: adjunto");
        }
      }
      l = listaAdjuntos();
      l.subir = l.subir.filter(function (x) { return x !== id; });
      ponerLista(l);
    }
    while (l.borrar.length) {
      var b = l.borrar[0];
      await G().borrar(S.token, G().adjunto(b), "Agora: quitar adjunto");
      l = listaAdjuntos();
      l.borrar = l.borrar.filter(function (x) { return x !== b; });
      ponerLista(l);
    }
  }

  // ── Traer ───────────────────────────────────────────────────────────────
  /** Lo que haya en GitHub se mezcla con lo de aquí. */
  async function traer() {
    var res = await G().leer(S.token, G().documento(S.s.usuario));
    if (!res) { S.sha = null; ls.del(k("sha")); return; }
    if (res.sha === S.sha) return;
    var remoto = await abrir(JSON.parse(res.texto));
    var actual = S.ctx.doc();
    var mezcla = S.virgen ? WA.Mezcla.mezclar(null, remoto) : WA.Mezcla.mezclar(actual, remoto);
    var quitados = WA.Mezcla.borradosNuevos(actual, remoto);
    S.sha = res.sha;
    ls.set(k("sha"), res.sha);
    S.virgen = false;
    if (!igual(mezcla, actual)) await S.ctx.reemplazar(mezcla);
    // Los adjuntos que otro quitó, fuera también de aquí
    for (var i = 0; i < quitados.length; i++) await WA.Boveda.borrarArchivo(quitados[i]).catch(function () {});
  }
  function igual(a, b) {
    return ["asociacion", "config", "borrados"].concat(WA.Esquema.COLECCIONES).every(function (c) {
      return JSON.stringify(a[c]) === JSON.stringify(b[c]);
    });
  }

  /** El llavero de la cuenta, al lado de los datos: SweetSuite lo pone de acuerdo con el de aquí. */
  async function llavero() {
    if (!WA.Suite || !WA.Suite.reconciliar) return;
    await WA.Suite.reconciliar("agora", {
      leer: function (r) { return G().leer(S.token, r); },
      escribir: function (r, texto, sha, m) { return G().escribir(S.token, r, texto, sha, m); },
    });
  }

  var ultimaSync = 0;
  async function sincronizar(o) {
    if (!S.ctx || !S.token) return;
    if (!(o && o.forzar) && Date.now() - ultimaSync < 20000) return;
    if (!navigator.onLine) return estado("pendiente");
    ultimaSync = Date.now();
    var gen = S.gen;
    try {
      estado("subiendo");
      await llavero();
      if (gen !== S.gen) return;   // las claves cambiaron y la sesión volvió a entrar
      await traer();
      if (gen !== S.gen) return;
      if (pendiente()) await subir();
      else estado("ok");
      resumen();
    } catch (e) {
      if (gen === S.gen) errorSync(e);
    }
  }

  // ── Adjuntos de otros: se bajan al abrirlos ─────────────────────────────
  async function descargarAdjunto(id) {
    if (!S.token) return null;
    var res = await G().leer(S.token, G().adjunto(id));
    if (!res) return null;
    var b = JSON.parse(res.texto);
    var bytes = await conLlave(b.sal, b.iter, function (l) {
      return WA.Cripto.descifrarBytes({ iv: WA.Cripto.desdeBase64(b.iv), ct: WA.Cripto.desdeBase64(b.ct) }, l);
    });
    // Queda en este dispositivo, cifrado con su llave
    await WA.Boveda.escribirArchivo(id, await WA.Cripto.cifrarBytes(bytes, S.ctx.llave()));
    return bytes;
  }
  function adjuntoNuevo(id) {
    var l = listaAdjuntos();
    if (l.subir.indexOf(id) < 0) l.subir.push(id);
    l.borrar = l.borrar.filter(function (x) { return x !== id; });
    ponerLista(l);
  }
  function adjuntoBorrado(id) {
    var l = listaAdjuntos();
    l.subir = l.subir.filter(function (x) { return x !== id; });
    if (l.borrar.indexOf(id) < 0) l.borrar.push(id);
    ponerLista(l);
  }

  // ── Entrar, salir y el token ────────────────────────────────────────────
  /**
   * Entrar: la sesión ya ha abierto lo de este dispositivo. Con token, se trae
   * lo de GitHub y se mezcla; sin él, todo se queda aquí hasta que se pegue.
   */
  /** Antes de abrir nada: de quién es (para pintar el estado y el archivo desde el principio). */
  function preparar(s) {
    S.gen++;
    clearTimeout(tSubida);
    S.s = s;
    S.ctx = null;
    S.token = null;
    S.estado = "local";
  }
  async function entrar(s, ctx, o) {
    if (S.s !== s) preparar(s);
    S.ctx = ctx;
    S.llaves = {};
    S.llaves[salDe(ctx.llave())] = ctx.llave();
    S.virgen = !!(o && o.nuevo);
    S.sha = ls.get(k("sha"));
    S.token = await leerToken();
    await guardarToken();   // si la llave de aquí ha cambiado, con la nueva
    ultimaSync = 0;
    resumen();
    if (!S.token) estado("local");
    else sincronizar({ forzar: true });
  }

  /** Al bloquear: fuera de la memoria el token y lo demás. */
  function salir() {
    S.gen++;
    clearTimeout(tSubida);
    clearTimeout(tResumen);
    S.ctx = null; S.token = null; S.llaves = {};
  }

  /** El token se pega en Ajustes, no al entrar. Lo de aquí se sube nada más conectar. */
  async function cambiarToken(token) {
    token = String(token || "").trim();
    if (!token) throw fallo("Pega el token", "SIN_TOKEN");
    await G().acceso(token);
    S.token = token;
    ls.set(k("pendiente"), "1");
    await guardarToken();
    await sincronizar({ forzar: true });
    if (pendiente()) await subir();
  }

  function ponerAutoguardado(v) {
    if (v) ls.del(kRep("auto")); else ls.set(kRep("auto"), "0");
    if (v && pendiente()) subir();
  }

  /** ⌘S, el botón Guardar y volver a SweetSuite: subir ya lo pendiente. */
  async function subirAhora() {
    if (S.token && pendiente()) await subir();
    return S.estado;
  }
  async function guardarAlSalir() {
    if (S.token && pendiente() && navigator.onLine) await subir();
    return { estado: PARA_SUITE[S.estado] || "", texto: S.token ? textoEstado() : "guardado en este dispositivo" };
  }

  raiz.addEventListener("online", function () { if (S.ctx) sincronizar({ forzar: true }); });
  document.addEventListener("visibilitychange", function () {
    if (!S.ctx) return;
    if (document.visibilityState === "hidden") { if (pendiente() && autoguardado()) subir(); }
    else sincronizar();
  });

  WA.Nube = {
    get estado() { return S.estado; },
    get error() { return S.error; },
    get token() { return !!S.token; },
    /** Dónde se guarda: «Agora-Data/abies-agora.enc». */
    get archivo() { return S.s ? G().REPO.repo + "/" + G().documento(S.s.usuario) : ""; },
    preparar: preparar, entrar: entrar, salir: salir, cambio: cambio, sincronizar: sincronizar, subir: subir, subirAhora: subirAhora,
    guardarAlSalir: guardarAlSalir, pendiente: pendiente, cambiarToken: cambiarToken, textoEstado: textoEstado,
    autoguardado: autoguardado, ponerAutoguardado: ponerAutoguardado,
    descargarAdjunto: descargarAdjunto, adjuntoNuevo: adjuntoNuevo, adjuntoBorrado: adjuntoBorrado,
    lineasResumen: lineasResumen,
  };
})(typeof self !== "undefined" ? self : this);

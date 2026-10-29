/*
 * Ironrack — El documento del usuario y dónde se guarda.
 *
 * Todo lo de una persona es UN documento JSON: sus ejercicios propios, sus
 * rutinas, sus sesiones terminadas y la sesión en curso. Se guarda en dos
 * sitios, siempre cifrado:
 *
 *   1. En este navegador (localStorage), en cuanto cambia algo. En el gimnasio
 *      no siempre hay cobertura, y una serie apuntada no puede depender de ella.
 *   2. En GitHub (Ironrack-Data), unos segundos después, con el autoguardado
 *      (encendido de serie), al pulsar Guardar o ⌘S, o al volver a SweetSuite.
 *
 * Se cifra con el secreto que SweetSuite da a Ironrack (sale de la clave
 * maestra de la cuenta). Si la cuenta tiene claves anteriores (ver llavero.js
 * de SweetSuite), lo que no se abra con la actual se intenta con ellas, y al
 * guardar ya va con la actual.
 *
 * Varios dispositivos: en vez de que gane el último en escribir —que borraría
 * el entreno del móvil si el portátil guarda después—, los documentos se
 * FUSIONAN elemento a elemento. Cada rutina, sesión o ejercicio lleva `mod`, la
 * hora de su último cambio, y gana la versión más reciente de cada uno. Lo
 * borrado deja una marca en `borrados` para que la otra copia no lo resucite.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const G = IR.github;

  const S = { usuario: null, nombre: null, secreto: null, cripto: null, anteriores: [], token: null, doc: null, sha: null, estado: "local", error: null };
  // Con el prefijo de SweetSuite: en el mismo dominio vive todavía la app de
  // antes, con sus llaves «ironrack_…», que no se tocan.
  const clave = (n, u) => `sweetsuite_ironrack_${n}_${u || S.usuario}`;
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* lleno o bloqueado */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* nada */ } },
  };
  const fallo = (msg, code) => { const e = new Error(msg); e.code = code; return e; };

  // ── El documento ──
  const COLECCIONES = ["ejercicios", "rutinas", "sesiones"];

  function nuevo() {
    return {
      v: 1, creado: Date.now(), mod: Date.now(),
      ejercicios: [], rutinas: [], sesiones: [],
      actual: null, actualMod: 0,
      ajustes: { descanso: 90, sonido: true, mod: 0 },
      borrados: {},
    };
  }

  function normalizar(d) {
    const n = Object.assign(nuevo(), d || {});
    COLECCIONES.forEach((c) => { if (!Array.isArray(n[c])) n[c] = []; });
    n.ajustes = Object.assign(nuevo().ajustes, n.ajustes || {});
    n.borrados = n.borrados || {};
    n.sesiones.sort((a, b) => b.inicio - a.inicio);
    n.rutinas.sort((a, b) => (a.creado || 0) - (b.creado || 0));
    n.ejercicios.sort((a, b) => (a.creado || 0) - (b.creado || 0));
    return n;
  }

  function fusionar(a, b) {
    if (!a) return normalizar(b);
    if (!b) return normalizar(a);
    a = normalizar(a);
    b = normalizar(b);
    const borrados = Object.assign({}, a.borrados);
    Object.keys(b.borrados).forEach((id) => { borrados[id] = Math.max(borrados[id] || 0, b.borrados[id]); });
    const out = Object.assign({}, a, { borrados, mod: Math.max(a.mod || 0, b.mod || 0) });
    COLECCIONES.forEach((c) => {
      const porId = new Map();
      a[c].concat(b[c]).forEach((x) => {
        const y = porId.get(x.id);
        if (!y || (x.mod || 0) > (y.mod || 0)) porId.set(x.id, x);
      });
      out[c] = [...porId.values()].filter((x) => !(borrados[x.id] >= (x.mod || 0)));
    });
    const act = (b.actualMod || 0) > (a.actualMod || 0) ? b : a;
    out.actual = act.actual;
    out.actualMod = act.actualMod;
    // Una sesión en curso que otro dispositivo ya terminó (o tiró) no sigue abierta
    if (out.actual && (out.sesiones.some((s) => s.id === out.actual.id) || borrados[out.actual.id])) out.actual = null;
    out.ajustes = (b.ajustes.mod || 0) > (a.ajustes.mod || 0) ? b.ajustes : a.ajustes;
    return normalizar(out);
  }

  // ── Cambios ──
  // Toda modificación pasa por aquí: guarda en local, programa la subida y
  // vuelve a pintar (salvo que se pida lo contrario, como al teclear un peso).
  function cambiar(fn, { render = true, subirYa = false } = {}) {
    fn(S.doc);
    S.doc.mod = Date.now();
    ls.set(clave("pendiente"), "1");
    programarGuardado();
    if (autoguardado()) programarSubida(subirYa ? 0 : 5000);
    else estado(S.token ? "pendiente" : "local");
    if (render) IR.app.render(true);
    IR.app.pintarEstado();
  }
  const cambiarActual = (fn, opc) => cambiar((d) => { fn(d.actual, d); d.actualMod = Date.now(); }, opc);
  const cambiarAjustes = (fn, opc) => cambiar((d) => { fn(d.ajustes); d.ajustes.mod = Date.now(); }, opc);
  function cambiarItem(col, id, fn, opc) {
    cambiar((d) => { const x = d[col].find((i) => i.id === id); if (x) { fn(x); x.mod = Date.now(); } }, opc);
  }
  function anadir(col, item, opc) {
    const t = Date.now();
    item.creado = item.creado || t;
    item.mod = t;
    cambiar((d) => { d[col].push(item); if (col === "sesiones") d.sesiones.sort((a, b) => b.inicio - a.inicio); }, opc);
  }
  function borrar(col, id, opc) {
    cambiar((d) => { d[col] = d[col].filter((x) => x.id !== id); d.borrados[id] = Date.now(); }, opc);
  }

  // ── Copia local ──
  let tGuardado = null;
  function programarGuardado() {
    clearTimeout(tGuardado);
    tGuardado = setTimeout(guardarLocal, 200);
  }
  async function guardarLocal() {
    clearTimeout(tGuardado);
    if (!S.cripto || !S.doc) return;
    ls.set(clave("doc"), JSON.stringify(await S.cripto.cifrar(S.doc)));
  }
  const pendiente = () => ls.get(clave("pendiente")) === "1";

  // ── Estado de la sincronización (lo pinta la cabecera) ──
  // Lo que se ve en la tarjeta de Ironrack en el inicio de SweetSuite
  const PARA_SUITE = { ok: "ok", subiendo: "subiendo", pendiente: "pendiente", local: "", auth: "error", error: "error" };
  const TEXTO_SUITE = { ok: "Guardado en GitHub", subiendo: "Guardando…", pendiente: "Cambios sin subir",
    local: "Sin token: solo en este dispositivo", auth: "Revisa el token" };
  function estado(e, error) {
    S.estado = e;
    S.error = error || null;
    if (IR.app) IR.app.pintarEstado();
    if (IR.suite) IR.suite.estado("ironrack", PARA_SUITE[e] || "", TEXTO_SUITE[e] || S.error || "Error al sincronizar");
  }

  // ── Subir ──
  let tSubida = null, subiendo = null, otraVez = false;
  function programarSubida(ms) {
    clearTimeout(tSubida);
    tSubida = setTimeout(subir, ms);
  }

  async function subir() {
    clearTimeout(tSubida);
    if (!S.doc) return;
    if (!S.token) return estado("local");
    if (!navigator.onLine) return estado("pendiente");
    if (subiendo) { otraVez = true; return subiendo; }
    subiendo = (async () => {
      estado("subiendo");
      const modInicio = S.doc.mod;
      try {
        await escribirFusionando();
        if (S.doc.mod === modInicio) ls.del(clave("pendiente"));
        estado(pendiente() ? "pendiente" : "ok");
      } catch (e) {
        errorSync(e);
      }
    })();
    try { await subiendo; } finally {
      subiendo = null;
      if (otraVez || pendiente()) { otraVez = false; if (S.estado === "pendiente") programarSubida(1500); }
    }
  }

  async function escribirFusionando() {
    const r = G.ruta(S.usuario);
    for (let intento = 0; ; intento++) {
      const texto = JSON.stringify(await S.cripto.cifrar(S.doc));
      try {
        S.sha = await G.escribir(S.token, r, texto, S.sha, "Ironrack: " + resumenCommit());
        ls.set(clave("sha"), S.sha);
        return;
      } catch (e) {
        // Otro dispositivo escribió antes: se trae lo suyo, se fusiona y se reintenta
        if (e.code !== "CONFLICT" || intento >= 2) throw e;
        await traer();
      }
    }
  }

  function resumenCommit() {
    const u = S.doc.sesiones[0];
    return S.doc.actual ? "entreno en curso" : u ? "entreno del " + new Date(u.inicio).toISOString().slice(0, 10) : "actualizar datos";
  }

  // Trae lo publicado y lo fusiona con lo de aquí. Devuelve el bloque remoto.
  async function traer() {
    const res = await G.leer(S.token, G.ruta(S.usuario));
    if (!res) { S.sha = null; ls.del(clave("sha")); return null; }
    if (res.sha === S.sha) return null; // ya lo tenemos
    const blob = JSON.parse(res.texto);
    const { doc: remoto, actual } = await descifrarCon(blob);
    if (!actual) ls.set(clave("pendiente"), "1");         // se vuelve a cifrar con la clave actual
    else if (blob.salt !== S.cripto.salt) { S.cripto.adoptar(blob); await persistirCredenciales(); }
    const antes = JSON.stringify(S.doc);
    S.doc = fusionar(S.doc, remoto);
    S.sha = res.sha;
    ls.set(clave("sha"), S.sha);
    if (JSON.stringify(S.doc) !== antes) {
      await guardarLocal();
      IR.app.render();
    }
    return blob;
  }

  function errorSync(e) {
    if (e.code === "AUTH") return estado("auth", e.message);
    if (e.code === "BAD_PASSWORD") return estado("error", "Lo publicado en GitHub no se abre con tu cuenta de SweetSuite");
    if (e.code === "LLAVERO_PENDIENTE" || e.code === "LLAVERO") return estado("error", e.message);
    if (!navigator.onLine || e instanceof TypeError) return estado("pendiente");
    estado("error", e.message || String(e));
  }

  let ultimaSync = 0;
  async function sincronizar({ forzar = false } = {}) {
    if (!S.doc || !S.token) return;
    if (!forzar && Date.now() - ultimaSync < 20000) return;
    if (!navigator.onLine) return estado("pendiente");
    ultimaSync = Date.now();
    try {
      estado("subiendo");
      await llavero();
      await traer();
      if (pendiente()) await subir();
      else estado("ok");
    } catch (e) {
      errorSync(e);
    }
  }

  // ── Las claves ──
  // Lo que no se abra con la clave actual se prueba con las anteriores
  async function descifrarCon(blob) {
    try { return { doc: await S.cripto.descifrar(blob), actual: true }; }
    catch (e) { if (e.code !== "BAD_PASSWORD") throw e; }
    for (const c of S.anteriores) {
      try { return { doc: await c.descifrar(blob), actual: false }; } catch (e) { /* la siguiente */ }
    }
    throw fallo("No se abre con tu cuenta de SweetSuite", "BAD_PASSWORD");
  }
  async function textoCon(blob) {
    try { return await S.cripto.descifrarTexto(blob); } catch (e) { /* las anteriores */ }
    for (const c of S.anteriores) {
      try { return await c.descifrarTexto(blob); } catch (e) { /* la siguiente */ }
    }
    return null;
  }
  const sesionesDe = (secretos) => (secretos || []).map((p) => IR.cripto.sesion({ password: p }));

  // SweetSuite cambió las claves de la cuenta (unió dos llaveros): lo de aquí
  // se vuelve a cifrar con la actual
  async function refrescarClaves() {
    if (!IR.suite || !S.usuario) return;
    const s = await IR.suite.sesion("ironrack");
    if (!s) return;
    S.anteriores = sesionesDe(s.anteriores);
    if (s.secreto === S.secreto) return;
    S.secreto = s.secreto;
    S.cripto = IR.cripto.sesion({ password: s.secreto });
    await guardarLocal();
    await persistirCredenciales();
    ls.set(clave("pendiente"), "1");
  }

  // El llavero de la cuenta, al lado de los datos: SweetSuite lo pone de
  // acuerdo con el de este dispositivo
  async function llavero() {
    if (!IR.suite || !S.token) return;
    await IR.suite.reconciliar("ironrack", {
      leer: (r) => G.leer(S.token, r),
      escribir: (r, texto, sha, mensaje) => G.escribir(S.token, r, texto, sha, mensaje),
    });
    await refrescarClaves();
  }

  // ── Credenciales en este dispositivo ──
  // Solo el token, y cifrado: sin la cuenta no sirve de nada. La sesión en sí
  // no se guarda nunca.
  async function persistirCredenciales() {
    if (S.token) ls.set(clave("token"), JSON.stringify(await S.cripto.cifrarTexto(S.token)));
  }

  // ── Autoguardado: encendido salvo que se apague en Ajustes ──
  const autoguardado = () => ls.get(clave("auto")) !== "0";
  function ponerAutoguardado(v) {
    if (v) ls.del(clave("auto")); else ls.set(clave("auto"), "0");
    if (v && pendiente()) subir();
  }

  /*
   * Entrar: SweetSuite ya ha comprobado la contraseña y da el secreto de
   * Ironrack. Se abre lo de este dispositivo y, con token, se trae y se
   * fusiona lo de GitHub. Sin nada en ningún sitio, se empieza vacío: al
   * fusionar elemento a elemento, un documento vacío no pisa nada.
   */
  async function entrar({ usuario, nombre, secreto, anteriores }) {
    const k = (n) => clave(n, usuario);
    const localTxt = ls.get(k("doc"));
    const localBlob = localTxt ? JSON.parse(localTxt) : null;
    Object.assign(S, { usuario, nombre, secreto, estado: "local", error: null });
    S.cripto = IR.cripto.sesion({ password: secreto, salt: localBlob && localBlob.salt, iter: localBlob && localBlob.iter });
    S.anteriores = sesionesDe(anteriores);

    let local = null;
    if (localBlob) {
      const r = await descifrarCon(localBlob);
      local = r.doc;
      if (!r.actual) { S.cripto = IR.cripto.sesion({ password: secreto }); ls.set(k("pendiente"), "1"); }
    }
    S.token = ls.get(k("token")) ? await textoCon(JSON.parse(ls.get(k("token")))) : null;
    S.sha = ls.get(k("sha"));
    S.doc = local ? normalizar(local) : nuevo();
    await guardarLocal();
    await persistirCredenciales();
    ultimaSync = 0;
    if (!S.token) estado("local");
    else sincronizar({ forzar: true });
    return { ok: true };
  }

  // El token se añade cuando uno quiere, desde Ajustes, no al entrar.
  async function cambiarToken(token) {
    token = (token || "").trim();
    if (!token) throw fallo("Pega el token", "SIN_TOKEN");
    await G.acceso(token);
    S.token = token;
    // Lo de este dispositivo se sube siempre al conectar, aunque no se haya
    // tocado nada: una cuenta recién estrenada sin token aún no tiene archivo.
    ls.set(clave("pendiente"), "1");
    await persistirCredenciales();
    await sincronizar({ forzar: true });
    if (pendiente()) await subir();
  }

  // Subir ya: ⌘S, el botón Guardar y volver a SweetSuite
  async function subirAhora() {
    await guardarLocal();
    if (!S.token || !pendiente()) return S.estado;
    await subir();
    return S.estado;
  }
  // Al volver a SweetSuite o bloquear: guardar aquí y subir lo pendiente
  async function guardarAlSalir() {
    await guardarLocal();
    if (S.token && pendiente() && navigator.onLine) await subir();
    return { estado: PARA_SUITE[S.estado] || "", texto: IR.app ? IR.app.textoEstado() : "" };
  }

  // Una copia de seguridad importada se fusiona: no pisa lo que ya hay
  function importar(doc) {
    cambiar((d) => { Object.assign(d, fusionar(d, doc)); }, { subirYa: true });
  }

  window.addEventListener("online", () => { if (S.doc) sincronizar({ forzar: true }); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { guardarLocal(); if (pendiente() && autoguardado()) subir(); }
    else sincronizar();
  });

  IR.almacen = {
    S, nuevo, normalizar, fusionar,
    cambiar, cambiarActual, cambiarAjustes, cambiarItem, anadir, borrar,
    guardarLocal, subir, subirAhora, guardarAlSalir, sincronizar, pendiente,
    entrar, cambiarToken, importar, refrescarClaves,
    autoguardado, ponerAutoguardado,
  };
})();

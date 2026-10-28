/*
 * Ironrack — El documento del usuario y dónde se guarda.
 *
 * Todo lo de una persona es UN documento JSON: sus ejercicios propios, sus
 * rutinas, sus sesiones terminadas y la sesión en curso. Se guarda en dos
 * sitios, siempre cifrado:
 *
 *   1. En este navegador (localStorage), en cuanto cambia algo. En el gimnasio
 *      no siempre hay cobertura, y una serie apuntada no puede depender de ella.
 *   2. En GitHub (datos-cifrados), unos segundos después, cuando hay conexión.
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

  const S = { usuario: null, cripto: null, token: null, doc: null, sha: null, estado: "local", error: null };
  const clave = (n, u) => `ironrack_${n}_${u || S.usuario}`;
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
    programarSubida(subirYa ? 0 : 5000);
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
  function estado(e, error) {
    S.estado = e;
    S.error = error || null;
    if (IR.app) IR.app.pintarEstado();
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
    const remoto = await S.cripto.descifrar(blob);
    if (blob.salt !== S.cripto.salt) { S.cripto.adoptar(blob); await persistirCredenciales(); }
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
    if (e.code === "BAD_PASSWORD") return estado("error", "Lo publicado en GitHub no se abre con tu contraseña");
    if (e.code === "NECESITA_CONTRASENA") return estado("contrasena", "Entra otra vez con tu contraseña para sincronizar");
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
      await traer();
      if (pendiente()) await subir();
      else estado("ok");
    } catch (e) {
      errorSync(e);
    }
  }

  // ── Credenciales en este dispositivo ──
  let recordarActivo = false;
  async function persistirCredenciales() {
    if (S.token) ls.set(clave("token"), JSON.stringify(await S.cripto.cifrarTexto(S.token)));
    if (recordarActivo) { try { await IR.cripto.recordar(S.usuario, S.cripto); } catch (e) { /* sin IndexedDB */ } }
  }
  const tieneToken = (u) => !!ls.get(clave("token", u));
  const tieneDatos = (u) => !!ls.get(clave("doc", limpiarUsuario(u)));
  const esCuenta = (u) => G.CUENTAS.some((c) => c.usuario === limpiarUsuario(u));
  const ultimoUsuario = () => ls.get("ironrack_usuario") || "";
  const limpiarUsuario = (u) => String(u || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

  /*
   * Entrar con contraseña.
   * Devuelve { nuevo: true } si no hay datos ni aquí ni en GitHub y no se ha
   * pedido crear: la pantalla pide entonces repetir la contraseña, para no
   * estrenar una cuenta vacía por una errata en el usuario.
   */
  async function entrar({ usuario, password, token, crear = false, recordar = true }) {
    usuario = limpiarUsuario(usuario);
    if (!usuario) throw fallo("Escribe tu usuario", "USUARIO");
    if (!esCuenta(usuario)) throw fallo("No existe el usuario «" + usuario + "»", "USUARIO");
    if (!password) throw fallo("Escribe tu contraseña", "PASSWORD");
    const k = (n) => clave(n, usuario);
    const localTxt = ls.get(k("doc"));
    const localBlob = localTxt ? JSON.parse(localTxt) : null;
    const cripto = IR.cripto.sesion({ password, salt: localBlob && localBlob.salt, iter: localBlob && localBlob.iter });

    let local = null;
    if (localBlob) local = await cripto.descifrar(localBlob); // contraseña mala → BAD_PASSWORD

    let tok = (token || "").trim() || null;
    const tokenNuevo = !!tok;
    if (!tok && ls.get(k("token"))) {
      try { tok = await cripto.descifrarTexto(JSON.parse(ls.get(k("token")))); } catch (e) { tok = null; }
    }

    let remoto = null, remotoBlob = null, sha = ls.get(k("sha")), problema = null;
    if (tok) {
      try {
        await G.acceso(tok);
        const res = await G.leer(tok, G.ruta(usuario));
        if (res) {
          remotoBlob = JSON.parse(res.texto);
          sha = res.sha;
          try {
            remoto = await cripto.descifrar(remotoBlob);
            cripto.adoptar(remotoBlob);
          } catch (e) {
            if (!local) throw e; // sin copia local, es que la contraseña no es esa
            problema = ["error", "Lo publicado en GitHub no se abre con esta contraseña"];
          }
        } else {
          sha = null;
        }
      } catch (e) {
        if (e.code === "BAD_PASSWORD") throw e;
        if (e.code === "AUTH" && tokenNuevo) throw e;
        if (e.code === "AUTH") problema = ["auth", e.message];
        else problema = ["pendiente"]; // sin conexión: se entra con lo de aquí
      }
    }

    if (!local && !remoto && !crear) return { nuevo: true, sinGitHub: !tok || !!problema };

    S.usuario = usuario;
    S.cripto = cripto;
    S.token = tok;
    S.sha = sha;
    S.doc = fusionar(local, remoto);
    if (sha) ls.set(k("sha"), sha); else ls.del(k("sha"));
    ls.set("ironrack_usuario", usuario);
    recordarActivo = recordar;
    if (!recordar) await IR.cripto.olvidar(usuario);
    await persistirCredenciales();
    // Lo que había aquí y no estaba publicado se sube; lo nuevo, también.
    if (local && remoto && JSON.stringify(normalizar(remoto)) !== JSON.stringify(S.doc)) ls.set(k("pendiente"), "1");
    if (!remoto && tok) ls.set(k("pendiente"), "1");
    await guardarLocal();
    ultimaSync = Date.now();
    if (problema) estado(problema[0], problema[1]);
    else if (!tok) estado("local");
    else if (pendiente()) subir();
    else estado("ok");
    return { ok: true };
  }

  // Entrar sin contraseña con la clave recordada en este dispositivo
  async function reanudar() {
    const usuario = ultimoUsuario();
    if (!usuario) return false;
    const rec = await IR.cripto.recuperar(usuario);
    const localTxt = ls.get(clave("doc", usuario));
    if (!rec || !localTxt) return false;
    const cripto = IR.cripto.sesion({ clave: rec.clave, salt: rec.salt, iter: rec.iter });
    let doc;
    try { doc = await cripto.descifrar(JSON.parse(localTxt)); } catch (e) { return false; }
    let tok = null;
    const tTxt = ls.get(clave("token", usuario));
    if (tTxt) { try { tok = await cripto.descifrarTexto(JSON.parse(tTxt)); } catch (e) { tok = null; } }
    Object.assign(S, { usuario, cripto, token: tok, doc: normalizar(doc), sha: ls.get(clave("sha", usuario)) });
    recordarActivo = true;
    estado(tok ? (pendiente() ? "pendiente" : "ok") : "local");
    setTimeout(() => sincronizar({ forzar: true }), 50);
    return true;
  }

  // El token se añade cuando uno quiere, no al entrar. Si la sesión se abrió
  // con la clave recordada no tiene la contraseña, y la hace falta para abrir
  // lo que otro dispositivo publicó con otra sal: por eso se pide aquí también.
  const necesitaContrasena = () => !!S.cripto && !S.cripto.tienePassword;
  async function cambiarToken(token, password) {
    token = (token || "").trim();
    if (!token) throw fallo("Pega el token", "SIN_TOKEN");
    if (password) {
      const otra = IR.cripto.sesion({ password, salt: S.cripto.salt, iter: S.cripto.iter });
      const local = ls.get(clave("doc"));
      if (local) await otra.descifrar(JSON.parse(local)); // contraseña mala → BAD_PASSWORD
      S.cripto = otra;
    }
    await G.acceso(token);
    S.token = token;
    // Lo de este dispositivo se sube siempre al conectar, aunque no se haya
    // tocado nada: una cuenta recién estrenada sin token aún no tiene archivo.
    ls.set(clave("pendiente"), "1");
    await persistirCredenciales();
    await sincronizar({ forzar: true });
    if (pendiente()) await subir();
  }

  async function salir() {
    await guardarLocal();
    await IR.cripto.olvidar(S.usuario);
    Object.assign(S, { usuario: null, cripto: null, token: null, doc: null, sha: null, estado: "local", error: null });
  }

  // Borra de este navegador todo lo de este usuario (no lo de GitHub)
  async function olvidarDispositivo() {
    const u = S.usuario;
    await IR.cripto.olvidar(u);
    ["doc", "token", "sha", "pendiente"].forEach((n) => ls.del(clave(n, u)));
    if (ultimoUsuario() === u) ls.del("ironrack_usuario");
    Object.assign(S, { usuario: null, cripto: null, token: null, doc: null, sha: null, estado: "local", error: null });
  }

  // Una copia de seguridad importada se fusiona: no pisa lo que ya hay
  function importar(doc) {
    cambiar((d) => { Object.assign(d, fusionar(d, doc)); }, { subirYa: true });
  }

  window.addEventListener("online", () => sincronizar({ forzar: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { guardarLocal(); if (pendiente()) subir(); }
    else sincronizar();
  });

  IR.almacen = {
    S, nuevo, normalizar, fusionar,
    cambiar, cambiarActual, cambiarAjustes, cambiarItem, anadir, borrar,
    guardarLocal, subir, sincronizar, pendiente,
    entrar, reanudar, salir, olvidarDispositivo, cambiarToken, necesitaContrasena, importar,
    tieneToken, tieneDatos, esCuenta, ultimoUsuario, limpiarUsuario,
  };
})();

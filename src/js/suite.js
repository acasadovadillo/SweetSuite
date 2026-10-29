/*
 * SweetSuite — La entrada, el inicio con tus apps y la cuenta.
 *
 * Se entra una vez, con usuario y contraseña. La contraseña abre el llavero de
 * la cuenta (llavero.js) y de él sale el secreto de cada app; ni la contraseña
 * ni la clave maestra se guardan nunca: viven en memoria mientras la sesión
 * está abierta.
 *
 * Cada app se carga en su marco (apps/<id>/index.html) y pide su secreto a
 * window.SweetSuite. Se quedan abiertas mientras dura la sesión; al volver al
 * inicio, la app de la que sales sube lo que tenga pendiente.
 *
 * Una empresa (ABIES) entra en dos pasos: la empresa y su contraseña, y
 * después quién la representa, con su usuario y su contraseña de SweetSuite.
 * Hacen falta las dos para abrir los datos (llavero.js), y cada cambio queda
 * registrado con el nombre del representante.
 *
 * Rutas: #inicio, #cuenta/<sección> y #app/<id>.
 */
(function () {
  "use strict";
  const E = window.SweetEntorno, L = window.SweetLlavero, T = window.SweetTema;
  const VERSION = "1.1.0";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fallo = (msg, code) => { const e = new Error(msg); e.code = code; return e; };
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* lleno o bloqueado */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* nada */ } },
  };
  const MIN_CONTRASENA = 8;

  let CAT = { apps: [], cuentas: [] };
  // La sesión, solo en memoria
  // (en una empresa, «contrasena» es la del representante y «empresaPw» la de la empresa)
  const S = { cuenta: null, contrasena: null, maestra: null, llavero: null, anteriores: [], prefs: {}, apis: {}, estados: {}, abierta: null,
              representante: null, empresaPw: null };
  const SIN_SESION = { cuenta: null, contrasena: null, maestra: null, llavero: null, anteriores: [], prefs: {}, apis: {}, estados: {}, abierta: null,
                       representante: null, empresaPw: null };

  const limpiar = (u) => String(u || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]/g, "");
  const cuentaDe = (u) => CAT.cuentas.find((c) => c.usuario === limpiar(u));
  const appDe = (id) => CAT.apps.find((a) => a.id === id);
  const misApps = () => (S.cuenta ? CAT.apps.filter((a) => S.cuenta.apps.indexOf(a.id) >= 0) : []);
  const esEmpresa = (c) => !!c && c.tipo === "organizacion";
  // El usuario con el que cada app guarda el token: en una empresa, uno por representante
  const usuarioToken = () => S.cuenta.usuario + (S.representante ? "@" + S.representante.usuario : "");
  const iniciales = (n) => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const claveLlavero = (u) => "sweetsuite_llavero_" + u;
  function leerLlaveroLocal(u) {
    try { const x = JSON.parse(ls.get(claveLlavero(u))); return L.esLlavero(x) ? x : null; } catch (e) { return null; }
  }
  const guardarLlaveroLocal = (ll) => ls.set(claveLlavero(ll.usuario), JSON.stringify(ll));

  // Lo que cada app deja en este dispositivo, para saber su estado sin abrirla
  const MARCAS = {
    solvento: { pendiente: (u) => "sweetsuite_solvento_sync_pendiente:" + u, token: () => "sweetsuite_solvento_gh_token:" + usuarioToken() },
    ironrack: { pendiente: (u) => "sweetsuite_ironrack_pendiente_" + u, token: (u) => "sweetsuite_ironrack_token_" + u },
  };
  function estadoDe(id) {
    if (S.estados[id]) return S.estados[id];
    const m = MARCAS[id], u = S.cuenta.usuario;
    if (m && ls.get(m.pendiente(u)) === "1") return { estado: "pendiente", texto: "Cambios sin subir a GitHub" };
    if (m && !ls.get(m.token(u))) return { estado: "", texto: "Sin token: solo en este dispositivo" };
    return { estado: "ok", texto: "Guardado en GitHub" };
  }

  // ── Avisos y diálogos ──
  let tAviso = null;
  function aviso(texto, punto) {
    const el = $("#aviso");
    el.textContent = texto;
    el.style.setProperty("--punto", punto ? `var(--${punto === "pendiente" ? "aviso" : punto === "error" ? "peligro" : "ok"})` : "var(--acento)");
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("visible"));
    clearTimeout(tAviso);
    tAviso = setTimeout(() => { el.classList.remove("visible"); setTimeout(() => { el.hidden = true; }, 250); }, punto === "error" ? 7000 : 3400);
  }
  let alCerrarDialogo = null, dialogoFijo = false;
  // Uno «fijo» no se cierra tocando fuera ni con Escape: hay que contestarlo
  function dialogo(html, alCerrar, fijo) {
    const d = $("#dialogo");
    d.innerHTML = html;
    d.hidden = false;
    $("#velo").hidden = false;
    alCerrarDialogo = alCerrar || null;
    dialogoFijo = !!fijo;
    setTimeout(() => { const f = d.querySelector("input, button.primario, button"); if (f) f.focus(); }, 30);
    return d;
  }
  function cerrarDialogo(valor) {
    $("#dialogo").hidden = true;
    $("#velo").hidden = true;
    $("#dialogo").innerHTML = "";
    const fn = alCerrarDialogo;
    alCerrarDialogo = null;
    if (fn) fn(valor);
  }
  $("#velo").addEventListener("click", () => { if (!dialogoFijo) cerrarDialogo(null); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$("#dialogo").hidden && !dialogoFijo) cerrarDialogo(null); });
  function confirmar(titulo, detalle, si, peligro) {
    return new Promise((ok) => {
      const d = dialogo(`<h3>${esc(titulo)}</h3>${detalle ? `<p>${detalle}</p>` : ""}
        <div class="botones"><button class="btn" data-r="no">Cancelar</button><button class="btn primario ${peligro ? "peligro" : ""}" data-r="si">${esc(si || "Aceptar")}</button></div>`, ok);
      d.querySelector('[data-r="no"]').onclick = () => cerrarDialogo(false);
      d.querySelector('[data-r="si"]').onclick = () => cerrarDialogo(true);
    });
  }

  // ── Entrada ──
  const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><g style="fill:var(--acento);stroke:none"><rect x="8" y="8" width="21" height="21" rx="6"/><rect x="35" y="8" width="21" height="21" rx="6" opacity=".5"/><rect x="8" y="35" width="21" height="21" rx="6" opacity=".5"/><rect x="35" y="35" width="21" height="21" rx="6"/></g></svg>`;
  const OJO = '<svg class="ojo-ver" viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OJO_TACHADO = '<svg class="ojo-tachado" viewBox="0 0 24 24" aria-hidden="true" hidden><path d="M3 3l18 18"/><path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c6.5 0 10.5 6 10.5 6a17 17 0 0 1-3.4 3.9"/><path d="M6.5 7.6A17 17 0 0 0 1.5 12S5.5 18 12 18a9.9 9.9 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const campoClave = (name, ph, ac, valor) => `<div class="entrada-clave">
      <input type="password" name="${name}" placeholder="${ph}" autocomplete="${ac}" value="${esc(valor || "")}">
      <button type="button" class="entrada-ojo" data-ojo aria-label="Ver la contraseña" title="Ver la contraseña">${OJO}${OJO_TACHADO}</button>
    </div>`;

  // Lo que se escribió en la primera pantalla, mientras se decide qué hacer
  let pendienteEntrar = null;

  function pantalla(html) {
    T.aplicarAcento(T.PREDETERMINADO);       // la entrada no es de nadie todavía
    $("#suite").hidden = true;
    const el = $("#entrada");
    el.hidden = false;
    el.classList.add("con-curvas");
    el.innerHTML = html;
    el.querySelectorAll("[data-ojo]").forEach((b) => b.addEventListener("click", () => {
      const inputs = el.querySelectorAll('input[type="password"], input[data-era-clave]');
      const ver = b.querySelector(".ojo-ver").hasAttribute("hidden") === false;
      inputs.forEach((i) => { i.setAttribute("data-era-clave", ""); i.type = ver ? "text" : "password"; });
      el.querySelectorAll(".ojo-ver").forEach((s) => s.toggleAttribute("hidden", ver));
      el.querySelectorAll(".ojo-tachado").forEach((s) => s.toggleAttribute("hidden", !ver));
    }));
    const f = el.querySelector("input:not([value]), input[value='']") || el.querySelector("input");
    if (f) setTimeout(() => f.focus(), 50);
    return el;
  }
  const cabecera = (titulo, sub) => `<span class="entrada-logo">${LOGO}</span>
      <div class="entrada-titulo">${esc(titulo)}</div>
      <div class="entrada-sub">${sub}</div>`;
  function errorEntrada(texto, gris) {
    const e = $("#entrada .entrada-error");
    if (!e) return;
    e.textContent = texto || "";
    e.style.color = gris ? "var(--suave)" : "";
  }

  // Particular o Empresa, como el selector de dos botones de OpenClaw. Se
  // recuerda en este dispositivo cuál se usó la última vez.
  const CLAVE_MODO = "sweetsuite_modo_entrada";
  const ICONO_PARTICULAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/></svg>';
  const ICONO_EMPRESA = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="11" height="17" rx="1.5"/><path d="M15 9.5h4a1 1 0 0 1 1 1v10h-5M7.5 7.5h4M7.5 11h4M7.5 14.5h4M9 20.5v-2.5h1.5v2.5"/></svg>';
  const selectorModo = (modo) => `<div class="modo-entrada" role="radiogroup" aria-label="Tipo de cuenta">
      <button type="button" role="radio" aria-checked="${modo === "particular"}" data-modo="particular">${ICONO_PARTICULAR}Particular</button>
      <button type="button" role="radio" aria-checked="${modo === "empresa"}" data-modo="empresa">${ICONO_EMPRESA}Empresa</button>
    </div>`;
  function enchufarModo(el, alCambiar) {
    el.querySelectorAll("[data-modo]").forEach((b) => b.addEventListener("click", () => {
      ls.set(CLAVE_MODO, b.dataset.modo);
      alCambiar(b.dataset.modo);
    }));
  }

  function mostrarEntrada(usuario, modo) {
    pendienteEntrar = null;
    modo = modo || (esEmpresa(cuentaDe(usuario)) ? "empresa" : ls.get(CLAVE_MODO) === "empresa" ? "empresa" : "particular");
    if (modo === "empresa") { mostrarEmpresa(esEmpresa(cuentaDe(usuario)) ? usuario : ""); return; }
    const el = pantalla(`<form class="entrada" id="f-entrar" novalidate autocomplete="on">
        ${cabecera("SweetSuite", "Entra con tu usuario y tu contraseña")}
        ${selectorModo("particular")}
        <input name="usuario" placeholder="Usuario" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(usuario || "")}">
        ${campoClave("contrasena", "Contraseña", "current-password")}
        <button type="submit" class="entrada-boton">Entrar</button>
        <div class="entrada-error"></div>
        <button type="button" class="entrada-enlace" id="b-olvide">¿Has olvidado tu contraseña?</button>
      </form>`);
    enchufarModo(el, (m) => mostrarEntrada("", m));
    if (usuario) setTimeout(() => el.querySelector('[name="contrasena"]').focus(), 60);
    $("#b-olvide").onclick = () => mostrarRecuperar(el.querySelector('[name="usuario"]').value);
    $("#f-entrar").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, btn = f.querySelector(".entrada-boton");
      const cuenta = cuentaDe(f.usuario.value), pw = f.contrasena.value;
      if (!limpiar(f.usuario.value)) { errorEntrada("Escribe tu usuario"); f.usuario.focus(); return; }
      if (!pw) { errorEntrada("Escribe tu contraseña"); f.contrasena.focus(); return; }
      if (esEmpresa(cuenta)) { errorEntrada(cuenta.nombre + " es una empresa: elige «Empresa» arriba"); return; }
      // Usuario que no existe o contraseña que no vale: el mismo aviso, para
      // no decirle a nadie qué cuentas hay
      if (!cuenta) { errorEntrada("Usuario o contraseña incorrectos"); f.contrasena.value = ""; return; }
      const ll = leerLlaveroLocal(cuenta.usuario);
      if (!ll) { pendienteEntrar = { cuenta, pw }; mostrarPrimeraVez(); return; }
      btn.disabled = true;
      errorEntrada("Entrando…", true);
      try {
        const maestra = await L.abrir(ll, pw);
        await iniciarSesion(cuenta, pw, ll, maestra);
      } catch (e) {
        btn.disabled = false;
        f.contrasena.value = "";
        errorEntrada(e.code === "BAD_PASSWORD" ? "Usuario o contraseña incorrectos" : (e.message || String(e)));
      }
    });
  }

  // ── Empresa, paso 1: la empresa y su contraseña ──
  function mostrarEmpresa(usuario) {
    pendienteEntrar = null;
    const el = pantalla(`<form class="entrada" id="f-empresa" novalidate autocomplete="on">
        ${cabecera("SweetSuite", "Entra con la empresa y su contraseña")}
        ${selectorModo("empresa")}
        <input name="empresa" placeholder="Empresa" autocomplete="organization" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(usuario || "")}">
        ${campoClave("contrasena", "Contraseña de la empresa", "current-password")}
        <button type="submit" class="entrada-boton">Siguiente</button>
        <div class="entrada-error"></div>
        <button type="button" class="entrada-enlace" id="b-olvide">¿Has olvidado una contraseña?</button>
      </form>`);
    enchufarModo(el, (m) => mostrarEntrada("", m));
    $("#b-olvide").onclick = () => mostrarRecuperarEmpresa(el.querySelector('[name="empresa"]').value);
    $("#f-empresa").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const f = ev.target, cuenta = cuentaDe(f.empresa.value);
      if (!limpiar(f.empresa.value)) { errorEntrada("Escribe el nombre de la empresa"); f.empresa.focus(); return; }
      if (!f.contrasena.value) { errorEntrada("Escribe la contraseña de la empresa"); f.contrasena.focus(); return; }
      if (!esEmpresa(cuenta)) { errorEntrada("No hay ninguna empresa con ese nombre"); return; }
      mostrarRepresentante(cuenta, f.contrasena.value);
    });
  }

  // ── Empresa, paso 2: quién la representa ──
  // Hacen falta las dos contraseñas a la vez: hasta aquí no se ha comprobado
  // la de la empresa, porque sola no abre nada.
  function mostrarRepresentante(cuenta, pwEmpresa) {
    const el = pantalla(`<form class="entrada" id="f-rep" novalidate autocomplete="on">
        ${cabecera(cuenta.nombre, "Ahora, quién eres: tu usuario y tu contraseña de SweetSuite. Lo que cambies quedará registrado con tu nombre.")}
        <input name="usuario" placeholder="Representante (tu usuario)" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false">
        ${campoClave("contrasena", "Tu contraseña", "current-password")}
        <button type="submit" class="entrada-boton">Entrar</button>
        <div class="entrada-error"></div>
        <button type="button" class="entrada-enlace" id="b-volver">Volver</button>
      </form>`);
    $("#b-volver").onclick = () => mostrarEmpresa(cuenta.usuario);
    $("#f-rep").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, btn = f.querySelector(".entrada-boton");
      const rep = limpiar(f.usuario.value), pwRep = f.contrasena.value, repCuenta = cuentaDe(rep);
      if (!rep) { errorEntrada("Escribe tu usuario"); f.usuario.focus(); return; }
      if (!pwRep) { errorEntrada("Escribe tu contraseña"); f.contrasena.focus(); return; }
      if (!repCuenta || esEmpresa(repCuenta) || (cuenta.representantes || []).indexOf(rep) < 0) {
        errorEntrada("Ese usuario no es representante de " + cuenta.nombre); return;
      }
      btn.disabled = true;
      errorEntrada("Comprobando…", true);
      const fin = (texto) => { btn.disabled = false; f.contrasena.value = ""; errorEntrada(texto); };
      // Tu contraseña, primero contra tu propio llavero, si está en este dispositivo
      const propio = leerLlaveroLocal(rep);
      if (propio) { try { await L.abrir(propio, pwRep); } catch (e) { fin("Tu contraseña no es correcta"); return; } }
      const ll = leerLlaveroLocal(cuenta.usuario);
      const empresa = { representante: repCuenta, empresaPw: pwEmpresa };
      if (!ll) { pendienteEntrar = { cuenta, pw: pwEmpresa, empresa: { rep: repCuenta, pwRep } }; mostrarPrimeraVez(); return; }
      try {
        const maestra = await L.abrirEmpresa(ll, rep, pwEmpresa, pwRep);
        let nuevo = ll;
        // Un llavero de antes de ser empresa (o sin entrada tuya) se pone al día
        if (ll.contrasena || !ll.representantes || !ll.representantes[rep]) {
          nuevo = L.soloRepresentantes(await L.conRepresentante(ll, maestra, pwEmpresa, rep, pwRep), cuenta.representantes || []);
          guardarLlaveroLocal(nuevo);
        }
        await iniciarSesion(cuenta, pwRep, nuevo, maestra, empresa);
      } catch (e) {
        if (e.code === "SIN_REPRESENTANTE") fin("Aún no tienes acceso a " + cuenta.nombre + " en este dispositivo: entra con su clave de recuperación (abajo).");
        else if (e.code === "BAD_PASSWORD") fin("La contraseña de la empresa o la tuya no es correcta. Si has cambiado tu contraseña personal, entra con la clave de recuperación de la empresa.");
        else fin(e.message || String(e));
        if (e.code === "SIN_REPRESENTANTE" || e.code === "BAD_PASSWORD") {
          const enlace = $("#b-volver");
          enlace.insertAdjacentHTML("beforebegin", '<button type="button" class="entrada-enlace" id="b-rec-empresa">Entrar con la clave de recuperación de la empresa</button>');
          $("#b-rec-empresa").onclick = () => mostrarRecuperarEmpresa(cuenta.usuario, rep);
        }
      }
    });
  }

  // Con la clave de recuperación de la empresa: para un representante que
  // entra por primera vez en un dispositivo donde ya está la empresa, para
  // quien olvidó una contraseña y para quien cambió la suya personal. Crea (o
  // rehace) la entrada de ese representante con las dos contraseñas.
  function mostrarRecuperarEmpresa(empresa, rep) {
    pantalla(`<form class="entrada" id="f-rec-empresa" novalidate>
        ${cabecera("Clave de recuperación", "De la empresa. Con ella, la contraseña de la empresa y la tuya quedan como las escribas aquí. Los datos no se tocan.")}
        <input name="empresa" placeholder="Empresa" autocapitalize="none" spellcheck="false" value="${esc(empresa || "")}">
        <input name="codigo" placeholder="Clave de recuperación de la empresa" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <input name="usuario" placeholder="Representante (tu usuario)" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(rep || "")}">
        ${campoClave("contrasena", "Tu contraseña", "current-password")}
        <input type="password" name="pwEmpresa" placeholder="Contraseña de la empresa" autocomplete="off">
        <input type="password" name="repetir" placeholder="Repite la contraseña de la empresa" autocomplete="off">
        <button type="submit" class="entrada-boton">Entrar</button>
        <div class="entrada-error"></div>
        <div class="entrada-sub" style="margin:16px 0 0">En un dispositivo donde la empresa nunca ha entrado, usa «Ya usa SweetSuite en otro dispositivo»: al conectar su primera app te pedirá esta clave.</div>
        <button type="button" class="entrada-enlace" id="b-volver">Volver</button>
      </form>`);
    $("#b-volver").onclick = () => mostrarEmpresa(empresa);
    $("#f-rec-empresa").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, cuenta = cuentaDe(f.empresa.value), r = limpiar(f.usuario.value), repCuenta = cuentaDe(r);
      const ll = esEmpresa(cuenta) && leerLlaveroLocal(cuenta.usuario);
      if (!ll) { errorEntrada("Este dispositivo no tiene esa empresa: mira la nota de abajo"); return; }
      if (!repCuenta || (cuenta.representantes || []).indexOf(r) < 0) { errorEntrada("Ese usuario no es representante de " + cuenta.nombre); return; }
      if (!f.contrasena.value) { errorEntrada("Escribe tu contraseña"); return; }
      if (f.pwEmpresa.value.length < MIN_CONTRASENA) { errorEntrada(`La contraseña de la empresa debe tener al menos ${MIN_CONTRASENA} caracteres`); return; }
      if (f.pwEmpresa.value !== f.repetir.value) { errorEntrada("Las dos contraseñas de la empresa no coinciden"); return; }
      errorEntrada("Comprobando…", true);
      const propio = leerLlaveroLocal(r);
      if (propio) { try { await L.abrir(propio, f.contrasena.value); } catch (e) { errorEntrada("Tu contraseña no es correcta"); return; } }
      try {
        const maestra = await L.abrirConRecuperacion(ll, f.codigo.value);
        const nuevo = L.soloRepresentantes(await L.conRepresentante(ll, maestra, f.pwEmpresa.value, r, f.contrasena.value), cuenta.representantes || []);
        guardarLlaveroLocal(nuevo);
        await iniciarSesion(cuenta, f.contrasena.value, nuevo, maestra, { representante: repCuenta, empresaPw: f.pwEmpresa.value });
        aviso("Ya puedes entrar en " + cuenta.nombre + " con estas contraseñas", "ok");
      } catch (e) {
        errorEntrada(e.code === "BAD_PASSWORD" ? "Esa clave de recuperación no es la de " + cuenta.nombre : e.message);
      }
    });
  }

  // Primera vez de esta cuenta en este dispositivo: o es su primera vez en
  // SweetSuite, o ya la usa en otro y su llavero está en GitHub. Lo mismo
  // para una empresa, con las dos contraseñas.
  const extraEmpresa = () => (pendienteEntrar.empresa
    ? { representante: pendienteEntrar.empresa.rep, empresaPw: pendienteEntrar.pw } : null);
  const opcionesEmpresa = (provisional) => (pendienteEntrar.empresa
    ? { provisional, empresa: { representante: pendienteEntrar.empresa.rep.usuario, contrasenaRep: pendienteEntrar.empresa.pwRep } }
    : { provisional });
  const contrasenaSesion = () => (pendienteEntrar.empresa ? pendienteEntrar.empresa.pwRep : pendienteEntrar.pw);

  function mostrarPrimeraVez() {
    const { cuenta, empresa } = pendienteEntrar;
    pantalla(`<div class="entrada">
        ${empresa
          ? cabecera("Primera vez aquí", `En este dispositivo no está <b>${esc(cuenta.nombre)}</b>.`)
          : cabecera("Primera vez aquí", `En este dispositivo no hay ninguna cuenta de SweetSuite de <b>${esc(cuenta.nombre)}</b>.`)}
        <button type="button" class="entrada-boton" id="b-nueva">${empresa ? "Es la primera vez de " + esc(cuenta.nombre) + " en SweetSuite" : "Es mi primera vez en SweetSuite"}</button>
        <button type="button" class="entrada-boton secundario" id="b-yalauso">${empresa ? esc(cuenta.nombre) + " ya usa SweetSuite en otro dispositivo" : "Ya uso SweetSuite en otro dispositivo"}</button>
        <div class="entrada-error"></div>
        <button type="button" class="entrada-enlace" id="b-volver">Volver</button>
      </div>`);
    $("#b-volver").onclick = () => (empresa ? mostrarRepresentante(cuenta, pendienteEntrar.pw) : mostrarEntrada(cuenta.usuario));
    $("#b-nueva").onclick = () => mostrarCrear();
    $("#b-yalauso").onclick = async () => {
      errorEntrada("Entrando…", true);
      const { llavero, maestra } = await L.crear(cuenta.usuario, pendienteEntrar.pw, opcionesEmpresa(true));
      guardarLlaveroLocal(llavero);
      await iniciarSesion(cuenta, contrasenaSesion(), llavero, maestra, extraEmpresa());
      aviso("Abre una de las apps y pega su token: la cuenta se traerá de GitHub");
    };
  }

  function mostrarCrear() {
    const { cuenta, pw, empresa } = pendienteEntrar;
    pantalla(`<form class="entrada" id="f-crear" novalidate>
        ${empresa
          ? cabecera("Contraseña de " + cuenta.nombre, `La de la empresa, que junto con la de cada representante abre sus datos. Escríbela dos veces, de al menos ${MIN_CONTRASENA} caracteres.`)
          : cabecera("Elige tu contraseña", `Abrirá todas tus apps de SweetSuite. Escríbela dos veces, de al menos ${MIN_CONTRASENA} caracteres.`)}
        ${campoClave("contrasena", empresa ? "Contraseña de la empresa" : "Contraseña", "new-password", pw)}
        <input type="password" name="repetir" placeholder="Repite la contraseña" autocomplete="new-password">
        <button type="submit" class="entrada-boton">${empresa ? "Crear " + esc(cuenta.nombre) + " en SweetSuite" : "Crear mi cuenta"}</button>
        <div class="entrada-error"></div>
        <button type="button" class="entrada-enlace" id="b-volver">Volver</button>
      </form>`);
    $("#b-volver").onclick = () => mostrarPrimeraVez();
    $("#f-crear").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      if (f.contrasena.value.length < MIN_CONTRASENA) { errorEntrada(`La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres`); return; }
      if (f.contrasena.value !== f.repetir.value) { errorEntrada("Las dos contraseñas no coinciden"); f.repetir.focus(); return; }
      f.querySelector(".entrada-boton").disabled = true;
      errorEntrada(empresa ? "Creando la empresa…" : "Creando tu cuenta…", true);
      pendienteEntrar.pw = f.contrasena.value;
      const { llavero, maestra, recuperacion } = await L.crear(cuenta.usuario, f.contrasena.value, opcionesEmpresa(false));
      guardarLlaveroLocal(llavero);
      const pwSesion = contrasenaSesion(), extra = extraEmpresa();
      mostrarClaveRecuperacion(recuperacion, () => iniciarSesion(cuenta, pwSesion, llavero, maestra, extra),
        empresa ? "Es la de " + cuenta.nombre + ": guárdala donde la junta pueda encontrarla. Sirve para recuperar la empresa y para dar acceso a un representante nuevo. No se vuelve a enseñar." : null);
    });
  }

  // La clave de recuperación se enseña una vez, y no se sigue sin confirmar
  // que está guardada
  // En dos líneas de cuatro grupos, que se lee y se copia a mano mejor
  const dosLineas = (codigo) => { const g = String(codigo).split("-"); return esc(g.slice(0, 4).join("-")) + "-<br>" + esc(g.slice(4).join("-")); };
  const htmlRecuperacion = (codigo) => `<div class="clave-recuperacion" id="codigo-rec">${dosLineas(codigo)}</div>
      <button type="button" class="entrada-boton secundario" id="b-copiar" style="margin:0 0 14px">Copiar</button>
      <label class="entrada-check"><input type="checkbox" id="c-guardada"> La he guardado en un sitio seguro (impresa o en mi gestor de contraseñas)</label>`;
  function enchufarRecuperacion(raiz, codigo, boton) {
    raiz.querySelector("#b-copiar").onclick = async () => {
      try { await navigator.clipboard.writeText(codigo); aviso("Clave copiada", "ok"); }
      catch (e) { aviso("No se ha podido copiar: selecciónala y cópiala a mano", "pendiente"); }
    };
    const c = raiz.querySelector("#c-guardada");
    boton.disabled = true;
    c.addEventListener("change", () => { boton.disabled = !c.checked; });
  }
  function mostrarClaveRecuperacion(codigo, siguiente, texto) {
    const el = pantalla(`<div class="entrada">
        ${cabecera(texto ? "Clave de recuperación" : "Tu clave de recuperación", texto || "Si olvidas tu contraseña, es la única forma de volver a abrir tus datos. No se vuelve a enseñar.")}
        ${htmlRecuperacion(codigo)}
        <button type="button" class="entrada-boton" id="b-seguir">Entrar en SweetSuite</button>
      </div>`);
    enchufarRecuperacion(el, codigo, $("#b-seguir"));
    $("#b-seguir").onclick = () => siguiente();
  }

  function mostrarRecuperar(usuario) {
    pantalla(`<form class="entrada" id="f-recuperar" novalidate>
        ${cabecera("Recuperar la cuenta", "Con tu clave de recuperación eliges una contraseña nueva. Tus datos no se tocan.")}
        <input name="usuario" placeholder="Usuario" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(usuario || "")}">
        <input name="codigo" placeholder="Clave de recuperación" autocomplete="off" autocapitalize="characters" spellcheck="false">
        ${campoClave("contrasena", "Contraseña nueva", "new-password")}
        <input type="password" name="repetir" placeholder="Repite la contraseña nueva" autocomplete="new-password">
        <button type="submit" class="entrada-boton">Cambiar la contraseña y entrar</button>
        <div class="entrada-error"></div>
        <div class="entrada-sub" style="margin:16px 0 0">En un dispositivo donde nunca has entrado, elige «Ya uso SweetSuite en otro dispositivo» con la contraseña nueva: al conectar tu primera app te pedirá la clave de recuperación.</div>
        <button type="button" class="entrada-enlace" id="b-volver">Volver</button>
      </form>`);
    $("#b-volver").onclick = () => mostrarEntrada(usuario);
    $("#f-recuperar").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, cuenta = cuentaDe(f.usuario.value);
      const ll = cuenta && leerLlaveroLocal(cuenta.usuario);
      if (!cuenta || !ll) { errorEntrada("Este dispositivo no tiene esa cuenta: mira la nota de abajo"); return; }
      if (f.contrasena.value.length < MIN_CONTRASENA) { errorEntrada(`La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres`); return; }
      if (f.contrasena.value !== f.repetir.value) { errorEntrada("Las dos contraseñas no coinciden"); return; }
      errorEntrada("Comprobando…", true);
      try {
        const maestra = await L.abrirConRecuperacion(ll, f.codigo.value);
        const nuevo = await L.cambiarContrasena(ll, maestra, f.contrasena.value);
        guardarLlaveroLocal(nuevo);
        await iniciarSesion(cuenta, f.contrasena.value, nuevo, maestra);
        aviso("Contraseña cambiada. Úsala también en tus otros dispositivos", "ok");
      } catch (e) {
        errorEntrada(e.code === "BAD_PASSWORD" ? "Esa clave de recuperación no es la de esta cuenta" : e.message);
      }
    });
  }

  // ── La sesión ──
  // «empresa»: { representante, empresaPw } si se entra como representante
  async function iniciarSesion(cuenta, contrasena, llavero, maestra, empresa) {
    Object.assign(S, SIN_SESION, { cuenta, contrasena, maestra, llavero, estados: {}, apis: {} });
    if (empresa) Object.assign(S, { representante: empresa.representante, empresaPw: empresa.empresaPw });
    S.anteriores = await L.anteriores(llavero, maestra);
    S.prefs = await L.preferencias(llavero, maestra);
    pendienteEntrar = null;
    $("#entrada").hidden = true;
    $("#entrada").innerHTML = "";
    $("#suite").hidden = false;
    $("#suite").classList.add("con-curvas");
    T.aplicarAcento(S.prefs.acento);
    $("#avatar").textContent = iniciales(cuenta.nombre);
    $("#nombre-usuario").textContent = cuenta.nombre + (S.representante ? " · " + S.representante.nombre : "");
    $("#marca-nombre").textContent = cuenta.nombre;
    pintarMenus();
    const apps = misApps();
    // Con una sola app no hay nada que elegir: se entra en ella
    // Si se llegó con una app en la dirección (#app/ironrack, desde la dirección
    // de antes), se abre esa, si la cuenta la tiene
    const pedida = (/^#app\/([a-z0-9-]+)/.exec(location.hash) || [])[1];
    if (apps.length === 1) location.hash = "#app/" + apps[0].id;
    else if (pedida && apps.some((a) => a.id === pedida)) { /* se queda la pedida */ }
    else if (!/^#(inicio|cuenta)/.test(location.hash)) location.hash = "#inicio";
    ruta();
  }

  async function guardarTodas() {
    const ids = Object.keys(S.apis);
    for (const id of ids) {
      try { await S.apis[id].guardarAlSalir(); } catch (e) { /* lo de este dispositivo ya está guardado */ }
    }
  }
  async function salir(olvidarUsuario) {
    const pendientes = Object.keys(S.apis).filter((id) => S.apis[id].pendiente && S.apis[id].pendiente());
    if (pendientes.length) aviso("Guardando antes de salir…");
    await guardarTodas();
    const usuario = S.cuenta && S.cuenta.usuario;
    $("#marcos").innerHTML = "";
    Object.assign(S, SIN_SESION, { apis: {}, estados: {}, anteriores: [], prefs: {} });
    history.replaceState(null, "", location.pathname);
    document.title = "SweetSuite";
    cerrarLateral();
    mostrarEntrada(olvidarUsuario ? "" : usuario);
  }

  // ── Las apps ──
  function mostrarApp(id) {
    const app = appDe(id);
    if (!app || S.cuenta.apps.indexOf(id) < 0) { location.hash = "#inicio"; return; }
    let f = document.getElementById("marco-" + id);
    if (!f) {
      f = document.createElement("iframe");
      f.id = "marco-" + id;
      f.title = app.nombre;
      f.src = app.ruta + "index.html";
      $("#marcos").appendChild(f);
    }
    $("#marcos").querySelectorAll("iframe").forEach((x) => x.classList.toggle("activo", x === f));
    $("#marcos").classList.remove("oculto");
    $("#suite").inert = true;
    S.abierta = id;
    document.title = app.nombre + " · SweetSuite";
    cerrarLateral();
    try { f.contentWindow.focus(); } catch (e) { /* aún cargando */ }
  }

  // Al salir de una app al inicio, sube lo que tenga pendiente
  async function cerrarAppVisible() {
    const id = S.abierta;
    if (!id) return;
    S.abierta = null;
    $("#marcos").classList.add("oculto");
    $("#suite").inert = false;
    document.title = "SweetSuite";
    const api = S.apis[id], app = appDe(id);
    if (!api || !api.pendiente || !api.pendiente()) return;
    aviso("Guardando " + app.nombre + "…");
    try {
      const r = await api.guardarAlSalir();
      if (r && r.estado === "ok") aviso(app.nombre + ": guardado en GitHub", "ok");
      else aviso(app.nombre + ": " + ((r && r.texto) || "guardado en este dispositivo; se subirá en cuanto se pueda"), "pendiente");
    } catch (e) {
      aviso(app.nombre + ": guardado en este dispositivo; se subirá en cuanto se pueda", "pendiente");
    }
    pintar();
  }

  // ── El llavero en GitHub ──
  // Cada app que tiene su token lo comprueba al sincronizar: lee el llavero de
  // su repositorio y lo pone de acuerdo con el de aquí. Una cosa cada vez.
  let cola = Promise.resolve();
  function reconciliar(app, adaptador) {
    const p = cola.then(() => reconciliarYa(app, adaptador));
    cola = p.catch(() => {});
    return p;
  }
  const rutaLlavero = () => S.cuenta.usuario + ".llavero.json";
  const mensaje = (que) => "SweetSuite: " + que + " de " + S.cuenta.usuario;

  // Abrir un llavero con lo que tiene la sesión
  const abrirConSesion = (ll) => (S.representante
    ? L.abrirEmpresa(ll, S.representante.usuario, S.empresaPw, S.contrasena)
    : L.abrir(ll, S.contrasena));
  // En una empresa, que el llavero tenga la entrada de quien está dentro y solo
  // las de los representantes de cuentas.json. Devuelve el mismo si no cambia.
  async function conMiEntrada(ll, maestra) {
    if (!S.representante) return ll;
    const rep = S.representante.usuario;
    let nuevo = ll;
    if (ll.contrasena || !ll.representantes || !ll.representantes[rep]) nuevo = await L.conRepresentante(ll, maestra, S.empresaPw, rep, S.contrasena);
    const lista = S.cuenta.representantes || [];
    if (Object.keys(nuevo.representantes || {}).some((r) => lista.indexOf(r) < 0)) nuevo = L.soloRepresentantes(nuevo, lista);
    return nuevo;
  }

  async function adoptar(ll) {
    S.llavero = ll;
    guardarLlaveroLocal(ll);
    S.anteriores = await L.anteriores(ll, S.maestra);
    S.prefs = await L.preferencias(ll, S.maestra);
    T.aplicarAcento(S.prefs.acento);
  }

  async function reconciliarYa(app, ad) {
    if (!S.llavero) throw fallo("No hay sesión", "SIN_SESION");
    const res = await ad.leer(rutaLlavero());
    const local = S.llavero;

    // En GitHub no hay llavero todavía
    if (!res) {
      if (local.provisional) {
        if (!(await preguntarSiCrear(app))) return { cambio: false };
        const r = await L.cambiarRecuperacion(local, S.maestra);
        await adoptar(r.llavero);
        await enseñarRecuperacion(r.recuperacion, "Tu cuenta de SweetSuite ya está creada");
      }
      await ad.escribir(rutaLlavero(), JSON.stringify(S.llavero), null, mensaje("llavero"));
      return { cambio: false };
    }

    let remoto;
    try { remoto = JSON.parse(res.texto); } catch (e) { remoto = null; }
    if (!L.esLlavero(remoto)) throw fallo("El llavero de " + appDe(app).nombre + " en GitHub está dañado", "LLAVERO");

    // El mismo llavero: gana el que se tocó por última vez
    if (remoto.id === local.id) {
      if ((remoto.actualizado || 0) > (local.actualizado || 0)) {
        let escribir = false;
        try {
          await abrirConSesion(remoto);
        } catch (e) {
          // La contraseña se cambió en otro dispositivo
          const r = await pedirClave(app, remoto, "cambiada");
          if (!r) throw fallo("Tu contraseña cambió en otro dispositivo", "LLAVERO_PENDIENTE");
          if (r.recuperada) {
            remoto = S.representante ? await L.conRepresentante(remoto, r.maestra, S.empresaPw, S.representante.usuario, S.contrasena)
              : await L.cambiarContrasena(remoto, r.maestra, S.contrasena);
            escribir = true;
          } else if (S.representante) S.empresaPw = r.texto;
          else S.contrasena = r.texto;
        }
        const conEntrada = await conMiEntrada(remoto, S.maestra);
        if (conEntrada !== remoto) { remoto = conEntrada; escribir = true; }
        if (escribir) await ad.escribir(rutaLlavero(), JSON.stringify(remoto), res.sha, mensaje("llavero"));
        await adoptar(remoto);
      } else if ((local.actualizado || 0) > (remoto.actualizado || 0)) {
        await ad.escribir(rutaLlavero(), JSON.stringify(local), res.sha, mensaje("llavero"));
      }
      return { cambio: false };
    }

    // Dos llaveros distintos de la misma cuenta: se quedan los dos (ver llavero.js)
    let mRemota, tecleada = null, recuperada = false;
    try {
      mRemota = await abrirConSesion(remoto);
    } catch (e) {
      const r = await pedirClave(app, remoto, "distinta");
      if (!r) throw fallo("Tu cuenta en GitHub no se abre con esta contraseña", "LLAVERO_PENDIENTE");
      mRemota = r.maestra; recuperada = r.recuperada; tecleada = r.texto;
    }
    const todas = [S.maestra].concat(S.anteriores, [mRemota], await L.anteriores(remoto, mRemota));
    let nuevo;
    if (L.ganador(local, remoto) === remoto) {
      nuevo = await L.conAnteriores(remoto, mRemota, todas);
      if (recuperada && S.representante) nuevo = await L.conRepresentante(nuevo, mRemota, S.empresaPw, S.representante.usuario, S.contrasena);
      else if (recuperada) nuevo = await L.cambiarContrasena(nuevo, mRemota, S.contrasena);
      else if (tecleada && S.representante) S.empresaPw = tecleada;   // la de la empresa es la de GitHub
      else if (tecleada) S.contrasena = tecleada;         // la contraseña es la de la cuenta de GitHub
      S.maestra = mRemota;
    } else {
      nuevo = await L.conAnteriores(local, S.maestra, todas);
    }
    nuevo = await conMiEntrada(nuevo, S.maestra);
    nuevo = Object.assign({}, nuevo, { actualizado: Date.now() });
    await ad.escribir(rutaLlavero(), JSON.stringify(nuevo), res.sha, mensaje("llavero"));
    await adoptar(nuevo);
    if (tecleada && !recuperada) aviso(S.representante ? "La contraseña de la empresa es la de su cuenta de GitHub" : "A partir de ahora tu contraseña es la de tu cuenta de GitHub", "ok");
    avisarApps("alCambiarClaves");
    return { cambio: true };
  }

  function avisarApps(que) {
    Object.keys(S.apis).forEach((id) => {
      try { if (S.apis[id][que]) S.apis[id][que](); } catch (e) { /* cada app se las apaña */ }
    });
  }

  function pedirClave(app, remoto, motivo) {
    const nombre = appDe(app).nombre;
    if (S.representante) return pedirClaveEmpresa(app, remoto, motivo);
    const texto = motivo === "cambiada"
      ? `Tu contraseña de SweetSuite se cambió en otro dispositivo. Escribe la nueva (o tu clave de recuperación) para seguir con ${esc(nombre)}.`
      : `En ${esc(nombre)} ya hay una cuenta de SweetSuite de ${esc(S.cuenta.nombre)}, creada en otro dispositivo, y no se abre con la contraseña con la que has entrado aquí. Escribe la contraseña de esa cuenta o tu clave de recuperación.`;
    return new Promise((ok) => {
      const d = dialogo(`<h3>${motivo === "cambiada" ? "Tu contraseña ha cambiado" : "Tu cuenta tiene otra contraseña"}</h3>
        <p>${texto}</p>
        <form class="form" id="f-clave">
          <input class="campo" type="password" name="clave" placeholder="Contraseña o clave de recuperación" autocomplete="current-password">
          <p class="error" id="clave-error"></p>
          <div class="botones"><button type="button" class="btn" data-r="no">Ahora no</button><button class="btn primario">Seguir</button></div>
        </form>`, ok);
      d.querySelector('[data-r="no"]').onclick = () => cerrarDialogo(null);
      d.querySelector("#f-clave").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const t = ev.target.clave.value;
        if (!t) return;
        try {
          const r = await L.abrirConCualquiera(remoto, t);
          cerrarDialogo(Object.assign({ texto: t }, r));
        } catch (e) {
          d.querySelector("#clave-error").textContent = "No es ni la contraseña ni la clave de recuperación de esa cuenta";
        }
      });
    });
  }

  function pedirClaveEmpresa(app, remoto, motivo) {
    const nombre = appDe(app).nombre, e = S.cuenta.nombre, rep = S.representante.usuario;
    const texto = motivo === "cambiada"
      ? `La contraseña de ${esc(e)} se cambió en otro dispositivo. Escribe la nueva (o la clave de recuperación de ${esc(e)}) para seguir con ${esc(nombre)}.`
      : `En ${esc(nombre)} ya está ${esc(e)}, creada en otro dispositivo, y no se abre con las contraseñas con las que has entrado. Escribe la contraseña de ${esc(e)} que se usa allí o su clave de recuperación.`;
    return new Promise((ok) => {
      const d = dialogo(`<h3>${motivo === "cambiada" ? "La contraseña de la empresa ha cambiado" : "La empresa tiene otra contraseña"}</h3>
        <p>${texto}</p>
        <form class="form" id="f-clave">
          <input class="campo" type="password" name="clave" placeholder="Contraseña de ${esc(e)} o su clave de recuperación" autocomplete="off">
          <p class="error" id="clave-error"></p>
          <div class="botones"><button type="button" class="btn" data-r="no">Ahora no</button><button class="btn primario">Seguir</button></div>
        </form>`, ok);
      d.querySelector('[data-r="no"]').onclick = () => cerrarDialogo(null);
      d.querySelector("#f-clave").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const t = ev.target.clave.value;
        if (!t) return;
        try {
          if (L.pareceRecuperacion(t) && remoto.recuperacion) {
            try { cerrarDialogo({ texto: t, maestra: await L.abrirConRecuperacion(remoto, t), recuperada: true }); return; } catch (x) { /* sigue */ }
          }
          cerrarDialogo({ texto: t, maestra: await L.abrirEmpresa(remoto, rep, t, S.contrasena), recuperada: false });
        } catch (x) {
          d.querySelector("#clave-error").textContent = x.code === "SIN_REPRESENTANTE"
            ? `Aún no tienes acceso a ${e} allí: usa su clave de recuperación`
            : `No es ni la contraseña de ${e} ni su clave de recuperación`;
        }
      });
    });
  }

  function preguntarSiCrear(app) {
    const nombre = appDe(app).nombre;
    return new Promise((ok) => {
      const d = dialogo(`<h3>Tu cuenta no está en ${esc(nombre)}</h3>
        <p>Entraste diciendo que ya usas SweetSuite en otro dispositivo, pero en ${esc(nombre)} no está tu llavero.
           Si es tu primera vez en SweetSuite, crea tu cuenta ahora: te enseñaré tu clave de recuperación.
           Si la usas en otro dispositivo con otra app, conéctala primero.</p>
        <div class="botones"><button class="btn" data-r="no">Ahora no</button><button class="btn primario" data-r="si">Crear mi cuenta</button></div>`, ok);
      d.querySelector('[data-r="no"]').onclick = () => cerrarDialogo(false);
      d.querySelector('[data-r="si"]').onclick = () => cerrarDialogo(true);
    });
  }

  function enseñarRecuperacion(codigo, titulo) {
    return new Promise((ok) => {
      const d = dialogo(`<h3>${esc(titulo || "Tu nueva clave de recuperación")}</h3>
        <p>Si olvidas tu contraseña, es la única forma de volver a abrir tus datos. No se vuelve a enseñar.</p>
        ${htmlRecuperacion(codigo)}
        <div class="botones"><button class="btn primario" data-r="ok">Hecho</button></div>`, () => ok(), true);
      const b = d.querySelector('[data-r="ok"]');
      enchufarRecuperacion(d, codigo, b);
      b.onclick = () => cerrarDialogo(true);
    });
  }

  async function cambiarLlavero(nuevo) {
    await adoptar(nuevo);
    avisarApps("llaveroCambiado");     // las apps con token lo suben
  }

  // ── Pintar ──
  const ICONO = (id) => `<svg viewBox="0 0 24 24"><use href="#i-${id}"/></svg>`;
  function pintarMenus() {
    const apps = misApps();
    $("#nav-principal").innerHTML = `<a href="#inicio" data-vista="inicio">${ICONO("inicio")}Inicio</a>`;
    $("#nav-apps").innerHTML = apps.map((a) => `<a href="#app/${a.id}" data-app="${a.id}">${ICONO(a.id)}${esc(a.nombre)}<i class="punto" data-punto="${a.id}"></i></a>`).join("");
    $("#tabs").innerHTML = `<a href="#inicio" data-vista="inicio">${ICONO("inicio")}Inicio</a>` +
      apps.map((a) => `<a href="#app/${a.id}" data-app="${a.id}">${ICONO(a.id)}${esc(a.nombre)}</a>`).join("") +
      `<a href="#cuenta" data-vista="cuenta">${ICONO("ajustes")}Cuenta</a>`;
    $("#version").textContent = VERSION;
    const logo = LOGO.replace('aria-hidden="true"', 'aria-hidden="true" class="logo"');
    $("#marca").querySelectorAll("svg").forEach((s) => s.remove());
    $("#marca-lateral").querySelectorAll("svg").forEach((s) => s.remove());
    $("#marca").insertAdjacentHTML("afterbegin", logo);
    $("#marca-lateral").insertAdjacentHTML("afterbegin", logo);
  }

  function pintarEstados() {
    const apps = misApps();
    let peor = "ok";
    apps.forEach((a) => {
      const e = estadoDe(a.id);
      const p = document.querySelector(`[data-punto="${a.id}"]`);
      if (p) { p.className = "punto " + (e.estado || ""); p.title = e.texto; }
      const t = document.querySelector(`[data-estado-app="${a.id}"]`);
      if (t) t.innerHTML = `<i class="punto ${e.estado || ""}"></i>${esc(e.texto)}`;
      if (e.estado === "error") peor = "error";
      else if (e.estado === "pendiente" && peor !== "error") peor = "pendiente";
      else if (e.estado !== "ok" && peor === "ok") peor = "";
    });
    const textos = { ok: "Todo guardado", pendiente: "Cambios sin subir", error: "Revisa una app", "": "Solo en este dispositivo" };
    $("#estado-lateral").innerHTML = `<i class="punto ${peor}"></i>${textos[peor]}`;
  }

  function vistaInicio() {
    const apps = misApps();
    const provisional = S.llavero.provisional
      ? `<div class="tarjeta" style="border-color:var(--acento-linea);background:var(--acento-suave)">
          <b>Tu cuenta aún no está unida a la de GitHub.</b>
          <p class="nota" style="margin-top:4px">Abre una de tus apps y pega su token en Ajustes: SweetSuite traerá tu cuenta y tus datos.</p></div>`
      : "";
    const cabeza = S.representante
      ? `<h1>${esc(S.cuenta.nombre)}</h1>
        <p>Entras como <b>${esc(S.representante.nombre)}</b>, representante de ${esc(S.cuenta.nombre)}. Cada cambio queda registrado con tu nombre.</p>`
      : `<h1>Hola, ${esc(S.cuenta.nombre)}</h1>
        <p>Tus apps de SweetSuite. Lo de cada una se guarda aparte, cifrado, en su propio repositorio de GitHub.</p>`;
    return `<section class="cabeza">${cabeza}</section>
      ${provisional}
      <h2>${S.representante ? "Sus apps" : "Tus apps"}</h2>
      <div class="apps">${apps.map((a) => `<button class="app-tarjeta" data-a="abrir" data-app="${a.id}">
          <span class="app-icono">${ICONO(a.id)}</span>
          <span class="app-texto"><b>${esc(a.nombre)}</b><span class="desc">${esc(a.descripcion)}</span>
            <span class="estado-texto" data-estado-app="${a.id}"></span></span>
        </button>`).join("")}</div>`;
  }

  // Ajustes de la cuenta: la estructura de Ironrack y Solvento
  const SECCIONES = [
    ["cuenta", "Mi cuenta", "Tu usuario, tus apps y tu contraseña."],
    ["recuperacion", "Recuperación", "Lo que te deja volver a entrar si olvidas la contraseña."],
    ["apariencia", "Apariencia", ""],
    ["dispositivo", "Este dispositivo", "Lo que SweetSuite guarda aquí."],
    ["acerca", "Acerca de", ""],
  ];
  const fila = (titulo, desc, control, clase) => `<div class="fila ${clase || ""}">
      <div class="fila-texto"><b>${titulo}</b>${desc ? `<span>${desc}</span>` : ""}</div>
      <div class="fila-control">${control}</div></div>`;
  const ICONO_OK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
  const CONTENIDO = {
    cuenta: () => S.representante ? `<div class="tarjeta filas">
        ${fila("Empresa", "Con la que has entrado.", `<code>${esc(S.cuenta.usuario)}</code>`)}
        ${fila("Representante", "Quién eres: lo que cambies queda registrado con tu nombre.", `<code>${esc(S.representante.usuario)}</code>`)}
        ${fila("Representantes de " + esc(S.cuenta.nombre), (S.cuenta.representantes || []).map((r) => esc((cuentaDe(r) || {}).nombre || r)).join(" · ") +
          ". Se dan de alta y de baja en el código (cuentas.json), no desde la app.", "", "apilar")}
        ${fila("Sus apps", misApps().map((a) => esc(a.nombre)).join(" · "), "")}
        ${fila("Contraseñas", "Hacen falta la de la empresa y la tuya. Para cambiar la de la empresa, o si un representante cambia la suya, se entra con la clave de recuperación de la empresa («¿Has olvidado una contraseña?» en la entrada).", "", "apilar")}
      </div>` : `<div class="tarjeta filas">
        ${fila("Usuario", "Con el que entras en SweetSuite.", `<code>${esc(S.cuenta.usuario)}</code>`)}
        ${fila("Tus apps", misApps().map((a) => esc(a.nombre)).join(" · "), "")}
        ${fila("Contraseña", "La misma para todas tus apps. Cambiarla no toca tus datos.", '<button class="btn" data-a="cambiarContrasena">Cambiar</button>')}
      </div>`,
    recuperacion: () => `<div class="tarjeta filas">
        ${fila(S.representante ? "Clave de recuperación de " + esc(S.cuenta.nombre) : "Clave de recuperación", S.llavero.recuperacion
          ? (S.representante ? "La de la empresa, para todos sus representantes. Si generas otra, la de antes deja de valer: díselo a la junta." : "La guardaste al crear tu cuenta. Si generas otra, la de antes deja de valer.")
          : "Tu cuenta aún no tiene: se crea al unirla con GitHub o al generarla aquí.",
          `<button class="btn" data-a="nuevaRecuperacion">${S.llavero.recuperacion ? "Generar otra" : "Generar"}</button>`, "apilar")}
      </div>
      <p class="nota">Con ella y tu usuario se elige una contraseña nueva en «¿Has olvidado tu contraseña?», en la entrada.</p>`,
    apariencia: () => {
      const tema = T.tema(), actual = (S.prefs.acento && T.valido(S.prefs.acento)) ? S.prefs.acento.toLowerCase() : T.PREDETERMINADO;
      const propio = !T.deLaPaleta(actual);
      return `<h2>Tema</h2>
        <div class="tarjeta filas">${fila("Tema", "De este dispositivo. Lo comparten SweetSuite y Solvento; Ironrack es siempre oscura.",
          `<div class="segmentado" role="radiogroup" aria-label="Tema">${[["auto", "Automático"], ["claro", "Claro"], ["oscuro", "Oscuro"]].map(([v, n]) =>
            `<button role="radio" aria-checked="${tema === v}" data-a="tema" data-v="${v}">${n}</button>`).join("")}</div>`, "apilar")}</div>
        <h2>Color de acento</h2>
        <div class="tarjeta filas"><div class="muestras" role="radiogroup" aria-label="Color de acento">
          ${T.ACENTOS.map((a) => `<button class="muestra ${a.color === actual ? "elegida" : ""}" style="--c:${a.color}" data-a="acento" data-c="${a.color}"
              role="radio" aria-checked="${a.color === actual}" aria-label="${esc(a.nombre)}" title="${esc(a.nombre)}">${a.color === actual ? ICONO_OK : ""}</button>`).join("")}
          <label class="muestra ${propio ? "elegida" : ""}" style="--c:${actual}" title="Personalizado"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            <input type="color" value="${actual}" id="acento-propio" aria-label="Color personalizado"></label>
        </div></div>
        <p class="nota">El de SweetSuite. Cada app tiene el suyo, en sus Ajustes › Apariencia.</p>`;
    },
    dispositivo: () => `<div class="tarjeta filas">
        ${fila("Bloquear", "Vuelve a la entrada. Antes, cada app sube lo que tenga pendiente.", '<button class="btn" data-a="bloquear">Bloquear</button>')}
        ${fila(S.representante ? "Borrar " + esc(S.cuenta.nombre) + " de este dispositivo" : "Borrar tu cuenta de este dispositivo",
          "Borra el llavero y lo que las apps guardan aquí. Lo que está en GitHub no se toca.", '<button class="btn texto-peligro" data-a="olvidar">Borrar</button>')}
      </div>`,
    acerca: () => `<div class="tarjeta filas">
        ${fila("Versión", "", `<code>SweetSuite ${VERSION}</code>`)}
        ${fila("Dónde están tus datos", "Cada app en su repositorio privado de GitHub, cifrada en tu dispositivo antes de salir: " +
          misApps().map((a) => `<code>${esc(E.repos[a.id].repo)}</code>`).join(", ") + ".", "", "apilar")}
        ${E.prod ? "" : fila("Entorno", "Desarrollo: nada sale de este ordenador.", "<code>desarrollo</code>")}
      </div>`,
  };
  function vistaCuenta(sec) {
    const p = CONTENIDO[sec] ? sec : "cuenta";
    const [, nombre, desc] = SECCIONES.find((x) => x[0] === p);
    return `<section class="cabeza"><h1>Ajustes de la cuenta</h1><p>Lo de tu cuenta de SweetSuite. Lo de cada app, en los Ajustes de la app.</p></section>
      <div class="aj-layout">
        <nav class="aj-nav" aria-label="Secciones">${SECCIONES.map(([id, n]) => `<a href="#cuenta/${id}" class="aj-tab ${id === p ? "activo" : ""}">${n}</a>`).join("")}</nav>
        <div class="aj-body"><h3>${nombre}</h3>${desc ? `<p>${desc}</p>` : ""}${CONTENIDO[p]()}</div>
      </div>
      <p class="version-pie">SweetSuite ${VERSION}</p>`;
  }

  let vistaActual = "inicio", argActual = "";
  function pintar(vista, arg) {
    if (!S.cuenta) return;
    if (vista) { vistaActual = vista; argActual = arg || ""; }
    $("#vista").innerHTML = vistaActual === "cuenta" ? vistaCuenta(argActual) : vistaInicio();
    document.body.className = document.body.className.replace(/\bvista-\S+/g, "").trim();
    document.body.classList.add("vista-" + vistaActual);
    document.querySelectorAll("#suite [data-vista]").forEach((a) => a.classList.toggle("activo", a.dataset.vista === vistaActual));
    document.querySelectorAll("#suite [data-app]").forEach((a) => a.classList.remove("activo"));
    const propio = $("#acento-propio");
    if (propio) {
      propio.addEventListener("input", () => T.aplicarAcento(propio.value));
      propio.addEventListener("change", () => guardarAcento(propio.value));
    }
    pintarEstados();
  }

  function ruta() {
    if (!S.cuenta) return;
    const [v, arg] = location.hash.replace(/^#/, "").split("/");
    if (v === "app" && arg) { mostrarApp(arg); return; }
    cerrarAppVisible();
    pintar(v === "cuenta" ? "cuenta" : "inicio", arg);
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", ruta);

  // ── El cajón del móvil ──
  function abrirLateral() {
    $("#lateral").classList.add("abierta");
    $("#lateral-velo").hidden = false;
    $(".hamburguesa").setAttribute("aria-expanded", "true");
  }
  function cerrarLateral() {
    if (!$("#lateral").classList.contains("abierta")) return;
    $("#lateral").classList.remove("abierta");
    $("#lateral-velo").hidden = true;
    $(".hamburguesa").setAttribute("aria-expanded", "false");
  }

  function menuCuenta(boton) {
    const viejo = $(".menu-flotante");
    if (viejo) { viejo.remove(); return; }
    const r = boton.getBoundingClientRect();
    const m = document.createElement("div");
    m.className = "menu-flotante";
    m.setAttribute("role", "menu");
    m.innerHTML = `<button role="menuitem" data-m="cuenta">Ajustes de la cuenta</button><button role="menuitem" data-m="bloquear">Bloquear</button><button role="menuitem" data-m="salir">Cerrar sesión</button>`;
    m.style.left = r.left + "px";
    m.style.top = r.bottom + 6 + "px";
    m.style.width = Math.max(r.width, 220) + "px";
    document.body.appendChild(m);
    m.querySelector("button").focus();
    m.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-m]");
      if (!b) return;
      m.remove();
      if (b.dataset.m === "cuenta") location.hash = "#cuenta";
      else salir(b.dataset.m === "salir");
    });
  }
  document.addEventListener("click", (ev) => {
    const m = $(".menu-flotante");
    if (m && !m.contains(ev.target) && !ev.target.closest('[data-a="menuCuenta"]')) m.remove();
  });

  async function guardarAcento(color) {
    const prefs = Object.assign({}, S.prefs, { acento: color && T.valido(color) && color.toLowerCase() !== T.PREDETERMINADO ? color.toLowerCase() : undefined });
    await cambiarLlavero(await L.conPreferencias(S.llavero, S.maestra, prefs));
    pintar();
  }

  // ── Acciones ──
  const ACC = {
    abrirLateral, cerrarLateral,
    menuCuenta: (el) => menuCuenta(el),
    bloquear: () => salir(false),
    cerrarSesion: () => salir(true),
    abrir: (el) => { location.hash = "#app/" + el.dataset.app; },
    tema: (el) => { T.ponerTema(el.dataset.v); pintar(); },
    acento: (el) => { T.aplicarAcento(el.dataset.c); guardarAcento(el.dataset.c); },
    cambiarContrasena() {
      const d = dialogo(`<h3>Cambiar la contraseña</h3>
        <p>La misma para todas tus apps. En tus otros dispositivos te pedirá la nueva la próxima vez que se conecten.</p>
        <form class="form" id="f-pw">
          <input class="campo" type="password" name="actual" placeholder="Contraseña actual" autocomplete="current-password">
          <input class="campo" type="password" name="nueva" placeholder="Contraseña nueva (mín. ${MIN_CONTRASENA})" autocomplete="new-password">
          <input class="campo" type="password" name="repetir" placeholder="Repite la nueva" autocomplete="new-password">
          <p class="error" id="pw-error"></p>
          <div class="botones"><button type="button" class="btn" data-r="no">Cancelar</button><button class="btn primario">Cambiar</button></div>
        </form>`);
      d.querySelector('[data-r="no"]').onclick = () => cerrarDialogo();
      d.querySelector("#f-pw").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = ev.target, err = d.querySelector("#pw-error");
        if (f.actual.value !== S.contrasena) { err.textContent = "La contraseña actual no es esa"; return; }
        if (f.nueva.value.length < MIN_CONTRASENA) { err.textContent = `Al menos ${MIN_CONTRASENA} caracteres`; return; }
        if (f.nueva.value !== f.repetir.value) { err.textContent = "Las dos contraseñas nuevas no coinciden"; return; }
        err.textContent = "";
        f.querySelector(".primario").disabled = true;
        await cambiarLlavero(await L.cambiarContrasena(S.llavero, S.maestra, f.nueva.value));
        S.contrasena = f.nueva.value;
        cerrarDialogo();
        aviso("Contraseña cambiada", "ok");
      });
    },
    async nuevaRecuperacion() {
      if (S.llavero.recuperacion && !(await confirmar("¿Generar otra clave de recuperación?", "La que tienes guardada dejará de valer.", "Generar otra"))) return;
      const r = await L.cambiarRecuperacion(S.llavero, S.maestra);
      await cambiarLlavero(r.llavero);
      await enseñarRecuperacion(r.recuperacion);
      pintar();
    },
    async olvidar() {
      const pend = Object.keys(S.apis).some((id) => S.apis[id].pendiente && S.apis[id].pendiente()) ||
        misApps().some((a) => MARCAS[a.id] && ls.get(MARCAS[a.id].pendiente(S.cuenta.usuario)) === "1");
      if (!(await confirmar("¿Borrar tu cuenta de este dispositivo?",
        (pend ? "<b>Hay cambios que aún no están en GitHub y se perderán.</b> " : "") +
        "Se borran tu llavero y lo que tus apps guardan aquí. Lo que está en GitHub no se toca: para volver a entrar aquí necesitarás tu contraseña y el token de cada app.",
        "Borrar", true))) return;
      const u = S.cuenta.usuario;
      $("#marcos").innerHTML = "";
      S.apis = {};
      const borrar = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k === claveLlavero(u) || (k.indexOf("sweetsuite_solvento_") === 0 && (k.endsWith(":" + u) || k.indexOf(":" + u + "@") > 0)) ||
            (k.indexOf("sweetsuite_ironrack_") === 0 && k.endsWith("_" + u))) borrar.push(k);
      }
      borrar.forEach(ls.del);
      Object.assign(S, SIN_SESION, { apis: {}, estados: {}, anteriores: [], prefs: {} });
      history.replaceState(null, "", location.pathname);
      mostrarEntrada("");
    },
  };
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-a]");
    if (!el || !ACC[el.dataset.a]) return;
    ev.preventDefault();
    ACC[el.dataset.a](el);
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") cerrarLateral(); });

  // Cerrar la pestaña con cambios sin subir: el navegador pregunta
  window.addEventListener("beforeunload", (ev) => {
    if (Object.keys(S.apis).some((id) => S.apis[id].pendiente && S.apis[id].pendiente())) { ev.preventDefault(); ev.returnValue = ""; }
  });

  // ── Lo que las apps ven: window.SweetSuite ──
  window.SweetSuite = {
    version: VERSION,
    entorno: E,
    tema: T,
    // De quién es la sesión y con qué abre cada app su archivo
    async sesion(app) {
      if (!S.cuenta || S.cuenta.apps.indexOf(app) < 0) return null;
      return {
        usuario: S.cuenta.usuario, nombre: S.cuenta.nombre, tipo: S.cuenta.tipo || "persona",
        // En una empresa, quién la representa: firma los cambios y lleva su propio token
        representante: S.representante ? { usuario: S.representante.usuario, nombre: S.representante.nombre } : null,
        secreto: await L.secretoDeApp(S.maestra, app),
        anteriores: await Promise.all(S.anteriores.map((m) => L.secretoDeApp(m, app))),
        repo: E.repos[app], antiguo: E.antiguo,
      };
    },
    registrar(app, api) { S.apis[app] = api; },
    estado(app, estado, texto) {
      S.estados[app] = { estado: estado || "", texto: texto || "" };
      if (S.cuenta) pintarEstados();
    },
    reconciliar,
    volver() { location.hash = "#inicio"; },
    cuenta() { location.hash = "#cuenta"; },
    bloquear: () => salir(false),
    cerrarSesion: () => salir(true),
    aviso,
  };

  // ── Arranque ──
  async function iniciar() {
    try {
      const r = await fetch("cuentas.json?" + Date.now(), { cache: "no-store" });
      CAT = await r.json();
    } catch (e) {
      $("#entrada").hidden = false;
      $("#entrada").innerHTML = '<div class="entrada"><div class="entrada-error">No se ha podido cargar SweetSuite. Comprueba la conexión y recarga.</div></div>';
      return;
    }
    mostrarEntrada("");
    if ("serviceWorker" in navigator) {
      if (E.prod) navigator.serviceWorker.register("sw.js").catch(() => {});
      else navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((x) => x.unregister())).catch(() => {});
    }
  }
  iniciar();
})();

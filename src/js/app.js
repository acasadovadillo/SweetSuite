/*
 * Ironrack — Arranque, pantalla de entrada, navegación y ajustes.
 *
 * Las vistas se eligen por el hash: #entrenar, #historial/<id>, #progreso/<ej>,
 * #rutinas/<id>, #ejercicios, #ajustes. Cada vista es una función que devuelve
 * HTML a partir del documento; volver a pintar es volver a llamarla.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const U = IR.u, A = IR.almacen, esc = U.esc, $ = IR.ui.$;
  const S = A.S;
  const VERSION = "1.3.0";

  const TABS = ["entrenar", "historial", "progreso", "rutinas", "ejercicios"];

  // ── Pintar ──
  // Si estás escribiendo en una casilla, no se repinta debajo de ti (te
  // quitaría el foco y el teclado): se espera a que salgas de ella.
  let renderPendiente = false;
  function escribiendo() {
    const a = document.activeElement;
    return a && $("#vista").contains(a) && a.matches("input, textarea, select");
  }
  function render(forzar) {
    if (!S.doc) return;
    if (!forzar && escribiendo()) { renderPendiente = true; return; }
    renderPendiente = false;
    const [vista, arg] = location.hash.replace(/^#/, "").split("/");
    const v = IR.vistas[vista] ? vista : "entrenar";
    $("#vista").innerHTML = IR.vistas[v].html(arg ? decodeURIComponent(arg) : undefined);
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("activo", a.dataset.tab === v));
    document.body.classList.toggle("entrenando", !!S.doc.actual);
    relojes();
    IR.descanso.pintar();
  }
  document.addEventListener("focusout", () => {
    if (renderPendiente) setTimeout(() => { if (renderPendiente && !escribiendo()) render(true); }, 50);
  });
  window.addEventListener("hashchange", () => { render(true); window.scrollTo(0, 0); });

  function relojes() {
    document.querySelectorAll("[data-reloj]").forEach((el) => { el.textContent = U.reloj(Date.now() - +el.dataset.reloj); });
  }
  setInterval(relojes, 1000);

  // ── Estado de la sincronización ──
  const ESTADOS = {
    ok: ["ok", "Guardado"],
    subiendo: ["subiendo", "Guardando…"],
    pendiente: ["pendiente", "Pendiente"],
    local: ["local", "Solo aquí"],
    auth: ["error", "Revisa el token"],
    error: ["error", "Error"],
  };
  function pintarEstado() {
    const b = $("#estado");
    if (!b) return;
    const [clase, texto] = ESTADOS[S.estado] || ESTADOS.local;
    b.className = "estado " + clase;
    b.innerHTML = `<i></i>${texto}`;
    b.title = S.error || textoEstado();
  }
  function textoEstado() {
    switch (S.estado) {
      case "ok": return "Todo guardado y subido a GitHub, cifrado.";
      case "subiendo": return "Subiendo tus cambios a GitHub…";
      case "pendiente": return "Guardado en este dispositivo. Se subirá a GitHub en cuanto haya conexión.";
      case "local": return "Guardado solo en este dispositivo: añade un token de GitHub en Ajustes para tener copia en datos-cifrados.";
      default: return S.error || "No se ha podido sincronizar.";
    }
  }

  // ── Ajustes ──
  IR.vistas.ajustes = {
    html() {
      const aj = S.doc.ajustes;
      const DESCANSOS = [45, 60, 90, 120, 150, 180, 240, 300];
      const cuenta = IR.github.CUENTAS.find((c) => c.usuario === S.usuario);
      return `<section class="cabeza"><h1>Ajustes</h1><p class="suave">Cuenta: <b>${esc(cuenta ? cuenta.nombre : S.usuario)}</b></p></section>
        <article class="tarjeta">
          <h3>Descanso entre series</h3>
          <div class="chips">${DESCANSOS.map((s) =>
            `<button class="chip ${s === aj.descanso ? "activo" : ""}" data-a="ajDescanso" data-s="${s}">${s < 60 ? s + " s" : U.reloj(s * 1000).replace(/^0/, "")}</button>`).join("")}</div>
          <label class="interruptor"><input type="checkbox" data-cambio="ajSonido" ${aj.sonido !== false ? "checked" : ""}> Pitido al terminar el descanso</label>
        </article>
        <article class="tarjeta">
          <h3>Sincronización</h3>
          <p class="estado-largo ${ESTADOS[S.estado] ? ESTADOS[S.estado][0] : ""}">${esc(textoEstado())}</p>
          <p class="suave">Archivo: <code>${esc(IR.github.REPO.owner + "/" + IR.github.REPO.repo + "/" + IR.github.ruta(S.usuario))}</code>${IR.github.DEV ? " (modo local de pruebas)" : ""}</p>
          <div class="botones">
            <button class="btn ${S.token ? "" : "primario"}" data-a="ajToken">${S.token ? "Cambiar token" : "Pegar token de GitHub"}</button>
            <button class="btn primario" data-a="ajSincronizar" ${S.token ? "" : "disabled"}>Sincronizar ahora</button>
          </div>
        </article>
        <article class="tarjeta">
          <h3>Copia de seguridad</h3>
          <p class="suave">Un archivo JSON <b>sin cifrar</b> con todos tus datos. Importar una copia la mezcla con lo que ya tienes, sin borrar nada.</p>
          <div class="botones">
            <button class="btn" data-a="ajExportar">Descargar copia</button>
            <label class="btn">Importar copia<input type="file" accept="application/json,.json" data-cambio="ajImportar" hidden></label>
          </div>
        </article>
        <article class="tarjeta">
          <h3>Este dispositivo</h3>
          <div class="botones">
            <button class="btn" data-a="ajSalir">Cerrar sesión</button>
            <button class="btn texto-peligro" data-a="ajOlvidar">Borrar datos de este dispositivo</button>
          </div>
        </article>
        <p class="suave centro">Ironrack ${VERSION}</p>`;
    },
  };

  Object.assign(IR.acc, {
    ajDescanso: (el) => A.cambiarAjustes((a) => { a.descanso = +el.dataset.s; }),
    ajSonido: (el) => A.cambiarAjustes((a) => { a.sonido = el.checked; }, { render: false }),
    async ajSincronizar() { await A.sincronizar({ forzar: true }); if (A.pendiente()) await A.subir(); render(true); },
    ajToken() {
      IR.ui.hoja(`<h3>Token de GitHub</h3>
        <form class="form" id="f-token">
          <p class="suave">Para guardar una copia cifrada en <code>${esc(IR.github.REPO.repo + "/" + IR.github.ruta(S.usuario))}</code> y tener tus entrenos en todos tus dispositivos.</p>
          ${ayudaToken()}
          <label>Token <input name="token" autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="github_pat_…"></label>
          <p class="error" id="token-error"></p>
          <div class="botones"><button type="button" class="btn" data-a="_cerrar">Cancelar</button><button class="btn primario">Guardar</button></div>
        </form>`);
      IR.acc._cerrar = () => IR.ui.cerrarHoja();
      $("#f-token").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const btn = ev.target.querySelector(".primario");
        btn.disabled = true;
        try {
          await A.cambiarToken(ev.target.token.value);
          IR.ui.cerrarHoja();
          IR.ui.aviso(S.estado === "ok" ? "Conectado con GitHub" : "Token guardado");
          render(true);
        } catch (e) {
          $("#token-error").textContent = e.message;
          btn.disabled = false;
        }
      });
    },
    ajExportar() {
      const blob = new Blob([JSON.stringify(S.doc, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ironrack-" + S.usuario + "-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    async ajImportar(el) {
      const f = el.files && el.files[0];
      if (!f) return;
      try {
        const doc = JSON.parse(await f.text());
        if (!doc || !Array.isArray(doc.sesiones)) throw new Error("No parece una copia de Ironrack");
        if (!(await IR.ui.confirmar("¿Importar esta copia?", { detalle: doc.sesiones.length + " entrenos y " + (doc.rutinas || []).length + " rutinas. Se mezclan con los tuyos.", si: "Importar" }))) return;
        A.importar(doc);
        IR.ui.aviso("Copia importada");
      } catch (e) {
        IR.ui.aviso(e.message || "No se ha podido leer el archivo");
      } finally { el.value = ""; }
    },
    async ajSalir() {
      if (A.pendiente() && S.token && !(await IR.ui.confirmar("Hay cambios sin subir", { detalle: "Se quedan guardados y cifrados en este dispositivo, y se subirán la próxima vez que entres.", si: "Salir igualmente" }))) return;
      await A.salir();
      mostrarLogin();
    },
    async ajOlvidar() {
      const aviso = A.pendiente() ? "¡Hay cambios que aún no están en GitHub y se perderán!" : "Lo que está en GitHub no se toca.";
      if (!(await IR.ui.confirmar("¿Borrar tus datos de este dispositivo?", { detalle: aviso + " Se borran la copia local y el token.", si: "Borrar", peligro: true }))) return;
      await A.olvidarDispositivo();
      mostrarLogin();
    },
    irAjustes: () => { location.hash = "#ajustes"; },
  });

  function ayudaToken() {
    return `<details class="ayuda"><summary>¿Qué token?</summary>
      <p>Uno <b>fine-grained</b> de GitHub (Settings → Developer settings → Personal access tokens → Fine-grained tokens) con acceso
      <b>solo</b> al repositorio <code>${esc(IR.github.REPO.repo)}</code> y permiso <b>Contents: Read and write</b>. Sirve el mismo de Solvento.
      Se guarda cifrado con tu contraseña, solo en este dispositivo.</p></details>`;
  }

  // ── Entrada ──
  //
  // Usuario y contraseña, nada más: el token se pega luego en Ajustes. La
  // primera vez que un usuario entra en un dispositivo no hay nada que abrir,
  // así que la contraseña se establece escribiéndola dos veces; una errata ahí
  // dejaría el archivo cifrado con una contraseña que nadie recuerda.
  const MIN_CONTRASENA = 6;
  const esPrimeraVez = (u) => !A.tieneDatos(u);

  function mostrarLogin(error) {
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#login").innerHTML = `<div class="login-caja">
      <div class="logo-grande">${LOGO}<span>IRONRACK</span></div>
      <form class="form" id="f-login" autocomplete="on" novalidate>
        <label>Usuario <input name="usuario" value="${esc(A.ultimoUsuario())}" placeholder="alberto" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
        <label><span id="txt-password">Contraseña</span> <input type="password" name="password" autocomplete="current-password" required></label>
        <label id="campo-repite" hidden>Repite la contraseña <input type="password" name="password2" autocomplete="new-password"></label>
        <p class="suave pequeno-izq" id="login-info" hidden></p>
        <p class="error" id="login-error">${esc(error || "")}</p>
        <button class="btn primario grande ancho" id="login-btn">Entrar</button>
        <p class="suave centro pequeno">Tus datos se cifran en este dispositivo antes de guardarse. Sin tu contraseña nadie puede leerlos, tampoco GitHub.${IR.github.DEV ? "<br><b>Modo local de pruebas:</b> no se habla con GitHub." : ""}</p>
      </form></div>`;
    const f = $("#f-login");
    f.usuario.addEventListener("input", () => { $("#login-error").textContent = ""; modoLogin(f); });
    f.addEventListener("submit", entrar);
    modoLogin(f);
    setTimeout(() => (f.usuario.value ? f.password : f.usuario).focus(), 50);
  }

  // Entrar con la contraseña de siempre, o establecerla si es la primera vez
  function modoLogin(f) {
    const u = A.limpiarUsuario(f.usuario.value);
    const nueva = !!u && A.esCuenta(u) && esPrimeraVez(u);
    $("#txt-password").textContent = nueva ? "Elige tu contraseña" : "Contraseña";
    f.password.autocomplete = nueva ? "new-password" : "current-password";
    $("#campo-repite").hidden = !nueva;
    f.password2.required = nueva;
    const info = $("#login-info");
    info.hidden = !nueva;
    info.textContent = nueva
      ? `Primera vez de «${u}» en este dispositivo. Esta contraseña cifra ${IR.github.ruta(u).split("/").pop()}: si ya usas Ironrack en otro dispositivo, pon la misma.`
      : "";
    $("#login-btn").textContent = nueva ? "Crear contraseña y entrar" : "Entrar";
  }

  async function entrar(ev) {
    ev.preventDefault();
    const f = ev.target, btn = $("#login-btn"), err = $("#login-error");
    const usuario = A.limpiarUsuario(f.usuario.value);
    const nueva = A.esCuenta(usuario) && esPrimeraVez(usuario);
    err.textContent = "";
    if (!usuario) { err.textContent = "Escribe tu usuario"; f.usuario.focus(); return; }
    if (!f.password.value) { err.textContent = "Escribe tu contraseña"; f.password.focus(); return; }
    if (nueva && f.password.value.length < MIN_CONTRASENA) { err.textContent = `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres`; return; }
    if (nueva && f.password.value !== f.password2.value) { err.textContent = "Las dos contraseñas no coinciden"; f.password2.focus(); return; }
    const texto = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Abriendo…";
    try {
      await A.entrar({ usuario, password: f.password.value, crear: nueva });
      arrancar();
    } catch (e) {
      err.textContent = e.code === "BAD_PASSWORD" ? "Contraseña incorrecta" : e.message || String(e);
      btn.disabled = false;
      btn.textContent = texto;
    }
  }

  function arrancar() {
    $("#login").hidden = true;
    $("#login").innerHTML = "";
    $("#app").hidden = false;
    if (!location.hash) history.replaceState(null, "", "#entrenar");
    render(true);
    pintarEstado();
  }

  const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="20" width="7" height="24" rx="2"/><rect x="14" y="14" width="8" height="36" rx="2"/><rect x="42" y="14" width="8" height="36" rx="2"/><rect x="51" y="20" width="7" height="24" rx="2"/><rect x="22" y="29" width="20" height="6" rx="1"/></svg>`;

  // La sesión no se guarda nunca: cada vez que se abre la app, contraseña.
  function iniciar() {
    $("#marca").insertAdjacentHTML("afterbegin", LOGO);
    IR.cripto.borrarSesionesAntiguas();
    mostrarLogin();
    if ("serviceWorker" in navigator && !IR.github.DEV) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  IR.app = { render, pintarEstado, VERSION };
  iniciar();
})();

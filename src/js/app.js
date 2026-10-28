/*
 * Ironrack — Arranque, pantalla de entrada, navegación y ajustes.
 *
 * Las vistas se eligen por el hash: #entrenar, #historial/<id>, #progreso/<ej>,
 * #rutinas/<id>, #ejercicios, #ajustes/<pestaña>. Cada vista es una función que
 * devuelve HTML a partir del documento; volver a pintar es volver a llamarla.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const U = IR.u, A = IR.almacen, esc = U.esc, $ = IR.ui.$;
  const S = A.S;
  const VERSION = "1.4.0";

  // ── Pintar ──
  // Si estás escribiendo en una casilla, no se repinta debajo de ti (te
  // quitaría el foco y el teclado): se espera a que salgas de ella.
  let renderPendiente = false;
  function escribiendo() {
    const a = document.activeElement;
    return a && $("#vista").contains(a) && a.matches("input:not([type=color]), textarea, select");
  }
  function render(forzar) {
    if (!S.doc) return;
    if (!forzar && escribiendo()) { renderPendiente = true; return; }
    renderPendiente = false;
    IR.tema.aplicar(IR.tema.actual());
    const [vista, arg] = location.hash.replace(/^#/, "").split("/");
    const v = IR.vistas[vista] ? vista : "entrenar";
    $("#vista").innerHTML = IR.vistas[v].html(arg ? decodeURIComponent(arg) : undefined);
    document.querySelectorAll("[data-tab]").forEach((a) => a.classList.toggle("activo", a.dataset.tab === v));
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
  // Se ve como en OpenClaw: un punto de color y una palabra («● Conectado»).
  const ESTADOS = {
    ok: ["ok", "Guardado"],
    subiendo: ["subiendo", "Guardando…"],
    pendiente: ["pendiente", "Pendiente de subir"],
    local: ["local", "Solo en este dispositivo"],
    auth: ["error", "Revisa el token"],
    error: ["error", "Error al sincronizar"],
  };
  function pintarEstado() {
    const [clase, texto] = ESTADOS[S.estado] || ESTADOS.local;
    const b = $("#estado"), l = $("#estado-lateral");
    if (b) { b.className = "estado " + clase; b.innerHTML = `<i></i>${texto === "Solo en este dispositivo" ? "Solo aquí" : texto}`; b.title = S.error || textoEstado(); }
    if (l) { l.className = "estado-texto " + clase; l.innerHTML = `<i></i>${texto}`; l.title = S.error || textoEstado(); }
  }
  function textoEstado() {
    switch (S.estado) {
      case "ok": return "Todo guardado y subido a GitHub, cifrado.";
      case "subiendo": return "Subiendo tus cambios a GitHub…";
      case "pendiente": return "Guardado en este dispositivo. Se subirá a GitHub en cuanto haya conexión.";
      case "local": return "Guardado solo en este dispositivo. Pega tu token de GitHub para tener una copia cifrada en datos-cifrados.";
      default: return S.error || "No se ha podido sincronizar.";
    }
  }

  // ── Ajustes ──
  // Con pestañas, como «Tema · Interfaz de usuario» de OpenClaw.
  const PESTANAS = [["general", "General"], ["apariencia", "Apariencia"], ["sincronizacion", "Sincronización"], ["datos", "Datos"]];
  const fila = (titulo, desc, control, clase) => `<div class="fila ${clase || ""}">
      <div class="fila-texto"><b>${titulo}</b>${desc ? `<span>${desc}</span>` : ""}</div>
      <div class="fila-control">${control}</div></div>`;
  const ICONO_OK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
  const ICONO_PIPETA = '<svg viewBox="0 0 24 24"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>';

  const SECCIONES = {
    general() {
      const aj = S.doc.ajustes;
      const DESCANSOS = [45, 60, 90, 120, 150, 180, 240, 300];
      return `<h2>Entreno</h2>
        <div class="tarjeta filas">
          ${fila("Descanso entre series", "Arranca solo al marcar una serie con ✓.",
            `<select class="selector" data-cambio="ajDescanso" aria-label="Descanso entre series">${DESCANSOS.map((s) =>
              `<option value="${s}" ${s === aj.descanso ? "selected" : ""}>${s < 60 ? s + " s" : U.reloj(s * 1000).replace(/^0/, "") + " min"}</option>`).join("")}</select>`)}
          ${fila("Pitido al terminar el descanso", "Y vibración, si el dispositivo lo permite.",
            `<input type="checkbox" class="conmutador" data-cambio="ajSonido" aria-label="Pitido al terminar el descanso" ${aj.sonido !== false ? "checked" : ""}>`)}
        </div>`;
    },

    apariencia() {
      const actual = IR.tema.actual();
      const propio = !IR.tema.deLaPaleta(actual);
      const elegido = IR.tema.ACENTOS.find((a) => a.color === actual);
      return `<h2>Color de acento</h2>
        <p class="seccion-desc">Elige un color de acento para botones, elementos resaltados y otros controles.</p>
        <div class="tarjeta filas"><div class="muestras" role="radiogroup" aria-label="Color de acento">
          ${IR.tema.ACENTOS.map((a) => `<button class="muestra ${a.color === actual ? "elegida" : ""}" style="--c:${a.color}"
              data-a="ajAcento" data-c="${a.color}" role="radio" aria-checked="${a.color === actual}" aria-label="${esc(a.nombre)}" title="${esc(a.nombre)}">${a.color === actual ? ICONO_OK : ""}</button>`).join("")}
          <label class="muestra ${propio ? "elegida" : ""}" style="--c:${actual}" title="Personalizado">${ICONO_PIPETA}
            <input type="color" value="${actual}" data-on="ajAcentoPrevio" data-cambio="ajAcentoPropio" aria-label="Color personalizado"></label>
        </div></div>
        <p class="nota">${propio ? "Color personalizado " + esc(actual) : esc(elegido.nombre) + (actual === IR.tema.PREDETERMINADO ? " (el de siempre)" : "")} · Guardado en tu perfil cifrado — te acompaña en todos tus dispositivos.</p>`;
    },

    sincronizacion() {
      const [clase, texto] = ESTADOS[S.estado] || ESTADOS.local;
      const ruta = IR.github.REPO.repo + "/" + IR.github.ruta(S.usuario);
      return `<div class="seccion-cab"><span>GitHub</span><span class="punto-estado ${clase}"><i></i>${texto}</span></div>
        <p class="seccion-desc">${esc(textoEstado())}</p>
        <div class="tarjeta filas">
          ${fila("Archivo", "Repositorio privado. GitHub solo ve texto cifrado.", `<code>${esc(ruta)}</code>`, "apilar")}
          ${fila("Token de GitHub", S.token ? "Guardado en este dispositivo, cifrado con tu contraseña." : "Sin token, tus entrenos solo están en este dispositivo.",
            `<button class="btn ${S.token ? "" : "primario"}" data-a="ajToken">${S.token ? "Cambiar token" : "Pegar token"}</button>`)}
          ${fila("Sincronizar ahora", "Trae lo de tus otros dispositivos y sube lo de este.",
            `<button class="btn" data-a="ajSincronizar" ${S.token ? "" : "disabled"}>Sincronizar</button>`)}
        </div>
        ${IR.github.DEV ? '<p class="nota">Modo local de pruebas: no se habla con GitHub.</p>' : ""}`;
    },

    datos() {
      return `<h2>Copia de seguridad</h2>
        <div class="tarjeta filas">
          ${fila("Descargar copia", "Un archivo JSON <b>sin cifrar</b> con todos tus datos. Guárdalo en un sitio seguro.", '<button class="btn" data-a="ajExportar">Descargar</button>')}
          ${fila("Importar copia", "Se mezcla con lo que ya tienes, sin borrar nada.",
            '<label class="btn">Importar<input type="file" accept="application/json,.json" data-cambio="ajImportar" hidden></label>')}
        </div>
        <h2>Este dispositivo</h2>
        <div class="tarjeta filas">
          ${fila("Cerrar sesión", "La próxima vez que abras Ironrack te pedirá la contraseña.", '<button class="btn" data-a="ajSalir">Cerrar sesión</button>')}
          ${fila("Borrar datos de este dispositivo", "Borra la copia local y el token. Lo que está en GitHub no se toca.", '<button class="btn texto-peligro" data-a="ajOlvidar">Borrar</button>')}
        </div>`;
    },
  };

  IR.vistas.ajustes = {
    html(pestana) {
      const p = SECCIONES[pestana] ? pestana : "general";
      const cuenta = IR.github.CUENTAS.find((c) => c.usuario === S.usuario);
      return `<section class="cabeza"><h1>Ajustes</h1>
          <p>Preferencias de entreno, apariencia y sincronización de la cuenta de <b>${esc(cuenta ? cuenta.nombre : S.usuario)}</b>.</p></section>
        <nav class="pestanas">${PESTANAS.map(([id, nombre]) => `<a href="#ajustes/${id}" class="${id === p ? "activo" : ""}">${nombre}</a>`).join("")}</nav>
        ${SECCIONES[p]()}
        <p class="nota centro mono" style="margin-top:36px">Ironrack ${VERSION}</p>`;
    },
  };

  Object.assign(IR.acc, {
    ajDescanso: (el) => A.cambiarAjustes((a) => { a.descanso = +el.value; }, { render: false }),
    ajSonido: (el) => A.cambiarAjustes((a) => { a.sonido = el.checked; }, { render: false }),
    ajAcento: (el) => { IR.tema.aplicar(el.dataset.c); A.cambiarAjustes((a) => { a.acento = el.dataset.c; }); },
    // Mientras se arrastra en el selector de color solo se pinta; al soltar, se guarda
    ajAcentoPrevio: (el) => { if (IR.tema.valido(el.value)) IR.tema.aplicar(el.value); },
    ajAcentoPropio: (el) => { if (IR.tema.valido(el.value)) A.cambiarAjustes((a) => { a.acento = el.value.toLowerCase(); }); },
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
    irSincronizacion: () => { location.hash = "#ajustes/sincronizacion"; },
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
      <div class="logo-grande">${LOGO}<span>Ironrack</span></div>
      <section class="cabeza"><h1>Entrar</h1>
        <p>Tus entrenos se cifran en este dispositivo antes de guardarse. Sin tu contraseña nadie puede leerlos, tampoco GitHub.</p></section>
      <form class="form tarjeta" id="f-login" autocomplete="on" novalidate>
        <label>Usuario <input name="usuario" value="${esc(A.ultimoUsuario())}" placeholder="alberto" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
        <label><span id="txt-password">Contraseña</span> <input type="password" name="password" autocomplete="current-password" required></label>
        <label id="campo-repite" hidden>Repite la contraseña <input type="password" name="password2" autocomplete="new-password"></label>
        <p class="suave pequeno-izq" id="login-info" hidden></p>
        <p class="error" id="login-error">${esc(error || "")}</p>
        <button class="btn primario grande ancho" id="login-btn">Entrar</button>
      </form>
      ${IR.github.DEV ? '<p class="nota centro">Modo local de pruebas: no se habla con GitHub.</p>' : ""}
    </div>`;
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
    const cuenta = IR.github.CUENTAS.find((c) => c.usuario === S.usuario);
    const nombre = cuenta ? cuenta.nombre : S.usuario;
    $("#avatar").textContent = nombre.charAt(0);
    $("#nombre-usuario").textContent = nombre;
    if (!location.hash) history.replaceState(null, "", "#entrenar");
    render(true);
    pintarEstado();
  }

  const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="20" width="7" height="24" rx="2"/><rect x="14" y="14" width="8" height="36" rx="2"/><rect x="42" y="14" width="8" height="36" rx="2"/><rect x="51" y="20" width="7" height="24" rx="2"/><rect x="22" y="29" width="20" height="6" rx="1"/></svg>`;

  // La sesión no se guarda nunca: cada vez que se abre la app, contraseña.
  function iniciar() {
    $("#marca").insertAdjacentHTML("afterbegin", LOGO);
    $("#marca-lateral").insertAdjacentHTML("afterbegin", LOGO);
    // La barra lateral del ordenador lleva los mismos enlaces que las pestañas del móvil
    $("#nav-lateral").innerHTML = [...document.querySelectorAll(".tabs a")].map((a) => a.outerHTML).join("");
    $("#version").textContent = VERSION;
    IR.cripto.borrarSesionesAntiguas();
    mostrarLogin();
    if ("serviceWorker" in navigator && !IR.github.DEV) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  IR.app = { render, pintarEstado, VERSION };
  iniciar();
})();

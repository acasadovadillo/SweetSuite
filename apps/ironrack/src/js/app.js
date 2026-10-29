/*
 * Ironrack — Arranque, navegación y ajustes.
 *
 * La entrada es la de SweetSuite: Ironrack arranca ya con la cuenta abierta,
 * con el secreto que le da SweetSuite (suite-puente.js).
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
  const VERSION = "2.0.0";

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
    document.body.className = document.body.className.replace(/\bvista-\S+/g, "").trim();
    document.body.classList.add("vista-" + v);
    document.body.classList.toggle("entrenando", !!S.doc.actual);
    // En el móvil las secciones de Ajustes son una fila que se desliza: la
    // elegida, a la vista aunque esté al final.
    const tab = document.querySelector(".aj-tab.activo");
    if (tab && !escritorio()) tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    relojes();
    IR.descanso.pintar();
  }
  document.addEventListener("focusout", () => {
    if (renderPendiente) setTimeout(() => { if (renderPendiente && !escribiendo()) render(true); }, 50);
  });
  window.addEventListener("hashchange", () => { cerrarLateral(); render(true); window.scrollTo(0, 0); });

  // ── El cajón del móvil: la barra lateral, como en Solvento ──
  function abrirLateral() {
    $("#lateral").classList.add("abierta");
    $("#lateral-velo").hidden = false;
    document.querySelector(".hamburguesa").setAttribute("aria-expanded", "true");
  }
  function cerrarLateral() {
    const l = $("#lateral");
    if (!l || !l.classList.contains("abierta")) return;
    l.classList.remove("abierta");
    $("#lateral-velo").hidden = true;
    document.querySelector(".hamburguesa").setAttribute("aria-expanded", "false");
  }
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") cerrarLateral(); });
  const escritorio = () => window.matchMedia("(min-width: 1024px)").matches;

  function relojes() {
    document.querySelectorAll("[data-reloj]").forEach((el) => { el.textContent = U.reloj(Date.now() - +el.dataset.reloj); });
  }
  setInterval(relojes, 1000);

  // ── Estado de la sincronización ──
  // Un punto de color y una palabra («● Sincronizado»), en el pie de la barra
  // lateral; las palabras son las de Solvento para lo que es lo mismo.
  const ESTADOS = {
    ok: ["ok", "Sincronizado"],
    subiendo: ["subiendo", "Guardando…"],
    pendiente: ["pendiente", "Sin subir"],
    local: ["local", "Sin sincronizar"],
    auth: ["error", "Revisa el token"],
    error: ["error", "Error al sincronizar"],
  };
  function pintarEstado() {
    const [clase, texto] = ESTADOS[S.estado] || ESTADOS.local;
    const l = $("#estado-lateral");
    if (l) { l.className = "estado-texto " + clase; l.innerHTML = `<i></i>${texto}`; l.title = S.error || textoEstado(); }
  }
  function textoEstado() {
    switch (S.estado) {
      case "ok": return "Todo guardado y subido a GitHub, cifrado.";
      case "subiendo": return "Subiendo tus cambios a GitHub…";
      case "pendiente": return A.autoguardado()
        ? "Guardado en este dispositivo. Se subirá a GitHub en cuanto haya conexión."
        : "Guardado en este dispositivo. Súbelo con Guardar, ⌘S o al volver a SweetSuite.";
      case "local": return "Guardado solo en este dispositivo. Pega tu token de GitHub para tener una copia cifrada en Ironrack-Data.";
      default: return S.error || "No se ha podido sincronizar.";
    }
  }

  // ── Ajustes ──
  // Como en Solvento: lista de secciones a la izquierda y una tarjeta con su
  // título, una línea gris y el contenido. Los nombres compartidos son los
  // mismos en las dos apps (Apariencia, Sincronización, Seguridad).
  const PESTANAS = [
    ["entreno", "Entreno", "Lo que pasa mientras entrenas."],
    ["apariencia", "Apariencia", ""],
    ["sincronizacion", "Sincronización", "La copia cifrada de tus entrenos en GitHub."],
    ["seguridad", "Seguridad", "Copias de tus datos y tu cuenta de SweetSuite."],
  ];
  const ALIAS_AJUSTES = { general: "entreno", datos: "seguridad" };   // los nombres de antes
  const fila = (titulo, desc, control, clase) => `<div class="fila ${clase || ""}">
      <div class="fila-texto"><b>${titulo}</b>${desc ? `<span>${desc}</span>` : ""}</div>
      <div class="fila-control">${control}</div></div>`;
  const ICONO_OK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
  const ICONO_PIPETA = '<svg viewBox="0 0 24 24"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>';

  const SECCIONES = {
    entreno() {
      const aj = S.doc.ajustes;
      const DESCANSOS = [45, 60, 90, 120, 150, 180, 240, 300];
      return `<h2>Descanso</h2>
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
          ${fila("Token de GitHub", S.token ? "Guardado en este dispositivo, cifrado con tu cuenta." : "Sin token, tus entrenos solo están en este dispositivo.",
            `<button class="btn ${S.token ? "" : "primario"}" data-a="ajToken">${S.token ? "Cambiar token" : "Pegar token"}</button>`)}
          ${fila("Autoguardado", "Cada cambio se sube solo a GitHub unos segundos después.",
            `<input type="checkbox" class="conmutador" data-cambio="ajAuto" aria-label="Autoguardado" ${A.autoguardado() ? "checked" : ""} ${S.token ? "" : "disabled"}>`)}
          ${fila("Guardar ahora", "Sube lo que haya sin subir. También con ⌘S / Ctrl+S.",
            `<button class="btn" data-a="ajGuardar" ${S.token ? "" : "disabled"}>Guardar</button>`)}
          ${fila("Sincronizar ahora", "Trae lo de tus otros dispositivos y sube lo de este.",
            `<button class="btn" data-a="ajSincronizar" ${S.token ? "" : "disabled"}>Sincronizar</button>`)}
        </div>
        ${IR.github.DEV ? '<p class="nota">Entorno de desarrollo: GitHub es el servidor local, con datos de prueba.</p>' : ""}`;
    },

    seguridad() {
      return `<h2>Copia de seguridad</h2>
        <div class="tarjeta filas">
          ${fila("Descargar copia", "Un archivo JSON <b>sin cifrar</b> con todos tus datos. Guárdalo en un sitio seguro.", '<button class="btn" data-a="ajExportar">Descargar</button>')}
          ${fila("Importar copia", "Se mezcla con lo que ya tienes, sin borrar nada.",
            '<label class="btn">Importar<input type="file" accept="application/json,.json" data-cambio="ajImportar" hidden></label>')}
        </div>
        <h2>Tu cuenta</h2>
        <div class="tarjeta filas">
          ${fila("Contraseña y clave de recuperación", "Son las de tu cuenta de SweetSuite, para todas tus apps.", '<button class="btn" data-a="irCuenta">Abrir</button>')}
          ${fila("Bloquear", "Vuelve a la entrada de SweetSuite. Antes se sube lo pendiente.", '<button class="btn" data-a="bloquear">Bloquear</button>')}
        </div>`;
    },
  };

  IR.vistas.ajustes = {
    html(pestana) {
      const pedida = ALIAS_AJUSTES[pestana] || pestana;
      const p = SECCIONES[pedida] ? pedida : "entreno";
      const [, nombre, desc] = PESTANAS.find((x) => x[0] === p);
      return `<section class="cabeza"><h1>Ajustes</h1><p>Todo lo tuyo se guarda cifrado con tu cuenta de SweetSuite.</p></section>
        <div class="aj-layout">
          <nav class="aj-nav" aria-label="Secciones de Ajustes">${PESTANAS.map(([id, n]) =>
            `<a href="#ajustes/${id}" class="aj-tab ${id === p ? "activo" : ""}">${n}</a>`).join("")}</nav>
          <div class="aj-body"><h3>${nombre}</h3>${desc ? `<p>${desc}</p>` : ""}${SECCIONES[p]()}</div>
        </div>
        <p class="version-pie">Ironrack ${VERSION}</p>`;
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
    ajAuto: (el) => { A.ponerAutoguardado(el.checked); IR.ui.aviso(el.checked ? "Autoguardado encendido" : "Autoguardado apagado: sube con Guardar o ⌘S"); render(true); },
    ajGuardar: () => guardarAhora(),
    irCuenta: () => IR.suite.cuenta(),
    volverSuite: () => { cerrarLateral(); IR.suite.volver(); },
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
          if (IR.suite.tokenGuardado) IR.suite.tokenGuardado("ironrack");    // ¿cuándo caduca?
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
    ajSalir: () => bloquear(),
    bloquear: () => bloquear(),
    irSincronizacion: () => { if (A.pendiente() && S.token) guardarAhora(); else location.hash = "#ajustes/sincronizacion"; },
    abrirLateral: () => abrirLateral(),
    cerrarLateral: () => cerrarLateral(),
    // La cuenta de la barra lateral abre su menú, como en Solvento: Ajustes,
    // entrar con otra cuenta y Bloquear.
    menuCuenta() {
      cerrarLateral();
      IR.ui.menu(S.nombre || S.usuario, [
        { texto: "Ajustes de Ironrack", fn: () => { location.hash = "#ajustes"; } },
        { texto: "Volver a SweetSuite", fn: () => IR.suite.volver() },
        { texto: "Bloquear", fn: () => bloquear() },
        { texto: "Cerrar sesión", fn: () => { cerrarLateral(); IR.suite.cerrarSesion(); } },
      ]);
    },
    // En el ordenador filtra según se escribe; en el móvil, al pulsar Intro,
    // para que el cajón no se cierre con la primera letra.
    buscarLateral(el) { if (escritorio()) IR.ejercicios.buscar(el.value.trim()); },
  });

  // Bloquear: SweetSuite sube lo pendiente de cada app y vuelve a su entrada
  function bloquear() {
    cerrarLateral();
    IR.suite.bloquear();
  }

  // Guardar ya (⌘S, el botón y el estado del pie)
  async function guardarAhora() {
    if (!S.token) { IR.ui.aviso("Para subir a GitHub hace falta el token: pégalo en Ajustes"); location.hash = "#ajustes/sincronizacion"; return; }
    if (!A.pendiente()) { IR.ui.aviso("No hay nada que subir: GitHub ya tiene lo último"); return; }
    const e = await A.subirAhora();
    IR.ui.aviso(e === "ok" ? "Guardado en GitHub" : textoEstado());
  }
  document.addEventListener("keydown", (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && String(ev.key).toLowerCase() === "s") {
      ev.preventDefault();
      if (S.doc) guardarAhora();
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" || ev.target.id !== "buscar-lateral") return;
    IR.ejercicios.buscar(ev.target.value.trim());
    cerrarLateral();
  });

  function ayudaToken() {
    return `<details class="ayuda"><summary>¿Qué token?</summary>
      <p>Uno <b>fine-grained</b> de GitHub (Settings → Developer settings → Personal access tokens → Fine-grained tokens) con acceso
      <b>solo</b> al repositorio <code>${esc(IR.github.REPO.repo)}</code> y permiso <b>Contents: Read and write</b>.
      Se guarda cifrado con tu cuenta, solo en este dispositivo.</p></details>`;
  }

  // ── Arranque desde SweetSuite ──
  // SweetSuite da el secreto de Ironrack; con él se abre lo de este
  // dispositivo y, con token, lo de GitHub.
  function pantallaError(texto) {
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#login").innerHTML = `<div class="entrada"><span class="entrada-logo">${LOGO}</span><div class="entrada-titulo">Ironrack</div>
      <div class="entrada-error">${esc(texto)}</div>
      <button type="button" class="entrada-boton" style="margin-top:20px" data-a="volverSuite">Volver a SweetSuite</button></div>`;
  }
  async function entrarEnSuite() {
    const s = await IR.suite.sesion("ironrack");
    if (!s) { pantallaError("Tu cuenta no tiene Ironrack."); return; }
    try {
      await A.entrar(s);
    } catch (e) {
      pantallaError("No se pueden abrir tus entrenos de este dispositivo: " + (e.message || e));
      return;
    }
    IR.suite.registrar("ironrack", {
      guardarAlSalir: A.guardarAlSalir,
      pendiente: () => A.pendiente(),
      alCambiarClaves: async () => { await A.refrescarClaves(); render(true); },
      llaveroCambiado: () => A.sincronizar({ forzar: true }),
    });
    arrancar();
  }

  function arrancar() {
    $("#login").hidden = true;
    $("#login").innerHTML = "";
    $("#app").hidden = false;
    const nombre = S.nombre || S.usuario;
    $("#avatar").textContent = nombre.charAt(0);
    $("#nombre-usuario").textContent = nombre;
    $("#marca-nombre").textContent = nombre;          // arriba en el móvil, como Solvento
    $("#buscar-lateral").value = "";
    if (!location.hash) history.replaceState(null, "", "#entrenar");
    render(true);
    pintarEstado();
  }

  const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="20" width="7" height="24" rx="2"/><rect x="14" y="14" width="8" height="36" rx="2"/><rect x="42" y="14" width="8" height="36" rx="2"/><rect x="51" y="20" width="7" height="24" rx="2"/><rect x="22" y="29" width="20" height="6" rx="1"/></svg>`;

  function iniciar() {
    if (!IR.suite) return;                 // fuera de SweetSuite: suite-puente.js ya se va
    $("#marca").insertAdjacentHTML("afterbegin", LOGO);
    $("#marca-lateral").insertAdjacentHTML("afterbegin", LOGO);
    // La barra lateral del ordenador lleva los mismos enlaces que las pestañas del móvil
    $("#nav-lateral").innerHTML = [...document.querySelectorAll(".tabs a")].map((a) => a.outerHTML).join("");
    $("#version").textContent = VERSION;
    IR.cripto.borrarSesionesAntiguas();
    entrarEnSuite();
  }

  IR.app = { render, pintarEstado, textoEstado, VERSION };
  iniciar();
})();

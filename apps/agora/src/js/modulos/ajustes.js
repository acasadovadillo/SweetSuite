/*
 * Agora — Módulo «Ajustes»: mi cuenta, apariencia, sincronización, seguridad y privacidad.
 *
 * Con la estructura de los Ajustes de Ironrack y Solvento: la lista de
 * secciones a la izquierda y la tarjeta de la elegida a la derecha, en filas.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc;

  // Las secciones de Ajustes, como en Ironrack y Solvento: una lista a la
  // izquierda y, a la derecha, la tarjeta de la elegida (#/ajustes/apariencia).
  var SECCIONES = [
    { id: "cuenta", titulo: "Mi cuenta", sub: "Con quién has entrado y qué puedes modificar." },
    { id: "apariencia", titulo: "Apariencia", sub: "El tema de este ordenador y tu color de acento." },
    { id: "sincronizacion", titulo: "Sincronización", sub: "La copia cifrada de la asociación en GitHub, la que comparte la junta." },
    { id: "seguridad", titulo: "Seguridad", sub: "Tu cuenta de SweetSuite: contraseña, clave de recuperación y bloqueo." },
    { id: "privacidad", titulo: "Privacidad", sub: "Dónde están los datos y buenas prácticas con los de los socios." },
    { id: "acerca", titulo: "Acerca de", sub: "La versión y la autoría de la aplicación." },
  ];
  var MARCA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  function fila(titulo, texto, control, clase) {
    return '<div class="fila' + (clase ? " " + clase : "") + '"><div class="fila-texto"><b>' + titulo + "</b>" + (texto ? "<span>" + texto + "</span>" : "") +
      '</div><div class="fila-control">' + control + "</div></div>";
  }

  function cuenta(u) {
    var edita = !u ? "" : u.rol === "admin" || u.permisos.length === WA.Permisos.IDS.length ? "Todas las secciones"
      : u.permisos.length ? u.permisos.map(WA.Permisos.nombreSeccion).join(", ") : "Ninguna (solo ver)";
    return (u ? '<div class="filas">' +
      fila(esc(u.nombre), esc(u.cargo), '<span class="avatar" aria-hidden="true" style="width:28px;height:28px;font-size:11px">' + esc(WA.App.iniciales(u.nombre)) + "</span>") +
      fila("Puedes modificar", esc(edita) + ". El resto lo ves sin cambiarlo.", "", "apilar") +
      fila("Tu cargo", "Lo pone la Administración de SweetSuite. Si cambia, pídeselo.", "", "apilar") +
      "</div>" : "");
  }

  function apariencia(tema, acento) {
    var radio = function (valor, texto) {
      return '<label class="opcion"><input type="radio" name="tema" value="' + valor + '"' + (tema === valor ? " checked" : "") + "><span>" + texto + "</span></label>";
    };
    var propio = acento && !WA.Tema.ACENTOS.some(function (x) { return x.color === acento; });
    var muestra = function (color, nombre, elegida) {
      return '<button type="button" class="muestra' + (elegida ? " elegida" : "") + '" style="--c:' + (color || "var(--abies)") + '" data-acento="' + (color || "") +
        '" aria-pressed="' + elegida + '" title="' + nombre + '" aria-label="' + nombre + '">' + (elegida ? MARCA : "") + "</button>";
    };
    return "<h3>Tema</h3>" +
      '<div class="filas">' + fila("Tema", "Es de este ordenador: cada uno elige el suyo.",
        '<fieldset class="grupo-opciones segmentado"><legend class="sr">Tema</legend>' + radio("auto", "Sistema") + radio("claro", "Claro") + radio("oscuro", "Oscuro") + "</fieldset>", "apilar") + "</div>" +
      "<h3>Color de acento</h3>" +
      '<div class="filas"><div class="muestras" role="group" aria-label="Color de acento">' +
      muestra("", "ABIES (el de siempre)", !acento) +
      WA.Tema.ACENTOS.map(function (x) { return muestra(x.color, x.nombre, x.color === acento); }).join("") +
      '<label class="muestra' + (propio ? " elegida" : "") + '" style="--c:' + (propio ? acento : "conic-gradient(#ff5c5c, #f6b94b, #50c99c, #599cf3, #a78bf7, #ff5c5c)") + '" title="Otro color">' +
      (propio ? MARCA : "") + '<input type="color" id="a-acento-propio" value="' + (propio ? acento : "#3fb0a0") + '" aria-label="Otro color"></label>' +
      "</div></div>" +
      '<p class="campo-ayuda">El acento es tuyo: va con tu usuario en los datos cifrados. La pantalla de acceso sale siempre en el verde de ABIES.</p>';
  }

  function sincronizacion() {
    var N = WA.Nube, G = WA.GitHub, hay = N.token;
    return '<div class="filas">' +
      fila("Estado", esc(N.textoEstado()), "", "apilar") +
      fila("Archivo", "Repositorio privado. GitHub solo ve texto cifrado; los adjuntos van aparte, en <code>adjuntos/</code>.",
        "<code>" + esc(N.archivo) + "</code>", "apilar") +
      fila("Token de GitHub", hay ? "Guardado en este dispositivo, cifrado con la cuenta. Es solo tuyo: cada representante usa el suyo."
          : "Sin token, lo que hagas solo está en este dispositivo y la junta no lo ve.",
        '<button type="button" class="btn ' + (hay ? "btn-secundario" : "btn-primario") + '" id="a-token">' + (hay ? "Cambiar token" : "Pegar token") + "</button>") +
      fila("Autoguardado", "Cada cambio se sube solo a GitHub unos segundos después.",
        '<input type="checkbox" class="conmutador" id="a-auto" aria-label="Autoguardado"' + (N.autoguardado() ? " checked" : "") + (hay ? "" : " disabled") + ">") +
      fila("Guardar ahora", "Sube lo que haya sin subir. También con ⌘S / Ctrl+S o pulsando el estado de abajo.",
        '<button type="button" class="btn btn-secundario" id="a-guardar"' + (hay ? "" : " disabled") + ">Guardar</button>") +
      fila("Sincronizar ahora", "Trae lo que haya guardado el resto de la junta y sube lo de aquí.",
        '<button type="button" class="btn btn-secundario" id="a-sincronizar"' + (hay ? "" : " disabled") + ">Sincronizar</button>") +
      "</div>" +
      (G.DEV ? '<p class="campo-ayuda">Entorno de desarrollo: GitHub es el servidor local, con datos de prueba (token «dev»).</p>' : "");
  }

  function ayudaToken() {
    return '<details class="ayuda"><summary>¿Qué token?</summary><p>Uno <b>fine-grained</b> de GitHub (Settings → Developer settings → ' +
      "Personal access tokens → Fine-grained tokens), con acceso <b>solo</b> al repositorio <code>" + esc(WA.GitHub.REPO.repo) +
      "</code> y permiso <b>Contents: Read and write</b>. Ponle de nombre, por ejemplo, <code>ABIES-Tunombre-Agora</code>. " +
      "Se guarda cifrado, solo en este dispositivo.</p></details>";
  }

  function pegarToken() {
    var d = null, conectado = false;
    return UI.dialogo({
      titulo: "Token de GitHub",
      contenido: "<p>Para guardar la asociación, cifrada, en <code>" + esc(WA.GitHub.REPO.repo) + "</code> y compartirla con el resto de la junta.</p>" +
        ayudaToken() +
        '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "token", etiqueta: "Token", valor: "", requerido: true, ancho: "completo" }) +
        "</div></form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }],
      alAbrir: function (dlg) {
        d = dlg;
        var i = d.querySelector('[name="token"]');
        if (i) { i.setAttribute("autocomplete", "off"); i.setAttribute("autocapitalize", "off"); i.setAttribute("spellcheck", "false"); i.placeholder = "github_pat_…"; }
      },
      // Se comprueba el token antes de cerrar: si no vale, se dice y se queda abierta
      validar: function (form) {
        var btn = d.querySelector('[data-valor="enviar"]');
        btn.disabled = true;
        UI.marcarError(form, "token", "");
        WA.Nube.cambiarToken(form.elements.token.value).then(function () {
          conectado = true;
          d.querySelector('.dialogo-botones [data-valor="cancelar"]').click();
        }).catch(function (e) {
          UI.marcarError(form, "token", e.message || String(e));
          btn.disabled = false;
        });
        return false;
      },
    }).then(function () { return conectado; });
  }

  function seguridad() {
    return '<div class="filas">' +
      fila("Contraseña y clave de recuperación", "Son las de tu cuenta de SweetSuite, para todas tus apps.",
        '<button type="button" class="btn btn-secundario" id="a-cuenta">Abrir</button>') +
      fila("Bloquear", "Vuelve a la entrada de SweetSuite. También se bloquea sola tras un rato sin usarla (lo eliges en tu cuenta).",
        '<button type="button" class="btn btn-secundario" id="a-bloquear">Bloquear</button>') +
      "</div>";
  }

  function privacidad() {
    return "<p>Agora <strong>no envía nada a ningún servidor</strong>: ni nube, ni analítica. Los datos están cifrados con la cuenta de ABIES en SweetSuite, y sin ella no se pueden leer.</p>" +
      "<p>Aun así, la asociación es responsable de los datos personales de sus socios. Algunas buenas prácticas:</p><ul class=\"lista\">" +
      "<li>Cada miembro de la junta, con su propia cuenta de representante: así queda registrado quién hace cada cambio. Cuando alguien deja la junta, pide a la Administración que le dé de baja.</li>" +
      "<li>Contraseñas largas. Nunca envíes la contraseña de ABIES por el mismo canal que la de un representante.</li>" +
      "<li>Las copias sin cifrar, bórralas en cuanto termines.</li>" +
      "<li>Recoge solo los datos que necesitas e informa a los socios de para qué se usan.</li>" +
      "<li>Cuando alguien se da de baja, revisa cuánto tiempo debes conservar sus datos.</li>" +
      "</ul>" +
      '<p class="detalle">Estas recomendaciones son orientativas y no son asesoramiento legal. Las obligaciones concretas del RGPD y de la LOPDGDD para tu asociación (registro de actividades de tratamiento, información a los socios, plazos de conservación) conviene verificarlas con asesoría o con la guía de la Agencia Española de Protección de Datos.</p>';
  }

  function acerca() {
    return '<div class="filas">' + fila("Agora", "© 2026 Alberto Casado Vadillo. Todos los derechos reservados.",
      '<code id="a-version">' + esc(raiz.WA_VERSION || "desarrollo") + "</code>") + "</div>";
  }

  async function pintar(cont, datos, ruta) {
    var sec = SECCIONES.find(function (x) { return x.id === (ruta && ruta[0]); }) || SECCIONES[0];
    var u = WA.Sesion.usuario;
    var cuerpo = sec.id === "cuenta" ? cuenta(u)
      : sec.id === "apariencia" ? apariencia(WA.Tema.actual(), await WA.App.acentoGuardado())
      : sec.id === "sincronizacion" ? sincronizacion()
      : sec.id === "seguridad" ? seguridad()
      : sec.id === "privacidad" ? privacidad() : acerca();
    cont.innerHTML =
      '<h1>Ajustes</h1><p class="intro">Tu cargo, cómo se ve Agora y tu cuenta de SweetSuite.</p>' +
      '<div class="aj-layout"><nav class="aj-nav" aria-label="Secciones de Ajustes">' +
      SECCIONES.map(function (x) {
        return '<a class="aj-tab" href="#/ajustes/' + x.id + '"' + (x === sec ? ' aria-current="page"' : "") + ">" + x.titulo + "</a>";
      }).join("") + "</nav>" +
      '<section class="aj-body" aria-labelledby="aj-titulo"><h2 id="aj-titulo">' + sec.titulo + "</h2><p>" + sec.sub + "</p>" + cuerpo + "</section></div>" +
      '<p class="version-pie">Agora ' + esc(raiz.WA_VERSION || "desarrollo") + "</p>";

    // En el móvil las secciones son una fila que se desliza: que se vea la elegida
    var activa = cont.querySelector(".aj-tab[aria-current]");
    if (activa && activa.scrollIntoView && window.matchMedia("(max-width: 720px)").matches) activa.scrollIntoView({ block: "nearest", inline: "center" });

    cont.querySelectorAll('input[name="tema"]').forEach(function (r) {
      r.addEventListener("change", function () { WA.Tema.poner(r.value); });
    });
    var elegir = async function (color) {
      try {
        await WA.App.ponerAcento(color);
        await WA.App.repintar();
        UI.aviso("Color de acento guardado.");
      } catch (e) { UI.aviso(e.message, "error"); }
    };
    cont.querySelectorAll("button[data-acento]").forEach(function (b) {
      b.addEventListener("click", function () { elegir(b.getAttribute("data-acento")); });
    });
    var propio = cont.querySelector("#a-acento-propio");
    if (propio) propio.addEventListener("change", function () { elegir(propio.value); });
    var bt = cont.querySelector("#a-token"), ba = cont.querySelector("#a-auto");
    var bg = cont.querySelector("#a-guardar"), bs = cont.querySelector("#a-sincronizar");
    if (bt) bt.addEventListener("click", async function () {
      if (!(await pegarToken())) return;
      UI.aviso(WA.Nube.estado === "ok" ? "Conectado con GitHub." : "Token guardado.");
      await WA.App.repintar();
      if (WA.Suite.tokenGuardado) WA.Suite.tokenGuardado("agora");   // ¿cuándo caduca?
    });
    if (ba) ba.addEventListener("change", function () {
      WA.Nube.ponerAutoguardado(ba.checked);
      UI.aviso(ba.checked ? "Autoguardado encendido." : "Autoguardado apagado: sube con Guardar o ⌘S.");
    });
    if (bg) bg.addEventListener("click", function () { WA.App.guardarAhora().then(function () { return WA.App.repintar(); }); });
    if (bs) bs.addEventListener("click", async function () {
      bs.disabled = true;
      await WA.Nube.sincronizar({ forzar: true });
      UI.aviso(WA.Nube.estado === "ok" ? "Al día con GitHub." : WA.Nube.textoEstado(), WA.Nube.estado === "ok" ? "" : "error");
      await WA.App.repintar();
    });
    var bc = cont.querySelector("#a-cuenta"), bb = cont.querySelector("#a-bloquear");
    if (bc) bc.addEventListener("click", function () { WA.Suite.cuenta(); });
    if (bb) bb.addEventListener("click", function () { WA.Suite.bloquear(); });
  }

  WA.App.registrar({
    id: "ajustes", titulo: "Ajustes", orden: 100, pintar: pintar,
    icono: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  });
})(typeof self !== "undefined" ? self : this);

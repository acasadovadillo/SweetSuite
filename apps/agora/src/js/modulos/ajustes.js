/*
 * Agora — Módulo «Ajustes»: mi cuenta, apariencia, seguridad y privacidad.
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
    var bc = cont.querySelector("#a-cuenta"), bb = cont.querySelector("#a-bloquear");
    if (bc) bc.addEventListener("click", function () { WA.Suite.cuenta(); });
    if (bb) bb.addEventListener("click", function () { WA.Suite.bloquear(); });
  }

  WA.App.registrar({
    id: "ajustes", titulo: "Ajustes", orden: 100, pintar: pintar,
    icono: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  });
})(typeof self !== "undefined" ? self : this);

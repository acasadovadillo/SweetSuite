/*
 * webkit_asociaciones — Esqueleto de la aplicación: módulos, navegación y avisos.
 *
 * CÓMO SE AÑADE UN MÓDULO (p. ej. «Socios» en la Fase 2):
 *   1. Crea src/js/modulos/socios.js
 *   2. Dentro, llama a:
 *        WA.App.registrar({
 *          id: "socios",                 // aparece en la dirección: #/socios
 *          titulo: "Socios",             // texto del menú y título de la página
 *          icono: "<path d=…/>",          // trazos SVG de 24×24 (opcional)
 *          orden: 20,                    // posición en el menú
 *          pintar: async function (contenedor, datos, ruta) { … }
 *            // datos = WA.Sesion.datos · ruta = lo que va detrás: #/socios/ficha/7 → ["ficha", "7"]
 *        });
 *   3. Añade su <script> en src/index.html (antes de arranque.js).
 *
 * La navegación usa el «#» de la dirección (#/inicio, #/asociacion…) porque
 * funciona abriendo el archivo directamente, sin servidor.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA;
  var modulos = [];
  var actual = null;
  var temporizadorBloqueo = null;

  var $ = function (id) { return document.getElementById(id); };

  function registrar(m) {
    modulos.push(m);
    modulos.sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
  }

  function partesRuta() {
    return (location.hash || "").replace(/^#\/?/, "").split("/").map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
  }
  function rutaActual() {
    var id = partesRuta()[0];
    return modulos.some(function (m) { return m.id === id; }) ? id : "inicio";
  }

  function pintarMenu() {
    var lista = $("menu-lista");
    lista.innerHTML = modulos.filter(function (m) { return !m.oculto; }).map(function (m) {
      return '<li><a href="#/' + m.id + '" data-modulo="' + m.id + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (m.icono || "") + "</svg>" +
        "<span>" + WA.UI.esc(m.titulo) + "</span></a></li>";
    }).join("");
  }

  /** Pinta el módulo de la dirección actual. */
  async function navegar(opciones) {
    if (WA.Sesion.modo === "cerrada") return;
    var id = rutaActual();
    var m = modulos.find(function (x) { return x.id === id; });
    actual = id;
    Array.prototype.forEach.call(document.querySelectorAll("#menu-lista a"), function (a) {
      if (a.getAttribute("data-modulo") === id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    cerrarMenuMovil();
    var principal = $("principal");
    principal.innerHTML = '<p class="cargando">Cargando…</p>';
    try {
      principal.innerHTML = "";
      await m.pintar(principal, WA.Sesion.datos, partesRuta().slice(1).filter(Boolean));
    } catch (e) {
      console.error(e);
      principal.innerHTML = '<div class="tarjeta tarjeta-error"><h1>Algo ha fallado</h1><p>' + WA.UI.esc(e.message) +
        "</p><p>Tus datos no se han tocado. Si vuelve a pasar, descarga una copia de seguridad y avisa en el repositorio del proyecto.</p></div>";
    }
    document.title = m.titulo + " · webkit_asociaciones";
    // Para lectores de pantalla: el foco va al título de la página nueva.
    if (!opciones || opciones.foco !== false) {
      var h1 = principal.querySelector("h1");
      if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
    }
    window.scrollTo(0, 0);
  }

  /** Vuelve a pintar la página actual (tras guardar algo) sin mover el foco. */
  function repintar() { return navegar({ foco: false }); }

  // ── Menú en el móvil ──────────────────────────────────────────────────────
  function abrirMenuMovil() {
    document.body.classList.add("menu-abierto");
    $("btn-menu").setAttribute("aria-expanded", "true");
    var primero = document.querySelector("#menu-lista a");
    if (primero) primero.focus();
  }
  function cerrarMenuMovil() {
    document.body.classList.remove("menu-abierto");
    var b = $("btn-menu");
    if (b) b.setAttribute("aria-expanded", "false");
  }

  // ── Franjas de aviso (demostración / copia de seguridad) ─────────────────
  async function actualizarFranjas() {
    var demo = WA.Sesion.modo === "demostración";
    $("franja-demo").hidden = !demo;
    var franja = $("franja-copia");
    if (demo || WA.Sesion.modo !== "abierta") { franja.hidden = true; return; }
    var e = await WA.Sesion.datos.estadoCopia();
    var texto = "";
    if (!e.ultimaCopia && e.cambiosDesdeCopia > 0) texto = "Todavía no has hecho ninguna copia de seguridad.";
    else if (e.cambiosDesdeCopia > 0) {
      var dias = WA.Fechas.diasEntre(e.ultimaCopia.slice(0, 10), WA.Fechas.hoy());
      texto = "Hay cambios sin copia de seguridad" + (dias > 0 ? " (la última es de hace " + dias + (dias === 1 ? " día)." : " días).") : ".");
    }
    $("franja-copia-texto").textContent = texto;
    franja.hidden = !texto;
  }

  // ── Bloqueo por inactividad ──────────────────────────────────────────────
  function reiniciarBloqueo() {
    clearTimeout(temporizadorBloqueo);
    var min = WA.Preferencias.leer().bloqueoMinutos;
    if (WA.Sesion.modo !== "abierta" || !(min > 0)) return;
    temporizadorBloqueo = setTimeout(function () {
      WA.Sesion.bloquear().then(function () { WA.UI.aviso("Se ha bloqueado por inactividad. Tus datos siguen guardados.", "info"); });
    }, min * 60000);
  }

  // ── Cerrar sesión (y, si está activado, borrar los datos de este navegador) ──
  async function cerrarSesion() {
    if (WA.Sesion.modo === "demostración") { await WA.Sesion.bloquear(); return; }
    var borrar = WA.Preferencias.leer().borrarAlSalir;
    if (!borrar) { await WA.Sesion.bloquear(); return; }
    var e = await WA.Sesion.datos.estadoCopia();
    if (e.cambiosDesdeCopia > 0) {
      var r = await WA.UI.dialogo({
        titulo: "Hay cambios sin copia de seguridad",
        contenido: "<p>Este navegador está configurado para <strong>borrar los datos al cerrar la sesión</strong>. " +
          "Si sales sin descargar una copia, perderás los cambios desde la última.</p>",
        botones: [
          { texto: "Cancelar", valor: "cancelar" },
          { texto: "Salir sin copia", valor: "sin", estilo: "btn-peligro" },
          { texto: "Descargar copia y salir", valor: "copia", estilo: "btn-primario" },
        ],
      });
      if (r.valor === "cancelar") return;
      if (r.valor === "copia") await WA.Copias.descargar(true);
    }
    await WA.Sesion.borrarDelNavegador();
    await WA.Sesion.bloquear();
    WA.UI.aviso("Sesión cerrada y datos borrados de este navegador.", "info");
  }

  function iniciar() {
    pintarMenu();
    window.addEventListener("hashchange", function () { navegar(); });
    $("btn-menu").addEventListener("click", function () {
      if (document.body.classList.contains("menu-abierto")) cerrarMenuMovil(); else abrirMenuMovil();
    });
    $("velo-menu").addEventListener("click", cerrarMenuMovil);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("menu-abierto")) { cerrarMenuMovil(); $("btn-menu").focus(); }
    });
    $("btn-bloquear").addEventListener("click", function () { WA.Sesion.bloquear(); });
    $("btn-cerrar-sesion").addEventListener("click", cerrarSesion);
    $("btn-franja-copia").addEventListener("click", function () { WA.Copias.descargar(true); });
    $("btn-salir-demo").addEventListener("click", function () { WA.Sesion.bloquear(); });
    ["click", "keydown", "pointermove", "scroll"].forEach(function (ev) {
      document.addEventListener(ev, reiniciarBloqueo, { passive: true });
    });
    window.addEventListener("beforeunload", function (e) {
      if (WA.Sesion.hayGuardadosPendientes()) { e.preventDefault(); e.returnValue = ""; }
    });

    var modoAnterior = null;
    WA.Sesion.alCambiar(function (modo) {
      var cambioDeModo = modo !== modoAnterior;
      modoAnterior = modo;
      actualizarFranjas();
      if (!cambioDeModo) return;
      var abierta = modo !== "cerrada";
      $("app").hidden = !abierta;
      $("acceso").hidden = abierta;
      $("btn-bloquear").hidden = modo !== "abierta";
      if (abierta) { reiniciarBloqueo(); navegar(); }
      else { $("principal").innerHTML = ""; WA.Acceso.mostrar(); }
    });
  }

  WA.App = { registrar: registrar, iniciar: iniciar, navegar: navegar, repintar: repintar, actualizarFranjas: actualizarFranjas, reiniciarBloqueo: reiniciarBloqueo };
})(typeof self !== "undefined" ? self : this);

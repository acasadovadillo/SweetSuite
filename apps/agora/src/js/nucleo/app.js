/*
 * Agora — Esqueleto de la aplicación: módulos, navegación, permisos y avisos.
 *
 * CÓMO SE AÑADE UN MÓDULO (p. ej. «Socios» en la Fase 2):
 *   1. Crea src/js/modulos/socios.js
 *   2. Dentro, llama a:
 *        WA.App.registrar({
 *          id: "socios",                 // aparece en la dirección: #/socios
 *          titulo: "Socios",             // texto del menú y título de la página
 *          icono: "<path d=…/>",          // trazos SVG de 24×24 (opcional)
 *          orden: 20,                    // posición en el menú
 *          soloAdmin: true,              // (opcional) solo lo ve la cuenta de administración
 *          pintar: async function (contenedor, datos, ruta) { … }
 *            // datos = WA.Sesion.datos · ruta = lo que va detrás: #/socios/ficha/7 → ["ficha", "7"]
 *        });
 *   3. Añade su <script> en src/index.html (antes de arranque.js).
 *
 * La navegación usa el «#» de la dirección (#/inicio, #/asociacion…) porque
 * funciona abriendo el archivo directamente, sin servidor.
 *
 * La estructura es la de Ironrack y Solvento: barra lateral con la cuenta, un
 * buscador y las secciones por grupos (GRUPOS); en el teléfono, cinco de ellas
 * abajo (BARRA_MOVIL). Un módulo que no esté en ningún grupo sale en «Más».
 *
 * Agora vive dentro de SweetSuite (suite-puente.js): la entrada, el bloqueo por
 * inactividad y cerrar la sesión son de SweetSuite. Al final de la barra lateral
 * está su apartado: el inicio y las demás apps de la cuenta.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA;
  var modulos = [];
  var actual = null;

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
    return visibles().some(function (m) { return m.id === id; }) ? id : "inicio";
  }
  /** El módulo abierto ahora (lo usa el repositorio para saber qué permiso pedir). */
  function moduloActual() { return actual || rutaActual(); }

  /** Módulos que ve quien ha entrado: «Usuarios» y similares, solo la administración. */
  function visibles() {
    return modulos.filter(function (m) { return !m.oculto && (!m.soloAdmin || WA.Sesion.esAdmin); });
  }

  var GRUPOS = [
    { titulo: "", ids: ["inicio"] },
    { titulo: "Gente", ids: ["asociacion", "socios", "cuotas", "actividades"] },
    { titulo: "Dinero", ids: ["tesoreria", "facturas", "iva", "proyectos"] },
    { titulo: "Gobierno", ids: ["actas", "obligaciones", "documentos", "informes"] },
    { titulo: "Cuenta", ids: ["usuarios", "registro", "copias", "ajustes"] },
  ];
  var BARRA_MOVIL = { inicio: "Inicio", socios: "Socios", cuotas: "Cuotas", tesoreria: "Tesorería", actividades: "Actividades" };
  var svg = function (trazos, clase) {
    return '<svg' + (clase ? ' class="' + clase + '"' : "") + ' viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + trazos + "</svg>";
  };
  var I_BLOQUEAR = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
  var I_SALIR = '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>';
  var I_SUITE = '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>';
  // Los iconos de las demás apps, los mismos que en SweetSuite
  var I_APPS = {
    solvento: '<circle cx="9" cy="9" r="5.5"/><path d="M14.6 9.6a5.5 5.5 0 1 1-5 6.8"/><path d="M9 6.8v4.4M7.2 9h3.6"/>',
    ironrack: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  };
  var I_AJUSTES = '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>';

  var CANDADO = '<svg class="menu-candado" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  function enlace(m) {
    var lectura = WA.Sesion.modo !== "cerrada" && !WA.Sesion.puedeEditar(m.id);
    return '<li><a href="#/' + m.id + '" data-modulo="' + m.id + '"' + (lectura ? ' title="Solo lectura para tu cargo"' : "") + ">" +
      svg(m.icono || "") + "<span>" + WA.UI.esc(m.titulo) + "</span>" + (lectura ? CANDADO + '<span class="sr"> (solo lectura)</span>' : "") + "</a></li>";
  }
  function pintarMenu() {
    var vis = visibles(), puestos = {};
    var grupos = GRUPOS.map(function (g) {
      var ms = vis.filter(function (m) { return g.ids.indexOf(m.id) >= 0; });
      ms.forEach(function (m) { puestos[m.id] = true; });
      return { titulo: g.titulo, ms: ms };
    });
    var sueltos = vis.filter(function (m) { return !puestos[m.id]; });
    if (sueltos.length) grupos.splice(grupos.length - 1, 0, { titulo: "Más", ms: sueltos });
    var cuenta = grupos[grupos.length - 1];
    $("menu-lista").innerHTML = grupos.map(function (g) {
      var html = g.ms.map(enlace).join("");
      if (g === cuenta && WA.Sesion.modo !== "cerrada") {
        html += '<li><button type="button" class="menu-boton" data-accion="bloquear">' + svg(I_BLOQUEAR) + "<span>Bloquear</span></button></li>";
        html += '<li><button type="button" class="menu-boton" data-accion="salir">' + svg(I_SALIR) + "<span>Cerrar sesión</span></button></li>";
      }
      if (!html) return "";
      return (g.titulo ? '<li class="menu-grupo" aria-hidden="true">' + WA.UI.esc(g.titulo) + "</li>" : "") + html;
    }).join("") + menuSuite();
    $("barra-movil").innerHTML = vis.filter(function (m) { return BARRA_MOVIL[m.id]; }).map(function (m) {
      return '<a href="#/' + m.id + '" data-modulo="' + m.id + '">' + svg(m.icono || "") + "<span>" + BARRA_MOVIL[m.id] + "</span></a>";
    }).join("");
    filtrarMenu($("menu-buscar").value);
  }

  /** El apartado SweetSuite: su inicio y las demás apps de la cuenta. */
  function menuSuite() {
    var esc = WA.UI.esc;
    var boton = function (accion, icono, texto, app) {
      return '<li><button type="button" class="menu-boton" data-accion="' + accion + '"' + (app ? ' data-app="' + esc(app) + '"' : "") + ">" +
        svg(icono) + "<span>" + esc(texto) + "</span></button></li>";
    };
    return '<li class="menu-grupo" aria-hidden="true">SweetSuite</li>' + boton("suite", I_SUITE, "Inicio") +
      WA.Suite.apps().filter(function (a) { return a.id !== "agora"; }).map(function (a) {
        return boton("app", I_APPS[a.id] || I_SUITE, a.nombre, a.id);
      }).join("");
  }

  // ── Buscador de la barra lateral: filtra las secciones por su nombre ──────
  var normal = function (t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
  function filtrarMenu(texto) {
    var q = normal(texto).trim(), grupo = null, hay = false;
    Array.prototype.forEach.call($("menu-lista").children, function (li) {
      if (li.classList.contains("menu-grupo")) {
        if (grupo) grupo.hidden = !hay;
        grupo = li; hay = false; return;
      }
      var ve = !q || normal(li.textContent).indexOf(q) >= 0;
      if (q && li.querySelector("button")) ve = false;
      li.hidden = !ve;
      if (ve) hay = true;
    });
    if (grupo) grupo.hidden = !hay;
  }

  /** Pinta el módulo de la dirección actual. */
  async function navegar(opciones) {
    if (WA.Sesion.modo === "cerrada") return;
    var id = rutaActual();
    var m = modulos.find(function (x) { return x.id === id; });
    actual = id;
    Array.prototype.forEach.call(document.querySelectorAll("#menu-lista a, #barra-movil a"), function (a) {
      if (a.getAttribute("data-modulo") === id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    cerrarMenuMovil();
    var principal = $("principal");
    // Solo lectura: el cargo ve la sección pero no la modifica. El repositorio lo
    // hace cumplir; aquí se esconden los botones de modificar y se avisa.
    var lectura = !WA.Sesion.puedeEditar(id);
    document.body.classList.toggle("solo-lectura", lectura);
    principal.innerHTML = '<p class="cargando">Cargando…</p>';
    try {
      principal.innerHTML = "";
      await m.pintar(principal, WA.Sesion.datos, partesRuta().slice(1).filter(Boolean));
      if (lectura) {
        var u = WA.Sesion.usuario;
        principal.insertAdjacentHTML("afterbegin", '<p class="franja-lectura" role="note">' + CANDADO +
          "<span><strong>Solo lectura.</strong> Con el cargo de " + WA.UI.esc(u ? u.cargo : "") + " puedes ver esta sección, pero no modificarla.</span></p>");
      }
    } catch (e) {
      console.error(e);
      principal.innerHTML = '<div class="tarjeta tarjeta-error"><h1>Algo ha fallado</h1><p>' + WA.UI.esc(e.message) +
        "</p><p>Tus datos no se han tocado. Si vuelve a pasar, descarga una copia de seguridad y avisa a la cuenta de administración.</p></div>";
    }
    document.title = m.titulo + " · " + WA.Marca.NOMBRE;
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

  // ── Menú de la cuenta (el botón con el nombre, arriba en la barra lateral) ──
  function cerrarMenuCuenta() {
    var m = $("menu-cuenta-lista");
    if (m) m.remove();
    $("menu-cuenta").setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", fueraDelMenu, true);
  }
  function fueraDelMenu(e) {
    if (!e.target.closest("#menu-cuenta-lista, #menu-cuenta")) cerrarMenuCuenta();
  }
  function abrirMenuCuenta() {
    if ($("menu-cuenta-lista")) { cerrarMenuCuenta(); return; }
    var u = WA.Sesion.usuario, esc = WA.UI.esc;
    var b = $("menu-cuenta").getBoundingClientRect();
    var m = document.createElement("div");
    m.id = "menu-cuenta-lista";
    m.className = "menu-flotante";
    m.setAttribute("role", "menu");
    m.style.left = b.left + "px";
    m.style.top = b.bottom + 6 + "px";
    m.style.width = Math.max(220, b.width) + "px";
    m.innerHTML = (u ? '<div class="menu-flotante-cab"><b>' + esc(u.nombre) + "</b>" + esc(u.cargo) + "</div>" : "") +
      '<a href="#/ajustes" role="menuitem">' + svg(I_AJUSTES) + "Ajustes de Agora</a>" +
      '<button type="button" role="menuitem" data-accion="suite">' + svg(I_SUITE) + "Inicio de SweetSuite</button>" +
      '<button type="button" role="menuitem" data-accion="bloquear">' + svg(I_BLOQUEAR) + "Bloquear</button>" +
      '<button type="button" role="menuitem" data-accion="salir">' + svg(I_SALIR) + "Cerrar sesión</button>";
    document.body.appendChild(m);
    $("menu-cuenta").setAttribute("aria-expanded", "true");
    m.addEventListener("click", function (e) {
      var x = e.target.closest("a, button");
      if (!x) return;
      cerrarMenuCuenta();
      accion(x.getAttribute("data-accion"), x);
    });
    m.addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call(m.querySelectorAll("a, button")), i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
      } else if (e.key === "Escape") { cerrarMenuCuenta(); $("menu-cuenta").focus(); }
    });
    document.addEventListener("pointerdown", fueraDelMenu, true);
    m.querySelector("a").focus();
  }
  /** Bloquear, cerrar la sesión y cambiar de app: lo hace SweetSuite, que antes guarda lo pendiente. */
  function accion(a, el) {
    cerrarMenuMovil();
    if (a === "bloquear") WA.Suite.bloquear();
    else if (a === "salir") WA.Suite.cerrarSesion();
    else if (a === "suite") WA.Suite.volver();
    else if (a === "app") WA.Suite.abrir(el.getAttribute("data-app"));
  }

  // ── El acento de quien ha entrado (Ajustes › Apariencia) ─────────────────
  async function acentoGuardado() {
    var u = WA.Sesion.usuario;
    if (!u || WA.Sesion.modo === "cerrada") return "";
    var config = (await WA.Sesion.datos.leer("config")) || {};
    var c = (config.acentos || {})[u.id];
    return WA.Tema.valido(c) ? c.toLowerCase() : "";
  }
  /** Guarda el acento del usuario («» = el verde de ABIES) y lo aplica. */
  async function ponerAcento(color) {
    var u = WA.Sesion.usuario;
    if (!u) return;
    var config = (await WA.Sesion.datos.leer("config")) || {};
    config.acentos = Object.assign({}, config.acentos || {});
    if (WA.Tema.valido(color)) config.acentos[u.id] = color.toLowerCase(); else delete config.acentos[u.id];
    await WA.Sesion.datos.escribir("config", config);
    WA.Tema.acento(color);
  }

  // ── El estado del pie: dónde está guardado ──────────────────────────────
  function ponerEstado(texto, color) {
    var e = $("estado-copia");
    e.textContent = texto;
    e.style.setProperty("--punto", color);
  }
  function actualizarFranjas() {
    if (WA.Sesion.modo === "abierta") ponerEstado("En este dispositivo", "var(--aviso)");
  }

  // ── La entrada, desde SweetSuite ─────────────────────────────────────────
  function pantallaError(texto) {
    $("app").hidden = true;
    var a = $("acceso");
    a.hidden = false;
    a.innerHTML = '<main class="acceso-panel"><div class="acceso-marca">' + WA.Marca.hoja("acceso-hoja") + '<span class="acceso-producto">Agora</span></div>' +
      '<p class="acceso-error" role="alert">' + WA.UI.esc(texto) + "</p>" +
      '<div class="acceso-opciones"><button type="button" class="btn btn-primario" id="btn-volver-suite">Volver a SweetSuite</button></div></main>';
    $("btn-volver-suite").addEventListener("click", function () { WA.Suite.volver(); });
  }
  async function entrarEnSuite() {
    var SS = WA.Suite, s = await SS.sesion("agora");
    if (!s) { pantallaError("Tu cuenta no tiene Agora."); return; }
    try {
      await WA.Sesion.entrarEnSuite(s);
    } catch (e) {
      console.error(e);
      pantallaError("No se pueden abrir los datos de Agora de este dispositivo: " + (e.message || e));
      return;
    }
    SS.registrar("agora", {
      guardarAlSalir: function () {
        return WA.Sesion.esperar().then(function () { return { estado: "local", texto: "guardado en este dispositivo" }; });
      },
      pendiente: function () { return WA.Sesion.hayGuardadosPendientes(); },
      // La cuenta ha cambiado de llave (p. ej. en otro dispositivo): se vuelve a cifrar con la nueva
      alCambiarClaves: async function () {
        await WA.Sesion.esperar();
        await WA.Sesion.entrarEnSuite(await SS.sesion("agora"));
        await repintar();
      },
    });
  }

  /** Las iniciales del avatar: «María López» → «ML». */
  function iniciales(nombre) {
    var p = String(nombre || "").trim().split(/\s+/).filter(Boolean);
    return ((p[0] || "").charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : "")).toUpperCase();
  }

  function iniciar() {
    $("marca").insertAdjacentHTML("afterbegin", WA.Marca.hoja("marca-hoja") + "<span>Agora</span>");
    $("marca-movil").insertAdjacentHTML("afterbegin", WA.Marca.hoja("marca-hoja"));
    $("marca-nombre").textContent = "Agora";
    $("menu-version").textContent = raiz.WA_VERSION || "desarrollo";
    pintarMenu();
    // Si un cargo intenta modificar lo que no le toca, el repositorio lo rechaza: se avisa.
    window.addEventListener("unhandledrejection", function (e) {
      if (e.reason && e.reason.codigo === "PERMISO") { e.preventDefault(); WA.UI.aviso(e.reason.message, "error"); }
    });
    window.addEventListener("hashchange", function () { navegar(); });
    $("btn-menu").addEventListener("click", function () {
      if (document.body.classList.contains("menu-abierto")) cerrarMenuMovil(); else abrirMenuMovil();
    });
    $("velo-menu").addEventListener("click", cerrarMenuMovil);
    $("btn-cerrar-menu").addEventListener("click", function () { cerrarMenuMovil(); $("btn-menu").focus(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("menu-abierto")) { cerrarMenuMovil(); $("btn-menu").focus(); }
    });
    $("menu-cuenta").addEventListener("click", abrirMenuCuenta);
    $("menu-lista").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-accion]");
      if (b) accion(b.getAttribute("data-accion"), b);
    });
    var buscador = $("menu-buscar");
    buscador.addEventListener("input", function () { filtrarMenu(buscador.value); });
    buscador.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var a = Array.prototype.find.call($("menu-lista").querySelectorAll("li:not([hidden]) a"), function () { return true; });
        if (a) { buscador.value = ""; filtrarMenu(""); location.hash = a.getAttribute("href"); }
      } else if (e.key === "Escape") { buscador.value = ""; filtrarMenu(""); }
    });
    $("btn-apps").addEventListener("click", function () { cerrarMenuMovil(); WA.Suite.elegirApp(); });
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
      cerrarMenuCuenta();
      var u = WA.Sesion.usuario;
      $("usuario-actual").textContent = u ? WA.Sesion.firma : "";
      $("menu-cuenta").title = u ? WA.Sesion.firma : "";
      $("avatar").textContent = u ? iniciales(u.nombre) : "";
      $("menu-buscar").value = "";
      pintarMenu();
      if (abierta) {
        // El acento de la cuenta, antes de pintar la primera página
        acentoGuardado().catch(function () { return ""; }).then(function (c) {
          WA.Tema.acento(c);
          return navegar();
        });
      } else {
        WA.Tema.acento(null);
        ponerEstado("", "");
        $("principal").innerHTML = ""; document.body.classList.remove("solo-lectura");
      }
    });
  }

  WA.App = { registrar: registrar, iniciar: iniciar, entrarEnSuite: entrarEnSuite, navegar: navegar, repintar: repintar, actualizarFranjas: actualizarFranjas,
    moduloActual: moduloActual, pintarMenu: pintarMenu, ponerAcento: ponerAcento, acentoGuardado: acentoGuardado, iniciales: iniciales };
})(typeof self !== "undefined" ? self : this);

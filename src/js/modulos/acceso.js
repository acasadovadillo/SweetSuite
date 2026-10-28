/*
 * ABIES · Gestión — Pantalla de acceso.
 *
 * Situaciones:
 *   · No hay datos en este navegador → configurar por primera vez (contraseña del
 *     archivo y cuenta ABIES), recuperar una copia o ver la demostración.
 *   · Hay datos de ABIES → entrar con nombre, cargo, contraseña personal y
 *     contraseña del archivo.
 *   · Hay datos de antes de los usuarios (una sola contraseña) → convertirlos.
 *   · Se ha olvidado la contraseña personal → la cuenta ABIES pone una nueva.
 *     Si se pierde la del archivo, no hay forma de recuperar lo cifrado.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, esc = WA.UI.esc;
  var MINIMO = 8;
  var $ = function (id) { return document.getElementById(id); };

  function pintar(html) {
    $("acceso").innerHTML = '<main class="acceso-panel" id="acceso-principal">' +
      '<div class="acceso-marca">' + WA.Marca.logo("acceso-logo", "ABIES") + '<span class="acceso-producto">Gestión</span></div>' + html + "</main>";
    var primero = $("acceso").querySelector("input:not([type=hidden]), button");
    if (primero) primero.focus();
  }

  function error(id, texto) {
    var el = $(id);
    el.textContent = texto || "";
    el.hidden = !texto;
  }

  /** Bloquea el botón mientras se cifra (tarda un segundo) para que no se pulse dos veces. */
  async function ocupado(boton, texto, tarea) {
    var antes = boton.textContent;
    boton.disabled = true;
    boton.textContent = texto;
    try { return await tarea(); }
    finally { boton.disabled = false; boton.textContent = antes; }
  }

  function campo(id, etiqueta, tipo, extra) {
    return '<label for="' + id + '">' + etiqueta + "</label>" +
      '<input id="' + id + '" type="' + (tipo || "text") + '"' + (extra || "") + ">";
  }
  function dosContrasenas(prefijo, etiqueta, ayuda) {
    return campo(prefijo + "-1", etiqueta, "password", ' autocomplete="new-password" required aria-describedby="' + prefijo + '-ayuda"') +
      '<p class="campo-ayuda" id="' + prefijo + '-ayuda">' + ayuda + "</p>" +
      campo(prefijo + "-2", "Repítela", "password", ' autocomplete="new-password" required');
  }
  function leerDos(prefijo, idError, que) {
    var a = $(prefijo + "-1").value, b = $(prefijo + "-2").value;
    if (a.length < MINIMO) { error(idError, que + " necesita al menos " + MINIMO + " caracteres."); return null; }
    if (a !== b) { error(idError, "Las dos veces que has escrito " + que.toLowerCase() + " no coinciden."); return null; }
    return a;
  }

  /** Los cuatro campos para entrar (o para abrir una copia). */
  function camposEntrar(p) {
    var u = WA.Sesion.ultimo || {};
    return '<div class="acceso-pareja">' +
      '<div>' + campo(p + "-nombre", "Nombre", "text", ' autocomplete="username" autocapitalize="words" spellcheck="false" required value="' + esc(u.nombre || "") + '"') + "</div>" +
      '<div>' + campo(p + "-cargo", "Cargo", "text", ' list="lista-cargos" autocomplete="off" required value="' + esc(u.cargo || "") + '"') + "</div></div>" +
      '<datalist id="lista-cargos">' + WA.Permisos.CARGOS.concat([WA.Permisos.CARGO_ADMIN]).map(function (c) { return '<option value="' + esc(c) + '">'; }).join("") + "</datalist>" +
      campo(p + "-pass", "Tu contraseña", "password", ' autocomplete="current-password" required') +
      campo(p + "-archivo", "Contraseña del archivo", "password", ' autocomplete="off" required aria-describedby="' + p + '-archivo-ayuda"') +
      '<p class="campo-ayuda" id="' + p + '-archivo-ayuda">La que comparte toda la junta y protege los datos de ABIES.</p>';
  }
  function leerEntrar(p, idError) {
    var o = { nombre: $(p + "-nombre").value.trim(), cargo: $(p + "-cargo").value.trim(), contrasena: $(p + "-pass").value, contrasenaArchivo: $(p + "-archivo").value };
    if (!o.nombre || !o.cargo || !o.contrasena || !o.contrasenaArchivo) { error(idError, "Rellena los cuatro campos."); return null; }
    return o;
  }

  /** Contraseña del archivo y de la cuenta ABIES: para empezar, convertir o recuperar. */
  function camposConfigurar() {
    return '<fieldset class="acceso-grupo"><legend>Contraseña del archivo</legend>' +
      dosContrasenas("ca", "Contraseña del archivo", "Protege todos los datos. La tendrá toda la junta, además de la suya personal. Si se pierde, los datos no se pueden recuperar.") +
      "</fieldset>" +
      '<fieldset class="acceso-grupo"><legend>Cuenta de administración (' + esc(WA.Permisos.NOMBRE_ADMIN) + " · " + esc(WA.Permisos.CARGO_ADMIN) + ")</legend>" +
      dosContrasenas("cb", "Contraseña de la cuenta ABIES", "Con ella se dan de alta los usuarios de cada cargo y se les pone contraseña si la olvidan. Tiene que ser distinta de la del archivo.") +
      "</fieldset>";
  }
  function leerConfigurar(idError) {
    var archivo = leerDos("ca", idError, "La contraseña del archivo");
    if (!archivo) return null;
    var admin = leerDos("cb", idError, "La contraseña de la cuenta ABIES");
    if (!admin) return null;
    if (archivo === admin) { error(idError, "La contraseña de la cuenta ABIES tiene que ser distinta de la del archivo."); return null; }
    return { contrasenaArchivo: archivo, contrasenaAdmin: admin };
  }

  function despuesDeConfigurar() {
    location.hash = "#/usuarios";
    WA.UI.aviso("Listo. Has entrado como " + WA.Permisos.NOMBRE_ADMIN + ". Da de alta a los usuarios de cada cargo.");
  }

  // ── Sin datos ────────────────────────────────────────────────────────────
  function bienvenida() {
    pintar(
      '<p class="acceso-sub">Gestión interna de la asociación. Cada miembro de la junta entra con su nombre, su cargo y su contraseña.</p>' +
      '<div class="acceso-opciones">' +
      '<button type="button" class="btn btn-primario" id="op-empezar">Configurar por primera vez</button>' +
      '<button type="button" class="btn btn-secundario" id="op-recuperar">Recuperar una copia de seguridad</button>' +
      '<button type="button" class="btn btn-enlace" id="op-demo">Ver la demostración</button>' +
      "</div>" +
      '<p class="acceso-nota">En este navegador todavía no hay datos de ABIES.</p>'
    );
    $("op-empezar").addEventListener("click", configurar);
    $("op-recuperar").addEventListener("click", recuperar);
    $("op-demo").addEventListener("click", demostracion);
  }

  function configurar() {
    pintar(
      "<h1>Configurar ABIES · Gestión</h1>" +
      '<p class="acceso-sub">Dos contraseñas: la del archivo, que compartirá la junta, y la de la cuenta de administración.</p>' +
      '<form id="f-crear" class="acceso-form" novalidate>' + camposConfigurar() +
      '<p class="acceso-error" id="e-crear" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primario">Crear y entrar</button>' +
      '<button type="button" class="btn btn-enlace" id="volver">Volver</button></form>'
    );
    $("volver").addEventListener("click", mostrar);
    $("f-crear").addEventListener("submit", async function (e) {
      e.preventDefault();
      error("e-crear", "");
      var o = leerConfigurar("e-crear");
      if (!o) return;
      try {
        await ocupado(this.querySelector("[type=submit]"), "Cifrando…", function () { return WA.Sesion.crear(o); });
        despuesDeConfigurar();
      } catch (err) { error("e-crear", err.message); }
    });
  }

  // ── Entrar ───────────────────────────────────────────────────────────────
  function entrar() {
    pintar(
      '<form id="f-entrar" class="acceso-form" novalidate>' + camposEntrar("d") +
      '<p class="acceso-error" id="e-entrar" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primario">Entrar</button></form>' +
      '<details class="acceso-olvido"><summary>¿No puedes entrar?</summary>' +
      "<p><strong>Si has olvidado tu contraseña</strong>, pide a quien lleve la cuenta " + esc(WA.Permisos.NOMBRE_ADMIN) + " que te ponga una provisional.</p>" +
      "<p><strong>Si se ha perdido la contraseña del archivo</strong>, no hay forma de recuperar los datos cifrados. Solo queda una copia de seguridad.</p>" +
      '<div class="acceso-opciones"><button type="button" class="btn btn-secundario" id="op-recuperar">Recuperar una copia de seguridad</button>' +
      '<button type="button" class="btn btn-peligro-suave" id="op-borrar">Borrar los datos de este navegador</button></div></details>' +
      '<p class="acceso-nota"><button type="button" class="btn btn-enlace" id="op-demo">Ver la demostración</button></p>'
    );
    // Si se vuelve tras bloquear, el nombre y el cargo ya están: el foco, a la contraseña.
    if ($("d-nombre").value && $("d-cargo").value) $("d-pass").focus();
    $("f-entrar").addEventListener("submit", async function (e) {
      e.preventDefault();
      error("e-entrar", "");
      var o = leerEntrar("d", "e-entrar");
      if (!o) return;
      try {
        WA.App.recordarProvisional(o.contrasena);
        await ocupado(this.querySelector("[type=submit]"), "Comprobando…", function () { return WA.Sesion.entrar(o); });
      } catch (err) {
        error("e-entrar", err.message);
        $("d-pass").select();
      }
    });
    $("op-recuperar").addEventListener("click", recuperar);
    $("op-demo").addEventListener("click", demostracion);
    $("op-borrar").addEventListener("click", async function () {
      var ok = await WA.UI.confirmar("Se borrarán los datos de ABIES guardados en este navegador. Las copias de seguridad que se hayan descargado no se tocan. No se puede deshacer.",
        { titulo: "Borrar datos de este navegador", aceptar: "Borrar", peligro: true });
      if (!ok) return;
      await WA.Sesion.borrarDelNavegador();
      bienvenida();
    });
  }

  // ── Datos de antes de los usuarios ──────────────────────────────────────
  function actualizarAntigua() {
    pintar(
      "<h1>Nuevo acceso por usuarios</h1>" +
      '<p class="acceso-sub">En este navegador hay datos protegidos con una sola contraseña. A partir de ahora cada cargo tendrá la suya, además de la del archivo.</p>' +
      '<form id="f-act" class="acceso-form" novalidate>' +
      campo("a-vieja", "Contraseña que usabas hasta ahora", "password", ' autocomplete="current-password" required') +
      camposConfigurar() +
      '<p class="acceso-error" id="e-act" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primario">Convertir y entrar</button></form>'
    );
    $("f-act").addEventListener("submit", async function (e) {
      e.preventDefault();
      error("e-act", "");
      var vieja = $("a-vieja").value;
      if (!vieja) { error("e-act", "Escribe la contraseña que usabas hasta ahora."); return; }
      var o = leerConfigurar("e-act");
      if (!o) return;
      o.contrasenaAntigua = vieja;
      try {
        await ocupado(this.querySelector("[type=submit]"), "Convirtiendo…", function () { return WA.Sesion.actualizarAntigua(o); });
        despuesDeConfigurar();
      } catch (err) { error("e-act", err.codigo === "CONTRASENA" ? "La contraseña que usabas hasta ahora no es correcta." : err.message); }
    });
  }

  // ── Recuperar una copia ──────────────────────────────────────────────────
  async function recuperar() {
    var archivo = await WA.UI.elegirArchivo(".json,application/json");
    if (!archivo) return;
    var lectura;
    try { lectura = WA.Copia.leer(archivo.texto); }
    catch (e) { WA.UI.aviso(e.message, "error"); return; }
    var hayDatos = (await WA.Sesion.tipoBoveda()) !== "ninguna";
    var fecha = lectura.creada ? " del " + esc(WA.Fechas.corta(lectura.creada.slice(0, 10))) : "";
    var aviso = hayDatos ? '<div class="caja-aviso"><strong>Sustituirá los datos de este navegador.</strong></div>' : "";
    var cuerpo, enviar;
    if (lectura.boveda) {
      cuerpo = '<p class="acceso-sub">Copia de ABIES' + fecha + ". Se abre con tu nombre, tu cargo y las contraseñas de cuando se hizo.</p>" + aviso + camposEntrar("r");
      enviar = function () { var o = leerEntrar("r", "e-rec"); if (o) WA.App.recordarProvisional(o.contrasena); return o; };
    } else if (lectura.cifrada) {
      cuerpo = '<p class="acceso-sub">Copia antigua' + fecha + ", de antes de los usuarios. Al recuperarla se configura el acceso por usuarios.</p>" + aviso +
        campo("r-vieja", "Contraseña de la copia", "password", ' autocomplete="current-password" required') + camposConfigurar();
      enviar = function () {
        var vieja = $("r-vieja").value;
        if (!vieja) { error("e-rec", "Escribe la contraseña de la copia."); return null; }
        var o = leerConfigurar("e-rec");
        if (o) o.contrasenaCopia = vieja;
        return o;
      };
    } else {
      cuerpo = '<p class="acceso-sub">Copia <strong>sin cifrar</strong>' + fecha + ". Al recuperarla se protege con el acceso por usuarios.</p>" + aviso + camposConfigurar();
      enviar = function () { return leerConfigurar("e-rec"); };
    }
    pintar("<h1>Recuperar copia</h1>" + '<form id="f-rec" class="acceso-form" novalidate>' + cuerpo +
      '<p class="acceso-error" id="e-rec" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primario">Recuperar y entrar</button>' +
      '<button type="button" class="btn btn-enlace" id="volver">Volver</button></form>');
    $("volver").addEventListener("click", mostrar);
    $("f-rec").addEventListener("submit", async function (e) {
      e.preventDefault();
      error("e-rec", "");
      var o = enviar();
      if (!o) return;
      try {
        var r = await ocupado(this.querySelector("[type=submit]"), "Descifrando…", function () { return WA.Sesion.restaurar(lectura, o); });
        WA.UI.aviso("Copia recuperada" + (r && r.faltan ? ". Faltan " + r.faltan + " adjuntos que no venían en la copia." : "."));
        if (!lectura.boveda) despuesDeConfigurar();
      } catch (err) { error("e-rec", err.codigo === "CONTRASENA" ? "La contraseña de la copia no es correcta." : err.message); }
    });
  }

  // ── Demostración ─────────────────────────────────────────────────────────
  function demostracion() {
    var usuarios = WA.Sesion.usuariosDemo();
    pintar(
      "<h1>Demostración</h1>" +
      '<p class="acceso-sub">Datos inventados que no se guardan. Elige con qué cargo entrar para ver qué puede hacer cada uno.</p>' +
      '<div class="acceso-opciones">' + usuarios.map(function (u) {
        return '<button type="button" class="btn ' + (u.rol === "admin" ? "btn-primario" : "btn-secundario") + '" data-demo="' + esc(u.id) + '">' +
          esc(u.cargo) + ' <span class="detalle">· ' + esc(u.nombre) + "</span></button>";
      }).join("") + "</div>" +
      '<button type="button" class="btn btn-enlace" id="volver">Volver</button>'
    );
    $("volver").addEventListener("click", mostrar);
    Array.prototype.forEach.call(document.querySelectorAll("[data-demo]"), function (b) {
      b.addEventListener("click", function () { WA.Sesion.demostracion(b.getAttribute("data-demo")); });
    });
  }

  async function mostrar() {
    var tipo = await WA.Sesion.tipoBoveda();
    if (tipo === "abies") entrar();
    else if (tipo === "antigua") actualizarAntigua();
    else bienvenida();
  }

  WA.Acceso = { mostrar: mostrar };
})(typeof self !== "undefined" ? self : this);

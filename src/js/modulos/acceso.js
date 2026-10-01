/*
 * webkit_asociaciones — Pantalla de acceso.
 *
 * Tres situaciones:
 *   · No hay datos en este navegador → «Empezar»: crear contraseña, recuperar
 *     una copia de seguridad o probar con datos de demostración.
 *   · Hay datos → «Desbloquear» con la contraseña.
 *   · Se ha olvidado la contraseña → no hay forma de recuperar lo cifrado
 *     (es el precio de que nadie más pueda leerlo). Solo queda una copia
 *     de seguridad o empezar de cero.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, esc = WA.UI.esc;
  var MINIMO = 8;
  var $ = function (id) { return document.getElementById(id); };

  var LOGO = '<svg class="acceso-logo" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="var(--acento)"/>' +
    '<path d="M14 33V19l10-6 10 6v14" fill="none" stroke="var(--acento-texto)" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M20 33v-8h8v8" fill="none" stroke="var(--acento-texto)" stroke-width="3" stroke-linejoin="round"/></svg>';

  function pintar(html) {
    $("acceso").innerHTML = '<main class="acceso-panel" id="acceso-principal">' + LOGO + html + "</main>";
    var primero = $("acceso").querySelector("input, button");
    if (primero) primero.focus();
  }

  function error(id, texto) {
    var el = $(id);
    el.textContent = texto || "";
    el.hidden = !texto;
  }

  /** Bloquea el botón mientras se cifra (tarda medio segundo) para que no se pulse dos veces. */
  async function ocupado(boton, texto, tarea) {
    var antes = boton.textContent;
    boton.disabled = true;
    boton.textContent = texto;
    try { return await tarea(); }
    finally { boton.disabled = false; boton.textContent = antes; }
  }

  function camposContrasena(prefijo) {
    return '<label for="' + prefijo + '-1">Contraseña</label>' +
      '<input id="' + prefijo + '-1" type="password" autocomplete="new-password" minlength="' + MINIMO + '" required aria-describedby="' + prefijo + '-ayuda">' +
      '<p class="campo-ayuda" id="' + prefijo + '-ayuda">Mínimo ' + MINIMO + ' caracteres. Mejor una frase que una palabra.</p>' +
      '<label for="' + prefijo + '-2">Repítela</label>' +
      '<input id="' + prefijo + '-2" type="password" autocomplete="new-password" required>';
  }
  function comprobarContrasenas(prefijo, idError) {
    var a = $(prefijo + "-1").value, b = $(prefijo + "-2").value;
    if (a.length < MINIMO) { error(idError, "La contraseña necesita al menos " + MINIMO + " caracteres."); return null; }
    if (a !== b) { error(idError, "Las dos contraseñas no coinciden."); return null; }
    return a;
  }

  // ── Bienvenida: no hay datos ─────────────────────────────────────────────
  function bienvenida() {
    pintar(
      "<h1>webkit_asociaciones</h1>" +
      '<p class="acceso-sub">Gestión de tu asociación en un solo archivo. Los datos se quedan en este navegador, cifrados con tu contraseña.</p>' +
      '<div class="acceso-opciones">' +
      '<button type="button" class="btn btn-primario" id="op-empezar">Empezar con datos nuevos</button>' +
      '<button type="button" class="btn btn-secundario" id="op-recuperar">Recuperar una copia de seguridad</button>' +
      '<button type="button" class="btn btn-enlace" id="op-demo">Probar con datos de demostración</button>' +
      "</div>" +
      '<p class="acceso-nota">La demostración usa datos inventados y no guarda nada.</p>'
    );
    $("op-empezar").addEventListener("click", crear);
    $("op-recuperar").addEventListener("click", recuperar);
    $("op-demo").addEventListener("click", function () { WA.Sesion.demostracion(); });
  }

  function crear() {
    pintar(
      "<h1>Elige una contraseña</h1>" +
      '<p class="acceso-sub">Cifrará los datos en este navegador y en tus copias de seguridad.</p>' +
      '<div class="caja-aviso"><strong>Si la olvidas, nadie puede recuperar los datos</strong>, tampoco quien hizo esta aplicación. Apúntala en un lugar seguro y compártela solo con quien lleve la gestión.</div>' +
      '<form id="f-crear" class="acceso-form" novalidate>' + camposContrasena("c") +
      '<p class="acceso-error" id="e-crear" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primario">Crear y entrar</button>' +
      '<button type="button" class="btn btn-enlace" id="volver">Volver</button></form>'
    );
    $("volver").addEventListener("click", bienvenida);
    $("f-crear").addEventListener("submit", async function (e) {
      e.preventDefault();
      error("e-crear", "");
      var pass = comprobarContrasenas("c", "e-crear");
      if (!pass) return;
      await ocupado(e.submitter || this.querySelector("[type=submit]"), "Cifrando…", function () { return WA.Sesion.crear(pass); });
      location.hash = "#/asociacion";
      WA.UI.aviso("Listo. Empieza por los datos de tu asociación.");
    });
  }

  // ── Recuperar una copia ──────────────────────────────────────────────────
  async function recuperar() {
    var archivo = await WA.UI.elegirArchivo(".json,application/json");
    if (!archivo) return;
    var lectura;
    try { lectura = WA.Copia.leer(archivo.texto); }
    catch (e) { WA.UI.aviso(e.message, "error"); return; }
    var de = lectura.asociacion ? " de <strong>" + esc(lectura.asociacion) + "</strong>" : "";
    var fecha = lectura.creada ? " (" + esc(WA.Fechas.corta(lectura.creada.slice(0, 10))) + ")" : "";
    pintar(
      "<h1>Recuperar copia</h1>" +
      '<p class="acceso-sub">Copia' + de + fecha + ".</p>" +
      '<form id="f-rec" class="acceso-form" novalidate>' +
      (lectura.cifrada
        ? '<label for="r-pass">Contraseña de la copia</label><input id="r-pass" type="password" autocomplete="current-password" required>' +
          '<p class="campo-ayuda">A partir de ahora, esta misma contraseña protegerá los datos en este navegador.</p>'
        : '<div class="caja-aviso">Esta copia <strong>no está cifrada</strong>. Elige una contraseña para protegerla en este navegador.</div>' + camposContrasena("r")) +
      '<p class="acceso-error" id="e-rec" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primario">Recuperar y entrar</button>' +
      '<button type="button" class="btn btn-enlace" id="volver">Volver</button></form>'
    );
    $("volver").addEventListener("click", function () { WA.Acceso.mostrar(); });
    $("f-rec").addEventListener("submit", async function (e) {
      e.preventDefault();
      error("e-rec", "");
      var pass = lectura.cifrada ? $("r-pass").value : comprobarContrasenas("r", "e-rec");
      if (!pass) return;
      try {
        await ocupado(this.querySelector("[type=submit]"), "Descifrando…", function () { return WA.Sesion.restaurar(lectura, pass, pass); });
        WA.UI.aviso("Copia recuperada.");
      } catch (err) {
        error("e-rec", err.message);
      }
    });
  }

  // ── Desbloquear ──────────────────────────────────────────────────────────
  function desbloquear() {
    pintar(
      "<h1>Desbloquear</h1>" +
      '<p class="acceso-sub">Escribe la contraseña de tu asociación.</p>' +
      '<form id="f-entrar" class="acceso-form" novalidate>' +
      '<label for="d-pass">Contraseña</label><input id="d-pass" type="password" autocomplete="current-password" required>' +
      '<p class="acceso-error" id="e-entrar" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primario">Entrar</button></form>' +
      '<details class="acceso-olvido"><summary>¿Has olvidado la contraseña?</summary>' +
      "<p>Los datos están cifrados con ella y no hay forma de recuperarla. Puedes:</p>" +
      '<div class="acceso-opciones"><button type="button" class="btn btn-secundario" id="op-recuperar">Recuperar una copia de seguridad</button>' +
      '<button type="button" class="btn btn-peligro-suave" id="op-borrar">Borrar los datos de este navegador y empezar de cero</button></div></details>' +
      '<p class="acceso-nota"><button type="button" class="btn btn-enlace" id="op-demo">Ver la demostración</button></p>'
    );
    $("f-entrar").addEventListener("submit", async function (e) {
      e.preventDefault();
      error("e-entrar", "");
      var pass = $("d-pass").value;
      if (!pass) { error("e-entrar", "Escribe la contraseña."); return; }
      try {
        await ocupado(this.querySelector("[type=submit]"), "Comprobando…", function () { return WA.Sesion.desbloquear(pass); });
      } catch (err) {
        error("e-entrar", err.message);
        $("d-pass").select();
      }
    });
    $("op-recuperar").addEventListener("click", recuperar);
    $("op-demo").addEventListener("click", function () { WA.Sesion.demostracion(); });
    $("op-borrar").addEventListener("click", async function () {
      var ok = await WA.UI.confirmar("Se borrarán los datos guardados en este navegador. Las copias de seguridad que hayas descargado no se tocan. No se puede deshacer.",
        { titulo: "Borrar datos de este navegador", aceptar: "Borrar", peligro: true });
      if (!ok) return;
      await WA.Sesion.borrarDelNavegador();
      bienvenida();
    });
  }

  async function mostrar() {
    if (await WA.Boveda.hayDatos()) desbloquear(); else bienvenida();
  }

  WA.Acceso = { mostrar: mostrar };
})(typeof self !== "undefined" ? self : this);

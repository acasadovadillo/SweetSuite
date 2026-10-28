/*
 * ABIES · Gestión — Módulo «Ajustes»: mi cuenta, apariencia, seguridad y privacidad.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc;

  /** Cada usuario cambia su contraseña personal (la del archivo la cambia la cuenta ABIES en Usuarios). */
  async function cambiarMiContrasena() {
    var r = await UI.dialogo({
      titulo: "Cambiar mi contraseña",
      contenido: "<p>Es tu contraseña personal. La del archivo no cambia.</p>" +
        '<form class="formulario" novalidate>' +
        UI.campo({ nombre: "actual", etiqueta: "Tu contraseña actual", tipo: "password", requerido: true, atributos: 'autocomplete="current-password"' }) +
        UI.campo({ nombre: "nueva", etiqueta: "Nueva contraseña", tipo: "password", requerido: true, ayuda: "Mínimo 8 caracteres.", atributos: 'autocomplete="new-password"' }) +
        UI.campo({ nombre: "repetida", etiqueta: "Repite la nueva", tipo: "password", requerido: true, atributos: 'autocomplete="new-password"' }) +
        "</form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Cambiar", valor: "enviar", estilo: "btn-primario" }],
      validar: function (form) {
        var d = UI.leerFormulario(form);
        var cortaMal = d.nueva.length < 8, distintas = d.nueva !== d.repetida;
        UI.marcarError(form, "nueva", cortaMal ? "Mínimo 8 caracteres." : "");
        UI.marcarError(form, "repetida", !cortaMal && distintas ? "No coinciden." : "");
        return !cortaMal && !distintas;
      },
    });
    if (r.valor !== "enviar") return;
    try {
      await WA.Sesion.cambiarMiContrasena(r.datos.actual, r.datos.nueva);
      UI.aviso("Contraseña cambiada. A partir de ahora, entra con la nueva.");
    } catch (e) {
      UI.aviso(e.message, "error");
    }
  }

  async function pintar(cont) {
    var p = WA.Preferencias.leer();
    var tema = WA.Tema.actual();
    var demo = WA.Sesion.modo === "demostración";
    var radio = function (valor, texto) {
      return '<label class="opcion"><input type="radio" name="tema" value="' + valor + '"' + (tema === valor ? " checked" : "") + "><span>" + texto + "</span></label>";
    };
    var u = WA.Sesion.usuario;
    var edita = !u ? "" : u.rol === "admin" || u.permisos.length === WA.Permisos.IDS.length ? "todas las secciones"
      : u.permisos.length ? u.permisos.map(WA.Permisos.nombreSeccion).join(", ") : "ninguna sección (solo ver)";
    cont.innerHTML =
      "<h1>Ajustes</h1>" +
      '<section class="tarjeta" aria-labelledby="t-cuenta"><h2 id="t-cuenta">Mi cuenta</h2>' +
      (u ? "<p>Has entrado como <strong>" + esc(u.nombre) + " · " + esc(u.cargo) + "</strong>. Puedes modificar " + esc(edita) + "; el resto lo ves sin cambiarlo.</p>" : "") +
      (demo ? '<p class="detalle">En la demostración no hay contraseñas.</p>' : '<div class="acciones"><button type="button" class="btn btn-secundario" id="a-pass">Cambiar mi contraseña…</button></div>') +
      "</section>" +
      '<section class="tarjeta" aria-labelledby="t-apariencia"><h2 id="t-apariencia">Apariencia</h2>' +
      '<fieldset class="grupo-opciones"><legend>Tema</legend>' + radio("auto", "Como el sistema") + radio("claro", "Claro") + radio("oscuro", "Oscuro") + "</fieldset></section>" +

      '<section class="tarjeta" aria-labelledby="t-seguridad"><h2 id="t-seguridad">Seguridad en este ordenador</h2>' +
      (demo ? '<p class="detalle">En la demostración no hay contraseña ni datos guardados.</p>' : "") +
      '<form id="f-seguridad" class="formulario" novalidate><div class="rejilla">' +
      UI.campo({ nombre: "bloqueoMinutos", etiqueta: "Bloquear tras un rato sin usarla", tipo: "select", valor: String(p.bloqueoMinutos),
        opciones: [["5", "5 minutos"], ["15", "15 minutos"], ["30", "30 minutos"], ["60", "1 hora"], ["0", "Nunca"]] }) +
      "</div>" +
      '<label class="casilla"><input type="checkbox" name="borrarAlSalir"' + (p.borrarAlSalir ? " checked" : "") + ">" +
      "<span><strong>Borrar los datos de este navegador al cerrar la sesión.</strong> Para ordenadores compartidos. " +
      "Al pulsar «Cerrar sesión» te pedirá descargar la copia si hay cambios, y después borrará los datos de este navegador. " +
      "Si cierras la pestaña sin más, los datos se quedan guardados (cifrados).</span></label>" +
      "</form>" +
      "</section>" +

      '<section class="tarjeta" aria-labelledby="t-privacidad"><h2 id="t-privacidad">Privacidad y protección de datos</h2>' +
      "<p>Esta aplicación <strong>no envía nada a ningún servidor</strong>: ni nube, ni analítica. Los datos solo están en este navegador (cifrados con la contraseña del archivo y la de cada usuario) y en las copias que se descarguen.</p>" +
      "<p>Aun así, la asociación es responsable de los datos personales de sus socios. Algunas buenas prácticas:</p><ul class=\"lista\">" +
      "<li>Cada miembro de la junta, con su propio usuario: así queda registrado quién hace cada cambio. Cuando alguien deja la junta, desactívalo en Usuarios.</li>" +
      "<li>Contraseñas largas. Nunca envíes la contraseña del archivo por el mismo canal que la copia de seguridad o que una contraseña personal.</li>" +
      "<li>Guarda las copias cifradas. Las copias sin cifrar, bórralas en cuanto termines.</li>" +
      "<li>Recoge solo los datos que necesitas e informa a los socios de para qué se usan.</li>" +
      "<li>Cuando alguien se da de baja, revisa cuánto tiempo debes conservar sus datos.</li>" +
      "</ul>" +
      '<p class="detalle">Estas recomendaciones son orientativas y no son asesoramiento legal. Las obligaciones concretas del RGPD y de la LOPDGDD para tu asociación (registro de actividades de tratamiento, información a los socios, plazos de conservación) conviene verificarlas con asesoría o con la guía de la Agencia Española de Protección de Datos.</p>' +
      "</section>" +

      '<section class="tarjeta" aria-labelledby="t-acerca"><h2 id="t-acerca">Acerca de</h2>' +
      '<p>ABIES · Gestión · versión <span id="a-version">' + esc(raiz.WA_VERSION || "desarrollo") + "</span>. © 2026 Alberto Casado Vadillo. Todos los derechos reservados.</p></section>";

    cont.querySelectorAll('input[name="tema"]').forEach(function (r) {
      r.addEventListener("change", function () { WA.Tema.poner(r.value); });
    });
    var f = cont.querySelector("#f-seguridad");
    f.addEventListener("change", function () {
      var d = UI.leerFormulario(f);
      WA.Preferencias.poner({ bloqueoMinutos: parseInt(d.bloqueoMinutos, 10) || 0, borrarAlSalir: !!d.borrarAlSalir });
      WA.App.reiniciarBloqueo();
      UI.aviso("Ajuste guardado en este ordenador.");
    });
    var bp = cont.querySelector("#a-pass");
    if (bp) bp.addEventListener("click", cambiarMiContrasena);
  }

  WA.Ajustes = { cambiarMiContrasena: cambiarMiContrasena };
  WA.App.registrar({
    id: "ajustes", titulo: "Ajustes", orden: 100, pintar: pintar,
    icono: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  });
})(typeof self !== "undefined" ? self : this);

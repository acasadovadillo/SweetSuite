/*
 * webkit_asociaciones — Módulo «Inicio».
 *
 * En la Fase 1 es una portada sencilla: qué asociación es, cómo está la copia
 * de seguridad y qué falta por rellenar. En la Fase 6 se convertirá en el panel
 * de resumen (socios, cuotas, saldo, próximas fechas).
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, esc = WA.UI.esc;

  async function pintar(cont, datos) {
    var a = await datos.leer("asociacion");
    var junta = (await datos.listar("junta")).filter(function (m) { return !m.hasta || m.hasta >= WA.Fechas.hoy(); });
    var copia = await datos.estadoCopia();
    var demo = WA.Sesion.modo === "demostración";

    var pendientes = [];
    if (!a.nombre) pendientes.push('<a href="#/asociacion">Escribe el nombre y los datos de la asociación</a>');
    if (!a.nif) pendientes.push('<a href="#/asociacion">Añade el NIF de la asociación</a>');
    if (!junta.length) pendientes.push('<a href="#/asociacion">Añade la junta directiva</a>');
    if (!demo && !copia.ultimaCopia) pendientes.push('<a href="#/copias">Descarga tu primera copia de seguridad</a>');

    var estadoCopia = demo ? "No aplica en la demostración."
      : !copia.ultimaCopia ? '<span class="estado estado-aviso">Sin copias todavía</span>'
      : copia.cambiosDesdeCopia ? '<span class="estado estado-aviso">Cambios sin copia</span> Última: ' + esc(WA.Fechas.corta(copia.ultimaCopia.slice(0, 10)))
      : '<span class="estado estado-ok">Al día</span> Última: ' + esc(WA.Fechas.corta(copia.ultimaCopia.slice(0, 10)));

    cont.innerHTML =
      "<h1>" + esc(a.nombre || "Tu asociación") + "</h1>" +
      '<p class="intro">' + (a.domicilio && a.domicilio.municipio ? esc(WA.Direccion.formatear(a.domicilio).completa) : "Desde aquí llevarás la gestión de la asociación.") + "</p>" +
      (pendientes.length ? '<section class="tarjeta tarjeta-destacada" aria-labelledby="t-pend"><h2 id="t-pend">Para empezar</h2><ul class="lista-pasos">' +
        pendientes.map(function (p) { return "<li>" + p + "</li>"; }).join("") + "</ul></section>" : "") +
      '<div class="rejilla-tarjetas">' +
      '<section class="tarjeta" aria-labelledby="t-copia"><h2 id="t-copia">Copia de seguridad</h2><p>' + estadoCopia + '</p><a class="enlace-flecha" href="#/copias">Ir a copias</a></section>' +
      '<section class="tarjeta" aria-labelledby="t-junta"><h2 id="t-junta">Junta directiva</h2><p><span class="cifra">' + junta.length + "</span> " + (junta.length === 1 ? "cargo vigente" : "cargos vigentes") +
      '</p><a class="enlace-flecha" href="#/asociacion">Ver junta</a></section>' +
      '<section class="tarjeta" aria-labelledby="t-prox"><h2 id="t-prox">Próximamente</h2><p class="detalle">Socios y cuotas, tesorería e IVA, actividades, actas, obligaciones, subvenciones e informes.</p></section>' +
      "</div>";
  }

  WA.App.registrar({
    id: "inicio", titulo: "Inicio", orden: 0, pintar: pintar,
    icono: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  });
})(typeof self !== "undefined" ? self : this);

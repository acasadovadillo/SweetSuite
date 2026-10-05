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
    var socios = await datos.listar("socios");
    var cuotas = await datos.listar("cuotas");
    var config = await datos.leer("config");
    var activos = socios.filter(function (x) { return WA.Socios.estado(x) === "activo"; }).length;
    var deud = WA.Cuotas.deudores(cuotas);
    var deuda = WA.Dinero.sumar(deud.map(function (d) { return d.total; }));
    var demo = WA.Sesion.modo === "demostración";
    var movimientos = await datos.listar("movimientos");
    var actividades = await datos.listar("actividades");
    var saldo = WA.Tesoreria.saldos(config.cuentas, movimientos, cuotas, undefined, actividades).total;
    var proximas = WA.Actividades.ordenar(actividades).filter(function (x) { return WA.Actividades.fechaDe(x) >= WA.Fechas.hoy() && x.estado !== "cancelada"; }).slice(0, 3);
    var proximasHtml = '<section class="tarjeta" aria-labelledby="t-act"><h2 id="t-act">Próximas actividades</h2>' + (proximas.length ? '<ul class="lista-actividades">' + proximas.map(function (x) {
      var n = WA.Actividades.ocupadas(x);
      return '<li><a href="#/actividades/ficha/' + encodeURIComponent(x.id) + '"><strong>' + esc(x.titulo) + '</strong></a><span class="detalle">' +
        esc(WA.Fechas.corta(WA.Actividades.fechaDe(x))) + (x.todoElDia ? "" : " · " + esc(String(x.inicio).slice(11, 16))) + " · " + (x.aforo > 0 ? n + "/" + x.aforo + " plazas" : n + " inscritas") + "</span></li>";
    }).join("") + "</ul>" : '<p class="detalle">No hay ninguna prevista.</p>') + '<a class="enlace-flecha" href="#/actividades">Ver calendario</a></section>';
    var sinClasificar = movimientos.filter(function (m) { return (m.tipo === "ingreso" || m.tipo === "gasto") && !m.categoriaId; }).length;

    var pendientes = [];
    if (!a.nombre) pendientes.push('<a href="#/asociacion">Escribe el nombre y los datos de la asociación</a>');
    if (!a.nif) pendientes.push('<a href="#/asociacion">Añade el NIF de la asociación</a>');
    if (!junta.length) pendientes.push('<a href="#/asociacion">Añade la junta directiva</a>');
    if (!(config.tiposSocio || []).some(function (t) { return t.cuota > 0; })) pendientes.push('<a href="#/cuotas/tipos">Pon el importe de la cuota de socio</a>');
    if (!socios.length) pendientes.push('<a href="#/socios">Da de alta a los socios (o impórtalos desde una hoja de cálculo)</a>');
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
      proximasHtml +
      '<section class="tarjeta" aria-labelledby="t-saldo"><h2 id="t-saldo">Saldo</h2><p><span class="cifra">' + esc(WA.Dinero.formatear(saldo)) + "</span></p>" +
      (sinClasificar ? '<p class="detalle">' + sinClasificar + " movimientos sin clasificar</p>" : "") + '<a class="enlace-flecha" href="#/tesoreria">Ver tesorería</a></section>' +
      '<section class="tarjeta" aria-labelledby="t-copia"><h2 id="t-copia">Copia de seguridad</h2><p>' + estadoCopia + '</p><a class="enlace-flecha" href="#/copias">Ir a copias</a></section>' +
      '<section class="tarjeta" aria-labelledby="t-socios"><h2 id="t-socios">Socios</h2><p><span class="cifra">' + activos + "</span> " + (activos === 1 ? "activo" : "activos") +
      '</p><a class="enlace-flecha" href="#/socios">Ver socios</a></section>' +
      '<section class="tarjeta" aria-labelledby="t-cuotas"><h2 id="t-cuotas">Cuotas sin cobrar</h2><p><span class="cifra">' + esc(WA.Dinero.formatear(deuda)) + "</span></p>" +
      '<p class="detalle">' + (deud.length ? deud.length + (deud.length === 1 ? " socio" : " socios") : "Nadie debe nada") + '</p><a class="enlace-flecha" href="#/cuotas/impagados">Ver impagados</a></section>' +
      '<section class="tarjeta" aria-labelledby="t-junta"><h2 id="t-junta">Junta directiva</h2><p><span class="cifra">' + junta.length + "</span> " + (junta.length === 1 ? "cargo vigente" : "cargos vigentes") +
      '</p><a class="enlace-flecha" href="#/asociacion">Ver junta</a></section>' +
      '<section class="tarjeta" aria-labelledby="t-prox"><h2 id="t-prox">Próximamente</h2><p class="detalle">Actas, convocatorias, obligaciones, subvenciones e informes.</p></section>' +
      "</div>";
  }

  WA.App.registrar({
    id: "inicio", titulo: "Inicio", orden: 0, pintar: pintar,
    icono: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  });
})(typeof self !== "undefined" ? self : this);

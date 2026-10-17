/*
 * webkit_asociaciones — Módulo «Inicio»: el panel de resumen.
 *
 * Arriba, lo que falta por rellenar (solo mientras falte). Después, en bloques:
 *   · Agenda: plazos que vencen, próximas actividades y subvenciones en marcha.
 *   · Dinero: saldo por cuenta, ingresos y gastos del año, presupuesto y su evolución.
 *   · Socios y cuotas: socios activos, altas y bajas, cuotas cobradas y deuda.
 *   · Copia de seguridad y junta.
 * Las cifras las calcula logica/informes.js (panel), que tiene tests.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, D = WA.Dinero;
  var euros = function (c) { return esc(D.formatear(c)); };
  var eurosRedondos = function (c) { return D.formatear(Math.round(c / 100) * 100).replace(/,00(?=\s*€)/, ""); };

  function tarjeta(id, titulo, cuerpo, enlace, clase) {
    return '<section class="tarjeta' + (clase ? " " + clase : "") + '" aria-labelledby="t-' + id + '"><h3 id="t-' + id + '">' + titulo + "</h3>" + cuerpo +
      (enlace ? '<a class="enlace-flecha" href="' + enlace[0] + '">' + enlace[1] + "</a>" : "") + "</section>";
  }

  async function pintar(cont, datos) {
    var hoy = F.hoy(), anio = +hoy.slice(0, 4);
    var c = await WA.TesUI.cargar(datos);
    var obligaciones = await datos.listar("obligaciones");
    var copia = await datos.estadoCopia();
    var a = c.asociacion, config = c.config;
    var p = WA.Informes.panel(c, hoy);
    var junta = WA.Informes.juntaEn(c.junta, hoy);
    var demo = WA.Sesion.modo === "demostración";

    // ── Para empezar ──
    var pendientes = [];
    if (!a.nombre) pendientes.push('<a href="#/asociacion">Escribe el nombre y los datos de la asociación</a>');
    if (!a.nif) pendientes.push('<a href="#/asociacion">Añade el NIF de la asociación</a>');
    if (!junta.length) pendientes.push('<a href="#/asociacion">Añade la junta directiva</a>');
    if (!(config.tiposSocio || []).some(function (t) { return t.cuota > 0; })) pendientes.push('<a href="#/cuotas/tipos">Pon el importe de la cuota de socio</a>');
    if (!c.socios.length) pendientes.push('<a href="#/socios">Da de alta a los socios (o impórtalos desde una hoja de cálculo)</a>');
    if (!c.documentos.some(function (d) { return d.categoria === "Estatutos"; })) pendientes.push('<a href="#/documentos">Adjunta los estatutos</a>');
    if (!obligaciones.length) pendientes.push('<a href="#/obligaciones">Elige las obligaciones (fiscales, asociativas, renovaciones) que queréis tener con aviso</a>');
    if (!demo && !copia.ultimaCopia) pendientes.push('<a href="#/copias">Descarga tu primera copia de seguridad</a>');

    // ── Agenda ──
    var venc = (await WA.ObligacionesUI.vencimientos(datos, (anio - 1) + "-01-01", F.sumarDias(hoy, 60)))
      .filter(function (v) { return v.estado === "vencida" || v.estado === "proxima"; }).slice(0, 6);
    var vencHtml = tarjeta("venc", "Plazos que vencen", venc.length ? '<ul class="lista-actividades">' + venc.map(function (v) {
      return '<li><a href="' + (v.origen === "subvencion" ? "#/proyectos/ficha/" + encodeURIComponent(v.proyectoId) : "#/obligaciones") + '"><strong>' + esc(v.titulo) + "</strong></a>" +
        '<span class="detalle">' + esc(F.corta(v.fecha)) + (v.etiqueta ? " · " + esc(v.etiqueta) : "") + " · " +
        (v.faltan < 0 ? '<span class="importe-negativo">venció hace ' + (-v.faltan) + " días</span>" : v.faltan === 0 ? "hoy" : "en " + v.faltan + " días") + "</span></li>";
    }).join("") + "</ul>" : '<p class="detalle">Nada en los próximos 60 días.</p>', ["#/obligaciones", "Ver obligaciones"],
      venc.some(function (v) { return v.estado === "vencida"; }) ? "tarjeta-alerta" : "");

    var A = WA.Actividades;
    var proximas = A.ordenar(c.actividades).filter(function (x) { return A.fechaDe(x) >= hoy && x.estado !== "cancelada"; }).slice(0, 4);
    var proximasHtml = tarjeta("act", "Próximas actividades", proximas.length ? '<ul class="lista-actividades">' + proximas.map(function (x) {
      var n = A.ocupadas(x);
      return '<li><a href="#/actividades/ficha/' + encodeURIComponent(x.id) + '"><strong>' + esc(x.titulo) + '</strong></a><span class="detalle">' +
        esc(F.corta(A.fechaDe(x))) + (x.todoElDia ? "" : " · " + esc(String(x.inicio).slice(11, 16))) + " · " + (x.aforo > 0 ? n + "/" + x.aforo + " plazas" : n + " inscritas") + "</span></li>";
    }).join("") + "</ul>" : '<p class="detalle">No hay ninguna prevista.</p>', ["#/actividades", "Ver calendario"]);

    var estados = {};
    WA.Obligaciones.ESTADOS_SUBVENCION.forEach(function (e) { estados[e[0]] = e[1]; });
    var subvHtml = p.subvencionesEnMarcha.length ? tarjeta("subv", "Subvenciones en marcha", '<ul class="lista-actividades">' + p.subvencionesEnMarcha.slice(0, 5).map(function (s) {
      return '<li><a href="#/proyectos/ficha/' + encodeURIComponent(s.id) + '"><strong>' + esc(s.nombre) + '</strong></a><span class="detalle">' + esc(estados[s.estadoSubvencion] || "") +
        (s.importeConcedido ? " · " + euros(s.importeConcedido) : s.importeSolicitado ? " · pedidos " + euros(s.importeSolicitado) : "") + "</span></li>";
    }).join("") + "</ul>", ["#/proyectos", "Ver presupuestos y subvenciones"]) : "";

    // ── Dinero ──
    var cuentasUsadas = config.cuentas.filter(function (k) { return k.activa !== false || p.saldo.porCuenta[k.id]; });
    var saldoHtml = tarjeta("saldo", "Saldo hoy", '<p><span class="cifra">' + euros(p.saldo.total) + "</span></p>" +
      (cuentasUsadas.length > 1 ? '<ul class="lista-cifras">' + cuentasUsadas.map(function (k) {
        return "<li><span>" + esc(k.nombre) + '</span><span class="importe">' + euros(p.saldo.porCuenta[k.id] || 0) + "</span></li>";
      }).join("") + "</ul>" : ""), ["#/tesoreria", "Ver tesorería"]);
    var sinClasificar = c.movimientos.filter(function (m) { return (m.tipo === "ingreso" || m.tipo === "gasto") && !m.categoriaId; }).length;
    var pg = p.presupuestoGastos, pi = p.presupuestoIngresos;
    var anioHtml = tarjeta("anio", "En " + anio,
      '<ul class="lista-cifras"><li><span>Ingresos</span><span class="importe">' + euros(p.ingresos) + "</span></li>" +
      "<li><span>Gastos</span><span class=\"importe\">−" + euros(p.gastos) + "</span></li>" +
      '<li class="total"><span>Resultado</span><span class="importe ' + (p.resultado < 0 ? "importe-negativo" : "") + '">' + euros(p.resultado) + "</span></li></ul>" +
      (sinClasificar ? '<p class="detalle"><a href="#/tesoreria/movimientos">' + sinClasificar + (sinClasificar === 1 ? " movimiento sin clasificar" : " movimientos sin clasificar") + "</a></p>" : ""),
      ["#/informes/cuentas", "Ver cuentas del año"]);
    var presHtml = tarjeta("pres", "Presupuesto " + anio, pg.previsto || pi.previsto
      ? (pg.previsto ? "<p>Gastado</p>" + WA.Graficas.barra(pg.realizado, pg.previsto, { titulo: "Gasto sobre lo previsto", texto: D.formatear(pg.realizado) + " de " + D.formatear(pg.previsto) }) : "") +
        (pi.previsto ? "<p>Ingresado</p>" + WA.Graficas.barra(pi.realizado, pi.previsto, { titulo: "Ingreso sobre lo previsto", texto: D.formatear(pi.realizado) + " de " + D.formatear(pi.previsto) }) : "")
      : '<p class="detalle">No hay presupuesto de ' + anio + " todavía.</p>", ["#/proyectos", "Ver presupuesto"]);
    var graficaSaldo = '<section class="tarjeta tarjeta-ancha" aria-labelledby="t-gsaldo"><h3 id="t-gsaldo">Saldo a fin de mes (últimos 12 meses)</h3>' +
      WA.Graficas.lineas(p.serieSaldo, { titulo: "Saldo a fin de mes", formato: eurosRedondos }) + "</section>";

    // ── Socios y cuotas ──
    var sociosHtml = tarjeta("socios", "Socios", '<p><span class="cifra">' + p.socios.activos + "</span> " + (p.socios.activos === 1 ? "activo" : "activos") + "</p>" +
      '<p class="detalle">En ' + anio + ": " + p.socios.altas + (p.socios.altas === 1 ? " alta" : " altas") + " y " + p.socios.bajas + (p.socios.bajas === 1 ? " baja" : " bajas") + "</p>",
      ["#/socios", "Ver socios"]);
    var q = p.cuotas;
    var cuotasHtml = tarjeta("cuotas", "Cuotas de " + anio, q.emitido
      ? "<p>Cobrado</p>" + WA.Graficas.barra(q.cobrado, q.emitido, { titulo: "Cuotas cobradas", texto: D.formatear(q.cobrado) + " de " + D.formatear(q.emitido) }) +
        (q.pendiente ? '<p class="detalle">Faltan ' + euros(q.pendiente) + "</p>" : "")
      : '<p class="detalle">Aún no se han generado las cuotas de ' + anio + ".</p>", ["#/cuotas", "Ver cuotas"]);
    var deudaHtml = tarjeta("deuda", "Deuda de cuotas", '<p><span class="cifra">' + euros(q.deudaTotal) + "</span></p>" +
      '<p class="detalle">Todo lo pendiente, de cualquier año.</p>', ["#/cuotas/impagados", "Ver impagados"], q.deudaTotal ? "" : "");
    var graficaSocios = '<section class="tarjeta tarjeta-ancha" aria-labelledby="t-gsocios"><h3 id="t-gsocios">Socios activos (últimos 12 meses)</h3>' +
      WA.Graficas.lineas(p.serieSocios, { titulo: "Socios activos a fin de mes", desdeCero: true }) + "</section>";

    // ── Copia y junta ──
    var estadoCopia = demo ? "No aplica en la demostración."
      : !copia.ultimaCopia ? '<span class="estado estado-aviso">Sin copias todavía</span>'
      : copia.cambiosDesdeCopia ? '<span class="estado estado-aviso">Cambios sin copia</span> Última: ' + esc(F.corta(copia.ultimaCopia.slice(0, 10)))
      : '<span class="estado estado-ok">Al día</span> Última: ' + esc(F.corta(copia.ultimaCopia.slice(0, 10)));
    var copiaHtml = tarjeta("copia", "Copia de seguridad", "<p>" + estadoCopia + "</p>", ["#/copias", "Ir a copias"]);
    var juntaHtml = tarjeta("junta", "Junta directiva", '<p><span class="cifra">' + junta.length + "</span> " + (junta.length === 1 ? "cargo vigente" : "cargos vigentes") + "</p>",
      ["#/asociacion", "Ver junta"]);

    cont.innerHTML =
      "<h1>" + esc(a.nombre || "Tu asociación") + "</h1>" +
      '<p class="intro">' + (a.domicilio && a.domicilio.municipio ? esc(WA.Direccion.formatear(a.domicilio).completa) : "Desde aquí llevarás la gestión de la asociación.") + "</p>" +
      (pendientes.length ? '<section class="tarjeta tarjeta-destacada" aria-labelledby="t-pend"><h2 id="t-pend">Para empezar</h2><ul class="lista-pasos">' +
        pendientes.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul></section>" : "") +
      '<h2 class="titulo-bloque">Agenda</h2><div class="rejilla-tarjetas">' + vencHtml + proximasHtml + subvHtml + "</div>" +
      '<h2 class="titulo-bloque">Dinero</h2><div class="rejilla-tarjetas">' + saldoHtml + anioHtml + presHtml + graficaSaldo + "</div>" +
      '<h2 class="titulo-bloque">Socios y cuotas</h2><div class="rejilla-tarjetas">' + sociosHtml + cuotasHtml + deudaHtml + graficaSocios + "</div>" +
      '<h2 class="titulo-bloque">La asociación</h2><div class="rejilla-tarjetas">' + copiaHtml + juntaHtml +
      tarjeta("informes", "Informes", '<p class="detalle">Memoria anual y cuentas del ejercicio, listas para imprimir.</p>', ["#/informes", "Ver informes"]) + "</div>";
  }

  WA.App.registrar({
    id: "inicio", titulo: "Inicio", orden: 0, pintar: pintar,
    icono: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  });
})(typeof self !== "undefined" ? self : this);

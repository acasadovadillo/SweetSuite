/*
 * webkit_asociaciones — Módulo «Presupuestos»: presupuesto anual y proyectos o subvenciones.
 *
 *   #/proyectos                presupuesto anual (lo aprobado en asamblea) frente a lo realizado
 *   #/proyectos/lista          proyectos y subvenciones con su ejecución
 *   #/proyectos/ficha/<id>     un proyecto: datos, presupuesto por partidas y ejecución
 *
 * Lo realizado sale de Tesorería (dinero cobrado y pagado, por categoría). Cómo
 * se aprueba el presupuesto lo dicen vuestros estatutos; cómo se justifica una
 * subvención, sus bases: verificar con asesoría.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, D = WA.Dinero, T = WA.Tesoreria, U = WA.TesUI;

  var anioVista = null;
  function pestanas(actual) {
    return '<nav class="pestanas" aria-label="Apartados de presupuestos"><a href="#/proyectos"' + (actual === "anual" ? ' aria-current="page"' : "") + ">Presupuesto anual</a>" +
      '<a href="#/proyectos/lista"' + (actual === "lista" ? ' aria-current="page"' : "") + ">Proyectos y subvenciones</a></nav>";
  }
  function barra(pct) {
    if (pct === null || pct === undefined) return "";
    var ancho = Math.max(0, Math.min(pct, 100));
    return '<div class="barra-progreso' + (pct > 100 ? " pasada" : "") + '" role="img" aria-label="' + pct + ' %"><span style="width:' + ancho + '%"></span></div>';
  }

  /** Tabla editable de previsto por categoría frente a lo realizado. */
  function tablaEjecucion(ej, editable) {
    var bloque = function (tipo, titulo, totales) {
      var filas = ej.filas.filter(function (f) { return f.tipo === tipo; });
      return '<tbody><tr class="fila-grupo"><th scope="rowgroup" colspan="5">' + titulo + "</th></tr>" + filas.map(function (f) {
        return '<tr><th scope="row">' + esc(f.nombre) + "</th>" +
          '<td class="importe">' + (editable ? '<label class="sr" for="p-' + esc(f.categoriaId) + '">Previsto para ' + esc(f.nombre) + '</label><input class="input-importe" id="p-' + esc(f.categoriaId) +
            '" name="p-' + esc(f.categoriaId) + '" inputmode="decimal" value="' + (f.previsto ? esc(D.formatear(f.previsto, { simbolo: false })) : "") + '">' : esc(D.formatear(f.previsto))) + "</td>" +
          '<td class="importe">' + esc(D.formatear(f.realizado)) + "</td>" +
          "<td>" + (f.pct === null ? '<span class="detalle">—</span>' : f.pct + " %" + barra(f.pct)) + "</td>" +
          '<td class="importe">' + esc(D.formatear(f.diferencia)) + "</td></tr>";
      }).join("") + '<tr class="total"><th scope="row">Total ' + titulo.toLowerCase() + '</th><td class="importe">' + esc(D.formatear(totales.previsto)) + '</td><td class="importe">' +
        esc(D.formatear(totales.realizado)) + "</td><td></td><td class=\"importe\">" + esc(D.formatear(totales.previsto - totales.realizado)) + "</td></tr></tbody>";
    };
    return '<div class="tabla-envoltorio"><table class="tabla tabla-presupuesto"><thead><tr><th scope="col">Partida</th><th scope="col" class="importe">Previsto</th>' +
      '<th scope="col" class="importe">Realizado</th><th scope="col">Ejecución</th><th scope="col" class="importe">Diferencia</th></tr></thead>' +
      bloque("ingreso", "Ingresos", ej.ingresos) + bloque("gasto", "Gastos", ej.gastos) + "</table></div>";
  }

  /** Todas las categorías activas aparecen, aunque no tengan nada previsto ni realizado. */
  function conTodas(previsto, categorias) {
    var p = Object.assign({}, previsto || {});
    (categorias || []).forEach(function (c) { if (c.activa !== false && !(c.id in p)) p[c.id] = 0; });
    return p;
  }

  function leerPrevisto(form) {
    var d = UI.leerFormulario(form), p = {};
    Object.keys(d).forEach(function (k) {
      if (k.indexOf("p-") !== 0) return;
      var v = D.desdeTexto(d[k] || "0");
      if (v) p[k.slice(2)] = v;
    });
    return p;
  }

  // ── Presupuesto anual ───────────────────────────────────────────────────
  async function pintarAnual(cont, datos) {
    var c = await U.cargar(datos);
    var anio = anioVista || +F.hoy().slice(0, 4);
    var previsto = (c.config.presupuestos || {})[anio] || {};
    var res = T.resultados(T.partidas(c.movimientos, c.cuotas, c.anticipos), anio + "-01-01", anio + "-12-31");
    var ej = T.ejecucion(conTodas(previsto, c.config.categorias), res, c.config.categorias);
    var anios = {};
    [anio, +F.hoy().slice(0, 4), +F.hoy().slice(0, 4) + 1].forEach(function (a) { anios[a] = true; });
    Object.keys(c.config.presupuestos || {}).forEach(function (a) { anios[a] = true; });
    var hayAnterior = !!(c.config.presupuestos || {})[anio - 1];
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Presupuestos</h1></div>' + pestanas("anual") +
      '<p class="intro">Lo previsto para el año (normalmente, lo que aprueba la asamblea) frente a lo cobrado y pagado de verdad.</p>' +
      '<div class="barra-filtros"><label>Año <select id="p-anio">' + Object.keys(anios).sort().reverse().map(function (a) {
        return '<option value="' + a + '"' + (+a === anio ? " selected" : "") + ">" + a + "</option>";
      }).join("") + "</select></label>" +
      (hayAnterior && !Object.keys(previsto).length ? '<button type="button" class="btn btn-secundario" id="p-copiar">Copiar el presupuesto de ' + (anio - 1) + "</button>" : "") + "</div>" +
      '<form id="p-form" novalidate>' + tablaEjecucion(ej, true) +
      '<div class="acciones barra-guardar"><button type="submit" class="btn btn-primario">Guardar presupuesto ' + anio + "</button></div></form>" +
      '<p class="detalle">Resultado previsto: ' + esc(D.formatear(ej.ingresos.previsto - ej.gastos.previsto)) + " · Resultado real: " + esc(D.formatear(res.resultado)) + "</p>" +
      U.ayuda("Lo realizado es el dinero cobrado y pagado en el año en cada categoría (incluidas las cuotas y los gastos de anticipos y reembolsos). Las partidas son las categorías de Tesorería → Ajustes.");
    cont.querySelector("#p-anio").addEventListener("change", function (e) { anioVista = +e.target.value; WA.App.repintar(); });
    var bCopiar = cont.querySelector("#p-copiar");
    if (bCopiar) bCopiar.addEventListener("click", async function () {
      c.config.presupuestos[anio] = Object.assign({}, c.config.presupuestos[anio - 1]);
      await datos.escribir("config", c.config);
      UI.aviso("Copiado. Ajusta lo que cambie y guarda.");
      WA.App.repintar();
    });
    cont.querySelector("#p-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      c.config.presupuestos = c.config.presupuestos || {};
      c.config.presupuestos[anio] = leerPrevisto(e.target);
      await datos.escribir("config", c.config);
      UI.aviso("Presupuesto " + anio + " guardado.");
      WA.App.repintar();
    });
  }

  // ── Proyectos y subvenciones ───────────────────────────────────────────
  function ejecucionProyecto(c, p) {
    var partidas = T.partidas(c.movimientos, c.cuotas, c.anticipos).filter(function (x) { return x.proyectoId === p.id; });
    var res = T.resultados(partidas);
    return { res: res, ej: T.ejecucion(p.presupuesto || {}, res, c.config.categorias) };
  }

  async function pintarLista(cont, datos) {
    var c = await U.cargar(datos);
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Presupuestos</h1><button type="button" class="btn btn-primario" id="p-nuevo">Nuevo proyecto o subvención</button></div>' + pestanas("lista") +
      '<p class="intro">Cada proyecto tiene su propio presupuesto por partidas. Al apuntar un gasto o ingreso en Tesorería, elige el proyecto para que cuente aquí.</p>' +
      (c.proyectos.length ? '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Proyectos</caption><thead><tr><th scope="col">Proyecto</th><th scope="col">Fechas</th>' +
        '<th scope="col" class="importe">Concedido</th><th scope="col" class="importe">Gasto previsto</th><th scope="col" class="importe">Gastado</th><th scope="col">Ejecución</th></tr></thead><tbody>' +
        c.proyectos.map(function (p) {
          var x = ejecucionProyecto(c, p);
          var pct = x.ej.gastos.previsto > 0 ? Math.round(x.ej.gastos.realizado / x.ej.gastos.previsto * 1000) / 10 : null;
          return '<tr><th scope="row"><a href="#/proyectos/ficha/' + encodeURIComponent(p.id) + '">' + esc(p.nombre) + "</a><br><span class=\"detalle\">" +
            (p.tipo === "subvencion" ? "Subvención" : "Proyecto") + (p.financiador ? " · " + esc(p.financiador) : "") + (p.estado === "cerrado" ? " · Cerrado" : "") + "</span></th>" +
            "<td>" + esc(F.corta(p.fechaInicio)) + (p.fechaFin ? " – " + esc(F.corta(p.fechaFin)) : "") + "</td>" +
            '<td class="importe">' + (p.importeConcedido ? esc(D.formatear(p.importeConcedido)) : "—") + '</td><td class="importe">' + esc(D.formatear(x.ej.gastos.previsto)) + "</td>" +
            '<td class="importe">' + esc(D.formatear(x.ej.gastos.realizado)) + "</td><td>" + (pct === null ? "—" : pct + " %" + barra(pct)) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="vacio">Todavía no hay proyectos.</p>');
    cont.querySelector("#p-nuevo").addEventListener("click", async function () {
      var g = await datos.guardar("proyectos", { nombre: "Nuevo proyecto", tipo: "proyecto", financiador: "", referencia: "", importeConcedido: 0,
        fechaInicio: F.hoy(), fechaFin: "", estado: "en curso", presupuesto: {}, notas: "" });
      location.hash = "#/proyectos/ficha/" + encodeURIComponent(g.id);
    });
  }

  async function pintarFicha(cont, datos, id) {
    var c = await U.cargar(datos);
    var p = U.buscar(c.proyectos, id);
    if (!p) { cont.innerHTML = '<h1>No encontrado</h1><p><a href="#/proyectos/lista">Volver</a></p>'; return; }
    var x = ejecucionProyecto(c, p);
    var ej = T.ejecucion(conTodas(p.presupuesto, c.config.categorias), x.res, c.config.categorias);
    var lineas = T.libro(c.movimientos, c.cuotas).filter(function (m) { return m.proyectoId === p.id; });
    var gastosAnt = [];
    c.anticipos.forEach(function (a) { a.gastos.forEach(function (g) { if ((g.proyectoId || a.proyectoId) === p.id) gastosAnt.push({ a: a, g: g }); }); });
    cont.innerHTML =
      '<p class="miga"><a href="#/proyectos/lista">Proyectos y subvenciones</a> › ' + esc(p.nombre) + "</p>" +
      "<h1>" + esc(p.nombre) + "</h1>" +
      '<form id="pr-datos" class="formulario tarjeta" novalidate><h2>Datos</h2><div class="rejilla">' +
      UI.campo({ nombre: "nombre", etiqueta: "Nombre", valor: p.nombre, requerido: true, ancho: "completo" }) +
      UI.campo({ nombre: "tipo", etiqueta: "Tipo", tipo: "select", valor: p.tipo, opciones: [["proyecto", "Proyecto propio"], ["subvencion", "Subvención"]] }) +
      UI.campo({ nombre: "financiador", etiqueta: "Quién lo financia", valor: p.financiador }) +
      UI.campo({ nombre: "referencia", etiqueta: "Convocatoria o referencia", valor: p.referencia }) +
      UI.campo({ nombre: "importeConcedido", etiqueta: "Importe concedido (€)", valor: p.importeConcedido ? D.formatear(p.importeConcedido, { simbolo: false }) : "", atributos: 'inputmode="decimal"' }) +
      UI.campo({ nombre: "fechaInicio", etiqueta: "Empieza", tipo: "date", valor: p.fechaInicio }) +
      UI.campo({ nombre: "fechaFin", etiqueta: "Termina", tipo: "date", valor: p.fechaFin }) +
      UI.campo({ nombre: "estado", etiqueta: "Estado", tipo: "select", valor: p.estado, opciones: [["en curso", "En curso"], ["cerrado", "Cerrado"]] }) +
      UI.campo({ nombre: "notas", etiqueta: "Notas", tipo: "textarea", valor: p.notas, ancho: "completo" }) +
      '</div><div class="acciones"><button type="submit" class="btn btn-primario">Guardar datos</button><button type="button" class="btn btn-peligro-suave" id="pr-borrar">Borrar proyecto</button></div></form>' +
      '<section class="tarjeta"><h2>Presupuesto y ejecución</h2><form id="pr-presu" novalidate>' + tablaEjecucion(ej, true) +
      '<div class="acciones"><button type="submit" class="btn btn-primario">Guardar presupuesto</button></div></form>' +
      (p.importeConcedido ? '<p class="detalle">Concedido ' + esc(D.formatear(p.importeConcedido)) + " · cobrado de la subvención: " + esc(D.formatear(x.res.ingresos.subvenciones || 0)) + "</p>" : "") +
      U.ayuda("Qué gastos son justificables y cómo se justifican lo dicen las bases de cada subvención: verificar con la entidad que la concede.") + "</section>" +
      '<section class="tarjeta"><h2>Movimientos del proyecto</h2>' + (lineas.length || gastosAnt.length ? '<div class="tabla-envoltorio"><table class="tabla"><tbody>' +
        lineas.map(function (m) {
          return "<tr><td>" + esc(F.corta(m.fecha)) + "</td><td>" + esc(m.concepto || m.conceptoBanco) + "</td><td>" + esc(U.nombreCategoria(c, m.categoriaId)) + '</td><td class="importe">' + U.importeHtml(T.conSigno(m)) + "</td></tr>";
        }).join("") + gastosAnt.map(function (x2) {
          return "<tr><td>" + esc(F.corta(x2.g.fecha)) + "</td><td>" + esc(x2.g.concepto) + ' <a class="etiqueta" href="#/tesoreria/anticipo/' + encodeURIComponent(x2.a.id) + '">' + (x2.a.tipo === "anticipo" ? "Anticipo" : "Reembolso") +
            "</a></td><td>" + esc(U.nombreCategoria(c, x2.g.categoriaId)) + '</td><td class="importe">' + U.importeHtml(-x2.g.importe) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="vacio">Todavía no hay movimientos con este proyecto.</p>') + "</section>";

    cont.querySelector("#pr-datos").addEventListener("submit", async function (e) {
      e.preventDefault();
      var d = UI.leerFormulario(e.target);
      if (!d.nombre) { UI.marcarError(e.target, "nombre", "Pon un nombre."); return; }
      await datos.guardar("proyectos", Object.assign(p, { nombre: d.nombre, tipo: d.tipo, financiador: d.financiador, referencia: d.referencia,
        importeConcedido: D.desdeTexto(d.importeConcedido || "0") || 0, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin, estado: d.estado, notas: d.notas }));
      UI.aviso("Proyecto guardado.");
      WA.App.repintar();
    });
    cont.querySelector("#pr-presu").addEventListener("submit", async function (e) {
      e.preventDefault();
      p.presupuesto = leerPrevisto(e.target);
      await datos.guardar("proyectos", p);
      UI.aviso("Presupuesto del proyecto guardado.");
      WA.App.repintar();
    });
    cont.querySelector("#pr-borrar").addEventListener("click", async function () {
      if (lineas.length || gastosAnt.length) { UI.aviso("Tiene movimientos enlazados: quítales el proyecto antes de borrarlo (o márcalo como cerrado).", "error"); return; }
      if (!(await UI.confirmar("Se borrará el proyecto.", { titulo: "Borrar proyecto", aceptar: "Borrar", peligro: true }))) return;
      await datos.borrar("proyectos", p.id);
      location.hash = "#/proyectos/lista";
    });
  }

  async function pintar(cont, datos, ruta) {
    if (ruta[0] === "lista") return pintarLista(cont, datos);
    if (ruta[0] === "ficha") return pintarFicha(cont, datos, ruta[1]);
    return pintarAnual(cont, datos);
  }

  WA.App.registrar({
    id: "proyectos", titulo: "Presupuestos", orden: 36, pintar: pintar,
    icono: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M2.5 20h19"/>',
  });
})(typeof self !== "undefined" ? self : this);

/*
 * webkit_asociaciones — Módulo «IVA»: ayuda para el modelo 303 (trimestral) y el resumen anual.
 *
 * ⚠️ Orientativo: suma lo que hay en las facturas. Quien presenta los modelos
 * debe revisarlo (verificar con asesoría). La lógica está en logica/iva.js, con tests.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, D = WA.Dinero, IVA = WA.IVA, U = WA.TesUI;

  var anioVista = null;
  var SITUACION = {
    ingresar: ["estado-aviso", "A ingresar"], compensar: ["estado-neutro", "A compensar"],
    devolver: ["estado-ok", "A devolver"], cero: ["estado-neutro", "Sin actividad / cero"],
  };
  var NOMBRE_T = ["1.er trimestre", "2.º trimestre", "3.er trimestre", "4.º trimestre"];

  function detalleTipos(lista) {
    if (!lista.length) return '<p class="detalle">—</p>';
    return '<ul class="lista-cifras">' + lista.map(function (g) {
      return "<li><span>Al " + g.tipoIva + " %: base " + esc(D.formatear(g.base)) + "</span><strong>" + esc(D.formatear(g.cuota)) + "</strong></li>";
    }).join("") + "</ul>";
  }

  async function pintar(cont, datos) {
    var c = await U.cargar(datos);
    var anio = anioVista || +WA.Fechas.hoy().slice(0, 4);
    var r = IVA.resumenAnual(c.facturas, c.config, anio);
    var avisos = IVA.avisos(c.facturas, c.config);
    var anios = {};
    anios[anio] = true; anios[+WA.Fechas.hoy().slice(0, 4)] = true;
    c.facturas.forEach(function (f) { if (f.fecha) anios[+f.fecha.slice(0, 4)] = true; });
    var devoluciones = c.config.iva.devolucionesSolicitadas || [];

    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>IVA</h1><button type="button" class="btn btn-secundario lectura-ok" id="v-excel">Descargar Excel (libros de facturas)</button></div>' +
      '<div class="caja-aviso">Ayuda orientativa para rellenar el modelo 303 y el resumen anual a partir de las facturas apuntadas. <strong>No es asesoramiento fiscal</strong>: revisadlo con la asesoría antes de presentar.</div>' +
      (!c.config.iva.presenta ? '<p class="intro">Ahora mismo está configurado que la asociación <strong>no presenta IVA</strong> (Tesorería → Ajustes). Estas cifras son solo informativas.</p>' : "") +
      avisos.map(function (a) { return '<div class="caja-aviso">' + esc(a) + "</div>"; }).join("") +
      '<div class="barra-filtros"><label>Año <select id="v-anio">' + Object.keys(anios).sort().reverse().map(function (a) {
        return '<option value="' + a + '"' + (+a === anio ? " selected" : "") + ">" + a + "</option>";
      }).join("") + "</select></label></div>" +
      '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Trimestres</caption><thead><tr><th scope="col">Trimestre</th>' +
      '<th scope="col" class="importe">IVA devengado</th><th scope="col" class="importe">IVA deducible</th><th scope="col" class="importe">Compensado de antes</th>' +
      '<th scope="col" class="importe">Resultado</th><th scope="col">Cómo queda</th></tr></thead><tbody>' +
      r.trimestres.map(function (t, i) {
        var s = SITUACION[t.situacion] || SITUACION.cero;
        return '<tr><th scope="row">' + NOMBRE_T[i] + '</th><td class="importe">' + esc(D.formatear(t.devengado)) + '</td><td class="importe">' + esc(D.formatear(t.deducible)) + "</td>" +
          '<td class="importe">' + esc(D.formatear(t.compensacionAplicada || 0)) + '</td><td class="importe"><strong>' + esc(D.formatear(t.resultado || 0)) + "</strong></td>" +
          '<td><span class="estado ' + s[0] + '">' + s[1] + "</span>" + (t.quedaACompensar ? '<br><span class="detalle">Queda a compensar: ' + esc(D.formatear(t.quedaACompensar)) + "</span>" : "") + "</td></tr>" +
          (t.aviso ? '<tr class="fila-aviso"><td colspan="6"><span class="aviso-iva">⚠️ ' + esc(t.aviso) + "</span>" +
            (i === 3 && (t.situacion === "compensar" || t.situacion === "devolver") ? ' <label class="casilla en-linea"><input type="checkbox" data-devolucion="' + esc(t.clave) + '"' +
              (devoluciones.indexOf(t.clave) >= 0 ? " checked" : "") + "><span>Pedir la devolución en este trimestre</span></label>" : "") + "</td></tr>" : "");
      }).join("") + "</tbody></table></div>" +

      '<h2 class="titulo-seccion">Detalle por trimestre</h2><div class="rejilla-tarjetas">' + r.trimestres.map(function (t, i) {
        return '<section class="tarjeta"><h3>' + NOMBRE_T[i] + "</h3>" +
          "<h4>IVA devengado (facturas emitidas: " + t.nEmitidas + ")</h4>" + detalleTipos(t.devengadoPorTipo) +
          "<h4>IVA soportado deducible (facturas recibidas: " + t.nRecibidas + ")</h4>" + detalleTipos(t.soportadoPorTipo) +
          (t.prorrata < 100 ? '<p class="detalle">Se deduce el ' + t.prorrata + " %: " + esc(D.formatear(t.deducible)) + "</p>" : "") +
          '<ul class="lista-cifras"><li><span>Operaciones exentas</span><strong>' + esc(D.formatear(t.baseExenta)) + "</strong></li>" +
          "<li><span>Operaciones no sujetas</span><strong>" + esc(D.formatear(t.baseNoSujeta)) + "</strong></li>" +
          "<li><span>Retenciones IRPF practicadas (modelo 111)</span><strong>" + esc(D.formatear(t.retenciones)) + "</strong></li></ul></section>";
      }).join("") + "</div>" +

      '<section class="tarjeta"><h2>Resumen anual ' + anio + "</h2>" +
      '<div class="rejilla-tarjetas"><div><h4>IVA devengado</h4>' + detalleTipos(r.devengadoPorTipo) + '<p><strong>Total ' + esc(D.formatear(r.devengado)) + "</strong></p></div>" +
      "<div><h4>IVA soportado deducible</h4>" + detalleTipos(r.soportadoPorTipo) + "<p><strong>Total deducido " + esc(D.formatear(r.deducible)) + "</strong></p></div>" +
      '<div><h4>Resultado del año</h4><ul class="lista-cifras"><li><span>Ingresado en los trimestres</span><strong>' + esc(D.formatear(r.ingresado)) + "</strong></li>" +
      "<li><span>Queda a compensar al acabar el año</span><strong>" + esc(D.formatear(r.quedaACompensar)) + "</strong></li>" +
      "<li><span>Operaciones exentas</span><strong>" + esc(D.formatear(r.baseExenta)) + "</strong></li>" +
      "<li><span>Retenciones IRPF del año</span><strong>" + esc(D.formatear(r.retenciones)) + "</strong></li></ul></div></div></section>" +
      U.ayuda("Cómo se calcula: IVA devengado = el de las facturas emitidas del trimestre (por su fecha). IVA deducible = el de las facturas recibidas marcadas como deducibles, por el porcentaje de deducción indicado en Ajustes. Si el resultado es negativo, en los tres primeros trimestres queda a compensar; en el cuarto se puede pedir la devolución. Las cuotas de socios y las donaciones no llevan IVA y no aparecen aquí.");

    cont.querySelector("#v-anio").addEventListener("change", function (e) { anioVista = +e.target.value; WA.App.repintar(); });
    cont.querySelector("#v-excel").addEventListener("click", function () { U.exportarExcel(c, anio); });
    cont.querySelectorAll("[data-devolucion]").forEach(function (cb) {
      cb.addEventListener("change", async function () {
        var k = cb.getAttribute("data-devolucion");
        var lista = (c.config.iva.devolucionesSolicitadas || []).filter(function (x) { return x !== k; });
        if (cb.checked) lista.push(k);
        c.config.iva.devolucionesSolicitadas = lista;
        await datos.escribir("config", c.config);
        UI.aviso(cb.checked ? "Marcado: se pide la devolución." : "Marcado: queda a compensar.");
        WA.App.repintar();
      });
    });
  }

  WA.App.registrar({
    id: "iva", titulo: "IVA", orden: 34, pintar: pintar,
    icono: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  });
})(typeof self !== "undefined" ? self : this);

/*
 * webkit_asociaciones — Módulo «Informes»: memoria anual y cuentas del ejercicio,
 * listas para imprimir o guardar en PDF desde el navegador.
 *
 *   #/informes            memoria anual de actividades
 *   #/informes/cuentas    cuentas del ejercicio (caja, pendientes, presupuesto,
 *                         modelo ESFL orientativo y situación simplificada)
 *
 * Los datos los calcula logica/informes.js (con tests). Lo que no se puede
 * calcular (presentación, fines, valoración) se escribe aquí y se guarda por año.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, D = WA.Dinero, I = WA.Informes, U = WA.TesUI;

  var anioVista = null;
  var euros = function (c) { return esc(D.formatear(c)); };

  function pestanas(actual) {
    return '<nav class="pestanas no-imprimir" aria-label="Informes"><a href="#/informes"' + (actual === "memoria" ? ' aria-current="page"' : "") + ">Memoria anual</a>" +
      '<a href="#/informes/cuentas"' + (actual === "cuentas" ? ' aria-current="page"' : "") + ">Cuentas</a></nav>";
  }
  async function cargar(datos) {
    var c = await U.cargar(datos);
    var r = await Promise.all([datos.listar("actas"), datos.listar("obligaciones")]);
    c.actas = r[0]; c.obligaciones = r[1];
    c.socios = c.socios.map(WA.Socios.completar);
    return c;
  }
  function selectorAnio(c, anio) {
    // Desde el primer año con datos (movimientos, cuotas, facturas, actividades, actas, saldos iniciales) hasta hoy.
    var actual = +F.hoy().slice(0, 4), fechas = [];
    c.movimientos.forEach(function (m) { fechas.push(m.fecha); });
    c.cuotas.forEach(function (q) { fechas.push(q.fechaEmision, q.pago && q.pago.fecha); });
    c.facturas.forEach(function (f) { fechas.push(f.fecha); });
    c.actividades.forEach(function (a) { fechas.push(String(a.inicio).slice(0, 10)); });
    c.actas.forEach(function (a) { fechas.push(a.fecha); });
    c.config.cuentas.forEach(function (k) { fechas.push(k.fechaSaldoInicial); });
    var primero = Math.min.apply(null, fechas.filter(function (f) { return /^\d{4}-/.test(f || ""); }).map(function (f) { return +f.slice(0, 4); }).concat([actual, anio]));
    var anios = [];
    for (var y = Math.max(actual, anio); y >= Math.max(primero, actual - 30); y--) anios.push(y);
    return '<label>Ejercicio <select id="i-anio">' + anios.map(function (a) {
      return '<option value="' + a + '"' + (+a === anio ? " selected" : "") + ">" + a + "</option>";
    }).join("") + "</select></label>";
  }
  function barraHerramientas(c, anio, extra) {
    return '<div class="barra-filtros no-imprimir">' + selectorAnio(c, anio) +
      '<button type="button" class="btn btn-primario" id="i-imprimir">Imprimir o guardar en PDF</button>' + (extra || "") + "</div>";
  }
  function conectarHerramientas(cont) {
    cont.querySelector("#i-anio").addEventListener("change", function (e) { anioVista = +e.target.value; WA.App.repintar(); });
    cont.querySelector("#i-imprimir").addEventListener("click", function () { window.print(); });
  }
  var enCurso = function (anio) {
    return anio >= +F.hoy().slice(0, 4) ? '<p class="aviso-informe">Ejercicio en curso: datos registrados hasta hoy, ' + esc(F.corta(F.hoy())) + ".</p>" : "";
  };
  var parrafos = function (t) { return esc(t).split(/\n{2,}/).map(function (p) { return "<p>" + p.replace(/\n/g, "<br>") + "</p>"; }).join(""); };
  function tablaConteo(obj, titulo) {
    var ks = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; });
    if (!ks.length) return "";
    return '<table class="tabla tabla-informe"><caption>' + esc(titulo) + "</caption><tbody>" + ks.map(function (k) {
      return "<tr><th scope=\"row\">" + esc(k) + '</th><td class="num">' + obj[k] + "</td></tr>";
    }).join("") + "</tbody></table>";
  }

  // ── Memoria anual ───────────────────────────────────────────────────────
  async function pintarMemoria(cont, datos) {
    var c = await cargar(datos);
    var anio = anioVista || +F.hoy().slice(0, 4);
    var m = I.memoria(c, anio);
    var a = c.asociacion, dom = WA.Direccion.formatear(a.domicilio);
    var t = m.textos;
    var estadoSub = function (e) { return (WA.Obligaciones.ESTADOS_SUBVENCION.filter(function (x) { return x[0] === e; })[0] || ["", ""])[1]; };
    var cargo = function (j) { return j.cargo === "Otro" && j.cargoOtro ? j.cargoOtro : j.cargo; };

    cont.innerHTML =
      '<div class="cabecera-pagina no-imprimir"><h1>Informes</h1></div>' + pestanas("memoria") + barraHerramientas(c, anio) +
      '<details class="tarjeta no-imprimir"' + (!t.presentacion && !t.fines ? " open" : "") + "><summary><strong>Textos de la memoria " + anio + "</strong> (lo que no se calcula solo)</summary>" +
      '<form id="i-textos" class="formulario" novalidate>' +
      UI.campo({ nombre: "presentacion", etiqueta: "Presentación", tipo: "textarea", valor: t.presentacion, ancho: "completo", filas: 4, ayuda: "Unas líneas de la presidencia sobre el año." }) +
      UI.campo({ nombre: "fines", etiqueta: "Fines de la asociación", tipo: "textarea", valor: t.fines, ancho: "completo", filas: 3, ayuda: "Cópialos de los estatutos." }) +
      UI.campo({ nombre: "valoracion", etiqueta: "Valoración y retos para el año siguiente", tipo: "textarea", valor: t.valoracion, ancho: "completo", filas: 4 }) +
      '<div class="acciones"><button type="submit" class="btn btn-primario">Guardar textos</button></div></form></details>' +

      '<article class="documento-impreso informe">' +
      '<p class="di-entidad">' + esc(a.nombre || "") + (a.nif ? " · NIF " + esc(a.nif) : "") + "</p>" +
      "<h1>Memoria de actividades " + anio + "</h1>" + enCurso(anio) +
      (t.presentacion ? "<h3>Presentación</h3>" + parrafos(t.presentacion) : "") +
      "<h3>1. La asociación</h3>" +
      '<table class="tabla tabla-informe"><tbody>' +
      "<tr><th scope=\"row\">Nombre</th><td>" + esc(a.nombre) + (a.siglas ? " (" + esc(a.siglas) + ")" : "") + "</td></tr>" +
      (a.nif ? "<tr><th scope=\"row\">NIF</th><td>" + esc(a.nif) + "</td></tr>" : "") +
      (a.registro || a.numeroRegistro ? "<tr><th scope=\"row\">Inscripción</th><td>" + esc([a.registro, a.numeroRegistro].filter(Boolean).join(", n.º ")) + "</td></tr>" : "") +
      (a.fechaConstitucion ? "<tr><th scope=\"row\">Constitución</th><td>" + esc(F.larga(a.fechaConstitucion)) + "</td></tr>" : "") +
      (dom.completa ? "<tr><th scope=\"row\">Domicilio social</th><td>" + esc(dom.completa) + "</td></tr>" : "") +
      (a.email || a.web ? "<tr><th scope=\"row\">Contacto</th><td>" + esc([a.email, a.telefono, a.web].filter(Boolean).join(" · ")) + "</td></tr>" : "") +
      "</tbody></table>" +
      (t.fines ? "<h4>Fines</h4>" + parrafos(t.fines) : "") +
      "<h4>Junta directiva a 31 de diciembre</h4>" + (m.junta.length ? '<table class="tabla tabla-informe"><tbody>' + m.junta.map(function (j) {
        return "<tr><th scope=\"row\">" + esc(cargo(j)) + "</th><td>" + esc(j.nombre) + "</td></tr>";
      }).join("") + "</tbody></table>" : '<p class="detalle">Sin datos de la junta.</p>') +
      (m.cambiosJunta.length ? '<p class="detalle">Cambios en el año: ' + esc(m.cambiosJunta.map(function (j) {
        return j.nombre + " (" + cargo(j) + (j.desde >= anio + "-01-01" ? ", entra el " + F.corta(j.desde) : "") + (j.hasta && j.hasta <= anio + "-12-31" ? ", sale el " + F.corta(j.hasta) : "") + ")";
      }).join("; ")) + "</p>" : "") +

      "<h3>2. Socios</h3>" +
      '<div class="cifras-informe"><div><span class="cifra">' + m.socios.activos + "</span><span>socios a 31/12</span></div>" +
      '<div><span class="cifra">' + m.socios.altas + "</span><span>altas</span></div>" +
      '<div><span class="cifra">' + m.socios.bajas + "</span><span>bajas</span></div>" +
      '<div><span class="cifra">' + m.socios.inicio + "</span><span>a 1 de enero</span></div></div>" +
      '<div class="rejilla-informe">' + tablaConteo(m.socios.porTipo, "Por tipo") + tablaConteo(m.socios.porSexo, "Por sexo") + tablaConteo(m.socios.porEdad, "Por edad") + "</div>" +

      "<h3>3. Actividades</h3>" +
      '<div class="cifras-informe"><div><span class="cifra">' + m.totalesActividades.n + "</span><span>actividades</span></div>" +
      '<div><span class="cifra">' + m.totalesActividades.inscripciones + "</span><span>inscripciones</span></div>" +
      '<div><span class="cifra">' + m.totalesActividades.asistentes + "</span><span>asistencias registradas</span></div>" +
      '<div><span class="cifra">' + m.totalesActividades.personasDistintas + "</span><span>personas distintas</span></div>" +
      '<div><span class="cifra">' + m.totalesActividades.menores + "</span><span>de ellas, menores</span></div></div>" +
      (m.actividades.length ? '<div class="tabla-envoltorio"><table class="tabla tabla-informe"><thead><tr><th scope="col">Fecha</th><th scope="col">Actividad</th><th scope="col">Lugar</th>' +
        '<th scope="col" class="num">Inscritos</th><th scope="col" class="num">Asistentes</th></tr></thead><tbody>' + m.actividades.map(function (x) {
          return "<tr><td>" + esc(F.corta(x.fecha)) + "</td><td>" + esc(x.titulo) + (x.tipo ? '<br><span class="detalle">' + esc(x.tipo) + (x.proyecto ? " · " + esc(x.proyecto) : "") + "</span>" : "") +
            "</td><td>" + esc(x.lugar) + '</td><td class="num">' + x.inscritas + '</td><td class="num">' + (x.asistentes || (x.estado === "realizada" ? 0 : "—")) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="detalle">No hay actividades registradas en ' + anio + ".</p>") +

      "<h3>4. Proyectos y subvenciones</h3>" +
      (m.proyectos.length ? '<div class="tabla-envoltorio"><table class="tabla tabla-informe"><thead><tr><th scope="col">Proyecto</th><th scope="col" class="importe">Concedido</th>' +
        '<th scope="col" class="importe">Gasto previsto</th><th scope="col" class="importe">Gasto realizado</th></tr></thead><tbody>' + m.proyectos.map(function (p) {
          return "<tr><td>" + esc(p.nombre) + '<br><span class="detalle">' + (p.tipo === "subvencion" ? "Subvención" + (p.financiador ? " de " + esc(p.financiador) : "") + (p.estadoSubvencion ? " · " + esc(estadoSub(p.estadoSubvencion)) : "") : "Proyecto propio") +
            '</span></td><td class="importe">' + (p.concedido ? euros(p.concedido) : "—") + '</td><td class="importe">' + euros(p.gastoPrevisto) + '</td><td class="importe">' + euros(p.gastoRealizado) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="detalle">Sin proyectos en ' + anio + ".</p>") +

      "<h3>5. Órganos de gobierno</h3>" +
      (m.nActas ? "<p>Se celebraron " + m.nActas + (m.nActas === 1 ? " reunión" : " reuniones") + " con acta: " + esc(Object.keys(m.reuniones).map(function (k) { return k + " (" + m.reuniones[k] + ")"; }).join(", ")) + ".</p>" +
        (m.acuerdos.length ? "<h4>Acuerdos adoptados</h4><ul>" + m.acuerdos.map(function (x) {
          return "<li>" + esc(F.corta(x.fecha)) + " · " + esc(x.organo) + ": " + esc(x.texto) + (x.votacion ? ' <span class="detalle">(' + esc(x.votacion) + ")</span>" : "") + "</li>";
        }).join("") + "</ul>" : "") : '<p class="detalle">No hay actas registradas en ' + anio + ".</p>") +

      "<h3>6. Resumen económico</h3>" + resumenEconomico(I.cuentas(c, anio)) +
      '<p class="detalle">Detalle completo en «Cuentas del ejercicio». Importes por criterio de caja (cobros y pagos del año).</p>' +
      (t.valoracion ? "<h3>7. Valoración y retos</h3>" + parrafos(t.valoracion) : "") +
      '<p class="di-pie">Memoria elaborada con datos a ' + esc(F.larga(F.hoy())) + ".</p>" +
      "</article>";
    conectarHerramientas(cont);
    cont.querySelector("#i-textos").addEventListener("submit", async function (e) {
      e.preventDefault();
      var d = UI.leerFormulario(e.target);
      c.config.memorias = c.config.memorias || {};
      c.config.memorias[anio] = { presentacion: d.presentacion, fines: d.fines, valoracion: d.valoracion };
      await datos.escribir("config", c.config);
      UI.aviso("Textos guardados.");
      WA.App.repintar();
    });
  }

  function resumenEconomico(k) {
    return '<table class="tabla tabla-informe"><tbody>' +
      "<tr><th scope=\"row\">Saldo a 1 de enero</th><td class=\"importe\">" + euros(k.saldosInicio.total) + "</td></tr>" +
      "<tr><th scope=\"row\">Ingresos del año</th><td class=\"importe\">" + euros(k.resultados.totalIngresos) + "</td></tr>" +
      "<tr><th scope=\"row\">Gastos del año</th><td class=\"importe\">−" + euros(k.resultados.totalGastos) + "</td></tr>" +
      '<tr class="total"><th scope="row">Resultado</th><td class="importe">' + euros(k.resultados.resultado) + "</td></tr>" +
      "<tr><th scope=\"row\">Saldo a 31 de diciembre</th><td class=\"importe\">" + euros(k.saldosFin.total) + "</td></tr></tbody></table>" + notaSaldo(k);
  }
  /** Por qué el saldo no ha cambiado exactamente lo mismo que el resultado (anticipos y reembolsos). */
  function notaSaldo(k) {
    var dif = (k.saldosFin.total - k.saldosInicio.total) - k.resultados.resultado;
    if (!dif) return "";
    return '<p class="detalle">El saldo ha variado ' + euros(k.saldosFin.total - k.saldosInicio.total) + ", no exactamente el resultado: la diferencia (" + euros(dif) +
      ") son anticipos y reembolsos. Un gasto pagado por una persona cuenta como gasto cuando se justifica, pero el dinero sale de la cuenta cuando se le devuelve; y un anticipo sale de la cuenta antes de convertirse en gasto.</p>";
  }

  // ── Cuentas ─────────────────────────────────────────────────────────────
  async function pintarCuentas(cont, datos) {
    var c = await cargar(datos);
    var anio = anioVista || +F.hoy().slice(0, 4);
    var k = I.cuentas(c, anio);
    var a = c.asociacion;
    var nombreCat = function (id) { return U.nombreCategoria(c, id); };
    var filasCat = function (tipo) {
      var actual = tipo === "ingreso" ? k.resultados.ingresos : k.resultados.gastos;
      var antes = tipo === "ingreso" ? k.anterior.ingresos : k.anterior.gastos;
      var ids = Object.keys(Object.assign({}, actual, antes)).sort(function (x, y) { return (actual[y] || 0) - (actual[x] || 0); });
      return ids.map(function (id) {
        return "<tr><th scope=\"row\">" + esc(nombreCat(id)) + '</th><td class="importe">' + euros(actual[id] || 0) + '</td><td class="importe detalle">' + euros(antes[id] || 0) + "</td></tr>";
      }).join("");
    };
    var p = k.pendientes, s = k.situacion;
    var fila = function (t, v, clase) { return "<tr" + (clase ? ' class="' + clase + '"' : "") + "><th scope=\"row\">" + esc(t) + '</th><td class="importe">' + euros(v) + "</td></tr>"; };

    cont.innerHTML =
      '<div class="cabecera-pagina no-imprimir"><h1>Informes</h1></div>' + pestanas("cuentas") +
      barraHerramientas(c, anio, '<button type="button" class="btn btn-secundario" id="i-excel">Descargar Excel</button>') +
      '<article class="documento-impreso informe">' +
      '<p class="di-entidad">' + esc(a.nombre || "") + (a.nif ? " · NIF " + esc(a.nif) : "") + "</p>" +
      "<h1>Cuentas del ejercicio " + anio + "</h1>" + enCurso(anio) +
      '<p class="aviso-informe">Elaboradas con los cobros y pagos registrados (criterio de caja). Sirven para informar a la asamblea; las cuentas anuales formales de una entidad sin fines lucrativos se llevan por devengo y con partida doble: verificar con asesoría.</p>' +

      "<h3>1. Ingresos y gastos</h3>" +
      '<table class="tabla tabla-informe"><thead><tr><th scope="col">Ingresos</th><th scope="col" class="importe">' + anio + '</th><th scope="col" class="importe">' + (anio - 1) + "</th></tr></thead><tbody>" +
      filasCat("ingreso") + '<tr class="total"><th scope="row">Total ingresos</th><td class="importe">' + euros(k.resultados.totalIngresos) + '</td><td class="importe">' + euros(k.anterior.totalIngresos) + "</td></tr></tbody></table>" +
      '<table class="tabla tabla-informe"><thead><tr><th scope="col">Gastos</th><th scope="col" class="importe">' + anio + '</th><th scope="col" class="importe">' + (anio - 1) + "</th></tr></thead><tbody>" +
      filasCat("gasto") + '<tr class="total"><th scope="row">Total gastos</th><td class="importe">' + euros(k.resultados.totalGastos) + '</td><td class="importe">' + euros(k.anterior.totalGastos) + "</td></tr>" +
      '<tr class="total"><th scope="row">Resultado</th><td class="importe">' + euros(k.resultados.resultado) + '</td><td class="importe">' + euros(k.anterior.resultado) + "</td></tr></tbody></table>" +

      "<h3>2. Saldos de tesorería</h3>" +
      '<table class="tabla tabla-informe"><thead><tr><th scope="col">Cuenta</th><th scope="col" class="importe">1 de enero</th><th scope="col" class="importe">31 de diciembre</th></tr></thead><tbody>' +
      c.config.cuentas.map(function (cu) {
        return "<tr><th scope=\"row\">" + esc(cu.nombre) + '</th><td class="importe">' + euros(k.saldosInicio.porCuenta[cu.id] || 0) + '</td><td class="importe">' + euros(k.saldosFin.porCuenta[cu.id] || 0) + "</td></tr>";
      }).join("") + '<tr class="total"><th scope="row">Total</th><td class="importe">' + euros(k.saldosInicio.total) + '</td><td class="importe">' + euros(k.saldosFin.total) + "</td></tr></tbody></table>" + notaSaldo(k) +

      "<h3>3. Presupuesto y realizado</h3>" +
      (k.presupuesto.ingresos.previsto || k.presupuesto.gastos.previsto ? '<div class="tabla-envoltorio"><table class="tabla tabla-informe"><thead><tr><th scope="col">Partida</th><th scope="col" class="importe">Previsto</th><th scope="col" class="importe">Realizado</th><th scope="col" class="importe">Diferencia</th></tr></thead><tbody>' +
        ["ingreso", "gasto"].map(function (tipo) {
          var tot = tipo === "ingreso" ? k.presupuesto.ingresos : k.presupuesto.gastos;
          return k.presupuesto.filas.filter(function (f) { return f.tipo === tipo && (f.previsto || f.realizado); }).map(function (f) {
            return "<tr><th scope=\"row\">" + (tipo === "ingreso" ? "Ingreso · " : "Gasto · ") + esc(f.nombre) + '</th><td class="importe">' + euros(f.previsto) + '</td><td class="importe">' + euros(f.realizado) + '</td><td class="importe">' + euros(f.diferencia) + "</td></tr>";
          }).join("") + '<tr class="total"><th scope="row">Total ' + (tipo === "ingreso" ? "ingresos" : "gastos") + '</th><td class="importe">' + euros(tot.previsto) + '</td><td class="importe">' + euros(tot.realizado) +
            '</td><td class="importe">' + euros(tot.previsto - tot.realizado) + "</td></tr>";
        }).join("") + "</tbody></table></div>" + '<p class="detalle">Diferencia = previsto menos realizado.</p>' : '<p class="detalle">No hay presupuesto aprobado registrado para ' + anio + ' (Presupuestos → Presupuesto anual).</p>') +

      "<h3>4. Pendiente a 31 de diciembre</h3>" +
      '<table class="tabla tabla-informe"><tbody>' +
      fila("Cuotas de socios sin cobrar (" + p.cuotas.n + ")", p.cuotas.importe) +
      fila("Inscripciones a actividades sin cobrar (" + p.inscripciones.n + ")", p.inscripciones.importe) +
      fila("Facturas emitidas pendientes de cobro (" + p.facturasEmitidas.lista.length + ")", p.facturasEmitidas.importe) +
      fila("Facturas recibidas pendientes de pago (" + p.facturasRecibidas.lista.length + ")", p.facturasRecibidas.importe) +
      fila("Anticipos por justificar o devolver (" + p.anticipos.personasDeben.length + ")", p.anticipos.importeDeben) +
      fila("Reembolsos o anticipos pendientes de pagar a personas (" + p.anticipos.seLesDebe.length + ")", p.anticipos.importeSeLesDebe) +
      (c.config.iva.presenta ? fila("IVA a compensar en ejercicios siguientes", p.ivaACompensar) : "") +
      "</tbody></table>" +

      "<h3>5. Estado de situación simplificado a 31 de diciembre</h3>" +
      '<p class="aviso-informe">No es el balance oficial: no incluye inmovilizado, existencias ni amortizaciones.</p>' +
      '<div class="rejilla-informe"><table class="tabla tabla-informe"><caption>Lo que se tiene y se debe a la asociación</caption><tbody>' +
      fila("Tesorería (bancos y caja)", s.activo.tesoreria) + fila("Cuotas pendientes", s.activo.cuotas) + fila("Inscripciones pendientes", s.activo.inscripciones) +
      fila("Facturas pendientes de cobro", s.activo.clientes) + fila("Anticipos por justificar", s.activo.anticipos) + (s.activo.iva ? fila("IVA a compensar", s.activo.iva) : "") +
      fila("Total", s.totalActivo, "total") + "</tbody></table>" +
      '<table class="tabla tabla-informe"><caption>Lo que debe la asociación</caption><tbody>' +
      fila("Facturas pendientes de pago", s.pasivo.proveedores) + fila("Pendiente de pagar a personas", s.pasivo.personas) + fila("Total", s.totalPasivo, "total") +
      fila("Diferencia (fondos propios aproximados)", s.neto, "total") + "</tbody></table></div>" +

      "<h3>6. Cuenta de resultados con la estructura del modelo para entidades sin fines lucrativos</h3>" +
      '<p class="aviso-informe">Aproximación orientativa: agrupa las categorías de la tesorería en las partidas del modelo abreviado (la partida de cada categoría se cambia en Tesorería → Ajustes). Usa criterio de caja; el modelo oficial va por devengo. Verificar con asesoría.</p>' +
      '<table class="tabla tabla-informe"><tbody>' + k.esfl.lineas.filter(function (l) { return l.importe || ["1a", "1d", "9"].indexOf(l.id) >= 0; }).map(function (l) {
        return "<tr><th scope=\"row\">" + esc(l.texto) + '</th><td class="importe">' + euros(l.importe) + "</td></tr>";
      }).join("") +
      fila("A.1) Excedente de la actividad", k.esfl.excedenteActividad, "total") +
      fila("A.2) Excedente de las operaciones financieras", k.esfl.excedenteFinanciero, "total") +
      fila("A.4) Excedente del ejercicio", k.esfl.excedente, "total") + "</tbody></table>" +
      (k.esfl.sinPartida.length ? '<p class="detalle">Sin partida asignada (se han sumado a «otros ingresos» u «otros gastos»): ' + esc(k.esfl.sinPartida.map(function (x) { return x.categoria + " (" + (x.tipo === "ingreso" ? "ingresos" : "gastos") + ") " + D.formatear(x.importe); }).join(", ")) + ".</p>" : "") +
      '<p class="di-pie">Datos a ' + esc(F.larga(F.hoy())) + ".</p>" +
      '<div class="di-firmas"><div><p>Vº Bº La Presidencia</p><div class="di-firma"></div></div><div><p>La Tesorería</p><div class="di-firma"></div></div></div>' +
      "</article>";
    conectarHerramientas(cont);
    cont.querySelector("#i-excel").addEventListener("click", function () { U.exportarExcel(c, anio); });
  }

  async function pintar(cont, datos, ruta) {
    if (ruta[0] === "cuentas") return pintarCuentas(cont, datos);
    return pintarMemoria(cont, datos);
  }

  WA.App.registrar({
    id: "informes", titulo: "Informes", orden: 50, pintar: pintar,
    icono: '<path d="M5 3.5h10l4 4v13H5z"/><path d="M8.5 16v-3M12 16v-6M15.5 16v-4"/>',
  });
})(typeof self !== "undefined" ? self : this);

/*
 * Agora — Módulo «Actividades».
 *
 *   #/actividades                 calendario del mes y próximas actividades
 *   #/actividades/lista           todas, con búsqueda
 *   #/actividades/nueva           alta
 *   #/actividades/ficha/<id>      datos, inscripciones, cobros, asistencia y balance
 *   #/actividades/asistencia/<id> hoja de asistencia para imprimir (con columna de firma)
 *
 * La lógica (aforo, lista de espera, cobros, menores, .ics) está en
 * logica/actividades.js, con tests.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, D = WA.Dinero, A = WA.Actividades, S = WA.Socios, U = WA.TesUI, T = WA.Tesoreria;

  var vista = { anio: null, mes: null, texto: "", cuando: "proximas", canceladas: false };
  var DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
  var ESTADO_CLASE = { prevista: "estado-ok", realizada: "estado-neutro", cancelada: "estado-error" };

  function pestanas(actual) {
    return '<nav class="pestanas" aria-label="Vistas de actividades"><a href="#/actividades"' + (actual === "calendario" ? ' aria-current="page"' : "") + ">Calendario</a>" +
      '<a href="#/actividades/lista"' + (actual === "lista" ? ' aria-current="page"' : "") + ">Todas</a></nav>";
  }

  var hora = function (iso) { return String(iso || "").slice(11, 16); };
  /** «sáb 10/10/2026 · 09:00–14:00», «… (todo el día)» o con dos días. */
  function cuando(a) {
    var d0 = A.fechaDe(a), d1 = String(a.fin || "").slice(0, 10);
    var f0 = F.desdeISO(d0);
    var dia = f0 ? DIAS[(f0.getDay() + 6) % 7] + " " : "";
    if (a.todoElDia) return dia + F.corta(d0) + (d1 && d1 > d0 ? " – " + F.corta(d1) : "") + " (todo el día)";
    if (d1 && d1 > d0) return dia + F.corta(d0) + " " + hora(a.inicio) + " → " + F.corta(d1) + " " + hora(a.fin);
    return dia + F.corta(d0) + " · " + hora(a.inicio) + (hora(a.fin) && a.fin > a.inicio ? "–" + hora(a.fin) : "");
  }
  function plazasTexto(a) {
    var n = A.ocupadas(a);
    return a.aforo > 0 ? n + "/" + a.aforo + " plazas" : n + (n === 1 ? " inscrita" : " inscritas");
  }

  async function cargar(datos) {
    var c = await U.cargar(datos);
    c.socios = c.socios.map(S.completar);
    return c;
  }

  // ── Calendario ──────────────────────────────────────────────────────────
  async function pintarCalendario(cont, datos) {
    var c = await cargar(datos);
    var hoy = F.hoy();
    var anio = vista.anio || +hoy.slice(0, 4), mes = vista.mes || +hoy.slice(5, 7);
    var semanas = A.mes(c.actividades, anio, mes);
    // Los vencimientos de obligaciones y subvenciones también aparecen en el calendario.
    var primerDia = semanas[0][0].fecha, ultimoDia = semanas[semanas.length - 1][6].fecha;
    var venc = WA.ObligacionesUI ? await WA.ObligacionesUI.vencimientos(datos, primerDia, ultimoDia) : [];
    var vencPorDia = {};
    venc.forEach(function (v) { (vencPorDia[v.fecha] = vencPorDia[v.fecha] || []).push(v); });
    var vencMes = venc.filter(function (v) { return v.fecha.slice(0, 7) === anio + "-" + String(mes).padStart(2, "0"); });
    var delMes = A.ordenar(c.actividades).filter(function (a) { return A.fechaDe(a).slice(0, 7) === anio + "-" + String(mes).padStart(2, "0"); });
    var proximas = A.ordenar(c.actividades).filter(function (a) { return A.fechaDe(a) >= hoy && a.estado !== "cancelada"; }).slice(0, 5);
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Actividades</h1><div class="acciones-cabecera">' + botonIcs(c) +
      '<a class="btn btn-primario" href="#/actividades/nueva">Nueva actividad</a></div></div>' + pestanas("calendario") +
      '<div class="calendario-barra"><button type="button" class="btn btn-secundario btn-pequeno lectura-ok" data-mes="-1" aria-label="Mes anterior">‹</button>' +
      '<h2 class="calendario-titulo">' + esc(F.MESES[mes - 1].charAt(0).toUpperCase() + F.MESES[mes - 1].slice(1)) + " " + anio + "</h2>" +
      '<button type="button" class="btn btn-secundario btn-pequeno lectura-ok" data-mes="1" aria-label="Mes siguiente">›</button>' +
      '<button type="button" class="btn btn-secundario btn-pequeno lectura-ok" data-mes="0">Hoy</button></div>' +
      '<div class="calendario" role="grid" aria-label="Calendario de ' + esc(F.MESES[mes - 1]) + '">' +
      '<div class="cal-fila cal-cabecera" role="row">' + DIAS.map(function (d) { return '<div role="columnheader">' + d + "</div>"; }).join("") + "</div>" +
      semanas.map(function (sem) {
        return '<div class="cal-fila" role="row">' + sem.map(function (d) {
          return '<div role="gridcell" class="cal-dia' + (d.delMes ? "" : " fuera") + (d.fecha === hoy ? " hoy" : "") + '"><span class="cal-num">' + +d.fecha.slice(8) + "</span>" +
            d.actividades.map(function (a) {
              return '<a class="cal-act ' + a.estado + '" href="#/actividades/ficha/' + encodeURIComponent(a.id) + '">' + (a.todoElDia ? "" : "<b>" + esc(hora(a.inicio)) + "</b> ") + esc(a.titulo) + "</a>";
            }).join("") + (vencPorDia[d.fecha] || []).map(function (v) {
              return '<a class="cal-act cal-oblig ' + v.estado + '" href="' + (v.origen === "subvencion" ? "#/proyectos/ficha/" + encodeURIComponent(v.proyectoId) : "#/obligaciones") + '" title="' + esc(v.titulo + (v.etiqueta ? " · " + v.etiqueta : "")) + '">⚑ ' + esc(v.titulo) + "</a>";
            }).join("") + "</div>";
        }).join("") + "</div>";
      }).join("") + "</div>" +
      '<section class="tarjeta" aria-labelledby="t-mes"><h2 id="t-mes">Este mes</h2>' + listaCompacta(delMes, "No hay actividades este mes.") +
      (vencMes.length ? '<h3>Plazos y obligaciones</h3><ul class="lista-actividades">' + vencMes.map(function (v) {
        return '<li><a href="' + (v.origen === "subvencion" ? "#/proyectos/ficha/" + encodeURIComponent(v.proyectoId) : "#/obligaciones") + '"><strong>⚑ ' + esc(v.titulo) + "</strong></a>" +
          '<span class="detalle">' + esc(F.corta(v.fecha)) + (v.etiqueta ? " · " + esc(v.etiqueta) : "") + (v.estado === "hecha" ? " · hecha" : "") + "</span></li>";
      }).join("") + "</ul>" : "") + "</section>" +
      '<section class="tarjeta" aria-labelledby="t-prox"><h2 id="t-prox">Próximas</h2>' + listaCompacta(proximas, "No hay actividades previstas.") + "</section>";
    cont.querySelectorAll("[data-mes]").forEach(function (b) {
      b.addEventListener("click", function () {
        var paso = +b.getAttribute("data-mes");
        if (paso === 0) { vista.anio = null; vista.mes = null; }
        else { var f = new Date(anio, mes - 1 + paso, 1); vista.anio = f.getFullYear(); vista.mes = f.getMonth() + 1; }
        WA.App.repintar();
      });
    });
    conectarIcs(cont, datos, c);
  }

  function listaCompacta(lista, vacio) {
    if (!lista.length) return '<p class="vacio">' + vacio + "</p>";
    return '<ul class="lista-actividades">' + lista.map(function (a) {
      return '<li><a href="#/actividades/ficha/' + encodeURIComponent(a.id) + '"><strong>' + esc(a.titulo) + '</strong></a><span class="detalle">' + esc(cuando(a)) +
        (a.lugar ? " · " + esc(a.lugar) : "") + " · " + esc(plazasTexto(a)) + "</span>" +
        (a.estado !== "prevista" ? ' <span class="estado ' + ESTADO_CLASE[a.estado] + '">' + A.ESTADOS[a.estado] + "</span>" : "") + "</li>";
    }).join("") + "</ul>";
  }

  // ── Exportar a calendario (.ics) ────────────────────────────────────────
  function botonIcs(c) {
    return '<label class="sr" for="a-zona">Horario</label><select id="a-zona" class="select-pequeno" title="Horario del calendario">' +
      [["Europe/Madrid", "Horario peninsular"], ["Atlantic/Canary", "Horario canario"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (c.config.zonaHoraria === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select>" +
      '<button type="button" class="btn btn-secundario lectura-ok" id="a-ics">Descargar calendario (.ics)</button>';
  }
  function conectarIcs(cont, datos, c) {
    cont.querySelector("#a-zona").addEventListener("change", async function (e) {
      c.config.zonaHoraria = e.target.value;
      await datos.escribir("config", c.config);
      UI.aviso("Horario guardado.");
    });
    cont.querySelector("#a-ics").addEventListener("click", function () {
      descargarIcs(c, c.actividades, "actividades-" + F.hoy() + ".ics");
      UI.aviso("Calendario descargado. Ábrelo o impórtalo en Google Calendar, Outlook o el calendario del móvil.");
    });
  }
  function descargarIcs(c, actividades, nombre) {
    var texto = A.ics(actividades, { nombreCalendario: c.asociacion.nombre || "Actividades", zona: c.config.zonaHoraria });
    UI.descargar(nombre, texto, "text/calendar;charset=utf-8");
  }

  // ── Lista ───────────────────────────────────────────────────────────────
  async function pintarLista(cont, datos) {
    var c = await cargar(datos);
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Actividades</h1><div class="acciones-cabecera">' + botonIcs(c) +
      '<a class="btn btn-primario" href="#/actividades/nueva">Nueva actividad</a></div></div>' + pestanas("lista") +
      '<div class="barra-filtros"><label><span class="sr">Cuándo</span><select id="l-cuando">' +
      [["proximas", "Próximas"], ["pasadas", "Pasadas"], ["todas", "Todas"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (vista.cuando === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></label>" +
      '<label class="filtro-texto"><span class="sr">Buscar</span><input type="search" id="l-buscar" placeholder="Buscar por título, lugar o responsable…" value="' + esc(vista.texto) + '"></label></div>' +
      '<div id="l-tabla"></div>';
    function refrescar() {
      var hoy = F.hoy(), t = vista.texto.trim().toLowerCase();
      var lista = A.ordenar(c.actividades).filter(function (a) {
        if (vista.cuando === "proximas" && A.fechaDe(a) < hoy) return false;
        if (vista.cuando === "pasadas" && A.fechaDe(a) >= hoy) return false;
        return !t || [a.titulo, a.lugar, a.responsable, a.tipo].join(" ").toLowerCase().indexOf(t) >= 0;
      });
      if (vista.cuando === "pasadas") lista.reverse();
      cont.querySelector("#l-tabla").innerHTML = !lista.length ? '<p class="vacio">No hay actividades.</p>' :
        '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Actividades</caption><thead><tr><th scope="col">Cuándo</th><th scope="col">Actividad</th>' +
        '<th scope="col">Plazas</th><th scope="col" class="solo-ancho">Para</th><th scope="col">Estado</th></tr></thead><tbody>' +
        lista.map(function (a) {
          var r = A.resumen(a, c.socios);
          return "<tr><td>" + esc(cuando(a)) + '</td><th scope="row"><a href="#/actividades/ficha/' + encodeURIComponent(a.id) + '">' + esc(a.titulo) + "</a>" +
            (a.lugar ? '<br><span class="detalle">' + esc(a.lugar) + "</span>" : "") + "</th>" +
            "<td>" + esc(plazasTexto(a)) + (r.espera ? '<br><span class="detalle">' + r.espera + " en espera</span>" : "") + "</td>" +
            '<td class="solo-ancho">' + (a.abierta === "socios" ? "Solo socios" : "Abierta") + "</td>" +
            '<td><span class="estado ' + ESTADO_CLASE[a.estado] + '">' + A.ESTADOS[a.estado] + "</span></td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    refrescar();
    cont.querySelector("#l-cuando").addEventListener("change", function (e) { vista.cuando = e.target.value; refrescar(); });
    cont.querySelector("#l-buscar").addEventListener("input", function (e) { vista.texto = e.target.value; refrescar(); });
    conectarIcs(cont, datos, c);
  }

  // ── Ficha ───────────────────────────────────────────────────────────────
  function personas(c) {
    var n = {};
    c.junta.forEach(function (j) { if (!j.hasta) n[j.nombre] = true; });
    c.socios.forEach(function (s) { if (S.estado(s) === "activo") n[S.nombreCompleto(s)] = true; });
    return Object.keys(n).sort(function (a, b) { return a.localeCompare(b, "es"); });
  }

  function formularioDatos(a, c) {
    var tipoFecha = a.todoElDia ? "date" : "datetime-local";
    var valor = function (iso) { return a.todoElDia ? String(iso || "").slice(0, 10) : String(iso || "").slice(0, 16); };
    return '<form id="a-datos" class="formulario" novalidate>' +
      '<section class="tarjeta"><h2>Qué, cuándo y dónde</h2><div class="rejilla-12">' +
      UI.campo({ nombre: "titulo", etiqueta: "Título", valor: a.titulo, requerido: true, clase: "col-7 col-movil-completo" }) +
      UI.campo({ nombre: "tipo", etiqueta: "Tipo", valor: a.tipo, lista: A.TIPOS, clase: "col-5 col-movil-completo" }) +
      UI.campo({ nombre: "inicio", etiqueta: "Empieza", tipo: tipoFecha, valor: valor(a.inicio), requerido: true, clase: "col-4 col-movil-completo" }) +
      UI.campo({ nombre: "fin", etiqueta: "Termina", tipo: tipoFecha, valor: valor(a.fin), clase: "col-4 col-movil-completo" }) +
      '<div class="col-4 col-movil-completo"><label class="casilla"><input type="checkbox" name="todoElDia"' + (a.todoElDia ? " checked" : "") + "><span>Todo el día</span></label></div>" +
      UI.campo({ nombre: "lugar", etiqueta: "Lugar", valor: a.lugar, clase: "col-7 col-movil-completo" }) +
      UI.campo({ nombre: "responsable", etiqueta: "Responsable", valor: a.responsable, lista: personas(c), clase: "col-5 col-movil-completo" }) +
      UI.campo({ nombre: "descripcion", etiqueta: "Descripción", tipo: "textarea", valor: a.descripcion, clase: "col-12" }) +
      UI.campo({ nombre: "estado", etiqueta: "Estado", tipo: "select", valor: a.estado, opciones: Object.keys(A.ESTADOS).map(function (k) { return [k, A.ESTADOS[k]]; }), clase: "col-4" }) +
      UI.campo({ nombre: "proyectoId", etiqueta: "Proyecto o subvención", tipo: "select", valor: a.proyectoId, opciones: U.opcionesProyectos(c), clase: "col-8 col-movil-completo" }) +
      "</div></section>" +
      '<section class="tarjeta"><h2>Inscripción</h2><div class="rejilla-12">' +
      UI.campo({ nombre: "abierta", etiqueta: "Pueden apuntarse", tipo: "select", valor: a.abierta, opciones: [["todos", "Socios y no socios"], ["socios", "Solo socios"]], clase: "col-4 col-movil-completo" }) +
      UI.campo({ nombre: "aforo", etiqueta: "Plazas", tipo: "number", valor: a.aforo ? String(a.aforo) : "", clase: "col-3", atributos: 'min="0" step="1"', ayuda: "Vacío = sin límite." }) +
      '<div class="col-5 col-movil-completo"><label class="casilla"><input type="checkbox" name="listaEspera"' + (a.listaEspera ? " checked" : "") +
      "><span>Lista de espera cuando se llene</span></label></div>" +
      UI.campo({ nombre: "precioSocio", etiqueta: "Precio para socios (€)", valor: a.precioSocio ? D.formatear(a.precioSocio, { simbolo: false }) : "", clase: "col-4", atributos: 'inputmode="decimal"', ayuda: "Vacío = gratis." }) +
      UI.campo({ nombre: "precioGeneral", etiqueta: "Precio para no socios (€)", valor: a.precioGeneral ? D.formatear(a.precioGeneral, { simbolo: false }) : "", clase: "col-4 solo-abierta", atributos: 'inputmode="decimal"' }) +
      '<div class="col-12"><label class="casilla"><input type="checkbox" name="autorizacionMenores"' + (a.autorizacionMenores ? " checked" : "") +
      "><span>Los menores necesitan autorización firmada de su madre, padre o tutor</span></label></div>" +
      UI.campo({ nombre: "notas", etiqueta: "Notas internas", tipo: "textarea", valor: a.notas, clase: "col-12", filas: 2 }) +
      "</div>" + U.ayuda("Si se cobra la inscripción, al marcarla pagada entra en Tesorería como ingreso de «Inscripciones a actividades». Qué autorizaciones hacen falta para menores y cómo se custodian: verificar con asesoría.") +
      "</section>" +
      '<div class="acciones barra-guardar"><button type="submit" class="btn btn-primario">' + (a.id ? "Guardar cambios" : "Crear actividad") + "</button>" +
      '<a class="btn btn-secundario" href="#/actividades">Volver</a></div></form>';
  }

  function leerDatos(form, a) {
    var d = UI.leerFormulario(form);
    var todo = !!d.todoElDia;
    var norm = function (v, porDefecto) {
      if (!v) return porDefecto || "";
      return todo ? String(v).slice(0, 10) + "T00:00" : String(v).slice(0, 16);
    };
    var inicio = norm(d.inicio);
    var aforo = parseInt(d.aforo, 10);
    return Object.assign(a, {
      titulo: d.titulo, tipo: d.tipo, inicio: inicio, fin: norm(d.fin, inicio), todoElDia: todo, lugar: d.lugar, responsable: d.responsable,
      descripcion: d.descripcion, estado: d.estado, proyectoId: d.proyectoId, abierta: d.abierta, aforo: isFinite(aforo) && aforo > 0 ? aforo : 0,
      listaEspera: !!d.listaEspera, precioSocio: D.desdeTexto(d.precioSocio || "0") || 0,
      precioGeneral: d.abierta === "socios" ? 0 : D.desdeTexto(d.precioGeneral || "0") || 0,
      autorizacionMenores: !!d.autorizacionMenores, notas: d.notas,
    });
  }

  async function pintarFicha(cont, datos, id) {
    var c = await cargar(datos);
    var a = id ? U.buscar(c.actividades, id) : A.vacia();
    if (!a) { cont.innerHTML = '<h1>Actividad no encontrada</h1><p><a href="#/actividades">Volver</a></p>'; return; }
    var nueva = !a.id;
    var porId = {};
    c.socios.forEach(function (s) { porId[s.id] = s; });
    var r = nueva ? null : A.resumen(a, c.socios);
    var partidas = T.partidas(c.movimientos, c.cuotas, c.anticipos, c.actividades);
    var bal = nueva ? null : A.balance(a.id, partidas);
    var enlazadas = T.inscripcionesEnlazadas(c.movimientos);

    cont.innerHTML =
      '<p class="miga"><a href="#/actividades">Actividades</a> › ' + esc(nueva ? "Nueva" : a.titulo) + "</p>" +
      '<div class="cabecera-pagina"><h1>' + esc(nueva ? "Nueva actividad" : a.titulo) + "</h1>" +
      (nueva ? "" : '<span class="estado ' + ESTADO_CLASE[a.estado] + '">' + A.ESTADOS[a.estado] + "</span>") + "</div>" + WA.UI.firma(a) +
      (nueva ? "" : '<p class="intro">' + esc(cuando(a)) + (a.lugar ? " · " + esc(a.lugar) : "") + "</p>") +
      (nueva ? "" :
        '<div class="rejilla-tarjetas cifras">' +
        '<section class="tarjeta"><h2>Inscritas</h2><p class="cifra">' + esc(plazasTexto(a)) + "</p>" + (r.espera ? '<p class="detalle">' + r.espera + " en lista de espera</p>" : "") + "</section>" +
        '<section class="tarjeta"><h2>Asistencia</h2><p class="cifra">' + r.asistentes + '</p><p class="detalle">' + (r.noAsistieron ? r.noAsistieron + " no vinieron" : "Marca quién vino en la lista") + "</p></section>" +
        '<section class="tarjeta"><h2>Menores</h2><p class="cifra">' + r.menores + "</p>" +
        (r.menoresSinAutorizacion ? '<p><span class="estado estado-error">' + r.menoresSinAutorizacion + " sin autorización</span></p>" : "") + "</section>" +
        '<section class="tarjeta"><h2>Cobrado</h2><p class="cifra">' + esc(D.formatear(r.recaudado)) + "</p>" +
        (r.pendienteCobro ? '<p class="detalle">Pendiente: ' + esc(D.formatear(r.pendienteCobro)) + "</p>" : "") + "</section></div>" +

        '<section class="tarjeta" aria-labelledby="t-insc"><div class="tarjeta-cabecera"><h2 id="t-insc">Inscripciones</h2><div class="acciones-cabecera">' +
        '<button type="button" class="btn btn-primario" id="i-nueva"' + (a.estado === "cancelada" ? " disabled" : "") + ">Inscribir a alguien</button></div></div>" +
        '<label class="casilla"><input type="checkbox" id="i-canceladas"' + (vista.canceladas ? " checked" : "") + "><span>Ver también las canceladas</span></label>" +
        '<div id="i-tabla">' + tablaInscripciones(a, porId, enlazadas) + "</div>" +
        '<div class="acciones"><a class="btn btn-secundario" href="#/actividades/asistencia/' + encodeURIComponent(a.id) + '">Hoja de asistencia para imprimir</a>' +
        '<button type="button" class="btn btn-secundario lectura-ok" id="i-csv">Exportar inscritos (CSV)</button>' +
        '<button type="button" class="btn btn-secundario lectura-ok" id="i-correos">Copiar correos</button></div></section>' +

        '<section class="tarjeta" aria-labelledby="t-bal"><div class="tarjeta-cabecera"><h2 id="t-bal">Balance económico</h2>' +
        '<button type="button" class="btn btn-secundario" id="b-gasto">Apuntar un gasto</button></div>' +
        '<ul class="lista-cifras"><li><span>Ingresos (inscripciones y otros)</span><strong>' + esc(D.formatear(bal.ingresos)) + "</strong></li>" +
        "<li><span>Gastos</span><strong>" + esc(D.formatear(bal.gastos)) + '</strong></li><li class="total"><span>Resultado</span><strong class="' + (bal.resultado < 0 ? "importe-negativo" : "") + '">' +
        esc(D.formatear(bal.resultado)) + "</strong></li></ul>" +
        U.ayuda("Cuenta lo cobrado de las inscripciones y los movimientos o gastos de anticipos que tengan esta actividad elegida.") + "</section>") +
      formularioDatos(a, c) +
      (nueva ? "" : '<div class="acciones"><button type="button" class="btn btn-secundario" id="a-duplicar">Duplicar</button>' +
        '<button type="button" class="btn btn-secundario lectura-ok" id="a-ics1">Añadir a mi calendario (.ics)</button>' +
        '<button type="button" class="btn btn-peligro-suave" id="a-borrar">Borrar actividad</button></div>');

    var form = cont.querySelector("#a-datos");
    function dependencias() {
      var d = UI.leerFormulario(form);
      cont.querySelectorAll(".solo-abierta").forEach(function (x) { x.hidden = d.abierta === "socios"; });
      var tipo = d.todoElDia ? "date" : "datetime-local";
      ["inicio", "fin"].forEach(function (n) {
        var el = form.elements[n];
        if (el.type === tipo) return;
        var v = el.value;
        el.type = tipo;
        el.value = tipo === "date" ? v.slice(0, 10) : (v ? v.slice(0, 10) + "T" + (n === "inicio" ? "18:00" : "20:00") : "");
      });
    }
    form.addEventListener("change", dependencias);
    dependencias();
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var x = leerDatos(form, a);
      var errores = {};
      if (!x.titulo) errores.titulo = "Escribe el título.";
      if (!F.esValida(String(x.inicio).slice(0, 10))) errores.inicio = "Pon la fecha.";
      if (x.fin && x.fin < x.inicio) errores.fin = "No puede terminar antes de empezar.";
      ["titulo", "inicio", "fin"].forEach(function (k) { UI.marcarError(form, k, errores[k] || ""); });
      if (Object.keys(errores).length) { UI.aviso("Revisa los campos marcados.", "error"); return; }
      // Si se reduce el aforo por debajo de las inscritas, no se echa a nadie: solo se avisa.
      var aviso = x.aforo > 0 && A.ocupadas(x) > x.aforo ? " Hay más inscritas que plazas." : "";
      var g = await datos.guardar("actividades", x);
      UI.aviso((nueva ? "Actividad creada." : "Cambios guardados.") + aviso, aviso ? "info" : "ok");
      if (nueva) location.hash = "#/actividades/ficha/" + encodeURIComponent(g.id); else WA.App.repintar();
    });
    if (nueva) return;

    var guardarAct = async function (nuevaA, texto) { await datos.guardar("actividades", nuevaA); if (texto) UI.aviso(texto); WA.App.repintar(); };
    cont.querySelector("#i-canceladas").addEventListener("change", function (e) {
      vista.canceladas = e.target.checked;
      cont.querySelector("#i-tabla").innerHTML = tablaInscripciones(a, porId, enlazadas);
    });
    cont.querySelector("#i-nueva").addEventListener("click", function () { nuevaInscripcion(datos, c, a); });
    cont.querySelector("#i-tabla").addEventListener("change", async function (e) {
      var el = e.target, insId = el.getAttribute("data-ins");
      if (!insId) return;
      if (el.name === "asistio") await guardarAct(A.cambiarInscripcion(a, insId, { asistio: el.value === "" ? null : el.value === "si" }));
      if (el.name === "autorizacion") await guardarAct(A.cambiarInscripcion(a, insId, { autorizacion: el.checked }), el.checked ? "Autorización marcada." : "");
    });
    cont.querySelector("#i-tabla").addEventListener("click", async function (e) {
      var b = e.target.closest("[data-accion]");
      if (!b) return;
      var insId = b.getAttribute("data-ins"), ins = a.inscripciones.filter(function (i) { return i.id === insId; })[0];
      if (b.getAttribute("data-accion") === "cobrar") {
        var pago = await pedirPago(ins, porId[ins.socioId], c.config);
        if (pago) await guardarAct(A.cobrar(a, insId, pago), "Inscripción cobrada.");
      } else await masOpciones(datos, c, a, ins, enlazadas, guardarAct);
    });
    cont.querySelector("#i-csv").addEventListener("click", function () { exportarCsv(a, porId); });
    cont.querySelector("#i-correos").addEventListener("click", async function () {
      var correos = a.inscripciones.filter(function (i) { return i.estado !== "cancelada" && /@/.test(i.contacto); }).map(function (i) { return i.contacto; });
      try { await navigator.clipboard.writeText(correos.join(", ")); UI.aviso(correos.length + " correos copiados. Pégalos en «CCO» para que nadie vea los de los demás."); }
      catch (err) { UI.aviso("No se han podido copiar: " + correos.join(", "), "info"); }
    });
    cont.querySelector("#b-gasto").addEventListener("click", async function () {
      if (await U.editarMovimiento(datos, c, null, { tipo: "gasto", actividadId: a.id, proyectoId: a.proyectoId, categoriaId: "actividades", concepto: a.titulo + ": " })) WA.App.repintar();
    });
    cont.querySelector("#a-duplicar").addEventListener("click", async function () {
      var g = await datos.guardar("actividades", A.duplicar(a));
      UI.aviso("Copia creada sin inscripciones. Cambia la fecha.");
      location.hash = "#/actividades/ficha/" + encodeURIComponent(g.id);
    });
    cont.querySelector("#a-ics1").addEventListener("click", function () { descargarIcs(c, [a], "actividad-" + A.fechaDe(a) + ".ics"); });
    cont.querySelector("#a-borrar").addEventListener("click", async function () {
      var pagadas = a.inscripciones.filter(function (i) { return i.pago; }).length;
      if (pagadas) { UI.aviso("Tiene " + pagadas + " inscripciones cobradas: márcala como cancelada en vez de borrarla, para que el dinero siga constando.", "error"); return; }
      if (!(await UI.confirmar("Se borrará la actividad con sus inscripciones.", { titulo: "Borrar actividad", aceptar: "Borrar", peligro: true }))) return;
      await datos.borrar("actividades", a.id);
      location.hash = "#/actividades";
    });
  }

  function tablaInscripciones(a, porId, enlazadas) {
    var lista = a.inscripciones.filter(function (i) { return vista.canceladas || i.estado !== "cancelada"; })
      .sort(function (x, y) { var o = { inscrita: 0, espera: 1, cancelada: 2 }; return o[x.estado] - o[y.estado] || String(x.fecha).localeCompare(String(y.fecha)); });
    if (!lista.length) return '<p class="vacio">Nadie inscrito todavía.</p>';
    var espera = A.enEspera(a).map(function (i) { return i.id; });
    return '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Inscripciones</caption><thead><tr><th scope="col">Persona</th><th scope="col">Estado</th>' +
      (a.autorizacionMenores ? '<th scope="col">Autorización</th>' : "") + '<th scope="col">Pago</th><th scope="col">¿Vino?</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody>' +
      lista.map(function (i) {
        var socio = porId[i.socioId], menor = A.esMenor(i, socio, a);
        var estado = i.estado === "inscrita" ? '<span class="estado estado-ok">Inscrita</span>' : i.estado === "espera"
          ? '<span class="estado estado-aviso">En espera (' + (espera.indexOf(i.id) + 1) + ".º)</span>" : '<span class="estado estado-neutro">Cancelada</span>';
        var pago = i.pago ? '<span class="estado estado-ok">Pagada</span><br><span class="detalle">' + esc(F.corta(i.pago.fecha)) + " · " + esc(i.pago.forma) + "</span>"
          : i.importe > 0 ? (i.estado === "cancelada" ? '<span class="detalle">' + esc(D.formatear(i.importe)) + "</span>"
            : '<button type="button" class="btn btn-pequeno btn-primario" data-accion="cobrar" data-ins="' + esc(i.id) + '">Cobrar ' + esc(D.formatear(i.importe)) + "</button>")
          : '<span class="detalle">Gratis</span>';
        return '<tr><th scope="row">' + (socio ? '<a href="#/socios/ficha/' + encodeURIComponent(socio.id) + '">' + esc(i.nombre) + '</a> <span class="etiqueta">Socio n.º ' + esc(socio.numero) + "</span>" : esc(i.nombre)) +
          (menor ? ' <span class="etiqueta">Menor</span>' : "") + (i.contacto ? '<br><span class="detalle">' + esc(i.contacto) + "</span>" : "") + "</th>" +
          "<td>" + estado + "</td>" +
          (a.autorizacionMenores ? "<td>" + (menor ? '<label class="casilla en-linea"><input type="checkbox" name="autorizacion" data-ins="' + esc(i.id) + '"' + (i.autorizacion ? " checked" : "") +
            '><span class="sr">Autorización de ' + esc(i.nombre) + "</span></label>" + (i.autorizacion ? "" : ' <span class="estado estado-error">Falta</span>') : '<span class="detalle">—</span>') + "</td>" : "") +
          "<td>" + pago + "</td>" +
          "<td>" + (i.estado === "inscrita" ? '<label class="sr" for="as-' + esc(i.id) + '">¿Vino ' + esc(i.nombre) + '?</label><select id="as-' + esc(i.id) + '" name="asistio" data-ins="' + esc(i.id) + '" class="select-pequeno">' +
            [["", "—"], ["si", "Sí"], ["no", "No"]].map(function (o) {
              var v = i.asistio === true ? "si" : i.asistio === false ? "no" : "";
              return '<option value="' + o[0] + '"' + (v === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
            }).join("") + "</select>" : "") + "</td>" +
          '<td class="celda-acciones"><button type="button" class="btn btn-pequeno btn-secundario" data-accion="mas" data-ins="' + esc(i.id) + '" aria-label="Más opciones de ' + esc(i.nombre) + '">Más…</button></td></tr>';
      }).join("") + "</tbody></table></div>";
  }

  async function nuevaInscripcion(datos, c, a) {
    var activos = c.socios.filter(function (s) { return S.estado(s) === "activo"; }).sort(function (x, y) { return (x.numero || 0) - (y.numero || 0); });
    var etiqueta = function (s) { return s.numero + " · " + S.nombreCompleto(s); };
    var soloSocios = a.abierta === "socios";
    var r = await UI.dialogo({
      titulo: "Inscribir en «" + a.titulo + "»",
      contenido: (a.aforo > 0 && A.libres(a) === 0 ? '<div class="caja-aviso">' + (a.listaEspera ? "Está completa: la inscripción irá a la lista de espera." : "Está completa y no tiene lista de espera.") + "</div>" : "") +
        '<form class="formulario" novalidate>' +
        (soloSocios ? "" : '<fieldset class="grupo-opciones"><legend>¿Quién?</legend><label class="opcion"><input type="radio" name="quien" value="socio" checked><span>Un socio</span></label>' +
          '<label class="opcion"><input type="radio" name="quien" value="otro"><span>Otra persona</span></label></fieldset>') +
        '<div data-quien="socio">' + UI.campo({ nombre: "socio", etiqueta: "Socio", valor: "", lista: activos.map(etiqueta), ancho: "completo", ayuda: "Escribe su número o su nombre y elígelo de la lista.",
          atributos: 'autocomplete="off"' }) + "</div>" +
        '<div data-quien="otro" hidden><div class="rejilla">' +
        UI.campo({ nombre: "nombre", etiqueta: "Nombre y apellidos", valor: "", ancho: "completo" }) +
        UI.campo({ nombre: "contacto", etiqueta: "Correo o teléfono", valor: "", ancho: "completo" }) + "</div>" +
        '<label class="casilla"><input type="checkbox" name="esMenor"><span>Es menor de edad</span></label></div>' +
        (a.autorizacionMenores ? '<label class="casilla"><input type="checkbox" name="autorizacion"><span>Ha entregado la autorización firmada (si es menor)</span></label>' : "") +
        UI.campo({ nombre: "notas", etiqueta: "Notas (alergias, necesidades…)", valor: "", ancho: "completo" }) +
        "</form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Inscribir", valor: "enviar", estilo: "btn-primario" }],
      alAbrir: function (d) {
        var f = d.querySelector("form");
        var ver = function () {
          var q = soloSocios ? "socio" : (f.querySelector("input[name=quien]:checked") || {}).value;
          d.querySelectorAll("[data-quien]").forEach(function (x) { x.hidden = x.getAttribute("data-quien") !== q; });
        };
        f.addEventListener("change", ver);
        ver();
      },
      validar: function (form) {
        var dd = UI.leerFormulario(form);
        var q = soloSocios ? "socio" : (form.querySelector("input[name=quien]:checked") || {}).value;
        if (q === "socio") {
          var ok = activos.some(function (s) { return etiqueta(s) === dd.socio; });
          UI.marcarError(form, "socio", ok ? "" : "Elige un socio de la lista.");
          return ok;
        }
        UI.marcarError(form, "nombre", dd.nombre ? "" : "Escribe el nombre.");
        return !!dd.nombre;
      },
    });
    if (r.valor !== "enviar") return;
    var dd = r.datos;
    var quien = soloSocios ? "socio" : (r.form.querySelector("input[name=quien]:checked") || {}).value;
    var persona = quien === "socio"
      ? { socio: activos.filter(function (s) { return etiqueta(s) === dd.socio; })[0], autorizacion: !!dd.autorizacion, notas: dd.notas }
      : { nombre: dd.nombre, contacto: dd.contacto, esMenor: !!dd.esMenor, autorizacion: !!dd.autorizacion, notas: dd.notas };
    try {
      var res = A.inscribir(a, persona);
      await datos.guardar("actividades", res.actividad);
      UI.aviso(res.enEspera ? res.inscripcion.nombre + " queda en lista de espera." : res.inscripcion.nombre + " inscrito/a.", res.enEspera ? "info" : "ok");
      WA.App.repintar();
    } catch (err) { UI.aviso(err.message, "error"); }
  }

  async function pedirPago(ins, socio, config) {
    var forma = (socio && socio.formaPago) || "Bizum";
    var r = await UI.dialogo({
      titulo: "Cobrar inscripción",
      contenido: "<p>" + esc(ins.nombre) + " · <strong>" + esc(D.formatear(ins.importe)) + "</strong></p>" +
        '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "fecha", etiqueta: "Fecha del pago", tipo: "date", valor: F.hoy(), requerido: true }) +
        UI.campo({ nombre: "forma", etiqueta: "Forma de pago", tipo: "select", valor: forma, opciones: S.FORMAS_PAGO }) +
        UI.campo({ nombre: "cuentaId", etiqueta: "Dónde entra el dinero", tipo: "select", valor: WA.Cuotas.cuentaPorDefecto(forma, config.cuentas), opciones: U.opcionesCuentas({ config: config }) }) +
        UI.campo({ nombre: "referencia", etiqueta: "Referencia (opcional)", valor: "" }) + "</div></form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Marcar como pagada", valor: "enviar", estilo: "btn-primario" }],
      alAbrir: function (d) {
        var f = d.querySelector("form");
        f.elements.forma.addEventListener("change", function () { f.elements.cuentaId.value = WA.Cuotas.cuentaPorDefecto(f.elements.forma.value, config.cuentas); });
      },
      validar: function (form) { var ok = F.esValida(form.elements.fecha.value); UI.marcarError(form, "fecha", ok ? "" : "Pon la fecha."); return ok; },
    });
    return r.valor === "enviar" ? r.datos : null;
  }

  async function masOpciones(datos, c, a, ins, enlazadas, guardarAct) {
    var ref = a.id + ":" + ins.id;
    var botones = [{ texto: "Cerrar", valor: "cancelar" }];
    if (ins.estado !== "cancelada") botones.unshift({ texto: "Cancelar inscripción", valor: "cancelar-ins", estilo: "btn-peligro-suave" });
    if (ins.estado === "espera") botones.unshift({ texto: "Darle plaza ya", valor: "promover" });
    if (ins.pago) botones.unshift({ texto: "Deshacer el cobro", valor: "deshacer" });
    if (ins.estado !== "cancelada" && !ins.pago) botones.unshift({ texto: "Cambiar importe…", valor: "importe" });
    var r = await UI.dialogo({ titulo: ins.nombre, contenido: "<p>" + esc(a.titulo) + (ins.notas ? '</p><p class="detalle">Notas: ' + esc(ins.notas) : "") + "</p>" +
      (ins.pago && enlazadas[ref] ? '<p class="detalle">Este cobro está enlazado a un movimiento del banco: para deshacerlo, quita el enlace en Tesorería.</p>' : ""), botones: botones });
    if (r.valor === "cancelar-ins") {
      var res = A.cancelar(a, ins.id);
      await guardarAct(res.actividad, res.promovida ? "Cancelada. " + res.promovida.nombre + " pasa de la lista de espera a tener plaza (avísale)." : "Inscripción cancelada." + (ins.pago ? " El cobro sigue constando: si se devuelve el dinero, apunta el gasto en Tesorería." : ""));
    } else if (r.valor === "promover") {
      await guardarAct(A.promover(a, ins.id), "Ya tiene plaza.");
    } else if (r.valor === "deshacer") {
      if (enlazadas[ref]) { UI.aviso("Está enlazado a un movimiento del banco: quita el enlace en Tesorería.", "error"); return; }
      await guardarAct(A.cambiarInscripcion(a, ins.id, { pago: null }), "Cobro deshecho.");
    } else if (r.valor === "importe") {
      var ri = await UI.dialogo({ titulo: "Cambiar importe", contenido: '<form class="formulario" novalidate>' +
        UI.campo({ nombre: "importe", etiqueta: "Importe (€)", valor: D.formatear(ins.importe, { simbolo: false }), atributos: 'inputmode="decimal"', ayuda: "0 si no paga (beca, voluntario…)." }) + "</form>",
        botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }],
        validar: function (form) { var v = D.desdeTexto(form.elements.importe.value || "0"); var ok = v !== null && v >= 0; UI.marcarError(form, "importe", ok ? "" : "Escribe un importe."); return ok; } });
      if (ri.valor === "enviar") await guardarAct(A.cambiarInscripcion(a, ins.id, { importe: D.desdeTexto(ri.datos.importe || "0") || 0 }), "Importe cambiado.");
    }
  }

  function exportarCsv(a, porId) {
    var columnas = [
      { titulo: "Nombre", clave: "nombre" }, { titulo: "Socio n.º", valor: function (i) { return porId[i.socioId] ? porId[i.socioId].numero : ""; } },
      { titulo: "Contacto", clave: "contacto" }, { titulo: "Estado", clave: "estado" },
      { titulo: "Menor", valor: function (i) { return A.esMenor(i, porId[i.socioId], a) ? "Sí" : ""; } },
      { titulo: "Autorización", valor: function (i) { return i.autorizacion ? "Sí" : ""; } },
      { titulo: "Importe (€)", valor: function (i) { return D.formatear(i.importe, { simbolo: false }); } },
      { titulo: "Pagado", valor: function (i) { return i.pago ? F.corta(i.pago.fecha) + " " + i.pago.forma : ""; } },
      { titulo: "Asistió", valor: function (i) { return i.asistio === true ? "Sí" : i.asistio === false ? "No" : ""; } },
      { titulo: "Notas", clave: "notas" },
    ];
    UI.descargar("inscritos-" + A.fechaDe(a) + ".csv", WA.CSV.escribir(columnas, a.inscripciones), "text/csv;charset=utf-8");
  }

  // ── Hoja de asistencia ──────────────────────────────────────────────────
  async function pintarAsistencia(cont, datos, id) {
    var c = await cargar(datos);
    var a = U.buscar(c.actividades, id);
    if (!a) { cont.innerHTML = "<h1>No encontrada</h1>"; return; }
    var porId = {};
    c.socios.forEach(function (s) { porId[s.id] = s; });
    var lista = a.inscripciones.filter(function (i) { return i.estado === "inscrita"; }).sort(function (x, y) { return x.nombre.localeCompare(y.nombre, "es"); });
    cont.innerHTML =
      '<p class="miga no-imprimir"><a href="#/actividades/ficha/' + encodeURIComponent(a.id) + '">' + esc(a.titulo) + "</a> › Hoja de asistencia</p>" +
      '<div class="acciones no-imprimir"><button type="button" class="btn btn-primario lectura-ok" id="h-imprimir">Imprimir o guardar en PDF</button></div>' +
      "<h1>" + esc(a.titulo) + "</h1>" +
      '<p class="intro">' + esc(c.asociacion.nombre || "") + " · " + esc(cuando(a)) + (a.lugar ? " · " + esc(a.lugar) : "") + "</p>" +
      '<div class="tabla-envoltorio"><table class="tabla tabla-asistencia"><thead><tr><th scope="col" class="num">#</th><th scope="col">Nombre</th><th scope="col">Menor</th>' +
      (a.autorizacionMenores ? '<th scope="col">Autorización</th>' : "") + '<th scope="col" class="col-firma">Firma</th></tr></thead><tbody>' +
      lista.map(function (i, k) {
        var menor = A.esMenor(i, porId[i.socioId], a);
        return '<tr><td class="num">' + (k + 1) + "</td><td>" + esc(i.nombre) + "</td><td>" + (menor ? "Sí" : "") + "</td>" +
          (a.autorizacionMenores ? "<td>" + (menor ? (i.autorizacion ? "Sí" : "FALTA") : "") + "</td>" : "") + '<td class="col-firma"></td></tr>';
      }).join("") +
      // Unas filas vacías para quien llegue sin inscribirse.
      [1, 2, 3, 4, 5].map(function (k) { return '<tr><td class="num">' + (lista.length + k) + "</td><td></td><td></td>" + (a.autorizacionMenores ? "<td></td>" : "") + '<td class="col-firma"></td></tr>'; }).join("") +
      "</tbody></table></div>";
    cont.querySelector("#h-imprimir").addEventListener("click", function () { window.print(); });
  }

  async function pintar(cont, datos, ruta) {
    if (ruta[0] === "lista") return pintarLista(cont, datos);
    if (ruta[0] === "nueva") return pintarFicha(cont, datos, null);
    if (ruta[0] === "ficha") return pintarFicha(cont, datos, ruta[1]);
    if (ruta[0] === "asistencia") return pintarAsistencia(cont, datos, ruta[1]);
    return pintarCalendario(cont, datos);
  }

  WA.App.registrar({
    id: "actividades", titulo: "Actividades", orden: 28, pintar: pintar,
    icono: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h3M13.5 13.5h3M7.5 17h3"/>',
  });
})(typeof self !== "undefined" ? self : this);

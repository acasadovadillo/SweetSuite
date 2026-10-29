/*
 * Agora — Módulo «Obligaciones»: calendario de plazos con aviso.
 *
 *   #/obligaciones          vencimientos (vencidos sin hacer y próximos 12 meses)
 *   #/obligaciones/lista    las obligaciones configuradas, para editarlas
 *
 * Incluye los plazos de las subvenciones (de Presupuestos → proyectos de tipo
 * subvención). La lógica está en logica/obligaciones.js (con tests).
 * ⚠️ Fechas orientativas: verificar con asesoría.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, O = WA.Obligaciones;

  var ESTADO = { vencida: ["estado-error", "Vencida"], proxima: ["estado-aviso", "Próxima"], pendiente: ["estado-neutro", "Pendiente"], hecha: ["estado-ok", "Hecha"] };

  function pestanas(actual) {
    return '<nav class="pestanas" aria-label="Apartados de obligaciones"><a href="#/obligaciones"' + (actual === "" ? ' aria-current="page"' : "") + ">Calendario</a>" +
      '<a href="#/obligaciones/lista"' + (actual === "lista" ? ' aria-current="page"' : "") + ">Mis obligaciones</a></nav>";
  }

  /** Vencimientos de obligaciones y subvenciones entre dos fechas (lo usan también Inicio y Actividades). */
  async function vencimientos(datos, desde, hasta) {
    var r = await Promise.all([datos.listar("obligaciones"), datos.listar("proyectos")]);
    return O.ocurrencias(r[0], desde, hasta).concat(O.ocurrenciasSubvenciones(r[1], desde, hasta))
      .sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
  }

  // ── Calendario de vencimientos ──────────────────────────────────────────
  var verHechas = false;
  async function pintarCalendario(cont, datos) {
    var obligaciones = await datos.listar("obligaciones");
    var hoy = F.hoy();
    var desde = (+hoy.slice(0, 4) - 1) + "-01-01", hasta = F.sumarDias(hoy, 365);
    var todas = await vencimientos(datos, desde, hasta);
    // Lo pasado solo si quedó sin hacer; lo de los próximos 12 meses, todo.
    var lista = todas.filter(function (x) { return x.fecha >= hoy ? (verHechas || x.estado !== "hecha") : x.estado === "vencida"; });
    var porMes = {};
    lista.forEach(function (x) { (porMes[x.fecha.slice(0, 7)] = porMes[x.fecha.slice(0, 7)] || []).push(x); });
    var vencidas = lista.filter(function (x) { return x.estado === "vencida"; }).length;
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Obligaciones</h1><div class="acciones-cabecera"><button type="button" class="btn btn-secundario" id="o-habituales">Elegir de las habituales…</button>' +
      '<button type="button" class="btn btn-primario" id="o-nueva">Nueva obligación</button></div></div>' + pestanas("") +
      '<div class="caja-aviso">Fechas orientativas: dependen de vuestro caso y pueden cambiar (festivos, cambios normativos). <strong>Verificad con la asesoría</strong> qué obligaciones os afectan.</div>' +
      (!obligaciones.length ? '<p class="intro">Todavía no habéis elegido ninguna obligación. Pulsa «Elegir de las habituales…» para empezar.</p>' : "") +
      (vencidas ? '<p class="intro"><span class="estado estado-error">' + vencidas + (vencidas === 1 ? " vencida" : " vencidas") + "</span> sin marcar como hechas.</p>" : "") +
      '<label class="casilla"><input type="checkbox" id="o-hechas"' + (verHechas ? " checked" : "") + "><span>Ver también las ya hechas</span></label>" +
      (Object.keys(porMes).length ? Object.keys(porMes).sort().map(function (m) {
        return '<section class="tarjeta"><h2>' + esc(F.MESES[+m.slice(5) - 1].charAt(0).toUpperCase() + F.MESES[+m.slice(5) - 1].slice(1)) + " " + m.slice(0, 4) + "</h2>" +
          '<ul class="lista-vencimientos">' + porMes[m].map(filaVencimiento).join("") + "</ul></section>";
      }).join("") : '<p class="vacio">Nada pendiente en los próximos 12 meses.</p>');
    cont.querySelector("#o-hechas").addEventListener("change", function (e) { verHechas = e.target.checked; WA.App.repintar(); });
    cont.querySelector("#o-habituales").addEventListener("click", function () { elegirHabituales(datos, obligaciones); });
    cont.querySelector("#o-nueva").addEventListener("click", function () { editar(datos, null); });
    cont.querySelectorAll("[data-hecha]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var p = b.getAttribute("data-hecha").split("|");
        var o = obligaciones.filter(function (x) { return x.id === p[0]; })[0];
        if (!o) return;
        var ya = (o.hechas || {})[p[1]];
        if (ya) {
          if (!(await UI.confirmar("Volverá a figurar como pendiente.", { titulo: "Desmarcar", aceptar: "Desmarcar" }))) return;
          await datos.guardar("obligaciones", O.marcarHecha(o, p[1], false));
        } else {
          var r = await UI.dialogo({ titulo: o.titulo, contenido: "<p>Vencimiento del " + esc(F.corta(p[1])) + '</p><form class="formulario" novalidate>' +
            UI.campo({ nombre: "nota", etiqueta: "Nota (opcional)", valor: "", ayuda: "Por ejemplo: presentado por la gestoría, n.º de justificante…", ancho: "completo" }) + "</form>",
            botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Marcar como hecha", valor: "enviar", estilo: "btn-primario" }] });
          if (r.valor !== "enviar") return;
          await datos.guardar("obligaciones", O.marcarHecha(o, p[1], true, r.datos.nota));
          UI.aviso("Marcada como hecha.");
        }
        WA.App.repintar();
      });
    });
    cont.querySelectorAll("[data-editar-ob]").forEach(function (b) {
      b.addEventListener("click", function () { editar(datos, obligaciones.filter(function (x) { return x.id === b.getAttribute("data-editar-ob"); })[0]); });
    });
  }

  function filaVencimiento(x) {
    var e = ESTADO[x.estado];
    var cuando = x.estado === "hecha" ? "Hecha el " + F.corta(x.hecha.fecha) + (x.hecha.nota ? " · " + x.hecha.nota : "")
      : x.faltan < 0 ? "Venció hace " + (-x.faltan) + (x.faltan === -1 ? " día" : " días") : x.faltan === 0 ? "Vence hoy" : "Faltan " + x.faltan + (x.faltan === 1 ? " día" : " días");
    var acciones = x.origen === "subvencion"
      ? '<a class="btn btn-pequeno btn-secundario" href="#/proyectos/ficha/' + encodeURIComponent(x.proyectoId) + '">Ver subvención</a>'
      : '<button type="button" class="btn btn-pequeno ' + (x.hecha ? "btn-secundario" : "btn-primario") + '" data-hecha="' + esc(x.obligacionId + "|" + x.fecha) + '">' + (x.hecha ? "Desmarcar" : "Hecha") + "</button>" +
        '<button type="button" class="btn btn-pequeno btn-secundario" data-editar-ob="' + esc(x.obligacionId) + '">Editar</button>';
    return '<li><span class="venc-fecha">' + esc(F.corta(x.fecha)) + "</span>" +
      '<span class="venc-texto"><strong>' + esc(x.titulo) + "</strong>" + (x.etiqueta ? " · " + esc(x.etiqueta) : "") +
      '<span class="detalle">' + esc(x.categoria) + " · " + esc(cuando) + '</span></span><span class="estado ' + e[0] + '">' + e[1] + '</span><span class="venc-acciones">' + acciones + "</span></li>";
  }

  // ── Elegir de las habituales ───────────────────────────────────────────
  async function elegirHabituales(datos, obligaciones) {
    var ya = {};
    obligaciones.forEach(function (o) { if (o.plantilla) ya[o.plantilla] = true; });
    var grupos = {};
    O.PLANTILLAS.forEach(function (p) { (grupos[p.categoria] = grupos[p.categoria] || []).push(p); });
    var r = await UI.dialogo({
      titulo: "Obligaciones habituales",
      contenido: '<p class="letra-pequena">Marca las que os afectan. Las fechas son orientativas y se pueden cambiar después (verificar con asesoría).</p><form class="formulario" novalidate>' +
        Object.keys(grupos).map(function (g) {
          return "<h3>" + esc(g) + "</h3>" + grupos[g].map(function (p) {
            var cuando = p.recurrencia === "unica" ? "Fecha a indicar" : p.vencimientos.map(function (x) { return x.dia + "/" + x.mes; }).join(", ");
            return '<label class="casilla"><input type="checkbox" name="p-' + esc(p.plantilla) + '"' + (ya[p.plantilla] ? " checked disabled" : "") + "><span><strong>" + esc(p.titulo) + "</strong>" +
              '<span class="detalle"> · ' + esc(cuando) + "<br>" + esc(p.descripcion) + "</span></span></label>";
          }).join("");
        }).join("") + "</form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Añadir las marcadas", valor: "enviar", estilo: "btn-primario" }],
    });
    if (r.valor !== "enviar") return;
    var nuevas = O.PLANTILLAS.filter(function (p) { return r.datos["p-" + p.plantilla] && !ya[p.plantilla]; }).map(function (p) { return O.desdePlantilla(p); });
    if (!nuevas.length) return;
    await datos.guardarVarios("obligaciones", nuevas);
    var sinFecha = nuevas.filter(function (o) { return o.recurrencia === "unica" && !o.fecha; }).length;
    UI.aviso(nuevas.length + " obligaciones añadidas." + (sinFecha ? " " + (sinFecha === 1 ? "Una necesita su fecha: búscala" : sinFecha + " necesitan su fecha: búscalas") + " en «Mis obligaciones»." : ""), sinFecha ? "info" : "ok");
    WA.App.repintar();
  }

  // ── Editar ──────────────────────────────────────────────────────────────
  async function editar(datos, obligacion) {
    var o = obligacion ? JSON.parse(JSON.stringify(obligacion)) : O.vacia();
    var venc = (o.vencimientos || []).map(function (x) { return x.dia + "/" + x.mes + (x.etiqueta ? " " + x.etiqueta : ""); }).join("\n");
    var r = await UI.dialogo({
      titulo: obligacion ? "Editar obligación" : "Nueva obligación",
      contenido: '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "titulo", etiqueta: "Qué hay que hacer", valor: o.titulo, requerido: true, ancho: "completo" }) +
        UI.campo({ nombre: "categoria", etiqueta: "Tipo", tipo: "select", valor: o.categoria, opciones: O.CATEGORIAS }) +
        UI.campo({ nombre: "recurrencia", etiqueta: "Se repite", tipo: "select", valor: o.recurrencia, opciones: [["anual", "Cada año, en estas fechas"], ["unica", "Una sola vez"]] }) +
        '<div class="campo-completo" data-rec="anual">' + UI.campo({ nombre: "vencimientos", etiqueta: "Fechas de cada año (una por línea: día/mes y, si quieres, una nota)", tipo: "textarea", valor: venc,
          ayuda: "Por ejemplo: «20/4 1.er trimestre».", ancho: "completo" }) + "</div>" +
        '<div data-rec="unica">' + UI.campo({ nombre: "fecha", etiqueta: "Fecha", tipo: "date", valor: o.fecha }) + "</div>" +
        UI.campo({ nombre: "diasAviso", etiqueta: "Avisar con (días de antelación)", tipo: "number", valor: String(o.diasAviso == null ? 15 : o.diasAviso), atributos: 'min="0" max="365"' }) +
        UI.campo({ nombre: "descripcion", etiqueta: "Notas", tipo: "textarea", valor: o.descripcion, ancho: "completo" }) + "</div>" +
        '<label class="casilla"><input type="checkbox" name="activa"' + (o.activa !== false ? " checked" : "") + "><span>Activa (desmárcala para dejar de verla sin borrarla)</span></label></form>",
      botones: (obligacion ? [{ texto: "Borrar", valor: "borrar", estilo: "btn-peligro-suave" }] : []).concat([{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }]),
      alAbrir: function (d) {
        var f = d.querySelector("form");
        var ver = function () { d.querySelectorAll("[data-rec]").forEach(function (x) { x.hidden = x.getAttribute("data-rec") !== f.elements.recurrencia.value; }); };
        f.elements.recurrencia.addEventListener("change", ver);
        ver();
      },
      validar: function (form) {
        var d = UI.leerFormulario(form), ok = true;
        UI.marcarError(form, "titulo", d.titulo ? "" : "Escribe qué hay que hacer."); if (!d.titulo) ok = false;
        if (d.recurrencia === "anual") {
          var malas = leerVencimientos(d.vencimientos).malas;
          UI.marcarError(form, "vencimientos", malas.length ? "No entiendo: " + malas.join(", ") + ". Escríbelas como 20/4." : leerVencimientos(d.vencimientos).lista.length ? "" : "Pon al menos una fecha.");
          if (malas.length || !leerVencimientos(d.vencimientos).lista.length) ok = false;
        }
        return ok;
      },
    });
    if (r.valor === "borrar") {
      if (!(await UI.confirmar("Se borrará «" + o.titulo + "» y lo que tenga marcado como hecho.", { titulo: "Borrar obligación", aceptar: "Borrar", peligro: true }))) return;
      await datos.borrar("obligaciones", o.id);
      WA.App.repintar();
      return;
    }
    if (r.valor !== "enviar") return;
    var d = r.datos;
    Object.assign(o, { titulo: d.titulo, categoria: d.categoria, recurrencia: d.recurrencia, fecha: d.recurrencia === "unica" ? d.fecha : "",
      vencimientos: d.recurrencia === "anual" ? leerVencimientos(d.vencimientos).lista : [], diasAviso: Math.max(0, parseInt(d.diasAviso, 10) || 0),
      descripcion: d.descripcion, activa: !!d.activa });
    await datos.guardar("obligaciones", o);
    UI.aviso("Obligación guardada.");
    WA.App.repintar();
  }

  /** «20/4 1.er trimestre» por línea → [{ dia, mes, etiqueta }]. */
  function leerVencimientos(texto) {
    var lista = [], malas = [];
    String(texto || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (l) {
      var m = /^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*(.*)$/.exec(l);
      if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) { malas.push("«" + l + "»"); return; }
      lista.push({ dia: +m[1], mes: +m[2], etiqueta: m[3].trim() });
    });
    return { lista: lista, malas: malas };
  }

  async function pintarLista(cont, datos) {
    var lista = (await datos.listar("obligaciones")).sort(function (a, b) { return a.categoria.localeCompare(b.categoria) || a.titulo.localeCompare(b.titulo, "es"); });
    cont.innerHTML = '<div class="cabecera-pagina"><h1>Obligaciones</h1><button type="button" class="btn btn-primario" id="o-nueva">Nueva obligación</button></div>' + pestanas("lista") +
      (lista.length ? '<div class="tabla-envoltorio"><table class="tabla"><tbody>' + lista.map(function (o) {
        var cuando = o.recurrencia === "unica" ? (o.fecha ? F.corta(o.fecha) : '<span class="estado estado-aviso">Falta la fecha</span>')
          : esc(o.vencimientos.map(function (x) { return x.dia + "/" + x.mes; }).join(", ")) + " cada año";
        return '<tr><th scope="row">' + esc(o.titulo) + (o.activa === false ? ' <span class="etiqueta">Inactiva</span>' : "") + '<br><span class="detalle">' + esc(o.categoria) + "</span></th>" +
          "<td>" + cuando + '</td><td class="celda-acciones"><button type="button" class="btn btn-pequeno btn-secundario" data-editar-ob="' + esc(o.id) + '">Editar</button></td></tr>';
      }).join("") + "</tbody></table></div>" : '<p class="vacio">Sin obligaciones. Ve a «Calendario» → «Elegir de las habituales…».</p>');
    cont.querySelector("#o-nueva").addEventListener("click", function () { editar(datos, null); });
    cont.querySelectorAll("[data-editar-ob]").forEach(function (b) {
      b.addEventListener("click", function () { editar(datos, lista.filter(function (x) { return x.id === b.getAttribute("data-editar-ob"); })[0]); });
    });
  }

  async function pintar(cont, datos, ruta) {
    if (ruta[0] === "lista") return pintarLista(cont, datos);
    return pintarCalendario(cont, datos);
  }

  WA.ObligacionesUI = { vencimientos: vencimientos };
  WA.App.registrar({
    id: "obligaciones", titulo: "Obligaciones", orden: 42, pintar: pintar,
    icono: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2.5h6"/>',
  });
})(typeof self !== "undefined" ? self : this);

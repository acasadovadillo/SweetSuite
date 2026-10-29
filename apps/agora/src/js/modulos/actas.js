/*
 * Agora — Módulo «Actas»: libro de actas de cada órgano.
 *
 *   #/actas                     actas, por órgano y año
 *   #/actas/nueva/<organoId>    nueva acta con la plantilla del órgano
 *   #/actas/ficha/<id>          editar: datos, asistentes, orden del día, acuerdos
 *   #/actas/imprimir/<id>       versión para firmar (imprimir o PDF)
 *   #/actas/acuerdos            libro de acuerdos (todos, con buscador)
 *   #/actas/organos             órganos que levantan actas y numeración
 *   #/actas/convocatorias       convocatorias de asambleas y reuniones
 *   #/actas/convocatoria/<id>   (o convocatoria-nueva/<organoId>) editarla, enviarla por
 *                               correo, al calendario, imprimirla y, celebrada, su acta
 *   #/actas/desde/<id>          nueva acta a partir de una convocatoria
 *
 * La lógica está en logica/actas.js (con tests). Contenido, firma y aprobación
 * de las actas según vuestros estatutos: verificar con asesoría.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, Ac = WA.Actas, S = WA.Socios, Conv = WA.Convocatorias;

  var filtro = { organo: "", anio: "", texto: "" };

  function pestanas(actual) {
    var p = [["", "Actas"], ["convocatorias", "Convocatorias"], ["acuerdos", "Libro de acuerdos"], ["organos", "Órganos"]];
    return '<nav class="pestanas" aria-label="Apartados de actas">' + p.map(function (x) {
      return '<a href="#/actas' + (x[0] ? "/" + x[0] : "") + '"' + (actual === x[0] ? ' aria-current="page"' : "") + ">" + x[1] + "</a>";
    }).join("") + "</nav>";
  }
  async function cargar(datos) {
    var r = await Promise.all([datos.leer("config"), datos.listar("actas"), datos.listar("junta"), datos.listar("socios"), datos.leer("asociacion"), datos.listar("documentos"),
      datos.listar("convocatorias")]);
    return { config: r[0], actas: r[1], junta: r[2], socios: r[3].map(S.completar), asociacion: r[4], documentos: r[5], convocatorias: r[6] };
  }
  var organoDe = function (c, id) { return (c.config.organos || []).filter(function (o) { return o.id === id; })[0] || { id: id, nombre: "(órgano borrado)", prefijo: "ACTA", tipo: "otro" }; };

  // ── Lista ───────────────────────────────────────────────────────────────
  async function pintarLista(cont, datos) {
    var c = await cargar(datos);
    var anios = {};
    c.actas.forEach(function (a) { if (a.fecha) anios[a.fecha.slice(0, 4)] = true; });
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Actas</h1><div class="acciones-cabecera"><label class="sr" for="n-organo">Órgano de la nueva acta</label>' +
      '<select id="n-organo" class="select-pequeno">' + c.config.organos.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.nombre) + "</option>"; }).join("") + "</select>" +
      '<button type="button" class="btn btn-primario" id="n-crear">Nueva acta</button></div></div>' + pestanas("") +
      '<div class="barra-filtros"><label><span class="sr">Órgano</span><select id="f-organo"><option value="">Todos los órganos</option>' +
      c.config.organos.map(function (o) { return '<option value="' + esc(o.id) + '"' + (filtro.organo === o.id ? " selected" : "") + ">" + esc(o.nombre) + "</option>"; }).join("") + "</select></label>" +
      '<label><span class="sr">Año</span><select id="f-anio"><option value="">Todos los años</option>' + Object.keys(anios).sort().reverse().map(function (a) {
        return '<option value="' + a + '"' + (filtro.anio === a ? " selected" : "") + ">" + a + "</option>";
      }).join("") + "</select></label>" +
      '<label class="filtro-texto"><span class="sr">Buscar</span><input type="search" id="f-texto" placeholder="Buscar en el orden del día y los acuerdos…" value="' + esc(filtro.texto) + '"></label></div>' +
      '<div id="f-tabla"></div>';
    function refrescar() {
      var t = filtro.texto.trim().toLowerCase();
      var lista = c.actas.filter(function (a) {
        if (filtro.organo && a.organoId !== filtro.organo) return false;
        if (filtro.anio && String(a.fecha).slice(0, 4) !== filtro.anio) return false;
        if (!t) return true;
        return JSON.stringify([a.numero, a.lugar, a.ordenDelDia, a.ruegos]).toLowerCase().indexOf(t) >= 0;
      }).sort(function (x, y) { return String(y.fecha).localeCompare(String(x.fecha)); });
      cont.querySelector("#f-tabla").innerHTML = !lista.length ? '<p class="vacio">No hay actas.</p>' :
        '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Actas</caption><thead><tr><th scope="col">Número</th><th scope="col">Fecha</th><th scope="col">Órgano</th>' +
        '<th scope="col" class="solo-ancho">Acuerdos</th><th scope="col">Estado</th></tr></thead><tbody>' + lista.map(function (a) {
          var n = (a.ordenDelDia || []).reduce(function (s, p) { return s + (p.acuerdos || []).filter(function (x) { return String(x.texto || "").trim(); }).length; }, 0);
          return '<tr><th scope="row"><a href="#/actas/ficha/' + encodeURIComponent(a.id) + '">' + esc(a.numero || "(sin número)") + "</a></th><td>" + esc(F.corta(a.fecha)) + "</td>" +
            "<td>" + esc(organoDe(c, a.organoId).nombre) + (a.tipoSesion === "extraordinaria" ? ' <span class="etiqueta">Extraordinaria</span>' : "") + "</td>" +
            '<td class="solo-ancho">' + n + "</td><td>" + (a.estado === "aprobada" ? '<span class="estado estado-ok">Aprobada</span>' : '<span class="estado estado-aviso">Borrador</span>') + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    refrescar();
    cont.querySelector("#f-organo").addEventListener("change", function (e) { filtro.organo = e.target.value; refrescar(); });
    cont.querySelector("#f-anio").addEventListener("change", function (e) { filtro.anio = e.target.value; refrescar(); });
    cont.querySelector("#f-texto").addEventListener("input", function (e) { filtro.texto = e.target.value; refrescar(); });
    cont.querySelector("#n-crear").addEventListener("click", function () { location.hash = "#/actas/nueva/" + encodeURIComponent(cont.querySelector("#n-organo").value); });
  }

  // ── Editor ──────────────────────────────────────────────────────────────
  var opcion = function (v, t, actual) { return '<option value="' + esc(v) + '"' + (String(actual) === String(v) ? " selected" : "") + ">" + esc(t) + "</option>"; };

  function htmlPuntos(a) {
    return a.ordenDelDia.map(function (p, i) {
      var pre = "p-" + i + "-";
      return '<li class="punto" data-punto="' + i + '"><div class="punto-cabecera"><span class="punto-num">' + (i + 1) + ".</span>" +
        '<label class="sr" for="' + pre + 'titulo">Título del punto ' + (i + 1) + '</label><input id="' + pre + 'titulo" name="' + pre + 'titulo" value="' + esc(p.titulo) + '" placeholder="Asunto">' +
        '<span class="punto-botones"><button type="button" class="btn-icono" data-subir="' + i + '" aria-label="Subir el punto ' + (i + 1) + '"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
        '<button type="button" class="btn-icono" data-bajar="' + i + '" aria-label="Bajar el punto ' + (i + 1) + '"' + (i === a.ordenDelDia.length - 1 ? " disabled" : "") + ">↓</button>" +
        '<button type="button" class="btn-icono" data-quitar-punto="' + i + '" aria-label="Quitar el punto ' + (i + 1) + '">✕</button></span></div>' +
        '<label class="sr" for="' + pre + 'desarrollo">Desarrollo del punto ' + (i + 1) + '</label><textarea id="' + pre + 'desarrollo" name="' + pre + 'desarrollo" rows="3" placeholder="Qué se habló (resumen de las intervenciones)">' + esc(p.desarrollo) + "</textarea>" +
        '<ol class="acuerdos">' + (p.acuerdos || []).map(function (ac, k) {
          var q = pre + "a-" + k + "-";
          return '<li class="acuerdo"><label for="' + q + 'texto">Acuerdo ' + (i + 1) + "." + (k + 1) + '</label><textarea id="' + q + 'texto" name="' + q + 'texto" rows="2">' + esc(ac.texto) + "</textarea>" +
            '<div class="acuerdo-votacion"><label>Votación <select name="' + q + 'votacion" class="select-pequeno">' + opcion("", "—", ac.votacion) + opcion("unanimidad", "Unanimidad", ac.votacion) +
            opcion("asentimiento", "Asentimiento", ac.votacion) + opcion("votacion", "Votación con recuento", ac.votacion) + "</select></label>" +
            '<span class="votos"' + (ac.votacion === "votacion" ? "" : " hidden") + '><label>A favor <input name="' + q + 'favor" type="number" min="0" value="' + esc(ac.favor || "") + '" class="input-corto"></label>' +
            '<label>En contra <input name="' + q + 'contra" type="number" min="0" value="' + esc(ac.contra || "") + '" class="input-corto"></label>' +
            '<label>Abstenciones <input name="' + q + 'abstencion" type="number" min="0" value="' + esc(ac.abstencion || "") + '" class="input-corto"></label></span>' +
            '<label>Resultado <select name="' + q + 'resultado" class="select-pequeno">' + opcion("", "—", ac.resultado) + opcion("aprobado", "Aprobado", ac.resultado) + opcion("rechazado", "Rechazado", ac.resultado) + "</select></label>" +
            '<button type="button" class="btn btn-pequeno btn-peligro-suave" data-quitar-acuerdo="' + i + "-" + k + '">Quitar acuerdo</button></div></li>';
        }).join("") + "</ol>" +
        '<button type="button" class="btn btn-pequeno btn-secundario" data-acuerdo="' + i + '">Añadir acuerdo</button></li>';
    }).join("");
  }

  /** Vuelca el formulario en el acta (también los puntos y acuerdos). */
  function leer(form, a) {
    var d = UI.leerFormulario(form);
    ["organoId", "tipoSesion", "fecha", "horaInicio", "horaFin", "lugar", "modalidad", "convocatoria", "presidencia", "secretaria", "excusan", "invitados", "ruegos", "estado", "aprobacion", "notas"]
      .forEach(function (k) { if (k in d) a[k] = d[k]; });
    a.ordenDelDia = a.ordenDelDia.map(function (p, i) {
      var pre = "p-" + i + "-";
      return { id: p.id, titulo: d[pre + "titulo"] || "", desarrollo: d[pre + "desarrollo"] || "", acuerdos: (p.acuerdos || []).map(function (ac, k) {
        var q = pre + "a-" + k + "-", num = function (x) { var n = parseInt(d[q + x], 10); return isFinite(n) && n >= 0 ? n : 0; };
        return { id: ac.id, texto: d[q + "texto"] || "", votacion: d[q + "votacion"] || "", resultado: d[q + "resultado"] || "",
          favor: num("favor"), contra: num("contra"), abstencion: num("abstencion") };
      }) };
    });
    return a;
  }

  function htmlAsistentes(a) {
    if (!a.asistentes.length) return '<p class="vacio">Sin asistentes anotados.</p>';
    return '<ul class="chips">' + a.asistentes.map(function (x, i) {
      return '<li class="chip">' + esc(x.nombre) + (x.cargo ? ' <span class="detalle">(' + esc(x.cargo) + ")</span>" : "") +
        '<button type="button" class="btn-icono" data-quitar-asistente="' + i + '" aria-label="Quitar a ' + esc(x.nombre) + '">✕</button></li>';
    }).join("") + "</ul>";
  }

  async function elegirAsistentes(c, a) {
    var hoy = F.hoy();
    var junta = c.junta.filter(function (j) { return !j.hasta || j.hasta >= hoy; });
    var socios = c.socios.filter(function (s) { return S.estado(s) === "activo"; }).sort(function (x, y) { return S.nombreListado(x).localeCompare(S.nombreListado(y), "es"); });
    var ya = {};
    a.asistentes.forEach(function (x) { ya[x.socioId || x.nombre] = true; });
    var cargoDe = function (j) { return j.cargo === "Otro" && j.cargoOtro ? j.cargoOtro : j.cargo; };
    var r = await UI.dialogo({
      titulo: "Añadir asistentes",
      contenido: '<form class="formulario" novalidate>' +
        (junta.length ? "<h3>Junta directiva</h3>" + junta.map(function (j, i) {
          return '<label class="casilla"><input type="checkbox" name="j-' + i + '"' + (ya[j.nombre] ? " checked disabled" : "") + "><span>" + esc(j.nombre) + ' <span class="detalle">(' + esc(cargoDe(j)) + ")</span></span></label>";
        }).join("") : "") +
        '<h3>Socios</h3><label class="sr" for="as-buscar">Buscar socio</label><input type="search" id="as-buscar" placeholder="Buscar socio…">' +
        '<div class="lista-marcable">' + socios.map(function (s) {
          return '<label class="casilla" data-nombre="' + esc(S.nombreCompleto(s).toLowerCase()) + '"><input type="checkbox" name="s-' + esc(s.id) + '"' + (ya[s.id] ? " checked disabled" : "") + "><span>" +
            esc(S.nombreListado(s)) + ' <span class="detalle">n.º ' + esc(s.numero) + "</span></span></label>";
        }).join("") + "</div>" +
        UI.campo({ nombre: "otros", etiqueta: "Otras personas (una por línea)", tipo: "textarea", valor: "", ancho: "completo" }) + "</form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Añadir", valor: "enviar", estilo: "btn-primario" }],
      alAbrir: function (d) {
        d.querySelector("#as-buscar").addEventListener("input", function (e) {
          var t = e.target.value.trim().toLowerCase();
          d.querySelectorAll(".lista-marcable .casilla").forEach(function (x) { x.hidden = t && x.getAttribute("data-nombre").indexOf(t) < 0; });
        });
      },
    });
    if (r.valor !== "enviar") return false;
    junta.forEach(function (j, i) { if (r.datos["j-" + i] && !ya[j.nombre]) a.asistentes.push({ nombre: j.nombre, socioId: "", cargo: cargoDe(j) }); });
    socios.forEach(function (s) {
      if (r.datos["s-" + s.id] && !ya[s.id] && !a.asistentes.some(function (x) { return x.nombre === S.nombreCompleto(s); })) a.asistentes.push({ nombre: S.nombreCompleto(s), socioId: s.id, cargo: "" });
    });
    String(r.datos.otros || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (n) { a.asistentes.push({ nombre: n, socioId: "", cargo: "" }); });
    return true;
  }

  async function pintarFicha(cont, datos, id, organoNuevo, desdeConvocatoria) {
    var c = await cargar(datos);
    var a;
    var conv = desdeConvocatoria ? c.convocatorias.filter(function (x) { return x.id === desdeConvocatoria; })[0] : null;
    if (id) a = c.actas.filter(function (x) { return x.id === id; })[0];
    else {
      var org = organoDe(c, conv ? conv.organoId : organoNuevo || (c.config.organos[0] || {}).id);
      a = conv ? Conv.aActa(conv, org) : Ac.vacia(org);
      // Presidencia y secretaría vigentes, para empezar.
      var hoy = F.hoy();
      c.junta.forEach(function (j) {
        if (j.hasta && j.hasta < hoy) return;
        if (j.cargo === "Presidencia" && !a.presidencia) a.presidencia = j.nombre;
        if (j.cargo === "Secretaría" && !a.secretaria) a.secretaria = j.nombre;
      });
    }
    if (!a) { cont.innerHTML = '<h1>Acta no encontrada</h1><p><a href="#/actas">Volver</a></p>'; return; }
    a.asistentes = a.asistentes || []; a.ordenDelDia = a.ordenDelDia || [];
    var nueva = !a.id;
    var personas = c.junta.filter(function (j) { return !j.hasta || j.hasta >= F.hoy(); }).map(function (j) { return j.nombre; });

    cont.innerHTML =
      '<p class="miga"><a href="#/actas">Actas</a> › ' + esc(a.numero || "Nueva") + "</p>" +
      '<div class="cabecera-pagina"><h1>' + (a.numero ? "Acta " + esc(a.numero) : "Nueva acta") + "</h1>" +
      (nueva ? "" : a.estado === "aprobada" ? '<span class="estado estado-ok">Aprobada</span>' : '<span class="estado estado-aviso">Borrador</span>') + "</div>" + WA.UI.firma(a) +
      (a.convocatoriaId ? '<p class="detalle">Reunión convocada: <a href="#/actas/convocatoria/' + encodeURIComponent(a.convocatoriaId) + '">ver la convocatoria</a>.</p>' : "") +
      '<form id="acta" class="formulario" novalidate>' +
      '<section class="tarjeta"><h2>Sesión</h2><div class="rejilla-12">' +
      UI.campo({ nombre: "organoId", etiqueta: "Órgano", tipo: "select", valor: a.organoId, opciones: c.config.organos.map(function (o) { return [o.id, o.nombre]; }), clase: "col-4 col-movil-completo",
        atributos: nueva ? "" : "disabled" }) +
      UI.campo({ nombre: "tipoSesion", etiqueta: "Sesión", tipo: "select", valor: a.tipoSesion, opciones: [["ordinaria", "Ordinaria"], ["extraordinaria", "Extraordinaria"]], clase: "col-4" }) +
      UI.campo({ nombre: "convocatoria", etiqueta: "Convocatoria", tipo: "select", valor: a.convocatoria, opciones: [["", "—"], ["primera", "Primera"], ["segunda", "Segunda"]], clase: "col-4" }) +
      UI.campo({ nombre: "fecha", etiqueta: "Fecha", tipo: "date", valor: a.fecha, requerido: true, clase: "col-4" }) +
      UI.campo({ nombre: "horaInicio", etiqueta: "Empieza", tipo: "time", valor: a.horaInicio, clase: "col-4" }) +
      UI.campo({ nombre: "horaFin", etiqueta: "Termina", tipo: "time", valor: a.horaFin, clase: "col-4" }) +
      UI.campo({ nombre: "lugar", etiqueta: "Lugar", valor: a.lugar, clase: "col-8 col-movil-completo" }) +
      UI.campo({ nombre: "modalidad", etiqueta: "Modalidad", tipo: "select", valor: a.modalidad, opciones: [["presencial", "Presencial"], ["en línea", "En línea"], ["mixta", "Mixta"]], clase: "col-4" }) +
      UI.campo({ nombre: "presidencia", etiqueta: "Preside", valor: a.presidencia, lista: personas, clase: "col-6 col-movil-completo" }) +
      UI.campo({ nombre: "secretaria", etiqueta: "Secretario/a", valor: a.secretaria, lista: personas, clase: "col-6 col-movil-completo" }) +
      "</div></section>" +
      '<section class="tarjeta"><div class="tarjeta-cabecera"><h2>Asistentes <span class="detalle" id="n-asist">(' + a.asistentes.length + ')</span></h2>' +
      '<button type="button" class="btn btn-secundario" id="b-asist">Añadir asistentes</button></div><div id="asistentes">' + htmlAsistentes(a) + "</div>" +
      '<div class="rejilla">' + UI.campo({ nombre: "excusan", etiqueta: "Excusan su asistencia", valor: a.excusan }) + UI.campo({ nombre: "invitados", etiqueta: "Invitados (sin voto)", valor: a.invitados }) + "</div></section>" +
      '<section class="tarjeta"><h2>Orden del día, desarrollo y acuerdos</h2><ol class="puntos" id="puntos">' + htmlPuntos(a) + "</ol>" +
      '<button type="button" class="btn btn-secundario" id="b-punto">Añadir punto</button>' +
      UI.campo({ nombre: "ruegos", etiqueta: "Ruegos y preguntas", tipo: "textarea", valor: a.ruegos, ancho: "completo" }) +
      '<p class="letra-pequena">El contenido de las actas, quién las firma y qué mayorías hacen falta para cada acuerdo los marcan vuestros estatutos (verificar con asesoría). La aplicación solo anota el resultado.</p></section>' +
      '<section class="tarjeta"><h2>Aprobación</h2><div class="rejilla">' +
      UI.campo({ nombre: "estado", etiqueta: "Estado", tipo: "select", valor: a.estado, opciones: [["borrador", "Borrador"], ["aprobada", "Aprobada"]] }) +
      UI.campo({ nombre: "aprobacion", etiqueta: "Aprobada en", valor: a.aprobacion, ayuda: "Por ejemplo: «en la reunión siguiente, acta JD-2026-05»." }) +
      UI.campo({ nombre: "notas", etiqueta: "Notas internas", valor: a.notas, ancho: "completo" }) + "</div></section>" +
      '<div class="acciones barra-guardar"><button type="submit" class="btn btn-primario">Guardar acta</button>' +
      (nueva ? "" : '<a class="btn btn-secundario" href="#/actas/imprimir/' + encodeURIComponent(a.id) + '">Imprimir para firmar</a><button type="button" class="btn btn-secundario lectura-ok" id="b-copiar">Copiar texto</button>') +
      "</div></form>" +
      (nueva ? "" : WA.DocsUI.seccion(c.documentos, { tipo: "acta", id: a.id }, "Acta firmada y anexos")) +
      (nueva || a.estado === "aprobada" ? "" : '<div class="acciones"><button type="button" class="btn btn-peligro-suave" id="b-borrar">Borrar borrador</button></div>');

    var form = cont.querySelector("#acta");
    var lista = cont.querySelector("#puntos");
    var repintarPuntos = function () { lista.innerHTML = htmlPuntos(a); };
    // Cambiar de órgano en un acta nueva: se carga su plantilla (si no se ha escrito nada aún).
    form.elements.organoId.addEventListener("change", function () {
      leer(form, a);
      var vacio = a.ordenDelDia.every(function (p) { return !p.desarrollo && !(p.acuerdos || []).length; });
      if (vacio) { a.ordenDelDia = Ac.plantilla(organoDe(c, form.elements.organoId.value), a.tipoSesion); repintarPuntos(); }
    });
    form.elements.tipoSesion.addEventListener("change", function () {
      leer(form, a);
      var vacio = a.ordenDelDia.every(function (p) { return !p.desarrollo && !(p.acuerdos || []).length; });
      if (nueva && vacio) { a.ordenDelDia = Ac.plantilla(organoDe(c, a.organoId), a.tipoSesion); repintarPuntos(); }
    });
    lista.addEventListener("change", function (e) {
      if (/votacion$/.test(e.target.name)) e.target.closest(".acuerdo-votacion").querySelector(".votos").hidden = e.target.value !== "votacion";
    });
    lista.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      leer(form, a);
      var i;
      if (b.hasAttribute("data-acuerdo")) { i = +b.getAttribute("data-acuerdo"); a.ordenDelDia[i].acuerdos.push({ id: Ac.nuevoId(), texto: "", votacion: "", resultado: "" }); }
      else if (b.hasAttribute("data-quitar-acuerdo")) { var p = b.getAttribute("data-quitar-acuerdo").split("-"); a.ordenDelDia[+p[0]].acuerdos.splice(+p[1], 1); }
      else if (b.hasAttribute("data-quitar-punto")) a.ordenDelDia.splice(+b.getAttribute("data-quitar-punto"), 1);
      else if (b.hasAttribute("data-subir")) { i = +b.getAttribute("data-subir"); a.ordenDelDia.splice(i - 1, 0, a.ordenDelDia.splice(i, 1)[0]); }
      else if (b.hasAttribute("data-bajar")) { i = +b.getAttribute("data-bajar"); a.ordenDelDia.splice(i + 1, 0, a.ordenDelDia.splice(i, 1)[0]); }
      else return;
      repintarPuntos();
    });
    cont.querySelector("#b-punto").addEventListener("click", function () {
      leer(form, a);
      a.ordenDelDia.push(Ac.punto(""));
      repintarPuntos();
      form.elements["p-" + (a.ordenDelDia.length - 1) + "-titulo"].focus();
    });
    cont.querySelector("#b-asist").addEventListener("click", async function () {
      leer(form, a);
      if (await elegirAsistentes(c, a)) { cont.querySelector("#asistentes").innerHTML = htmlAsistentes(a); cont.querySelector("#n-asist").textContent = "(" + a.asistentes.length + ")"; }
    });
    cont.querySelector("#asistentes").addEventListener("click", function (e) {
      var b = e.target.closest("[data-quitar-asistente]");
      if (!b) return;
      a.asistentes.splice(+b.getAttribute("data-quitar-asistente"), 1);
      cont.querySelector("#asistentes").innerHTML = htmlAsistentes(a);
      cont.querySelector("#n-asist").textContent = "(" + a.asistentes.length + ")";
    });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      leer(form, a);
      if (!F.esValida(a.fecha)) { UI.marcarError(form, "fecha", "Pon la fecha."); return; }
      UI.marcarError(form, "fecha", "");
      if (!a.numero) a.numero = Ac.siguienteNumero(c.actas, organoDe(c, a.organoId), a.fecha.slice(0, 4), c.config.actas.numeracion);
      var problemas = Ac.revisar(a);
      if (a.estado === "aprobada" && problemas.length) {
        await UI.dialogo({ titulo: "Antes de darla por aprobada", contenido: '<ul class="lista">' + problemas.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>",
          botones: [{ texto: "Entendido", valor: "cancelar", estilo: "btn-primario" }] });
        return;
      }
      var g = await datos.guardar("actas", a);
      // La convocatoria de la que sale, enlazada con su acta
      var deConv = nueva && a.convocatoriaId ? c.convocatorias.filter(function (x) { return x.id === a.convocatoriaId; })[0] : null;
      if (deConv && !deConv.actaId) await datos.guardar("convocatorias", Object.assign(deConv, { actaId: g.id }));
      UI.aviso("Acta " + g.numero + " guardada." + (problemas.length ? " Falta: " + problemas.join(" ") : ""), problemas.length ? "info" : "ok");
      if (nueva) location.hash = "#/actas/ficha/" + encodeURIComponent(g.id); else WA.App.repintar();
    });
    if (nueva) return;
    WA.DocsUI.conectarSeccion(cont, datos, { tipo: "acta", id: a.id }, "Actas firmadas");
    cont.querySelector("#b-copiar").addEventListener("click", async function () {
      leer(form, a);
      var t = Ac.textoPlano(a, organoDe(c, a.organoId), c.asociacion);
      try { await navigator.clipboard.writeText(t); UI.aviso("Texto del acta copiado."); } catch (err) { UI.aviso("No se ha podido copiar.", "error"); }
    });
    var bBorrar = cont.querySelector("#b-borrar");
    if (bBorrar) bBorrar.addEventListener("click", async function () {
      if (!(await UI.confirmar("Se borrará el borrador del acta " + a.numero + ".", { titulo: "Borrar acta", aceptar: "Borrar", peligro: true }))) return;
      await datos.borrar("actas", a.id);
      location.hash = "#/actas";
    });
  }

  // ── Para firmar ─────────────────────────────────────────────────────────
  async function pintarImprimir(cont, datos, id) {
    var c = await cargar(datos);
    var a = c.actas.filter(function (x) { return x.id === id; })[0];
    if (!a) { cont.innerHTML = "<h1>No encontrada</h1>"; return; }
    var org = organoDe(c, a.organoId), as = c.asociacion;
    var asist = (a.asistentes || []).map(function (x) { return esc(x.nombre) + (x.cargo ? " (" + esc(x.cargo) + ")" : ""); });
    cont.innerHTML =
      '<div class="acciones no-imprimir"><button type="button" class="btn btn-primario lectura-ok" id="i-imprimir">Imprimir o guardar en PDF</button>' +
      '<a class="btn btn-secundario" href="#/actas/ficha/' + encodeURIComponent(a.id) + '">Volver</a></div>' +
      '<article class="documento-impreso">' +
      '<p class="di-entidad">' + esc(as.nombre || "") + (as.nif ? " · NIF " + esc(as.nif) : "") + "</p>" +
      "<h1>Acta " + esc(a.numero) + "</h1><h2>Reunión " + (a.tipoSesion === "extraordinaria" ? "extraordinaria" : "ordinaria") + " de " + esc(org.nombre) + "</h2>" +
      "<p>En " + esc(a.lugar || "…") + (a.modalidad !== "presencial" ? " (modalidad " + esc(a.modalidad) + ")" : "") + ", el " + esc(F.larga(a.fecha)) +
      (a.horaInicio ? ", a las " + esc(a.horaInicio) + " horas" : "") + (a.convocatoria ? ", en " + esc(a.convocatoria) + " convocatoria" : "") +
      ", se reúne " + esc(org.nombre) + ", presidida por <strong>" + esc(a.presidencia || "…") + "</strong> y actuando como secretario/a <strong>" + esc(a.secretaria || "…") + "</strong>.</p>" +
      "<p><strong>Asistentes (" + asist.length + "):</strong> " + (asist.join(", ") || "—") + ".</p>" +
      (a.excusan ? "<p><strong>Excusan su asistencia:</strong> " + esc(a.excusan) + ".</p>" : "") +
      (a.invitados ? "<p><strong>Invitados:</strong> " + esc(a.invitados) + ".</p>" : "") +
      "<h3>Orden del día</h3><ol>" + a.ordenDelDia.map(function (p) { return "<li>" + esc(p.titulo) + "</li>"; }).join("") + "</ol>" +
      "<h3>Desarrollo de la sesión y acuerdos</h3>" + a.ordenDelDia.map(function (p, i) {
        return "<h4>" + (i + 1) + ". " + esc(p.titulo) + "</h4>" + (p.desarrollo ? "<p>" + esc(p.desarrollo).replace(/\n/g, "<br>") + "</p>" : "") +
          (p.acuerdos || []).filter(function (x) { return String(x.texto || "").trim(); }).map(function (ac, k) {
            var v = Ac.textoVotacion(ac);
            return '<p class="di-acuerdo"><strong>Acuerdo ' + (i + 1) + "." + (k + 1) + ":</strong> " + esc(ac.texto) + (v ? " <em>(" + esc(v) + ")</em>" : "") + "</p>";
          }).join("");
      }).join("") +
      (a.ruegos ? "<h4>Ruegos y preguntas</h4><p>" + esc(a.ruegos).replace(/\n/g, "<br>") + "</p>" : "") +
      "<p>Y no habiendo más asuntos que tratar, se levanta la sesión" + (a.horaFin ? " a las " + esc(a.horaFin) + " horas" : "") + ", de lo que como secretario/a doy fe, con el visto bueno de la presidencia.</p>" +
      '<div class="di-firmas"><div><p>Vº Bº La Presidencia</p><div class="di-firma"></div><p>' + esc(a.presidencia) + "</p></div>" +
      "<div><p>La Secretaría</p><div class=\"di-firma\"></div><p>" + esc(a.secretaria) + "</p></div></div>" +
      "</article>" + '<p class="detalle no-imprimir">Revisad que el acta incluye lo que piden vuestros estatutos (verificar con asesoría).</p>';
    cont.querySelector("#i-imprimir").addEventListener("click", function () { window.print(); });
  }

  // ── Libro de acuerdos ───────────────────────────────────────────────────
  var textoAcuerdos = "";
  async function pintarAcuerdos(cont, datos) {
    var c = await cargar(datos);
    var todos = Ac.acuerdos(c.actas, c.config.organos);
    cont.innerHTML = '<div class="cabecera-pagina"><h1>Actas</h1></div>' + pestanas("acuerdos") +
      '<div class="barra-filtros"><label class="filtro-texto"><span class="sr">Buscar</span><input type="search" id="b-acuerdo" placeholder="Buscar acuerdo…" value="' + esc(textoAcuerdos) + '"></label></div>' +
      '<div id="t-acuerdos"></div>';
    function refrescar() {
      var t = textoAcuerdos.trim().toLowerCase();
      var lista = todos.filter(function (x) { return !t || (x.texto + " " + x.tituloPunto + " " + x.numero).toLowerCase().indexOf(t) >= 0; });
      cont.querySelector("#t-acuerdos").innerHTML = !lista.length ? '<p class="vacio">No hay acuerdos.</p>' :
        '<div class="tabla-envoltorio"><table class="tabla"><thead><tr><th scope="col">Fecha</th><th scope="col">Acta</th><th scope="col">Acuerdo</th><th scope="col" class="solo-ancho">Votación</th></tr></thead><tbody>' +
        lista.map(function (x) {
          return "<tr><td>" + esc(F.corta(x.fecha)) + '</td><td><a href="#/actas/ficha/' + encodeURIComponent(x.actaId) + '">' + esc(x.numero) + '</a><br><span class="detalle">' + esc(x.organo) + "</span></td>" +
            "<td>" + esc(x.texto) + '<br><span class="detalle">Punto ' + x.punto + ": " + esc(x.tituloPunto) + '</span></td><td class="solo-ancho">' + esc(x.votacion) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    refrescar();
    cont.querySelector("#b-acuerdo").addEventListener("input", function (e) { textoAcuerdos = e.target.value; refrescar(); });
  }

  // ── Órganos ─────────────────────────────────────────────────────────────
  async function pintarOrganos(cont, datos) {
    var c = await cargar(datos);
    var usados = {};
    c.actas.forEach(function (a) { usados[a.organoId] = (usados[a.organoId] || 0) + 1; });
    var tipoTxt = {};
    Ac.TIPOS_ORGANO.forEach(function (t) { tipoTxt[t[0]] = t[1]; });
    cont.innerHTML = '<div class="cabecera-pagina"><h1>Actas</h1><button type="button" class="btn btn-primario" id="o-nuevo">Añadir órgano</button></div>' + pestanas("organos") +
      '<p class="intro">Los órganos que levantan actas. Añade un órgano por cada departamento que se reúna.</p>' +
      '<div class="tabla-envoltorio"><table class="tabla"><tbody>' + c.config.organos.map(function (o) {
        return '<tr><th scope="row">' + esc(o.nombre) + '<br><span class="detalle">' + esc(tipoTxt[o.tipo] || "") + "</span></th><td>Prefijo " + esc(o.prefijo) + "</td><td>" + (usados[o.id] || 0) + " actas</td>" +
          '<td class="celda-acciones"><button type="button" class="btn btn-pequeno btn-secundario" data-organo="' + esc(o.id) + '">Editar</button></td></tr>';
      }).join("") + "</tbody></table></div>" +
      '<section class="tarjeta"><h2>Numeración</h2><form id="o-num" class="formulario" novalidate>' +
      UI.campo({ nombre: "numeracion", etiqueta: "Las actas se numeran", tipo: "select", valor: c.config.actas.numeracion,
        opciones: [["anual", "Por año: JD-2026-01, JD-2026-02…"], ["correlativa", "Correlativa: JD-1, JD-2… (sin reiniciar)"]] }) +
      '<div class="acciones"><button type="submit" class="btn btn-primario">Guardar</button></div></form></section>';
    async function editar(o) {
      var x = o || { id: Ac.nuevoId(), nombre: "", prefijo: "", tipo: "departamento" };
      var r = await UI.dialogo({
        titulo: o ? "Editar órgano" : "Nuevo órgano",
        contenido: '<form class="formulario" novalidate><div class="rejilla">' +
          UI.campo({ nombre: "nombre", etiqueta: "Nombre", valor: x.nombre, requerido: true, ancho: "completo", ayuda: "Por ejemplo: Departamento de Actividades." }) +
          UI.campo({ nombre: "prefijo", etiqueta: "Prefijo del número", valor: x.prefijo, requerido: true, ayuda: "2–5 letras: DACT, DCOM…", atributos: 'maxlength="6" autocapitalize="characters"' }) +
          UI.campo({ nombre: "tipo", etiqueta: "Tipo", tipo: "select", valor: x.tipo, opciones: Ac.TIPOS_ORGANO, ayuda: "Decide la plantilla del orden del día." }) + "</div></form>",
        botones: (o && !usados[o.id] && c.config.organos.length > 1 ? [{ texto: "Borrar", valor: "borrar", estilo: "btn-peligro-suave" }] : [])
          .concat([{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }]),
        validar: function (form) {
          var d = UI.leerFormulario(form), pre = d.prefijo.toUpperCase().replace(/[^A-Z0-9]/g, "");
          var repetido = c.config.organos.some(function (y) { return y.id !== x.id && y.prefijo.toUpperCase() === pre; });
          UI.marcarError(form, "nombre", d.nombre ? "" : "Pon un nombre.");
          UI.marcarError(form, "prefijo", !pre ? "Pon un prefijo." : repetido ? "Ese prefijo ya lo usa otro órgano." : "");
          return !!d.nombre && !!pre && !repetido;
        },
      });
      if (r.valor === "borrar") c.config.organos = c.config.organos.filter(function (y) { return y.id !== x.id; });
      else if (r.valor === "enviar") {
        Object.assign(x, { nombre: r.datos.nombre, prefijo: r.datos.prefijo.toUpperCase().replace(/[^A-Z0-9]/g, ""), tipo: r.datos.tipo });
        if (!o) c.config.organos.push(x);
      } else return;
      await datos.escribir("config", c.config);
      UI.aviso("Órganos guardados.");
      WA.App.repintar();
    }
    cont.querySelector("#o-nuevo").addEventListener("click", function () { editar(null); });
    cont.querySelectorAll("[data-organo]").forEach(function (b) { b.addEventListener("click", function () { editar(organoDe(c, b.getAttribute("data-organo"))); }); });
    cont.querySelector("#o-num").addEventListener("submit", async function (e) {
      e.preventDefault();
      c.config.actas.numeracion = e.target.elements.numeracion.value;
      await datos.escribir("config", c.config);
      UI.aviso("Numeración guardada. Se aplica a las actas nuevas.");
    });
  }

  // ── Convocatorias ───────────────────────────────────────────────────────
  var ESTADO_CONV = { borrador: ["estado-aviso", "Sin enviar"], enviada: ["estado-ok", "Enviada"] };

  async function pintarConvocatorias(cont, datos) {
    var c = await cargar(datos);
    var lista = c.convocatorias.slice().sort(function (x, y) { return String(y.fecha).localeCompare(String(x.fecha)); });
    var hoy = F.hoy();
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Actas</h1><div class="acciones-cabecera"><label class="sr" for="n-organo">Órgano de la convocatoria</label>' +
      '<select id="n-organo" class="select-pequeno">' + c.config.organos.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.nombre) + "</option>"; }).join("") + "</select>" +
      '<button type="button" class="btn btn-primario" id="n-crear">Nueva convocatoria</button></div></div>' + pestanas("convocatorias") +
      '<p class="intro">Asambleas y reuniones: el orden del día, la carta para imprimir, el correo a quien corresponda y el evento para el calendario. Celebrada la reunión, de aquí sale su acta.</p>' +
      (!lista.length ? '<p class="vacio">No hay convocatorias.</p>' :
        '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Convocatorias</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Órgano</th>' +
        '<th scope="col" class="solo-ancho">Lugar</th><th scope="col">Estado</th><th scope="col">Acta</th></tr></thead><tbody>' + lista.map(function (v) {
          var e = ESTADO_CONV[v.estado] || ESTADO_CONV.borrador, acta = v.actaId ? c.actas.filter(function (x) { return x.id === v.actaId; })[0] : null;
          return '<tr><th scope="row"><a href="#/actas/convocatoria/' + encodeURIComponent(v.id) + '">' + esc(F.corta(v.fecha)) + " · " + esc(v.hora) + "</a></th>" +
            "<td>" + esc(organoDe(c, v.organoId).nombre) + (v.tipoSesion === "extraordinaria" ? " (extraordinaria)" : "") + '</td><td class="solo-ancho">' +
            esc(v.modalidad === "en línea" ? "En línea" : v.lugar) + '</td><td><span class="estado ' + e[0] + '">' + e[1] + "</span></td><td>" +
            (acta ? '<a href="#/actas/ficha/' + encodeURIComponent(acta.id) + '">' + esc(acta.numero) + "</a>" : v.fecha <= hoy ? '<a href="#/actas/desde/' + encodeURIComponent(v.id) + '">Hacer el acta</a>' : "—") + "</td></tr>";
        }).join("") + "</tbody></table></div>");
    cont.querySelector("#n-crear").addEventListener("click", function () { location.hash = "#/actas/convocatoria-nueva/" + encodeURIComponent(cont.querySelector("#n-organo").value); });
  }

  async function pintarConvocatoria(cont, datos, id, organoNuevo) {
    var c = await cargar(datos);
    var v = id ? c.convocatorias.filter(function (x) { return x.id === id; })[0] : null;
    if (id && !v) { cont.innerHTML = '<h1>Convocatoria no encontrada</h1><p><a href="#/actas/convocatorias">Volver</a></p>'; return; }
    var nueva = !v;
    if (nueva) {
      v = Conv.vacia(organoDe(c, organoNuevo || (c.config.organos[0] || {}).id));
      var presi = c.junta.filter(function (j) { return j.cargo === "Presidencia" && (!j.hasta || j.hasta >= F.hoy()); })[0];
      v.convoca = "La Presidencia" + (presi ? ", " + presi.nombre : "");
    }
    var org = organoDe(c, v.organoId), acta = v.actaId ? c.actas.filter(function (x) { return x.id === v.actaId; })[0] : null;
    var firmantes = c.junta.filter(function (j) { return !j.hasta || j.hasta >= F.hoy(); }).map(function (j) { return "La " + (j.cargo === "Otro" && j.cargoOtro ? j.cargoOtro : j.cargo) + ", " + j.nombre; });
    var e = ESTADO_CONV[v.estado] || ESTADO_CONV.borrador;
    cont.innerHTML =
      '<p class="miga"><a href="#/actas/convocatorias">Convocatorias</a> › ' + (nueva ? "Nueva" : esc(F.corta(v.fecha))) + "</p>" +
      '<div class="cabecera-pagina"><h1>' + (nueva ? "Nueva convocatoria" : "Convocatoria · " + esc(org.nombre)) + "</h1>" +
      (nueva ? "" : '<span class="estado ' + e[0] + '">' + e[1] + (v.enviada ? " el " + esc(F.corta(v.enviada)) : "") + "</span>") + "</div>" + WA.UI.firma(v) +
      '<form id="conv" class="formulario" novalidate>' +
      '<section class="tarjeta"><h2>La reunión</h2><div class="rejilla-12">' +
      UI.campo({ nombre: "organoId", etiqueta: "Órgano", tipo: "select", valor: v.organoId, opciones: c.config.organos.map(function (o) { return [o.id, o.nombre]; }), clase: "col-4 col-movil-completo" }) +
      UI.campo({ nombre: "tipoSesion", etiqueta: "Sesión", tipo: "select", valor: v.tipoSesion, opciones: [["ordinaria", "Ordinaria"], ["extraordinaria", "Extraordinaria"]], clase: "col-4" }) +
      UI.campo({ nombre: "fecha", etiqueta: "Fecha", tipo: "date", valor: v.fecha, requerido: true, clase: "col-4" }) +
      UI.campo({ nombre: "hora", etiqueta: "Hora", tipo: "time", valor: v.hora, requerido: true, clase: "col-4" }) +
      UI.campo({ nombre: "horaSegunda", etiqueta: "Segunda convocatoria", tipo: "time", valor: v.horaSegunda, clase: "col-4", ayuda: "Si vuestros estatutos la prevén." }) +
      UI.campo({ nombre: "modalidad", etiqueta: "Modalidad", tipo: "select", valor: v.modalidad, opciones: [["presencial", "Presencial"], ["en línea", "En línea"], ["mixta", "Mixta"]], clase: "col-4" }) +
      UI.campo({ nombre: "lugar", etiqueta: "Lugar", valor: v.lugar, clase: "col-6 col-movil-completo" }) +
      UI.campo({ nombre: "enlace", etiqueta: "Enlace (si es en línea)", tipo: "url", valor: v.enlace, clase: "col-6 col-movil-completo" }) +
      "</div></section>" +
      '<section class="tarjeta"><h2>Orden del día</h2>' +
      UI.campo({ nombre: "ordenDelDia", etiqueta: "Un punto por línea", tipo: "textarea", filas: 7, valor: (v.ordenDelDia || []).join("\n"), ancho: "completo" }) +
      UI.campo({ nombre: "notas", etiqueta: "Texto añadido (sale en la convocatoria)", tipo: "textarea", filas: 2, valor: v.notas, ancho: "completo",
        ayuda: "Por ejemplo: que las cuentas están a disposición de los socios, o cómo delegar el voto." }) +
      UI.campo({ nombre: "convoca", etiqueta: "Quién convoca (firma)", valor: v.convoca, lista: firmantes, ancho: "completo" }) +
      '<p class="letra-pequena">Con cuánta antelación, por qué medio y quién debe convocar lo dicen vuestros estatutos (verificar con asesoría).</p></section>' +
      '<div class="acciones barra-guardar"><button type="submit" class="btn btn-primario">Guardar</button>' +
      (nueva ? "" : '<button type="button" class="btn btn-secundario" id="v-correo">Enviar por correo…</button>' +
        '<button type="button" class="btn btn-secundario lectura-ok" id="v-ics">Añadir al calendario</button>' +
        '<a class="btn btn-secundario" href="#/actas/convocatoria-imprimir/' + encodeURIComponent(v.id) + '">Imprimir o PDF</a>' +
        (acta ? '<a class="btn btn-secundario" href="#/actas/ficha/' + encodeURIComponent(acta.id) + '">Ver el acta ' + esc(acta.numero) + "</a>"
          : '<a class="btn btn-secundario" href="#/actas/desde/' + encodeURIComponent(v.id) + '">Hacer el acta</a>') +
        '<button type="button" class="btn btn-peligro-suave" id="v-borrar">Borrar</button>') +
      "</div></form>";

    var form = cont.querySelector("#conv");
    function leerConv() {
      var d = UI.leerFormulario(form);
      return Object.assign(v, {
        organoId: d.organoId, tipoSesion: d.tipoSesion, fecha: d.fecha, hora: d.hora, horaSegunda: d.horaSegunda, modalidad: d.modalidad,
        lugar: d.lugar, enlace: d.enlace, notas: d.notas, convoca: d.convoca,
        ordenDelDia: String(d.ordenDelDia || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean),
      });
    }
    // Otro órgano o tipo de sesión en una nueva: su plantilla, si no se ha tocado
    var plantilla = function () { return Ac.plantilla(organoDe(c, form.elements.organoId.value), form.elements.tipoSesion.value).map(function (p) { return p.titulo; }).join("\n"); };
    var original = form.elements.ordenDelDia.value;
    ["organoId", "tipoSesion"].forEach(function (n) {
      form.elements[n].addEventListener("change", function () {
        if (!nueva || form.elements.ordenDelDia.value !== original) return;
        original = form.elements.ordenDelDia.value = plantilla();
      });
    });
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      leerConv();
      if (!F.esValida(v.fecha)) { UI.marcarError(form, "fecha", "Pon la fecha."); return; }
      UI.marcarError(form, "fecha", "");
      var g = await datos.guardar("convocatorias", v);
      var falta = Conv.revisar(g);
      UI.aviso("Convocatoria guardada." + (falta.length ? " Antes de enviarla: " + falta.join(" ") : ""), falta.length ? "info" : "ok");
      if (nueva) location.hash = "#/actas/convocatoria/" + encodeURIComponent(g.id); else WA.App.repintar();
    });
    if (nueva) return;

    cont.querySelector("#v-ics").addEventListener("click", function () {
      leerConv();
      UI.descargar("convocatoria-" + v.fecha + ".ics", WA.Actividades.ics([Conv.aEvento(v, organoDe(c, v.organoId))], { zona: c.config.zonaHoraria }), "text/calendar;charset=utf-8");
    });
    cont.querySelector("#v-borrar").addEventListener("click", async function () {
      if (!(await UI.confirmar("Se borrará la convocatoria" + (acta ? " (su acta se queda)" : "") + ".", { titulo: "Borrar convocatoria", aceptar: "Borrar", peligro: true }))) return;
      await datos.borrar("convocatorias", v.id);
      location.hash = "#/actas/convocatorias";
    });
    cont.querySelector("#v-correo").addEventListener("click", async function () {
      leerConv();
      var falta = Conv.revisar(v);
      if (falta.length) {
        await UI.dialogo({ titulo: "Falta algo", contenido: '<ul class="lista">' + falta.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>",
          botones: [{ texto: "Entendido", valor: "cancelar", estilo: "btn-primario" }] });
        return;
      }
      var o = organoDe(c, v.organoId), dest = Conv.destinatarios(v, o, c.socios, c.junta);
      var asunto = Conv.asunto(v, o), cuerpo = Conv.texto(v, o, c.asociacion), m = Conv.mailto(asunto, cuerpo, dest.correos);
      var copiar = async function (t, que) {
        try { await navigator.clipboard.writeText(t); UI.aviso(que + " copiado."); } catch (err) { UI.aviso("No se ha podido copiar.", "error"); }
      };
      var r = await UI.dialogo({
        titulo: "Enviar la convocatoria",
        contenido: "<p>Va a <strong>" + dest.correos.length + (dest.correos.length === 1 ? " persona" : " personas") + "</strong> (" +
          (o.tipo === "asamblea" ? "los socios activos" : "la junta vigente") + "), en copia oculta, desde <strong>tu</strong> programa de correo: Agora no envía nada.</p>" +
          (m.conDestinatarios ? "" : '<div class="caja-aviso">Son demasiados para ponerlos en el enlace: copia las direcciones y pégalas en «CCO».</div>') +
          (dest.sinCorreo.length ? '<details class="historico"><summary>' + dest.sinCorreo.length + " sin correo (convócalos de otra forma)</summary><p>" +
            esc(dest.sinCorreo.join(", ")) + "</p></details>" : "") +
          '<div class="acciones"><a class="btn btn-primario" id="v-abrir" href="' + esc(m.url) + '">Abrir el correo</a>' +
          '<button type="button" class="btn btn-secundario" id="v-dir">Copiar direcciones</button><button type="button" class="btn btn-secundario" id="v-txt">Copiar texto</button></div>',
        botones: [{ texto: "Cerrar", valor: "cancelar" }, { texto: "Marcar como enviada", valor: "enviada", estilo: "btn-primario" }],
        alAbrir: function (d) {
          d.querySelector("#v-dir").addEventListener("click", function () { copiar(dest.correos.join(", "), "Direcciones"); });
          d.querySelector("#v-txt").addEventListener("click", function () { copiar(asunto + "\n\n" + cuerpo, "Texto"); });
        },
      });
      if (r.valor !== "enviada") return;
      await datos.guardar("convocatorias", Object.assign(v, { estado: "enviada", enviada: F.hoy() }));
      UI.aviso("Convocatoria marcada como enviada.");
      WA.App.repintar();
    });
  }

  async function pintarConvocatoriaImpresa(cont, datos, id) {
    var c = await cargar(datos);
    var v = c.convocatorias.filter(function (x) { return x.id === id; })[0];
    if (!v) { cont.innerHTML = "<h1>No encontrada</h1>"; return; }
    var o = organoDe(c, v.organoId), as = c.asociacion;
    // (quien convoca firma abajo: no se repite en el texto)
    var parrafos = Conv.texto(Object.assign({}, v, { convoca: "" }), o, {}).trim().split("\n\n");
    cont.innerHTML =
      '<div class="acciones no-imprimir"><button type="button" class="btn btn-primario lectura-ok" id="i-imprimir">Imprimir o guardar en PDF</button>' +
      '<a class="btn btn-secundario" href="#/actas/convocatoria/' + encodeURIComponent(v.id) + '">Volver</a></div>' +
      '<article class="documento-impreso">' +
      '<p class="di-entidad">' + esc(as.nombre || "") + (as.nif ? " · NIF " + esc(as.nif) : "") + "</p>" +
      "<h1>Convocatoria</h1><h2>" + esc(o.nombre) + " " + (v.tipoSesion === "extraordinaria" ? "extraordinaria" : "ordinaria") + "</h2>" +
      parrafos.map(function (p) {
        if (/^ORDEN DEL DÍA\n/.test(p)) {
          return "<h3>Orden del día</h3><ol>" + p.split("\n").slice(1).map(function (x) { return "<li>" + esc(x.replace(/^\d+\.\s*/, "")) + "</li>"; }).join("") + "</ol>";
        }
        return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>";
      }).join("") +
      '<p class="detalle">En ' + esc((as.domicilio && as.domicilio.municipio) || "…") + ", a " + esc(F.larga(F.hoy())) + ".</p>" +
      '<div class="di-firmas"><div><div class="di-firma"></div><p>' + esc(v.convoca) + "</p></div></div>" +
      "</article>";
    cont.querySelector("#i-imprimir").addEventListener("click", function () { window.print(); });
  }

  async function pintar(cont, datos, ruta) {
    if (ruta[0] === "convocatorias") return pintarConvocatorias(cont, datos);
    if (ruta[0] === "convocatoria") return pintarConvocatoria(cont, datos, ruta[1]);
    if (ruta[0] === "convocatoria-nueva") return pintarConvocatoria(cont, datos, null, ruta[1]);
    if (ruta[0] === "convocatoria-imprimir") return pintarConvocatoriaImpresa(cont, datos, ruta[1]);
    if (ruta[0] === "desde") return pintarFicha(cont, datos, null, null, ruta[1]);
    if (ruta[0] === "nueva") return pintarFicha(cont, datos, null, ruta[1]);
    if (ruta[0] === "ficha") return pintarFicha(cont, datos, ruta[1]);
    if (ruta[0] === "imprimir") return pintarImprimir(cont, datos, ruta[1]);
    if (ruta[0] === "acuerdos") return pintarAcuerdos(cont, datos);
    if (ruta[0] === "organos") return pintarOrganos(cont, datos);
    return pintarLista(cont, datos);
  }

  WA.App.registrar({
    id: "actas", titulo: "Actas", orden: 40, pintar: pintar,
    icono: '<path d="M6 2.5h12v19H6z"/><path d="M9 7h6M9 10.5h6M9 14h4"/><path d="M14 18.5l1.5 1.5 3-3"/>',
  });
})(typeof self !== "undefined" ? self : this);

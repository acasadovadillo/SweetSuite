/*
 * Agora — Módulo «Facturas».
 *
 *   #/facturas                        emitidas (las que hace la asociación)
 *   #/facturas/recibidas              recibidas (de proveedores)
 *   #/facturas/nueva/<emitida|recibida>
 *   #/facturas/ver/<id>               editar o consultar
 *   #/facturas/imprimir/<id>          versión para imprimir o guardar en PDF
 *
 * Las emitidas nacen como BORRADOR (sin número) y al «Emitir» reciben el
 * siguiente número correlativo y quedan bloqueadas. Para corregir una ya
 * emitida se hace una RECTIFICATIVA («Más…» → «Hacer rectificativa»): otra
 * factura, con su serie (R-2026-0001), que dice cuál corrige y por qué.
 * Requisitos: verificar con asesoría.
 * La lógica está en logica/facturas.js (con tests).
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, D = WA.Dinero, Fac = WA.Facturas, U = WA.TesUI;

  var vista = { anio: "", texto: "" };
  var ESTADO = { borrador: ["estado-neutro", "Borrador"], pendiente: ["estado-aviso", "Pendiente"], parcial: ["estado-aviso", "Cobro parcial"],
    cobrada: ["estado-ok", "Cobrada"], pagada: ["estado-ok", "Pagada"], anulada: ["estado-neutro", "Anulada"] };
  var TRAT = {}; Fac.TRATAMIENTOS.forEach(function (t) { TRAT[t[0]] = t[1]; });
  // Una rectificativa en negativo no se cobra: se devuelve
  function estadoDe(f, e) {
    if (Fac.totales(f).total < 0 && f.estado === "emitida") {
      if (e.estado === "pendiente" || e.estado === "parcial") return ["estado-aviso", "Por devolver"];
      if (e.estado === "cobrada") return ["estado-ok", "Devuelta"];
    }
    return ESTADO[e.estado];
  }

  function pestanas(actual) {
    return '<nav class="pestanas" aria-label="Tipo de facturas"><a href="#/facturas"' + (actual === "emitida" ? ' aria-current="page"' : "") + ">Emitidas</a>" +
      '<a href="#/facturas/recibidas"' + (actual === "recibida" ? ' aria-current="page"' : "") + ">Recibidas</a></nav>";
  }

  // ── Listado ─────────────────────────────────────────────────────────────
  async function pintarLista(cont, datos, tipo) {
    var c = await U.cargar(datos);
    var todas = c.facturas.filter(function (f) { return f.tipo === tipo; }).sort(function (a, b) {
      return (b.fecha || "9999").localeCompare(a.fecha || "9999") || String(b.numero).localeCompare(String(a.numero));
    });
    var anios = {};
    todas.forEach(function (f) { if (f.fecha) anios[f.fecha.slice(0, 4)] = true; });
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Facturas</h1><a class="btn btn-primario" href="#/facturas/nueva/' + tipo + '">' + (tipo === "emitida" ? "Nueva factura" : "Apuntar factura recibida") + "</a></div>" +
      pestanas(tipo) +
      '<p class="intro">' + (tipo === "emitida" ? "Las facturas que hace la asociación (talleres, servicios, ventas…)." : "Las facturas que recibe la asociación de sus proveedores.") + "</p>" +
      '<div class="barra-filtros"><label>Año <select id="f-anio"><option value="">Todos</option>' + Object.keys(anios).sort().reverse().map(function (a) {
        return '<option value="' + a + '"' + (vista.anio === a ? " selected" : "") + ">" + a + "</option>";
      }).join("") + "</select></label>" +
      '<label class="filtro-texto"><span class="sr">Buscar</span><input type="search" id="f-buscar" placeholder="Buscar por número o ' + (tipo === "emitida" ? "cliente" : "proveedor") + '…" value="' + esc(vista.texto) + '"></label></div>' +
      '<div id="f-tabla"></div>';
    function refrescar() {
      var t = vista.texto.trim().toLowerCase();
      var lista = todas.filter(function (f) {
        if (vista.anio && (f.fecha || "").slice(0, 4) !== vista.anio) return false;
        return !t || ((f.numero || "") + " " + (f.tercero || {}).nombre).toLowerCase().indexOf(t) >= 0;
      });
      var sumas = { base: 0, cuota: 0, total: 0, pendiente: 0 };
      var filas = lista.map(function (f) {
        var tot = Fac.totales(f), e = Fac.estadoPago(f, c.movimientos, c.anticipos);
        if (f.estado !== "anulada" && f.estado !== "borrador") { sumas.base += tot.base; sumas.cuota += tot.cuota; sumas.total += tot.total; sumas.pendiente += Math.max(e.pendiente, 0); }
        var est = estadoDe(f, e);
        return "<tr><td>" + esc(F.corta(f.fecha)) + '</td><th scope="row"><a href="#/facturas/ver/' + encodeURIComponent(f.id) + '">' + esc(f.numero || "(borrador)") + "</a></th>" +
          "<td>" + esc((f.tercero || {}).nombre) + '</td><td class="importe solo-ancho">' + esc(D.formatear(tot.base)) + '</td><td class="importe solo-ancho">' + esc(D.formatear(tot.cuota)) + "</td>" +
          '<td class="importe">' + esc(D.formatear(tot.total)) + '</td><td><span class="estado ' + est[0] + '">' + est[1] + "</span></td></tr>";
      });
      cont.querySelector("#f-tabla").innerHTML = !lista.length ? '<p class="vacio">No hay facturas.</p>' :
        '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Facturas</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Número</th>' +
        '<th scope="col">' + (tipo === "emitida" ? "Cliente" : "Proveedor") + '</th><th scope="col" class="importe solo-ancho">Base</th><th scope="col" class="importe solo-ancho">IVA</th>' +
        '<th scope="col" class="importe">Total</th><th scope="col">Estado</th></tr></thead><tbody>' + filas.join("") + "</tbody>" +
        '<tfoot><tr><th scope="row" colspan="3">Total (sin borradores ni anuladas)</th><td class="importe solo-ancho">' + esc(D.formatear(sumas.base)) + '</td><td class="importe solo-ancho">' +
        esc(D.formatear(sumas.cuota)) + '</td><td class="importe">' + esc(D.formatear(sumas.total)) + '</td><td class="detalle">Pendiente ' + esc(D.formatear(sumas.pendiente)) + "</td></tr></tfoot></table></div>";
    }
    refrescar();
    cont.querySelector("#f-anio").addEventListener("change", function (e) { vista.anio = e.target.value; refrescar(); });
    cont.querySelector("#f-buscar").addEventListener("input", function (e) { vista.texto = e.target.value; refrescar(); });
  }

  // ── Editor ──────────────────────────────────────────────────────────────
  function facturaNueva(tipo, c) {
    // Se empieza sujeta al 21 %: la categoría (y con ella el IVA habitual) se elige después.
    var trat = "sujeto";
    return { tipo: tipo, estado: tipo === "emitida" ? "borrador" : "emitida", serie: c.config.facturacion.serie || "", numero: "", fecha: F.hoy(), fechaOperacion: "",
      vencimiento: "", tercero: { nombre: "", nif: "", direccion: "", email: "" }, lineas: [Fac.lineaVacia(trat)], retencionPct: 0,
      deducible: !!c.config.iva.presenta, motivoExencion: tipo === "emitida" ? c.config.facturacion.motivoExencion || "" : "",
      categoriaId: tipo === "emitida" ? "" : "", proyectoId: "", notas: "" };
  }

  function filaLinea(l, i, bloqueada) {
    var dis = bloqueada ? " disabled" : "";
    return '<tr data-linea="' + i + '">' +
      '<td><label class="sr" for="l-concepto-' + i + '">Concepto</label><input id="l-concepto-' + i + '" name="concepto-' + i + '" value="' + esc(l.concepto) + '"' + dis + "></td>" +
      '<td class="col-cantidad"><label class="sr" for="l-cantidad-' + i + '">Cantidad</label><input id="l-cantidad-' + i + '" name="cantidad-' + i + '" inputmode="decimal" value="' + esc(String(l.cantidad).replace(".", ",")) + '"' + dis + "></td>" +
      '<td class="col-precio"><label class="sr" for="l-precio-' + i + '">Precio unitario</label><input id="l-precio-' + i + '" name="precio-' + i + '" inputmode="decimal" value="' + esc(D.formatear(l.precio, { simbolo: false })) + '"' + dis + "></td>" +
      '<td><label class="sr" for="l-trat-' + i + '">IVA</label><select id="l-trat-' + i + '" name="tratamiento-' + i + '"' + dis + ">" + Fac.TRATAMIENTOS.map(function (t) {
        return '<option value="' + t[0] + '"' + (l.tratamiento === t[0] ? " selected" : "") + ">" + t[1] + "</option>";
      }).join("") + "</select></td>" +
      '<td class="col-tipo"><label class="sr" for="l-tipo-' + i + '">Tipo de IVA</label><select id="l-tipo-' + i + '" name="tipoIva-' + i + '"' + dis + (l.tratamiento !== "sujeto" ? " hidden" : "") + ">" + Fac.TIPOS_IVA.map(function (t) {
        return '<option value="' + t + '"' + (Number(l.tipoIva) === t ? " selected" : "") + ">" + t + " %</option>";
      }).join("") + "</select></td>" +
      '<td class="importe" data-base-linea>' + esc(D.formatear(Fac.baseLinea(l))) + "</td>" +
      (bloqueada ? "" : '<td><button type="button" class="btn-icono" data-quitar-linea="' + i + '" aria-label="Quitar la línea ' + (i + 1) + '">✕</button></td>') + "</tr>";
  }

  function totalesHtml(f) {
    var t = Fac.totales(f);
    return '<table class="tabla tabla-totales"><tbody>' + t.porTipo.map(function (g) {
      return "<tr><th scope=\"row\">Base " + (g.tratamiento === "sujeto" ? g.tipoIva + " %" : TRAT[g.tratamiento].toLowerCase()) + '</th><td class="importe">' + esc(D.formatear(g.base)) + "</td></tr>" +
        (g.tratamiento === "sujeto" ? "<tr><th scope=\"row\">IVA " + g.tipoIva + ' %</th><td class="importe">' + esc(D.formatear(g.cuota)) + "</td></tr>" : "");
    }).join("") + (t.retencion ? '<tr><th scope="row">Retención IRPF ' + esc(f.retencionPct) + ' %</th><td class="importe">−' + esc(D.formatear(t.retencion)) + "</td></tr>" : "") +
      '<tr class="total"><th scope="row">Total</th><td class="importe">' + esc(D.formatear(t.total)) + "</td></tr></tbody></table>";
  }

  /** Lee el formulario del editor y lo vuelca en la factura. */
  function leerEditor(form, f) {
    var d = UI.leerFormulario(form);
    var lineas = [];
    form.querySelectorAll("[data-linea]").forEach(function (tr) {
      var i = tr.getAttribute("data-linea");
      // «1,5» (coma decimal, con o sin puntos de miles) o «1.5»: las dos valen.
      var textoCant = String(d["cantidad-" + i] || "0").trim();
      var cant = Number(textoCant.indexOf(",") >= 0 ? textoCant.replace(/\./g, "").replace(",", ".") : textoCant);
      lineas.push({ concepto: d["concepto-" + i] || "", cantidad: isFinite(cant) ? cant : 0, precio: D.desdeTexto(d["precio-" + i] || "0") || 0,
        tratamiento: d["tratamiento-" + i] || "sujeto", tipoIva: Number(d["tipoIva-" + i] || 21) });
    });
    return Object.assign(f, {
      fecha: d.fecha, vencimiento: d.vencimiento, numero: f.tipo === "recibida" ? d.numero : f.numero,
      tercero: { nombre: d.terceroNombre, nif: WA.Validar.normalizar(d.terceroNif), direccion: d.terceroDireccion, email: d.terceroEmail },
      lineas: lineas, retencionPct: Number(String(d.retencionPct || "0").replace(",", ".")) || 0, motivoExencion: d.motivoExencion || "",
      categoriaId: d.categoriaId, proyectoId: d.proyectoId, notas: d.notas, deducible: f.tipo === "recibida" ? !!d.deducible : f.deducible,
      motivoRectificacion: f.rectifica ? d.motivoRectificacion || "" : f.motivoRectificacion,
    });
  }

  async function pintarEditor(cont, datos, f, c) {
    var nueva = !f.id;
    var bloqueada = f.tipo === "emitida" && f.estado !== "borrador" && !f._desbloqueada;
    var esEmitida = f.tipo === "emitida";
    var terceros = {};
    c.facturas.forEach(function (x) { if (x.tipo === f.tipo && x.tercero && x.tercero.nombre) terceros[x.tercero.nombre] = x.tercero; });
    var e = f.id ? Fac.estadoPago(f, c.movimientos, c.anticipos) : null;
    var pagos = f.id ? c.movimientos.filter(function (m) { return m.facturaId === f.id; }) : [];
    var dis = bloqueada ? " disabled" : "";
    var devolver = esEmitida && Fac.totales(f).total < 0;
    var rectificadaPor = f.id ? Fac.rectificativasDe(f, c.facturas) : [];
    var enlace = function (x) { return '<a href="#/facturas/ver/' + encodeURIComponent(x.id) + '">' + esc(x.numero || "(borrador)") + "</a>"; };

    cont.innerHTML =
      '<p class="miga"><a href="#/facturas' + (esEmitida ? "" : "/recibidas") + '">Facturas ' + (esEmitida ? "emitidas" : "recibidas") + "</a> › " + esc(f.numero || (nueva ? "Nueva" : "Borrador")) + "</p>" +
      '<div class="cabecera-pagina"><h1>' + (f.rectifica ? "Factura rectificativa " : esEmitida ? "Factura " : "Factura recibida ") + esc(f.numero || (esEmitida ? "(borrador)" : "")) + "</h1>" +
      (e ? '<span class="estado ' + estadoDe(f, e)[0] + '">' + estadoDe(f, e)[1] + "</span>" : "") + "</div>" + WA.UI.firma(f) +
      (bloqueada && f.estado === "emitida" && !f.rectifica ? '<div class="caja-aviso">Factura emitida: está bloqueada. Para corregirla, «Más…» → «Hacer rectificativa» (verificar con asesoría).</div>' : "") +
      (rectificadaPor.length ? '<div class="caja-aviso">Rectificada por ' + rectificadaPor.map(enlace).join(", ") + ".</div>" : "") +
      '<form id="f-editor" class="formulario" novalidate><fieldset' + dis + ">" +
      (f.rectifica ? '<section class="tarjeta"><h2>Qué rectifica</h2><p>Corrige la factura ' +
        (U.buscar(c.facturas, f.rectifica.id) ? enlace(U.buscar(c.facturas, f.rectifica.id)) : esc(f.rectifica.numero)) + " del " + esc(F.corta(f.rectifica.fecha)) + ".</p>" +
        UI.campo({ nombre: "motivoRectificacion", etiqueta: "Motivo (aparece en la factura)", tipo: "textarea", filas: 2, valor: f.motivoRectificacion, requerido: true, ancho: "completo",
          ayuda: "Qué estaba mal y qué se corrige. Las líneas en negativo anulan lo facturado; deja solo las diferencias, o añade las líneas buenas." }) +
        "</section>" : "") +
      '<section class="tarjeta"><h2>' + (esEmitida ? "Cliente" : "Proveedor") + '</h2><div class="rejilla-12">' +
      UI.campo({ nombre: "terceroNombre", etiqueta: "Nombre o razón social", valor: f.tercero.nombre, requerido: true, clase: "col-7 col-movil-completo", lista: Object.keys(terceros) }) +
      UI.campo({ nombre: "terceroNif", etiqueta: "NIF", valor: f.tercero.nif, clase: "col-5", atributos: 'autocapitalize="characters"' }) +
      UI.campo({ nombre: "terceroDireccion", etiqueta: "Dirección", valor: f.tercero.direccion, clase: "col-7 col-movil-completo" }) +
      UI.campo({ nombre: "terceroEmail", etiqueta: "Correo", tipo: "email", valor: f.tercero.email, clase: "col-5 col-movil-completo" }) +
      "</div></section>" +
      '<section class="tarjeta"><h2>Datos de la factura</h2><div class="rejilla-12">' +
      (esEmitida ? '<p class="col-4 dato-numero"><span class="detalle">Número</span><strong>' + esc(f.numero || "Se pone al emitir") + "</strong></p>"
        : UI.campo({ nombre: "numero", etiqueta: "Número de la factura", valor: f.numero, requerido: true, clase: "col-4" })) +
      UI.campo({ nombre: "fecha", etiqueta: "Fecha", tipo: "date", valor: f.fecha, requerido: true, clase: "col-4" }) +
      UI.campo({ nombre: "vencimiento", etiqueta: "Vencimiento", tipo: "date", valor: f.vencimiento, clase: "col-4" }) +
      UI.campo({ nombre: "categoriaId", etiqueta: "Categoría", tipo: "select", valor: f.categoriaId, opciones: U.opcionesCategorias(c, esEmitida ? "ingreso" : "gasto"), clase: "col-5 col-movil-completo" }) +
      UI.campo({ nombre: "proyectoId", etiqueta: "Proyecto", tipo: "select", valor: f.proyectoId, opciones: U.opcionesProyectos(c), clase: "col-4" }) +
      UI.campo({ nombre: "retencionPct", etiqueta: "Retención IRPF (%)", valor: f.retencionPct ? String(f.retencionPct).replace(".", ",") : "", clase: "col-3", atributos: 'inputmode="decimal"',
        ayuda: esEmitida ? "" : "Si el proveedor es profesional o autónomo." }) +
      (!esEmitida ? '<div class="col-12">' + '<label class="casilla"><input type="checkbox" name="deducible"' + (f.deducible ? " checked" : "") +
        "><span>Su IVA se deduce en la declaración (solo si la asociación presenta IVA y el gasto está relacionado con actividades sujetas; verificar con asesoría)</span></label></div>" : "") +
      "</div></section>" +
      '<section class="tarjeta"><h2>Líneas</h2><div class="tabla-envoltorio"><table class="tabla tabla-lineas"><thead><tr><th scope="col">Concepto</th><th scope="col">Cantidad</th>' +
      '<th scope="col">Precio (€)</th><th scope="col">IVA</th><th scope="col">Tipo</th><th scope="col" class="importe">Base</th>' + (bloqueada ? "" : '<th scope="col"><span class="sr">Quitar</span></th>') +
      '</tr></thead><tbody id="f-lineas">' + f.lineas.map(function (l, i) { return filaLinea(l, i, bloqueada); }).join("") + "</tbody></table></div>" +
      (bloqueada ? "" : '<button type="button" class="btn btn-secundario btn-pequeno" id="f-linea">Añadir línea</button>') +
      '<div id="f-exencion"' + (f.lineas.some(function (l) { return l.tratamiento === "exento"; }) && esEmitida ? "" : " hidden") + ">" +
      UI.campo({ nombre: "motivoExencion", etiqueta: "Motivo de la exención (aparece en la factura)", valor: f.motivoExencion, ancho: "completo",
        ayuda: "Por ejemplo, el artículo de la Ley del IVA que ampara la exención. Verificar con asesoría." }) + "</div>" +
      U.ayuda("Sujeto: lleva IVA (21, 10, 4 o 0 %). Exento: la ley lo exime (p. ej. ciertas actividades educativas o culturales). No sujeto: queda fuera del IVA (cuotas de socios, donaciones). Qué corresponde a cada ingreso: verificar con asesoría.") +
      '<div id="f-totales">' + totalesHtml(f) + "</div></section>" +
      '<section class="tarjeta"><h2>Notas</h2>' + UI.campo({ nombre: "notas", etiqueta: "Notas internas (no salen en la factura)", tipo: "textarea", valor: f.notas, ancho: "completo" }) + "</section>" +
      "</fieldset>" +
      '<div class="acciones barra-guardar">' +
      (bloqueada ? "" : esEmitida && f.estado === "borrador"
        ? '<button type="submit" class="btn btn-secundario" data-accion="guardar">Guardar borrador</button><button type="submit" class="btn btn-primario" data-accion="emitir">Emitir factura</button>'
        : '<button type="submit" class="btn btn-primario" data-accion="guardar">Guardar' + (esEmitida ? " cambios" : "") + "</button>") +
      (f.id && f.estado !== "borrador" && f.estado !== "anulada" && e && e.pendiente > 0 ? '<button type="button" class="btn btn-secundario" id="f-pago">' + (devolver ? "Registrar devolución" : esEmitida ? "Registrar cobro" : "Registrar pago") + "</button>" : "") +
      (f.id && esEmitida && f.estado !== "borrador" ? '<a class="btn btn-secundario" href="#/facturas/imprimir/' + encodeURIComponent(f.id) + '">Imprimir o PDF</a>' : "") +
      (f.id ? '<button type="button" class="btn btn-peligro-suave" id="f-mas">Más…</button>' : "") +
      "</div></form>" +
      (pagos.length ? '<section class="tarjeta"><h2>' + (esEmitida ? "Cobros" : "Pagos") + '</h2><ul class="lista-cifras">' + pagos.map(function (m) {
        return "<li><span>" + esc(F.corta(m.fecha)) + " · " + esc(U.nombreCuenta(c, m.cuentaId)) + "</span><strong>" + esc(D.formatear(m.importe)) + "</strong></li>";
      }).join("") + "</ul></section>" : "");

    var form = cont.querySelector("#f-editor");
    var tbody = cont.querySelector("#f-lineas");
    function recalcular() {
      leerEditor(form, f);
      cont.querySelector("#f-totales").innerHTML = totalesHtml(f);
      tbody.querySelectorAll("[data-linea]").forEach(function (tr) {
        var l = f.lineas[+tr.getAttribute("data-linea")];
        tr.querySelector("[data-base-linea]").textContent = D.formatear(Fac.baseLinea(l));
        var sel = tr.querySelector("select[name^=tipoIva]");
        if (sel) sel.hidden = l.tratamiento !== "sujeto";
      });
      cont.querySelector("#f-exencion").hidden = !(esEmitida && f.lineas.some(function (l) { return l.tratamiento === "exento"; }));
    }
    form.addEventListener("input", recalcular);
    form.addEventListener("change", function (ev) {
      // Al elegir un cliente o proveedor ya conocido, se rellenan sus datos.
      if (ev.target.name === "terceroNombre" && terceros[ev.target.value]) {
        var t = terceros[ev.target.value];
        form.elements.terceroNif.value = t.nif || ""; form.elements.terceroDireccion.value = t.direccion || ""; form.elements.terceroEmail.value = t.email || "";
      }
      // En las emitidas, al cambiar la categoría se propone el IVA habitual de esa categoría para las líneas vacías.
      if (ev.target.name === "categoriaId" && esEmitida) {
        var cat = U.buscar(c.config.categorias, ev.target.value);
        if (cat && cat.iva) tbody.querySelectorAll("[data-linea]").forEach(function (tr) {
          var i = tr.getAttribute("data-linea");
          if (!form.elements["concepto-" + i].value) form.elements["tratamiento-" + i].value = cat.iva;
        });
      }
      recalcular();
    });
    var bLinea = cont.querySelector("#f-linea");
    if (bLinea) bLinea.addEventListener("click", function () {
      leerEditor(form, f);
      var ultima = f.lineas[f.lineas.length - 1] || {};
      f.lineas.push(Object.assign(Fac.lineaVacia(ultima.tratamiento), { tipoIva: ultima.tipoIva || 21 }));
      tbody.innerHTML = f.lineas.map(function (l, i) { return filaLinea(l, i, false); }).join("");
      recalcular();
      form.elements["concepto-" + (f.lineas.length - 1)].focus();
    });
    tbody.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-quitar-linea]");
      if (!b) return;
      leerEditor(form, f);
      f.lineas.splice(+b.getAttribute("data-quitar-linea"), 1);
      if (!f.lineas.length) f.lineas.push(Fac.lineaVacia());
      tbody.innerHTML = f.lineas.map(function (l, i) { return filaLinea(l, i, false); }).join("");
      recalcular();
    });

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var accion = (ev.submitter && ev.submitter.getAttribute("data-accion")) || "guardar";
      leerEditor(form, f);
      f.lineas = f.lineas.filter(function (l) { return l.concepto.trim() || l.precio; });
      if (!f.lineas.length) f.lineas.push(Fac.lineaVacia());
      if (accion === "emitir" || f.tipo === "recibida" || f.estado === "emitida") {
        var problemas = Fac.revisar(f);
        if (problemas.length) {
          await UI.dialogo({ titulo: "Falta algo", contenido: '<ul class="lista">' + problemas.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>",
            botones: [{ texto: "Entendido", valor: "cancelar", estilo: "btn-primario" }] });
          return;
        }
      }
      if (accion === "emitir") {
        var numero = Fac.siguienteNumero(c.facturas, f.fecha.slice(0, 4), Fac.serieDe(f, c.config.facturacion));
        var ok = await UI.confirmar("Se emitirá con el número " + numero + " y fecha " + F.corta(f.fecha) + ". Después no se podrá editar.",
          { titulo: "Emitir factura", aceptar: "Emitir" });
        if (!ok) return;
        f.numero = numero; f.estado = "emitida";
      }
      delete f._desbloqueada;
      var g = await datos.guardar("facturas", f);
      UI.aviso(accion === "emitir" ? (f.rectifica ? "Rectificativa " : "Factura ") + g.numero + " emitida." : "Factura guardada.");
      if (nueva || accion === "emitir") location.hash = "#/facturas/ver/" + encodeURIComponent(g.id); else WA.App.repintar();
    });

    var bPago = cont.querySelector("#f-pago");
    if (bPago) bPago.addEventListener("click", async function () {
      if (await U.editarMovimiento(datos, c, null, { tipo: esEmitida && !devolver ? "ingreso" : "gasto", importe: e.pendiente, facturaId: f.id, categoriaId: f.categoriaId,
        proyectoId: f.proyectoId, concepto: (devolver ? "Devolución factura " : esEmitida ? "Cobro factura " : "Pago factura ") + f.numero + " · " + f.tercero.nombre })) WA.App.repintar();
    });
    var bMas = cont.querySelector("#f-mas");
    if (bMas) bMas.addEventListener("click", async function () {
      var botones = [{ texto: "Cerrar", valor: "cancelar" }];
      if (f.estado === "borrador" || f.tipo === "recibida") botones.unshift({ texto: "Borrar", valor: "borrar", estilo: "btn-peligro-suave" });
      if (esEmitida && f.estado === "emitida") botones.unshift({ texto: "Anular", valor: "anular", estilo: "btn-peligro-suave" }, { texto: "Desbloquear para corregir", valor: "desbloquear" });
      if (esEmitida && f.estado === "emitida") botones.unshift({ texto: "Duplicar como borrador", valor: "duplicar" });
      if (esEmitida && f.estado === "emitida" && !f.rectifica) botones.unshift({ texto: "Hacer rectificativa", valor: "rectificar", estilo: "btn-primario" });
      var r = await UI.dialogo({ titulo: "Factura " + (f.numero || ""), contenido: "<p>¿Qué quieres hacer?</p>", botones: botones });
      if (r.valor === "borrar") {
        if (pagos.length) { UI.aviso("Tiene cobros o pagos enlazados: bórralos antes en Tesorería.", "error"); return; }
        if (!(await UI.confirmar("Se borrará la factura.", { titulo: "Borrar factura", aceptar: "Borrar", peligro: true }))) return;
        await datos.borrar("facturas", f.id);
        location.hash = esEmitida ? "#/facturas" : "#/facturas/recibidas";
      } else if (r.valor === "anular") {
        if (!(await UI.confirmar("La factura quedará anulada: conserva su número (no se reutiliza) y deja de contar para el IVA. Lo habitual es emitir además una factura rectificativa; verificar con asesoría.",
          { titulo: "Anular factura", aceptar: "Anular", peligro: true }))) return;
        f.estado = "anulada";
        await datos.guardar("facturas", f);
        WA.App.repintar();
      } else if (r.valor === "desbloquear") {
        if (!(await UI.confirmar("Cambiar una factura ya emitida (y quizá enviada) puede no ser correcto: lo habitual es una rectificativa. Úsalo solo para corregir un error antes de enviarla.",
          { titulo: "Desbloquear factura", aceptar: "Desbloquear" }))) return;
        f._desbloqueada = true;
        pintarEditor(cont, datos, f, c);
      } else if (r.valor === "rectificar") {
        var m = await UI.dialogo({
          titulo: "Rectificar la factura " + f.numero,
          contenido: "<p>Se crea un borrador de factura rectificativa, con su propia serie, que dice que corrige esta. Nace con las líneas en negativo: anula la factura entera. Puedes dejar solo las diferencias o añadir las líneas buenas antes de emitirla.</p>" +
            '<form class="formulario" novalidate>' + UI.campo({ nombre: "motivo", etiqueta: "Motivo", tipo: "textarea", filas: 2, requerido: true, ancho: "completo",
              ayuda: "Por ejemplo: «Error en el NIF del cliente» o «Se cobró una plaza de más»." }) + "</form>",
          botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Crear la rectificativa", valor: "enviar", estilo: "btn-primario" }],
          validar: function (form) { var ok = !!form.elements.motivo.value.trim(); UI.marcarError(form, "motivo", ok ? "" : "Escribe el motivo."); return ok; },
        });
        if (m.valor !== "enviar") return;
        var rect = await datos.guardar("facturas", Fac.rectificativa(f, m.datos.motivo, F.hoy()));
        location.hash = "#/facturas/ver/" + encodeURIComponent(rect.id);
      } else if (r.valor === "duplicar") {
        var copia = JSON.parse(JSON.stringify(f));
        delete copia.id; delete copia.creado; delete copia.modificado; delete copia.rectifica; delete copia.motivoRectificacion;
        Object.assign(copia, { estado: "borrador", numero: "", fecha: F.hoy() });
        var g = await datos.guardar("facturas", copia);
        location.hash = "#/facturas/ver/" + encodeURIComponent(g.id);
      }
    });
  }

  // ── Versión para imprimir ───────────────────────────────────────────────
  async function pintarImprimir(cont, datos, id) {
    var c = await U.cargar(datos);
    var f = U.buscar(c.facturas, id);
    if (!f) { cont.innerHTML = "<h1>No encontrada</h1>"; return; }
    var a = c.asociacion, t = Fac.totales(f), dom = WA.Direccion.formatear(a.domicilio);
    cont.innerHTML =
      '<div class="acciones no-imprimir"><button type="button" class="btn btn-primario lectura-ok" id="i-imprimir">Imprimir o guardar en PDF</button>' +
      '<a class="btn btn-secundario" href="#/facturas/ver/' + encodeURIComponent(f.id) + '">Volver</a></div>' +
      '<article class="factura-impresa">' +
      '<header class="fi-cabecera"><div><h1>' + esc(a.nombre || "Asociación") + "</h1><p>NIF " + esc(a.nif) + "<br>" + esc(dom.linea1) + "<br>" + esc(dom.linea2) +
      (a.email ? "<br>" + esc(a.email) : "") + (a.telefono ? " · " + esc(a.telefono) : "") + "</p></div>" +
      '<div class="fi-datos"><h2>' + (f.estado === "anulada" ? "FACTURA ANULADA" : f.rectifica ? "FACTURA RECTIFICATIVA" : "FACTURA") + "</h2><p>Número <strong>" + esc(f.numero) + "</strong><br>Fecha " + esc(F.corta(f.fecha)) +
      (f.vencimiento ? "<br>Vencimiento " + esc(F.corta(f.vencimiento)) : "") + "</p></div></header>" +
      (f.rectifica ? '<p class="fi-nota fi-rectifica"><strong>Rectifica la factura ' + esc(f.rectifica.numero) + " del " + esc(F.corta(f.rectifica.fecha)) + ".</strong> Motivo: " +
        esc(f.motivoRectificacion) + "</p>" : "") +
      '<section class="fi-cliente"><h3>Cliente</h3><p><strong>' + esc(f.tercero.nombre) + "</strong>" + (f.tercero.nif ? "<br>NIF " + esc(f.tercero.nif) : "") +
      (f.tercero.direccion ? "<br>" + esc(f.tercero.direccion) : "") + "</p></section>" +
      '<div class="tabla-envoltorio"><table class="tabla fi-lineas"><thead><tr><th scope="col">Concepto</th><th scope="col" class="importe">Cantidad</th><th scope="col" class="importe">Precio</th><th scope="col">IVA</th><th scope="col" class="importe">Importe</th></tr></thead><tbody>' +
      f.lineas.map(function (l) {
        return "<tr><td>" + esc(l.concepto) + '</td><td class="importe">' + esc(String(l.cantidad).replace(".", ",")) + '</td><td class="importe">' + esc(D.formatear(l.precio)) + "</td><td>" +
          (l.tratamiento === "sujeto" ? l.tipoIva + " %" : esc(TRAT[l.tratamiento])) + '</td><td class="importe">' + esc(D.formatear(Fac.baseLinea(l))) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<div class="fi-totales">' + totalesHtml(f) + "</div>" +
      (t.baseExenta && f.motivoExencion ? '<p class="fi-nota">' + esc(f.motivoExencion) + "</p>" : "") +
      (t.baseNoSujeta ? '<p class="fi-nota">Operación no sujeta a IVA.</p>' : "") +
      (c.config.facturacion.condicionesPago ? '<p class="fi-nota"><strong>Forma de pago:</strong> ' + esc(c.config.facturacion.condicionesPago) + "</p>" : "") +
      (c.config.facturacion.pie ? '<footer class="fi-pie">' + esc(c.config.facturacion.pie) + "</footer>" : "") +
      "</article>" +
      '<p class="detalle no-imprimir">Revisa que la factura incluye todas las menciones obligatorias para vuestro caso (verificar con asesoría).</p>';
    cont.querySelector("#i-imprimir").addEventListener("click", function () { window.print(); });
  }

  async function pintar(cont, datos, ruta) {
    if (ruta[0] === "recibidas") return pintarLista(cont, datos, "recibida");
    if (ruta[0] === "imprimir") return pintarImprimir(cont, datos, ruta[1]);
    if (ruta[0] === "nueva" || ruta[0] === "ver") {
      var c = await U.cargar(datos);
      var f = ruta[0] === "nueva" ? facturaNueva(ruta[1] === "recibida" ? "recibida" : "emitida", c) : U.buscar(c.facturas, ruta[1]);
      if (!f) { cont.innerHTML = '<h1>Factura no encontrada</h1><p><a href="#/facturas">Volver</a></p>'; return; }
      return pintarEditor(cont, datos, f, c);
    }
    return pintarLista(cont, datos, "emitida");
  }

  WA.App.registrar({
    id: "facturas", titulo: "Facturas", orden: 32, pintar: pintar,
    icono: '<path d="M6 2.5h9l4 4V21.5H6z"/><path d="M15 2.5v4h4"/><path d="M9 11h7M9 14.5h7M9 18h4"/>',
  });
})(typeof self !== "undefined" ? self : this);

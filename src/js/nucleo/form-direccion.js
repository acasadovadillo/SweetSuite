/*
 * webkit_asociaciones — Formulario de dirección postal por partes (componente de interfaz).
 *
 * Lo usan el domicilio social de la asociación y la ficha de cada socio, para que
 * las direcciones se escriban siempre igual. La lógica está en nucleo/direccion.js.
 *
 *   campos(d, opciones)   HTML de los campos (dentro de un <form>)
 *                         opciones.leyenda: texto del <legend>; opciones.previa: false para no
 *                         enseñar «Así se escribirá»
 *   leer(datos)           objeto del formulario (UI.leerFormulario) → dirección
 *   conectar(form)        provincia automática al escribir el código postal y vista previa
 *   revisar(form, datos)  marca los avisos (CP mal escrito, CP de otra provincia); devuelve cuántos hay
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, Dir = WA.Direccion, V = WA.Validar;

  function campos(d, opciones) {
    var o = opciones || {};
    d = Object.assign(Dir.vacia(), d || {});
    var tipos = [["", "—"]].concat(Dir.TIPOS_VIA.map(function (t) { return [t, t]; }), [["Otro", "Otro (escríbelo en el nombre)"]]);
    // Si la provincia guardada no está en la lista (dato antiguo), se ofrece igualmente para no perderla.
    var provincias = [["", "—"]].concat((d.provincia && Dir.PROVINCIAS.indexOf(d.provincia) < 0 ? [d.provincia] : []).concat(Dir.PROVINCIAS)
      .map(function (p) { return [p, p]; }));
    return '<fieldset class="form-direccion"><legend>' + UI.esc(o.leyenda || "Dirección") + '</legend><div class="rejilla-12">' +
      UI.campo({ nombre: "tipoVia", etiqueta: "Tipo de vía", tipo: "select", valor: d.tipoVia, opciones: tipos, clase: "col-3" }) +
      UI.campo({ nombre: "nombreVia", etiqueta: "Nombre de la vía", valor: d.nombreVia, clase: "col-7 col-movil-completo", atributos: 'autocomplete="address-line1"' }) +
      UI.campo({ nombre: "numero", etiqueta: "Número", valor: d.numero, clase: "col-2", ayuda: "o s/n" }) +
      UI.campo({ nombre: "km", etiqueta: "Km", valor: d.km, clase: "col-2", ayuda: "En carreteras" }) +
      UI.campo({ nombre: "bloque", etiqueta: "Bloque", valor: d.bloque, clase: "col-2" }) +
      UI.campo({ nombre: "portal", etiqueta: "Portal", valor: d.portal, clase: "col-2" }) +
      UI.campo({ nombre: "escalera", etiqueta: "Escalera", valor: d.escalera, clase: "col-2" }) +
      UI.campo({ nombre: "planta", etiqueta: "Planta o piso", valor: d.planta, clase: "col-2", lista: Dir.PLANTAS, ayuda: "1, 2… Bajo, Ático" }) +
      UI.campo({ nombre: "puerta", etiqueta: "Puerta", valor: d.puerta, clase: "col-2", ayuda: "A, B, Izda…" }) +
      UI.campo({ nombre: "complemento", etiqueta: "Otros datos de la dirección", valor: d.complemento, clase: "col-12",
        ayuda: "Lo que no encaje arriba: local, urbanización, «a/a de…»." }) +
      UI.campo({ nombre: "codigoPostal", etiqueta: "Código postal", valor: d.codigoPostal, clase: "col-3",
        atributos: 'inputmode="numeric" autocomplete="postal-code" maxlength="5"' }) +
      UI.campo({ nombre: "municipio", etiqueta: "Municipio", valor: d.municipio, clase: "col-5", atributos: 'autocomplete="address-level2"' }) +
      UI.campo({ nombre: "provincia", etiqueta: "Provincia", tipo: "select", valor: d.provincia, opciones: provincias, clase: "col-4 col-movil-completo",
        ayuda: "Se rellena sola con el código postal." }) +
      (o.previa === false ? "" : '<p class="vista-previa" aria-live="polite"><strong>Así se escribirá en los documentos</strong><span data-previa-direccion></span></p>') +
      "</div></fieldset>";
  }

  function leer(datos) {
    var d = Dir.vacia();
    Dir.CAMPOS.forEach(function (c) { d[c] = String(datos[c] || "").trim(); });
    if (/^s\/?n$/i.test(d.numero)) d.numero = "s/n";
    if (d.puerta.length <= 2) d.puerta = d.puerta.toUpperCase();
    return d;
  }

  function conectar(form) {
    var provinciaAuto = Dir.provinciaDeCP(form.elements.codigoPostal && form.elements.codigoPostal.value);
    function actualizar(e) {
      if (!form.elements.codigoPostal) return;
      if (e && e.target && e.target.name === "codigoPostal") {
        var p = Dir.provinciaDeCP(form.elements.codigoPostal.value);
        // Solo se cambia si estaba vacía o la había puesto el propio código postal.
        if (p && (!form.elements.provincia.value || form.elements.provincia.value === provinciaAuto)) form.elements.provincia.value = p;
        provinciaAuto = p;
      }
      var previa = form.querySelector("[data-previa-direccion]");
      if (previa) previa.textContent = Dir.formatear(leer(UI.leerFormulario(form))).completa || "—";
    }
    form.addEventListener("input", actualizar);
    form.addEventListener("change", actualizar);
    actualizar();
  }

  function revisar(form, datos) {
    var avisos = 0;
    var cpMal = datos.codigoPostal && !V.codigoPostal(datos.codigoPostal).valido ? V.codigoPostal(datos.codigoPostal).mensaje : "";
    UI.marcarError(form, "codigoPostal", cpMal);
    // El código postal empieza por el número de la provincia: si no casan, uno de los dos está mal.
    var provCP = Dir.provinciaDeCP(datos.codigoPostal);
    var noCasan = provCP && datos.provincia && provCP !== datos.provincia ? "El código postal " + datos.codigoPostal + " es de " + provCP + "." : "";
    UI.marcarError(form, "provincia", noCasan);
    if (cpMal) avisos++;
    if (noCasan) avisos++;
    return avisos;
  }

  WA.FormDireccion = { campos: campos, leer: leer, conectar: conectar, revisar: revisar };
})(typeof self !== "undefined" ? self : this);

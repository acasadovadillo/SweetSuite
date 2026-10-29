/*
 * webkit_asociaciones — Módulo «Asociación»: datos de la entidad y junta directiva.
 *
 * Los datos de la asociación (nombre, NIF, domicilio…) se usan después en
 * convocatorias, actas, recibos y la memoria anual, así que conviene rellenarlos
 * primero.
 *
 * La junta guarda también a quienes ya salieron (con fecha «hasta»): sirve de
 * histórico de cargos, que a menudo se pide al tramitar cambios en el registro.
 * Qué cargos debe haber y cómo se renuevan lo dicen los ESTATUTOS de cada
 * asociación (verificar con asesoría); aquí solo se anotan.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, V = WA.Validar;

  // ── Datos de la asociación ───────────────────────────────────────────────
  function formularioAsociacion(a) {
    var d = a.domicilio || {};
    return '<form id="f-asociacion" class="formulario" novalidate>' +
      '<fieldset><legend>Identificación</legend><div class="rejilla">' +
      UI.campo({ nombre: "nombre", etiqueta: "Nombre completo", valor: a.nombre, requerido: true, ancho: "completo", ayuda: "Tal y como figura en los estatutos." }) +
      UI.campo({ nombre: "siglas", etiqueta: "Siglas o nombre corto", valor: a.siglas }) +
      UI.campo({ nombre: "nif", etiqueta: "NIF de la asociación", valor: a.nif, ayuda: "Antes llamado CIF. Suele empezar por G.", atributos: 'autocapitalize="characters"' }) +
      UI.campo({ nombre: "registro", etiqueta: "Registro donde está inscrita", valor: a.registro, ayuda: "Nacional o de tu comunidad autónoma." }) +
      UI.campo({ nombre: "numeroRegistro", etiqueta: "Número de inscripción", valor: a.numeroRegistro }) +
      UI.campo({ nombre: "fechaConstitucion", etiqueta: "Fecha de constitución", tipo: "date", valor: a.fechaConstitucion }) +
      "</div></fieldset>" +
      WA.FormDireccion.campos(d, { leyenda: "Domicilio social" }) +
      '<fieldset><legend>Contacto y banco</legend><div class="rejilla">' +
      UI.campo({ nombre: "email", etiqueta: "Correo", tipo: "email", valor: a.email, atributos: 'autocomplete="email"' }) +
      UI.campo({ nombre: "telefono", etiqueta: "Teléfono", tipo: "tel", valor: a.telefono }) +
      UI.campo({ nombre: "web", etiqueta: "Web", tipo: "url", valor: a.web, ayuda: "Con https://" }) +
      UI.campo({ nombre: "iban", etiqueta: "IBAN de la cuenta", valor: a.iban, ayuda: "Se usará para las remesas de cuotas.", atributos: 'autocapitalize="characters"' }) +
      "</div></fieldset>" +
      '<div class="acciones"><button type="submit" class="btn btn-primario">Guardar datos</button></div></form>';
  }

  /** Devuelve los avisos de formato (no impiden guardar). */
  function revisar(form, datos) {
    var avisos = 0;
    function comprobar(nombre, resultado) {
      var m = datos[nombre] && !resultado.valido ? resultado.mensaje : "";
      UI.marcarError(form, nombre, m);
      if (m) avisos++;
    }
    UI.marcarError(form, "nombre", datos.nombre ? "" : "El nombre es obligatorio.");
    if (datos.nif) comprobar("nif", V.nifEntidad(datos.nif)); else UI.marcarError(form, "nif", "");
    if (datos.iban) comprobar("iban", V.iban(datos.iban)); else UI.marcarError(form, "iban", "");
    if (datos.email) comprobar("email", V.email(datos.email)); else UI.marcarError(form, "email", "");
    avisos += WA.FormDireccion.revisar(form, datos);
    return avisos;
  }

  // ── Junta directiva ─────────────────────────────────────────────────────
  var nombreCargo = function (m) { return m.cargo === "Otro" && m.cargoOtro ? m.cargoOtro : m.cargo; };
  var vigente = function (m) { return !m.hasta || m.hasta >= F.hoy(); };

  function tablaJunta(junta) {
    var orden = WA.Esquema.CARGOS;
    var actuales = junta.filter(vigente).sort(function (a, b) { return orden.indexOf(a.cargo) - orden.indexOf(b.cargo); });
    var anteriores = junta.filter(function (m) { return !vigente(m); }).sort(function (a, b) { return (b.hasta || "").localeCompare(a.hasta || ""); });
    function filas(lista) {
      return lista.map(function (m) {
        return "<tr><th scope=\"row\">" + esc(nombreCargo(m)) + "</th><td>" + esc(m.nombre) + "</td>" +
          '<td class="solo-ancho">' + (m.email ? '<a href="mailto:' + esc(m.email) + '">' + esc(m.email) + "</a>" : "") +
          (m.telefono ? "<br><span class=\"detalle\">" + esc(m.telefono) + "</span>" : "") + "</td>" +
          "<td>" + esc(F.corta(m.desde)) + (m.hasta ? " – " + esc(F.corta(m.hasta)) : "") + "</td>" +
          '<td class="celda-acciones"><button type="button" class="btn btn-pequeno btn-secundario" data-editar="' + esc(m.id) + '" aria-label="Editar a ' + esc(m.nombre) + '">Editar</button></td></tr>';
      }).join("");
    }
    var cabecera = '<thead><tr><th scope="col">Cargo</th><th scope="col">Nombre</th><th scope="col" class="solo-ancho">Contacto</th><th scope="col">En el cargo</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead>';
    return (actuales.length
      ? '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Junta directiva actual</caption>' + cabecera + "<tbody>" + filas(actuales) + "</tbody></table></div>"
      : '<p class="vacio">Todavía no has añadido a nadie de la junta.</p>') +
      (anteriores.length
        ? '<details class="historico"><summary>Cargos anteriores (' + anteriores.length + ')</summary><div class="tabla-envoltorio"><table class="tabla">' +
          '<caption class="sr">Cargos anteriores</caption>' + cabecera + "<tbody>" + filas(anteriores) + "</tbody></table></div></details>"
        : "");
  }

  async function editarMiembro(datos, miembro) {
    var m = miembro || { cargo: "Presidencia", cargoOtro: "", nombre: "", email: "", telefono: "", desde: F.hoy(), hasta: "" };
    var r = await UI.dialogo({
      titulo: miembro ? "Editar cargo" : "Añadir a la junta",
      contenido: '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "cargo", etiqueta: "Cargo", tipo: "select", valor: m.cargo, opciones: WA.Esquema.CARGOS }) +
        UI.campo({ nombre: "cargoOtro", etiqueta: "Nombre del cargo", valor: m.cargoOtro, ayuda: "Solo si has elegido «Otro»." }) +
        UI.campo({ nombre: "nombre", etiqueta: "Nombre y apellidos", valor: m.nombre, requerido: true, ancho: "completo" }) +
        UI.campo({ nombre: "email", etiqueta: "Correo", tipo: "email", valor: m.email }) +
        UI.campo({ nombre: "telefono", etiqueta: "Teléfono", tipo: "tel", valor: m.telefono }) +
        UI.campo({ nombre: "desde", etiqueta: "En el cargo desde", tipo: "date", valor: m.desde, requerido: true }) +
        UI.campo({ nombre: "hasta", etiqueta: "Hasta", tipo: "date", valor: m.hasta, ayuda: "Déjalo vacío si sigue en el cargo." }) +
        "</div></form>",
      botones: (miembro ? [{ texto: "Eliminar", valor: "eliminar", estilo: "btn-peligro-suave" }] : [])
        .concat([{ texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }]),
      validar: function (form) {
        var d = UI.leerFormulario(form), bien = true;
        UI.marcarError(form, "nombre", d.nombre ? "" : "Escribe el nombre."); if (!d.nombre) bien = false;
        UI.marcarError(form, "desde", F.esValida(d.desde) ? "" : "Pon la fecha de inicio."); if (!F.esValida(d.desde)) bien = false;
        var hastaMal = d.hasta && d.hasta < d.desde;
        UI.marcarError(form, "hasta", hastaMal ? "No puede ser anterior a «desde»." : ""); if (hastaMal) bien = false;
        var otroMal = d.cargo === "Otro" && !d.cargoOtro;
        UI.marcarError(form, "cargoOtro", otroMal ? "Escribe el nombre del cargo." : ""); if (otroMal) bien = false;
        if (d.email && !V.email(d.email).valido) { UI.marcarError(form, "email", V.email(d.email).mensaje); bien = false; }
        return bien;
      },
    });
    if (r.valor === "eliminar") {
      var ok = await UI.confirmar("Se eliminará a " + m.nombre + " (" + nombreCargo(m) + ") de la junta. Si ha dejado el cargo, es mejor poner la fecha «hasta» y así queda en el histórico.",
        { titulo: "Eliminar de la junta", aceptar: "Eliminar", peligro: true });
      if (ok) { await datos.borrar("junta", m.id); UI.aviso("Eliminado de la junta."); }
      return ok;
    }
    if (r.valor !== "enviar") return false;
    var d = r.datos;
    await datos.guardar("junta", Object.assign({}, miembro || {}, {
      cargo: d.cargo, cargoOtro: d.cargo === "Otro" ? d.cargoOtro : "", nombre: d.nombre,
      email: d.email, telefono: d.telefono, desde: d.desde, hasta: d.hasta,
    }));
    UI.aviso(miembro ? "Cambios guardados." : "Añadido a la junta.");
    return true;
  }

  async function pintar(cont, datos) {
    var a = await datos.leer("asociacion");
    var junta = await datos.listar("junta");
    cont.innerHTML =
      "<h1>Asociación</h1>" +
      '<p class="intro">Los datos básicos de la entidad. Se usarán en convocatorias, actas y recibos.</p>' +
      '<section class="tarjeta" aria-labelledby="t-datos"><h2 id="t-datos">Datos de la asociación</h2>' + formularioAsociacion(a) + "</section>" +
      '<section class="tarjeta" aria-labelledby="t-junta"><div class="tarjeta-cabecera"><h2 id="t-junta">Junta directiva</h2>' +
      '<button type="button" class="btn btn-secundario" id="j-anadir">Añadir cargo</button></div>' +
      '<p class="detalle">Los cargos y su duración los fijan vuestros estatutos.</p>' +
      '<div id="j-tabla">' + tablaJunta(junta) + "</div></section>";

    var form = cont.querySelector("#f-asociacion");

    WA.FormDireccion.conectar(form);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var d = UI.leerFormulario(form);
      var avisos = revisar(form, d);
      if (!d.nombre) { form.elements.nombre.focus(); return; }
      await datos.escribir("asociacion", Object.assign(a, {
        nombre: d.nombre, siglas: d.siglas, nif: V.normalizar(d.nif), registro: d.registro,
        numeroRegistro: d.numeroRegistro, fechaConstitucion: d.fechaConstitucion,
        domicilio: WA.FormDireccion.leer(d),
        email: d.email, telefono: d.telefono, web: d.web, iban: V.normalizar(d.iban),
      }));
      UI.aviso(avisos ? "Guardado. Revisa los campos marcados: puede haber algún error al copiarlos." : "Datos guardados.", avisos ? "info" : "ok");
    });

    async function trasEditar(cambio) {
      if (!cambio) return;
      cont.querySelector("#j-tabla").innerHTML = tablaJunta(await datos.listar("junta"));
    }
    cont.querySelector("#j-anadir").addEventListener("click", function () { editarMiembro(datos).then(trasEditar); });
    cont.querySelector("#j-tabla").addEventListener("click", async function (e) {
      var b = e.target.closest("[data-editar]");
      if (!b) return;
      var m = await datos.obtener("junta", b.getAttribute("data-editar"));
      if (m) trasEditar(await editarMiembro(datos, m));
    });
  }

  WA.App.registrar({
    id: "asociacion", titulo: "Asociación", orden: 10, pintar: pintar,
    icono: '<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/>',
  });
})(typeof self !== "undefined" ? self : this);

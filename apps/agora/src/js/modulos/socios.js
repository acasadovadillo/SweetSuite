/*
 * Agora — Módulo «Socios»: libro de registro de socios.
 *
 *   #/socios                listado con búsqueda y filtros
 *   #/socios/nuevo          ficha vacía para dar de alta
 *   #/socios/ficha/<id>     ficha de un socio (datos, baja, cuotas)
 *   #/socios/libro          libro de registro para imprimir o guardar en PDF
 *
 * La lógica (estado, edad, filtros, validación, importación) está en
 * logica/socios.js, con tests. Aquí solo hay pantalla.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas, S = WA.Socios, C = WA.Cuotas, D = WA.Dinero;

  // El filtro se recuerda mientras dura la sesión (al volver de una ficha sigue igual).
  var filtro = { texto: "", estado: "activo", tipoSocioId: "", orden: "numero" };

  var ESTADO_TEXTO = { activo: "Activo", baja: "Baja", futuro: "Alta futura" };

  async function cargar(datos) {
    var r = await Promise.all([datos.listar("socios"), datos.listar("cuotas"), datos.leer("config"), datos.leer("asociacion")]);
    return { socios: r[0].map(S.completar), cuotas: r[1], config: r[2], asociacion: r[3] };
  }
  var nombreTipo = function (config, id) {
    var t = (config.tiposSocio || []).filter(function (x) { return x.id === id; })[0];
    return t ? t.nombre : "—";
  };

  // ── Listado ──────────────────────────────────────────────────────────────
  function filasListado(c) {
    var deuda = {};
    C.deudores(c.cuotas).forEach(function (d) { deuda[d.socioId] = d.total; });
    var lista = S.filtrar(c.socios, filtro);
    if (!lista.length) return { html: '<tr><td colspan="6" class="vacio">Ningún socio coincide con la búsqueda.</td></tr>', n: 0 };
    return {
      n: lista.length,
      html: lista.map(function (s) {
        var e = S.estado(s);
        var cuota = deuda[s.id] ? '<span class="estado estado-aviso">Debe ' + esc(D.formatear(deuda[s.id])) + "</span>"
          : '<span class="estado estado-ok">Al corriente</span>';
        return "<tr>" +
          '<td class="num">' + esc(s.numero) + "</td>" +
          '<th scope="row"><a href="#/socios/ficha/' + encodeURIComponent(s.id) + '">' + esc(S.nombreListado(s) || "(sin nombre)") + "</a>" +
          (S.esMenor(s) ? ' <span class="etiqueta">Menor</span>' : "") + "</th>" +
          "<td>" + esc(nombreTipo(c.config, s.tipoSocioId)) + "</td>" +
          "<td>" + (e === "activo" ? esc(F.corta(s.fechaAlta)) : '<span class="estado estado-neutro">' + esc(ESTADO_TEXTO[e]) + "</span>") + "</td>" +
          "<td>" + cuota + "</td>" +
          '<td class="solo-ancho">' + (s.email ? '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + "</a>" : "") +
          (s.telefono ? '<br><span class="detalle">' + esc(s.telefono) + "</span>" : "") + "</td></tr>";
      }).join(""),
    };
  }

  async function pintarListado(cont, datos) {
    var c = await cargar(datos);
    var activos = c.socios.filter(function (s) { return S.estado(s) === "activo"; }).length;
    var tipos = [["", "Todos los tipos"]].concat((c.config.tiposSocio || []).map(function (t) { return [t.id, t.nombre]; }));
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Socios</h1><a class="btn btn-primario" href="#/socios/nuevo">Nuevo socio</a></div>' +
      '<p class="intro">' + activos + (activos === 1 ? " socio activo" : " socios activos") + " · " + c.socios.length + " en el registro (con las bajas).</p>" +
      '<div class="barra-filtros" role="search">' +
      '<label class="filtro-texto"><span class="sr">Buscar</span><input type="search" id="s-buscar" placeholder="Buscar por nombre, documento, correo, teléfono…" value="' + esc(filtro.texto) + '"></label>' +
      '<label><span class="sr">Estado</span><select id="s-estado">' +
      [["activo", "Activos"], ["baja", "Bajas"], ["todos", "Todos"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (filtro.estado === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></label>" +
      '<label><span class="sr">Tipo de socio</span><select id="s-tipo">' + tipos.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (filtro.tipoSocioId === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>";
      }).join("") + "</select></label>" +
      '<label><span class="sr">Orden</span><select id="s-orden"><option value="numero"' + (filtro.orden === "numero" ? " selected" : "") + '>Por número</option>' +
      '<option value="nombre"' + (filtro.orden === "nombre" ? " selected" : "") + ">Por apellidos</option></select></label>" +
      "</div>" +
      '<p class="detalle" id="s-cuenta" aria-live="polite"></p>' +
      '<div class="tabla-envoltorio"><table class="tabla"><caption class="sr">Socios</caption><thead><tr>' +
      '<th scope="col" class="num">Nº</th><th scope="col">Nombre</th><th scope="col">Tipo</th><th scope="col">Alta</th><th scope="col">Cuotas</th><th scope="col" class="solo-ancho">Contacto</th>' +
      '</tr></thead><tbody id="s-filas"></tbody></table></div>' +
      '<div class="acciones">' +
      '<button type="button" class="btn btn-secundario" id="s-importar">Importar desde CSV…</button>' +
      '<button type="button" class="btn btn-secundario lectura-ok" id="s-exportar">Exportar lista (CSV)</button>' +
      '<a class="btn btn-secundario" href="#/socios/libro">Libro de registro</a>' +
      '<a class="btn btn-secundario" href="#/cuotas/tipos">Tipos de socio y cuotas</a>' +
      "</div>";

    function refrescar() {
      var r = filasListado(c);
      cont.querySelector("#s-filas").innerHTML = r.html;
      cont.querySelector("#s-cuenta").textContent = r.n === 1 ? "1 socio en la lista." : r.n + " socios en la lista.";
    }
    cont.querySelector("#s-buscar").addEventListener("input", function (e) { filtro.texto = e.target.value; refrescar(); });
    cont.querySelector("#s-estado").addEventListener("change", function (e) { filtro.estado = e.target.value; refrescar(); });
    cont.querySelector("#s-tipo").addEventListener("change", function (e) { filtro.tipoSocioId = e.target.value; refrescar(); });
    cont.querySelector("#s-orden").addEventListener("change", function (e) { filtro.orden = e.target.value; refrescar(); });
    cont.querySelector("#s-importar").addEventListener("click", function () { importar(datos, c); });
    cont.querySelector("#s-exportar").addEventListener("click", function () { exportar(c); });
    refrescar();
  }

  // ── Exportar e importar ─────────────────────────────────────────────────
  async function exportar(c) {
    var lista = S.filtrar(c.socios, filtro);
    var ok = await UI.confirmar("El archivo tendrá " + lista.length + " socios con sus datos personales SIN CIFRAR. " +
      "Guárdalo en un lugar seguro y bórralo cuando ya no lo necesites.", { titulo: "Exportar socios", aceptar: "Exportar" });
    if (!ok) return;
    var filas = lista.map(function (s) { return Object.assign({}, s, { _tipoNombre: nombreTipo(c.config, s.tipoSocioId) }); });
    UI.descargar("socios-" + F.hoy() + ".csv", WA.CSV.escribir(S.COLUMNAS_CSV, filas), "text/csv;charset=utf-8");
  }

  async function importar(datos, c) {
    var archivo = await UI.elegirArchivo(".csv,text/csv,text/plain");
    if (!archivo) return;
    var lectura = WA.CSV.leer(archivo.texto);
    var r = S.desdeCSV(lectura, c.config.tiposSocio);
    var reconocidas = Object.keys(r.columnas);
    if (!r.socios.length) {
      UI.aviso("No se ha encontrado ningún socio en el archivo. Revisa que la primera fila tenga los títulos de las columnas (Nombre, Apellidos…).", "error");
      return;
    }
    // ¿Ya existen? (mismo documento o correo)
    var V = WA.Validar;
    var docs = {}, mails = {};
    c.socios.forEach(function (s) {
      if (s.documento) docs[V.normalizar(s.documento)] = true;
      if (s.email) mails[s.email.trim().toLowerCase()] = true;
    });
    var repetido = function (s) { return (s.documento && docs[V.normalizar(s.documento)]) || (s.email && mails[s.email.trim().toLowerCase()]); };
    var nRepetidos = r.socios.filter(repetido).length;

    var res = await UI.dialogo({
      titulo: "Importar socios",
      contenido: "<p>Se han encontrado <strong>" + r.socios.length + " socios</strong> en «" + esc(archivo.nombre) + "».</p>" +
        '<p class="detalle">Columnas reconocidas: ' + esc(reconocidas.join(", ")) + ". Las demás se ignoran.</p>" +
        (r.problemas.length ? '<details class="historico"><summary>' + r.problemas.length + " avisos</summary><ul class=\"lista\">" +
          r.problemas.slice(0, 50).map(function (p) { return "<li>Fila " + p.fila + ": " + esc(p.mensaje) + "</li>"; }).join("") +
          (r.problemas.length > 50 ? "<li>…</li>" : "") + "</ul></details>" : "") +
        "<form>" +
        (nRepetidos ? '<label class="casilla"><input type="checkbox" name="saltar" checked><span>Saltar los ' + nRepetidos +
          " que ya están (mismo documento o correo)</span></label>" : "") +
        '<label class="casilla"><input type="checkbox" name="numeros" checked><span>Respetar el número de socio del archivo cuando no choque con uno existente</span></label>' +
        "</form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Importar", valor: "enviar", estilo: "btn-primario" }],
    });
    if (res.valor !== "enviar") return;
    var lista = res.datos.saltar ? r.socios.filter(function (s) { return !repetido(s); }) : r.socios;
    var usados = {};
    c.socios.forEach(function (s) { usados[s.numero] = true; });
    var contador = S.siguienteNumero(c.socios, c.config.siguienteNumeroSocio);
    // Primero los que traen número propio (si está libre), luego el resto a continuación.
    lista.forEach(function (s) {
      if (res.datos.numeros && s.numero && !usados[s.numero]) usados[s.numero] = true;
      else s.numero = null;
    });
    var maxPropio = Math.max.apply(null, [contador - 1].concat(lista.map(function (s) { return s.numero || 0; })));
    contador = maxPropio + 1;
    lista.forEach(function (s) { if (!s.numero) s.numero = contador++; });
    await datos.guardarVarios("socios", lista);
    c.config.siguienteNumeroSocio = contador;
    await datos.escribir("config", c.config);
    UI.aviso(lista.length + " socios importados.");
    WA.App.repintar();
  }

  // ── Ficha ───────────────────────────────────────────────────────────────
  function formularioFicha(s, c) {
    var tipos = (c.config.tiposSocio || []).filter(function (t) { return t.activo !== false || t.id === s.tipoSocioId; })
      .map(function (t) { return [t.id, t.nombre + (t.cuota > 0 ? " · " + D.formatear(t.cuota) + " " + periodicidadTexto(t.periodicidad) : " · sin cuota")]; });
    var tutor = s.tutor || {}, cons = s.consentimientos || {};
    var casilla = function (nombre, valor, texto) {
      return '<label class="casilla"><input type="checkbox" name="' + nombre + '"' + (valor ? " checked" : "") + "><span>" + texto + "</span></label>";
    };
    return '<form id="f-socio" class="formulario" novalidate>' +
      '<section class="tarjeta"><h2>Datos personales</h2><div class="rejilla-12">' +
      UI.campo({ nombre: "nombre", etiqueta: "Nombre", valor: s.nombre, requerido: true, clase: "col-4 col-movil-completo", atributos: 'autocomplete="off"' }) +
      UI.campo({ nombre: "apellidos", etiqueta: "Apellidos", valor: s.apellidos, clase: "col-5 col-movil-completo", atributos: 'autocomplete="off"' }) +
      UI.campo({ nombre: "sexo", etiqueta: "Sexo", tipo: "select", valor: s.sexo, opciones: [["", "—"]].concat(S.SEXOS.map(function (x) { return [x, x]; })), clase: "col-3",
        ayuda: "Algunas subvenciones piden datos por sexo." }) +
      UI.campo({ nombre: "tipoDocumento", etiqueta: "Documento", tipo: "select", valor: s.tipoDocumento, opciones: S.TIPOS_DOCUMENTO, clase: "col-3" }) +
      UI.campo({ nombre: "documento", etiqueta: "Número de documento", valor: s.documento, clase: "col-4", atributos: 'autocapitalize="characters" autocomplete="off"' }) +
      UI.campo({ nombre: "fechaNacimiento", etiqueta: "Fecha de nacimiento", tipo: "date", valor: s.fechaNacimiento, clase: "col-3" }) +
      '<p class="col-2 dato-edad" id="f-edad" aria-live="polite"></p>' +
      UI.campo({ nombre: "ocupacion", etiqueta: "Ocupación o estudios", valor: s.ocupacion, clase: "col-12" }) +
      "</div></section>" +

      '<section class="tarjeta"><h2>Contacto</h2><div class="rejilla-12">' +
      UI.campo({ nombre: "email", etiqueta: "Correo", tipo: "email", valor: s.email, clase: "col-5 col-movil-completo", atributos: 'autocomplete="off"' }) +
      UI.campo({ nombre: "telefono", etiqueta: "Teléfono", tipo: "tel", valor: s.telefono, clase: "col-4" }) +
      UI.campo({ nombre: "telefono2", etiqueta: "Otro teléfono", tipo: "tel", valor: s.telefono2, clase: "col-3" }) +
      "</div>" + WA.FormDireccion.campos(s.direccion, { leyenda: "Dirección postal", previa: false }) + "</section>" +

      '<section class="tarjeta" id="f-tutor"><h2>Madre, padre o tutor</h2>' +
      '<p class="detalle">Es menor de edad. Los datos de quien le representa, para autorizaciones y avisos.</p><div class="rejilla-12">' +
      UI.campo({ nombre: "tutorNombre", etiqueta: "Nombre y apellidos", valor: tutor.nombre, clase: "col-5 col-movil-completo" }) +
      UI.campo({ nombre: "tutorRelacion", etiqueta: "Relación", valor: tutor.relacion, lista: ["Madre", "Padre", "Tutor legal", "Tutora legal"], clase: "col-3" }) +
      UI.campo({ nombre: "tutorDocumento", etiqueta: "DNI/NIE", valor: tutor.documento, clase: "col-4", atributos: 'autocapitalize="characters"' }) +
      UI.campo({ nombre: "tutorTelefono", etiqueta: "Teléfono", tipo: "tel", valor: tutor.telefono, clase: "col-4" }) +
      UI.campo({ nombre: "tutorEmail", etiqueta: "Correo", tipo: "email", valor: tutor.email, clase: "col-5 col-movil-completo" }) +
      "</div></section>" +

      '<section class="tarjeta"><h2>Condición de socio</h2><div class="rejilla-12">' +
      '<p class="col-3 dato-numero"><span class="detalle">Número de socio</span><strong>' + (s.numero ? esc(s.numero) : "Se asigna al guardar") + "</strong></p>" +
      UI.campo({ nombre: "tipoSocioId", etiqueta: "Tipo de socio", tipo: "select", valor: s.tipoSocioId || (tipos[0] || [""])[0], opciones: tipos, clase: "col-5 col-movil-completo" }) +
      UI.campo({ nombre: "fechaAlta", etiqueta: "Fecha de alta", tipo: "date", valor: s.fechaAlta || F.hoy(), requerido: true, clase: "col-4" }) +
      UI.campo({ nombre: "formaPago", etiqueta: "Forma de pago habitual", tipo: "select", valor: s.formaPago, opciones: S.FORMAS_PAGO, clase: "col-4",
        ayuda: "Se propone al cobrar; cada cuota puede pagarse de otra forma." }) +
      '<div class="col-8 col-movil-completo">' + casilla("exentoCuota", s.exentoCuota, "Exento de cuota (no se le emiten cuotas)") + "</div>" +
      "</div>" +
      '<fieldset id="f-sepa"><legend>Domiciliación bancaria</legend><div class="rejilla-12">' +
      UI.campo({ nombre: "iban", etiqueta: "IBAN", valor: s.iban, clase: "col-5 col-movil-completo", atributos: 'autocapitalize="characters" autocomplete="off"' }) +
      UI.campo({ nombre: "titularCuenta", etiqueta: "Titular de la cuenta", valor: s.titularCuenta, clase: "col-7 col-movil-completo", ayuda: "Si no es el propio socio." }) +
      UI.campo({ nombre: "mandatoReferencia", etiqueta: "Referencia del mandato", valor: s.mandatoReferencia, clase: "col-5" }) +
      UI.campo({ nombre: "mandatoFecha", etiqueta: "Fecha de firma del mandato", tipo: "date", valor: s.mandatoFecha, clase: "col-4" }) +
      "</div></fieldset></section>" +

      '<section class="tarjeta"><h2>Protección de datos e imagen</h2><div class="rejilla-12">' +
      UI.campo({ nombre: "proteccionDatos", etiqueta: "Aceptó la política de privacidad el", tipo: "date", valor: cons.proteccionDatos, clase: "col-4",
        ayuda: "Fecha en que firmó o aceptó la información de protección de datos." }) +
      '<div class="col-8 col-movil-completo">' +
      casilla("imagen", cons.imagen, "Autoriza el uso de su imagen (fotos y vídeos de actividades)") +
      casilla("comunicaciones", cons.comunicaciones, "Acepta recibir comunicaciones informativas") + "</div>" +
      "</div><p class=\"detalle\">Qué consentimientos hay que recoger y cómo depende de cada caso: verificar con asesoría.</p></section>" +

      '<section class="tarjeta"><h2>Notas</h2>' +
      UI.campo({ nombre: "notas", etiqueta: "Notas internas", tipo: "textarea", valor: s.notas, ancho: "completo" }) + "</section>" +

      '<div class="acciones barra-guardar"><button type="submit" class="btn btn-primario">' + (s.id ? "Guardar cambios" : "Dar de alta") + "</button>" +
      '<a class="btn btn-secundario" href="#/socios">Volver al listado</a></div>' +
      "</form>";
  }

  function periodicidadTexto(p) {
    return { anual: "al año", semestral: "al semestre", trimestral: "al trimestre", mensual: "al mes" }[p] || "";
  }

  /** Lee el formulario y lo vuelca sobre el socio. */
  function leerFicha(form, s) {
    var d = UI.leerFormulario(form);
    var V = WA.Validar;
    return Object.assign(S.completar(s), {
      nombre: d.nombre, apellidos: d.apellidos, sexo: d.sexo, tipoDocumento: d.tipoDocumento,
      documento: d.tipoDocumento === "Pasaporte" || d.tipoDocumento === "Otro" ? d.documento.toUpperCase() : V.normalizar(d.documento),
      fechaNacimiento: d.fechaNacimiento, ocupacion: d.ocupacion,
      email: d.email, telefono: d.telefono, telefono2: d.telefono2, direccion: WA.FormDireccion.leer(d),
      tutor: { nombre: d.tutorNombre, relacion: d.tutorRelacion, documento: V.normalizar(d.tutorDocumento), telefono: d.tutorTelefono, email: d.tutorEmail },
      tipoSocioId: d.tipoSocioId, fechaAlta: d.fechaAlta, formaPago: d.formaPago, exentoCuota: !!d.exentoCuota,
      iban: V.normalizar(d.iban), titularCuenta: d.titularCuenta, mandatoReferencia: d.mandatoReferencia, mandatoFecha: d.mandatoFecha,
      consentimientos: { proteccionDatos: d.proteccionDatos, imagen: !!d.imagen, comunicaciones: !!d.comunicaciones },
      notas: d.notas,
    });
  }

  var CAMPO_DE = { tutorNombre: "tutorNombre", codigoPostal: "codigoPostal" };

  async function pintarFicha(cont, datos, id) {
    var c = await cargar(datos);
    var s = id ? c.socios.filter(function (x) { return x.id === id; })[0] : S.vacio();
    if (!s) { cont.innerHTML = '<h1>Socio no encontrado</h1><p><a href="#/socios">Volver al listado</a></p>'; return; }
    var nuevo = !s.id;
    if (nuevo) s.formaPago = "Transferencia";
    var e = nuevo ? "activo" : S.estado(s);
    var misCuotas = c.cuotas.filter(function (q) { return q.socioId === s.id; })
      .sort(function (a, b) { return String(b.periodo).localeCompare(String(a.periodo)); });

    cont.innerHTML =
      '<p class="miga"><a href="#/socios">Socios</a> › ' + (nuevo ? "Nuevo" : "N.º " + esc(s.numero)) + "</p>" +
      '<div class="cabecera-pagina"><h1>' + (nuevo ? "Nuevo socio" : esc(S.nombreCompleto(s))) + "</h1>" +
      (!nuevo ? '<span class="estado ' + (e === "baja" ? "estado-neutro" : "estado-ok") + '">' + esc(ESTADO_TEXTO[e]) + "</span>" : "") + "</div>" + WA.UI.firma(s) +
      (e === "baja" ? '<div class="caja-aviso">Dado de baja el <strong>' + esc(F.corta(s.fechaBaja)) + "</strong>" +
        (s.motivoBaja ? " · " + esc(s.motivoBaja) : "") + '. <button type="button" class="btn btn-enlace" id="f-reactivar">Reactivar</button></div>' : "") +
      formularioFicha(s, c) +
      (nuevo ? "" :
        '<section class="tarjeta" aria-labelledby="t-cuotas"><div class="tarjeta-cabecera"><h2 id="t-cuotas">Cuotas</h2></div>' +
        '<div id="f-cuotas">' + WA.CuotasUI.tabla(misCuotas, { conSocio: false }) + "</div></section>" +
        '<section class="tarjeta zona-peligro" aria-labelledby="t-baja"><h2 id="t-baja">Baja y eliminación</h2>' +
        "<p>La <strong>baja</strong> conserva su ficha y su historial en el libro de registro. <strong>Eliminar</strong> borra sus datos personales " +
        "(por ejemplo, si ejerce su derecho de supresión); las cuotas ya pagadas se conservan en la contabilidad con su nombre y número.</p>" +
        '<div class="acciones">' + (e !== "baja" ? '<button type="button" class="btn btn-secundario" id="f-baja">Dar de baja…</button>' : "") +
        '<button type="button" class="btn btn-peligro-suave" id="f-eliminar">Eliminar socio…</button></div></section>');

    var form = cont.querySelector("#f-socio");
    WA.FormDireccion.conectar(form);

    // Mostrar u ocultar lo que depende de otros campos.
    function dependencias() {
      var d = UI.leerFormulario(form);
      var edad = S.edad(d.fechaNacimiento);
      cont.querySelector("#f-edad").textContent = edad !== null ? edad + (edad === 1 ? " año" : " años") : "";
      var menor = edad !== null && edad < S.MAYORIA_EDAD;
      cont.querySelector("#f-tutor").hidden = !menor && !d.tutorNombre;
      cont.querySelector("#f-sepa").hidden = d.formaPago !== "Domiciliación" && !d.iban;
    }
    form.addEventListener("input", dependencias);
    form.addEventListener("change", dependencias);
    dependencias();

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var socio = leerFicha(form, s);
      var r = S.revisar(socio, c.socios);
      // Limpia y marca errores (impiden guardar) y avisos (no).
      Array.prototype.forEach.call(form.querySelectorAll("[data-campo]"), function (el) { UI.marcarError(form, el.getAttribute("data-campo"), ""); });
      Object.keys(r.avisos).forEach(function (k) { UI.marcarError(form, CAMPO_DE[k] || k, r.avisos[k]); });
      var nAvisos = Object.keys(r.avisos).length + WA.FormDireccion.revisar(form, UI.leerFormulario(form));
      Object.keys(r.errores).forEach(function (k) { UI.marcarError(form, k, r.errores[k]); });
      var errores = Object.keys(r.errores);
      if (errores.length) {
        var primero = form.elements[errores[0]];
        if (primero) primero.focus();
        UI.aviso("Revisa los campos marcados en rojo.", "error");
        return;
      }
      if (nuevo) {
        socio.numero = S.siguienteNumero(c.socios, c.config.siguienteNumeroSocio);
        c.config.siguienteNumeroSocio = socio.numero + 1;
        await datos.escribir("config", c.config);
      }
      var guardado = await datos.guardar("socios", socio);
      UI.aviso((nuevo ? "Alta hecha: socio n.º " + guardado.numero + "." : "Cambios guardados.") +
        (nAvisos ? " Hay avisos en algunos campos; revísalos." : ""), nAvisos ? "info" : "ok");
      if (nuevo) {
        await ofrecerCuotaActual(datos, guardado, c);
        location.hash = "#/socios/ficha/" + encodeURIComponent(guardado.id);
      }
    });

    if (nuevo) return;
    // Tras cobrar o anular una cuota se repinta solo su tabla: así no se pierde lo que se esté editando arriba.
    var zonaCuotas = cont.querySelector("#f-cuotas");
    WA.CuotasUI.conectar(zonaCuotas, datos, async function () {
      var lista = (await datos.listar("cuotas")).filter(function (q) { return q.socioId === s.id; })
        .sort(function (a, b) { return String(b.periodo).localeCompare(String(a.periodo)); });
      zonaCuotas.innerHTML = WA.CuotasUI.tabla(lista, { conSocio: false });
    });
    cont.querySelector("#f-eliminar").addEventListener("click", function () { eliminar(datos, s); });
    var bBaja = cont.querySelector("#f-baja");
    if (bBaja) bBaja.addEventListener("click", function () { darDeBaja(datos, s, c.cuotas); });
    var bReac = cont.querySelector("#f-reactivar");
    if (bReac) bReac.addEventListener("click", async function () {
      if (!(await UI.confirmar("Volverá a figurar como socio activo (se borra la fecha de baja).", { titulo: "Reactivar socio", aceptar: "Reactivar" }))) return;
      await datos.guardar("socios", Object.assign(s, { fechaBaja: "", motivoBaja: "" }));
      UI.aviso("Socio reactivado.");
      WA.App.repintar();
    });
  }

  /** Tras un alta: si ya se emitieron las cuotas del periodo actual, ofrece emitir la suya. */
  async function ofrecerCuotaActual(datos, socio, c) {
    var tipo = (c.config.tiposSocio || []).filter(function (t) { return t.id === socio.tipoSocioId; })[0];
    if (!tipo || !(tipo.cuota > 0) || socio.exentoCuota) return;
    var p = C.periodoDeFecha(tipo.periodicidad, socio.fechaAlta);
    var yaEmitidas = c.cuotas.some(function (q) { return q.periodo === p.clave; });
    if (!yaEmitidas) return;
    var r = C.generar({ periodo: p.clave, socios: [socio], tipos: c.config.tiposSocio, cuotas: c.cuotas });
    if (r.nuevas.length !== 1) return;
    var ok = await UI.confirmar("Las cuotas del " + p.etiqueta + " ya se emitieron. ¿Emitir también la de este socio (" + D.formatear(r.total) + ")?",
      { titulo: "Cuota del periodo actual", aceptar: "Emitir su cuota", cancelar: "Ahora no" });
    if (ok) { await datos.guardar("cuotas", r.nuevas[0]); UI.aviso("Cuota emitida."); }
  }

  async function darDeBaja(datos, s, cuotas) {
    var pendientes = cuotas.filter(function (q) { return q.socioId === s.id && C.debe(q); });
    var r = await UI.dialogo({
      titulo: "Dar de baja a " + S.nombreCompleto(s),
      contenido: '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "fechaBaja", etiqueta: "Fecha de baja", tipo: "date", valor: F.hoy(), requerido: true }) +
        UI.campo({ nombre: "motivoBaja", etiqueta: "Motivo", valor: "", lista: ["Voluntaria", "Impago de cuotas", "Fallecimiento", "Expulsión", "Traslado"] }) +
        "</div>" +
        (pendientes.length ? '<label class="casilla"><input type="checkbox" name="anular" checked><span>Anular sus ' + pendientes.length +
          " cuotas pendientes (" + esc(D.formatear(D.sumar(pendientes.map(function (q) { return q.importe; })))) + ")</span></label>" : "") +
        '<p class="detalle">Las causas y el procedimiento de baja los fijan vuestros estatutos.</p></form>',
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Dar de baja", valor: "enviar", estilo: "btn-primario" }],
      validar: function (form) {
        var ok = F.esValida(form.elements.fechaBaja.value) && form.elements.fechaBaja.value >= s.fechaAlta;
        UI.marcarError(form, "fechaBaja", ok ? "" : "Pon una fecha válida, posterior al alta.");
        return ok;
      },
    });
    if (r.valor !== "enviar") return;
    await datos.guardar("socios", Object.assign(s, { fechaBaja: r.datos.fechaBaja, motivoBaja: r.datos.motivoBaja }));
    if (r.datos.anular) await datos.guardarVarios("cuotas", pendientes.map(function (q) { return C.anular(q, "Baja del socio"); }));
    UI.aviso("Baja registrada.");
    WA.App.repintar();
  }

  async function eliminar(datos, s) {
    var ok = await UI.confirmar("Se borrarán todos los datos personales de " + S.nombreCompleto(s) + " (n.º " + s.numero + ") y sus cuotas sin pagar. " +
      "Las cuotas pagadas se conservan en la contabilidad. No se puede deshacer (salvo con una copia de seguridad anterior). " +
      "Cuánto tiempo hay que conservar los datos de un socio que se va: verificar con asesoría.",
      { titulo: "Eliminar socio", aceptar: "Eliminar definitivamente", peligro: true });
    if (!ok) return;
    var cuotas = (await datos.listar("cuotas")).filter(function (q) { return q.socioId === s.id && q.estado !== "pagada"; });
    for (var i = 0; i < cuotas.length; i++) await datos.borrar("cuotas", cuotas[i].id);
    await datos.borrar("socios", s.id);
    UI.aviso("Socio eliminado.");
    location.hash = "#/socios";
  }

  // ── Libro de registro (para imprimir) ───────────────────────────────────
  var conBajas = true;
  async function pintarLibro(cont, datos) {
    var c = await cargar(datos);
    var a = c.asociacion;
    function tabla() {
      var lista = S.filtrar(c.socios, { estado: conBajas ? "todos" : "activo" });
      return '<table class="tabla tabla-libro"><thead><tr><th scope="col" class="num">Nº</th><th scope="col">Nombre y apellidos</th><th scope="col">Documento</th>' +
        '<th scope="col">Domicilio</th><th scope="col">Alta</th><th scope="col">Baja</th></tr></thead><tbody>' +
        lista.map(function (s) {
          return '<tr><td class="num">' + esc(s.numero) + "</td><td>" + esc(S.nombreListado(s)) + "</td><td>" + esc(s.documento) + "</td>" +
            "<td>" + esc(WA.Direccion.formatear(s.direccion).completa) + "</td><td>" + esc(F.corta(s.fechaAlta)) + "</td><td>" + esc(F.corta(s.fechaBaja)) + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
    cont.innerHTML =
      '<p class="miga no-imprimir"><a href="#/socios">Socios</a> › Libro de registro</p>' +
      "<h1>Libro de registro de socios</h1>" +
      '<p class="intro">' + esc(a.nombre || "") + (a.nif ? " · NIF " + esc(a.nif) : "") + " · A fecha " + esc(F.larga(F.hoy())) + "</p>" +
      '<div class="acciones no-imprimir"><button type="button" class="btn btn-primario lectura-ok" id="l-imprimir">Imprimir o guardar en PDF</button>' +
      '<label class="casilla"><input type="checkbox" id="l-bajas"' + (conBajas ? " checked" : "") + "><span>Incluir las bajas</span></label></div>" +
      '<p class="detalle no-imprimir">La relación actualizada de socios es obligatoria (Ley Orgánica 1/2002, art. 14). Qué datos debe incluir en vuestro caso: verificar con asesoría.</p>' +
      '<div class="tabla-envoltorio" id="l-tabla">' + tabla() + "</div>";
    cont.querySelector("#l-imprimir").addEventListener("click", function () { window.print(); });
    cont.querySelector("#l-bajas").addEventListener("change", function (e) { conBajas = e.target.checked; cont.querySelector("#l-tabla").innerHTML = tabla(); });
  }

  async function pintar(cont, datos, ruta) {
    if (ruta[0] === "nuevo") return pintarFicha(cont, datos, null);
    if (ruta[0] === "ficha") return pintarFicha(cont, datos, ruta[1]);
    if (ruta[0] === "libro") return pintarLibro(cont, datos);
    return pintarListado(cont, datos);
  }

  WA.App.registrar({
    id: "socios", titulo: "Socios", orden: 20, pintar: pintar,
    icono: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.3c2.1.7 3.5 2.7 3.5 5.7"/>',
  });
})(typeof self !== "undefined" ? self : this);

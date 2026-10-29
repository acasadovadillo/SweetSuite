/*
 * Agora — Módulo «Documentos»: archivos adjuntos (estatutos, actas
 * firmadas, bases de subvenciones, pólizas…).
 *
 *   #/documentos   todos los documentos, por categoría
 *
 * Los archivos se guardan CIFRADOS en este dispositivo y, aparte, en GitHub
 * (datos/nube.js), para toda la junta. Se pueden adjuntar varios a la vez (o
 * arrastrarlos a la lista) y se ven sin descargarlos: imágenes, PDF y texto.
 *
 * También exporta WA.DocsUI.seccion(…), que pinta los documentos de un acta, un
 * proyecto o una actividad con su botón «Adjuntar».
 *
 * FICHA: { id, nombre, tipoMime, tamano, categoria, descripcion, fecha,
 *          vinculos: [{ tipo: "acta" | "proyecto" | "actividad", id }] }
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas;

  var CATEGORIAS = ["Estatutos", "Actas firmadas", "Subvenciones", "Facturas y justificantes", "Seguros", "Registro y trámites", "Otros"];
  var filtro = { categoria: "", texto: "" };

  function tamanoTexto(b) {
    if (!(b >= 0)) return "";
    if (b < 1024) return b + " B";
    if (b < 1048576) return Math.round(b / 1024) + " KB";
    return (b / 1048576).toFixed(1).replace(".", ",") + " MB";
  }

  /**
   * Elige uno o varios archivos (o los recibe, si se arrastraron) y los
   * adjunta. vinculo: { tipo, id } o null. Devuelve cuántos se adjuntaron.
   */
  async function adjuntar(datos, vinculo, categoriaPorDefecto, recibidos) {
    var config = await datos.leer("config");
    var mb = config.limiteArchivoMB || 10, limite = mb * 1048576;
    var archivos = recibidos || await UI.elegirArchivos("");
    if (!archivos.length) return 0;
    var grandes = archivos.filter(function (a) { return a.bytes.length > limite; });
    archivos = archivos.filter(function (a) { return a.bytes.length <= limite; });
    if (grandes.length) {
      UI.aviso((grandes.length === 1 ? "«" + grandes[0].nombre + "» ocupa " + tamanoTexto(grandes[0].bytes.length) : grandes.length + " archivos pasan") +
        " del máximo de " + mb + " MB y no se adjunta" + (grandes.length === 1 ? "" : "n") + ". Reduce su tamaño (por ejemplo, escaneando a menos resolución).", "error");
    }
    if (!archivos.length) return 0;
    if (archivos.length > 1) return adjuntarVarios(datos, vinculo, categoriaPorDefecto, archivos);
    var archivo = archivos[0];
    var r = await UI.dialogo({
      titulo: "Adjuntar documento",
      contenido: "<p>«" + esc(archivo.nombre) + "» · " + esc(tamanoTexto(archivo.bytes.length)) + "</p>" +
        '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "nombre", etiqueta: "Nombre", valor: archivo.nombre, requerido: true, ancho: "completo" }) +
        UI.campo({ nombre: "categoria", etiqueta: "Categoría", tipo: "select", valor: categoriaPorDefecto || "Otros", opciones: CATEGORIAS }) +
        UI.campo({ nombre: "fecha", etiqueta: "Fecha del documento", tipo: "date", valor: F.hoy() }) +
        UI.campo({ nombre: "descripcion", etiqueta: "Descripción", valor: "", ancho: "completo" }) +
        "</div></form>" + '<p class="letra-pequena">Se guarda cifrado y llega al resto de la junta con lo demás.</p>',
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Adjuntar", valor: "enviar", estilo: "btn-primario" }],
      validar: function (form) { var ok = !!form.elements.nombre.value.trim(); UI.marcarError(form, "nombre", ok ? "" : "Pon un nombre."); return ok; },
    });
    if (r.valor !== "enviar") return 0;
    var tipoMime = archivo.tipo || adivinarTipo(archivo.nombre);
    try {
      var ficha = await datos.guardarArchivo({ nombre: r.datos.nombre, tipoMime: tipoMime, categoria: r.datos.categoria, fecha: r.datos.fecha,
        descripcion: r.datos.descripcion, vinculos: vinculo ? [vinculo] : [] }, archivo.bytes);
      UI.aviso("Documento adjuntado.");
      return ficha ? 1 : 0;
    } catch (e) {
      UI.aviso("No se ha podido guardar: " + e.message, "error");
      return 0;
    }
  }

  /** Varios a la vez: la misma categoría y fecha para todos, cada uno con su nombre. */
  async function adjuntarVarios(datos, vinculo, categoriaPorDefecto, archivos) {
    var total = archivos.reduce(function (s, a) { return s + a.bytes.length; }, 0);
    var r = await UI.dialogo({
      titulo: "Adjuntar " + archivos.length + " documentos",
      contenido: '<ul class="lista">' + archivos.map(function (a) { return "<li>" + esc(a.nombre) + ' <span class="detalle">· ' + esc(tamanoTexto(a.bytes.length)) + "</span></li>"; }).join("") +
        '</ul><p class="detalle">' + esc(tamanoTexto(total)) + " en total. Cada uno se guarda con el nombre de su archivo; luego se puede cambiar.</p>" +
        '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "categoria", etiqueta: "Categoría", tipo: "select", valor: categoriaPorDefecto || "Otros", opciones: CATEGORIAS }) +
        UI.campo({ nombre: "fecha", etiqueta: "Fecha de los documentos", tipo: "date", valor: F.hoy() }) + "</div></form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Adjuntar " + archivos.length, valor: "enviar", estilo: "btn-primario" }],
    });
    if (r.valor !== "enviar") return 0;
    var hechos = 0;
    for (var i = 0; i < archivos.length; i++) {
      try {
        await datos.guardarArchivo({ nombre: archivos[i].nombre, tipoMime: archivos[i].tipo || adivinarTipo(archivos[i].nombre), categoria: r.datos.categoria,
          fecha: r.datos.fecha, descripcion: "", vinculos: vinculo ? [vinculo] : [] }, archivos[i].bytes);
        hechos++;
      } catch (e) {
        UI.aviso("«" + archivos[i].nombre + "» no se ha podido guardar: " + e.message, "error");
      }
    }
    if (hechos) UI.aviso(hechos + (hechos === 1 ? " documento adjuntado." : " documentos adjuntados."));
    return hechos;
  }

  /** Arrastrar archivos a una zona los adjunta (con su vínculo, si lo hay). */
  function soltarEn(zona, datos, vinculo, categoria) {
    zona.addEventListener("dragover", function (e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") < 0) return;
      e.preventDefault();
      zona.classList.add("soltando");
    });
    zona.addEventListener("dragleave", function (e) { if (!zona.contains(e.relatedTarget)) zona.classList.remove("soltando"); });
    zona.addEventListener("drop", async function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      zona.classList.remove("soltando");
      var archivos = await Promise.all(Array.prototype.map.call(e.dataTransfer.files, UI.leerArchivoBinario));
      if (await adjuntar(datos, vinculo, typeof categoria === "function" ? categoria() : categoria, archivos)) WA.App.repintar();
    });
  }

  function adivinarTipo(nombre) {
    var ext = String(nombre).split(".").pop().toLowerCase();
    return { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", txt: "text/plain", doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", odt: "application/vnd.oasis.opendocument.text",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }[ext] || "application/octet-stream";
  }

  /**
   * Descifra el archivo y lo enseña aquí mismo, sin descargarlo: las imágenes,
   * los PDF y el texto. Lo demás (Word, Excel…) se descarga.
   */
  async function abrir(datos, ficha, descargar) {
    var bytes;
    try { bytes = await datos.leerArchivo(ficha.id); }
    catch (e) { UI.aviso("No se ha podido abrir: " + (e.message || e), "error"); return; }
    if (!bytes) { UI.aviso("Este archivo aún no está en GitHub: se subirá desde el dispositivo donde se adjuntó.", "error"); return; }
    var tipo = ficha.tipoMime || adivinarTipo(ficha.nombre);
    var blob = new Blob([bytes], { type: tipo });
    var clase = /^image\//.test(tipo) ? "imagen" : tipo === "application/pdf" ? "pdf" : /^text\/plain/.test(tipo) ? "texto" : "";
    if (descargar || !clase) { UI.descargar(ficha.nombre, blob); return; }
    var url = URL.createObjectURL(blob);
    var vista = clase === "imagen" ? '<img src="' + url + '" alt="' + esc(ficha.nombre) + '">'
      : clase === "pdf" ? '<iframe src="' + url + '" title="' + esc(ficha.nombre) + '"></iframe>'
      : "<pre>" + esc(new TextDecoder().decode(bytes)) + "</pre>";
    var r = await UI.dialogo({
      titulo: ficha.nombre,
      contenido: '<div class="vista-adjunto vista-' + clase + '">' + vista + "</div>" +
        '<p class="detalle">' + esc(ficha.categoria || "") + (ficha.fecha ? " · " + esc(F.corta(ficha.fecha)) : "") + " · " + esc(tamanoTexto(ficha.tamano || bytes.length)) + "</p>",
      botones: [{ texto: "Descargar", valor: "descargar" }, { texto: "Cerrar", valor: "cancelar", estilo: "btn-primario" }],
      alAbrir: function (d) { d.classList.add("dialogo-ancho"); },
    });
    URL.revokeObjectURL(url);
    if (r.valor === "descargar") UI.descargar(ficha.nombre, blob);
  }

  async function editar(datos, ficha) {
    var r = await UI.dialogo({
      titulo: "Documento",
      contenido: "<p>" + esc(ficha.nombre) + " · " + esc(tamanoTexto(ficha.tamano)) + "</p>" +
        '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "nombre", etiqueta: "Nombre", valor: ficha.nombre, requerido: true, ancho: "completo" }) +
        UI.campo({ nombre: "categoria", etiqueta: "Categoría", tipo: "select", valor: ficha.categoria, opciones: CATEGORIAS }) +
        UI.campo({ nombre: "fecha", etiqueta: "Fecha", tipo: "date", valor: ficha.fecha }) +
        UI.campo({ nombre: "descripcion", etiqueta: "Descripción", valor: ficha.descripcion, ancho: "completo" }) + "</div></form>",
      botones: [{ texto: "Borrar", valor: "borrar", estilo: "btn-peligro-suave" }, { texto: "Cancelar", valor: "cancelar" }, { texto: "Guardar", valor: "enviar", estilo: "btn-primario" }],
    });
    if (r.valor === "borrar") {
      if (!(await UI.confirmar("Se borrará «" + ficha.nombre + "» para toda la junta, también de GitHub.", { titulo: "Borrar documento", aceptar: "Borrar", peligro: true }))) return false;
      await datos.borrarArchivo(ficha.id);
      UI.aviso("Documento borrado.");
      return true;
    }
    if (r.valor !== "enviar") return false;
    await datos.guardar("documentos", Object.assign(ficha, { nombre: r.datos.nombre, categoria: r.datos.categoria, fecha: r.datos.fecha, descripcion: r.datos.descripcion }));
    return true;
  }

  function filas(lista) {
    if (!lista.length) return '<p class="vacio">No hay documentos.</p>';
    return '<ul class="lista-documentos">' + lista.map(function (d) {
      return '<li><span class="doc-icono" aria-hidden="true">' + (/pdf/.test(d.tipoMime) ? "PDF" : /image/.test(d.tipoMime) ? "IMG" : "DOC") + "</span>" +
        '<span class="doc-texto"><button type="button" class="btn-enlace doc-nombre lectura-ok" data-abrir="' + esc(d.id) + '">' + esc(d.nombre) + "</button>" +
        '<span class="detalle">' + esc(d.categoria) + (d.fecha ? " · " + esc(F.corta(d.fecha)) : "") + " · " + esc(tamanoTexto(d.tamano)) + (d.descripcion ? " · " + esc(d.descripcion) : "") + "</span></span>" +
        '<span class="doc-acciones"><button type="button" class="btn btn-pequeno btn-secundario lectura-ok" data-bajar="' + esc(d.id) + '">Descargar</button>' +
        '<button type="button" class="btn btn-pequeno btn-secundario" data-editar-doc="' + esc(d.id) + '">Editar</button></span></li>';
    }).join("") + "</ul>";
  }

  function conectar(zona, datos, lista, alCambiar) {
    zona.addEventListener("click", async function (e) {
      var b = e.target.closest("[data-abrir],[data-bajar],[data-editar-doc]");
      if (!b) return;
      var id = b.getAttribute("data-abrir") || b.getAttribute("data-bajar") || b.getAttribute("data-editar-doc");
      var ficha = lista().filter(function (x) { return x.id === id; })[0];
      if (!ficha) return;
      if (b.hasAttribute("data-editar-doc")) { if (await editar(datos, ficha)) alCambiar(); }
      else await abrir(datos, ficha, b.hasAttribute("data-bajar"));
    });
  }

  /**
   * Sección «Documentos» dentro de otra ficha. vinculo: { tipo, id }.
   * Devuelve el HTML; después hay que llamar a conectarSeccion(cont, datos, vinculo).
   */
  function seccion(documentos, vinculo, titulo) {
    var lista = documentos.filter(function (d) { return (d.vinculos || []).some(function (v) { return v.tipo === vinculo.tipo && v.id === vinculo.id; }); });
    return '<section class="tarjeta" aria-labelledby="t-docs-' + esc(vinculo.id) + '"><div class="tarjeta-cabecera"><h2 id="t-docs-' + esc(vinculo.id) + '">' + esc(titulo || "Documentos") + "</h2>" +
      '<button type="button" class="btn btn-secundario" data-adjuntar>Adjuntar documentos</button></div><div data-docs class="zona-soltar">' + filas(lista) +
      '<p class="detalle">También puedes arrastrarlos aquí.</p></div></section>';
  }
  function conectarSeccion(cont, datos, vinculo, categoriaPorDefecto) {
    var docs = [];
    datos.listar("documentos").then(function (l) { docs = l; });
    var boton = cont.querySelector("[data-adjuntar]");
    if (boton) boton.addEventListener("click", async function () { if (await adjuntar(datos, vinculo, categoriaPorDefecto)) WA.App.repintar(); });
    var zona = cont.querySelector("[data-docs]");
    if (zona) {
      conectar(zona, datos, function () { return docs; }, function () { WA.App.repintar(); });
      soltarEn(zona, datos, vinculo, categoriaPorDefecto);
    }
  }

  async function pintar(cont, datos) {
    var docs = await datos.listar("documentos");
    var total = docs.reduce(function (s, d) { return s + (d.tamano || 0); }, 0);
    var esp = await WA.Boveda.espacio();
    var hayEstatutos = docs.some(function (d) { return d.categoria === "Estatutos"; });
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Documentos</h1><button type="button" class="btn btn-primario" id="d-nuevo">Adjuntar documentos</button></div>' +
      '<p class="intro">Estatutos, actas firmadas, bases de subvenciones, pólizas… Se guardan cifrados y los ve toda la junta. Puedes adjuntar varios a la vez o arrastrarlos a la lista.</p>' +
      (!hayEstatutos ? '<div class="caja-aviso">Todavía no habéis adjuntado los <strong>estatutos</strong>. Son la referencia para los fines, los cargos, las asambleas y las cuotas.</div>' : "") +
      '<div class="barra-filtros"><label><span class="sr">Categoría</span><select id="d-cat"><option value="">Todas las categorías</option>' +
      CATEGORIAS.map(function (c2) { return '<option value="' + esc(c2) + '"' + (filtro.categoria === c2 ? " selected" : "") + ">" + esc(c2) + "</option>"; }).join("") + "</select></label>" +
      '<label class="filtro-texto"><span class="sr">Buscar</span><input type="search" id="d-buscar" placeholder="Buscar documento…" value="' + esc(filtro.texto) + '"></label></div>' +
      '<div id="d-lista" class="zona-soltar"></div>' +
      '<p class="detalle">' + docs.length + " documentos · " + esc(tamanoTexto(total)) +
      (esp && esp.quota ? " · espacio del navegador usado: " + esc(tamanoTexto(esp.usage)) + " de " + esc(tamanoTexto(esp.quota)) : "") + "</p>";
    function visibles() {
      var t = filtro.texto.trim().toLowerCase();
      return docs.filter(function (d) { return (!filtro.categoria || d.categoria === filtro.categoria) && (!t || (d.nombre + " " + d.descripcion).toLowerCase().indexOf(t) >= 0); })
        .sort(function (a, b) { return String(b.fecha || "").localeCompare(String(a.fecha || "")); });
    }
    var zona = cont.querySelector("#d-lista");
    var refrescar = function () { zona.innerHTML = filas(visibles()); };
    refrescar();
    conectar(zona, datos, function () { return docs; }, function () { WA.App.repintar(); });
    cont.querySelector("#d-cat").addEventListener("change", function (e) { filtro.categoria = e.target.value; refrescar(); });
    cont.querySelector("#d-buscar").addEventListener("input", function (e) { filtro.texto = e.target.value; refrescar(); });
    cont.querySelector("#d-nuevo").addEventListener("click", async function () { if (await adjuntar(datos, null, filtro.categoria)) WA.App.repintar(); });
    soltarEn(zona, datos, null, function () { return filtro.categoria; });
  }

  WA.DocsUI = { CATEGORIAS: CATEGORIAS, adjuntar: adjuntar, abrir: abrir, seccion: seccion, conectarSeccion: conectarSeccion, tamanoTexto: tamanoTexto };
  WA.App.registrar({
    id: "documentos", titulo: "Documentos", orden: 48, pintar: pintar,
    icono: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  });
})(typeof self !== "undefined" ? self : this);

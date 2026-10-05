/*
 * webkit_asociaciones — Módulo «Copia de seguridad».
 *
 * La copia de seguridad es lo más importante de la aplicación: los datos viven
 * en un navegador, y un navegador se puede borrar, cambiar o estropear. Una
 * copia descargada (y guardada en otro sitio) es lo único que lo protege.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, esc = WA.UI.esc;

  /** Descarga una copia. cifrada = true (normal) o false (legible, con aviso). */
  async function descargar(cifrada) {
    var sesion = WA.Sesion;
    if (sesion.modo === "demostración" && cifrada) cifrada = false;
    var sobre = await sesion.contenidoCopia(cifrada);
    var nombre = WA.Copia.nombreArchivo(sobre.asociacion, WA.Fechas.hoy(), cifrada);
    WA.UI.descargar(nombre, JSON.stringify(sobre, null, cifrada ? 0 : 2), "application/json");
    if (cifrada && sesion.modo === "abierta") await sesion.datos.marcarCopiaHecha();
    WA.UI.aviso("Copia descargada: " + nombre + ". Guárdala fuera de este ordenador.");
    WA.App.actualizarFranjas();
  }

  async function descargarSinCifrar() {
    var ok = await WA.UI.confirmar(
      "El archivo contendrá todos los datos en claro (nombres, correos, teléfonos…). Cualquiera que lo abra podrá leerlos. " +
      "Úsalo solo para revisarlos o pasarlos a otro programa, y bórralo después.",
      { titulo: "Copia SIN cifrar", aceptar: "Descargar sin cifrar", peligro: true });
    if (ok) await descargar(false);
  }

  async function restaurar() {
    var archivo = await WA.UI.elegirArchivo(".json,application/json");
    if (!archivo) return;
    var lectura;
    try { lectura = WA.Copia.leer(archivo.texto); }
    catch (e) { WA.UI.aviso(e.message, "error"); return; }
    var demo = WA.Sesion.modo === "demostración";
    var r = await WA.UI.dialogo({
      titulo: "Recuperar copia",
      contenido: "<p>Copia" + (lectura.asociacion ? " de <strong>" + esc(lectura.asociacion) + "</strong>" : "") +
        (lectura.creada ? " del " + esc(WA.Fechas.corta(lectura.creada.slice(0, 10))) : "") + ".</p>" +
        (demo ? "" : '<div class="caja-aviso"><strong>Sustituirá todos los datos actuales.</strong> Si no estás seguro, descarga antes una copia de lo que tienes ahora.</div>') +
        "<form>" +
        (lectura.cifrada ? WA.UI.campo({ nombre: "pass", etiqueta: "Contraseña de la copia", tipo: "password", requerido: true,
          ayuda: demo ? "" : "A partir de ahora será también la contraseña de este navegador.", atributos: 'autocomplete="current-password"' }) : "") +
        (demo || !lectura.cifrada ? WA.UI.campo({ nombre: "nueva", etiqueta: "Contraseña para proteger los datos en este navegador", tipo: "password", requerido: true,
          ayuda: "Mínimo 8 caracteres.", atributos: 'autocomplete="new-password" minlength="8"' }) : "") +
        "</form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Recuperar", valor: "enviar", estilo: "btn-primario" }],
      validar: function (form) {
        var n = form.elements.nueva;
        if (n && n.value.length < 8) { WA.UI.marcarError(form, "nueva", "Mínimo 8 caracteres."); return false; }
        return true;
      },
    });
    if (r.valor !== "enviar") return;
    try {
      var passCopia = r.datos.pass || "";
      // Si la copia va cifrada y no se pidió otra, la contraseña de la copia pasa a ser la de la sesión.
      await WA.Sesion.restaurar(lectura, passCopia, r.datos.nueva || passCopia);
      WA.UI.aviso("Copia recuperada.");
      location.hash = "#/inicio";
      WA.App.repintar();
    } catch (e) {
      WA.UI.aviso(e.message, "error");
    }
  }

  async function pintar(cont, datos) {
    var demo = WA.Sesion.modo === "demostración";
    var e = await datos.estadoCopia();
    var tipo = await WA.Boveda.tipo();
    var docs = await datos.listar("documentos");
    var pesoDocs = docs.reduce(function (s, d) { return s + (d.tamano || 0); }, 0);
    var ultima = e.ultimaCopia
      ? "La última copia es del <strong>" + esc(WA.Fechas.corta(e.ultimaCopia.slice(0, 10))) + "</strong>" +
        (e.cambiosDesdeCopia ? " y desde entonces ha habido cambios." : " y no ha habido cambios después.")
      : "Todavía no has descargado ninguna copia.";
    cont.innerHTML =
      "<h1>Copia de seguridad</h1>" +
      '<p class="intro">Tus datos solo están en este navegador. Descarga una copia cada vez que hagas cambios importantes y guárdala en otro sitio (un pendrive, la nube de la asociación…).</p>' +
      (demo ? '<div class="caja-aviso">Estás en la demostración: la copia sale sin cifrar y con datos inventados.</div>' : "") +
      '<section class="tarjeta" aria-labelledby="t-descargar"><h2 id="t-descargar">Descargar copia</h2>' +
      (demo ? "" : "<p>" + ultima + "</p>") +
      "<p>La copia va <strong>cifrada con tu contraseña</strong>: sin ella no se puede abrir.</p>" +
      (docs.length ? '<p class="detalle">Incluye ' + docs.length + (docs.length === 1 ? " documento adjunto" : " documentos adjuntos") + " (" + esc(WA.DocsUI.tamanoTexto(pesoDocs)) + "): el archivo de copia ocupará algo más.</p>" : "") +
      '<div class="acciones"><button type="button" class="btn btn-primario" id="c-descargar">Descargar copia cifrada</button>' +
      '<button type="button" class="btn btn-secundario" id="c-claro">Descargar sin cifrar…</button></div></section>' +
      '<section class="tarjeta" aria-labelledby="t-recuperar"><h2 id="t-recuperar">Recuperar una copia</h2>' +
      "<p>Abre un archivo de copia para seguir trabajando con él en este navegador.</p>" +
      '<div class="acciones"><button type="button" class="btn btn-secundario" id="c-recuperar">Elegir archivo de copia…</button></div></section>' +
      '<section class="tarjeta" aria-labelledby="t-buenas"><h2 id="t-buenas">Buenas prácticas</h2><ul class="lista">' +
      "<li>Guarda al menos dos copias en sitios distintos, y alguna fuera de este ordenador.</li>" +
      "<li>Guarda la contraseña aparte de las copias (por ejemplo, en un gestor de contraseñas). Sin ella, la copia no sirve.</li>" +
      "<li>Las copias contienen datos personales de socios: compártelas solo con quien lleve la gestión.</li>" +
      "<li>Las copias sin cifrar, bórralas en cuanto termines de usarlas.</li>" +
      "</ul><p class=\"detalle\">Se guarda en este navegador con " + esc(tipo) + ".</p></section>";
    cont.querySelector("#c-descargar").addEventListener("click", function () { descargar(true).then(function () { WA.App.repintar(); }); });
    cont.querySelector("#c-claro").addEventListener("click", descargarSinCifrar);
    cont.querySelector("#c-recuperar").addEventListener("click", restaurar);
    if (demo) cont.querySelector("#c-descargar").hidden = true;
  }

  WA.Copias = { descargar: descargar };
  WA.App.registrar({
    id: "copias", titulo: "Copia de seguridad", orden: 90, pintar: pintar,
    icono: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  });
})(typeof self !== "undefined" ? self : this);

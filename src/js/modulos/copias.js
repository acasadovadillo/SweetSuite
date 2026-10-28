/*
 * ABIES · Gestión — Módulo «Copia de seguridad».
 *
 * La copia cifrada es la bóveda tal cual: se abre con nombre, cargo y las dos
 * contraseñas, así que la puede descargar cualquier usuario. La copia sin
 * cifrar y recuperar copias son solo de la cuenta de administración.
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
    var nombre = WA.Copia.nombreArchivo("ABIES", WA.Fechas.hoy(), cifrada);
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
    var UI = WA.UI, fecha = lectura.creada ? " del " + esc(WA.Fechas.corta(lectura.creada.slice(0, 10))) : "";
    var campos, texto;
    if (lectura.boveda) {
      texto = "<p>Copia de ABIES" + fecha + ". Sustituye <strong>todo</strong>, también los usuarios: se abre con el nombre, el cargo y las contraseñas de cuando se hizo.</p>";
      campos = '<div class="rejilla">' + UI.campo({ nombre: "nombre", etiqueta: "Nombre", requerido: true }) +
        UI.campo({ nombre: "cargo", etiqueta: "Cargo", requerido: true }) + "</div>" +
        UI.campo({ nombre: "contrasena", etiqueta: "Contraseña personal", tipo: "password", requerido: true, atributos: 'autocomplete="off"' }) +
        UI.campo({ nombre: "contrasenaArchivo", etiqueta: "Contraseña del archivo", tipo: "password", requerido: true, atributos: 'autocomplete="off"' });
    } else {
      texto = "<p>Copia " + (lectura.cifrada ? "antigua" : "<strong>sin cifrar</strong>") + fecha + ". Sustituye los datos; los usuarios y las contraseñas de ahora se mantienen.</p>";
      campos = lectura.cifrada ? UI.campo({ nombre: "contrasenaCopia", etiqueta: "Contraseña de la copia", tipo: "password", requerido: true, atributos: 'autocomplete="off"' }) : "";
    }
    var r = await UI.dialogo({
      titulo: "Recuperar copia",
      contenido: texto + '<div class="caja-aviso"><strong>Sustituirá los datos actuales.</strong> Si no estás seguro, descarga antes una copia de lo que tienes ahora.</div>' +
        '<form class="formulario" novalidate>' + campos + "</form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Recuperar", valor: "enviar", estilo: "btn-primario" }],
    });
    if (r.valor !== "enviar") return;
    try {
      var res = await WA.Sesion.restaurar(lectura, r.datos);
      WA.UI.aviso("Copia recuperada" + (res && res.faltan ? ". Faltan " + res.faltan + " adjuntos que no venían en la copia." : "."));
      location.hash = "#/inicio";
      WA.App.repintar();
    } catch (e) {
      WA.UI.aviso(e.codigo === "CONTRASENA" ? "La contraseña de la copia no es correcta." : e.message, "error");
    }
  }

  async function pintar(cont, datos) {
    var demo = WA.Sesion.modo === "demostración", admin = WA.Sesion.esAdmin;
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
      "<p>La copia va <strong>cifrada</strong>: se abre con un nombre, un cargo y las dos contraseñas (la personal y la del archivo). Sin ellas no sirve de nada.</p>" +
      (docs.length ? '<p class="detalle">Incluye ' + docs.length + (docs.length === 1 ? " documento adjunto" : " documentos adjuntos") + " (" + esc(WA.DocsUI.tamanoTexto(pesoDocs)) + "): el archivo de copia ocupará algo más.</p>" : "") +
      '<div class="acciones"><button type="button" class="btn btn-primario" id="c-descargar">Descargar copia cifrada</button>' +
      (admin || demo ? '<button type="button" class="btn btn-secundario" id="c-claro">Descargar sin cifrar…</button>' : "") + "</div></section>" +
      (admin ? '<section class="tarjeta" aria-labelledby="t-recuperar"><h2 id="t-recuperar">Recuperar una copia</h2>' +
        "<p>Abre un archivo de copia para seguir trabajando con él en este navegador.</p>" +
        '<div class="acciones"><button type="button" class="btn btn-secundario" id="c-recuperar">Elegir archivo de copia…</button></div></section>'
        : '<p class="detalle">La copia sin cifrar y recuperar copias son cosa de la cuenta ' + esc(WA.Permisos.NOMBRE_ADMIN) + ".</p>") +
      '<section class="tarjeta" aria-labelledby="t-buenas"><h2 id="t-buenas">Buenas prácticas</h2><ul class="lista">' +
      "<li>Guarda al menos dos copias en sitios distintos, y alguna fuera de este ordenador.</li>" +
      "<li>Guarda las contraseñas aparte de las copias (por ejemplo, en un gestor de contraseñas). Sin ellas, la copia no sirve.</li>" +
      "<li>Las copias contienen datos personales de socios: compártelas solo con quien lleve la gestión.</li>" +
      "<li>Las copias sin cifrar, bórralas en cuanto termines de usarlas.</li>" +
      "</ul><p class=\"detalle\">Se guarda en este navegador con " + esc(tipo) + ".</p></section>";
    cont.querySelector("#c-descargar").addEventListener("click", function () { descargar(true).then(function () { WA.App.repintar(); }); });
    var claro = cont.querySelector("#c-claro"), rec = cont.querySelector("#c-recuperar");
    if (claro) claro.addEventListener("click", descargarSinCifrar);
    if (rec) rec.addEventListener("click", restaurar);
    if (demo) cont.querySelector("#c-descargar").hidden = true;
  }

  WA.Copias = { descargar: descargar };
  WA.App.registrar({
    id: "copias", titulo: "Copia de seguridad", orden: 90, pintar: pintar,
    icono: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  });
})(typeof self !== "undefined" ? self : this);

/*
 * ABIES · Gestión — Módulo «Usuarios» (solo la cuenta de administración).
 *
 * Alta de un usuario por cargo (con una contraseña provisional que cambia al
 * entrar), qué secciones edita cada uno, nueva contraseña si la olvida,
 * desactivar (cambia la clave de los datos) y la contraseña del archivo.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, P = WA.Permisos, F = WA.Fechas;

  function casillasPermisos(marcadas) {
    return '<fieldset class="grupo-permisos"><legend>Puede modificar</legend><p class="campo-ayuda">Todos ven todo. Marca lo que puede cambiar.</p>' +
      P.SECCIONES.map(function (s) {
        return '<label class="casilla"><input type="checkbox" name="perm-' + s[0] + '"' + (marcadas.indexOf(s[0]) >= 0 ? " checked" : "") + "><span>" + esc(s[1]) + "</span></label>";
      }).join("") + "</fieldset>";
  }
  var leerPermisos = function (form) { return P.IDS.filter(function (id) { return form.elements["perm-" + id].checked; }); };
  var listaCargos = '<datalist id="u-cargos">' + P.CARGOS.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("") + "</datalist>";

  function camposProvisional() {
    return UI.campo({ nombre: "pass", etiqueta: "Contraseña provisional", tipo: "password", requerido: true,
      ayuda: "Mínimo 8 caracteres. Díselo en persona o por un canal distinto al de la contraseña del archivo. La cambiará al entrar.", atributos: 'autocomplete="new-password"' }) +
      UI.campo({ nombre: "pass2", etiqueta: "Repítela", tipo: "password", requerido: true, atributos: 'autocomplete="new-password"' });
  }
  function validarProvisional(form) {
    var d = UI.leerFormulario(form), corta = d.pass.length < 8, distintas = d.pass !== d.pass2;
    UI.marcarError(form, "pass", corta ? "Mínimo 8 caracteres." : "");
    UI.marcarError(form, "pass2", !corta && distintas ? "No coinciden." : "");
    return !corta && !distintas;
  }

  async function editar(u) {
    var nuevo = !u;
    var marcadas = nuevo ? [] : u.permisos;
    var r = await UI.dialogo({
      titulo: nuevo ? "Nuevo usuario" : "Editar a " + u.nombre,
      contenido: '<form class="formulario" novalidate><div class="rejilla">' +
        UI.campo({ nombre: "nombre", etiqueta: "Nombre", valor: nuevo ? "" : u.nombre, requerido: true, ayuda: "Como lo escribirá al entrar (sin distinguir mayúsculas ni tildes)." }) +
        UI.campo({ nombre: "cargo", etiqueta: "Cargo", valor: nuevo ? "" : u.cargo, requerido: true, atributos: 'list="u-cargos" autocomplete="off"' }) +
        "</div>" + listaCargos + (nuevo ? camposProvisional() : "") + casillasPermisos(marcadas) + "</form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: nuevo ? "Dar de alta" : "Guardar", valor: "enviar", estilo: "btn-primario" }],
      alAbrir: function (d) {
        // En un alta, al escribir el cargo se proponen sus secciones (hasta que se toque una casilla a mano).
        var form = d.querySelector("form"), tocadas = false;
        form.addEventListener("change", function (e) { if (/^perm-/.test(e.target.name)) tocadas = true; });
        if (nuevo) form.elements.cargo.addEventListener("input", function () {
          if (tocadas) return;
          var def = P.porDefecto(form.elements.cargo.value);
          P.IDS.forEach(function (id) { form.elements["perm-" + id].checked = def.indexOf(id) >= 0; });
        });
      },
      validar: function (form) {
        var d = UI.leerFormulario(form), ok = true;
        UI.marcarError(form, "nombre", d.nombre.trim() ? "" : "Escribe el nombre."); if (!d.nombre.trim()) ok = false;
        UI.marcarError(form, "cargo", d.cargo.trim() ? "" : "Escribe el cargo."); if (!d.cargo.trim()) ok = false;
        if (nuevo && !validarProvisional(form)) ok = false;
        return ok;
      },
    });
    if (r.valor !== "enviar") return;
    var o = { nombre: r.datos.nombre.trim(), cargo: r.datos.cargo.trim(), permisos: leerPermisos(r.form) };
    try {
      if (nuevo) {
        o.contrasena = r.datos.pass;
        await WA.Sesion.anadirUsuario(o);
        UI.aviso(o.nombre + " · " + o.cargo + " ya puede entrar con la contraseña provisional y la del archivo.");
      } else {
        await WA.Sesion.editarUsuario(u.id, o);
        UI.aviso("Usuario actualizado.");
      }
      WA.App.repintar();
    } catch (e) { UI.aviso(e.message, "error"); }
  }

  async function nuevaContrasena(u) {
    var r = await UI.dialogo({
      titulo: (u.activo ? "Nueva contraseña para " : "Reactivar a ") + u.nombre,
      contenido: "<p>" + (u.activo ? "Su contraseña actual dejará de servir." : "Volverá a poder entrar.") + " Entrará con esta provisional y tendrá que elegir la suya.</p>" +
        '<form class="formulario" novalidate>' + camposProvisional() + "</form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: u.activo ? "Poner contraseña" : "Reactivar", valor: "enviar", estilo: "btn-primario" }],
      validar: validarProvisional,
    });
    if (r.valor !== "enviar") return;
    try {
      await WA.Sesion.restablecerContrasena(u.id, r.datos.pass);
      UI.aviso(u.activo ? "Contraseña provisional puesta." : u.nombre + " vuelve a estar activo.");
      WA.App.repintar();
    } catch (e) { UI.aviso(e.message, "error"); }
  }

  async function desactivar(u) {
    var ok = await UI.confirmar(
      "<p><strong>" + esc(u.nombre) + " · " + esc(u.cargo) + "</strong> no podrá volver a entrar.</p>" +
      "<p>Además se cambia la clave que cifra los datos: aunque conserve una copia del archivo, no podrá leer nada de lo que se guarde a partir de ahora. Los demás no notan nada.</p>" +
      '<p class="detalle">Lo que ya tuviera descargado antes sí lo puede seguir leyendo. Si se va de la junta, conviene cambiar también la contraseña del archivo.</p>',
      { titulo: "Desactivar usuario", aceptar: "Desactivar", peligro: true, html: true });
    if (!ok) return;
    try {
      await WA.Sesion.desactivarUsuario(u.id);
      UI.aviso(u.nombre + " desactivado. La clave de los datos ha cambiado.");
      WA.App.repintar();
    } catch (e) { UI.aviso(e.message, "error"); }
  }

  async function contrasenaArchivo() {
    var r = await UI.dialogo({
      titulo: "Cambiar la contraseña del archivo",
      contenido: "<p>La necesitará <strong>toda la junta</strong> para entrar a partir de ahora: comunícala en persona o por un canal seguro. Las copias ya descargadas siguen abriéndose con la de entonces.</p>" +
        '<form class="formulario" novalidate>' +
        UI.campo({ nombre: "actual", etiqueta: "Contraseña del archivo actual", tipo: "password", requerido: true, atributos: 'autocomplete="off"' }) +
        UI.campo({ nombre: "pass", etiqueta: "Nueva contraseña del archivo", tipo: "password", requerido: true, ayuda: "Mínimo 8 caracteres.", atributos: 'autocomplete="new-password"' }) +
        UI.campo({ nombre: "pass2", etiqueta: "Repítela", tipo: "password", requerido: true, atributos: 'autocomplete="new-password"' }) +
        "</form>",
      botones: [{ texto: "Cancelar", valor: "cancelar" }, { texto: "Cambiar", valor: "enviar", estilo: "btn-primario" }],
      validar: validarProvisional,
    });
    if (r.valor !== "enviar") return;
    try {
      await WA.Sesion.cambiarContrasenaArchivo(r.datos.actual, r.datos.pass);
      UI.aviso("Contraseña del archivo cambiada. Descarga una copia nueva y comunícala a la junta.");
    } catch (e) { UI.aviso(e.message, "error"); }
  }

  function pintar(cont) {
    var demo = WA.Sesion.modo === "demostración";
    var lista = WA.Sesion.usuarios().sort(function (a, b) {
      return (b.rol === "admin") - (a.rol === "admin") || (b.activo - a.activo) || a.cargo.localeCompare(b.cargo, "es");
    });
    var yo = WA.Sesion.usuario;
    var edita = function (u) {
      if (u.rol === "admin" || u.permisos.length === P.IDS.length) return "Todo";
      if (!u.permisos.length) return '<span class="detalle">Nada (solo ver)</span>';
      return esc(u.permisos.map(P.nombreSeccion).join(", "));
    };
    cont.innerHTML =
      '<div class="cabecera-pagina"><h1>Usuarios</h1><button type="button" class="btn btn-primario" id="u-nuevo">Nuevo usuario</button></div>' +
      '<p class="intro">Cada miembro de la junta entra con su nombre, su cargo, su contraseña y la contraseña del archivo. Todos ven todo; cada uno modifica lo de su cargo.</p>' +
      (demo ? '<div class="caja-aviso">En la demostración los cambios de usuarios no se guardan ni usan contraseñas.</div>' : "") +
      '<section class="tarjeta"><div class="tabla-envoltorio"><table class="tabla"><thead><tr><th scope="col">Usuario</th><th scope="col">Puede modificar</th>' +
      '<th scope="col">Último acceso</th><th scope="col" class="celda-acciones"><span class="sr">Acciones</span></th></tr></thead><tbody>' +
      lista.map(function (u) {
        var estado = !u.activo ? '<span class="estado estado-neutro">Desactivado</span>' : u.debeCambiar ? '<span class="estado estado-aviso">Contraseña provisional</span>' : "";
        var acciones = u.rol === "admin"
          ? '<button type="button" class="btn btn-pequeno btn-secundario" data-pass="' + esc(u.id) + '">Cambiar contraseña</button>'
          : u.activo
            ? '<button type="button" class="btn btn-pequeno btn-secundario" data-editar="' + esc(u.id) + '">Editar</button>' +
              '<button type="button" class="btn btn-pequeno btn-secundario" data-pass="' + esc(u.id) + '">Nueva contraseña</button>' +
              '<button type="button" class="btn btn-pequeno btn-peligro-suave" data-desactivar="' + esc(u.id) + '">Desactivar</button>'
            : '<button type="button" class="btn btn-pequeno btn-secundario" data-pass="' + esc(u.id) + '">Reactivar…</button>';
        return '<tr' + (u.activo ? "" : ' class="fila-apagada"') + '><th scope="row">' + esc(u.nombre) + (yo && u.id === yo.id ? ' <span class="etiqueta">Tú</span>' : "") +
          '<br><span class="detalle">' + esc(u.cargo) + "</span> " + estado + "</th><td>" + edita(u) + "</td>" +
          "<td>" + (u.ultimoAcceso ? esc(F.corta(u.ultimoAcceso.slice(0, 10))) + ' <span class="detalle">' + esc(u.ultimoAcceso.slice(11, 16)) + "</span>" : '<span class="detalle">Nunca</span>') + "</td>" +
          '<td class="celda-acciones celda-botones"><div class="botones-fila">' + acciones + "</div></td></tr>";
      }).join("") + "</tbody></table></div></section>" +

      '<section class="tarjeta" aria-labelledby="t-archivo"><h2 id="t-archivo">Contraseña del archivo</h2>' +
      "<p>Es la segunda llave: sin ella nadie entra, tenga la contraseña personal que tenga. La conoce toda la junta.</p>" +
      '<div class="acciones"><button type="button" class="btn btn-secundario" id="u-archivo"' + (demo ? " disabled" : "") + ">Cambiar la contraseña del archivo…</button></div></section>" +

      '<section class="tarjeta" aria-labelledby="t-seg"><h2 id="t-seg">Cómo protege los datos</h2><ul class="lista">' +
      "<li>Los datos van cifrados. Para abrirlos hacen falta <strong>las dos contraseñas</strong>: la personal de cada usuario y la del archivo.</li>" +
      "<li>Nadie, tampoco la cuenta " + esc(P.NOMBRE_ADMIN) + ", conoce la contraseña personal de otro: solo puede ponerle una provisional.</li>" +
      "<li>Al desactivar a alguien cambia la clave de los datos, sin pedir contraseñas a los demás.</li>" +
      "<li>Lo que puede modificar cada cargo lo controla la aplicación. Sin servidor, alguien con conocimientos técnicos y credenciales válidas podría saltárselo: para una junta de confianza es suficiente.</li>" +
      "</ul></section>";

    cont.querySelector("#u-nuevo").addEventListener("click", function () { editar(null); });
    cont.querySelector("#u-archivo").addEventListener("click", contrasenaArchivo);
    var porId = function (id) { return lista.filter(function (u) { return u.id === id; })[0]; };
    cont.querySelectorAll("[data-editar]").forEach(function (b) { b.addEventListener("click", function () { editar(porId(b.getAttribute("data-editar"))); }); });
    cont.querySelectorAll("[data-desactivar]").forEach(function (b) { b.addEventListener("click", function () { desactivar(porId(b.getAttribute("data-desactivar"))); }); });
    cont.querySelectorAll("[data-pass]").forEach(function (b) {
      b.addEventListener("click", function () {
        var u = porId(b.getAttribute("data-pass"));
        if (yo && u.id === yo.id) WA.Ajustes.cambiarMiContrasena(); else nuevaContrasena(u);
      });
    });
  }

  WA.App.registrar({
    id: "usuarios", titulo: "Usuarios", orden: 85, soloAdmin: true, pintar: pintar,
    icono: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18.5 14.5a6.5 6.5 0 0 1 3 5.5"/>',
  });
})(typeof self !== "undefined" ? self : this);

/*
 * webkit_asociaciones — Utilidades de interfaz compartidas por todos los módulos.
 *
 *   esc(texto)            escapa texto antes de meterlo en HTML. ÚSALO SIEMPRE con
 *                         cualquier dato que haya escrito una persona: evita que un
 *                         nombre como «<script>…» se ejecute.
 *   campo({...})          HTML de un campo de formulario accesible (etiqueta, ayuda, error)
 *   leerFormulario(form)  objeto { nombre: valor } con los campos de un <form>
 *   marcarError(form, nombre, mensaje)  enseña (o quita) el error de un campo
 *   aviso(texto, tipo)    mensaje breve abajo a la derecha (se lee en voz alta)
 *   dialogo({...})        ventana modal; devuelve una promesa con el botón pulsado
 *   confirmar(texto, {peligro})  atajo de dialogo() con Cancelar / Aceptar
 *   descargar(nombre, contenido, tipo)  baja un archivo generado aquí mismo
 *   elegirArchivo(accept, binario) abre el selector de archivos y devuelve su texto (o sus bytes)
 */
(function (raiz) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var contador = 0;
  /**
   * opciones: { nombre, etiqueta, tipo ("text", "email", "date", "textarea", "select"…),
   *             valor, ayuda, requerido, opciones (para select: [valor] o [[valor, texto]]),
   *             lista (sugerencias que se ofrecen al escribir, sin obligar a elegirlas),
   *             atributos (texto extra), ancho ("completo" ocupa toda la fila),
   *             clase (clases extra de la caja, p. ej. "col-3" dentro de una .rejilla-12) }
   */
  function campo(o) {
    var id = "campo-" + o.nombre.replace(/[^a-z0-9]/gi, "-") + "-" + (++contador);
    var ayudaId = id + "-ayuda", errorId = id + "-error";
    var describe = (o.ayuda ? ayudaId + " " : "") + errorId;
    var comunes = 'id="' + id + '" name="' + esc(o.nombre) + '" aria-describedby="' + describe + '"' +
      (o.lista ? ' list="' + id + '-lista"' : "") +
      (o.requerido ? " required" : "") + (o.atributos ? " " + o.atributos : "");
    var control;
    if (o.tipo === "textarea") {
      control = "<textarea " + comunes + ' rows="' + (o.filas || 3) + '">' + esc(o.valor) + "</textarea>";
    } else if (o.tipo === "select") {
      control = "<select " + comunes + ">" + (o.opciones || []).map(function (op) {
        var v = Array.isArray(op) ? op[0] : op, t = Array.isArray(op) ? op[1] : op;
        return '<option value="' + esc(v) + '"' + (String(v) === String(o.valor == null ? "" : o.valor) ? " selected" : "") + ">" + esc(t) + "</option>";
      }).join("") + "</select>";
    } else {
      control = '<input type="' + (o.tipo || "text") + '" ' + comunes + ' value="' + esc(o.valor) + '">';
      if (o.lista) control += '<datalist id="' + id + '-lista">' + o.lista.map(function (v) { return '<option value="' + esc(v) + '">'; }).join("") + "</datalist>";
    }
    var clases = (o.ancho === "completo" ? " campo-completo" : "") + (o.clase ? " " + o.clase : "");
    return '<div class="campo' + clases + '" data-campo="' + esc(o.nombre) + '">' +
      '<label for="' + id + '">' + esc(o.etiqueta) + (o.requerido ? ' <span class="obligatorio" aria-hidden="true">*</span>' : "") + "</label>" +
      control +
      (o.ayuda ? '<p class="campo-ayuda" id="' + ayudaId + '">' + esc(o.ayuda) + "</p>" : "") +
      '<p class="campo-error" id="' + errorId + '" aria-live="polite"></p></div>';
  }

  function leerFormulario(form) {
    var datos = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === "submit" || el.type === "button") return;
      if (el.type === "radio") { if (el.checked) datos[el.name] = el.value; return; } // solo cuenta la opción marcada
      datos[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
    });
    return datos;
  }

  function marcarError(form, nombre, mensaje) {
    var caja = form.querySelector('[data-campo="' + nombre + '"]');
    if (!caja) return;
    var control = caja.querySelector("input, select, textarea");
    caja.querySelector(".campo-error").textContent = mensaje || "";
    caja.classList.toggle("con-error", !!mensaje);
    if (control) control.setAttribute("aria-invalid", mensaje ? "true" : "false");
  }

  function aviso(texto, tipo) {
    var zona = document.getElementById("avisos");
    if (!zona) return;
    var el = document.createElement("div");
    el.className = "aviso aviso-" + (tipo || "ok");
    el.setAttribute("role", tipo === "error" ? "alert" : "status");
    el.textContent = texto;
    zona.appendChild(el);
    setTimeout(function () { el.classList.add("saliendo"); }, tipo === "error" ? 7000 : 3000);
    setTimeout(function () { el.remove(); }, tipo === "error" ? 7400 : 3400);
  }

  /**
   * Ventana modal accesible con <dialog> (atrapa el foco y se cierra con Esc).
   * opciones: { titulo, contenido (HTML), botones: [{ texto, valor, estilo }], alAbrir(dialogo) }
   * Si el contenido tiene un <form>, al enviarlo se resuelve con { valor: "enviar", form }
   * — pero solo si opciones.validar(form) no devuelve false.
   */
  function dialogo(o) {
    return new Promise(function (resolver) {
      var d = document.createElement("dialog");
      d.className = "dialogo";
      d.setAttribute("aria-labelledby", "dialogo-titulo");
      d.innerHTML = '<div class="dialogo-cabecera"><h2 id="dialogo-titulo">' + esc(o.titulo) + "</h2>" +
        '<button type="button" class="btn-icono" data-valor="cancelar" aria-label="Cerrar">✕</button></div>' +
        '<div class="dialogo-cuerpo">' + (o.contenido || "") + "</div>" +
        ((o.botones || []).length ? '<div class="dialogo-botones">' + o.botones.map(function (b) {
          return '<button type="' + (b.valor === "enviar" ? "submit" : "button") + '" class="btn ' + (b.estilo || "btn-secundario") + '" data-valor="' + esc(b.valor) + '"' +
            (b.valor === "enviar" && d ? ' form="dialogo-form"' : "") + ">" + esc(b.texto) + "</button>";
        }).join("") + "</div>" : "");
      document.body.appendChild(d);
      var hecho = false;
      function cerrar(resultado) {
        if (hecho) return;
        hecho = true;
        d.close();
        d.remove();
        resolver(resultado);
      }
      d.addEventListener("click", function (e) {
        var b = e.target.closest("[data-valor]");
        if (b && b.type !== "submit") cerrar({ valor: b.getAttribute("data-valor") });
      });
      d.addEventListener("cancel", function (e) { e.preventDefault(); cerrar({ valor: "cancelar" }); });
      var form = d.querySelector("form");
      if (form) {
        form.id = "dialogo-form";
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          if (o.validar && o.validar(form) === false) return;
          cerrar({ valor: "enviar", form: form, datos: leerFormulario(form) });
        });
      }
      d.showModal();
      var primero = d.querySelector(".dialogo-cuerpo input, .dialogo-cuerpo select, .dialogo-cuerpo textarea") ||
        d.querySelector(".dialogo-botones .btn-primario, .dialogo-botones .btn-peligro");
      if (primero) primero.focus();
      if (o.alAbrir) o.alAbrir(d);
    });
  }

  /**
   * Quién creó y quién cambió por última vez un registro (lo apunta el repositorio
   * desde la Fase 7a). Devuelve "" si el registro es anterior a los usuarios.
   */
  function firma(r) {
    if (!r || (!r.creadoPor && !r.modificadoPor)) return "";
    var F = raiz.WA.Fechas;
    var cuando = function (iso) { return iso ? F.corta(String(iso).slice(0, 10)) + " " + String(iso).slice(11, 16) : ""; };
    var partes = [];
    if (r.creadoPor) partes.push("Creado por " + esc(r.creadoPor) + (r.creado ? " el " + esc(cuando(r.creado)) : ""));
    if (r.modificadoPor && r.modificado !== r.creado) partes.push("último cambio de " + esc(r.modificadoPor) + " el " + esc(cuando(r.modificado)));
    return '<p class="detalle firma-registro">' + partes.join(" · ") + "</p>";
  }

  function confirmar(texto, opciones) {
    var o = opciones || {};
    return dialogo({
      titulo: o.titulo || "¿Seguro?",
      contenido: o.html ? texto : "<p>" + esc(texto) + "</p>",   // html: solo con texto propio, nunca con datos sin escapar
      botones: [
        { texto: o.cancelar || "Cancelar", valor: "cancelar" },
        { texto: o.aceptar || "Aceptar", valor: "aceptar", estilo: o.peligro ? "btn-peligro" : "btn-primario" },
      ],
    }).then(function (r) { return r.valor === "aceptar"; });
  }

  function descargar(nombre, contenido, tipo) {
    var blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo || "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /**
   * Abre el selector de archivos. Devuelve { nombre, texto } o, con binario = true,
   * { nombre, bytes: Uint8Array } (para leer un Excel). null si se cancela.
   */
  function elegirArchivo(accept, binario) {
    return new Promise(function (resolver) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = accept || "";
      input.addEventListener("change", function () {
        var f = input.files && input.files[0];
        if (!f) return resolver(null);
        var lector = new FileReader();
        lector.onload = function () {
          resolver(binario ? { nombre: f.name, tipo: f.type || "", bytes: new Uint8Array(lector.result) } : { nombre: f.name, texto: String(lector.result) });
        };
        lector.onerror = function () { resolver(null); };
        if (binario) lector.readAsArrayBuffer(f); else lector.readAsText(f, "utf-8");
      });
      input.click();
    });
  }

  (raiz.WA = raiz.WA || {}).UI = {
    esc: esc, campo: campo, leerFormulario: leerFormulario, marcarError: marcarError,
    aviso: aviso, dialogo: dialogo, confirmar: confirmar, firma: firma, descargar: descargar, elegirArchivo: elegirArchivo,
  };
})(typeof self !== "undefined" ? self : this);

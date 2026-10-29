/*
 * Agora — Convocatorias de asambleas y reuniones (sin interfaz: tests/convocatorias.test.js).
 *
 * CONVOCATORIA:
 *   { id, organoId, tipoSesion: "ordinaria" | "extraordinaria", fecha, hora,
 *     horaSegunda (segunda convocatoria, sobre todo en las asambleas),
 *     lugar, modalidad: "presencial" | "en línea" | "mixta", enlace (si es en línea),
 *     ordenDelDia: [texto], convoca (quién firma: «La Presidencia, Ana Pérez»),
 *     notas, estado: "borrador" | "enviada", enviada (fecha), actaId }
 *
 * Con ella se hace la carta para imprimir o pasar a PDF, el correo (desde el
 * correo de cada uno: Agora no manda nada), el evento para el calendario
 * (.ics) y, cuando se celebra, el borrador del acta con su orden del día.
 *
 * A quién va: la asamblea, a los socios activos; el resto de órganos, a la
 * junta vigente. Plazos y forma de convocar los dicen los ESTATUTOS (y la Ley
 * Orgánica 1/2002): verificar con asesoría.
 */
(function (raiz, fabrica) {
  var r = typeof require === "function";
  var modulo = fabrica(r ? require("../nucleo/fechas.js") : raiz.WA.Fechas, r ? require("./actas.js") : raiz.WA.Actas,
    r ? require("./socios.js") : raiz.WA.Socios);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Convocatorias = modulo;
})(typeof self !== "undefined" ? self : this, function (F, Ac, S) {
  "use strict";

  var esAsamblea = function (organo) { return !!organo && organo.tipo === "asamblea"; };

  /** Una convocatoria nueva: dentro de quince días, con el orden del día de la plantilla del órgano. */
  function vacia(organo, ahora) {
    return {
      organoId: organo ? organo.id : "", tipoSesion: "ordinaria", fecha: F.sumarDias(F.hoy(ahora), 15), hora: "18:00",
      horaSegunda: esAsamblea(organo) ? "18:30" : "", lugar: "", modalidad: "presencial", enlace: "",
      ordenDelDia: Ac.plantilla(organo, "ordinaria").map(function (p) { return p.titulo; }),
      convoca: "", notas: "", estado: "borrador", enviada: "", actaId: "",
    };
  }

  /** Lo que falta para enviarla (vacía si está bien). */
  function revisar(c) {
    var p = [];
    if (!c.organoId) p.push("Elige el órgano.");
    if (!F.esValida(c.fecha)) p.push("Falta la fecha.");
    if (!/^\d{2}:\d{2}$/.test(String(c.hora || ""))) p.push("Falta la hora.");
    if (c.modalidad !== "en línea" && !String(c.lugar || "").trim()) p.push("Falta el lugar.");
    if (c.modalidad !== "presencial" && !String(c.enlace || "").trim()) p.push("Falta el enlace de la reunión en línea.");
    if (!(c.ordenDelDia || []).some(function (x) { return String(x).trim(); })) p.push("El orden del día está vacío.");
    if (!String(c.convoca || "").trim()) p.push("Di quién convoca (normalmente, la Presidencia).");
    return p;
  }

  var sesion = function (c, organo) {
    return (c.tipoSesion === "extraordinaria" ? "extraordinaria" : "ordinaria") + " de " + (organo ? organo.nombre : "");
  };

  /** El asunto del correo: «Convocatoria: Asamblea General ordinaria · 12 de noviembre de 2026». */
  function asunto(c, organo) {
    return "Convocatoria: " + (organo ? organo.nombre : "Reunión") + " " + (c.tipoSesion === "extraordinaria" ? "extraordinaria" : "ordinaria") +
      " · " + F.larga(c.fecha);
  }

  /** El texto de la convocatoria, para el correo o para copiar. */
  function texto(c, organo, asociacion) {
    var a = asociacion || {};
    var donde = c.modalidad === "en línea" ? "en línea" : "en " + (c.lugar || "…") + (c.modalidad === "mixta" ? " (también en línea)" : "");
    var lineas = [
      (a.nombre ? a.nombre + "\n\n" : "") + "Se convoca la reunión " + sesion(c, organo) + ", que se celebrará el " + F.larga(c.fecha) +
        " a las " + c.hora + " horas" + (c.horaSegunda ? " en primera convocatoria y a las " + c.horaSegunda + " en segunda" : "") + ", " + donde + ".",
    ];
    if (c.modalidad !== "presencial" && c.enlace) lineas.push("Enlace para conectarse: " + c.enlace);
    lineas.push("ORDEN DEL DÍA\n" + (c.ordenDelDia || []).filter(function (x) { return String(x).trim(); })
      .map(function (x, i) { return (i + 1) + ". " + String(x).trim(); }).join("\n"));
    if (String(c.notas || "").trim()) lineas.push(String(c.notas).trim());
    lineas.push(c.convoca || "");
    return lineas.join("\n\n").trim() + "\n";
  }

  /**
   * A quién va: { correos: [..], sinCorreo: [nombres] }. La asamblea, a los
   * socios activos en la fecha de la reunión; el resto, a la junta vigente.
   */
  function destinatarios(c, organo, socios, junta) {
    var personas = esAsamblea(organo)
      ? (socios || []).filter(function (s) { return S.activoEn(s, c.fecha); }).map(function (s) { return { nombre: S.nombreCompleto(s), email: s.email }; })
      : (junta || []).filter(function (j) { return (!j.desde || j.desde <= c.fecha) && (!j.hasta || j.hasta >= c.fecha); })
        .map(function (j) { return { nombre: j.nombre, email: j.email }; });
    var vistos = {}, correos = [], sinCorreo = [];
    personas.forEach(function (p) {
      var e = String(p.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { sinCorreo.push(p.nombre); return; }
      if (!vistos[e]) { vistos[e] = true; correos.push(e); }
    });
    return { correos: correos, sinCorreo: sinCorreo };
  }

  /**
   * El enlace que abre el programa de correo con la convocatoria escrita y los
   * destinatarios en copia oculta. Con muchos, el enlace sería demasiado largo
   * para algunos programas: entonces va sin ellos (se copian aparte).
   */
  var LARGO_MAXIMO = 1900;
  function mailto(asuntoTxt, cuerpo, correos) {
    var sin = "mailto:?subject=" + encodeURIComponent(asuntoTxt) + "&body=" + encodeURIComponent(cuerpo);
    if (!(correos || []).length) return { url: sin, conDestinatarios: false };
    var con = "mailto:?bcc=" + correos.map(encodeURIComponent).join(",") + "&subject=" + encodeURIComponent(asuntoTxt) + "&body=" + encodeURIComponent(cuerpo);
    return con.length <= LARGO_MAXIMO ? { url: con, conDestinatarios: true } : { url: sin, conDestinatarios: false };
  }

  /** La reunión como evento (para Actividades.ics): dos horas, por poner algo. */
  function aEvento(c, organo) {
    var h = String(c.hora || "18:00"), fin = String((+h.slice(0, 2) + 2) % 24).padStart(2, "0") + h.slice(2);
    return {
      id: c.id || "convocatoria", titulo: (organo ? organo.nombre : "Reunión") + " (" + (c.tipoSesion === "extraordinaria" ? "extraordinaria" : "ordinaria") + ")",
      inicio: c.fecha + "T" + h, fin: fin > h ? c.fecha + "T" + fin : "", todoElDia: false,
      lugar: c.modalidad === "en línea" ? c.enlace : c.lugar,
      descripcion: "Orden del día:\n" + (c.ordenDelDia || []).filter(function (x) { return String(x).trim(); }).map(function (x, i) { return (i + 1) + ". " + x; }).join("\n") +
        (c.modalidad !== "presencial" && c.enlace ? "\nEnlace: " + c.enlace : ""),
    };
  }

  /** El borrador del acta de la reunión convocada. */
  function aActa(c, organo) {
    var a = Ac.vacia(organo);
    return Object.assign(a, {
      organoId: c.organoId, tipoSesion: c.tipoSesion, fecha: c.fecha, horaInicio: c.hora, lugar: c.modalidad === "en línea" ? "En línea" : c.lugar,
      modalidad: c.modalidad, convocatoria: c.horaSegunda ? "" : "primera", convocatoriaId: c.id || "",
      ordenDelDia: (c.ordenDelDia || []).filter(function (x) { return String(x).trim(); }).map(function (x) { return Ac.punto(String(x).trim()); }),
    });
  }

  return { vacia: vacia, revisar: revisar, asunto: asunto, texto: texto, destinatarios: destinatarios, mailto: mailto, aEvento: aEvento, aActa: aActa,
    LARGO_MAXIMO: LARGO_MAXIMO };
});

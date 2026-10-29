/*
 * Agora — Libro de actas (sin interfaz: tests/gobierno.test.js).
 *
 * ÓRGANOS (configurables en config.organos): { id, nombre, prefijo, tipo }
 *   tipo: "junta" | "coordinacion" | "asamblea" | "departamento" | "otro"
 *   Cada departamento que se reúna se añade como un órgano más.
 *
 * ACTA:
 *   { id, organoId, numero, tipoSesion: "ordinaria" | "extraordinaria", fecha,
 *     horaInicio, horaFin, lugar, modalidad: "presencial" | "en línea" | "mixta",
 *     convocatoria: "primera" | "segunda" | "", presidencia, secretaria,
 *     asistentes: [{ nombre, socioId, cargo }], excusan (texto), invitados (texto),
 *     ordenDelDia: [{ id, titulo, desarrollo,
 *                     acuerdos: [{ id, texto, resultado: "aprobado" | "rechazado" | "",
 *                                  votacion: "unanimidad" | "asentimiento" | "votacion" | "",
 *                                  favor, contra, abstencion }] }],
 *     ruegos, estado: "borrador" | "aprobada", aprobacion (texto: cuándo y dónde se aprobó),
 *     notas }
 *
 * Qué debe contener un acta, quién la firma, cómo se aprueba y qué mayorías
 * hacen falta lo dicen los ESTATUTOS y la Ley Orgánica 1/2002: verificar con
 * asesoría. La aplicación no decide si un acuerdo sale aprobado: se anota.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function" ? { Fechas: require("../nucleo/fechas.js") } : { Fechas: raiz.WA.Fechas };
  var modulo = fabrica(dep.Fechas);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Actas = modulo;
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  var TIPOS_ORGANO = [["junta", "Junta directiva"], ["coordinacion", "Coordinación"], ["asamblea", "Asamblea"], ["departamento", "Departamento"], ["otro", "Otro"]];

  function organosPorDefecto() {
    return [
      { id: "junta", nombre: "Junta Directiva", prefijo: "JD", tipo: "junta" },
      { id: "coordinacion", nombre: "Coordinación", prefijo: "CO", tipo: "coordinacion" },
      { id: "asamblea", nombre: "Asamblea General", prefijo: "AG", tipo: "asamblea" },
    ];
  }

  var nuevoId = function () {
    return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "x-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };
  var punto = function (titulo) { return { id: nuevoId(), titulo: titulo, desarrollo: "", acuerdos: [] }; };

  /**
   * Orden del día de partida según el órgano y el tipo de sesión. Es solo un
   * punto de partida: se edita libremente (y debe ajustarse a los estatutos).
   */
  function plantilla(organo, tipoSesion) {
    var t = (organo && organo.tipo) || "otro";
    var lista;
    if (t === "asamblea" && tipoSesion !== "extraordinaria") {
      lista = ["Lectura y aprobación, si procede, del acta de la sesión anterior", "Memoria de actividades del ejercicio",
        "Examen y aprobación, si procede, de las cuentas del ejercicio", "Aprobación, si procede, del presupuesto del ejercicio",
        "Ruegos y preguntas"];
    } else if (t === "asamblea") {
      lista = ["Lectura y aprobación, si procede, del acta de la sesión anterior", "(Asunto que motiva la convocatoria extraordinaria)", "Ruegos y preguntas"];
    } else if (t === "junta") {
      lista = ["Lectura y aprobación, si procede, del acta de la reunión anterior", "Estado de tesorería", "Altas y bajas de socios", "Actividades", "Ruegos y preguntas"];
    } else if (t === "coordinacion") {
      lista = ["Revisión de acuerdos y tareas pendientes", "Coordinación entre departamentos", "Calendario de actividades", "Varios"];
    } else if (t === "departamento") {
      lista = ["Seguimiento de tareas", "Propuestas del departamento", "Varios"];
    } else {
      lista = ["Asuntos a tratar", "Ruegos y preguntas"];
    }
    return lista.map(punto);
  }

  function vacia(organo, ahora) {
    return { organoId: organo ? organo.id : "", numero: "", tipoSesion: "ordinaria", fecha: F.hoy(ahora), horaInicio: "18:00", horaFin: "",
      lugar: "", modalidad: "presencial", convocatoria: "", presidencia: "", secretaria: "", asistentes: [], excusan: "", invitados: "",
      ordenDelDia: plantilla(organo, "ordinaria"), ruegos: "", estado: "borrador", aprobacion: "", notas: "" };
  }

  /**
   * Número de la siguiente acta de un órgano:
   *   anual       «JD-2026-01» (vuelve a 01 cada año)
   *   correlativa «JD-15» (sin reiniciar)
   * Se calcula con las actas que ya tienen número, así nunca se repite.
   */
  function siguienteNumero(actas, organo, anio, numeracion) {
    var pre = (organo.prefijo || "ACTA").toUpperCase();
    var anual = numeracion !== "correlativa";
    var base = anual ? pre + "-" + anio + "-" : pre + "-";
    var max = 0;
    (actas || []).forEach(function (a) {
      if (a.organoId !== organo.id || !a.numero || a.numero.indexOf(base) !== 0) return;
      var resto = a.numero.slice(base.length);
      if (!/^\d+$/.test(resto)) return;
      max = Math.max(max, parseInt(resto, 10));
    });
    return base + String(max + 1).padStart(2, "0");
  }

  /** Problemas que impiden dar el acta por terminada (vacía si está bien). */
  function revisar(a) {
    var p = [];
    if (!a.organoId) p.push("Elige el órgano.");
    if (!F.esValida(a.fecha)) p.push("Falta la fecha.");
    if (!String(a.presidencia || "").trim()) p.push("Indica quién preside.");
    if (!String(a.secretaria || "").trim()) p.push("Indica quién hace de secretario/a.");
    if (!(a.ordenDelDia || []).some(function (x) { return String(x.titulo || "").trim(); })) p.push("El orden del día está vacío.");
    return p;
  }

  /** «Aprobado por unanimidad», «Aprobado: 10 a favor, 2 en contra y 1 abstención»… */
  function textoVotacion(ac) {
    var res = ac.resultado === "rechazado" ? "Rechazado" : ac.resultado === "aprobado" ? "Aprobado" : "";
    if (ac.votacion === "unanimidad") return (res || "Aprobado") + " por unanimidad";
    if (ac.votacion === "asentimiento") return (res || "Aprobado") + " por asentimiento";
    if (ac.votacion === "votacion") {
      var n = function (x, s, p) { x = +x || 0; return x + " " + (x === 1 ? s : p); };
      var v = n(ac.favor, "a favor", "a favor") + ", " + n(ac.contra, "en contra", "en contra") + " y " + n(ac.abstencion, "abstención", "abstenciones");
      return (res ? res + ": " : "") + v;
    }
    return res;
  }

  /** Todos los acuerdos de todas las actas, del más reciente al más antiguo (libro de acuerdos). */
  function acuerdos(actas, organos) {
    var porId = {};
    (organos || []).forEach(function (o) { porId[o.id] = o; });
    var out = [];
    (actas || []).forEach(function (a) {
      (a.ordenDelDia || []).forEach(function (p, i) {
        (p.acuerdos || []).forEach(function (ac) {
          if (!String(ac.texto || "").trim()) return;
          out.push({ actaId: a.id, numero: a.numero, fecha: a.fecha, organo: (porId[a.organoId] || {}).nombre || "", punto: i + 1,
            tituloPunto: p.titulo, texto: ac.texto, votacion: textoVotacion(ac), resultado: ac.resultado || "" });
        });
      });
    });
    return out.sort(function (x, y) { return String(y.fecha).localeCompare(String(x.fecha)) || String(y.numero).localeCompare(String(x.numero)); });
  }

  /** El acta como texto, para copiar en un correo o en un documento. */
  function textoPlano(a, organo, asociacion) {
    var l = [];
    var nombreOrg = (organo && organo.nombre) || "";
    l.push((asociacion && asociacion.nombre ? asociacion.nombre.toUpperCase() + "\n" : "") +
      "ACTA " + (a.numero ? "N.º " + a.numero + " " : "") + "DE LA REUNIÓN " + (a.tipoSesion === "extraordinaria" ? "EXTRAORDINARIA " : "ORDINARIA ") + "DE " + nombreOrg.toUpperCase());
    l.push("");
    var cuando = F.larga(a.fecha) + (a.horaInicio ? ", a las " + a.horaInicio + " horas" : "") + (a.convocatoria ? ", en " + a.convocatoria + " convocatoria" : "");
    l.push("En " + (a.lugar || "(lugar)") + (a.modalidad && a.modalidad !== "presencial" ? " (modalidad " + a.modalidad + ")" : "") + ", el " + cuando + ", se reúne " +
      (nombreOrg ? "la " + nombreOrg : "el órgano") + ", presidida por " + (a.presidencia || "(presidencia)") + " y actuando como secretario/a " + (a.secretaria || "(secretaría)") + ".");
    l.push("");
    var asist = (a.asistentes || []).map(function (x) { return x.nombre + (x.cargo ? " (" + x.cargo + ")" : ""); });
    l.push("Asistentes (" + asist.length + "): " + (asist.join(", ") || "—") + ".");
    if (a.excusan) l.push("Excusan su asistencia: " + a.excusan + ".");
    if (a.invitados) l.push("Invitados: " + a.invitados + ".");
    l.push("");
    l.push("ORDEN DEL DÍA");
    (a.ordenDelDia || []).forEach(function (p, i) { l.push((i + 1) + ". " + p.titulo); });
    l.push("");
    l.push("DESARROLLO DE LA SESIÓN Y ACUERDOS");
    (a.ordenDelDia || []).forEach(function (p, i) {
      l.push("");
      l.push((i + 1) + ". " + p.titulo);
      if (p.desarrollo) l.push(p.desarrollo);
      (p.acuerdos || []).forEach(function (ac, k) {
        if (!String(ac.texto || "").trim()) return;
        var v = textoVotacion(ac);
        l.push("Acuerdo " + (i + 1) + "." + (k + 1) + ": " + ac.texto + (v ? " (" + v + ")" : ""));
      });
    });
    if (a.ruegos) { l.push(""); l.push("Ruegos y preguntas: " + a.ruegos); }
    l.push("");
    l.push("Y no habiendo más asuntos que tratar, se levanta la sesión" + (a.horaFin ? " a las " + a.horaFin + " horas" : "") + ", de lo que como secretario/a doy fe, con el visto bueno de la presidencia.");
    l.push("");
    l.push("Vº Bº La Presidencia                    La Secretaría");
    l.push(String(a.presidencia || "") + "                    " + String(a.secretaria || ""));
    return l.join("\n");
  }

  return {
    TIPOS_ORGANO: TIPOS_ORGANO, organosPorDefecto: organosPorDefecto, plantilla: plantilla, vacia: vacia, punto: punto, nuevoId: nuevoId,
    siguienteNumero: siguienteNumero, revisar: revisar, textoVotacion: textoVotacion, acuerdos: acuerdos, textoPlano: textoPlano,
  };
});

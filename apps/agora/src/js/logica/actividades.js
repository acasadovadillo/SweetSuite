/*
 * Agora — Lógica de actividades (sin interfaz: tests/actividades.test.js).
 *
 * ACTIVIDAD:
 *   { id, titulo, tipo, descripcion, inicio ("aaaa-mm-ddThh:mm"), fin, todoElDia,
 *     lugar, responsable, abierta: "todos" | "socios",
 *     aforo (0 = sin límite), listaEspera, precioSocio, precioGeneral (céntimos),
 *     autorizacionMenores (si los menores necesitan autorización firmada),
 *     proyectoId, estado: "prevista" | "realizada" | "cancelada", notas,
 *     inscripciones: [INSCRIPCIÓN] }
 *
 * INSCRIPCIÓN:
 *   { id, socioId (si es socio), nombre, contacto, esMenor (no socios; en los socios
 *     se calcula con su fecha de nacimiento), autorizacion (sí/no),
 *     estado: "inscrita" | "espera" | "cancelada", fecha (marca de tiempo: decide
 *     el orden de la lista de espera), importe (céntimos, fijado al inscribirse),
 *     pago: { fecha, forma, cuentaId, referencia } | null, asistio: true | false | null, notas }
 *
 * CONTABILIDAD: igual que las cuotas, una inscripción PAGADA es un ingreso
 * (categoría «Inscripciones a actividades»). aMovimientos() la traduce a
 * movimiento; la tesorería la cuenta salvo que un movimiento del banco ya la
 * enlace (inscripcionIds), para no contarla dos veces.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { Fechas: require("../nucleo/fechas.js"), Dinero: require("../nucleo/dinero.js"), Socios: require("./socios.js") }
    : { Fechas: raiz.WA.Fechas, Dinero: raiz.WA.Dinero, Socios: raiz.WA.Socios };
  var modulo = fabrica(dep.Fechas, dep.Dinero, dep.Socios);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Actividades = modulo;
})(typeof self !== "undefined" ? self : this, function (F, D, S) {
  "use strict";

  var CATEGORIA_INSCRIPCIONES = "inscripciones";
  var ESTADOS = { prevista: "Prevista", realizada: "Realizada", cancelada: "Cancelada" };
  var TIPOS = ["Charla", "Taller", "Salida de campo", "Curso", "Reunión", "Voluntariado", "Exposición", "Fiesta o encuentro", "Otra"];

  function vacia(ahora) {
    var hoy = F.hoy(ahora);
    return { titulo: "", tipo: "", descripcion: "", inicio: hoy + "T18:00", fin: hoy + "T20:00", todoElDia: false,
      lugar: "", responsable: "", abierta: "todos", aforo: 0, listaEspera: true, precioSocio: 0, precioGeneral: 0,
      autorizacionMenores: false, proyectoId: "", estado: "prevista", notas: "", inscripciones: [] };
  }

  var nuevoId = function () {
    return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "i-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };
  var copia = function (x) { return JSON.parse(JSON.stringify(x)); };
  var fechaDe = function (a) { return String(a.inicio || "").slice(0, 10); };

  /** ¿Es menor de edad el día de la actividad? (socios: por su fecha de nacimiento) */
  function esMenor(ins, socio, actividad) {
    if (socio) return S.esMenor(socio, fechaDe(actividad) || F.hoy());
    return !!ins.esMenor;
  }

  function ocupadas(a) { return (a.inscripciones || []).filter(function (i) { return i.estado === "inscrita"; }).length; }
  function enEspera(a) {
    return (a.inscripciones || []).filter(function (i) { return i.estado === "espera"; })
      .sort(function (x, y) { return String(x.fecha).localeCompare(String(y.fecha)); });
  }
  function libres(a) { return a.aforo > 0 ? Math.max(a.aforo - ocupadas(a), 0) : Infinity; }

  /**
   * Inscribe a una persona. persona: { socio } o { nombre, contacto, esMenor }.
   * Devuelve { actividad (copia nueva), inscripcion, enEspera }. Lanza un error
   * con un texto claro si no se puede (solo socios, completa, ya inscrita…).
   */
  function inscribir(actividad, persona, opciones) {
    var o = opciones || {};
    var a = copia(actividad);
    a.inscripciones = a.inscripciones || [];
    var socio = persona.socio || null;
    if (a.estado === "cancelada") throw new Error("La actividad está cancelada.");
    if (a.abierta === "socios" && !socio) throw new Error("Esta actividad es solo para socios.");
    var nombre = socio ? S.nombreCompleto(socio) : String(persona.nombre || "").trim();
    if (!nombre) throw new Error("Falta el nombre.");
    var contacto = socio ? (socio.email || socio.telefono || "") : String(persona.contacto || "").trim();
    var plano = function (s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); };
    var repetida = a.inscripciones.some(function (i) {
      if (i.estado === "cancelada") return false;
      return socio ? i.socioId === socio.id : !i.socioId && plano(i.nombre) === plano(nombre) && plano(i.contacto) === plano(contacto);
    });
    if (repetida) throw new Error(nombre + " ya está inscrito/a.");
    var llena = a.aforo > 0 && ocupadas(a) >= a.aforo;
    if (llena && !a.listaEspera) throw new Error("La actividad está completa (" + a.aforo + " plazas).");
    var ins = {
      id: nuevoId(), socioId: socio ? socio.id : "", nombre: nombre, contacto: contacto,
      esMenor: socio ? false : !!persona.esMenor, autorizacion: !!persona.autorizacion,
      estado: llena ? "espera" : "inscrita", fecha: o.ahora || new Date().toISOString(),
      importe: socio ? (a.precioSocio || 0) : (a.precioGeneral || 0), pago: null, asistio: null, notas: persona.notas || "",
    };
    a.inscripciones.push(ins);
    return { actividad: a, inscripcion: ins, enEspera: llena };
  }

  /**
   * Cancela una inscripción. Si deja una plaza libre y hay lista de espera,
   * sube a la primera persona en espera. Devuelve { actividad, promovida (o null) }.
   */
  function cancelar(actividad, inscripcionId) {
    var a = copia(actividad);
    var ins = a.inscripciones.filter(function (i) { return i.id === inscripcionId; })[0];
    if (!ins) throw new Error("No existe esa inscripción.");
    var teniaPlaza = ins.estado === "inscrita";
    ins.estado = "cancelada";
    var promovida = null;
    if (teniaPlaza && libres(a) > 0) {
      var siguiente = enEspera(a)[0];
      if (siguiente) { siguiente.estado = "inscrita"; promovida = siguiente; }
    }
    return { actividad: a, promovida: promovida };
  }

  /** Sube a mano a alguien de la lista de espera (aunque supere el aforo, si se decide así). */
  function promover(actividad, inscripcionId) {
    var a = copia(actividad);
    a.inscripciones.forEach(function (i) { if (i.id === inscripcionId && i.estado === "espera") i.estado = "inscrita"; });
    return a;
  }

  function cambiarInscripcion(actividad, inscripcionId, cambios) {
    var a = copia(actividad);
    a.inscripciones.forEach(function (i) { if (i.id === inscripcionId) Object.assign(i, cambios); });
    return a;
  }

  /** Cobra una inscripción. pago: { fecha, forma, cuentaId, referencia }. */
  function cobrar(actividad, inscripcionId, pago) {
    if (!pago || !F.esValida(pago.fecha)) throw new Error("Falta la fecha del pago.");
    if (S.FORMAS_PAGO.indexOf(pago.forma) < 0) throw new Error("Elige la forma de pago.");
    var ins = (actividad.inscripciones || []).filter(function (i) { return i.id === inscripcionId; })[0];
    if (!ins) throw new Error("No existe esa inscripción.");
    if (!(ins.importe > 0)) throw new Error("Esta inscripción no tiene importe.");
    return cambiarInscripcion(actividad, inscripcionId, { pago: { fecha: pago.fecha, forma: pago.forma, cuentaId: pago.cuentaId || "", referencia: pago.referencia || "" } });
  }

  /**
   * Cifras de una actividad. socios: lista para saber quién es menor.
   * { inscritas, espera, canceladas, libres, asistentes, noAsistieron, menores,
   *   menoresSinAutorizacion, recaudado, pendienteCobro }
   */
  function resumen(actividad, socios) {
    var porId = {};
    (socios || []).forEach(function (s) { porId[s.id] = s; });
    var r = { inscritas: 0, espera: 0, canceladas: 0, asistentes: 0, noAsistieron: 0, menores: 0, menoresSinAutorizacion: 0, recaudado: 0, pendienteCobro: 0 };
    (actividad.inscripciones || []).forEach(function (i) {
      if (i.estado === "cancelada") { r.canceladas++; if (i.pago) r.recaudado += i.importe; return; }
      if (i.estado === "espera") { r.espera++; return; }
      r.inscritas++;
      if (i.asistio === true) r.asistentes++;
      if (i.asistio === false) r.noAsistieron++;
      if (esMenor(i, porId[i.socioId], actividad)) {
        r.menores++;
        if (actividad.autorizacionMenores && !i.autorizacion) r.menoresSinAutorizacion++;
      }
      if (i.pago) r.recaudado += i.importe; else if (i.importe > 0) r.pendienteCobro += i.importe;
    });
    r.libres = libres(actividad);
    return r;
  }

  /** Inscripciones pagadas → movimientos de ingreso (para la tesorería). */
  function aMovimientos(actividades) {
    var out = [];
    (actividades || []).forEach(function (a) {
      (a.inscripciones || []).forEach(function (i) {
        if (!i.pago || !(i.importe > 0)) return;
        out.push({
          fecha: i.pago.fecha, tipo: "ingreso", importe: i.importe, cuentaId: i.pago.cuentaId, categoriaId: CATEGORIA_INSCRIPCIONES,
          proyectoId: a.proyectoId || "", actividadId: a.id, forma: i.pago.forma,
          concepto: "Inscripción · " + a.titulo + " · " + i.nombre, origen: { tipo: "inscripcion", id: a.id + ":" + i.id },
        });
      });
    });
    return out;
  }

  /** Duplica una actividad (sin inscripciones), para crear otra parecida. */
  function duplicar(actividad) {
    var a = copia(actividad);
    delete a.id; delete a.creado; delete a.modificado;
    a.inscripciones = [];
    a.estado = "prevista";
    a.titulo = a.titulo + " (copia)";
    return a;
  }

  function ordenar(actividades) {
    return (actividades || []).slice().sort(function (a, b) { return String(a.inicio).localeCompare(String(b.inicio)); });
  }

  /**
   * Semanas de un mes para un calendario (lunes primero):
   * [[{ fecha, delMes, actividades: [...] } × 7], …]
   */
  function mes(actividades, anio, mesNumero) {
    var primero = new Date(anio, mesNumero - 1, 1);
    var desplazamiento = (primero.getDay() + 6) % 7; // lunes = 0
    var inicio = new Date(anio, mesNumero - 1, 1 - desplazamiento);
    var porDia = {};
    ordenar(actividades).forEach(function (a) {
      var d0 = fechaDe(a), d1 = String(a.fin || a.inicio).slice(0, 10);
      if (!F.esValida(d0)) return;
      if (!F.esValida(d1) || d1 < d0) d1 = d0;
      // Las de varios días aparecen en cada uno de ellos.
      for (var d = d0, n = 0; d <= d1 && n < 62; d = F.sumarDias(d, 1), n++) (porDia[d] = porDia[d] || []).push(a);
    });
    var semanas = [];
    for (var s = 0; s < 6; s++) {
      var semana = [];
      for (var k = 0; k < 7; k++) {
        var f = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + s * 7 + k);
        var iso = F.aISO(f);
        semana.push({ fecha: iso, delMes: f.getMonth() === mesNumero - 1, actividades: porDia[iso] || [] });
      }
      if (s >= 4 && !semana.some(function (d) { return d.delMes; })) break;
      semanas.push(semana);
    }
    return semanas;
  }

  /** Balance económico: lo cobrado y lo gastado enlazado a la actividad. partidas: Tesoreria.partidas(). */
  function balance(actividadId, partidas) {
    var r = { ingresos: 0, gastos: 0 };
    (partidas || []).forEach(function (p) {
      if (p.actividadId !== actividadId) return;
      if (p.tipo === "ingreso") r.ingresos += p.importe; else r.gastos += p.importe;
    });
    r.resultado = r.ingresos - r.gastos;
    return r;
  }

  // ── Calendario .ics (RFC 5545) ───────────────────────────────────────────
  var ZONAS = {
    "Europe/Madrid": ["+0100", "+0200", "CET", "CEST"],
    "Atlantic/Canary": ["+0000", "+0100", "WET", "WEST"],
  };
  function vtimezone(tz) {
    var z = ZONAS[tz] || ZONAS["Europe/Madrid"];
    return ["BEGIN:VTIMEZONE", "TZID:" + tz,
      "BEGIN:DAYLIGHT", "TZOFFSETFROM:" + z[0], "TZOFFSETTO:" + z[1], "TZNAME:" + z[3], "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
      "BEGIN:STANDARD", "TZOFFSETFROM:" + z[1], "TZOFFSETTO:" + z[0], "TZNAME:" + z[2], "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
      "END:VTIMEZONE"];
  }
  /** Escapa un texto para una propiedad de .ics. */
  function escaparIcs(s) {
    return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }
  /** Parte una línea en trozos de 75 octetos como mucho (sin romper letras con tilde). */
  function plegar(linea) {
    var enc = new TextEncoder();
    if (enc.encode(linea).length <= 75) return linea;
    var trozos = [], actual = "", bytes = 0, limite = 75;
    for (var i = 0; i < linea.length; i++) {
      var ch = linea[i];
      var cp = linea.codePointAt(i);
      if (cp > 0xffff) { ch = linea.slice(i, i + 2); i++; }
      var b = enc.encode(ch).length;
      if (bytes + b > limite) { trozos.push(actual); actual = ""; bytes = 0; limite = 74; } // las siguientes empiezan con un espacio
      actual += ch; bytes += b;
    }
    trozos.push(actual);
    return trozos.join("\r\n ");
  }
  var compacta = function (iso) { return iso.replace(/[-:]/g, ""); };            // "2026-10-05T18:00" → "20261005T1800"
  function marcaUTC(fecha) {
    return fecha.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");       // 20261005T160000Z
  }

  /**
   * Genera un archivo .ics. opciones: { nombreCalendario, zona ("Europe/Madrid" | "Atlantic/Canary"), ahora }.
   */
  function ics(actividades, opciones) {
    var o = opciones || {};
    var tz = ZONAS[o.zona] ? o.zona : "Europe/Madrid";
    var lineas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Agora//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    if (o.nombreCalendario) lineas.push("X-WR-CALNAME:" + escaparIcs(o.nombreCalendario));
    var conHora = (actividades || []).some(function (a) { return !a.todoElDia; });
    if (conHora) lineas = lineas.concat(vtimezone(tz));
    var stamp = marcaUTC(o.ahora || new Date());
    (actividades || []).forEach(function (a) {
      var ini = String(a.inicio || ""), fin = String(a.fin || "");
      if (!F.esValida(ini.slice(0, 10))) return;
      lineas.push("BEGIN:VEVENT", "UID:" + a.id + "@agora.sweetsuite", "DTSTAMP:" + stamp);
      if (a.todoElDia) {
        var ultimo = F.esValida(fin.slice(0, 10)) && fin.slice(0, 10) >= ini.slice(0, 10) ? fin.slice(0, 10) : ini.slice(0, 10);
        lineas.push("DTSTART;VALUE=DATE:" + compacta(ini.slice(0, 10)), "DTEND;VALUE=DATE:" + compacta(F.sumarDias(ultimo, 1))); // DTEND es el día siguiente (no incluido)
      } else {
        var h0 = /T\d{2}:\d{2}/.test(ini) ? ini.slice(0, 16) : ini.slice(0, 10) + "T00:00";
        var h1 = /T\d{2}:\d{2}/.test(fin) && fin.slice(0, 16) > h0 ? fin.slice(0, 16) : null;
        lineas.push("DTSTART;TZID=" + tz + ":" + compacta(h0) + "00");
        if (h1) lineas.push("DTEND;TZID=" + tz + ":" + compacta(h1) + "00");
      }
      lineas.push("SUMMARY:" + escaparIcs(a.titulo));
      if (a.lugar) lineas.push("LOCATION:" + escaparIcs(a.lugar));
      var desc = [a.descripcion, a.responsable ? "Responsable: " + a.responsable : "", a.abierta === "socios" ? "Solo para socios." : ""].filter(Boolean).join("\n");
      if (desc) lineas.push("DESCRIPTION:" + escaparIcs(desc));
      lineas.push("STATUS:" + (a.estado === "cancelada" ? "CANCELLED" : "CONFIRMED"), "END:VEVENT");
    });
    lineas.push("END:VCALENDAR");
    return lineas.map(plegar).join("\r\n") + "\r\n";
  }

  return {
    CATEGORIA_INSCRIPCIONES: CATEGORIA_INSCRIPCIONES, ESTADOS: ESTADOS, TIPOS: TIPOS, ZONAS: Object.keys(ZONAS),
    vacia: vacia, esMenor: esMenor, ocupadas: ocupadas, enEspera: enEspera, libres: libres,
    inscribir: inscribir, cancelar: cancelar, promover: promover, cambiarInscripcion: cambiarInscripcion, cobrar: cobrar,
    resumen: resumen, aMovimientos: aMovimientos, duplicar: duplicar, ordenar: ordenar, mes: mes, balance: balance,
    ics: ics, escaparIcs: escaparIcs, plegar: plegar, fechaDe: fechaDe,
  };
});

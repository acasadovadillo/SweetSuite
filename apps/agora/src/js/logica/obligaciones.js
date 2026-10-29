/*
 * Agora — Calendario de obligaciones y seguimiento de subvenciones
 * (sin interfaz: tests/gobierno.test.js).
 *
 * ⚠️ FECHAS ORIENTATIVAS. Los plazos de la lista de habituales son los más
 * comunes, pero dependen de cada caso (si la asociación está obligada o no, si
 * cae en festivo, cambios normativos…): todos llevan «verificar con asesoría» y
 * se pueden editar.
 *
 * OBLIGACIÓN:
 *   { id, titulo, categoria: "Fiscal" | "Asociativa" | "Renovación" | "Subvención" | "Otra",
 *     descripcion, recurrencia: "anual" | "unica",
 *     vencimientos: [{ mes, dia, etiqueta }]   (anual: se repite cada año en esas fechas)
 *     fecha                                     (única)
 *     diasAviso (cuántos días antes avisar), activa, plantilla (de cuál de las habituales salió),
 *     desde (no cuenta nada anterior: así, al añadirla hoy, no salen como «vencidos» los plazos de años pasados),
 *     hechas: { "aaaa-mm-dd": { fecha, nota } } } (cada vencimiento cumplido)
 *
 * SUBVENCIÓN: un proyecto con tipo «subvencion» (ver modulos/proyectos.js) con
 *   { estadoSubvencion, importeSolicitado, plazoSolicitud, fechaSolicitud, fechaResolucion,
 *     plazoJustificacion, fechaJustificacion, urlBases, requisitos: [{ id, texto, hecho }] }
 *   Sus plazos aparecen en el calendario de obligaciones.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function" ? { Fechas: require("../nucleo/fechas.js") } : { Fechas: raiz.WA.Fechas };
  var modulo = fabrica(dep.Fechas);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Obligaciones = modulo;
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  var CATEGORIAS = ["Fiscal", "Asociativa", "Renovación", "Subvención", "Otra"];
  var VERIFICAR = " Fechas orientativas: verificar con asesoría (si el último día es festivo, el plazo puede moverse).";
  var v = function (mes, dia, etiqueta) { return { mes: mes, dia: dia, etiqueta: etiqueta || "" }; };

  /** Obligaciones habituales para elegir. Ninguna se añade sola: cada asociación elige las suyas. */
  var PLANTILLAS = [
    { plantilla: "303", categoria: "Fiscal", titulo: "IVA trimestral (modelo 303)", recurrencia: "anual",
      vencimientos: [v(4, 20, "1.er trimestre"), v(7, 20, "2.º trimestre"), v(10, 20, "3.er trimestre"), v(1, 30, "4.º trimestre del año anterior")],
      descripcion: "Solo si la asociación presenta IVA. La app ayuda con las cifras en «IVA»." + VERIFICAR },
    { plantilla: "390", categoria: "Fiscal", titulo: "Resumen anual de IVA (modelo 390)", recurrencia: "anual",
      vencimientos: [v(1, 30, "del año anterior")], descripcion: "Solo si se presenta IVA y no se está exonerado." + VERIFICAR },
    { plantilla: "111", categoria: "Fiscal", titulo: "Retenciones de IRPF (modelo 111)", recurrencia: "anual",
      vencimientos: [v(4, 20, "1.er trimestre"), v(7, 20, "2.º trimestre"), v(10, 20, "3.er trimestre"), v(1, 20, "4.º trimestre del año anterior")],
      descripcion: "Si se han practicado retenciones (por ejemplo, a ponentes o profesionales)." + VERIFICAR },
    { plantilla: "190", categoria: "Fiscal", titulo: "Resumen anual de retenciones (modelo 190)", recurrencia: "anual",
      vencimientos: [v(1, 31, "del año anterior")], descripcion: "Si se han presentado modelos 111." + VERIFICAR },
    { plantilla: "182", categoria: "Fiscal", titulo: "Declaración informativa de donativos (modelo 182)", recurrencia: "anual",
      vencimientos: [v(1, 31, "del año anterior")], descripcion: "Si la asociación emite certificados de donaciones con derecho a deducción (por ejemplo, si es de utilidad pública)." + VERIFICAR },
    { plantilla: "200", categoria: "Fiscal", titulo: "Impuesto sobre Sociedades (modelo 200)", recurrencia: "anual",
      vencimientos: [v(7, 25, "ejercicio anterior")], descripcion: "Las asociaciones pueden estar obligadas a presentarlo aunque estén parcialmente exentas; hay supuestos en que no. Consultadlo." + VERIFICAR },
    { plantilla: "347", categoria: "Fiscal", titulo: "Operaciones con terceros (modelo 347)", recurrencia: "anual",
      vencimientos: [v(2, 28, "del año anterior")], descripcion: "Solo si hay operaciones con una misma persona o entidad por encima del umbral legal." + VERIFICAR },
    { plantilla: "asamblea", categoria: "Asociativa", titulo: "Asamblea general ordinaria (cuentas y presupuesto)", recurrencia: "anual",
      vencimientos: [v(6, 30, "fecha límite según estatutos")], descripcion: "Pon la fecha que marquen vuestros estatutos." + VERIFICAR },
    { plantilla: "cuentas", categoria: "Asociativa", titulo: "Cierre del ejercicio y preparación de las cuentas", recurrencia: "anual",
      vencimientos: [v(3, 31, "ejercicio anterior")], descripcion: "Para poder presentarlas a la asamblea." + VERIFICAR },
    { plantilla: "cargos", categoria: "Asociativa", titulo: "Renovación de cargos de la junta directiva", recurrencia: "unica", fecha: "",
      descripcion: "La duración de los cargos la fijan los estatutos. Pon la fecha en que vencen." + VERIFICAR },
    { plantilla: "registro", categoria: "Asociativa", titulo: "Comunicar cambios al registro de asociaciones", recurrencia: "unica", fecha: "",
      descripcion: "Cambios de junta, domicilio o estatutos deben comunicarse al registro en el plazo que marque la norma aplicable." + VERIFICAR },
    { plantilla: "rgpd", categoria: "Asociativa", titulo: "Revisión anual de protección de datos", recurrencia: "anual",
      vencimientos: [v(1, 31, "")], descripcion: "Revisar quién accede a los datos, borrar los que ya no hacen falta y hacer copia de seguridad." },
    { plantilla: "seguro-rc", categoria: "Renovación", titulo: "Seguro de responsabilidad civil", recurrencia: "anual",
      vencimientos: [v(1, 1, "vencimiento de la póliza")], descripcion: "Pon la fecha de vencimiento de vuestra póliza." },
    { plantilla: "seguro-acc", categoria: "Renovación", titulo: "Seguro de accidentes para actividades", recurrencia: "anual",
      vencimientos: [v(1, 1, "vencimiento de la póliza")], descripcion: "Pon la fecha de vencimiento de vuestra póliza." },
    { plantilla: "web", categoria: "Renovación", titulo: "Dominio y alojamiento web", recurrencia: "anual", vencimientos: [v(1, 1, "")], descripcion: "Pon la fecha de renovación." },
    { plantilla: "certificado", categoria: "Renovación", titulo: "Certificado digital de la asociación", recurrencia: "unica", fecha: "",
      descripcion: "Pon la fecha de caducidad que figura en el certificado." },
  ];

  function vacia(ahora) {
    return { titulo: "", categoria: "Otra", descripcion: "", recurrencia: "anual", vencimientos: [v(1, 1, "")], fecha: "", diasAviso: 15, activa: true, plantilla: "",
      desde: F.hoy(ahora), hechas: {} };
  }
  function desdePlantilla(p, ahora) {
    var o = Object.assign(vacia(ahora), JSON.parse(JSON.stringify(p)));
    o.hechas = {};
    return o;
  }

  var dos = function (n) { return String(n).padStart(2, "0"); };
  /** Fecha real de un vencimiento en un año (el 29/2 en años no bisiestos pasa al 28). */
  function fechaEn(anio, mes, dia) {
    var ultimo = new Date(anio, mes, 0).getDate();
    return anio + "-" + dos(mes) + "-" + dos(Math.min(dia, ultimo));
  }

  /**
   * Vencimientos entre dos fechas (incluidas), con su situación respecto a «hoy»:
   *   hecha · vencida (pasó y no está hecha) · proxima (faltan diasAviso o menos) · pendiente
   */
  function ocurrencias(obligaciones, desde, hasta, hoy) {
    var h = hoy || F.hoy(), out = [];
    (obligaciones || []).forEach(function (o) {
      if (o.activa === false) return;
      var fechas = [];
      if (o.recurrencia === "unica") {
        if (F.esValida(o.fecha)) fechas.push({ fecha: o.fecha, etiqueta: "" });
      } else {
        for (var a = +desde.slice(0, 4); a <= +hasta.slice(0, 4); a++) {
          (o.vencimientos || []).forEach(function (x) { fechas.push({ fecha: fechaEn(a, x.mes, x.dia), etiqueta: x.etiqueta || "" }); });
        }
      }
      var inicio = o.desde || String(o.creado || "").slice(0, 10) || desde;
      fechas.forEach(function (x) {
        if (x.fecha < desde || x.fecha > hasta) return;
        if (o.recurrencia !== "unica" && x.fecha < inicio) return;
        var hecha = (o.hechas || {})[x.fecha];
        var faltan = F.diasEntre(h, x.fecha);
        var estado = hecha ? "hecha" : faltan < 0 ? "vencida" : faltan <= (o.diasAviso == null ? 15 : o.diasAviso) ? "proxima" : "pendiente";
        out.push({ obligacionId: o.id, titulo: o.titulo, categoria: o.categoria, fecha: x.fecha, etiqueta: x.etiqueta, estado: estado, faltan: faltan, hecha: hecha || null, origen: "obligacion" });
      });
    });
    return out.sort(function (a, b) { return a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo, "es"); });
  }

  /** Marca (o desmarca) un vencimiento como hecho. Devuelve una copia nueva. */
  function marcarHecha(o, fecha, hecha, nota, ahora) {
    var c = JSON.parse(JSON.stringify(o));
    c.hechas = c.hechas || {};
    if (hecha) c.hechas[fecha] = { fecha: F.hoy(ahora), nota: nota || "" };
    else delete c.hechas[fecha];
    return c;
  }

  // ── Subvenciones ────────────────────────────────────────────────────────
  var ESTADOS_SUBVENCION = [["idea", "Idea / estudiando"], ["preparando", "Preparando la solicitud"], ["solicitada", "Solicitada"],
    ["concedida", "Concedida"], ["denegada", "Denegada"], ["justificando", "Justificando"], ["justificada", "Justificada"], ["cerrada", "Cerrada"]];

  /** Plazos de las subvenciones como vencimientos del calendario (los que ya no tocan, no salen). */
  function ocurrenciasSubvenciones(proyectos, desde, hasta, hoy) {
    var h = hoy || F.hoy(), out = [];
    (proyectos || []).forEach(function (p) {
      if (p.tipo !== "subvencion") return;
      var e = p.estadoSubvencion || "idea";
      var plazos = [];
      if (["idea", "preparando"].indexOf(e) >= 0 && F.esValida(p.plazoSolicitud)) plazos.push([p.plazoSolicitud, "Fin del plazo de solicitud"]);
      if (["concedida", "justificando"].indexOf(e) >= 0 && F.esValida(p.plazoJustificacion)) plazos.push([p.plazoJustificacion, "Fin del plazo de justificación"]);
      plazos.forEach(function (x) {
        if (x[0] < desde || x[0] > hasta) return;
        var faltan = F.diasEntre(h, x[0]);
        out.push({ proyectoId: p.id, titulo: p.nombre, categoria: "Subvención", fecha: x[0], etiqueta: x[1],
          estado: faltan < 0 ? "vencida" : faltan <= 30 ? "proxima" : "pendiente", faltan: faltan, hecha: null, origen: "subvencion" });
      });
    });
    return out;
  }

  /** Requisitos o documentos de una subvención: { hechos, total }. */
  function progresoRequisitos(p) {
    var r = p.requisitos || [];
    return { hechos: r.filter(function (x) { return x.hecho; }).length, total: r.length };
  }

  return {
    CATEGORIAS: CATEGORIAS, PLANTILLAS: PLANTILLAS, ESTADOS_SUBVENCION: ESTADOS_SUBVENCION,
    vacia: vacia, desdePlantilla: desdePlantilla, fechaEn: fechaEn, ocurrencias: ocurrencias, marcarHecha: marcarHecha,
    ocurrenciasSubvenciones: ocurrenciasSubvenciones, progresoRequisitos: progresoRequisitos,
  };
});

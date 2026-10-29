/*
 * webkit_asociaciones — Lógica de socios (sin interfaz: se prueba en tests/socios.test.js).
 *
 * Un socio:
 *   { id, numero,                                 número de socio: nunca se reutiliza
 *     nombre, apellidos, tipoDocumento, documento, fechaNacimiento, sexo, ocupacion,
 *     email, telefono, telefono2, direccion (forma de nucleo/direccion.js),
 *     tipoSocioId, exentoCuota, formaPago (la habitual),
 *     iban, titularCuenta, mandatoReferencia, mandatoFecha,   (domiciliación SEPA)
 *     tutor: { nombre, documento, telefono, email, relacion },  (si es menor)
 *     consentimientos: { proteccionDatos (fecha), imagen (sí/no), comunicaciones (sí/no) },
 *     fechaAlta, fechaBaja, motivoBaja, notas }
 *
 * La relación actualizada de asociados es una obligación de la Ley Orgánica 1/2002
 * (art. 14) — verificar con asesoría qué datos debe contener en vuestro caso.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { Fechas: require("../nucleo/fechas.js"), Validar: require("../nucleo/validar.js"), Direccion: require("../nucleo/direccion.js") }
    : { Fechas: raiz.WA.Fechas, Validar: raiz.WA.Validar, Direccion: raiz.WA.Direccion };
  var modulo = fabrica(dep.Fechas, dep.Validar, dep.Direccion);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Socios = modulo;
})(typeof self !== "undefined" ? self : this, function (F, V, Dir) {
  "use strict";

  var TIPOS_DOCUMENTO = ["DNI", "NIE", "Pasaporte", "Otro"];
  var SEXOS = ["Mujer", "Hombre", "Otro", "Prefiere no decirlo"];
  var FORMAS_PAGO = ["Transferencia", "Bizum", "Efectivo", "Domiciliación", "Tarjeta", "Otra"];
  var MAYORIA_EDAD = 18;

  function vacio() {
    return {
      numero: null, nombre: "", apellidos: "", tipoDocumento: "DNI", documento: "", fechaNacimiento: "", sexo: "", ocupacion: "",
      email: "", telefono: "", telefono2: "", direccion: Dir.vacia(),
      tipoSocioId: "", exentoCuota: false, formaPago: "Transferencia",
      iban: "", titularCuenta: "", mandatoReferencia: "", mandatoFecha: "",
      tutor: { nombre: "", documento: "", telefono: "", email: "", relacion: "" },
      consentimientos: { proteccionDatos: "", imagen: false, comunicaciones: false },
      fechaAlta: "", fechaBaja: "", motivoBaja: "", notas: "",
    };
  }

  /** Rellena lo que falte con los valores por defecto (registros antiguos o importados). */
  function completar(s) {
    var v = vacio();
    var r = Object.assign(v, s || {});
    r.direccion = Object.assign(Dir.vacia(), (s && s.direccion) || {});
    r.tutor = Object.assign(vacio().tutor, (s && s.tutor) || {});
    r.consentimientos = Object.assign(vacio().consentimientos, (s && s.consentimientos) || {});
    return r;
  }

  function nombreCompleto(s) {
    return [s.nombre, s.apellidos].map(function (x) { return String(x || "").trim(); }).filter(Boolean).join(" ");
  }
  /** «Apellidos, Nombre» para listados ordenados. */
  function nombreListado(s) {
    var a = String(s.apellidos || "").trim(), n = String(s.nombre || "").trim();
    return a && n ? a + ", " + n : a || n;
  }

  /** ¿Es socio en esa fecha? (dado de alta y no dado de baja). */
  function activoEn(s, fecha) {
    var f = fecha || F.hoy();
    if (!s.fechaAlta || s.fechaAlta > f) return false;
    return !s.fechaBaja || s.fechaBaja > f;
  }
  function estado(s, hoy) {
    var f = hoy || F.hoy();
    if (s.fechaBaja && s.fechaBaja <= f) return "baja";
    if (s.fechaAlta && s.fechaAlta > f) return "futuro";
    return "activo";
  }

  /** Edad cumplida en una fecha (null si no hay fecha de nacimiento). */
  function edad(fechaNacimiento, hoy) {
    var n = F.desdeISO(fechaNacimiento), h = F.desdeISO(hoy || F.hoy());
    if (!n || !h) return null;
    var e = h.getFullYear() - n.getFullYear();
    if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
    return e;
  }
  function esMenor(s, hoy) {
    var e = edad(s.fechaNacimiento, hoy);
    return e !== null && e < MAYORIA_EDAD;
  }

  /** Siguiente número de socio: uno más que el mayor usado (y que el contador guardado). */
  function siguienteNumero(socios, contador) {
    var max = 0;
    (socios || []).forEach(function (s) { if (s.numero > max) max = s.numero; });
    return Math.max(max + 1, contador || 1);
  }

  var plano = function (s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  };

  /**
   * Filtra y ordena socios.
   * opciones: { texto, estado ("activo" | "baja" | "todos"), tipoSocioId, hoy, orden ("numero" | "nombre") }
   * El texto busca en nombre, apellidos, documento, correo, teléfono, número y municipio.
   */
  function filtrar(socios, opciones) {
    var o = opciones || {};
    var hoy = o.hoy || F.hoy();
    var palabras = plano(o.texto).split(/\s+/).filter(Boolean);
    var lista = (socios || []).filter(function (s) {
      if (o.estado && o.estado !== "todos") {
        var e = estado(s, hoy);
        if (o.estado === "activo" ? e === "baja" : e !== o.estado) return false;
      }
      if (o.tipoSocioId && s.tipoSocioId !== o.tipoSocioId) return false;
      if (!palabras.length) return true;
      var dondeBuscar = plano([s.numero, s.nombre, s.apellidos, s.documento, s.email, s.telefono, s.telefono2,
        s.direccion && s.direccion.municipio].join(" "));
      return palabras.every(function (p) { return dondeBuscar.indexOf(p) >= 0; });
    });
    if (o.orden === "nombre") lista.sort(function (a, b) { return nombreListado(a).localeCompare(nombreListado(b), "es"); });
    else lista.sort(function (a, b) { return (a.numero || 0) - (b.numero || 0); });
    return lista;
  }

  /**
   * Revisa un socio. Devuelve { errores: {campo: texto}, avisos: {campo: texto} }.
   * Los errores impiden guardar; los avisos no (puede haber casos raros legítimos).
   */
  function revisar(s, otros, hoy) {
    var errores = {}, avisos = {};
    if (!String(s.nombre || "").trim()) errores.nombre = "Escribe el nombre.";
    if (!F.esValida(s.fechaAlta)) errores.fechaAlta = "Pon la fecha de alta.";
    if (s.fechaBaja && !F.esValida(s.fechaBaja)) errores.fechaBaja = "La fecha de baja no es válida.";
    if (s.fechaBaja && s.fechaAlta && s.fechaBaja < s.fechaAlta) errores.fechaBaja = "La baja no puede ser anterior al alta.";
    if (s.fechaNacimiento && !F.esValida(s.fechaNacimiento)) errores.fechaNacimiento = "La fecha no es válida.";
    if (s.fechaNacimiento && s.fechaNacimiento > (hoy || F.hoy())) errores.fechaNacimiento = "La fecha de nacimiento es futura.";

    if (s.documento && (s.tipoDocumento === "DNI" || s.tipoDocumento === "NIE")) {
      var r = V.nifPersona(s.documento);
      if (!r.valido) avisos.documento = r.mensaje;
    }
    if (s.email && !V.email(s.email).valido) avisos.email = V.email(s.email).mensaje;
    if (s.iban && !V.iban(s.iban).valido) avisos.iban = V.iban(s.iban).mensaje;
    var cp = s.direccion && s.direccion.codigoPostal;
    if (cp && !V.codigoPostal(cp).valido) avisos.codigoPostal = V.codigoPostal(cp).mensaje;
    if (s.formaPago === "Domiciliación" && !s.iban) avisos.iban = "Para domiciliar hace falta el IBAN.";
    if (esMenor(s, hoy) && !String((s.tutor || {}).nombre || "").trim()) avisos.tutorNombre = "Es menor de edad: añade a su madre, padre o tutor.";

    // Duplicados: mismo documento o mismo correo que otro socio.
    var doc = V.normalizar(s.documento), mail = String(s.email || "").trim().toLowerCase();
    (otros || []).forEach(function (o) {
      if (o.id === s.id) return;
      if (doc && V.normalizar(o.documento) === doc) avisos.documento = "Ya hay otro socio con este documento (n.º " + o.numero + ").";
      if (mail && String(o.email || "").trim().toLowerCase() === mail) avisos.email = "Ya hay otro socio con este correo (n.º " + o.numero + ").";
    });
    return { errores: errores, avisos: avisos };
  }

  // ── Importar desde CSV ───────────────────────────────────────────────────
  /*
   * Cada campo se reconoce por el título de su columna, sin importar mayúsculas,
   * tildes ni espacios. Así vale una hoja hecha a mano o exportada de otro programa.
   */
  var ALIAS = {
    numero: ["numero", "n", "no", "nº", "n.º", "num", "numero de socio", "n socio", "n.º de socio", "nº socio"],
    nombre: ["nombre", "nombre de pila"],
    apellidos: ["apellidos", "apellido", "apellido 1", "primer apellido"],
    apellido2: ["apellido 2", "segundo apellido"],
    nombreCompleto: ["nombre completo", "nombre y apellidos", "apellidos y nombre", "apellidos, nombre"],
    documento: ["dni", "nif", "nie", "documento", "dni/nie", "dni / nie", "nif/nie", "pasaporte", "numero de documento"],
    tipoDocumento: ["tipo de documento", "tipo documento"],
    fechaNacimiento: ["fecha de nacimiento", "nacimiento", "f. nacimiento", "fecha nacimiento"],
    sexo: ["sexo", "genero", "género"],
    ocupacion: ["ocupacion", "profesion", "estudios"],
    email: ["email", "e-mail", "correo", "correo electronico", "mail"],
    telefono: ["telefono", "movil", "tlf", "tel", "telefono 1", "telefono movil"],
    telefono2: ["telefono 2", "otro telefono", "telefono fijo", "fijo"],
    via: ["direccion", "domicilio", "calle"],
    codigoPostal: ["codigo postal", "cp", "c.p."],
    municipio: ["municipio", "localidad", "poblacion", "ciudad"],
    provincia: ["provincia"],
    tipoSocio: ["tipo", "tipo de socio", "categoria", "modalidad"],
    fechaAlta: ["fecha de alta", "alta", "fecha alta", "fecha de ingreso", "socio desde"],
    fechaBaja: ["fecha de baja", "baja", "fecha baja"],
    motivoBaja: ["motivo de baja", "motivo baja"],
    formaPago: ["forma de pago", "pago", "metodo de pago"],
    iban: ["iban", "cuenta", "cuenta bancaria", "numero de cuenta"],
    titularCuenta: ["titular", "titular de la cuenta", "titular cuenta"],
    notas: ["notas", "observaciones", "comentarios"],
  };
  var clave = function (t) { return plano(t).replace(/[.:]/g, "").replace(/\s+/g, " ").trim(); };

  /** Cabecera del CSV → { campo: índice de columna }. Las columnas no reconocidas se ignoran. */
  function mapearCabecera(cabecera) {
    var mapa = {};
    (cabecera || []).forEach(function (titulo, i) {
      var k = clave(titulo);
      Object.keys(ALIAS).forEach(function (campo) {
        if (mapa[campo] === undefined && ALIAS[campo].some(function (a) { return clave(a) === k; })) mapa[campo] = i;
      });
    });
    return mapa;
  }

  /**
   * Convierte las filas de un CSV en socios. No guarda nada: devuelve
   *   { socios: [...], problemas: [{ fila, mensaje }], columnas: mapa }
   * tiposSocio sirve para traducir el nombre del tipo a su id; si no se
   * reconoce, se usa el primero.
   */
  function desdeCSV(lectura, tiposSocio, hoy) {
    var mapa = mapearCabecera(lectura.cabecera);
    var tipos = tiposSocio || [];
    var problemas = [], socios = [];
    (lectura.filas || []).forEach(function (fila, i) {
      // El número de fila tal y como se ve en la hoja de cálculo.
      var nFila = lectura.numeros ? lectura.numeros[i] : i + 2;
      var v = function (campo) {
        if (mapa[campo] === undefined) return "";
        // El apóstrofo inicial lo añaden algunas exportaciones para que Excel no lo tome como fórmula.
        return String(fila[mapa[campo]] == null ? "" : fila[mapa[campo]]).trim().replace(/^'/, "");
      };
      var s = vacio();
      s.nombre = v("nombre");
      s.apellidos = [v("apellidos"), v("apellido2")].filter(Boolean).join(" ");
      if (!s.nombre && v("nombreCompleto")) {
        var nc = v("nombreCompleto");
        if (nc.indexOf(",") > 0) { s.apellidos = nc.split(",")[0].trim(); s.nombre = nc.split(",").slice(1).join(",").trim(); }
        else s.nombre = nc;
      }
      if (!s.nombre && !s.apellidos) { problemas.push({ fila: nFila, mensaje: "Sin nombre: no se importa." }); return; }
      var num = parseInt(v("numero"), 10);
      s.numero = isFinite(num) && num > 0 ? num : null;
      s.documento = V.normalizar(v("documento"));
      var td = v("tipoDocumento");
      s.tipoDocumento = TIPOS_DOCUMENTO.indexOf(td) >= 0 ? td : /^[XYZ]/i.test(s.documento) ? "NIE" : s.documento && !/^\d{8}[A-Z]$/.test(s.documento) ? "Otro" : "DNI";
      s.email = v("email");
      s.telefono = v("telefono");
      s.telefono2 = v("telefono2");
      s.sexo = SEXOS.filter(function (x) { return plano(x) === plano(v("sexo")); })[0] ||
        ({ m: "Mujer", f: "Mujer", h: "Hombre", v: "Hombre" })[plano(v("sexo"))] || "";
      s.ocupacion = v("ocupacion");
      s.notas = v("notas");
      s.iban = V.normalizar(v("iban"));
      s.titularCuenta = v("titularCuenta");
      s.motivoBaja = v("motivoBaja");
      if (v("via")) s.direccion = Dir.desdeTexto(v("via"));
      s.direccion.codigoPostal = v("codigoPostal");
      s.direccion.municipio = v("municipio");
      s.direccion.provincia = Dir.normalizarProvincia(v("provincia")) || v("provincia") || Dir.provinciaDeCP(s.direccion.codigoPostal);

      var fp = plano(v("formaPago"));
      s.formaPago = FORMAS_PAGO.filter(function (x) { return plano(x) === fp; })[0] || (fp.indexOf("domicil") >= 0 ? "Domiciliación" : "Transferencia");

      function fecha(campo, etiqueta) {
        var t = v(campo);
        if (!t) return "";
        var iso = F.desdeTexto(t);
        if (!iso) problemas.push({ fila: nFila, mensaje: etiqueta + " «" + t + "» no se entiende; se deja vacía." });
        return iso || "";
      }
      s.fechaNacimiento = fecha("fechaNacimiento", "La fecha de nacimiento");
      s.fechaAlta = fecha("fechaAlta", "La fecha de alta");
      s.fechaBaja = fecha("fechaBaja", "La fecha de baja");
      if (!s.fechaAlta) {
        s.fechaAlta = hoy || F.hoy();
        problemas.push({ fila: nFila, mensaje: "Sin fecha de alta: se pone la de hoy." });
      }
      var tipoTexto = plano(v("tipoSocio"));
      var tipo = tipos.filter(function (t) { return plano(t.nombre) === tipoTexto; })[0];
      if (tipoTexto && !tipo) problemas.push({ fila: nFila, mensaje: "Tipo de socio «" + v("tipoSocio") + "» desconocido: se usa «" + ((tipos[0] || {}).nombre || "—") + "»." });
      s.tipoSocioId = (tipo || tipos[0] || {}).id || "";
      socios.push(s);
    });
    return { socios: socios, problemas: problemas, columnas: mapa };
  }

  /** Columnas para exportar a CSV (y para la plantilla de importación). */
  var COLUMNAS_CSV = [
    { titulo: "Número", valor: function (s) { return s.numero; } },
    { titulo: "Nombre", clave: "nombre" },
    { titulo: "Apellidos", clave: "apellidos" },
    { titulo: "Tipo de documento", clave: "tipoDocumento" },
    { titulo: "Documento", clave: "documento" },
    { titulo: "Fecha de nacimiento", valor: function (s) { return F.corta(s.fechaNacimiento); } },
    { titulo: "Sexo", clave: "sexo" },
    { titulo: "Ocupación", clave: "ocupacion" },
    { titulo: "Correo", clave: "email" },
    { titulo: "Teléfono", clave: "telefono" },
    { titulo: "Teléfono 2", clave: "telefono2" },
    { titulo: "Dirección", valor: function (s) { return Dir.formatear(Object.assign({}, s.direccion, { codigoPostal: "", municipio: "", provincia: "" })).linea1; } },
    { titulo: "Código postal", valor: function (s) { return (s.direccion || {}).codigoPostal; } },
    { titulo: "Municipio", valor: function (s) { return (s.direccion || {}).municipio; } },
    { titulo: "Provincia", valor: function (s) { return (s.direccion || {}).provincia; } },
    { titulo: "Tipo de socio", clave: "_tipoNombre" },
    { titulo: "Fecha de alta", valor: function (s) { return F.corta(s.fechaAlta); } },
    { titulo: "Fecha de baja", valor: function (s) { return F.corta(s.fechaBaja); } },
    { titulo: "Motivo de baja", clave: "motivoBaja" },
    { titulo: "Forma de pago", clave: "formaPago" },
    { titulo: "IBAN", clave: "iban" },
    { titulo: "Titular de la cuenta", clave: "titularCuenta" },
    { titulo: "Notas", clave: "notas" },
  ];

  return {
    TIPOS_DOCUMENTO: TIPOS_DOCUMENTO, SEXOS: SEXOS, FORMAS_PAGO: FORMAS_PAGO, MAYORIA_EDAD: MAYORIA_EDAD,
    COLUMNAS_CSV: COLUMNAS_CSV,
    vacio: vacio, completar: completar, nombreCompleto: nombreCompleto, nombreListado: nombreListado,
    activoEn: activoEn, estado: estado, edad: edad, esMenor: esMenor, siguienteNumero: siguienteNumero,
    filtrar: filtrar, revisar: revisar, mapearCabecera: mapearCabecera, desdeCSV: desdeCSV,
  };
});

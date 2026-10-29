/*
 * Agora — Remesas SEPA: el fichero que se sube al banco para cobrar las cuotas
 * domiciliadas (sin interfaz: tests/sepa.test.js).
 *
 * Es un adeudo directo SEPA «CORE» en XML, ISO 20022 pain.008.001.02, el que
 * aceptan los bancos españoles (antes «cuaderno 19.14»). Lleva:
 *
 *   · la asociación como acreedora: nombre, IBAN y su IDENTIFICADOR DE
 *     ACREEDOR SEPA (ES + 2 cifras de control + 3 de sufijo, normalmente
 *     «000», + el NIF). Lo da el banco al contratar el servicio de remesas;
 *     identificadorAcreedor() lo calcula a partir del NIF para comprobarlo;
 *   · un recibo por cuota pendiente de cada socio que paga por domiciliación,
 *     con su IBAN y su MANDATO (la referencia y la fecha en que firmó la orden
 *     de domiciliación). Sin mandato no se puede cobrar: el socio se queda
 *     fuera y se dice por qué.
 *
 * Todos los recibos van como «RCUR» (recurrentes): desde 2016 el reglamento
 * SEPA permite usarlo también en el primer cobro de un mandato.
 *
 * Los textos se pasan al juego de caracteres que admite SEPA (sin tildes ni ñ)
 * y se cortan a su largo máximo. Formato, fechas y plazos: verificar con el
 * banco, que suele tener un validador.
 */
(function (raiz, fabrica) {
  var dep = typeof require === "function"
    ? { V: require("../nucleo/validar.js"), F: require("../nucleo/fechas.js"), S: require("./socios.js") }
    : { V: raiz.WA.Validar, F: raiz.WA.Fechas, S: raiz.WA.Socios };
  var modulo = fabrica(dep.V, dep.F, dep.S);
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Sepa = modulo;
})(typeof self !== "undefined" ? self : this, function (V, F, S) {
  "use strict";

  // ── El identificador de acreedor (AT-02) ─────────────────────────────────
  /** Las cifras de control: como en el IBAN, sobre NIF + país + «00» (sin el sufijo). */
  function control(nif, pais) {
    var texto = nif + pais + "00", resto = 0;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i], trozo = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
      for (var j = 0; j < trozo.length; j++) resto = (resto * 10 + +trozo[j]) % 97;
    }
    return String(98 - resto).padStart(2, "0");
  }

  /** El identificador de acreedor que corresponde a un NIF: «ES» + control + sufijo + NIF. */
  function identificadorAcreedor(nif, sufijo) {
    var n = V.normalizar(nif);
    if (!n) return "";
    return "ES" + control(n, "ES") + String(sufijo || "000").toUpperCase().padStart(3, "0").slice(0, 3) + n;
  }

  /** ¿Está bien escrito? { valido, mensaje } como en nucleo/validar.js. */
  function validarIdentificador(valor) {
    var s = V.normalizar(valor);
    if (!s) return { valido: false, mensaje: "Falta el identificador de acreedor SEPA (te lo da el banco)." };
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(s)) return { valido: false, mensaje: "Tiene la forma ES12000G12345678: país, dos cifras, sufijo y NIF." };
    if (control(s.slice(7), s.slice(0, 2)) !== s.slice(2, 4)) return { valido: false, mensaje: "Las cifras de control no cuadran. Revisa que esté bien copiado." };
    return { valido: true, mensaje: "" };
  }

  // ── Textos ──────────────────────────────────────────────────────────────
  /** Al juego de caracteres de SEPA: letras sin tilde, cifras y / - ? : ( ) . , ' + espacio. */
  function texto(s, max) {
    var t = String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[ºª]/g, ".").replace(/&/g, "+").replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ").replace(/\s+/g, " ").trim();
    return max ? t.slice(0, max).trim() : t;
  }
  var xml = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); };
  var euros = function (c) { return (c / 100).toFixed(2); };
  /** Un id para SEPA (máx. 35): sin guiones, solo letras y cifras. */
  var idSepa = function (s) { return String(s || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 35); };

  // ── Qué recibos entran ──────────────────────────────────────────────────
  var MOTIVOS = {
    noDomicilia: "No paga por domiciliación",
    sinIban: "No tiene IBAN, o no es válido",
    sinMandato: "Le falta la referencia o la fecha del mandato",
    mandatoPosterior: "El mandato es posterior a la fecha de cobro",
    sinSocio: "El socio ya no está en la lista",
  };

  /**
   * De unas cuotas (normalmente, las pendientes de un periodo), cuáles se
   * pueden cobrar por el banco: { incluidas: [{ cuota, socio }], excluidas: [{ cuota, motivo, texto }], total }.
   */
  function seleccionar(cuotas, socios, fechaCobro) {
    var porId = {};
    (socios || []).forEach(function (s) { porId[s.id] = s; });
    var incluidas = [], excluidas = [];
    (cuotas || []).forEach(function (c) {
      if (c.estado !== "pendiente") return;
      var s = porId[c.socioId], motivo = null;
      if (!s) motivo = "sinSocio";
      else if (s.formaPago !== "Domiciliación") motivo = "noDomicilia";
      else if (!V.iban(s.iban).valido) motivo = "sinIban";
      else if (!String(s.mandatoReferencia || "").trim() || !F.esValida(s.mandatoFecha)) motivo = "sinMandato";
      else if (fechaCobro && s.mandatoFecha > fechaCobro) motivo = "mandatoPosterior";
      if (motivo) excluidas.push({ cuota: c, motivo: motivo, texto: MOTIVOS[motivo] });
      else incluidas.push({ cuota: c, socio: s });
    });
    incluidas.sort(function (a, b) { return (a.cuota.socioNumero || 0) - (b.cuota.socioNumero || 0); });
    return { incluidas: incluidas, excluidas: excluidas, total: incluidas.reduce(function (t, x) { return t + x.cuota.importe; }, 0) };
  }

  /** ¿Se puede hacer el fichero? La lista de problemas (vacía si está bien). */
  function revisar(o) {
    var p = [], a = o.asociacion || {};
    if (!String(a.nombre || "").trim()) p.push("Falta el nombre de la asociación (en Asociación).");
    if (!V.iban(a.iban).valido) p.push("Falta el IBAN de la asociación, o no es válido (en Asociación).");
    var id = validarIdentificador(a.identificadorAcreedor);
    if (!id.valido) p.push(id.mensaje + " Se pone en Asociación.");
    if (!F.esValida(o.fechaCobro)) p.push("Falta la fecha de cobro.");
    else if (o.hoy && o.fechaCobro <= o.hoy) p.push("La fecha de cobro tiene que ser posterior a hoy (el banco necesita unos días).");
    if (!(o.incluidas || []).length) p.push("No hay ningún recibo que se pueda cobrar por el banco.");
    return p;
  }

  /**
   * El XML pain.008.001.02.
   * o = { asociacion: { nombre, iban, bic, identificadorAcreedor }, incluidas (de seleccionar),
   *       fechaCobro, concepto, ahora (Date), idMensaje }
   */
  function fichero(o) {
    var a = o.asociacion, ahora = o.ahora || new Date();
    var acreedor = texto(a.nombre, 70), idAcreedor = V.normalizar(a.identificadorAcreedor);
    var msgId = idSepa(o.idMensaje || "AGORA" + ahora.toISOString().replace(/\D/g, "").slice(0, 14));
    var n = o.incluidas.length, total = euros(o.incluidas.reduce(function (t, x) { return t + x.cuota.importe; }, 0));
    var bic = V.normalizar(a.bic || "");
    var agente = function (b) {
      return "<FinInstnId>" + (b ? "<BIC>" + xml(b) + "</BIC>" : "<Othr><Id>NOTPROVIDED</Id></Othr>") + "</FinInstnId>";
    };
    var recibos = o.incluidas.map(function (x) {
      var c = x.cuota, s = x.socio;
      // (sin la ñ, «año» se leería mal en el extracto del socio)
      var concepto = texto((o.concepto ? o.concepto + " " : "") + String(c.concepto || "").replace(/\baño\b/g, "ejercicio").replace(/\bAño\b/g, "Ejercicio"), 140);
      return "<DrctDbtTxInf>" +
        "<PmtId><EndToEndId>" + xml(idSepa(c.id) || "NOTPROVIDED") + "</EndToEndId></PmtId>" +
        '<InstdAmt Ccy="EUR">' + euros(c.importe) + "</InstdAmt>" +
        "<DrctDbtTx><MndtRltdInf><MndtId>" + xml(texto(s.mandatoReferencia, 35)) + "</MndtId><DtOfSgntr>" + xml(s.mandatoFecha) + "</DtOfSgntr></MndtRltdInf></DrctDbtTx>" +
        "<DbtrAgt>" + agente("") + "</DbtrAgt>" +
        "<Dbtr><Nm>" + xml(texto(s.titularCuenta || S.nombreCompleto(s), 70)) + "</Nm></Dbtr>" +
        "<DbtrAcct><Id><IBAN>" + xml(V.normalizar(s.iban)) + "</IBAN></Id></DbtrAcct>" +
        "<RmtInf><Ustrd>" + xml(concepto) + "</Ustrd></RmtInf>" +
        "</DrctDbtTxInf>";
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><CstmrDrctDbtInitn>' +
      "<GrpHdr><MsgId>" + xml(msgId) + "</MsgId><CreDtTm>" + ahora.toISOString().slice(0, 19) + "</CreDtTm><NbOfTxs>" + n + "</NbOfTxs><CtrlSum>" + total + "</CtrlSum>" +
      "<InitgPty><Nm>" + xml(acreedor) + "</Nm><Id><OrgId><Othr><Id>" + xml(idAcreedor) + "</Id></Othr></OrgId></Id></InitgPty></GrpHdr>" +
      "<PmtInf><PmtInfId>" + xml(idSepa(msgId + "1")) + "</PmtInfId><PmtMtd>DD</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>" + n + "</NbOfTxs><CtrlSum>" + total + "</CtrlSum>" +
      "<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf>" +
      "<ReqdColltnDt>" + xml(o.fechaCobro) + "</ReqdColltnDt>" +
      "<Cdtr><Nm>" + xml(acreedor) + "</Nm></Cdtr>" +
      "<CdtrAcct><Id><IBAN>" + xml(V.normalizar(a.iban)) + "</IBAN></Id></CdtrAcct>" +
      "<CdtrAgt>" + agente(bic) + "</CdtrAgt><ChrgBr>SLEV</ChrgBr>" +
      "<CdtrSchmeId><Id><PrvtId><Othr><Id>" + xml(idAcreedor) + "</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>" +
      recibos.join("") +
      "</PmtInf></CstmrDrctDbtInitn></Document>\n";
  }

  return {
    MOTIVOS: MOTIVOS, identificadorAcreedor: identificadorAcreedor, validarIdentificador: validarIdentificador,
    texto: texto, seleccionar: seleccionar, revisar: revisar, fichero: fichero,
  };
});

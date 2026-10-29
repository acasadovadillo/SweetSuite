/*
 * Agora — Comprobaciones de formato.
 *
 * IMPORTANTE: aquí solo se comprueba que un dato ESTÁ BIEN ESCRITO (que la letra
 * de control de un NIF cuadra, que un IBAN pasa su prueba de dígitos). No se
 * comprueba que exista ni que pertenezca a quien dice. Por eso la aplicación
 * avisa, pero no impide guardar: puede haber casos raros legítimos.
 *
 * Los algoritmos de control (NIF/NIE, NIF de entidades, IBAN) son públicos y
 * estables, pero conviene verificarlos con asesoría si algún día un dato
 * tuviera efectos ante la Administración.
 *
 * Cada función devuelve { valido: bool, mensaje: texto corto para el usuario }.
 */
(function (raiz, fabrica) {
  var modulo = fabrica();
  if (typeof module === "object" && module.exports) module.exports = modulo;
  else (raiz.WA = raiz.WA || {}).Validar = modulo;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ok = { valido: true, mensaje: "" };
  var mal = function (m) { return { valido: false, mensaje: m }; };
  var limpiar = function (s) { return String(s || "").toUpperCase().replace(/[\s\-.]/g, ""); };

  var LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";

  /** DNI (12345678Z) o NIE (X1234567L) de una persona. */
  function nifPersona(valor) {
    var s = limpiar(valor);
    if (!s) return mal("Falta el NIF.");
    var m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(s);
    if (!m) return mal("Un NIF tiene 8 números y una letra (o X/Y/Z, 7 números y una letra).");
    var numero = m[1] ? "XYZ".indexOf(m[1]) + m[2] : m[2];
    if (LETRAS_DNI[parseInt(numero, 10) % 23] !== m[3]) return mal("La letra no corresponde a ese número.");
    return ok;
  }

  /**
   * NIF de una entidad (el antiguo CIF): letra + 7 números + control.
   * Las asociaciones suelen llevar la letra G (verificar con asesoría).
   */
  function nifEntidad(valor) {
    var s = limpiar(valor);
    if (!s) return mal("Falta el NIF de la asociación.");
    var m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(s);
    if (!m) return mal("Un NIF de entidad es una letra, 7 números y un carácter de control (p. ej. G12345674).");
    var d = m[2], suma = 0;
    for (var i = 0; i < 7; i++) {
      var n = +d[i];
      if (i % 2 === 0) { n *= 2; suma += Math.floor(n / 10) + (n % 10); } // posiciones impares (1.ª, 3.ª…)
      else suma += n;
    }
    var control = (10 - (suma % 10)) % 10;
    var letraControl = "JABCDEFGHI"[control];
    var tipo = m[1], c = m[3];
    // Según el tipo de entidad, el control es letra, número, o vale cualquiera de los dos.
    var soloLetra = "NPQRSW".indexOf(tipo) >= 0;
    var soloNumero = "ABEH".indexOf(tipo) >= 0;
    var valeNumero = c === String(control), valeLetra = c === letraControl;
    if ((soloLetra && valeLetra) || (soloNumero && valeNumero) || (!soloLetra && !soloNumero && (valeNumero || valeLetra))) return ok;
    return mal("El carácter de control no cuadra. Revisa que esté bien copiado.");
  }

  /** IBAN (cualquier país), con la prueba de dígitos «módulo 97». */
  function iban(valor) {
    var s = limpiar(valor);
    if (!s) return mal("Falta el IBAN.");
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return mal("Un IBAN empieza por el país (ES) y dos números.");
    if (s.slice(0, 2) === "ES" && s.length !== 24) return mal("Un IBAN español tiene 24 caracteres.");
    var reordenado = s.slice(4) + s.slice(0, 4);
    var resto = 0;
    for (var i = 0; i < reordenado.length; i++) {
      var ch = reordenado[i];
      var trozo = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
      for (var j = 0; j < trozo.length; j++) resto = (resto * 10 + +trozo[j]) % 97;
    }
    return resto === 1 ? ok : mal("Los dígitos de control no cuadran. Revisa que esté bien copiado.");
  }

  function email(valor) {
    var s = String(valor || "").trim();
    if (!s) return mal("Falta el correo.");
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? ok : mal("No parece un correo (falta @ o el dominio).");
  }

  /** Código postal español: 5 cifras, provincia 01–52. */
  function codigoPostal(valor) {
    var s = String(valor || "").trim();
    if (!/^\d{5}$/.test(s)) return mal("El código postal tiene 5 cifras.");
    var prov = +s.slice(0, 2);
    return prov >= 1 && prov <= 52 ? ok : mal("Las dos primeras cifras deben ir de 01 a 52.");
  }

  /** Normaliza un NIF/IBAN para guardarlo: mayúsculas y sin espacios ni guiones. */
  function normalizar(valor) {
    return limpiar(valor);
  }

  return {
    nifPersona: nifPersona, nifEntidad: nifEntidad, iban: iban,
    email: email, codigoPostal: codigoPostal, normalizar: normalizar,
  };
});

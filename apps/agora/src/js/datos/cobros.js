/*
 * Agora — Los cobros de cuotas, a Solvento (TESORERIA.md, fase 4).
 *
 * Desde que el dinero se lleva en Solvento (config.dineroEnSolvento), cada
 * cuota o inscripción cobrada es un ingreso allí. Agora no manda cambios
 * sueltos: tras cada cambio calcula la lista entera de esos ingresos
 * (Traspaso.cobros) y, si no es la que Solvento ya confirmó (por su huella),
 * se la deja en SweetSuite. SweetSuite abre Solvento por detrás si hace falta;
 * Solvento la deja igual y contesta con la huella (cobrosEnSolvento).
 *
 * Si ahora no se puede (Agora suelta, sin acceso a Solvento, sin conexión),
 * queda pendiente: se vuelve a mandar al siguiente cambio o al volver a entrar.
 * Cobrar o descobrar una cuota necesita acceso a Solvento (puedeCobrar).
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA;
  var reloj = null;

  var conSolvento = function () { var S = WA.Suite; return !!(S && S.puedeUsar && S.puedeUsar("solvento")); };

  async function cargar(datos) {
    var r = await Promise.all([datos.leer("config"), datos.listar("movimientos"), datos.listar("cuotas"), datos.listar("actividades"), datos.listar("proyectos")]);
    return { config: r[0] || {}, movimientos: r[1], cuotas: r[2], actividades: r[3], proyectos: r[4] };
  }

  /** ¿Están ya en Solvento? { activo, pendiente } — activo: el dinero ya se llevó. */
  async function estado() {
    var datos = WA.Sesion.datos;
    if (!datos) return { activo: false, pendiente: false };
    var c = await cargar(datos);
    if (!c.config.dineroEnSolvento) return { activo: false, pendiente: false };
    var h = WA.Traspaso.huella(WA.Traspaso.cobros(c));
    return { activo: true, pendiente: !(c.config.cobrosEnSolvento && c.config.cobrosEnSolvento.huella === h), conSolvento: conSolvento() };
  }

  /** Manda la lista a Solvento si hace falta. */
  async function sincronizar() {
    var datos = WA.Sesion.datos;
    if (!datos || WA.Sesion.modo !== "abierta" || !conSolvento()) return false;
    var c = await cargar(datos);
    if (!c.config.dineroEnSolvento) return false;
    var lista = WA.Traspaso.cobros(c), h = WA.Traspaso.huella(lista);
    if (c.config.cobrosEnSolvento && c.config.cobrosEnSolvento.huella === h) return false;
    return WA.Suite.enviar("agora", "solvento", { tipo: "cobros-agora", movimientos: lista, huella: h }, { fondo: true });
  }

  /** Tras cada cambio (con un respiro, por si vienen varios seguidos). */
  function cambio() {
    clearTimeout(reloj);
    reloj = setTimeout(function () { sincronizar().catch(function (e) { console.error(e); }); }, 1200);
  }

  /** Solvento ya los tiene: se apunta la huella. */
  async function recibidos(huella) {
    var datos = WA.Sesion.datos;
    var cfg = await datos.leer("config");
    if (cfg.cobrosEnSolvento && cfg.cobrosEnSolvento.huella === huella) return;
    await datos.escribir("config", Object.assign({}, cfg, { cobrosEnSolvento: { huella: huella, fecha: WA.Fechas.hoy() } }));
  }

  /**
   * ¿Se puede cobrar o descobrar? Una vez llevado el dinero a Solvento, solo
   * quien también tiene Solvento (Tesorería): el ingreso se apunta allí.
   */
  function puedeCobrar(config) {
    if (!config || !config.dineroEnSolvento || conSolvento()) return true;
    WA.UI.aviso("Cobrar una cuota apunta su ingreso en Solvento, y Solvento solo lo tiene Tesorería. Pídeselo a quien lleve la tesorería.", "error");
    return false;
  }

  WA.Cobros = { estado: estado, sincronizar: sincronizar, cambio: cambio, recibidos: recibidos, puedeCobrar: puedeCobrar };
})(typeof self !== "undefined" ? self : this);

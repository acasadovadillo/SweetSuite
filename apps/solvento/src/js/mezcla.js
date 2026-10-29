/*
 * Solvento — Mezclar dos copias del documento sin perder cambios.
 *
 * Antes se subía el documento entero y, si en GitHub había cambiado mientras
 * tanto (otro dispositivo, otro representante de ABIES), se pisaba: ganaba el
 * último y lo del otro se perdía sin avisar. Ahora se mezcla registro a
 * registro, como Ironrack:
 *
 *   · Cada movimiento, operación, inmueble, deuda y cobro lleva «mod», la hora
 *     de su último cambio. No lo ponen los formularios: al guardar, sellar()
 *     compara con lo último guardado y se lo pone a lo que cambió.
 *   · Lo borrado deja una marca en «borrados» (id → hora), para que la otra
 *     copia no lo resucite. Vuelve solo si alguien lo cambia DESPUÉS de borrarlo.
 *   · De cada registro gana el «mod» más reciente. Con el mismo «mod» (dos
 *     copias de antes de esto, que no tienen), gana siempre el mismo, para que
 *     dos dispositivos acaben igual.
 *   · Los ajustes (config) van enteros, con su hora (configMod); lo demás del
 *     documento, con otrosMod. El registro de cambios de una empresa se une.
 *
 * Funciones puras, sin pantalla ni red: las prueba tools/pruebas/humo.js.
 */
(function () {
  "use strict";
  const COLECCIONES = ["movimientos", "inversiones", "propiedades", "pasivos", "cobros"];
  // Lo que no es de nadie en particular: se lleva aparte
  const PROPIAS = COLECCIONES.concat(["config", "registro", "borrados", "mod", "configMod", "otrosMod"]);
  const REGISTRO_MAX = 1000;

  const sinMod = (x) => {
    if (!x || typeof x !== "object") return JSON.stringify(x);
    const c = Object.assign({}, x);
    delete c.mod;
    return JSON.stringify(c);
  };
  // El identificador de un registro; uno sin id se identifica por lo que dice
  const clave = (x) => (x && x.id ? String(x.id) : "json:" + sinMod(x));
  const lista = (v) => (Array.isArray(v) ? v : []);
  const otras = (doc) => Object.keys(doc || {}).filter((k) => PROPIAS.indexOf(k) < 0);

  // De dos versiones del mismo registro, cuál se queda (siempre la misma)
  function gana(x, y) {
    const mx = x.mod || 0, my = y.mod || 0;
    if (mx !== my) return mx > my ? x : y;
    return JSON.stringify(x) >= JSON.stringify(y) ? x : y;
  }

  /*
   * Al guardar: pone «mod» a lo que cambió respecto a «antes» (lo último
   * guardado) y apunta en «borrados» lo que ya no está. Cambia «ahora» y
   * devuelve cuántos registros cambiaron.
   */
  function sellar(antes, ahora, hora) {
    antes = antes || {};
    const t = hora || Date.now();
    let n = 0;
    ahora.borrados = Object.assign({}, antes.borrados || {}, ahora.borrados || {});
    COLECCIONES.forEach((k) => {
      const previos = {};
      lista(antes[k]).forEach((x) => { previos[clave(x)] = sinMod(x); });
      const vistos = {};
      lista(ahora[k]).forEach((x) => {
        if (!x || typeof x !== "object") return;
        const c = clave(x);
        vistos[c] = true;
        if (previos[c] !== sinMod(x)) { x.mod = t; n++; }
      });
      Object.keys(previos).forEach((c) => { if (!vistos[c]) { ahora.borrados[c] = t; n++; } });
    });
    if (JSON.stringify(antes.config || {}) !== JSON.stringify(ahora.config || {})) { ahora.configMod = t; n++; }
    const cambianOtras = otras(Object.assign({}, antes, ahora)).some((k) => JSON.stringify(antes[k]) !== JSON.stringify(ahora[k]));
    if (cambianOtras) { ahora.otrosMod = t; n++; }
    if (n) ahora.mod = t;
    return n;
  }

  /*
   * Mezcla dos copias del documento. «a» es la de aquí: su orden se respeta y
   * lo nuevo de «b» va detrás. Devuelve un documento nuevo; no toca ninguno.
   */
  function fusionar(a, b) {
    if (!a) return b;
    if (!b) return a;
    const borrados = Object.assign({}, a.borrados || {});
    Object.keys(b.borrados || {}).forEach((c) => { borrados[c] = Math.max(borrados[c] || 0, b.borrados[c]); });
    const out = {};
    // Lo demás del documento: el de quien lo tocó por última vez
    const deB = (b.otrosMod || 0) > (a.otrosMod || 0);
    otras(Object.assign({}, a, b)).forEach((k) => {
      const v = deB ? (k in b ? b[k] : a[k]) : (k in a ? a[k] : b[k]);
      if (v !== undefined) out[k] = v;
    });
    COLECCIONES.forEach((k) => {
      if (!(k in a) && !(k in b)) return;
      const porClave = new Map();
      const orden = [];
      lista(a[k]).concat(lista(b[k])).forEach((x) => {
        if (!x || typeof x !== "object") return;
        const c = clave(x);
        const y = porClave.get(c);
        if (!y) orden.push(c);
        porClave.set(c, y ? gana(x, y) : x);
      });
      out[k] = orden.map((c) => porClave.get(c)).filter((x) => !(borrados[clave(x)] >= (x.mod || 0)));
    });
    // Los ajustes, enteros: los más recientes
    const ca = a.config, cb = b.config;
    if (ca || cb) {
      const ma = a.configMod || 0, mb = b.configMod || 0;
      out.config = !cb ? ca : !ca ? cb : mb > ma ? cb : ma > mb ? ca
        : (JSON.stringify(ca) >= JSON.stringify(cb) ? ca : cb);
      out.configMod = Math.max(ma, mb) || undefined;
    }
    // El registro de cambios de una empresa: se unen los dos, sin repetir
    if (a.registro || b.registro) {
      const vistos = {};
      out.registro = lista(a.registro).concat(lista(b.registro))
        .filter((r) => { const c = JSON.stringify(r); if (vistos[c]) return false; vistos[c] = true; return true; })
        .sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)))
        .slice(-REGISTRO_MAX);
    }
    out.borrados = borrados;
    const mod = Math.max(a.mod || 0, b.mod || 0);
    if (mod) out.mod = mod;
    const om = Math.max(a.otrosMod || 0, b.otrosMod || 0);
    if (om) out.otrosMod = om;
    if (out.configMod === undefined) delete out.configMod;
    return out;
  }

  // Cuántos registros (y ajustes) dicen algo distinto entre dos copias, sin
  // mirar el orden ni las horas
  function diferencias(a, b) {
    a = a || {}; b = b || {};
    let n = 0;
    COLECCIONES.forEach((k) => {
      const ia = {}, ib = {};
      lista(a[k]).forEach((x) => { ia[clave(x)] = sinMod(x); });
      lista(b[k]).forEach((x) => { ib[clave(x)] = sinMod(x); });
      Object.keys(Object.assign({}, ia, ib)).forEach((c) => { if (ia[c] !== ib[c]) n++; });
    });
    if (JSON.stringify(a.config || {}) !== JSON.stringify(b.config || {})) n++;
    return n;
  }

  // ¿Dicen lo mismo?
  function iguales(a, b) {
    return diferencias(a, b) === 0;
  }

  window.SolventoMezcla = { COLECCIONES, sellar, fusionar, diferencias, iguales, clave };
})();

/*
 * Ironrack — Cuentas sobre el historial: lo que hiciste la última vez, récords
 * por ejercicio y récords nuevos de una sesión. Solo cuentan las sesiones
 * terminadas, y dentro de ellas las series que no son de calentamiento.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const U = IR.u;
  const doc = () => IR.almacen.S.doc;

  // [{ ses, series }] del ejercicio, de la más antigua a la más reciente
  function historialDe(ejId, { antesDe = Infinity } = {}) {
    const out = [];
    for (let i = doc().sesiones.length - 1; i >= 0; i--) {
      const ses = doc().sesiones[i];
      if (ses.inicio >= antesDe) continue;
      const series = [];
      ses.ejercicios.forEach((e) => { if (e.ej === ejId) series.push(...e.series); });
      if (series.length) out.push({ ses, series });
    }
    return out;
  }

  // Las series de la última vez que se hizo el ejercicio
  function previo(ejId) {
    const h = historialDe(ejId);
    return h.length ? h[h.length - 1].series : [];
  }

  function recordsDe(entradas) {
    const r = { pesoMax: null, e1rm: null, volSesion: null, repsMax: null, sesiones: entradas.length };
    entradas.forEach(({ ses, series }) => {
      const vol = U.volSeries(series);
      if (vol > 0 && (!r.volSesion || vol > r.volSesion.v)) r.volSesion = { v: vol, t: ses.inicio };
      U.efectivas(series).forEach((s) => {
        const kg = s.kg || 0, reps = s.reps || 0;
        if (!reps) return;
        if (!r.pesoMax || kg > r.pesoMax.kg || (kg === r.pesoMax.kg && reps > r.pesoMax.reps)) r.pesoMax = { kg, reps, t: ses.inicio };
        const e = U.e1rm(kg, reps);
        if (e > 0 && (!r.e1rm || e > r.e1rm.v)) r.e1rm = { v: e, kg, reps, t: ses.inicio };
        if (!r.repsMax || reps > r.repsMax.reps || (reps === r.repsMax.reps && kg > r.repsMax.kg)) r.repsMax = { reps, kg, t: ses.inicio };
      });
    });
    return r;
  }
  const records = (ejId, opc) => recordsDe(historialDe(ejId, opc));

  // Récords que bate una sesión respecto a todo lo anterior a ella. La primera
  // vez que haces un ejercicio no es un récord: no hay con qué compararla.
  function prsDeSesion(ses) {
    const out = [];
    const vistos = new Set();
    ses.ejercicios.forEach((e) => {
      if (vistos.has(e.ej)) return;
      vistos.add(e.ej);
      const series = [];
      ses.ejercicios.forEach((x) => { if (x.ej === e.ej) series.push(...x.series); });
      const antes = records(e.ej, { antesDe: ses.inicio });
      if (!antes.sesiones) return;
      const ahora = recordsDe([{ ses, series }]);
      const nombre = IR.bib.nombre(e.ej);
      if (ahora.pesoMax && antes.pesoMax && ahora.pesoMax.kg > antes.pesoMax.kg)
        out.push({ ej: e.ej, nombre, tipo: "Peso máximo", valor: U.kg(ahora.pesoMax.kg) + " kg × " + ahora.pesoMax.reps });
      else if (ahora.e1rm && antes.e1rm && ahora.e1rm.v > antes.e1rm.v + 0.01)
        out.push({ ej: e.ej, nombre, tipo: "1RM estimado", valor: U.kg(Math.round(ahora.e1rm.v * 10) / 10) + " kg" });
      if (ahora.volSesion && antes.volSesion && ahora.volSesion.v > antes.volSesion.v)
        out.push({ ej: e.ej, nombre, tipo: "Volumen", valor: U.volumen(ahora.volSesion.v) });
    });
    return out;
  }

  // Ejercicios con historial: [{ id, ultima, sesiones }], el más reciente primero
  function usados() {
    const m = new Map();
    doc().sesiones.forEach((ses) => ses.ejercicios.forEach((e) => {
      const x = m.get(e.ej) || { id: e.ej, ultima: 0, sesiones: 0, _ses: new Set() };
      if (!x._ses.has(ses.id)) { x._ses.add(ses.id); x.sesiones++; }
      x.ultima = Math.max(x.ultima, ses.inicio);
      m.set(e.ej, x);
    }));
    return [...m.values()].map(({ _ses, ...x }) => x).sort((a, b) => b.ultima - a.ultima);
  }

  // Entrenos por semana, las últimas n (la actual, la última)
  function porSemana(n) {
    const hoy = U.lunes(Date.now());
    const sem = 7 * 86400000;
    const datos = [];
    for (let i = n - 1; i >= 0; i--) {
      // +2 h para no descuadrar con el cambio de hora
      const desde = U.lunes(hoy - i * sem + 7200000);
      const valor = doc().sesiones.filter((s) => U.lunes(s.inicio) === desde).length;
      datos.push({ desde, valor });
    }
    return datos;
  }

  // Semanas seguidas con al menos un entreno, contando la actual si ya lo tiene
  function racha() {
    const semanas = new Set(doc().sesiones.map((s) => U.lunes(s.inicio)));
    let t = U.lunes(Date.now()), n = 0;
    if (!semanas.has(t)) t = U.lunes(t - 86400000);
    while (semanas.has(t)) { n++; t = U.lunes(t - 86400000); }
    return n;
  }

  IR.analisis = { historialDe, previo, records, recordsDe, prsDeSesion, usados, porSemana, racha };
})();

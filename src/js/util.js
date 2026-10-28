/*
 * Ironrack — Utilidades comunes: formato de números y fechas, identificadores,
 * escape de HTML y las cuentas del gimnasio (1RM estimado, volumen).
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // En el móvil el teclado decimal puede escribir coma o punto: valen los dos.
  const num = (v) => {
    if (v == null || v === "") return null;
    const n = parseFloat(String(v).replace(",", "."));
    return isFinite(n) ? n : null;
  };

  const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
  const nf1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
  const kg = (n) => (n == null ? "–" : nf.format(n));
  // El volumen de una sesión pasa enseguida de mil kilos: en toneladas se lee mejor.
  const volumen = (n) => (n >= 1000 ? nf1.format(n / 1000) + " t" : nf.format(Math.round(n)) + " kg");

  const fFecha = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" });
  const fFechaLarga = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fHora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });
  const fMes = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });
  const fCorta = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
  const fecha = (t) => fFecha.format(t);
  const fechaLarga = (t) => fFechaLarga.format(t);
  const hora = (t) => fHora.format(t);
  const mes = (t) => { const s = fMes.format(t); return s.charAt(0).toUpperCase() + s.slice(1); };
  const corta = (t) => fCorta.format(t);

  const dos = (n) => String(n).padStart(2, "0");
  // 1:05:12 o 05:12, para los relojes que corren
  function reloj(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? h + ":" + dos(m) + ":" + dos(x) : dos(m) + ":" + dos(x);
  }
  // 1 h 05 min o 45 min, para lo que ya terminó
  function duracion(ms) {
    const min = Math.max(1, Math.round(ms / 60000));
    return min >= 60 ? Math.floor(min / 60) + " h " + dos(min % 60) + " min" : min + " min";
  }

  // 1RM estimado con la fórmula de Epley. Pasadas las 12 repeticiones deja de
  // ser fiable, pero sigue sirviendo para comparar una serie con otra.
  const e1rm = (kgs, reps) => (!reps || reps <= 0 ? 0 : reps === 1 ? kgs : kgs * (1 + reps / 30));

  // Las series de calentamiento no cuentan para récords ni volumen.
  const efectivas = (series) => (series || []).filter((s) => s.tipo !== "cal");
  const volSeries = (series) => efectivas(series).reduce((t, s) => t + (s.kg || 0) * (s.reps || 0), 0);
  const volSesion = (ses) => (ses.ejercicios || []).reduce((t, e) => t + volSeries(e.series), 0);
  const nSeries = (ses) => (ses.ejercicios || []).reduce((t, e) => t + efectivas(e.series).length, 0);

  // Lunes 00:00 de la semana de t
  function lunes(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }

  IR.u = {
    esc, uid, num, kg, volumen, fecha, fechaLarga, hora, mes, corta, reloj, duracion,
    e1rm, efectivas, volSeries, volSesion, nSeries, lunes,
  };
})();

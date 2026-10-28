/*
 * Ironrack — Progreso: un resumen general (entrenos por semana y ejercicios
 * con historial) y, para cada ejercicio, sus récords y su evolución.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const U = IR.u, A = IR.almacen, esc = U.esc;
  const S = A.S;
  const An = IR.analisis;

  // Qué se dibuja en la gráfica de un ejercicio (se recuerda entre visitas)
  const METRICAS = {
    e1rm: { nombre: "1RM estimado", unidad: "kg", valor: (series) => Math.max(0, ...U.efectivas(series).map((s) => U.e1rm(s.kg, s.reps))) },
    peso: { nombre: "Peso máximo", unidad: "kg", valor: (series) => Math.max(0, ...U.efectivas(series).map((s) => s.kg || 0)) },
    volumen: { nombre: "Volumen", unidad: "kg", valor: (series) => U.volSeries(series) },
    reps: { nombre: "Reps máximas", unidad: "reps", valor: (series) => Math.max(0, ...U.efectivas(series).map((s) => s.reps || 0)) },
  };
  let metrica = "e1rm";

  function resumen() {
    const sem = An.porSemana(12);
    const usados = An.usados();
    return `<section class="cabeza"><h1>Progreso</h1></section>
      <article class="tarjeta">
        <div class="tarjeta-cab"><h3>Entrenos por semana</h3><small class="suave">12 semanas</small></div>
        ${IR.ui.barras(sem.map((d, i) => ({ valor: d.valor, etiqueta: i % 3 === 2 || i === sem.length - 1 ? U.corta(d.desde) : "" })))}
      </article>
      <h2>Tus ejercicios</h2>
      ${usados.length ? usados.map((x) => {
        const r = An.records(x.id);
        return `<a class="fila-ej" href="#progreso/${esc(x.id)}">
          <span><b>${esc(IR.bib.nombre(x.id))}</b><small>${x.sesiones} ${x.sesiones === 1 ? "sesión" : "sesiones"} · última ${esc(U.fecha(x.ultima))}</small></span>
          <span class="dato">${r.e1rm ? U.kg(Math.round(r.e1rm.v)) + " kg" : ""}<small>${r.e1rm ? "1RM est." : ""}</small></span></a>`;
      }).join("") : '<p class="vacio">Cuando termines entrenos verás aquí la evolución de cada ejercicio.</p>'}`;
  }

  function ejercicio(id) {
    const info = IR.bib.ejercicio(id);
    const h = An.historialDe(id);
    const r = An.recordsDe(h);
    const m = METRICAS[metrica];
    const puntos = h.map(({ ses, series }) => ({ x: ses.inicio, y: Math.round(m.valor(series) * 10) / 10 })).filter((p) => p.y > 0);
    const rec = (titulo, valor, t) => `<div class="stat"><b>${valor}</b><span>${titulo}</span>${t ? `<small>${esc(U.corta(t))}</small>` : ""}</div>`;
    return `<a class="volver" href="#progreso">‹ Progreso</a>
      <section class="cabeza"><h1>${esc(info.nombre)}</h1>
        <p class="suave">${esc(info.grupo)} · ${esc(info.equipo)}${info.propio ? ' · <button class="enlace" data-a="editarEjPropio" data-id="' + esc(id) + '">Editar</button>' : ""}</p></section>
      ${h.length ? `
      <div class="stats rejilla2">
        ${rec("Peso máximo", r.pesoMax ? U.kg(r.pesoMax.kg) + " kg × " + r.pesoMax.reps : "–", r.pesoMax && r.pesoMax.t)}
        ${rec("1RM estimado", r.e1rm ? U.kg(Math.round(r.e1rm.v * 10) / 10) + " kg" : "–", r.e1rm && r.e1rm.t)}
        ${rec("Mejor volumen", r.volSesion ? U.volumen(r.volSesion.v) : "–", r.volSesion && r.volSesion.t)}
        ${rec("Más repeticiones", r.repsMax ? r.repsMax.reps + " × " + U.kg(r.repsMax.kg) + " kg" : "–", r.repsMax && r.repsMax.t)}
      </div>
      <article class="tarjeta">
        <div class="chips">${Object.keys(METRICAS).map((k) =>
          `<button class="chip ${k === metrica ? "activo" : ""}" data-a="metrica" data-m="${k}">${METRICAS[k].nombre}</button>`).join("")}</div>
        ${IR.ui.grafica(puntos, { unidad: m.unidad })}
      </article>
      <h2>Sesiones</h2>
      ${h.slice().reverse().map(({ ses, series }) => `<a class="tarjeta enlace-tarjeta compacta" href="#historial/${esc(ses.id)}">
        <div class="tarjeta-cab"><b>${esc(U.fecha(ses.inicio))}</b><small class="suave">${esc(ses.nombre)}</small></div>
        <p class="series-linea">${series.map((s) => `<span class="${s.tipo === "cal" ? "cal" : ""}">${U.kg(s.kg)}×${s.reps}</span>`).join("")}</p>
      </a>`).join("")}`
      : '<p class="vacio">Todavía no has hecho este ejercicio. Cuando lo apuntes en un entreno verás aquí tus récords y su gráfica.</p>'}`;
  }

  IR.vistas.progreso = { html: (id) => (id ? ejercicio(id) : resumen()) };

  Object.assign(IR.acc, {
    metrica(el) { metrica = el.dataset.m; IR.app.render(true); },
    async editarEjPropio(el) {
      const id = el.dataset.id;
      const ej = S.doc.ejercicios.find((x) => x.id === id);
      if (!ej) return;
      const r = await IR.ui.formEjercicio(ej);
      if (!r) return;
      if (r.borrar) {
        const usos = An.historialDe(id).length;
        const ok = await IR.ui.confirmar("¿Borrar «" + ej.nombre + "»?", {
          detalle: usos ? "Aparece en " + usos + " entrenos: seguirán ahí, pero como «Ejercicio borrado»." : "No lo has usado en ningún entreno.",
          si: "Borrar", peligro: true });
        if (!ok) return;
        A.borrar("ejercicios", id, { render: false });
        location.hash = "#ejercicios";
        return;
      }
      A.cambiarItem("ejercicios", id, (x) => Object.assign(x, r));
    },
  });
})();
